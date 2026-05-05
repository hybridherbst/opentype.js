import assert from 'assert';
import { hex, unhex } from '../testutil.mjs';
import colr, { PaintFormat } from '../../src/tables/colr.mjs';

describe('tables/colr.mjs', function () {
    const data = '00 00 00 02 00 00 00 0E 00 00 00 1A 00 03 ' +
        '00 AA 00 00 00 01 00 BB 00 01 00 02 ' +
        '00 20 FF FF 00 21 00 40 00 23 00 41';
    const obj = {
        version: 0,
        baseGlyphRecords: [
            { glyphID: 0xAA, firstLayerIndex: 0, numLayers: 1 },
            { glyphID: 0xBB, firstLayerIndex: 1, numLayers: 2 },
        ],
        layerRecords: [
            { glyphID: 0x20, paletteIndex: 0xFFFF },
            { glyphID: 0x21, paletteIndex: 0x0040 },
            { glyphID: 0x23, paletteIndex: 0x0041 },
        ]
    };

    it('can parse colr table', function () {
        assert.deepStrictEqual(obj, colr.parse(unhex(data), 0));
    });

    it('can make colr table', function () {
        const hexString = hex(colr.make(obj).encode());
        colr.parse(unhex(hexString), 0);
        assert.deepStrictEqual(data, hexString);
    });

    it('roundtrips COLRv1 paint records, clip boxes, and variation data', function() {
        const obj = {
            version: 1,
            baseGlyphPaintRecords: [{
                glyphID: 7,
                paint: {
                    format: PaintFormat.Glyph,
                    glyphID: 3,
                    paint: {
                        format: PaintFormat.Solid,
                        paletteIndex: 2,
                        alpha: 1
                    }
                }
            }],
            clipList: {
                format: 1,
                clips: [{
                    startGlyphID: 7,
                    endGlyphID: 7,
                    clipBox: {
                        format: 2,
                        xMin: -10,
                        yMin: -20,
                        xMax: 100,
                        yMax: 120,
                        varIndexBase: 0
                    }
                }]
            },
            varIndexMap: {
                map: [
                    { outerIndex: 0, innerIndex: 0 },
                    { outerIndex: 0, innerIndex: 1 },
                    { outerIndex: 0, innerIndex: 2 },
                    { outerIndex: 0, innerIndex: 3 }
                ]
            },
            varStore: {
                format: 1,
                variationRegions: [{
                    regionAxes: [{ startCoord: 0, peakCoord: 1, endCoord: 1 }]
                }],
                itemVariationSubtables: [{
                    regionIndexes: [0],
                    deltaSets: [[1], [2], [3], [4]]
                }]
            }
        };

        const encoded = colr.make(obj).encode();
        const parsed = colr.parse(new DataView(new Uint8Array(encoded).buffer), 0);

        assert.equal(parsed.version, 1);
        assert.deepEqual(parsed.baseGlyphPaintRecords, obj.baseGlyphPaintRecords);
        assert.deepEqual(parsed.clipList, obj.clipList);
        assert.deepEqual(parsed.varIndexMap.map, obj.varIndexMap.map);
        assert.deepEqual(parsed.varStore, obj.varStore);
        assert.deepEqual(
            colr.getClipBoxAtCoords(
                parsed,
                7,
                { axes: [{ tag: 'wght', minValue: 100, defaultValue: 400, maxValue: 900 }] },
                { wght: 900 }
            ),
            { xMin: -9, yMin: -18, xMax: 103, yMax: 124 }
        );
    });
});
