import assert from 'assert';
import { parse } from '../../src/opentype.js';
import { readFileSync } from 'fs';
const loadSync = (url, opt) => parse(readFileSync(url), opt);

describe('tables/hvar.js', function() {
    const fonts = {
        hvarTest1: loadSync('./test/fonts/TestHVAROne.otf'),
        hvarTest2: loadSync('./test/fonts/TestHVARTwo.ttf'),
    };

    it('correctly parses the HVAR table', function() {
        for (const fontName in fonts) {
            const font = fonts[fontName];
            assert.ok(font.tables.hvar, `${fontName} should have an HVAR table`);
            assert.deepEqual(font.tables.hvar.version, [1, 0], `${fontName} should have HVAR version [1, 0]`);
            assert.ok(font.tables.hvar.itemVariationStore, `${fontName} should have an itemVariationStore`);
        }
    });

    it('parses itemVariationStore correctly', function() {
        for (const fontName in fonts) {
            const font = fonts[fontName];
            const ivs = font.tables.hvar.itemVariationStore;
            assert.ok(ivs, `${fontName} should have itemVariationStore`);
            assert.ok(ivs.variationRegions, `${fontName} should have variationRegions`);
            assert.ok(ivs.itemVariationSubtables, `${fontName} should have itemVariationSubtables`);
        }
    });

    it('should roundtrip hvar table structure', function() {
        // Use the TTF font for roundtrip (OTF has CFF2 issues unrelated to hvar)
        const font = fonts.hvarTest2;
        const originalHvar = font.tables.hvar;
        
        // Write and re-parse
        const buffer = font.toArrayBuffer();
        const font2 = parse(buffer);
        const roundtrippedHvar = font2.tables.hvar;
        
        // Check basic structure
        assert.ok(roundtrippedHvar, 'Roundtripped font should have HVAR table');
        assert.deepEqual(roundtrippedHvar.version, originalHvar.version, 
            'Version should match');
        
        // Check itemVariationStore
        const origIVS = originalHvar.itemVariationStore;
        const rtIVS = roundtrippedHvar.itemVariationStore;
        
        assert.ok(rtIVS, 'Roundtripped HVAR should have itemVariationStore');
        assert.equal(rtIVS.variationRegions.length, origIVS.variationRegions.length, 
            'Should have same number of variation regions');
        assert.equal(rtIVS.itemVariationSubtables.length, origIVS.itemVariationSubtables.length, 
            'Should have same number of item variation subtables');
        
        // Deep compare variation regions
        for (let i = 0; i < origIVS.variationRegions.length; i++) {
            const origRegion = origIVS.variationRegions[i];
            const rtRegion = rtIVS.variationRegions[i];
            assert.deepEqual(rtRegion, origRegion, `Variation region ${i} should match`);
        }
    });
});
