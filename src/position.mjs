// The Position object provides utility methods to manipulate
// the GPOS position table.

import Layout from './layout.mjs';

/**
 * @exports opentype.Position
 * @class
 * @param {Record<string, unknown>} font
 * @constructor
 */
function Position(font) {
    Layout.call(this, font, 'gpos');
}

Position.prototype = Layout.prototype;

/**
 * Init some data for faster and easier access later.
 * @this {object}
 */
Position.prototype.init = function() {
    const script = this.getDefaultScriptName();
    this.defaultKerningTables = this.getKerningTables(script);
};

/**
 * Apply variation deltas to a value record property.
 * @this {object}
 * @param {Record<string, unknown>} deviceOrVariationIndex - Device or VariationIndex table data
 * @param {Record<string, unknown>} [coords] - Variation coordinates (optional, uses current variation if not provided)
 * @returns {number} - The delta value to add
 */
Position.prototype.getVariationDelta = function(deviceOrVariationIndex, coords) {
    if (!deviceOrVariationIndex) {
        return 0;
    }

    if (deviceOrVariationIndex.type === 'variationIndex') {
        // Get the ItemVariationStore from GDEF table
        const gdef = this.font.tables.gdef;
        if (!gdef || !gdef.itemVariationStore) {
            return 0;
        }

        // Use the variation processor to compute the delta
        if (!this.font.variation || !this.font.variation.process) {
            return 0;
        }

        return this.font.variation.process.getDelta(
            gdef.itemVariationStore,
            deviceOrVariationIndex.deltaSetOuterIndex,
            deviceOrVariationIndex.deltaSetInnerIndex,
            coords
        );
    } else if (deviceOrVariationIndex.type === 'device') {
        // Device tables are for non-variable fonts, used for pixel-level hinting
        // at specific sizes. We don't apply these deltas in the general case.
        return 0;
    }

    return 0;
};

/**
 * Apply variation deltas to a value record.
 * @this {object}
 * @param {Record<string, unknown>} valueRecord - The value record to adjust
 * @param {Record<string, unknown>} [coords] - Variation coordinates (optional)
 * @returns {Record<string, unknown>} - The adjusted value record
 */
Position.prototype.applyVariationDeltas = function(valueRecord, coords) {
    if (!valueRecord) {
        return valueRecord;
    }

    // Check if this font has GPOS variations
    const gdef = this.font.tables.gdef;
    if (!gdef || !gdef.itemVariationStore) {
        return valueRecord;
    }

    // Create a copy of the value record with adjusted values
    const adjusted = Object.assign({}, valueRecord);

    if (valueRecord.xPlaDevice) {
        adjusted.xPlacement = (/** @type {number} */ (valueRecord.xPlacement) || 0) +
            this.getVariationDelta(/** @type {Record<string, unknown>} */ (valueRecord.xPlaDevice), coords);
    }
    if (valueRecord.yPlaDevice) {
        adjusted.yPlacement = (/** @type {number} */ (valueRecord.yPlacement) || 0) +
            this.getVariationDelta(/** @type {Record<string, unknown>} */ (valueRecord.yPlaDevice), coords);
    }
    if (valueRecord.xAdvDevice) {
        adjusted.xAdvance = (/** @type {number} */ (valueRecord.xAdvance) || 0) +
            this.getVariationDelta(/** @type {Record<string, unknown>} */ (valueRecord.xAdvDevice), coords);
    }
    if (valueRecord.yAdvDevice) {
        adjusted.yAdvance = (/** @type {number} */ (valueRecord.yAdvance) || 0) +
            this.getVariationDelta(/** @type {Record<string, unknown>} */ (valueRecord.yAdvDevice), coords);
    }

    return adjusted;
};

/**
 * Find a glyph pair in a list of lookup tables of type 2 and retrieve the xAdvance kerning value.
 *
 * @this {object}
 * @param {Array} kerningLookups
 * @param {number} leftIndex - left glyph index
 * @param {number} rightIndex - right glyph index
 * @param {Record<string, unknown>} [coords] - Variation coordinates (optional, for variable fonts)
 * @returns {number}
 */
Position.prototype.getKerningValue = function(kerningLookups, leftIndex, rightIndex, coords) {
    for (let i = 0; i < kerningLookups.length; i++) {
        const subtables = kerningLookups[i].subtables;
        for (let j = 0; j < subtables.length; j++) {
            const subtable = subtables[j];
            const covIndex = this.getCoverageIndex(subtable.coverage, leftIndex);
            if (covIndex < 0) continue;
            switch (subtable.posFormat) {
                case 1: {
                    // Search Pair Adjustment Positioning Format 1
                    let pairSet = subtable.pairSets[covIndex];
                    for (let k = 0; k < pairSet.length; k++) {
                        let pair = pairSet[k];
                        if (pair.secondGlyph === rightIndex) {
                            const value1 = this.applyVariationDeltas(pair.value1, coords);
                            return value1 && value1.xAdvance || 0;
                        }
                    }
                    break;      // left glyph found, not right glyph - try next subtable
                }
                case 2: {
                    // Search Pair Adjustment Positioning Format 2
                    const class1 = this.getGlyphClass(subtable.classDef1, leftIndex);
                    const class2 = this.getGlyphClass(subtable.classDef2, rightIndex);
                    const pair = subtable.classRecords[class1][class2];
                    const value1 = this.applyVariationDeltas(pair.value1, coords);
                    return value1 && value1.xAdvance || 0;
                }
            }
        }
    }
    return 0;
};

/**
 * List all kerning lookup tables.
 *
 * @this {object}
 * @param {string} [script='DFLT'] - use font.position.getDefaultScriptName() for a better default value
 * @param {string} [language='dflt']
 * @return {object[] | undefined} The list of kerning lookup tables (may be empty), or undefined if there is no GPOS table (and we should use the kern table)
 */
Position.prototype.getKerningTables = function(script, language) {
    if (this.font.tables.gpos) {
        return this.getLookupTables(script, language, 'kern', 2);
    }
};

/**
 * List the rules of one contextual (type 7) or chained contextual (type 8) positioning
 * lookup, extension lookups unwrapped (see Layout.listContextRules). Position and
 * Substitution share one prototype, hence a name of its own.
 * @this {object}
 * @param {object|number} lookup - a lookup table or its index in the GPOS LookupList
 * @return {Array<{backtrack: number[][], input: number[][], lookahead: number[][], lookupRecords: Array<{sequenceIndex: number, lookupListIndex: number}>}>}
 */
Position.prototype.getContextPositioningRules = function(lookup) {
    return Layout.prototype.listContextRules.call(this, lookup, { context: 7, chaining: 8, extension: 9, formatKey: 'posFormat' });
};

export default Position;

/**
 * OpenType script tags by Unicode script, for the scripts a run is detected in.
 * @type {Array<[string, RegExp]>}
 */
const SCRIPT_TAGS = [
    ['arab', /\p{Script=Arabic}/u], ['hebr', /\p{Script=Hebrew}/u], ['cyrl', /\p{Script=Cyrillic}/u],
    ['grek', /\p{Script=Greek}/u], ['deva', /\p{Script=Devanagari}/u], ['beng', /\p{Script=Bengali}/u],
    ['guru', /\p{Script=Gurmukhi}/u], ['gujr', /\p{Script=Gujarati}/u], ['taml', /\p{Script=Tamil}/u],
    ['telu', /\p{Script=Telugu}/u], ['knda', /\p{Script=Kannada}/u], ['mlym', /\p{Script=Malayalam}/u],
    ['thai', /\p{Script=Thai}/u], ['armn', /\p{Script=Armenian}/u], ['geor', /\p{Script=Georgian}/u],
    ['latn', /\p{Script=Latin}/u],
];

/**
 * The script tag for a text: that of its first character in a known script, when the
 * font's layout has it (otherwise the font's default script).
 * @this {object}
 * @param {string} text
 * @param {(tag: string) => boolean} [accept] - Only consider scripts this accepts.
 */
Position.prototype.getTextScript = function(text, accept = () => true) {
    const scripts = this.getScriptNames();
    for (const ch of text) {
        const entry = SCRIPT_TAGS.find(([tag, test]) => accept(tag) && test.test(ch));
        if (entry && scripts.includes(entry[0])) return entry[0];
    }
    return this.getDefaultScriptName();
};

/** Positioning features applied to horizontal text when none are given (as HarfBuzz does). */
const DEFAULT_POSITIONING_FEATURES = ['abvm', 'blwm', 'curs', 'dist', 'kern', 'mark', 'mkmk'];

/**
 * Apply the font's GPOS lookups to a run of shaped glyphs.
 *
 * Every lookup of the given features, for the script and language, is applied
 * in lookup-list order over the run: single and pair adjustment (types 1, 2),
 * cursive attachment (3), mark-to-base, mark-to-ligature and mark-to-mark
 * attachment (4, 5, 6), contextual and chained contextual positioning (7, 8),
 * and extension lookups (9). Lookup flags are honoured through GDEF (ignored
 * bases, ligatures and marks, mark attachment classes, mark filtering sets).
 * A mark after a ligature attaches to its last component: a glyph run carries
 * no record of the component a mark followed.
 *
 * @this {object}
 * @param {number[]} glyphIndexes - The shaped run (after GSUB), in logical order.
 * @param {{script?: string, language?: string, features?: string[], coords?: Record<string, number>, rtl?: boolean}} [options]
 *   `rtl`: the run is right to left (positions are still returned in logical order).
 * @return {Array<{xAdvance: number, yAdvance: number, xOffset: number, yOffset: number}>} Per glyph, in font units:
 *   the change to its advance, and where its outline is drawn relative to its pen position.
 */
Position.prototype.getPositions = function(glyphIndexes, options = {}) {
    const n = glyphIndexes.length;
    const positions = glyphIndexes.map(() => ({ xAdvance: 0, yAdvance: 0, xOffset: 0, yOffset: 0 }));
    const gpos = this.font.tables.gpos;
    if (!gpos || !n) return positions;
    const script = options.script || this.getDefaultScriptName();
    const language = options.language || 'dflt';
    const coords = options.coords;
    const lookups = gpos.lookups || [];
    const lookupIndexes = new Set();
    for (const feature of options.features || DEFAULT_POSITIONING_FEATURES) {
        const table = this.getFeatureTable(script, language, feature, false);
        if (table) for (const index of table.lookupListIndexes) lookupIndexes.add(index);
    }
    const gdef = this.font.tables.gdef;
    const glyphClass = (glyph) => gdef && gdef.classDef ? Math.max(0, this.getGlyphClass(gdef.classDef, glyph)) : 0;
    const isMark = (glyph) => glyphClass(glyph) === 3;
    const anchorPoint = (anchor) => ({
        x: anchor.xCoordinate + (anchor.xDevice ? this.getVariationDelta(anchor.xDevice, coords) : 0),
        y: anchor.yCoordinate + (anchor.yDevice ? this.getVariationDelta(anchor.yDevice, coords) : 0),
    });
    // Attachments, resolved once all lookups ran: a mark follows its base's position.
    const attachment = new Array(n).fill(null);
    const cursive = new Array(n).fill(null);

    const skipped = (lookup, glyph) => {
        const flag = lookup.lookupFlag || 0;
        const cls = glyphClass(glyph);
        if ((flag & 0x2) && cls === 1) return true;
        if ((flag & 0x4) && cls === 2) return true;
        if (cls === 3) {
            if (flag & 0x8) return true;
            if ((flag & 0x10) && lookup.markFilteringSet !== undefined) {
                const set = gdef && gdef.markGlyphSets && gdef.markGlyphSets[lookup.markFilteringSet];
                if (!set || this.getCoverageIndex(set, glyph) < 0) return true;
            }
            const attachType = flag >> 8;
            if (attachType && gdef && gdef.markAttachClassDef && this.getGlyphClass(gdef.markAttachClassDef, glyph) !== attachType) return true;
        }
        return false;
    };
    const next = (lookup, i) => { for (let j = i + 1; j < n; j++) if (!skipped(lookup, glyphIndexes[j])) return j; return -1; };
    const previous = (lookup, i) => { for (let j = i - 1; j >= 0; j--) if (!skipped(lookup, glyphIndexes[j])) return j; return -1; };
    const addValue = (i, value) => {
        if (!value) return;
        const v = this.applyVariationDeltas(value, coords) || value;
        positions[i].xOffset += v.xPlacement || 0;
        positions[i].yOffset += v.yPlacement || 0;
        positions[i].xAdvance += v.xAdvance || 0;
        positions[i].yAdvance += v.yAdvance || 0;
    };
    const classOf = (classDef, glyph) => classDef ? Math.max(0, this.getGlyphClass(classDef, glyph)) : 0;
    const unwrap = (lookup) => {
        if (lookup.lookupType !== 9) return lookup;
        const inner = lookup.subtables.filter((s) => s.extension);
        return { lookupType: inner.length ? inner[0].lookupType : 0, lookupFlag: lookup.lookupFlag, markFilteringSet: lookup.markFilteringSet, subtables: inner.map((s) => s.extension) };
    };

    /** Match `sequence` (tests per glyph) forward from i over non-skipped glyphs; the matched indexes or null. */
    const matchForward = (lookup, i, tests) => {
        const out = [];
        let j = i;
        for (let k = 0; k < tests.length; k++) {
            if (k > 0) j = next(lookup, j);
            if (j < 0 || !tests[k](glyphIndexes[j])) return null;
            out.push(j);
        }
        return out;
    };
    const matchBackward = (lookup, i, tests) => {
        let j = i;
        for (const test of tests) { j = previous(lookup, j); if (j < 0 || !test(glyphIndexes[j])) return false; }
        return true;
    };
    const applyNested = (matched, records) => {
        for (const record of records || []) {
            const at = matched[record.sequenceIndex];
            if (at !== undefined && lookups[record.lookupListIndex]) applyAt(unwrap(lookups[record.lookupListIndex]), at);
        }
    };

    /** Apply one lookup at position i; whether a subtable applied. */
    const applyAt = (lookup, i) => {
        const glyph = glyphIndexes[i];
        if (skipped(lookup, glyph)) return false;
        for (const st of lookup.subtables) {
            switch (lookup.lookupType) {
                case 1: {
                    const c = this.getCoverageIndex(st.coverage, glyph);
                    if (c < 0) break;
                    addValue(i, st.posFormat === 1 ? st.value : st.values[c]);
                    return true;
                }
                case 2: {
                    const c = this.getCoverageIndex(st.coverage, glyph);
                    if (c < 0) break;
                    const j = next(lookup, i);
                    if (j < 0) return false;
                    let pair = null;
                    if (st.posFormat === 1) pair = (st.pairSets[c] || []).find((p) => p.secondGlyph === glyphIndexes[j]) || null;
                    else pair = (st.classRecords[classOf(st.classDef1, glyph)] || [])[classOf(st.classDef2, glyphIndexes[j])] || null;
                    if (!pair) break;
                    addValue(i, pair.value1);
                    addValue(j, pair.value2);
                    return true;
                }
                case 3: {
                    const c = this.getCoverageIndex(st.coverage, glyph);
                    const exit = c >= 0 && st.entryExitRecords[c].exitAnchor;
                    if (!exit) break;
                    const j = next(lookup, i);
                    if (j < 0) return false;
                    const d = this.getCoverageIndex(st.coverage, glyphIndexes[j]);
                    const entry = d >= 0 && st.entryExitRecords[d].entryAnchor;
                    if (!entry) break;
                    // Left to right: i's advance ends at its exit, j starts at its entry, j's
                    // baseline follows i's (resolved after all lookups).
                    // As the spec and HarfBuzz join them: in the text's direction one glyph's
                    // advance ends at the exit, the other begins at the entry; the RightToLeft
                    // lookup flag makes the earlier glyph the one whose baseline follows.
                    const e = anchorPoint(exit), f = anchorPoint(entry);
                    const advance = (k) => (this.font.glyphs.get(glyphIndexes[k]).advanceWidth || 0) + positions[k].xAdvance;
                    if (!options.rtl) {
                        positions[i].xAdvance += e.x + positions[i].xOffset - advance(i);
                        const d = f.x + positions[j].xOffset;
                        positions[j].xAdvance -= d;
                        positions[j].xOffset -= d;
                    } else {
                        const d = e.x + positions[i].xOffset;
                        positions[i].xAdvance -= d;
                        positions[i].xOffset -= d;
                        positions[j].xAdvance += f.x + positions[j].xOffset - advance(j);
                    }
                    if ((lookup.lookupFlag || 0) & 0x1) cursive[i] = { parent: j, dy: f.y - e.y };
                    else cursive[j] = { parent: i, dy: e.y - f.y };
                    return true;
                }
                case 4: case 5: {
                    const c = this.getCoverageIndex(st.markCoverage, glyph);
                    if (c < 0) break;
                    // The base: the nearest preceding glyph that is not a mark.
                    let b = i - 1;
                    while (b >= 0 && isMark(glyphIndexes[b])) b--;
                    if (b < 0) return false;
                    const mark = st.markArray[c];
                    let baseAnchor;
                    if (lookup.lookupType === 4) {
                        const bi = this.getCoverageIndex(st.baseCoverage, glyphIndexes[b]);
                        baseAnchor = bi >= 0 && st.baseArray[bi][mark.markClass];
                    } else {
                        const li = this.getCoverageIndex(st.ligatureCoverage, glyphIndexes[b]);
                        const components = li >= 0 ? st.ligatureArray[li] : null;
                        baseAnchor = components && components.length ? components[components.length - 1][mark.markClass] : null;
                    }
                    if (!baseAnchor || !mark.markAnchor) break;
                    const p = anchorPoint(baseAnchor), q = anchorPoint(mark.markAnchor);
                    attachment[i] = { base: b, dx: p.x - q.x, dy: p.y - q.y };
                    return true;
                }
                case 6: {
                    const c = this.getCoverageIndex(st.mark1Coverage, glyph);
                    if (c < 0) break;
                    const j = previous(lookup, i);
                    if (j < 0 || !isMark(glyphIndexes[j])) return false;
                    const m2 = this.getCoverageIndex(st.mark2Coverage, glyphIndexes[j]);
                    const mark = st.mark1Array[c];
                    const anchor = m2 >= 0 && st.mark2Array[m2][mark.markClass];
                    if (!anchor || !mark.markAnchor) break;
                    const p = anchorPoint(anchor), q = anchorPoint(mark.markAnchor);
                    attachment[i] = { base: j, dx: p.x - q.x, dy: p.y - q.y };
                    return true;
                }
                case 7: {
                    let rules = null;
                    if (st.posFormat === 1) {
                        const c = this.getCoverageIndex(st.coverage, glyph);
                        rules = c >= 0 ? (st.ruleSets[c] || []).map((r) => ({ tests: [() => true, ...r.input.map((g) => (x) => x === g)], records: r.lookupRecords })) : null;
                    } else if (st.posFormat === 2) {
                        if (this.getCoverageIndex(st.coverage, glyph) < 0) break;
                        rules = (st.classSets[classOf(st.classDef, glyph)] || []).map((r) => ({ tests: [() => true, ...r.classes.map((k) => (x) => classOf(st.classDef, x) === k)], records: r.lookupRecords }));
                    } else if (st.posFormat === 3) {
                        rules = [{ tests: st.coverages.map((cov) => (x) => this.getCoverageIndex(cov, x) >= 0), records: st.lookupRecords }];
                    }
                    for (const rule of rules || []) {
                        const matched = matchForward(lookup, i, rule.tests);
                        if (matched) { applyNested(matched, rule.records); return true; }
                    }
                    break;
                }
                case 8: {
                    let rules = null;
                    if (st.posFormat === 1) {
                        const c = this.getCoverageIndex(st.coverage, glyph);
                        const is = (g) => (x) => x === g;
                        rules = c >= 0 ? (st.chainRuleSets[c] || []).map((r) => ({ back: r.backtrack.map(is), tests: [() => true, ...r.input.map(is)], ahead: r.lookahead.map(is), records: r.lookupRecords })) : null;
                    } else if (st.posFormat === 2) {
                        if (this.getCoverageIndex(st.coverage, glyph) < 0) break;
                        const by = (def) => (k) => (x) => classOf(def, x) === k;
                        rules = (st.chainClassSet[classOf(st.inputClassDef, glyph)] || []).map((r) => ({ back: r.backtrack.map(by(st.backtrackClassDef)), tests: [() => true, ...r.input.map(by(st.inputClassDef))], ahead: r.lookahead.map(by(st.lookaheadClassDef)), records: r.lookupRecords }));
                    } else if (st.posFormat === 3) {
                        const cov = (c) => (x) => this.getCoverageIndex(c, x) >= 0;
                        rules = [{ back: st.backtrackCoverage.map(cov), tests: st.inputCoverage.map(cov), ahead: st.lookaheadCoverage.map(cov), records: st.lookupRecords }];
                    }
                    for (const rule of rules || []) {
                        const matched = matchForward(lookup, i, rule.tests);
                        if (!matched || !matchBackward(lookup, i, rule.back)) continue;
                        const last = matched[matched.length - 1];
                        if (rule.ahead.length && !matchForward(lookup, next(lookup, last), rule.ahead)) continue;
                        applyNested(matched, rule.records);
                        return true;
                    }
                    break;
                }
            }
        }
        return false;
    };

    for (const index of [...lookupIndexes].sort((a, b) => a - b)) {
        const lookup = lookups[index] && unwrap(lookups[index]);
        if (!lookup) continue;
        for (let i = 0; i < n; i++) applyAt(lookup, i);
    }

    // Marks take no advance (GDEF marks, as shaping engines zero them).
    for (let i = 0; i < n; i++) if (isMark(glyphIndexes[i])) positions[i].xAdvance = -(this.font.glyphs.get(glyphIndexes[i]).advanceWidth || 0);
    // Cursive chains: each glyph's baseline follows the glyph it is attached to.
    const resolved = new Array(n).fill(false);
    const follow = (i, depth = 0) => {
        if (resolved[i] || !cursive[i] || depth > n) return;
        resolved[i] = true;
        follow(cursive[i].parent, depth + 1);
        positions[i].yOffset += positions[cursive[i].parent].yOffset + cursive[i].dy;
    };
    for (let i = 0; i < n; i++) follow(i);
    // Marks sit at their base's anchor: the base's offset, moved by the pen advance between
    // them (subtracted left to right; right to left the pen runs the other way).
    const advanceOf = (k) => (this.font.glyphs.get(glyphIndexes[k]).advanceWidth || 0) + positions[k].xAdvance;
    for (let i = 0; i < n; i++) {
        const a = attachment[i];
        if (!a) continue;
        let between = 0;
        if (!options.rtl) for (let k = a.base; k < i; k++) between -= advanceOf(k);
        else for (let k = a.base + 1; k <= i; k++) between += advanceOf(k);
        positions[i].xOffset = positions[a.base].xOffset + a.dx + between;
        positions[i].yOffset = positions[a.base].yOffset + a.dy;
    }
    return positions;
};

/**
 * Positions for glyphs in visual order (as `Font.stringToGlyphRuns` returns them): each
 * right-to-left run is positioned in its logical order and turned back.
 * @this {object}
 * @param {number[]} indexes - Glyph indexes, visual order.
 * @param {number[]} rtlRuns - Per glyph, its right-to-left run, or -1.
 * @param {object} [options] - As for getPositions; `rtlScript` is the script of the
 *   right-to-left runs (default `arab`, the runs bidi reverses).
 */
Position.prototype.getVisualPositions = function(indexes, rtlRuns, options = {}) {
    const out = new Array(indexes.length);
    for (let start = 0; start < indexes.length;) {
        let end = start;
        while (end + 1 < indexes.length && rtlRuns[end + 1] === rtlRuns[start]) end++;
        const rtl = rtlRuns[start] >= 0, segment = indexes.slice(start, end + 1);
        const script = rtl ? (options.rtlScript || 'arab') : options.script;
        const positions = this.getPositions(rtl ? segment.reverse() : segment, { ...options, script, rtl });
        const ordered = rtl ? positions.reverse() : positions;
        for (let k = 0; k < ordered.length; k++) out[start + k] = ordered[k];
        start = end + 1;
    }
    return out;
};
