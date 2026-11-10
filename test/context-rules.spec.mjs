import assert from 'assert';
import { encodeChainContextRules } from '../src/context-rules.mjs';
import gpos from '../src/tables/gpos.mjs';
import gsub from '../src/tables/gsub.mjs';
import { Font, Glyph, Path } from '../src/opentype.mjs';
import FeatureQuery from '../src/features/featureQuery.mjs';
import { ContextParams } from '../src/tokenizer.mjs';

/** Glyphs of a coverage or the class of a glyph in a class definition. */
const covers = (coverage, glyph) => coverage.format === 1
    ? coverage.glyphs.includes(glyph)
    : coverage.ranges.some((range) => glyph >= range.start && glyph <= range.end);
const classOf = (classDef, glyph) => {
    if (!classDef) return 0;
    if (classDef.format === 1) {
        const value = classDef.classes[glyph - classDef.startGlyph];
        return value === undefined ? 0 : value;
    }
    const range = (classDef.ranges || []).find((entry) => glyph >= entry.start && glyph <= entry.end);
    return range ? (range.classId ?? range.value) : 0;
};

/**
 * The lookup records of the rule that applies at position `at` of `sequence`: the first
 * subtable with a matching rule, and that rule (HarfBuzz order).
 */
function applying(subtables, sequence, at, formatKey) {
    const matches = (backtrack, input, lookahead, test) => {
        if (at + input.length > sequence.length || at - backtrack.length < 0 || at + input.length + lookahead.length > sequence.length) return false;
        return input.every((item, k) => test('input', item, sequence[at + k]))
            && backtrack.every((item, k) => test('backtrack', item, sequence[at - 1 - k]))
            && lookahead.every((item, k) => test('lookahead', item, sequence[at + input.length + k]));
    };
    for (const subtable of subtables) {
        const format = subtable[formatKey];
        if (format === 3) {
            if (matches(subtable.backtrackCoverage, subtable.inputCoverage, subtable.lookaheadCoverage, (_, coverage, glyph) => covers(coverage, glyph))) return subtable.lookupRecords;
        } else if (format === 1) {
            const index = subtable.coverage.format === 1 ? subtable.coverage.glyphs.indexOf(sequence[at]) : -1;
            const glyphs = subtable.coverage.format === 1 ? subtable.coverage.glyphs : subtable.coverage.ranges.flatMap((range) => Array.from({ length: range.end - range.start + 1 }, (_, k) => range.start + k));
            const position = subtable.coverage.format === 1 ? index : glyphs.indexOf(sequence[at]);
            if (position < 0) continue;
            for (const rule of subtable.chainRuleSets[position] || []) {
                if (matches(rule.backtrack, [sequence[at], ...rule.input], rule.lookahead, (_, glyph, actual) => glyph === actual)) return rule.lookupRecords;
            }
        } else if (format === 2) {
            if (!covers(subtable.coverage, sequence[at])) continue;
            const defs = { backtrack: subtable.backtrackClassDef, input: subtable.inputClassDef, lookahead: subtable.lookaheadClassDef };
            for (const rule of subtable.chainClassSet[classOf(defs.input, sequence[at])] || []) {
                if (matches(rule.backtrack, [classOf(defs.input, sequence[at]), ...rule.input], rule.lookahead, (context, value, glyph) => classOf(defs[context], glyph) === value)) return rule.lookupRecords;
            }
        }
    }
    return null;
}

/** The first rule in order that matches at `at`. */
function reference(rules, sequence, at) {
    for (const rule of rules) {
        const subtable = { posFormat: 3, backtrackCoverage: rule.backtrack.map((glyphs) => ({ format: 1, glyphs })), inputCoverage: rule.input.map((glyphs) => ({ format: 1, glyphs })), lookaheadCoverage: rule.lookahead.map((glyphs) => ({ format: 1, glyphs })), lookupRecords: rule.lookupRecords };
        if (applying([subtable], sequence, at, 'posFormat')) return rule.lookupRecords;
    }
    return null;
}

function random(seed) {
    let state = seed;
    return () => ((state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

/** Rules over glyphs 0..11 from a few classes, single glyphs and odd sets. */
function randomRules(rnd, count) {
    const classes = [[1, 2, 3], [4, 5], [6], [7, 8, 9, 10], [11]];
    const pick = () => {
        const kind = rnd();
        if (kind < 0.6) return classes[Math.floor(rnd() * classes.length)].slice();
        if (kind < 0.85) return [1 + Math.floor(rnd() * 11)];
        return [...new Set([1 + Math.floor(rnd() * 11), 1 + Math.floor(rnd() * 11)])];
    };
    return Array.from({ length: count }, (_, index) => ({
        backtrack: Array.from({ length: Math.floor(rnd() * 3) }, pick),
        input: Array.from({ length: 1 + Math.floor(rnd() * 3) }, pick),
        lookahead: Array.from({ length: Math.floor(rnd() * 3) }, pick),
        lookupRecords: [{ sequenceIndex: 0, lookupListIndex: index }]
    }));
}

describe('encodeChainContextRules', function() {
    it('applies the same rule as the rule order at every position (random rule sets)', function() {
        const rnd = random(7);
        for (let trial = 0; trial < 60; trial++) {
            const rules = randomRules(rnd, 1 + Math.floor(rnd() * 25));
            const subtables = encodeChainContextRules(rules, { formatKey: 'posFormat', numGlyphs: 12 });
            for (let s = 0; s < 40; s++) {
                const sequence = Array.from({ length: 2 + Math.floor(rnd() * 7) }, () => Math.floor(rnd() * 12));
                for (let at = 0; at < sequence.length; at++) {
                    assert.strictEqual(applying(subtables, sequence, at, 'posFormat'), reference(rules, sequence, at), `trial ${trial} ${sequence} @${at}`);
                }
            }
        }
    });

    it('shares one class-based subtable between rules of shared classes and keeps the record arrays', function() {
        // Every pair of four classes as backtrack / input / lookahead: one class-based subtable.
        const classes = [[20, 22, 24, 26, 28, 30], [40, 41, 42, 43], [50, 52, 54], [60, 61, 62, 63, 64, 65, 66]];
        const rules = [];
        for (const back of classes) for (const input of classes) for (const ahead of classes) rules.push({ backtrack: [back], input: [input], lookahead: [ahead], lookupRecords: [] });
        const [subtable, ...rest] = encodeChainContextRules(rules, { formatKey: 'substFormat' });
        assert.strictEqual(rest.length, 0);
        assert.strictEqual(subtable.substFormat, 2);
        const all = subtable.chainClassSet.filter(Boolean).flat();
        assert.strictEqual(all.length, rules.length);
        assert.ok(rules.every((rule) => all.some((entry) => entry.lookupRecords === rule.lookupRecords)), 'rules keep their record arrays');
        // Records filled in later reach the subtable.
        rules[5].lookupRecords.push({ sequenceIndex: 0, lookupListIndex: 4 });
        assert.deepStrictEqual(all.filter((entry) => entry.lookupRecords.length > 0).map((entry) => entry.lookupRecords), [[{ sequenceIndex: 0, lookupListIndex: 4 }]]);
    });

    it('writes single-glyph rules as one glyph-based subtable and a lone rule as coverages', function() {
        const single = encodeChainContextRules([
            { backtrack: [[1]], input: [[2], [3]], lookahead: [], lookupRecords: [] },
            { backtrack: [], input: [[2]], lookahead: [[4]], lookupRecords: [] },
            { backtrack: [], input: [[7]], lookahead: [], lookupRecords: [] }
        ], { formatKey: 'posFormat' });
        assert.deepStrictEqual(single.map((subtable) => subtable.posFormat), [1]);
        assert.deepStrictEqual(single[0].coverage, { format: 1, glyphs: [2, 7] });
        const lone = encodeChainContextRules([{ backtrack: [[1, 2, 3, 4, 5, 6]], input: [[9, 10]], lookahead: [], lookupRecords: [] }], { formatKey: 'posFormat' });
        assert.deepStrictEqual(lone, [{ posFormat: 3, backtrackCoverage: [{ format: 2, ranges: [{ start: 1, end: 6, index: 0 }] }], inputCoverage: [{ format: 1, glyphs: [9, 10] }], lookaheadCoverage: [], lookupRecords: [] }]);
    });

    it('splits where a set overlaps a class of the run, keeping order', function() {
        const family = (first, second) => [first, second].flatMap((input) => [[30, 31, 32, 33], [40, 41, 42], [50, 51, 52, 53, 54]]
            .map((ahead) => ({ backtrack: [], input: [input], lookahead: [ahead, ahead], lookupRecords: [] })));
        // [1, 2] and [2, 3] overlap: two class-based subtables, in order.
        const subtables = encodeChainContextRules([...family([1, 2], [5, 6, 7]), ...family([2, 3], [8, 9, 10])], { formatKey: 'posFormat' });
        assert.deepStrictEqual(subtables.map((subtable) => subtable.posFormat), [2, 2]);
        assert.deepStrictEqual(subtables.map((subtable) => subtable.coverage), [{ format: 1, glyphs: [1, 2, 5, 6, 7] }, { format: 1, glyphs: [2, 3, 8, 9, 10] }]);
    });

    it('writes the set of every other glyph as class 0', function() {
        // Lookahead: 5, 9 and every other glyph of a 40-glyph font, after six firsts.
        const other = Array.from({ length: 40 }, (_, glyph) => glyph).filter((glyph) => glyph !== 5 && glyph !== 9);
        const rules = [];
        for (const input of [[1, 2], [3, 4], [6, 7]]) for (const ahead of [[5], other, [9]]) rules.push({ backtrack: [], input: [input], lookahead: [ahead], lookupRecords: [] });
        const subtables = encodeChainContextRules(rules, { formatKey: 'posFormat', numGlyphs: 40 });
        assert.strictEqual(subtables.length, 1);
        assert.strictEqual(subtables[0].posFormat, 2);
        assert.deepStrictEqual(subtables[0].lookaheadClassDef, { format: 2, ranges: [{ start: 5, end: 5, classId: 1 }, { start: 9, end: 9, classId: 2 }] });
        assert.deepStrictEqual(subtables[0].chainClassSet[1].map((rule) => rule.lookahead), [[1], [0], [2]]);
        // Without the glyph count the set is a class of its own, and the same rules apply.
        const explicit = encodeChainContextRules(rules, { formatKey: 'posFormat' });
        for (const glyph of [5, 9, 0, 39, 17]) assert.deepStrictEqual(applying(explicit, [3, glyph], 0, 'posFormat'), applying(subtables, [3, glyph], 0, 'posFormat'));
    });

    it('drops rules with a position no glyph fills', function() {
        assert.deepStrictEqual(encodeChainContextRules([{ backtrack: [[]], input: [[1]], lookahead: [], lookupRecords: [] }]), []);
    });

    it('keeps a class-based subtable within the 16-bit offset limit', function() {
        const rules = Array.from({ length: 4000 }, (_, index) => ({ backtrack: [[1 + (index % 50)]], input: [[100 + (index % 300)]], lookahead: [[500 + (index % 70)]], lookupRecords: [{ sequenceIndex: 0, lookupListIndex: 1 }] }));
        const subtables = encodeChainContextRules(rules, { formatKey: 'posFormat' });
        assert.ok(subtables.length > 1);
        const lookups = [{ lookupType: 8, lookupFlag: 0, subtables }];
        const parsed = gpos.parse(new DataView(new Uint8Array(gpos.make({ version: 1, scripts: [], features: [], lookups }).encode()).buffer));
        for (const sequence of [[1, 100, 500], [7, 106, 506], [50, 149, 569], [2, 100, 500]]) {
            assert.deepStrictEqual(applying(parsed.lookups[0].subtables, sequence, 1, 'posFormat'), reference(rules, sequence, 1), String(sequence));
        }
    });

    it('roundtrips through the GSUB and GPOS writers with the same rule applying', function() {
        const rnd = random(99);
        const rules = randomRules(rnd, 40);
        for (const [table, lookupType, formatKey] of [[gsub, 6, 'substFormat'], [gpos, 8, 'posFormat']]) {
            const subtables = encodeChainContextRules(rules, { formatKey, numGlyphs: 12 });
            const parsed = table.parse(new DataView(new Uint8Array(table.make({ version: 1, scripts: [], features: [], lookups: [{ lookupType, lookupFlag: 0, subtables }] }).encode()).buffer));
            const written = parsed.lookups[0].subtables;
            for (let s = 0; s < 200; s++) {
                const sequence = Array.from({ length: 2 + Math.floor(rnd() * 6) }, () => Math.floor(rnd() * 12));
                for (let at = 0; at < sequence.length; at++) {
                    const expected = reference(rules, sequence, at);
                    const actual = applying(written, sequence, at, formatKey);
                    assert.deepStrictEqual(actual, expected, `${formatKey} ${sequence} @${at}`);
                }
            }
        }
    });

    it('class-based subtables shape in the FeatureQuery substitution path', function() {
        // Glyphs 1-3 a b c, 4-6 their alternates. Rule order: c after a stays (blocks), a or b before c take the alternate.
        const glyphs = ['.notdef', 'a', 'b', 'c', 'a.alt', 'b.alt', 'c.alt'].map((name, index) => new Glyph({ name, unicode: index >= 1 && index <= 3 ? 0x60 + index : undefined, advanceWidth: 500, path: new Path() }));
        const font = new Font({ familyName: 'Classes', styleName: 'Regular', unitsPerEm: 1000, ascender: 800, descender: -200, glyphs });
        // Classes: input 1 = a b, 2 = c; backtrack 1 = a, 2 = b.
        const subtables = [{
            substFormat: 2,
            coverage: { format: 1, glyphs: [1, 2, 3] },
            backtrackClassDef: { format: 1, startGlyph: 1, classes: [1, 2] },
            inputClassDef: { format: 1, startGlyph: 1, classes: [1, 1, 2] },
            lookaheadClassDef: { format: 1, startGlyph: 3, classes: [1] },
            chainClassSet: [null,
                [{ backtrack: [], input: [], lookahead: [1], lookupRecords: [{ sequenceIndex: 0, lookupListIndex: 0 }] }],
                [{ backtrack: [1], input: [], lookahead: [], lookupRecords: [] }, { backtrack: [2], input: [], lookahead: [], lookupRecords: [{ sequenceIndex: 0, lookupListIndex: 0 }] }]]
        }];
        font.tables.gsub = {
            version: 1,
            scripts: [{ tag: 'DFLT', script: { defaultLangSys: { reserved: 0, reqFeatureIndex: 0xffff, featureIndexes: [0] }, langSysRecords: [] } }],
            features: [{ tag: 'calt', feature: { params: 0, lookupListIndexes: [1] } }],
            lookups: [
                { lookupType: 1, lookupFlag: 0, subtables: [{ substFormat: 2, coverage: { format: 1, glyphs: [1, 2, 3] }, substitute: [4, 5, 6] }] },
                { lookupType: 6, lookupFlag: 0, subtables }
            ]
        };
        const query = new FeatureQuery(font);
        const at = (sequence, index) => query.lookupFeature({ tag: 'calt', script: 'DFLT', contextParams: new ContextParams(sequence, index) })[index];
        assert.deepStrictEqual(at([2, 3], 0).substitution, [5], 'b before c takes b.alt');
        assert.deepStrictEqual(at([2, 3], 1).substitution, [6], 'c after b takes c.alt');
        assert.strictEqual(at([1, 3], 1), 3, 'c after a is blocked by the first rule of its class');
    });
});
