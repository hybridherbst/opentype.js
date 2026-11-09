// Item variation store optimization (the compaction fontTools applies when it builds
// a variable font): identical delta rows are stored once, rows are grouped into
// ItemVariationData subtables by the regions they use and the width each region's
// deltas need, and every variation index that pointed into the old store is remapped.
// https://learn.microsoft.com/en-us/typography/opentype/spec/otvarcommonformats#item-variation-store

/**
 * @typedef {{format?: number, variationRegions: Array<unknown>, itemVariationSubtables: Array<{regionIndexes: number[], deltaSets: number[][]}>}} ItemVariationStoreData
 * @typedef {(outer: number, inner: number) => {outer: number, inner: number}} VariationIndexMap
 */

const MAX_ITEMS = 0xFFFF;

/** Bytes one delta needs: 0 (zero), 1 (int8), 2 (int16) or 4 (int32). */
function deltaWidth(value) {
    if (value === 0) return 0;
    if (value >= -128 && value <= 127) return 1;
    if (value >= -32768 && value <= 32767) return 2;
    return 4;
}

/**
 * Size of one ItemVariationData subtable using these column widths for `rows` rows.
 * Word columns are 2 bytes (4 with LONG_WORDS, where the narrower ones become words).
 * @param {Uint8Array} widths
 * @param {number} rows
 */
function encodingCost(widths, rows) {
    let columns = 0, words = 0, longs = 0;
    for (const width of widths) {
        if (!width) continue;
        columns++;
        if (width >= 2) words++;
        if (width === 4) longs++;
    }
    const rowBytes = longs ? words * 4 + (columns - words) * 2 : words * 2 + (columns - words);
    // Subtable header and region indexes, plus its offset in the store.
    return 6 + 2 * columns + 4 + rows * rowBytes;
}

/**
 * Merge two width vectors (the widest of each column).
 * @param {Uint8Array} a
 * @param {Uint8Array} b
 */
function mergeWidths(a, b) {
    const merged = new Uint8Array(a.length);
    for (let i = 0; i < a.length; i++) merged[i] = a[i] > b[i] ? a[i] : b[i];
    return merged;
}

/** Min-heap of candidate merges by (negative gain, stable ids). */
class MergeHeap {
    constructor() { /** @type {Array<[number, number, number]>} */ this.items = []; }
    /** @param {[number, number, number]} item */
    push(item) {
        const items = this.items;
        items.push(item);
        let i = items.length - 1;
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (!MergeHeap.less(items[i], items[parent])) break;
            [items[i], items[parent]] = [items[parent], items[i]];
            i = parent;
        }
    }
    pop() {
        const items = this.items;
        const top = items[0];
        const last = items.pop();
        if (items.length && last) {
            items[0] = last;
            let i = 0;
            for (;;) {
                const left = 2 * i + 1, right = left + 1;
                let smallest = i;
                if (left < items.length && MergeHeap.less(items[left], items[smallest])) smallest = left;
                if (right < items.length && MergeHeap.less(items[right], items[smallest])) smallest = right;
                if (smallest === i) break;
                [items[i], items[smallest]] = [items[smallest], items[i]];
                i = smallest;
            }
        }
        return top;
    }
    get size() { return this.items.length; }
    /** @param {[number, number, number]} a @param {[number, number, number]} b */
    static less(a, b) { return a[0] !== b[0] ? a[0] < b[0] : a[1] !== b[1] ? a[1] < b[1] : a[2] < b[2]; }
}

/**
 * Optimize an item variation store. The result holds the same delta rows (each once),
 * in subtables chosen to minimize the encoded size; `map` translates every old
 * (outer, inner) index to its new one. Region list and region order are kept.
 *
 * @param {ItemVariationStoreData} store
 * @returns {{store: ItemVariationStoreData, map: VariationIndexMap}}
 */
export function optimizeItemVariationStore(store) {
    const regionCount = store.variationRegions.length;
    /** @type {Map<string, number>} */
    const rowIdByKey = new Map();
    /** @type {Int32Array[]} */
    const rows = [];
    /** @type {number[][]} old (outer → inner → row id) */
    const rowIdOf = [];
    for (let outer = 0; outer < store.itemVariationSubtables.length; outer++) {
        const subtable = store.itemVariationSubtables[outer];
        const ids = [];
        for (const deltaSet of subtable.deltaSets) {
            const row = new Int32Array(regionCount);
            for (let column = 0; column < subtable.regionIndexes.length; column++) {
                const region = subtable.regionIndexes[column];
                const value = Math.round(deltaSet[column] || 0);
                if (region < 0 || region >= regionCount) {
                    if (value) throw new Error(`Item variation store references region ${region} of ${regionCount}.`);
                    continue;
                }
                row[region] += value;
            }
            const key = row.join(',');
            let id = rowIdByKey.get(key);
            if (id === undefined) {
                id = rows.length;
                rowIdByKey.set(key, id);
                rows.push(row);
            }
            ids.push(id);
        }
        rowIdOf[outer] = ids;
    }

    // One encoding per distinct width vector, then greedily merge the pair that saves
    // the most bytes until no merge saves any.
    /** @type {Map<string, {widths: Uint8Array, rows: number[]}>} */
    const byWidths = new Map();
    for (let id = 0; id < rows.length; id++) {
        const row = rows[id];
        const widths = new Uint8Array(regionCount);
        for (let r = 0; r < regionCount; r++) widths[r] = deltaWidth(row[r]);
        const key = widths.join('');
        let encoding = byWidths.get(key);
        if (!encoding) byWidths.set(key, encoding = {widths, rows: []});
        encoding.rows.push(id);
    }
    /** @type {Array<{widths: Uint8Array, rows: number[], alive: boolean}>} */
    const encodings = [...byWidths.entries()]
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([, encoding]) => ({...encoding, alive: true}));
    const cost = (/** @type {{widths: Uint8Array, rows: number[]}} */ encoding) => encodingCost(encoding.widths, encoding.rows.length);
    const heap = new MergeHeap();
    const pushPair = (/** @type {number} */ a, /** @type {number} */ b) => {
        const left = encodings[a], right = encodings[b];
        if (left.rows.length + right.rows.length > MAX_ITEMS) return;
        const merged = encodingCost(mergeWidths(left.widths, right.widths), left.rows.length + right.rows.length);
        const gain = cost(left) + cost(right) - merged;
        if (gain > 0) heap.push([-gain, Math.min(a, b), Math.max(a, b)]);
    };
    for (let a = 0; a < encodings.length; a++) for (let b = a + 1; b < encodings.length; b++) pushPair(a, b);
    while (heap.size) {
        const [, a, b] = heap.pop();
        if (!encodings[a].alive || !encodings[b].alive) continue;
        const merged = {
            widths: mergeWidths(encodings[a].widths, encodings[b].widths),
            rows: [...encodings[a].rows, ...encodings[b].rows],
            alive: true,
        };
        encodings[a].alive = false;
        encodings[b].alive = false;
        const id = encodings.length;
        encodings.push(merged);
        for (let other = 0; other < id; other++) if (encodings[other].alive) pushPair(other, id);
    }

    // Write the surviving encodings; rows sorted for a deterministic layout.
    /** @type {ItemVariationStoreData['itemVariationSubtables']} */
    const subtables = [];
    /** @type {Int32Array} row id → packed (outer << 16 | inner) */
    const location = new Int32Array(rows.length);
    const compareRows = (/** @type {number} */ a, /** @type {number} */ b) => {
        const left = rows[a], right = rows[b];
        for (let r = 0; r < regionCount; r++) if (left[r] !== right[r]) return left[r] - right[r];
        return 0;
    };
    for (const encoding of encodings) {
        if (!encoding.alive) continue;
        const regionIndexes = [];
        for (let r = 0; r < regionCount; r++) if (encoding.widths[r]) regionIndexes.push(r);
        const ordered = [...encoding.rows].sort(compareRows);
        for (let start = 0; start < ordered.length; start += MAX_ITEMS) {
            const outer = subtables.length;
            if (outer > 0xFFFF) throw new Error('Item variation store needs more than 65536 subtables.');
            const chunk = ordered.slice(start, start + MAX_ITEMS);
            for (let inner = 0; inner < chunk.length; inner++) location[chunk[inner]] = outer * 0x10000 + inner;
            subtables.push({regionIndexes, deltaSets: chunk.map(id => regionIndexes.map(region => rows[id][region]))});
        }
    }
    return {
        store: {format: store.format || 1, variationRegions: store.variationRegions, itemVariationSubtables: subtables},
        map(outer, inner) {
            const id = rowIdOf[outer]?.[inner];
            if (id === undefined) throw new Error(`Variation index ${outer}/${inner} is not in the item variation store.`);
            const packed = location[id];
            return {outer: Math.floor(packed / 0x10000), inner: packed % 0x10000};
        },
    };
}

/**
 * Copy a table object, translating every variation index device
 * ({type: 'variationIndex', deltaSetOuterIndex, deltaSetInnerIndex}) with `map`.
 * Objects without one are shared with the input, not copied.
 *
 * @template T
 * @param {T} value
 * @param {VariationIndexMap} map
 * @returns {T}
 */
export function remapVariationIndexes(value, map) {
    /** @type {Map<object, unknown>} */
    const done = new Map();
    /** @typedef {{[key: string]: unknown, type?: unknown, deltaSetOuterIndex?: unknown, deltaSetInnerIndex?: unknown}} TableNode */
    const visit = (/** @type {unknown} */ value) => {
        if (!value || typeof value !== 'object' || ArrayBuffer.isView(value)) return value;
        const node = /** @type {TableNode} */ (value);
        if (done.has(node)) return done.get(node);
        if (node.type === 'variationIndex' && Number.isInteger(node.deltaSetOuterIndex) && Number.isInteger(node.deltaSetInnerIndex)
            // 0xFFFF/0xFFFF is the "no variation" index.
            && !(node.deltaSetOuterIndex === 0xFFFF && node.deltaSetInnerIndex === 0xFFFF)) {
            const next = map(/** @type {number} */ (node.deltaSetOuterIndex), /** @type {number} */ (node.deltaSetInnerIndex));
            const copy = {...node, deltaSetOuterIndex: next.outer, deltaSetInnerIndex: next.inner};
            done.set(node, copy);
            return copy;
        }
        done.set(node, node);
        let copy = null;
        const entries = Array.isArray(node) ? node.entries() : Object.entries(node);
        for (const [key, child] of entries) {
            const mapped = visit(child);
            if (mapped !== child) {
                if (!copy) copy = Array.isArray(node) ? [...node] : {...node};
                copy[key] = mapped;
            }
        }
        const result = copy || node;
        done.set(node, result);
        return result;
    };
    return /** @type {T} */ (visit(value));
}
