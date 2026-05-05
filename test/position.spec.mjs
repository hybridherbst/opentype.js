import assert from 'assert';
import Position from '../src/position.mjs';

describe('position.js', function() {
    describe('variation deltas', function() {
        it('returns the original value record when no ItemVariationStore exists', function() {
            const position = new Position({ tables: { gdef: { version: 1 } } });
            const valueRecord = { xPlacement: 100, xAdvance: 50 };

            assert.deepEqual(position.applyVariationDeltas(valueRecord), valueRecord);
        });

        it('returns zero for device tables and empty variation indexes', function() {
            const position = new Position({
                tables: {
                    gdef: {
                        itemVariationStore: {
                            variationRegions: [],
                            itemVariationSubtables: []
                        }
                    }
                },
                variation: {
                    process: {
                        getDelta: () => 42
                    }
                }
            });

            assert.equal(position.getVariationDelta(null), 0);
            assert.equal(position.getVariationDelta(undefined), 0);
            assert.equal(position.getVariationDelta({
                type: 'device',
                startSize: 11,
                endSize: 15,
                deltaFormat: 1,
                deltaValues: [1, 1, 1, 1, 1]
            }), 0);
        });

        it('passes VariationIndex entries through the font variation processor', function() {
            let calledWithArgs = null;
            const itemVariationStore = {
                variationRegions: [
                    { regionAxes: [{ startCoord: 0, peakCoord: 1, endCoord: 1 }] }
                ],
                itemVariationSubtables: [
                    { regionIndexes: [0], deltaSets: [[100]] }
                ]
            };
            const position = new Position({
                tables: {
                    gdef: { itemVariationStore }
                },
                variation: {
                    process: {
                        getDelta: (store, outer, inner, coords) => {
                            calledWithArgs = { store, outer, inner, coords };
                            return 42;
                        }
                    }
                }
            });
            const coords = { wght: 700 };

            assert.equal(position.getVariationDelta({
                type: 'variationIndex',
                deltaSetOuterIndex: 0,
                deltaSetInnerIndex: 0
            }, coords), 42);
            assert.deepEqual(calledWithArgs, {
                store: itemVariationStore,
                outer: 0,
                inner: 0,
                coords
            });
        });

        it('applies variation deltas to all value-record fields', function() {
            let deltaCallCount = 0;
            const position = new Position({
                tables: {
                    gdef: { itemVariationStore: {} }
                },
                variation: {
                    process: {
                        getDelta: () => {
                            deltaCallCount++;
                            return 10;
                        }
                    }
                }
            });

            const result = position.applyVariationDeltas({
                xPlacement: 100,
                yPlacement: 50,
                xAdvance: 200,
                yAdvance: 25,
                xPlaDevice: { type: 'variationIndex', deltaSetOuterIndex: 0, deltaSetInnerIndex: 0 },
                yPlaDevice: { type: 'variationIndex', deltaSetOuterIndex: 0, deltaSetInnerIndex: 1 },
                xAdvDevice: { type: 'variationIndex', deltaSetOuterIndex: 0, deltaSetInnerIndex: 2 },
                yAdvDevice: { type: 'variationIndex', deltaSetOuterIndex: 0, deltaSetInnerIndex: 3 }
            }, { wght: 700 });

            assert.equal(deltaCallCount, 4);
            assert.equal(result.xPlacement, 110);
            assert.equal(result.yPlacement, 60);
            assert.equal(result.xAdvance, 210);
            assert.equal(result.yAdvance, 35);
        });

        it('passes coordinates through PairPos format 1 kerning', function() {
            let appliedCoords = null;
            const position = new Position({
                tables: {
                    gdef: { itemVariationStore: {} }
                },
                variation: {
                    process: {
                        getDelta: (store, outer, inner, coords) => {
                            appliedCoords = coords;
                            return 20;
                        }
                    }
                }
            });
            const coords = { wght: 700 };
            const kerningLookups = [{
                subtables: [{
                    posFormat: 1,
                    coverage: { format: 1, glyphs: [1] },
                    pairSets: [[{
                        secondGlyph: 2,
                        value1: {
                            xAdvance: -50,
                            xAdvDevice: { type: 'variationIndex', deltaSetOuterIndex: 0, deltaSetInnerIndex: 0 }
                        }
                    }]]
                }]
            }];

            assert.equal(position.getKerningValue(kerningLookups, 1, 2, coords), -30);
            assert.deepEqual(appliedCoords, coords);
        });

        it('passes coordinates through PairPos format 2 kerning', function() {
            let appliedCoords = null;
            const position = new Position({
                tables: {
                    gdef: { itemVariationStore: {} }
                },
                variation: {
                    process: {
                        getDelta: (store, outer, inner, coords) => {
                            appliedCoords = coords;
                            return 15;
                        }
                    }
                }
            });
            const coords = { wght: 900 };
            const kerningLookups = [{
                subtables: [{
                    posFormat: 2,
                    coverage: { format: 1, glyphs: [1] },
                    classDef1: { format: 1, startGlyph: 1, classes: [1] },
                    classDef2: { format: 1, startGlyph: 2, classes: [1] },
                    classRecords: [
                        [{ value1: { xAdvance: 0 } }, { value1: { xAdvance: 0 } }],
                        [{ value1: { xAdvance: 0 } }, {
                            value1: {
                                xAdvance: -40,
                                xAdvDevice: { type: 'variationIndex', deltaSetOuterIndex: 0, deltaSetInnerIndex: 0 }
                            }
                        }]
                    ]
                }]
            }];

            assert.equal(position.getKerningValue(kerningLookups, 1, 2, coords), -25);
            assert.deepEqual(appliedCoords, coords);
        });
    });
});
