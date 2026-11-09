import assert from 'assert';
import gdef from '../src/tables/gdef.mjs';
import gpos from '../src/tables/gpos.mjs';
import { optimizeItemVariationStore, remapVariationIndexes } from '../src/item-variation-store.mjs';

const region = (peak) => ({ regionAxes: [{ startCoord: 0, peakCoord: peak, endCoord: peak }] });
const fvar = { axes: [{ tag: 'wght' }] };
const view = (bytes) => new DataView(new Uint8Array(bytes).buffer);
const roundtrip = (store) => {
    const bytes = gdef.make({ version: 1.3, classDef: null, itemVariationStore: store }, fvar).encode();
    return gdef.parse(view(bytes)).itemVariationStore;
};
const rowsOf = (store) => store.itemVariationSubtables.flatMap((subtable, outer) => subtable.deltaSets.map((deltas, inner) => {
    const row = Array(store.variationRegions.length).fill(0);
    subtable.regionIndexes.forEach((regionIndex, column) => { row[regionIndex] += deltas[column]; });
    return { outer, inner, row };
}));

describe('item-variation-store.mjs', function() {
    it('stores identical rows once and maps every old index to an equal row', function() {
        const store = {
            format: 1,
            variationRegions: [region(1), region(0.5), region(-1)],
            itemVariationSubtables: [
                { regionIndexes: [0, 1, 2], deltaSets: [[10, 0, 0], [10, 0, 0], [300, -5, 0], [0, 0, 0]] },
                { regionIndexes: [2, 0], deltaSets: [[0, 10], [70000, 1]] },
            ],
        };
        const before = rowsOf(store);
        const { store: optimized, map } = optimizeItemVariationStore(store);
        const after = rowsOf(optimized);
        assert.equal(after.length, 4, 'four distinct rows: (10), (300,-5), zero, (1 + LONG)');
        for (const { outer, inner, row } of before) {
            const next = map(outer, inner);
            assert.deepEqual(after.find(entry => entry.outer === next.outer && entry.inner === next.inner).row, row);
        }
        assert.deepEqual(map(0, 0), map(0, 1));
        assert.deepEqual(map(0, 0), map(1, 0), 'equal rows in different subtables merge');
        assert.throws(() => map(0, 9), /not in the item variation store/);
    });

    it('encodes each column at the width it needs, wide columns first, and parses back', function() {
        const store = {
            format: 1,
            variationRegions: [region(1), region(0.5), region(-1)],
            itemVariationSubtables: [
                { regionIndexes: [0, 1, 2], deltaSets: [[3, 0, -400], [-2, 0, 500]] },
                { regionIndexes: [0, 2], deltaSets: [[70000, 1], [-1, -70000]] },
            ],
        };
        const parsed = roundtrip(store);
        assert.deepEqual(parsed.itemVariationSubtables[0].regionIndexes, [2, 0], 'zero column dropped, word column first');
        assert.deepEqual(rowsOf(parsed).map(entry => entry.row), rowsOf(store).map(entry => entry.row));
        const small = { format: 1, variationRegions: [region(1)], itemVariationSubtables: [{ regionIndexes: [0], deltaSets: [[5], [-7]] }] };
        const bytes = gdef.make({ version: 1.3, classDef: null, itemVariationStore: small }, fvar).encode();
        const wide = gdef.make({ version: 1.3, classDef: null, itemVariationStore: { ...small, itemVariationSubtables: [{ regionIndexes: [0], deltaSets: [[500], [-7]] }] } }, fvar).encode();
        assert.equal(wide.length - bytes.length, 2, 'byte deltas for small values, words for large');
    });

    it('remaps variation index devices in a copy and leaves the input alone', function() {
        const device = { type: 'variationIndex', deltaSetOuterIndex: 1, deltaSetInnerIndex: 0, deltaFormat: 0x8000 };
        const table = { lookups: [{ subtables: [{ value: { xAdvance: 3, xAdvDevice: device } }, { untouched: [1, 2] }] }] };
        const copy = remapVariationIndexes(table, () => ({ outer: 0, inner: 7 }));
        assert.equal(copy.lookups[0].subtables[0].value.xAdvDevice.deltaSetInnerIndex, 7);
        assert.equal(device.deltaSetInnerIndex, 0, 'input unchanged');
        assert.equal(copy.lookups[0].subtables[1], table.lookups[0].subtables[1], 'branches without devices are shared');
        const none = { type: 'variationIndex', deltaSetOuterIndex: 0xFFFF, deltaSetInnerIndex: 0xFFFF };
        assert.equal(remapVariationIndexes(none, () => { throw new Error('no-variation index must stay'); }), none);
    });

    it('shares identical PairSet tables and reads back the same pairs', function() {
        const device = { type: 'variationIndex', deltaSetOuterIndex: 0, deltaSetInnerIndex: 4, deltaFormat: 0x8000 };
        const pairSet = () => [{ secondGlyph: 5, value1: { xAdvance: -20, xAdvDevice: { ...device } } }, { secondGlyph: 9, value1: { xAdvance: -30, xAdvDevice: { ...device } } }];
        const table = (count) => ({
            version: 1, scripts: [], features: [],
            lookups: [{ lookupType: 2, lookupFlag: 0, subtables: [{
                posFormat: 1, coverage: { format: 1, glyphs: Array.from({ length: count }, (_, i) => i + 1) },
                valueFormat1: 0x44, valueFormat2: 0, pairSets: Array.from({ length: count }, pairSet),
            }] }],
        });
        const one = gpos.make(table(1)).encode().length;
        const many = gpos.make(table(20)).encode();
        // 19 more first glyphs cost a coverage entry and a PairSet offset each.
        assert.equal(many.length - one, 19 * 4);
        const parsed = gpos.parse(view(many)).lookups[0].subtables[0];
        assert.equal(parsed.pairSets.length, 20);
        for (const set of parsed.pairSets) {
            assert.deepEqual(set.map(pair => [pair.secondGlyph, pair.value1.xAdvance, pair.value1.xAdvDevice.deltaSetInnerIndex]), [[5, -20, 4], [9, -30, 4]]);
        }
    });
});
