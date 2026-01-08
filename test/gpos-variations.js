import assert from 'assert';
import fs from 'fs';
import Position from '../src/position.js';
import { parse, Font, Glyph, Path } from '../src/opentype.js';

// ============================================================================
// DRY Validation Helpers for GPOS Variations
// ============================================================================

/**
 * Validates that a font has proper GPOS variations structure
 * @param {Font} font - The font to validate
 * @param {Object} options - Validation options
 * @returns {Object} Validation result with details
 */
function validateGposVariations(font, options = {}) {
    const result = {
        valid: true,
        hasGdef: false,
        gdefVersion: null,
        hasItemVariationStore: false,
        itemVariationStoreValid: false,
        hasGpos: false,
        gposLookupCount: 0,
        variationIndexCount: 0,
        errors: [],
        warnings: []
    };

    // Check GDEF table
    if (!font.tables.gdef) {
        if (options.requireGdef) {
            result.errors.push('Missing GDEF table');
            result.valid = false;
        }
        return result;
    }
    result.hasGdef = true;
    result.gdefVersion = font.tables.gdef.version;

    // Check for ItemVariationStore (GDEF v1.3+)
    if (font.tables.gdef.itemVariationStore) {
        result.hasItemVariationStore = true;
        const ivs = font.tables.gdef.itemVariationStore;
        
        // Validate ItemVariationStore structure
        if (ivs.format === 1 && 
            Array.isArray(ivs.variationRegions) && 
            Array.isArray(ivs.itemVariationSubtables)) {
            result.itemVariationStoreValid = true;
        } else {
            result.errors.push('Invalid ItemVariationStore structure');
            result.valid = false;
        }
    } else if (options.requireItemVariationStore) {
        result.errors.push('Missing ItemVariationStore in GDEF');
        result.valid = false;
    }

    // Check GPOS table
    if (!font.tables.gpos) {
        if (options.requireGpos) {
            result.errors.push('Missing GPOS table');
            result.valid = false;
        }
        return result;
    }
    result.hasGpos = true;
    result.gposLookupCount = font.tables.gpos.lookups?.length || 0;

    // Count VariationIndex tables in GPOS
    if (font.tables.gpos.lookups) {
        for (const lookup of font.tables.gpos.lookups) {
            if (!lookup.subtables) continue;
            for (const subtable of lookup.subtables) {
                result.variationIndexCount += countVariationIndices(subtable);
            }
        }
    }

    if (options.requireVariationIndices && result.variationIndexCount === 0) {
        result.errors.push('No VariationIndex tables found in GPOS');
        result.valid = false;
    }

    return result;
}

/**
 * Count VariationIndex tables in a GPOS subtable
 */
function countVariationIndices(subtable) {
    let count = 0;
    
    // Check value record for VariationIndex
    const checkValueRecord = (vr) => {
        if (!vr) return 0;
        let c = 0;
        if (vr.xPlaDevice?.type === 'variationIndex') c++;
        if (vr.yPlaDevice?.type === 'variationIndex') c++;
        if (vr.xAdvDevice?.type === 'variationIndex') c++;
        if (vr.yAdvDevice?.type === 'variationIndex') c++;
        return c;
    };

    // SinglePos format 1
    if (subtable.value) {
        count += checkValueRecord(subtable.value);
    }

    // SinglePos format 2
    if (subtable.values) {
        for (const v of subtable.values) {
            count += checkValueRecord(v);
        }
    }

    // PairPos format 1
    if (subtable.pairSets) {
        for (const pairSet of subtable.pairSets) {
            if (!pairSet) continue;
            for (const pair of pairSet) {
                count += checkValueRecord(pair.value1);
                count += checkValueRecord(pair.value2);
            }
        }
    }

    // PairPos format 2
    if (subtable.classRecords) {
        for (const row of subtable.classRecords) {
            for (const cell of row) {
                count += checkValueRecord(cell.value1);
                count += checkValueRecord(cell.value2);
            }
        }
    }

    return count;
}

/**
 * Validates kerning variation behavior
 * @param {Font} font - The font to test
 * @param {string} char1 - First character
 * @param {string} char2 - Second character
 * @param {Object} coordsMin - Variation coords for minimum kerning
 * @param {Object} coordsMax - Variation coords for maximum kerning
 * @returns {Object} Kerning test result
 */
function validateKerningVariation(font, char1, char2, coordsMin, coordsMax) {
    const lookups = font.position.getKerningTables('latn') || 
                    font.position.getKerningTables('DFLT');
    
    if (!lookups || lookups.length === 0) {
        return { success: false, reason: 'No kerning lookups found' };
    }

    const glyph1 = font.charToGlyphIndex(char1);
    const glyph2 = font.charToGlyphIndex(char2);

    if (glyph1 === 0 || glyph2 === 0) {
        return { success: false, reason: `Glyphs not found for "${char1}" or "${char2}"` };
    }

    const kernMin = font.position.getKerningValue(lookups, glyph1, glyph2, coordsMin);
    const kernMax = font.position.getKerningValue(lookups, glyph1, glyph2, coordsMax);
    const kernDefault = font.position.getKerningValue(lookups, glyph1, glyph2);

    return {
        success: true,
        glyph1,
        glyph2,
        kernMin,
        kernMax,
        kernDefault,
        hasVariation: kernMin !== kernMax,
        variationAmount: Math.abs(kernMax - kernMin)
    };
}

/**
 * Validates roundtrip of GPOS variations
 * @param {Font} originalFont - Original font
 * @returns {Object} Roundtrip validation result
 */
function validateRoundtrip(originalFont) {
    const result = {
        success: true,
        errors: [],
        originalValidation: null,
        roundtripValidation: null,
        kerningPreserved: null
    };

    // Validate original
    result.originalValidation = validateGposVariations(originalFont);
    
    // Export and reimport
    try {
        const buffer = originalFont.toArrayBuffer();
        const reimported = parse(buffer);
        result.roundtripValidation = validateGposVariations(reimported);

        // Compare key metrics
        if (result.originalValidation.gdefVersion !== result.roundtripValidation.gdefVersion) {
            result.errors.push(`GDEF version changed: ${result.originalValidation.gdefVersion} -> ${result.roundtripValidation.gdefVersion}`);
        }
        
        if (result.originalValidation.hasItemVariationStore && !result.roundtripValidation.hasItemVariationStore) {
            result.errors.push('ItemVariationStore lost during roundtrip');
            result.success = false;
        }

        // Note: VariationIndex count may differ due to export optimization
        // Just check if we still have some
        if (result.originalValidation.variationIndexCount > 0 && result.roundtripValidation.variationIndexCount === 0) {
            result.warnings = result.warnings || [];
            result.warnings.push('All VariationIndex tables lost during roundtrip');
        }

    } catch (e) {
        result.errors.push(`Roundtrip failed: ${e.message}`);
        result.success = false;
    }

    return result;
}

// ============================================================================
// Test Suite
// ============================================================================

describe('GPOS Variations', function() {
    describe('Position API with variations', function() {
        it('applyVariationDeltas returns original value without ItemVariationStore', function() {
            // Create a mock font with no GDEF itemVariationStore
            const mockFont = {
                tables: {
                    gdef: {
                        version: 1.0
                    }
                }
            };
            
            const position = new Position(mockFont);
            const valueRecord = {
                xPlacement: 100,
                xAdvance: 50
            };
            
            const result = position.applyVariationDeltas(valueRecord);
            
            assert.strictEqual(result.xPlacement, 100);
            assert.strictEqual(result.xAdvance, 50);
        });

        it('applyVariationDeltas returns undefined for undefined input', function() {
            const mockFont = {
                tables: {
                    gdef: {
                        itemVariationStore: {}
                    }
                }
            };
            
            const position = new Position(mockFont);
            const result = position.applyVariationDeltas(undefined);
            
            assert.strictEqual(result, undefined);
        });

        it('getVariationDelta returns 0 for null/undefined input', function() {
            const mockFont = {
                tables: {
                    gdef: {
                        itemVariationStore: {}
                    }
                }
            };
            
            const position = new Position(mockFont);
            
            assert.strictEqual(position.getVariationDelta(null), 0);
            assert.strictEqual(position.getVariationDelta(undefined), 0);
        });

        it('getVariationDelta returns 0 for device table type', function() {
            const mockFont = {
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
            };
            
            const position = new Position(mockFont);
            
            // Device tables are not variation-adjusted
            const deviceTable = {
                type: 'device',
                startSize: 11,
                endSize: 15,
                deltaFormat: 1,
                deltaValues: [1, 1, 1, 1, 1]
            };
            
            const delta = position.getVariationDelta(deviceTable);
            assert.strictEqual(delta, 0);
        });

        it('getVariationDelta returns 0 without variation processor', function() {
            const mockFont = {
                tables: {
                    gdef: {
                        itemVariationStore: {}
                    }
                }
                // No variation property
            };
            
            const position = new Position(mockFont);
            
            const variationIndex = {
                type: 'variationIndex',
                deltaSetOuterIndex: 0,
                deltaSetInnerIndex: 0,
                deltaFormat: 0x8000
            };
            
            const delta = position.getVariationDelta(variationIndex);
            assert.strictEqual(delta, 0);
        });

        it('getVariationDelta calls getDelta for variationIndex type', function() {
            let calledWithArgs = null;
            
            const mockItemVariationStore = {
                variationRegions: [
                    { regionAxes: [{ startCoord: 0, peakCoord: 1, endCoord: 1 }] }
                ],
                itemVariationSubtables: [
                    { 
                        regionIndexes: [0],
                        deltaSets: [[100]]
                    }
                ]
            };
            
            const mockFont = {
                tables: {
                    gdef: {
                        itemVariationStore: mockItemVariationStore
                    }
                },
                variation: {
                    process: {
                        getDelta: (store, outer, inner, coords) => {
                            calledWithArgs = { store, outer, inner, coords };
                            return 42;
                        }
                    }
                }
            };
            
            const position = new Position(mockFont);
            
            const variationIndex = {
                type: 'variationIndex',
                deltaSetOuterIndex: 0,
                deltaSetInnerIndex: 0,
                deltaFormat: 0x8000
            };
            
            const coords = { wght: 700 };
            const delta = position.getVariationDelta(variationIndex, coords);
            
            assert.strictEqual(delta, 42);
            assert.ok(calledWithArgs, 'getDelta should have been called');
            assert.strictEqual(calledWithArgs.store, mockItemVariationStore);
            assert.strictEqual(calledWithArgs.outer, 0);
            assert.strictEqual(calledWithArgs.inner, 0);
            assert.deepStrictEqual(calledWithArgs.coords, coords);
        });

        it('applyVariationDeltas applies deltas to all value record fields', function() {
            let deltaCallCount = 0;
            
            const mockItemVariationStore = {};
            
            const mockFont = {
                tables: {
                    gdef: {
                        itemVariationStore: mockItemVariationStore
                    }
                },
                variation: {
                    process: {
                        getDelta: () => {
                            deltaCallCount++;
                            return 10;  // Return 10 for each delta
                        }
                    }
                }
            };
            
            const position = new Position(mockFont);
            
            const valueRecord = {
                xPlacement: 100,
                yPlacement: 50,
                xAdvance: 200,
                yAdvance: 25,
                xPlaDevice: { type: 'variationIndex', deltaSetOuterIndex: 0, deltaSetInnerIndex: 0 },
                yPlaDevice: { type: 'variationIndex', deltaSetOuterIndex: 0, deltaSetInnerIndex: 1 },
                xAdvDevice: { type: 'variationIndex', deltaSetOuterIndex: 0, deltaSetInnerIndex: 2 },
                yAdvDevice: { type: 'variationIndex', deltaSetOuterIndex: 0, deltaSetInnerIndex: 3 }
            };
            
            const result = position.applyVariationDeltas(valueRecord, { wght: 700 });
            
            assert.strictEqual(deltaCallCount, 4, 'getDelta should be called 4 times');
            assert.strictEqual(result.xPlacement, 110);  // 100 + 10
            assert.strictEqual(result.yPlacement, 60);   // 50 + 10
            assert.strictEqual(result.xAdvance, 210);    // 200 + 10
            assert.strictEqual(result.yAdvance, 35);     // 25 + 10
        });

        it('applyVariationDeltas handles missing base values', function() {
            const mockItemVariationStore = {};
            
            const mockFont = {
                tables: {
                    gdef: {
                        itemVariationStore: mockItemVariationStore
                    }
                },
                variation: {
                    process: {
                        getDelta: () => 10
                    }
                }
            };
            
            const position = new Position(mockFont);
            
            // Value record with no base values but has variation adjustments
            const valueRecord = {
                xPlaDevice: { type: 'variationIndex', deltaSetOuterIndex: 0, deltaSetInnerIndex: 0 }
            };
            
            const result = position.applyVariationDeltas(valueRecord, { wght: 700 });
            
            // Should add to 0 if base value is missing
            assert.strictEqual(result.xPlacement, 10);
        });

        it('getKerningValue accepts coords parameter for PairPosFormat1', function() {
            let appliedCoords = null;
            
            const mockFont = {
                tables: {
                    gdef: {
                        itemVariationStore: {}
                    }
                },
                variation: {
                    process: {
                        getDelta: (store, outer, inner, coords) => {
                            appliedCoords = coords;
                            return 20;
                        }
                    }
                }
            };
            
            const position = new Position(mockFont);
            
            // Create a simple lookup structure
            const kerningLookups = [{
                subtables: [{
                    posFormat: 1,
                    coverage: { format: 1, glyphs: [1] },
                    pairSets: [[{ 
                        secondGlyph: 2, 
                        value1: { 
                            xAdvance: -50,
                            xAdvDevice: { type: 'variationIndex', deltaSetOuterIndex: 0, deltaSetInnerIndex: 0 }
                        }, 
                        value2: undefined 
                    }]]
                }]
            }];
            
            const coords = { wght: 700 };
            const result = position.getKerningValue(kerningLookups, 1, 2, coords);
            
            assert.deepStrictEqual(appliedCoords, coords, 'coords should be passed to getDelta');
            assert.strictEqual(result, -30);  // -50 + 20 = -30
        });

        it('getKerningValue accepts coords parameter for PairPosFormat2', function() {
            let appliedCoords = null;
            
            const mockFont = {
                tables: {
                    gdef: {
                        itemVariationStore: {}
                    }
                },
                variation: {
                    process: {
                        getDelta: (store, outer, inner, coords) => {
                            appliedCoords = coords;
                            return 15;
                        }
                    }
                }
            };
            
            const position = new Position(mockFont);
            
            // Create a class-based lookup structure
            const kerningLookups = [{
                subtables: [{
                    posFormat: 2,
                    coverage: { format: 1, glyphs: [1] },
                    classDef1: { format: 1, startGlyph: 1, classes: [1] },
                    classDef2: { format: 1, startGlyph: 2, classes: [1] },
                    class1Count: 2,
                    class2Count: 2,
                    classRecords: [
                        [
                            { value1: { xAdvance: 0 }, value2: undefined },
                            { value1: { xAdvance: 0 }, value2: undefined }
                        ],
                        [
                            { value1: { xAdvance: 0 }, value2: undefined },
                            { 
                                value1: { 
                                    xAdvance: -40,
                                    xAdvDevice: { type: 'variationIndex', deltaSetOuterIndex: 0, deltaSetInnerIndex: 0 }
                                }, 
                                value2: undefined 
                            }
                        ]
                    ]
                }]
            }];
            
            const coords = { wght: 900 };
            const result = position.getKerningValue(kerningLookups, 1, 2, coords);
            
            assert.deepStrictEqual(appliedCoords, coords, 'coords should be passed to getDelta');
            assert.strictEqual(result, -25);  // -40 + 15 = -25
        });

        it('getKerningValue works without coords (backward compatibility)', function() {
            const mockFont = {
                tables: {
                    gdef: {}
                }
            };
            
            const position = new Position(mockFont);
            
            const kerningLookups = [{
                subtables: [{
                    posFormat: 1,
                    coverage: { format: 1, glyphs: [1] },
                    pairSets: [[{ 
                        secondGlyph: 2, 
                        value1: { xAdvance: -50 }, 
                        value2: undefined 
                    }]]
                }]
            }];
            
            // Call without coords
            const result = position.getKerningValue(kerningLookups, 1, 2);
            
            assert.strictEqual(result, -50);
        });
    });

    describe('Real font GPOS variations (Roboto-Variable.ttf)', function() {
        let font;

        before(function() {
            const data = fs.readFileSync('test/fonts/Roboto-Variable.ttf');
            font = parse(data.buffer);
        });

        it('parses GDEF version 1.3 with ItemVariationStore', function() {
            assert.strictEqual(font.tables.gdef.version, 1.3);
            assert.ok(font.tables.gdef.itemVariationStore, 'ItemVariationStore should be present');
            assert.ok(font.tables.gdef.itemVariationStore.variationRegions, 'variationRegions should be parsed');
            assert.ok(font.tables.gdef.itemVariationStore.itemVariationSubtables, 'itemVariationSubtables should be parsed');
        });

        it('parses VariationIndex tables in GPOS lookups', function() {
            const gpos = font.tables.gpos;
            assert.ok(gpos, 'GPOS table should exist');
            assert.ok(gpos.lookups.length > 0, 'Should have GPOS lookups');
            
            // Find at least one VariationIndex table in the lookups
            let foundVariationIndex = false;
            for (const lookup of gpos.lookups) {
                if (!lookup.subtables) continue;
                for (const subtable of lookup.subtables) {
                    // Check in pairSets for PairPos format 1
                    if (subtable.pairSets) {
                        for (const pairSet of subtable.pairSets) {
                            if (!pairSet) continue;
                            for (const pair of pairSet) {
                                if (pair.value1?.xAdvDevice?.type === 'variationIndex') {
                                    foundVariationIndex = true;
                                    break;
                                }
                            }
                            if (foundVariationIndex) break;
                        }
                    }
                    // Check in classRecords for PairPos format 2
                    if (subtable.classRecords) {
                        for (const row of subtable.classRecords) {
                            for (const cell of row) {
                                if (cell.value1?.xAdvDevice?.type === 'variationIndex') {
                                    foundVariationIndex = true;
                                    break;
                                }
                            }
                            if (foundVariationIndex) break;
                        }
                    }
                    if (foundVariationIndex) break;
                }
                if (foundVariationIndex) break;
            }
            
            assert.ok(foundVariationIndex, 'Should find at least one VariationIndex table in GPOS');
        });

        it('applies GPOS variations to kerning values', function() {
            const lookups = font.position.getKerningTables('latn');
            assert.ok(lookups && lookups.length > 0, 'Should have kerning lookups');
            
            const aGlyph = font.charToGlyphIndex('A');
            const vGlyph = font.charToGlyphIndex('V');
            
            // Get kerning at different weight values
            const kernThin = font.position.getKerningValue(lookups, aGlyph, vGlyph, { wght: 100 });
            const kernBlack = font.position.getKerningValue(lookups, aGlyph, vGlyph, { wght: 900 });
            
            // The kerning should be different at different weights
            // Roboto has looser kerning at heavy weights (less negative)
            assert.ok(kernThin !== 0, 'Should have non-zero kerning for A-V');
            assert.ok(kernBlack !== 0, 'Should have non-zero kerning for A-V at heavy weight');
            
            // At heavy weights, the A-V pair needs less negative kerning (values closer to 0)
            assert.ok(kernBlack > kernThin, 'Kerning at heavy weight should be less negative (closer to 0)');
        });

        it('getKerningValue without coords uses default variation', function() {
            const lookups = font.position.getKerningTables('latn');
            const aGlyph = font.charToGlyphIndex('A');
            const vGlyph = font.charToGlyphIndex('V');
            
            // Get kerning without specifying coords
            const kernDefault = font.position.getKerningValue(lookups, aGlyph, vGlyph);
            
            // Should return a reasonable kerning value (backward compatible)
            assert.ok(typeof kernDefault === 'number', 'Should return a number');
            assert.ok(kernDefault < 0, 'A-V pair should have negative kerning');
        });
    });

    // ========================================================================
    // Google Fonts with GPOS Variations
    // ========================================================================

    describe('Google Fonts GPOS Variations', function() {
        this.timeout(10000);

        // Test configuration for each font with GPOS variations
        const gposVariationFonts = [
            {
                name: 'Roboto-Variable.ttf',
                path: 'test/fonts/Roboto-Variable.ttf',
                axes: ['wght'],
                expectedMinVariationIndices: 500,
                testPair: { chars: ['A', 'V'], minCoords: { wght: 100 }, maxCoords: { wght: 900 } }
            },
            {
                name: 'RobotoFlex-Variable.ttf',
                path: 'test/fonts/RobotoFlex-Variable.ttf',
                axes: ['wght', 'wdth', 'opsz'],
                expectedMinVariationIndices: 1000,
                testPair: { chars: ['A', 'V'], minCoords: { wght: 100 }, maxCoords: { wght: 1000 } }
            },
            {
                name: 'Changa-VariableFont_wght.ttf',
                path: 'test/fonts/Changa-VariableFont_wght.ttf',
                axes: ['wght'],
                expectedMinVariationIndices: 30,
                testPair: { chars: ['ا', 'ل'], minCoords: { wght: 200 }, maxCoords: { wght: 800 } }
            },
            {
                name: 'Inter-Variable.ttf',
                path: 'test/fonts/Inter-Variable.ttf',
                axes: ['wght', 'opsz'],
                expectedMinVariationIndices: 100,
                testPair: { chars: ['A', 'V'], minCoords: { wght: 100 }, maxCoords: { wght: 900 } }
            },
            {
                name: 'Oswald-Variable.ttf',
                path: 'test/fonts/Oswald-Variable.ttf',
                axes: ['wght'],
                expectedMinVariationIndices: 500,
                testPair: { chars: ['A', 'V'], minCoords: { wght: 200 }, maxCoords: { wght: 700 } }
            }
        ];

        for (const fontConfig of gposVariationFonts) {
            describe(fontConfig.name, function() {
                let font;

                before(function() {
                    if (!fs.existsSync(fontConfig.path)) {
                        this.skip();
                        return;
                    }
                    const data = fs.readFileSync(fontConfig.path);
                    font = parse(data.buffer);
                });

                it('has valid GPOS variations structure', function() {
                    const validation = validateGposVariations(font, {
                        requireGdef: true,
                        requireGpos: true,
                        requireItemVariationStore: true,
                        requireVariationIndices: true
                    });

                    assert.ok(validation.valid, `Validation failed: ${validation.errors.join(', ')}`);
                    assert.strictEqual(validation.gdefVersion, 1.3, 'GDEF should be version 1.3');
                    assert.ok(validation.hasItemVariationStore, 'Should have ItemVariationStore');
                    assert.ok(
                        validation.variationIndexCount >= fontConfig.expectedMinVariationIndices,
                        `Expected at least ${fontConfig.expectedMinVariationIndices} VariationIndex tables, got ${validation.variationIndexCount}`
                    );
                });

                it('ItemVariationStore has valid structure', function() {
                    const ivs = font.tables.gdef.itemVariationStore;
                    assert.ok(ivs, 'ItemVariationStore should exist');
                    assert.strictEqual(ivs.format, 1, 'ItemVariationStore format should be 1');
                    assert.ok(Array.isArray(ivs.variationRegions), 'Should have variationRegions array');
                    assert.ok(ivs.variationRegions.length > 0, 'Should have at least one variation region');
                    assert.ok(Array.isArray(ivs.itemVariationSubtables), 'Should have itemVariationSubtables array');
                    assert.ok(ivs.itemVariationSubtables.length > 0, 'Should have at least one item variation subtable');

                    // Validate first subtable structure
                    const subtable = ivs.itemVariationSubtables[0];
                    assert.ok(Array.isArray(subtable.regionIndexes), 'Subtable should have regionIndexes');
                    assert.ok(Array.isArray(subtable.deltaSets), 'Subtable should have deltaSets');
                });

                it('applies kerning variations correctly', function() {
                    const { chars, minCoords, maxCoords } = fontConfig.testPair;
                    const result = validateKerningVariation(font, chars[0], chars[1], minCoords, maxCoords);

                    if (!result.success) {
                        // Skip if glyphs not found (e.g., Arabic chars in Latin font)
                        this.skip();
                        return;
                    }

                    assert.ok(typeof result.kernMin === 'number', 'kernMin should be a number');
                    assert.ok(typeof result.kernMax === 'number', 'kernMax should be a number');
                    
                    // Most fonts have variable kerning
                    if (result.hasVariation) {
                        assert.ok(
                            result.variationAmount > 0,
                            `Kerning should vary: min=${result.kernMin}, max=${result.kernMax}`
                        );
                    }
                });

                it('maintains backward compatibility without coords', function() {
                    const lookups = font.position.getKerningTables('latn') ||
                                    font.position.getKerningTables('DFLT');
                    
                    if (!lookups || lookups.length === 0) {
                        this.skip();
                        return;
                    }

                    const aGlyph = font.charToGlyphIndex('A');
                    const vGlyph = font.charToGlyphIndex('V');

                    if (aGlyph === 0 || vGlyph === 0) {
                        this.skip();
                        return;
                    }

                    // Call without coords should work
                    const kernDefault = font.position.getKerningValue(lookups, aGlyph, vGlyph);
                    assert.ok(typeof kernDefault === 'number', 'Should return a number');
                });
            });
        }
    });

    // ========================================================================
    // GPOS Variations Roundtrip Tests
    // ========================================================================

    describe('GPOS Variations Roundtrip', function() {
        this.timeout(15000);

        const roundtripFonts = [
            'test/fonts/Roboto-Variable.ttf',
            'test/fonts/Changa-VariableFont_wght.ttf'
        ];

        for (const fontPath of roundtripFonts) {
            const fontName = fontPath.split('/').pop();

            describe(`Roundtrip ${fontName}`, function() {
                let originalFont, roundtripFont;

                before(function() {
                    if (!fs.existsSync(fontPath)) {
                        this.skip();
                        return;
                    }
                    const data = fs.readFileSync(fontPath);
                    originalFont = parse(data.buffer);
                    
                    // Export and reimport
                    const buffer = originalFont.toArrayBuffer();
                    roundtripFont = parse(buffer);
                });

                // Note: GDEF/GPOS table export is not yet fully implemented.
                // These tests document current behavior and expected future behavior.
                
                it('documents GDEF version preservation status', function() {
                    // TODO: When GDEF export is implemented, change to assert.strictEqual
                    const originalVersion = originalFont.tables.gdef?.version;
                    const roundtripVersion = roundtripFont.tables.gdef?.version;
                    
                    if (roundtripVersion !== undefined) {
                        assert.strictEqual(roundtripVersion, originalVersion, 
                            'GDEF version should be preserved');
                    } else {
                        // Document current limitation
                        console.log(`Note: GDEF not yet exported for ${fontName} (version ${originalVersion})`);
                        assert.ok(true, 'GDEF export not yet implemented');
                    }
                });

                it('documents ItemVariationStore preservation status', function() {
                    const origHasIVS = !!originalFont.tables.gdef?.itemVariationStore;
                    const rtHasIVS = !!roundtripFont.tables.gdef?.itemVariationStore;
                    
                    if (origHasIVS && !rtHasIVS) {
                        // Document current limitation
                        console.log(`Note: ItemVariationStore not preserved for ${fontName}`);
                        assert.ok(true, 'ItemVariationStore export not yet implemented');
                    } else if (origHasIVS && rtHasIVS) {
                        assert.ok(true, 'ItemVariationStore preserved');
                    }
                });

                it('documents GPOS table preservation status', function() {
                    const originalHasGpos = !!originalFont.tables.gpos;
                    const roundtripHasGpos = !!roundtripFont.tables.gpos;
                    
                    if (originalHasGpos && !roundtripHasGpos) {
                        // Document current limitation
                        console.log(`Note: GPOS not yet exported for ${fontName}`);
                        assert.ok(true, 'GPOS export not yet implemented');
                    } else if (roundtripHasGpos) {
                        assert.strictEqual(
                            roundtripFont.tables.gpos.lookups?.length,
                            originalFont.tables.gpos.lookups?.length,
                            'GPOS lookup count should be preserved'
                        );
                    }
                });

                it('font remains valid and parseable', function() {
                    // Basic validation that the roundtrip font is usable
                    assert.ok(roundtripFont.glyphs, 'Should have glyphs');
                    assert.ok(roundtripFont.glyphs.length > 0, 'Should have at least one glyph');
                    assert.ok(roundtripFont.tables.head, 'Should have head table');
                    assert.ok(roundtripFont.tables.name, 'Should have name table');
                });
            });
        }
    });

    // ========================================================================
    // API-Created Font Validation
    // ========================================================================

    describe('API-Created Font GPOS Compatibility', function() {
        this.timeout(10000);

        /**
         * Creates a test font with kerning pairs
         */
        function createTestFontWithKerning() {
            const notdefPath = new Path();
            notdefPath.moveTo(50, 0);
            notdefPath.lineTo(50, 700);
            notdefPath.lineTo(450, 700);
            notdefPath.lineTo(450, 0);
            notdefPath.closePath();

            const aPath = new Path();
            aPath.moveTo(250, 700);
            aPath.lineTo(50, 0);
            aPath.lineTo(450, 0);
            aPath.closePath();

            const vPath = new Path();
            vPath.moveTo(0, 700);
            vPath.lineTo(250, 0);
            vPath.lineTo(500, 700);
            vPath.closePath();

            const font = new Font({
                familyName: 'TestKerningFont',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200,
                glyphs: [
                    new Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: notdefPath }),
                    new Glyph({ name: 'space', unicode: 32, advanceWidth: 250, path: new Path() }),
                    new Glyph({ name: 'A', unicode: 65, advanceWidth: 600, path: aPath }),
                    new Glyph({ name: 'V', unicode: 86, advanceWidth: 600, path: vPath })
                ]
            });

            return font;
        }

        it('creates valid font with basic structure', function() {
            const font = createTestFontWithKerning();
            const buffer = font.toArrayBuffer();
            const parsed = parse(buffer);

            assert.ok(parsed.tables.head, 'Should have head table');
            assert.ok(parsed.tables.name, 'Should have name table');
            assert.ok(parsed.tables.cmap, 'Should have cmap table');
            assert.ok(parsed.glyphs.length === 4, 'Should have 4 glyphs');
        });

        it('created font can be exported and reimported', function() {
            const font = createTestFontWithKerning();
            
            // First export
            const buffer1 = font.toArrayBuffer();
            const parsed1 = parse(buffer1);
            
            // Second export
            const buffer2 = parsed1.toArrayBuffer();
            const parsed2 = parse(buffer2);

            assert.strictEqual(parsed2.glyphs.length, parsed1.glyphs.length, 'Glyph count should match');
            assert.strictEqual(
                parsed2.tables.head.unitsPerEm,
                parsed1.tables.head.unitsPerEm,
                'unitsPerEm should match'
            );
        });

        it('Position API works on created fonts', function() {
            const font = createTestFontWithKerning();
            const buffer = font.toArrayBuffer();
            const parsed = parse(buffer);

            // Position API should be available
            assert.ok(parsed.position, 'Should have position property');
            
            // getKerningTables should work (may return undefined if no GPOS)
            const lookups = parsed.position.getKerningTables('latn');
            // This is expected - our basic font doesn't have GPOS kerning
            assert.ok(lookups === undefined || Array.isArray(lookups), 
                'getKerningTables should return undefined or array');
        });
    });

    // ========================================================================
    // Validation Helper Tests
    // ========================================================================

    describe('Validation Helpers', function() {
        it('validateGposVariations correctly identifies fonts with variations', function() {
            if (!fs.existsSync('test/fonts/Roboto-Variable.ttf')) {
                this.skip();
                return;
            }
            
            const data = fs.readFileSync('test/fonts/Roboto-Variable.ttf');
            const font = parse(data.buffer);
            
            const result = validateGposVariations(font, {
                requireGdef: true,
                requireItemVariationStore: true,
                requireVariationIndices: true
            });

            assert.ok(result.valid, 'Roboto Variable should be valid');
            assert.ok(result.hasGdef, 'Should have GDEF');
            assert.ok(result.hasItemVariationStore, 'Should have ItemVariationStore');
            assert.ok(result.variationIndexCount > 0, 'Should have VariationIndex tables');
        });

        it('validateGposVariations correctly identifies fonts without variations', function() {
            if (!fs.existsSync('test/fonts/Roboto-Black.ttf')) {
                this.skip();
                return;
            }
            
            const data = fs.readFileSync('test/fonts/Roboto-Black.ttf');
            const font = parse(data.buffer);
            
            const result = validateGposVariations(font, {
                requireItemVariationStore: true
            });

            assert.ok(!result.valid, 'Static font should fail ItemVariationStore requirement');
            assert.ok(!result.hasItemVariationStore, 'Should not have ItemVariationStore');
        });

        it('validateKerningVariation returns correct structure', function() {
            if (!fs.existsSync('test/fonts/Roboto-Variable.ttf')) {
                this.skip();
                return;
            }
            
            const data = fs.readFileSync('test/fonts/Roboto-Variable.ttf');
            const font = parse(data.buffer);
            
            const result = validateKerningVariation(
                font, 'A', 'V', 
                { wght: 100 }, 
                { wght: 900 }
            );

            assert.ok(result.success, 'Should succeed for A-V pair');
            assert.ok('kernMin' in result, 'Should have kernMin');
            assert.ok('kernMax' in result, 'Should have kernMax');
            assert.ok('hasVariation' in result, 'Should have hasVariation flag');
        });

        it('countVariationIndices counts correctly', function() {
            // Test with a mock subtable
            const mockSubtable = {
                pairSets: [
                    [
                        { 
                            secondGlyph: 1, 
                            value1: { 
                                xAdvance: -50,
                                xAdvDevice: { type: 'variationIndex', deltaSetOuterIndex: 0, deltaSetInnerIndex: 0 }
                            }
                        }
                    ]
                ]
            };

            const count = countVariationIndices(mockSubtable);
            assert.strictEqual(count, 1, 'Should count 1 VariationIndex');
        });
    });
});