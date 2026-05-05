import assert from 'assert';
import { readFileSync } from 'fs';
import { parse } from '../../src/opentype.mjs';
import hvar from '../../src/tables/hvar.mjs';

const loadSync = url => parse(readFileSync(url));

describe('tables/hvar.mjs', function() {
    const fonts = {
        hvarTest1: loadSync('./test/fonts/TestHVAROne.otf'),
        hvarTest2: loadSync('./test/fonts/TestHVARTwo.ttf'),
    };

    it('parses HVAR tables and their ItemVariationStores', function() {
        for (const fontName in fonts) {
            const font = fonts[fontName];
            assert.ok(font.tables.hvar, `${fontName} should have an HVAR table`);
            assert.deepEqual(font.tables.hvar.version, [1, 0]);
            assert.ok(font.tables.hvar.itemVariationStore);
            assert.ok(font.tables.hvar.itemVariationStore.variationRegions);
            assert.ok(font.tables.hvar.itemVariationStore.itemVariationSubtables);
        }
    });

    it('roundtrips HVAR table structure', function() {
        const font = fonts.hvarTest2;
        const originalHvar = font.tables.hvar;
        const roundtrippedHvar = parse(font.toArrayBuffer()).tables.hvar;

        assert.ok(roundtrippedHvar);
        assert.deepEqual(roundtrippedHvar.version, originalHvar.version);
        assert.equal(
            roundtrippedHvar.itemVariationStore.variationRegions.length,
            originalHvar.itemVariationStore.variationRegions.length
        );
        assert.equal(
            roundtrippedHvar.itemVariationStore.itemVariationSubtables.length,
            originalHvar.itemVariationStore.itemVariationSubtables.length
        );
        assert.deepEqual(
            roundtrippedHvar.itemVariationStore.variationRegions,
            originalHvar.itemVariationStore.variationRegions
        );
    });

    it('rejects oversized ItemVariationData subtables instead of silently wrapping itemCount', function() {
        const hugeDeltaSets = Array.from({ length: 0x10000 }, () => [0]);
        assert.throws(() => hvar.make({
            version: [1, 0],
            itemVariationStore: {
                format: 1,
                variationRegions: [{
                    regionAxes: [{ startCoord: 0, peakCoord: 1, endCoord: 1 }]
                }],
                itemVariationSubtables: [{
                    regionIndexes: [0],
                    deltaSets: hugeDeltaSets
                }]
            },
            advanceWidth: {
                map: [{ outerIndex: 0, innerIndex: 0 }]
            }
        }), /itemCount 65536 exceeds 65535/);
    });

    it('rejects DeltaSetIndexMap entries that require more than 16 inner-index bits', function() {
        assert.throws(() => hvar.make({
            version: [1, 0],
            itemVariationStore: {
                format: 1,
                variationRegions: [{
                    regionAxes: [{ startCoord: 0, peakCoord: 1, endCoord: 1 }]
                }],
                itemVariationSubtables: [{
                    regionIndexes: [0],
                    deltaSets: [[0]]
                }]
            },
            advanceWidth: {
                map: [{ outerIndex: 0, innerIndex: 0x10000 }]
            }
        }), /innerIndex requires 17 bits/);
    });
});
