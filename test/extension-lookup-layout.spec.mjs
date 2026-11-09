import assert from 'assert';
import { Font, Glyph, Path, parse } from '../src/opentype.mjs';

/** A font whose GSUB holds `count` extension-wrapped single substitution lookups. */
function fontWithExtensionLookups(count) {
    const glyphs = [new Glyph({ name: '.notdef', advanceWidth: 500, path: new Path() })];
    for (let i = 1; i <= 40; i++) glyphs.push(new Glyph({ name: 'g' + i, unicode: 0x40 + i, advanceWidth: 500, path: new Path() }));
    const font = new Font({ familyName: 'Ext', styleName: 'Regular', unitsPerEm: 1000, ascender: 800, descender: -200, glyphs });
    const lookups = [];
    for (let i = 0; i < count; i++) {
        const from = 1 + (i % 20);
        lookups.push({
            lookupType: 7,
            lookupFlag: 0,
            subtables: [1, 2].map((k) => ({
                substFormat: 1,
                lookupType: 1,
                extension: { substFormat: 2, coverage: { format: 1, glyphs: [from + k - 1] }, substitute: [20 + ((from + k + i) % 20)] }
            }))
        });
    }
    font.tables.gsub = {
        version: 1,
        scripts: [{ tag: 'DFLT', script: { defaultLangSys: { reserved: 0, reqFeatureIndex: 0xffff, featureIndexes: [0] }, langSysRecords: [] } }],
        features: [{ tag: 'ss01', feature: { featureParams: 0, lookupListIndexes: lookups.map((_, index) => index) } }],
        lookups
    };
    return { font, lookups };
}

describe('chaining context format 1 in text shaping', function() {
    it('applies glyph-sequence chaining rules in rule order', function() {
        const glyphs = [new Glyph({ name: '.notdef', advanceWidth: 500, path: new Path() })];
        for (const [name, unicode] of [['a', 0x61], ['b', 0x62], ['c', 0x63], ['a.alt', undefined]]) glyphs.push(new Glyph({ name, unicode, advanceWidth: 500, path: new Path() }));
        const font = new Font({ familyName: 'F1', styleName: 'Regular', unitsPerEm: 1000, ascender: 800, descender: -200, glyphs });
        font.tables.gsub = {
            version: 1,
            scripts: [{ tag: 'DFLT', script: { defaultLangSys: { reserved: 0, reqFeatureIndex: 0xffff, featureIndexes: [0] }, langSysRecords: [] } }],
            features: [{ tag: 'calt', feature: { featureParams: 0, lookupListIndexes: [0] } }],
            lookups: [
                { lookupType: 6, lookupFlag: 0, subtables: [{ substFormat: 1, coverage: { format: 1, glyphs: [1] }, chainRuleSets: [[
                    { backtrack: [], input: [], lookahead: [3], lookupRecords: [] },
                    { backtrack: [], input: [], lookahead: [2], lookupRecords: [{ sequenceIndex: 0, lookupListIndex: 1 }] }
                ]] }] },
                { lookupType: 1, lookupFlag: 0, subtables: [{ substFormat: 2, coverage: { format: 1, glyphs: [1] }, substitute: [4] }] }
            ]
        };
        const shaped = parse(font.toArrayBuffer());
        assert.deepEqual(shaped.stringToGlyphs('ab').map((glyph) => glyph.name), ['a.alt', 'b']);
        assert.deepEqual(shaped.stringToGlyphs('ac').map((glyph) => glyph.name), ['a', 'c'], 'the earlier rule blocks');
    });
});

describe('extension lookup layout', function() {
    it('writes extension subtables after every Lookup table, so thousands of lookups fit 16-bit LookupList offsets', function() {
        const { font, lookups } = fontWithExtensionLookups(3000);
        const again = parse(font.toArrayBuffer());
        const written = again.tables.gsub.lookups;
        assert.equal(written.length, 3000);
        for (const index of [0, 1499, 2999]) {
            const expected = lookups[index].subtables.map((subtable) => [subtable.extension.coverage.glyphs, subtable.extension.substitute]);
            const actual = written[index].subtables.map((subtable) => [subtable.extension.coverage.glyphs, subtable.extension.substitute]);
            assert.equal(written[index].lookupType, 7);
            assert.deepEqual(actual, expected);
        }
    });
});
