import assert from 'assert';
import table from '../src/table.mjs';
import gsub from '../src/tables/gsub.mjs';
import gpos from '../src/tables/gpos.mjs';
import cmap from '../src/tables/cmap.mjs';
import { Parser } from '../src/parse.mjs';
import { classDefPairs, coverageList } from './testutil.mjs';

const view = (bytes) => new DataView(Uint8Array.from(bytes).buffer);
const scripts = [{ tag: 'DFLT', script: { defaultLangSys: { reserved: 0, reqFeatureIndex: 0xffff, featureIndexes: [0] }, langSysRecords: [] } }];
const parseCoverage = (bytes) => new Parser(view(bytes), 0).parseCoverage();
const parseClassDef = (bytes) => new Parser(view(bytes), 0).parseClassDef();

/** glyph → substitute of a parsed single substitution subtable, either format. */
function singleSubstitutions(subtable) {
    const glyphs = coverageList(subtable.coverage);
    return glyphs.map((glyph, i) => [glyph, subtable.substFormat === 1 ? (glyph + subtable.deltaGlyphId) & 0xffff : subtable.substitute[i]]);
}

/** glyph → xAdvance of the parsed SinglePos subtables of one lookup (first subtable wins). */
function singlePositions(subtables) {
    const result = new Map();
    for (const subtable of subtables) {
        coverageList(subtable.coverage).forEach((glyph, i) => {
            if (result.has(glyph)) return;
            const value = subtable.posFormat === 1 ? subtable.value : subtable.values[i];
            result.set(glyph, value?.xAdvance || 0);
        });
    }
    return [...result].sort((a, b) => a[0] - b[0]);
}

describe('compact layout encoding', function() {
    describe('coverage and class definition formats', function() {
        it('writes a coverage in the smaller format, whatever format it was given in', function() {
            const run = Array.from({ length: 30 }, (_, i) => 100 + i);
            const ranged = new table.Coverage({ format: 1, glyphs: run }).encode();
            assert.equal(ranged.length, 4 + 6);
            assert.deepEqual(coverageList(parseCoverage(ranged)), run);
            const scattered = [3, 9, 27, 81];
            const listed = new table.Coverage({ format: 2, ranges: scattered.map((glyph, index) => ({ start: glyph, end: glyph, index })) }).encode();
            assert.equal(listed.length, 4 + 2 * 4);
            assert.deepEqual(parseCoverage(listed), { format: 1, glyphs: scattered });
        });

        it('keeps a coverage whose glyphs are out of order as given', function() {
            const bytes = new table.Coverage({ format: 1, glyphs: [5, 4, 3, 2, 1] }).encode();
            assert.deepEqual(parseCoverage(bytes), { format: 1, glyphs: [5, 4, 3, 2, 1] });
        });

        it('writes a class definition in the smaller format without class 0 entries', function() {
            const dense = { format: 2, ranges: [1, 2, 3, 4, 5, 6].map((glyph) => ({ start: 10 + glyph, end: 10 + glyph, classId: glyph % 3 })) };
            const denseBytes = new table.ClassDef(dense).encode();
            assert.equal(parseClassDef(denseBytes).format, 1);
            assert.deepEqual(classDefPairs(parseClassDef(denseBytes)), [[11, 1], [12, 2], [14, 1], [15, 2]]);
            const sparse = { format: 1, startGlyph: 0, classes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2] };
            const sparseBytes = new table.ClassDef(sparse).encode();
            assert.deepEqual(parseClassDef(sparseBytes), { format: 2, ranges: [{ start: 20, end: 23, classId: 2 }] });
            assert.equal(sparseBytes.length, 4 + 6);
        });
    });

    describe('subtable formats', function() {
        it('writes single substitution format 1 when every glyph moves by the same delta', function() {
            const lookups = [{ lookupType: 1, lookupFlag: 0, subtables: [
                { substFormat: 2, coverage: { format: 1, glyphs: [10, 11, 12] }, substitute: [20, 21, 22] },
                { substFormat: 2, coverage: { format: 1, glyphs: [30, 31] }, substitute: [2, 1] },
                { substFormat: 2, coverage: { format: 1, glyphs: [40] }, substitute: [3] }
            ] }];
            const parsed = gsub.parse(view(gsub.make({ version: 1, scripts, features: [{ tag: 'test', feature: { featureParams: 0, lookupListIndexes: [0] } }], lookups }).encode()));
            const [delta, list, negative] = parsed.lookups[0].subtables;
            assert.deepEqual([delta.substFormat, list.substFormat, negative.substFormat], [1, 2, 1]);
            assert.equal(negative.deltaGlyphId, -37);
            assert.deepEqual(parsed.lookups[0].subtables.map(singleSubstitutions), lookups[0].subtables.map((subtable) =>
                subtable.coverage.glyphs.map((glyph, i) => [glyph, subtable.substitute[i]])));
        });

        it('re-splits SinglePos subtables into format 1 groups and a format 2 rest, keeping every adjustment', function() {
            const glyphs = Array.from({ length: 60 }, (_, i) => 10 + i);
            // 40 glyphs share one adjustment, the rest differ; a later subtable repeats a glyph.
            const values = glyphs.map((glyph, i) => ({ xAdvance: i < 40 ? -30 : i, xPlacement: 0 }));
            const lookup = { lookupType: 1, lookupFlag: 0, subtables: [
                { posFormat: 2, coverage: { format: 1, glyphs }, values },
                { posFormat: 1, coverage: { format: 1, glyphs: [10, 200] }, value: { xAdvance: 99 } }
            ] };
            const make = (lookups) => gpos.make({ version: 1, scripts, features: [{ tag: 'kern', feature: { featureParams: 0, lookupListIndexes: [0] } }], lookups }).encode();
            const bytes = make([lookup]);
            const written = gpos.parse(view(bytes)).lookups[0].subtables;
            assert.ok(written.some((subtable) => subtable.posFormat === 1 && coverageList(subtable.coverage).length === 40));
            const expected = [...glyphs.map((glyph, i) => [glyph, values[i].xAdvance]), [200, 99]];
            assert.deepEqual(singlePositions(written), expected);
            assert.equal(written.length, 2, 'a format 1 group and a format 2 rest');
        });

        it('writes the smallest ValueFormat, keeping a non-zero valueFormat2', function() {
            const subtable = { posFormat: 1, coverage: { format: 1, glyphs: [5] }, valueFormat1: 0x000f, valueFormat2: 0x0005,
                pairSets: [[{ secondGlyph: 9, value1: { xPlacement: 0, yPlacement: 0, xAdvance: -40, yAdvance: 0 }, value2: { xPlacement: 0, xAdvance: 0 } }]] };
            const parsed = gpos.parse(view(gpos.make({ version: 1, scripts, features: [], lookups: [{ lookupType: 2, lookupFlag: 0, subtables: [subtable] }] }).encode()));
            const written = parsed.lookups[0].subtables[0];
            assert.equal(written.valueFormat1, 0x0004);
            // Shaping engines skip the second glyph of a pair only when valueFormat2 is non-zero.
            assert.equal(written.valueFormat2, 0x0001);
            assert.equal(written.pairSets[0][0].value1.xAdvance, -40);
        });
    });

    describe('shared objects', function() {
        it('stores identical objects of different lookups once', function() {
            const coverage = { format: 1, glyphs: [3, 7, 11, 15, 19, 23] };
            const lookups = [1, 2, 3].map((k) => ({ lookupType: 4, lookupFlag: 0, subtables: [{ substFormat: 1, coverage,
                ligatureSets: coverage.glyphs.map((glyph) => [{ ligGlyph: 40 + k, components: [glyph + 1] }]) }] }));
            const three = gsub.make({ version: 1, scripts, features: [], lookups }).encode();
            // The same lookups with coverages of the same size that differ: each is written.
            const distinct = lookups.map((lookup, k) => ({ ...lookup, subtables: [{ ...lookup.subtables[0],
                coverage: { format: 1, glyphs: coverage.glyphs.map((glyph) => glyph + 100 * k) } }] }));
            const unshared = gsub.make({ version: 1, scripts, features: [], lookups: distinct }).encode();
            assert.equal(unshared.length - three.length, 2 * (4 + 2 * coverage.glyphs.length));
            const parsed = gsub.parse(view(three));
            for (let k = 0; k < 3; k++) {
                assert.deepEqual(parsed.lookups[k].subtables[0].coverage, coverage);
                assert.deepEqual(parsed.lookups[k].subtables[0].ligatureSets, lookups[k].subtables[0].ligatureSets);
            }
        });

        it('copies a shared object next to a parent that a 16-bit offset cannot reach', function() {
            const shared = { format: 1, glyphs: [1, 3, 5] };
            // Extension payloads are laid out one after another: the first and last reference the
            // same coverage with more than 64 KB of distinct payloads in between.
            const filler = (k) => ({ substFormat: 2, coverage: { format: 2, ranges: [{ start: 100, end: 12099, index: 0 }] },
                substitute: Array.from({ length: 12000 }, (_, i) => (i * (k + 3)) % 30000) });
            const inner = [{ substFormat: 2, coverage: shared, substitute: [7, 8, 9] }, filler(1), filler(2), filler(3),
                { substFormat: 2, coverage: shared, substitute: [9, 8, 7] }];
            const lookups = inner.map((extension) => ({ lookupType: 7, lookupFlag: 0, subtables: [{ substFormat: 1, lookupType: 1, extension }] }));
            const bytes = gsub.make({ version: 1, scripts, features: [], lookups }).encode();
            const parsed = gsub.parse(view(bytes));
            assert.deepEqual(singleSubstitutions(parsed.lookups[0].subtables[0].extension), [[1, 7], [3, 8], [5, 9]]);
            assert.deepEqual(singleSubstitutions(parsed.lookups[4].subtables[0].extension), [[1, 9], [3, 8], [5, 7]]);
            assert.deepEqual(singleSubstitutions(parsed.lookups[2].subtables[0].extension), singleSubstitutions(filler(2)));
        });
    });

    describe('cmap format 4', function() {
        const glyphsOf = (codes) => ({ length: codes.length + 1, get: (i) => ({ unicodes: i === 0 ? [] : [codes[i - 1]] }) });
        it('stores unordered glyph ids of a code run in the glyphIdArray and splits out long consecutive runs', function() {
            // Codes 0x41..0x5A (26) map to glyphs 1..26 except a scrambled middle block.
            const codes = Array.from({ length: 26 }, (_, i) => 0x41 + i);
            const order = [...codes];
            [order[3], order[4]] = [order[4], order[3]];
            const glyphs = glyphsOf(order);
            const made = cmap.make(glyphs);
            const parsed = cmap.parse(view(made.encode()), 0);
            for (let glyph = 1; glyph <= 26; glyph++) assert.equal(parsed.glyphIndexMap[order[glyph - 1]], glyph);
            // fontTools' segmentation: the scrambled start of the run keeps its ids in the
            // glyphIdArray, the long consecutive rest is one idDelta segment.
            assert.equal(made.segments.length, 3);
            assert.deepEqual(made.segments[0].glyphIds, [1, 2, 3, 5, 4]);
            assert.equal(made.segments[1].glyphIds, undefined);
        });
    });
});
