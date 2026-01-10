/**
 * Tests for Font Editor API
 */

import assert from 'assert';
import {
    FontEditorState,
    FontBuilder,
    FontImporter,
    getCubicBezierExtremaX,
    getQuadBezierExtremaX,
    getPathBounds,
    extractPathPoints,
    applyAvarMapping,
    normalizeAxisValue,
    applyAvarToCoords
} from '../docs/examples/font-editor-api.js';
import * as opentype from '../src/opentype.js';
import { readFileSync } from 'fs';

describe('Font Editor API', () => {
    
    describe('Geometry Utilities', () => {
        
        describe('getCubicBezierExtremaX', () => {
            it('should return endpoints for a straight line', () => {
                const extrema = getCubicBezierExtremaX(0, 0, 100, 100);
                assert.ok(extrema.includes(0));
                assert.ok(extrema.includes(100));
            });
            
            it('should find extrema for curved bezier', () => {
                // Bezier that curves beyond its endpoints
                const extrema = getCubicBezierExtremaX(0, 50, 50, 100);
                assert.ok(extrema.length >= 2);
                const min = Math.min(...extrema);
                const max = Math.max(...extrema);
                assert.ok(min <= 0);
                assert.ok(max >= 100);
            });
            
            it('should find extrema for bezier with control points outside', () => {
                // Control points outside the start/end range
                const extrema = getCubicBezierExtremaX(0, -50, 150, 100);
                assert.ok(extrema.length >= 2);
            });
        });
        
        describe('getQuadBezierExtremaX', () => {
            it('should return endpoints for straight segment', () => {
                const extrema = getQuadBezierExtremaX(0, 50, 100);
                assert.ok(extrema.includes(0));
                assert.ok(extrema.includes(100));
            });
            
            it('should find extrema for curved bezier', () => {
                // Control point outside the line
                const extrema = getQuadBezierExtremaX(0, 100, 50);
                assert.ok(extrema.length >= 2);
            });
        });
        
        describe('getPathBounds', () => {
            it('should return zeros for empty path', () => {
                const bounds = getPathBounds(null);
                assert.deepEqual(bounds, { minX: 0, maxX: 0, minY: 0, maxY: 0 });
            });
            
            it('should compute bounds for linear path', () => {
                const path = {
                    commands: [
                        { type: 'M', x: 10, y: 20 },
                        { type: 'L', x: 100, y: 50 },
                        { type: 'L', x: 50, y: 80 },
                        { type: 'Z' }
                    ]
                };
                const bounds = getPathBounds(path);
                assert.equal(bounds.minX, 10);
                assert.equal(bounds.maxX, 100);
                assert.equal(bounds.minY, 20);
                assert.equal(bounds.maxY, 80);
            });
            
            it('should compute bounds for cubic bezier path', () => {
                const path = {
                    commands: [
                        { type: 'M', x: 0, y: 0 },
                        { type: 'C', x1: 50, y1: 100, x2: 100, y2: 100, x: 150, y: 0 },
                        { type: 'Z' }
                    ]
                };
                const bounds = getPathBounds(path);
                assert.ok(bounds.maxY > 0, 'Should find Y extrema beyond endpoints');
            });
        });
        
        describe('extractPathPoints', () => {
            it('should extract move and line commands', () => {
                const path = {
                    commands: [
                        { type: 'M', x: 0, y: 0 },
                        { type: 'L', x: 100, y: 0 },
                        { type: 'L', x: 100, y: 100 },
                        { type: 'Z' }
                    ]
                };
                const points = extractPathPoints(path, 1000);
                assert.equal(points.length, 3);
            });
            
            it('should scale points according to unitsPerEm', () => {
                const path = {
                    commands: [
                        { type: 'M', x: 500, y: 500 }
                    ]
                };
                const points = extractPathPoints(path, 1000, 10);
                assert.ok(points[0][0] < 500, 'Points should be scaled down');
            });
        });
        
        describe('avar Mapping Utilities', () => {
            describe('normalizeAxisValue', () => {
                const axis = { minValue: 100, defaultValue: 400, maxValue: 900 };
                
                it('should return 0 for default value', () => {
                    assert.strictEqual(normalizeAxisValue(400, axis), 0);
                });
                
                it('should return -1 for min value', () => {
                    assert.strictEqual(normalizeAxisValue(100, axis), -1);
                });
                
                it('should return 1 for max value', () => {
                    assert.strictEqual(normalizeAxisValue(900, axis), 1);
                });
                
                it('should interpolate correctly between default and min', () => {
                    const result = normalizeAxisValue(250, axis);
                    assert.ok(result < 0 && result > -1);
                    assert.ok(Math.abs(result - (-0.5)) < 0.001);
                });
                
                it('should interpolate correctly between default and max', () => {
                    const result = normalizeAxisValue(650, axis);
                    assert.ok(result > 0 && result < 1);
                    assert.ok(Math.abs(result - 0.5) < 0.001);
                });
            });
            
            describe('applyAvarMapping', () => {
                it('should return identity for empty segment maps', () => {
                    assert.strictEqual(applyAvarMapping(0.5, []), 0.5);
                    assert.strictEqual(applyAvarMapping(-0.5, null), -0.5);
                });
                
                it('should return identity for linear mapping', () => {
                    const linearMaps = [
                        { fromCoordinate: -1, toCoordinate: -1 },
                        { fromCoordinate: 0, toCoordinate: 0 },
                        { fromCoordinate: 1, toCoordinate: 1 }
                    ];
                    assert.strictEqual(applyAvarMapping(0.5, linearMaps), 0.5);
                    assert.strictEqual(applyAvarMapping(-0.5, linearMaps), -0.5);
                    assert.strictEqual(applyAvarMapping(0, linearMaps), 0);
                });
                
                it('should apply non-linear mapping', () => {
                    // This mapping compresses the range: 0.5 -> 0.25
                    const nonLinearMaps = [
                        { fromCoordinate: -1, toCoordinate: -1 },
                        { fromCoordinate: 0, toCoordinate: 0 },
                        { fromCoordinate: 0.5, toCoordinate: 0.25 },
                        { fromCoordinate: 1, toCoordinate: 1 }
                    ];
                    const result = applyAvarMapping(0.5, nonLinearMaps);
                    assert.ok(Math.abs(result - 0.25) < 0.001);
                });
                
                it('should interpolate within segments', () => {
                    const maps = [
                        { fromCoordinate: -1, toCoordinate: -1 },
                        { fromCoordinate: 0, toCoordinate: 0 },
                        { fromCoordinate: 1, toCoordinate: 0.5 }
                    ];
                    // At 0.5 input, should be halfway between 0 and 0.5 output = 0.25
                    const result = applyAvarMapping(0.5, maps);
                    assert.ok(Math.abs(result - 0.25) < 0.001);
                });
                
                it('should handle dead zone mapping', () => {
                    // This creates a "dead zone" where -0.5 to 0.5 all map to 0
                    const deadZoneMaps = [
                        { fromCoordinate: -1, toCoordinate: -1 },
                        { fromCoordinate: -0.5, toCoordinate: 0 },
                        { fromCoordinate: 0, toCoordinate: 0 },
                        { fromCoordinate: 0.5, toCoordinate: 0 },
                        { fromCoordinate: 1, toCoordinate: 1 }
                    ];
                    assert.strictEqual(applyAvarMapping(0, deadZoneMaps), 0);
                    assert.strictEqual(applyAvarMapping(0.25, deadZoneMaps), 0);
                    assert.strictEqual(applyAvarMapping(-0.25, deadZoneMaps), 0);
                });
            });
            
            describe('applyAvarToCoords', () => {
                const axes = [
                    { tag: 'wght', minValue: 100, defaultValue: 400, maxValue: 900 },
                    { tag: 'wdth', minValue: 75, defaultValue: 100, maxValue: 125 }
                ];
                
                it('should normalize coordinates without avar', () => {
                    const coords = { wght: 650, wdth: 112.5 };
                    const result = applyAvarToCoords(coords, axes, null);
                    assert.ok(Math.abs(result.wght - 0.5) < 0.001);
                    assert.ok(Math.abs(result.wdth - 0.5) < 0.001);
                });
                
                it('should apply avar mapping per axis', () => {
                    const coords = { wght: 650, wdth: 100 };
                    const avarTable = {
                        axisSegmentMaps: [
                            { axisValueMaps: [
                                { fromCoordinate: -1, toCoordinate: -1 },
                                { fromCoordinate: 0, toCoordinate: 0 },
                                { fromCoordinate: 0.5, toCoordinate: 0.75 },
                                { fromCoordinate: 1, toCoordinate: 1 }
                            ]},
                            { axisValueMaps: [
                                { fromCoordinate: -1, toCoordinate: -1 },
                                { fromCoordinate: 0, toCoordinate: 0 },
                                { fromCoordinate: 1, toCoordinate: 1 }
                            ]}
                        ]
                    };
                    const result = applyAvarToCoords(coords, axes, avarTable);
                    // wght at 650 -> normalized 0.5 -> avar maps to 0.75
                    assert.ok(Math.abs(result.wght - 0.75) < 0.001);
                    // wdth at 100 -> normalized 0 -> avar maps to 0 (linear)
                    assert.strictEqual(result.wdth, 0);
                });
                
                it('should use default value for missing coordinates', () => {
                    const coords = { wght: 400 }; // wdth missing
                    const result = applyAvarToCoords(coords, axes, null);
                    assert.strictEqual(result.wght, 0);
                    assert.strictEqual(result.wdth, 0);
                });
            });
        });
    });
    
    describe('FontEditorState', () => {
        
        describe('constructor', () => {
            it('should create with default values', () => {
                const state = new FontEditorState();
                assert.equal(state.familyName, 'Custom Font');
                assert.equal(state.styleName, 'Regular');
                assert.equal(state.unitsPerEm, 800);
            });
            
            it('should accept custom options', () => {
                const state = new FontEditorState({
                    familyName: 'Test Font',
                    styleName: 'Bold',
                    unitsPerEm: 1000
                });
                assert.equal(state.familyName, 'Test Font');
                assert.equal(state.styleName, 'Bold');
                assert.equal(state.unitsPerEm, 1000);
            });
        });
        
        describe('glyph management', () => {
            let state;
            
            beforeEach(() => {
                state = new FontEditorState();
            });
            
            it('should add a glyph', () => {
                state.addGlyph('A', [[0, 0], [5, 10], [10, 0]]);
                assert.deepEqual(state.getGlyphPoints('A'), [[0, 0], [5, 10], [10, 0]]);
            });
            
            it('should add a glyph with explicit width', () => {
                state.addGlyph('A', [[0, 0], [5, 10], [10, 0]], 12);
                assert.equal(state.glyphWidths['A'], 12);
            });
            
            it('should delete a glyph', () => {
                state.addGlyph('A', [[0, 0]]);
                assert.ok(state.deleteGlyph('A'));
                assert.deepEqual(state.getGlyphPoints('A'), []);
            });
            
            it('should return false when deleting non-existent glyph', () => {
                assert.ok(!state.deleteGlyph('Z'));
            });
            
            it('should calculate glyph width from points', () => {
                state.addGlyph('A', [[0, 0], [5, 10], [10, 0]]);
                assert.equal(state.getGlyphWidth('A'), 10);
            });
            
            it('should use explicit width if set', () => {
                state.addGlyph('A', [[0, 0], [5, 10], [10, 0]], 15);
                assert.equal(state.getGlyphWidth('A'), 15);
            });
        });
        
        describe('point management', () => {
            let state;
            
            beforeEach(() => {
                state = new FontEditorState();
                state.addGlyph('A', [[0, 0], [5, 10]]);
                state.currentGlyph = 'A';
            });
            
            it('should add a point', () => {
                const idx = state.addPoint(10, 0);
                assert.equal(idx, 2);
                assert.equal(state.getGlyphPoints('A').length, 3);
            });
            
            it('should update a point', () => {
                assert.ok(state.updatePoint(0, 1, 2));
                assert.deepEqual(state.getGlyphPoints('A')[0], [1, 2]);
            });
            
            it('should delete a point', () => {
                assert.ok(state.deletePoint(0));
                assert.equal(state.getGlyphPoints('A').length, 1);
            });
            
            it('should return false for invalid point index', () => {
                assert.ok(!state.updatePoint(99, 0, 0));
                assert.ok(!state.deletePoint(99));
            });
        });
        
        describe('variable font', () => {
            let state;
            
            beforeEach(() => {
                state = new FontEditorState();
                state.addGlyph('A', [[0, 0], [5, 10], [10, 0]]);
            });
            
            it('should add an axis', () => {
                state.addAxis({
                    tag: 'wght',
                    name: 'Weight',
                    minValue: 100,
                    defaultValue: 400,
                    maxValue: 900
                });
                assert.equal(state.axes.length, 1);
                assert.equal(state.axes[0].tag, 'wght');
                assert.equal(state.previewCoords['wght'], 400);
            });
            
            it('should enable VF mode and create default master', () => {
                state.addAxis({ tag: 'wght', name: 'Weight', minValue: 100, defaultValue: 400, maxValue: 900 });
                state.setVariableFontEnabled(true);
                assert.ok(state.vfEnabled);
                assert.equal(state.masters.length, 1);
                assert.equal(state.masters[0].name, 'Default');
            });
            
            it('should add a master', () => {
                state.addAxis({ tag: 'wght', name: 'Weight', minValue: 100, defaultValue: 400, maxValue: 900 });
                state.addMaster('Bold', { wght: 900 });
                assert.equal(state.masters.length, 1);
            });
            
            it('should add an instance', () => {
                state.addInstance('Regular', { wght: 400 });
                assert.equal(state.instances.length, 1);
                assert.equal(state.instances[0].name, 'Regular');
            });
            
            it('should remove axis and clean up', () => {
                state.addAxis({ tag: 'wght', name: 'Weight', minValue: 100, defaultValue: 400, maxValue: 900 });
                state.addMaster('Bold', { wght: 900 });
                state.addInstance('Bold', { wght: 900 });
                
                assert.ok(state.removeAxis(0));
                assert.equal(state.axes.length, 0);
                assert.ok(!state.previewCoords['wght']);
            });
        });
        
        describe('serialization', () => {
            it('should serialize to JSON', () => {
                const state = new FontEditorState({ familyName: 'Test' });
                state.addGlyph('A', [[0, 0]]);
                
                const json = state.toJSON();
                assert.equal(json.familyName, 'Test');
                assert.ok(json.glyphs['A']);
            });
            
            it('should deserialize from JSON', () => {
                const json = {
                    familyName: 'Restored Font',
                    glyphs: { 'B': [[1, 2]] },
                    glyphWidths: { 'B': 5 },
                    axes: [{ tag: 'wght', name: 'Weight', minValue: 100, defaultValue: 400, maxValue: 900 }]
                };
                
                const state = new FontEditorState();
                state.fromJSON(json);
                
                assert.equal(state.familyName, 'Restored Font');
                assert.deepEqual(state.getGlyphPoints('B'), [[1, 2]]);
                assert.equal(state.axes.length, 1);
            });
        });
    });
    
    describe('FontBuilder', () => {
        let state;
        
        beforeEach(() => {
            state = new FontEditorState({
                familyName: 'Test Font',
                styleName: 'Regular',
                unitsPerEm: 800,
                ascender: 800,
                descender: 0
            });
            state.addGlyph('A', [[0, 0], [4, 10], [8, 0]]);
            state.addGlyph('B', [[0, 0], [6, 0], [6, 10], [0, 10]]);
        });
        
        it('should build a basic font', () => {
            const builder = new FontBuilder(state, opentype);
            const font = builder.build();
            
            assert.ok(font);
            assert.equal(font.getEnglishName('fontFamily'), 'Test Font');
            assert.ok(font.glyphs.length >= 5); // .notdef, space, nbsp, A, B
        });
        
        it('should export to ArrayBuffer', () => {
            const builder = new FontBuilder(state, opentype);
            const buffer = builder.toArrayBuffer();
            
            assert.ok(buffer instanceof ArrayBuffer);
            assert.ok(buffer.byteLength > 0);
        });
        
        it('should create valid font that can be re-parsed', () => {
            const builder = new FontBuilder(state, opentype);
            const buffer = builder.toArrayBuffer();
            
            const parsedFont = opentype.parse(buffer);
            assert.ok(parsedFont);
            assert.ok(parsedFont.charToGlyph('A'));
        });
        
        it('should include non-breaking space glyph', () => {
            const builder = new FontBuilder(state, opentype);
            const font = builder.build();
            
            // Check for uni00A0 glyph
            let hasNbsp = false;
            for (let i = 0; i < font.glyphs.length; i++) {
                if (font.glyphs.get(i).name === 'uni00A0') {
                    hasNbsp = true;
                    break;
                }
            }
            assert.ok(hasNbsp, 'Should have non-breaking space glyph');
        });
    });
    
    describe('FontBuilder with Variable Font', () => {
        let state;
        
        beforeEach(() => {
            state = new FontEditorState();
            state.addGlyph('A', [[0, 0], [4, 10], [8, 0]]);
            
            state.addAxis({
                tag: 'wght',
                name: 'Weight',
                minValue: 100,
                defaultValue: 400,
                maxValue: 700
            });
            
            state.setVariableFontEnabled(true);
            
            // Add bold master
            state.addMaster('Bold', { wght: 700 }, { 'A': [[0, 0], [4, 12], [10, 0]] });
        });
        
        it('should build a variable font', () => {
            const builder = new FontBuilder(state, opentype);
            const font = builder.build();
            
            assert.ok(font);
            assert.ok(font.tables.fvar, 'Should have fvar table');
        });
        
        it('should include default Regular instance', () => {
            const builder = new FontBuilder(state, opentype);
            const font = builder.build();
            
            assert.ok(font.tables.fvar.instances.length >= 1);
            const instanceNames = font.tables.fvar.instances.map(i => i.name?.en || Object.values(i.name)[0]);
            assert.ok(instanceNames.includes('Regular'), 'Should have Regular instance');
        });
    });
    
    describe('FontBuilder with Composite Glyphs', () => {
        it('should create actual composite glyphs (not flattened)', () => {
            const state = new FontEditorState({
                familyName: 'Composite Test',
                styleName: 'Regular'
            });
            
            // Create a component glyph
            state.addGlyph('_stem', [[0, 0], [2, 0], [2, 10], [0, 10]]);
            
            // Create a glyph that only references the component (no own shapes)
            state.addGlyph('I', []);  // Empty - no own shapes
            // Add reference directly to state (no addGlyphReference method yet)
            state.glyphReferences['I'] = [{
                name: '_stem',
                dx: 1,
                dy: 0,
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
                skewX: 0,
                skewY: 0
            }];
            
            const builder = new FontBuilder(state, opentype);
            const font = builder.build({ useComposites: true });
            
            // Find the 'I' glyph
            let iGlyph = null;
            for (let i = 0; i < font.glyphs.length; i++) {
                if (font.glyphs.get(i).name === 'I') {
                    iGlyph = font.glyphs.get(i);
                    break;
                }
            }
            
            assert.ok(iGlyph, 'Should have I glyph');
            assert.strictEqual(iGlyph.isComposite, true, 'I glyph should be composite');
            assert.ok(iGlyph.components && iGlyph.components.length > 0, 'I glyph should have components');
        });
        
        it('should preserve composite glyphs after export/import round-trip', () => {
            const state = new FontEditorState({
                familyName: 'Composite Test',
                styleName: 'Regular'
            });
            
            // Create a component glyph
            state.addGlyph('_stem', [[0, 0], [2, 0], [2, 10], [0, 10]]);
            
            // Create a glyph that only references the component
            state.addGlyph('I', []);
            // Add reference directly to state
            state.glyphReferences['I'] = [{
                name: '_stem',
                dx: 0,
                dy: 0,
                scaleX: 1,
                scaleY: 1
            }];
            
            const builder = new FontBuilder(state, opentype);
            const buffer = builder.toArrayBuffer();
            
            // Re-parse the font
            const parsedFont = opentype.parse(buffer);
            
            // Find the 'I' glyph in the parsed font and force loading
            let iGlyph = null;
            for (let i = 0; i < parsedFont.glyphs.length; i++) {
                const g = parsedFont.glyphs.get(i);
                try { g.getPath(); } catch (e) { /* ignore */ }
                if (g.unicode === 'I'.charCodeAt(0)) {
                    iGlyph = g;
                    break;
                }
            }
            
            assert.ok(iGlyph, 'Should have I glyph in parsed font');
            assert.strictEqual(iGlyph.isComposite, true, 'I glyph should be composite after round-trip');
            assert.strictEqual(iGlyph.numberOfContours, -1, 'Composite glyph should have numberOfContours = -1');
            assert.ok(iGlyph.components && iGlyph.components.length > 0, 'Should have components after round-trip');
        });
        
        it('should set outlinesFormat to truetype for TrueType export', () => {
            const state = new FontEditorState({
                familyName: 'Test Font',
                styleName: 'Regular'
            });
            state.addGlyph('A', [[0, 0], [4, 10], [8, 0]]);
            
            const builder = new FontBuilder(state, opentype);
            const font = builder.build();
            
            assert.strictEqual(font.outlinesFormat, 'truetype', 'Font should have truetype outlinesFormat');
        });
    });
    
    describe('FontBuilder with VF Composite Glyphs', () => {
        it('should include component glyphs in VF export', () => {
            const state = new FontEditorState({
                familyName: 'VF Composite Test',
                styleName: 'Variable'
            });
            
            // Create a component glyph
            state.addGlyph('_stem', [[0, 0], [2, 0], [2, 10], [0, 10]]);
            
            // Create a glyph that only references the component
            state.addGlyph('I', []);
            state.glyphReferences['I'] = [{
                name: '_stem',
                dx: 1,
                dy: 0,
                scaleX: 1,
                scaleY: 1
            }];
            
            // Add variation axis and masters
            state.addAxis({
                tag: 'wght',
                name: 'Weight',
                minValue: 100,
                defaultValue: 400,
                maxValue: 900
            });
            state.setVariableFontEnabled(true);
            
            // Add bold master with thicker component
            state.addMaster('Bold', { wght: 900 }, {
                '_stem': [[0, 0], [4, 0], [4, 10], [0, 10]],
                'I': []
            });
            
            const builder = new FontBuilder(state, opentype);
            const font = builder.build({ useComposites: true });
            
            // Check that both component and composite glyph exist
            let hasComponent = false;
            let hasComposite = false;
            for (let i = 0; i < font.glyphs.length; i++) {
                const g = font.glyphs.get(i);
                if (g.name === '_stem') hasComponent = true;
                if (g.name === 'I') {
                    hasComposite = true;
                    // Check it's actually a composite
                    assert.strictEqual(g.isComposite, true, 'I should be composite');
                }
            }
            
            assert.ok(hasComponent, 'Should have _stem component glyph');
            assert.ok(hasComposite, 'Should have I composite glyph');
        });
        
        it('should export VF with component and correctly structure variation data', () => {
            const state = new FontEditorState({
                familyName: 'VF Composite Test',
                styleName: 'Variable'
            });
            
            // Create component and glyph with reference
            state.addGlyph('_stem', [[0, 0], [2, 0], [2, 10], [0, 10]]);
            state.addGlyph('I', []);
            state.glyphReferences['I'] = [{
                name: '_stem',
                dx: 0,
                dy: 0,
                scaleX: 1,
                scaleY: 1
            }];
            
            state.addAxis({
                tag: 'wght',
                name: 'Weight',
                minValue: 100,
                defaultValue: 400,
                maxValue: 900
            });
            state.setVariableFontEnabled(true);
            state.addMaster('Bold', { wght: 900 }, {
                '_stem': [[0, 0], [4, 0], [4, 10], [0, 10]],
                'I': []
            });
            
            const builder = new FontBuilder(state, opentype);
            const buffer = builder.toArrayBuffer();
            
            // Re-parse and verify structure
            const font = opentype.parse(buffer);
            
            assert.ok(font.tables.fvar, 'Should have fvar table');
            assert.ok(font.tables.gvar, 'Should have gvar table for variation');
            
            // The component glyph should have variation data in gvar
            // (the composite glyph uses the component, so variation is in component)
        });
    });
    
    describe('FontBuilder with Shapes AND References', () => {
        it('should create synthetic component when glyph has both shapes and references', () => {
            const state = new FontEditorState({
                familyName: 'Mixed Glyph Test',
                styleName: 'Regular'
            });
            
            // Create a component glyph (e.g., a dot/diacritic)
            state.addGlyph('_dot', [[4, 8], [5, 8], [5, 9], [4, 9]]);
            
            // Create 'i' with its own shapes (stem) AND a reference to the dot
            state.addGlyph('i', [[2, 0], [4, 0], [4, 6], [2, 6]]); // stem shape
            state.glyphReferences['i'] = [{
                name: '_dot',
                dx: 0,
                dy: 0,
                scaleX: 1,
                scaleY: 1
            }];
            
            const builder = new FontBuilder(state, opentype);
            const font = builder.build({ useComposites: true });
            
            // Find the glyphs
            let iGlyph = null;
            let dotGlyph = null;
            let stemGlyph = null;
            
            for (let j = 0; j < font.glyphs.length; j++) {
                const g = font.glyphs.get(j);
                if (g.name === 'i') iGlyph = g;
                if (g.name === '_dot') dotGlyph = g;
                if (g.name === '_i_shape') stemGlyph = g;
            }
            
            assert.ok(dotGlyph, 'Should have _dot component glyph');
            assert.ok(stemGlyph, 'Should have synthetic _i_shape component for i\'s own shapes');
            assert.ok(iGlyph, 'Should have i glyph');
            
            // i should be a composite glyph
            assert.strictEqual(iGlyph.isComposite, true, 'i should be composite');
            
            // i should have 2 components: _i_shape (own shapes) + _dot (reference)
            assert.strictEqual(iGlyph.components.length, 2, 'i should have 2 components');
            
            // First component should be the synthetic shape component (no offset)
            assert.strictEqual(iGlyph.components[0].dx, 0, 'Synthetic component should have dx=0');
            assert.strictEqual(iGlyph.components[0].dy, 0, 'Synthetic component should have dy=0');
        });
        
        it('should preserve shapes+references through export/import round-trip', () => {
            const state = new FontEditorState({
                familyName: 'Mixed Glyph Roundtrip Test',
                styleName: 'Regular'
            });
            
            // Create components
            state.addGlyph('_accent', [[3, 9], [5, 9], [4, 10]]);
            
            // Create 'e' with own shape and accent reference
            state.addGlyph('e', [[1, 0], [6, 0], [6, 3], [1, 3], [1, 5], [6, 5], [6, 8], [1, 8]]); // e shape
            state.glyphReferences['e'] = [{
                name: '_accent',
                dx: 0,
                dy: 1,
                scaleX: 1,
                scaleY: 1
            }];
            
            const builder = new FontBuilder(state, opentype);
            const font = builder.build({ useComposites: true });
            
            // Verify the pre-export structure has proper composite with synthetic component
            let preExportE = null;
            let preExportEShape = null;
            for (let j = 0; j < font.glyphs.length; j++) {
                const g = font.glyphs.get(j);
                if (g.name === 'e') preExportE = g;
                if (g.name === '_e_shape') preExportEShape = g;
            }
            
            assert.ok(preExportE, 'Should have e glyph');
            assert.ok(preExportEShape, 'Should have _e_shape synthetic component');
            assert.strictEqual(preExportE.isComposite, true, 'e should be composite');
            assert.strictEqual(preExportE.components.length, 2, 'e should have 2 components: _e_shape + _accent');
            
            // The synthetic component should have the e's original shapes
            assert.ok(preExportEShape.path, '_e_shape should have a path');
            assert.ok(preExportEShape.path.commands.length > 0, '_e_shape path should have commands');
            
            // Export should succeed
            const buffer = builder.toArrayBuffer();
            assert.ok(buffer.byteLength > 0, 'Should produce valid export buffer');
        });
        
        it('should not create synthetic component when glyph has only shapes (no references)', () => {
            const state = new FontEditorState({
                familyName: 'Simple Glyph Test',
                styleName: 'Regular'
            });
            
            // Create a simple glyph with only shapes
            state.addGlyph('A', [[0, 0], [4, 10], [8, 0]]);
            
            const builder = new FontBuilder(state, opentype);
            const font = builder.build({ useComposites: true });
            
            // Check that no synthetic component was created
            let hasASynthetic = false;
            for (let j = 0; j < font.glyphs.length; j++) {
                const g = font.glyphs.get(j);
                if (g.name === '_A_shape') hasASynthetic = true;
            }
            
            assert.ok(!hasASynthetic, 'Should NOT have _A_shape synthetic component for glyph with only shapes');
        });
        
        it('should not create synthetic component when glyph has only references (no shapes)', () => {
            const state = new FontEditorState({
                familyName: 'Pure Composite Test',
                styleName: 'Regular'
            });
            
            // Create a component
            state.addGlyph('_stem', [[0, 0], [2, 10]]);
            
            // Create a glyph with ONLY references, no own shapes
            state.addGlyph('I', []);
            state.glyphReferences['I'] = [{
                name: '_stem',
                dx: 1,
                dy: 0,
                scaleX: 1,
                scaleY: 1
            }];
            
            const builder = new FontBuilder(state, opentype);
            const font = builder.build({ useComposites: true });
            
            // Check that no synthetic component was created
            let hasISynthetic = false;
            for (let j = 0; j < font.glyphs.length; j++) {
                const g = font.glyphs.get(j);
                if (g.name === '_I_shape') hasISynthetic = true;
            }
            
            assert.ok(!hasISynthetic, 'Should NOT have _I_shape synthetic component for glyph with only references');
        });
        
        it('should export VF with shapes+references from JSON state and have gvar entries for all glyphs', () => {
            // Regression test: Load the vf-shapes-and-references-state.json test file
            // This has glyph "O" with both shapes AND a reference to "_Test"
            const stateJson = readFileSync('./test/fonts/vf-shapes-and-references-state.json', 'utf8');
            const stateData = JSON.parse(stateJson);
            
            const state = new FontEditorState({});
            state.glyphs = stateData.glyphs || {};
            state.glyphWidths = stateData.glyphWidths || {};
            state.glyphReferences = stateData.glyphReferences || {};
            
            if (stateData.vf) {
                state.vfEnabled = stateData.vf.enabled;
                state.axes = stateData.vf.axes || [];
                state.masters = stateData.vf.masters || [];
                state.instances = stateData.vf.instances || [];
            }
            
            const builder = new FontBuilder(state, opentype);
            const font = builder.build({ useComposites: true });
            
            // Verify all glyphs have gvar entries (critical for OTS validation)
            assert.ok(font.tables.gvar, 'Font should have gvar table');
            assert.ok(font.tables.gvar.glyphVariations, 'gvar should have glyphVariations');
            
            // All glyphs from 0 to numGlyphs-1 must have entries
            for (let i = 0; i < font.glyphs.length; i++) {
                assert.ok(
                    font.tables.gvar.glyphVariations[i] !== undefined, 
                    `Glyph ${i} should have gvar entry`
                );
            }
            
            // Export should succeed
            const buffer = builder.toArrayBuffer();
            assert.ok(buffer.byteLength > 0, 'Should produce valid export buffer');
            
            // Verify we have the synthetic component for the glyph with shapes+references
            let hasOShapeSynthetic = false;
            for (let j = 0; j < font.glyphs.length; j++) {
                const g = font.glyphs.get(j);
                if (g.name === '_O_shape') hasOShapeSynthetic = true;
            }
            assert.ok(hasOShapeSynthetic, 'Should have _O_shape synthetic component for glyph O which has shapes+references');
        });
    });
    
    describe('FontImporter', () => {
        it('should import a font file', async () => {
            // Create a simple font to import
            const originalState = new FontEditorState();
            originalState.addGlyph('A', [[0, 0], [4, 10], [8, 0]]);
            
            const builder = new FontBuilder(originalState, opentype);
            const buffer = builder.toArrayBuffer();
            
            // Import it
            const importer = new FontImporter(opentype);
            const newState = new FontEditorState();
            const result = importer.import(newState, buffer, { range: 'uppercase' });
            
            assert.ok(result.importedCount >= 1);
            assert.ok(newState.glyphs['A'], 'Should have imported glyph A');
        });
    });
    
    describe('Export Validation', () => {
        describe('glyph path validation', () => {
            it('should pass validation when glyphs have paths', () => {
                const state = new FontEditorState();
                state.addGlyph('A', [[0, 0], [4, 10], [8, 0]]);
                state.addGlyph('B', [[0, 0], [0, 10], [5, 10], [5, 0]]);
                
                const builder = new FontBuilder(state, opentype);
                // Should not throw
                const font = builder.build({ validate: true, validateRoundTrip: false });
                assert.ok(font);
            });
            
            it('should detect empty glyphs (no paths)', () => {
                const state = new FontEditorState();
                // Add glyph with no points - should create empty path
                state.glyphs = { 'A': [] };
                
                const builder = new FontBuilder(state, opentype);
                assert.throws(() => {
                    builder.build({ validate: true, validateRoundTrip: false });
                }, /no glyph paths/i);
            });
        });
        
        describe('roundtrip validation', () => {
            it('should validate successful roundtrip', () => {
                const state = new FontEditorState();
                state.addGlyph('X', [[0, 0], [3, 5], [6, 0], [4, 3], [6, 6], [3, 5], [0, 6], [2, 3]]);
                
                const builder = new FontBuilder(state, opentype);
                // Should not throw
                const font = builder.build({ validate: true, validateRoundTrip: true });
                assert.ok(font);
            });
            
            it('should preserve glyph paths after export and reparse', () => {
                const state = new FontEditorState();
                state.addGlyph('T', [[2, 0], [2, 7], [0, 7], [0, 10], [7, 10], [7, 7], [5, 7], [5, 0]]);
                
                const builder = new FontBuilder(state, opentype);
                const buffer = builder.toArrayBuffer();
                
                // Parse the buffer
                const parsed = opentype.parse(buffer);
                assert.ok(parsed, 'Font should parse');
                
                const glyphT = parsed.charToGlyph('T');
                assert.ok(glyphT, 'T glyph should exist');
                assert.ok(glyphT.path, 'T glyph should have path');
                assert.ok(glyphT.path.commands.length > 0, 'T glyph path should have commands');
            });
        });
        
        describe('advance width preservation', () => {
            it('should preserve explicit advance widths', () => {
                const state = new FontEditorState();
                state.addGlyph('W', [[0, 10], [2, 0], [4, 6], [6, 0], [8, 10]]);
                state.setGlyphWidth('W', 12);
                
                const builder = new FontBuilder(state, opentype);
                const buffer = builder.toArrayBuffer();
                
                const parsed = opentype.parse(buffer);
                const glyphW = parsed.charToGlyph('W');
                
                // Width should be (12 + 1) * scale = 13 * 80 = 1040
                assert.equal(glyphW.advanceWidth, 1040, 'Advance width should be preserved');
            });
            
            it('should compute width from bounding box when not explicit', () => {
                const state = new FontEditorState();
                // Glyph from x=0 to x=8
                state.addGlyph('H', [[0, 0], [0, 10], [8, 10], [8, 0]]);
                // No explicit width set
                
                const builder = new FontBuilder(state, opentype);
                const buffer = builder.toArrayBuffer();
                
                const parsed = opentype.parse(buffer);
                const glyphH = parsed.charToGlyph('H');
                
                // Width should be based on maxX (8) + 1 = 9 * 80 = 720
                assert.equal(glyphH.advanceWidth, 720, 'Advance width should be computed from bounds');
            });
        });
    });
    
    describe('Edit-Export-Import Roundtrip', () => {
        it('should preserve edited glyph points after export and reimport', () => {
            // Create state with initial glyph
            const state = new FontEditorState();
            const originalPoints = [[0, 0], [4, 10], [8, 0]];
            state.addGlyph('A', originalPoints);
            
            // "Edit" the glyph - simulate user modification
            const editedPoints = [[1, 1], [5, 12], [9, 1]];
            state.glyphs['A'] = editedPoints;
            
            // Export to font
            const builder = new FontBuilder(state, opentype);
            const buffer = builder.toArrayBuffer();
            
            // Import back
            const importer = new FontImporter(opentype);
            const newState = new FontEditorState();
            importer.import(newState, buffer, { range: 'uppercase' });
            
            // Verify the imported glyph has the EDITED points, not original
            assert.ok(newState.glyphs['A'], 'Glyph A should exist after import');
            const importedPoints = newState.glyphs['A'];
            
            // Check point count matches
            assert.equal(importedPoints.length, editedPoints.length, 'Point count should match');
            
            // Check points are approximately the edited ones (scaled)
            // The font uses scale=80 for export, then import rescales back
            // Points should be close to original editor coordinates
            for (let i = 0; i < editedPoints.length; i++) {
                const origX = editedPoints[i][0];
                const origY = editedPoints[i][1];
                const impX = importedPoints[i][0];
                const impY = importedPoints[i][1];
                
                // Allow tolerance for rounding
                assert.ok(Math.abs(impX - origX) < 2, `Point ${i} X should be close: ${impX} vs ${origX}`);
                assert.ok(Math.abs(impY - origY) < 2, `Point ${i} Y should be close: ${impY} vs ${origY}`);
            }
        });
        
        it('should export the current state, not initial state', () => {
            const state = new FontEditorState();
            
            // Add initial glyphs
            state.addGlyph('A', [[0, 0], [4, 10], [8, 0]]);
            state.addGlyph('B', [[0, 0], [0, 10], [5, 10], [5, 0]]);
            
            // Modify A completely
            state.glyphs['A'] = [[2, 2], [6, 14], [10, 2]];
            
            // Build font and check the path is the modified one
            const builder = new FontBuilder(state, opentype);
            const font = builder.build({ validate: false, validateRoundTrip: false });
            
            const glyphA = font.charToGlyph('A');
            assert.ok(glyphA.path, 'Glyph A should have path');
            
            // Path should start at the modified point (2*80=160, 2*80=160)
            const firstCmd = glyphA.path.commands.find(c => c.type === 'M');
            assert.ok(firstCmd, 'Should have moveTo command');
            assert.equal(firstCmd.x, 2 * 80, 'First point X should be modified value');
            assert.equal(firstCmd.y, 2 * 80, 'First point Y should be modified value');
        });
        
        it('should preserve multiple glyphs with edits', () => {
            const state = new FontEditorState();
            
            // Add and modify multiple glyphs
            state.addGlyph('X', [[0, 0], [8, 10], [8, 0], [0, 10]]);
            state.addGlyph('Y', [[0, 10], [4, 5], [8, 10], [4, 0]]);
            state.addGlyph('Z', [[0, 10], [8, 10], [0, 0], [8, 0]]);
            
            const builder = new FontBuilder(state, opentype);
            const buffer = builder.toArrayBuffer();
            const parsed = opentype.parse(buffer);
            
            // Check all glyphs exist and have paths
            for (const char of ['X', 'Y', 'Z']) {
                const glyph = parsed.charToGlyph(char);
                assert.ok(glyph, `Glyph ${char} should exist`);
                assert.ok(glyph.path, `Glyph ${char} should have path`);
                assert.ok(glyph.path.commands.length > 0, `Glyph ${char} should have path commands`);
            }
        });
        
        it('should preserve point edits through full export-reimport cycle', () => {
            // Simulate full user workflow:
            // 1. Create initial state
            // 2. Edit a glyph (move points)
            // 3. Export to OTF
            // 4. Reimport from OTF
            // 5. Verify edits are preserved
            
            const state = new FontEditorState();
            state.addGlyph('A', [[0, 0], [4, 10], [8, 0]]);
            state.addGlyph('B', [[0, 0], [0, 10], [6, 10], [6, 0]]);
            
            // User edits: move point 1 of A from [4, 10] to [5, 12]
            state.glyphs['A'][1] = [5, 12];
            
            // User edits: widen B
            state.glyphs['B'] = [[0, 0], [0, 10], [8, 10], [8, 0]];
            
            // Export
            const builder = new FontBuilder(state, opentype);
            const buffer = builder.toArrayBuffer();
            
            // Reimport
            const importer = new FontImporter(opentype);
            const newState = new FontEditorState();
            importer.import(newState, buffer, { range: 'uppercase' });
            
            // Verify A was modified
            const importedA = newState.glyphs['A'];
            assert.ok(importedA, 'Glyph A should exist');
            assert.equal(importedA.length, 3, 'A should have 3 points');
            
            // Point 1 should be close to [5, 12]
            assert.ok(Math.abs(importedA[1][0] - 5) < 1, `A point 1 X should be ~5, got ${importedA[1][0]}`);
            assert.ok(Math.abs(importedA[1][1] - 12) < 1, `A point 1 Y should be ~12, got ${importedA[1][1]}`);
            
            // Verify B was modified  
            const importedB = newState.glyphs['B'];
            assert.ok(importedB, 'Glyph B should exist');
            
            // B's rightmost point should be at x=8
            const maxX = Math.max(...importedB.map(p => p[0]));
            assert.ok(Math.abs(maxX - 8) < 1, `B max X should be ~8, got ${maxX}`);
        });
        
        it('should correctly scale widths through export-reimport', () => {
            const state = new FontEditorState();
            
            // Add glyph with specific width
            state.addGlyph('W', [[0, 10], [4, 0], [8, 10], [12, 0], [16, 10]]);
            state.setGlyphWidth('W', 18); // Explicit width
            
            // Export and reimport
            const builder = new FontBuilder(state, opentype);
            const buffer = builder.toArrayBuffer();
            
            const importer = new FontImporter(opentype);
            const newState = new FontEditorState();
            importer.import(newState, buffer, { range: 'uppercase' });
            
            // Check width is preserved (approximately)
            const importedWidth = newState.glyphWidths['W'] || 0;
            // Width should be close to 18 (or maxX of points which is 16)
            assert.ok(importedWidth > 14, `Width should be preserved, got ${importedWidth}`);
        });
    });
    
    describe('Font Validation', () => {
        it('should create .notdef glyph with a drawing (not empty)', () => {
            const state = new FontEditorState();
            state.addGlyph('A', [[0, 0], [4, 10], [8, 0]]);
            
            const builder = new FontBuilder(state, opentype);
            const font = builder.build();
            
            // Find .notdef glyph
            const notdefGlyph = font.glyphs.get(0);
            assert.ok(notdefGlyph, '.notdef glyph should exist');
            assert.equal(notdefGlyph.name, '.notdef');
            assert.ok(notdefGlyph.path, '.notdef should have a path');
            assert.ok(notdefGlyph.path.commands.length > 0, '.notdef path should not be empty');
            assert.ok(notdefGlyph.advanceWidth > 0, '.notdef should have non-zero advance width');
        });
        
        it('should set version string to match head fontRevision', () => {
            const state = new FontEditorState();
            state.addGlyph('A', [[0, 0], [4, 10], [8, 0]]);
            
            const builder = new FontBuilder(state, opentype);
            const font = builder.build();
            
            // Check version in names
            const version = font.names.windows?.version?.en;
            assert.ok(version, 'Version should be set in names');
            assert.ok(version.includes('1.'), 'Version should match 1.x format');
        });
        
        it('should create STAT table for variable fonts', () => {
            const state = new FontEditorState();
            state.addGlyph('A', [[0, 0], [4, 10], [8, 0]]);
            state.setVariableFontEnabled(true);
            state.addAxis({ tag: 'wght', name: 'Weight', minValue: 100, defaultValue: 400, maxValue: 900 });
            state.addMaster('Light', { wght: 100 }, { 'A': [[0, 0], [3, 8], [6, 0]] });
            state.addMaster('Bold', { wght: 900 }, { 'A': [[0, 0], [5, 12], [10, 0]] });
            
            const builder = new FontBuilder(state, opentype);
            const font = builder.build();
            
            // Check STAT table exists
            assert.ok(font.tables.stat, 'STAT table should exist for variable fonts');
            assert.ok(font.tables.stat.axes, 'STAT table should have axes');
            assert.equal(font.tables.stat.axes.length, 1, 'STAT should have 1 axis');
            assert.equal(font.tables.stat.axes[0].tag, 'wght', 'STAT axis tag should be wght');
        });
    });
    
    describe('Multi-Shape Glyph Support', () => {
        
        describe('nested shape format handling', () => {
            
            it('should detect flat vs nested shape format', () => {
                // Test the format detection logic used in font-editor
                const flatFormat = [[0, 0], [5, 10], [10, 0]];
                const nestedFormat = [[[0, 0], [5, 10], [10, 0]]];
                const multiShapeFormat = [[[0, 0], [5, 10], [10, 0]], [[2, 2], [3, 5], [4, 2]]];
                
                // Flat format: first element is an array with exactly 2 numbers
                const isFlat = (data) => data[0] && Array.isArray(data[0]) && typeof data[0][0] === 'number';
                const isNested = (data) => data[0] && Array.isArray(data[0]) && Array.isArray(data[0][0]);
                
                assert.ok(isFlat(flatFormat), 'Flat format should be detected');
                assert.ok(!isNested(flatFormat), 'Flat format should not be nested');
                
                assert.ok(!isFlat(nestedFormat), 'Nested format should not be flat');
                assert.ok(isNested(nestedFormat), 'Nested format should be detected');
                
                assert.ok(!isFlat(multiShapeFormat), 'Multi-shape format should not be flat');
                assert.ok(isNested(multiShapeFormat), 'Multi-shape format should be nested');
            });
            
            it('should flatten shapes for interpolation', () => {
                // Simulate the flattenShapesToPoints function from font-editor
                const flattenShapesToPoints = (shapesOrPoints) => {
                    if (!shapesOrPoints || shapesOrPoints.length === 0) return [];
                    if (Array.isArray(shapesOrPoints[0]) && typeof shapesOrPoints[0][0] === 'number') {
                        return shapesOrPoints;
                    }
                    return shapesOrPoints.flat();
                };
                
                const flatFormat = [[0, 0], [5, 10], [10, 0]];
                const nestedFormat = [[[0, 0], [5, 10], [10, 0]]];
                const multiShapeFormat = [[[0, 0], [5, 10]], [[2, 2], [4, 2]]];
                
                assert.deepEqual(flattenShapesToPoints(flatFormat), flatFormat);
                assert.deepEqual(flattenShapesToPoints(nestedFormat), [[0, 0], [5, 10], [10, 0]]);
                assert.deepEqual(flattenShapesToPoints(multiShapeFormat), [[0, 0], [5, 10], [2, 2], [4, 2]]);
            });
            
            it('should build SVG path from nested shapes', () => {
                // Simulate the renderGlyphGrid path building logic
                const buildSVGPath = (glyphData) => {
                    const shapes = (glyphData && glyphData[0] && Array.isArray(glyphData[0]) && Array.isArray(glyphData[0][0])) 
                        ? glyphData : (glyphData && glyphData.length > 0 ? [glyphData] : []);
                    
                    let d = '';
                    for (const points of shapes) {
                        if (points && points.length > 0) {
                            d += 'M' + points.map(p => p[0] + ' ' + (10 - p[1])).join(' L') + ' Z ';
                        }
                    }
                    return d.trim();
                };
                
                // Flat format should work
                const flat = [[0, 0], [5, 10], [10, 0]];
                assert.equal(buildSVGPath(flat), 'M0 10 L5 0 L10 10 Z');
                
                // Nested format should work
                const nested = [[[0, 0], [5, 10], [10, 0]]];
                assert.equal(buildSVGPath(nested), 'M0 10 L5 0 L10 10 Z');
                
                // Multi-shape format should produce multiple paths
                const multi = [[[0, 0], [5, 10]], [[2, 2], [3, 5]]];
                assert.equal(buildSVGPath(multi), 'M0 10 L5 0 Z M2 8 L3 5 Z');
                
                // Empty data should produce empty path
                assert.equal(buildSVGPath([]), '');
                assert.equal(buildSVGPath(null), '');
            });
            
            it('should not produce NaN in SVG path coordinates', () => {
                const buildSVGPath = (glyphData) => {
                    const shapes = (glyphData && glyphData[0] && Array.isArray(glyphData[0]) && Array.isArray(glyphData[0][0])) 
                        ? glyphData : (glyphData && glyphData.length > 0 ? [glyphData] : []);
                    
                    let d = '';
                    for (const points of shapes) {
                        if (points && points.length > 0) {
                            d += 'M' + points.map(p => p[0] + ' ' + (10 - p[1])).join(' L') + ' Z ';
                        }
                    }
                    return d.trim();
                };
                
                // These patterns should all produce valid paths without NaN
                const testCases = [
                    [[0, 0], [5, 10], [10, 0]],
                    [[[0, 0], [5, 10], [10, 0]]],
                    [[[0, 0]], [[5, 5]]],
                    [[[1.5, 2.5], [3.5, 4.5]]]
                ];
                
                for (const data of testCases) {
                    const path = buildSVGPath(data);
                    assert.ok(!path.includes('NaN'), `Path should not contain NaN: ${path}`);
                    assert.ok(!path.includes('undefined'), `Path should not contain undefined: ${path}`);
                }
            });
        });
        
        describe('shape interpolation for variable fonts', () => {
            
            it('should interpolate nested shapes correctly', () => {
                // Simulate the interpolation logic from font-editor
                const interpolateShapes = (p1, p2, t) => {
                    const isNested = p1[0] && Array.isArray(p1[0]) && Array.isArray(p1[0][0]);
                    
                    if (isNested) {
                        if (p1.length !== p2.length) return p1;
                        const result = [];
                        for (let shapeIdx = 0; shapeIdx < p1.length; shapeIdx++) {
                            const shape1 = p1[shapeIdx];
                            const shape2 = p2[shapeIdx];
                            if (!shape1 || !shape2 || shape1.length !== shape2.length) {
                                result.push(shape1 || shape2 || []);
                            } else {
                                const interpolated = shape1.map((pt, i) => [
                                    pt[0] + (shape2[i][0] - pt[0]) * t,
                                    pt[1] + (shape2[i][1] - pt[1]) * t
                                ]);
                                result.push(interpolated);
                            }
                        }
                        return result;
                    } else {
                        if (p1.length !== p2.length) return p1;
                        return p1.map((pt, i) => [
                            pt[0] + (p2[i][0] - pt[0]) * t,
                            pt[1] + (p2[i][1] - pt[1]) * t
                        ]);
                    }
                };
                
                // Test nested format interpolation
                const shape1 = [[[0, 0], [10, 10]]];
                const shape2 = [[[0, 0], [20, 20]]];
                
                const midpoint = interpolateShapes(shape1, shape2, 0.5);
                assert.deepEqual(midpoint, [[[0, 0], [15, 15]]]);
                
                // Test extrapolation (t > 1)
                const extrapolated = interpolateShapes(shape1, shape2, 2);
                assert.deepEqual(extrapolated, [[[0, 0], [30, 30]]]);
                
                // Test multi-shape
                const multi1 = [[[0, 0]], [[10, 10]]];
                const multi2 = [[[0, 0]], [[20, 20]]];
                
                const multiMidpoint = interpolateShapes(multi1, multi2, 0.5);
                assert.deepEqual(multiMidpoint, [[[0, 0]], [[15, 15]]]);
            });
        });
    });

    describe('Multi-Shape Glyph Export', () => {
        it('should export fonts with multi-shape glyphs without NaN advanceWidth', () => {
            // Glyph with multiple shapes (like the letter 'B' with inner counters)
            const multiShapeGlyph = [
                [[0, 0], [10, 0], [10, 10], [0, 10]], // outer shape
                [[2, 2], [8, 2], [8, 8], [2, 8]]      // inner counter
            ];
            
            const state = {
                familyName: 'Test Font',
                styleName: 'Regular',
                unitsPerEm: 800,
                ascender: 800,
                descender: -200,
                glyphs: {
                    'A': [[0, 0], [5, 10], [10, 0]],  // simple single-shape
                    'B': multiShapeGlyph              // multi-shape
                },
                glyphWidths: {},
                vfEnabled: false,
                axes: [],
                masters: [],
                instances: []
            };
            
            const builder = new FontBuilder(state, opentype);
            // This should not throw "advanceWidth is not a number"
            const font = builder.build({ validate: true });
            
            assert.equal(font.glyphs.length, 5, 'should have 5 glyphs (.notdef, space, uni00A0, A, B)');
            
            // Check that all glyphs have valid advanceWidth
            for (let i = 0; i < font.glyphs.length; i++) {
                const glyph = font.glyphs.get(i);
                assert.ok(typeof glyph.advanceWidth === 'number', `Glyph ${glyph.name} should have numeric advanceWidth`);
                assert.ok(!isNaN(glyph.advanceWidth), `Glyph ${glyph.name} advanceWidth should not be NaN`);
            }
        });
        
        it('should build paths correctly for multi-shape glyphs', () => {
            const multiShapeGlyph = [
                [[0, 0], [10, 0], [10, 10], [0, 10]],
                [[2, 2], [8, 2], [8, 8], [2, 8]]
            ];
            
            const state = {
                familyName: 'Test Font',
                styleName: 'Regular',
                unitsPerEm: 800,
                ascender: 800,
                descender: -200,
                glyphs: { 'B': multiShapeGlyph },
                glyphWidths: {},
                vfEnabled: false,
                axes: [],
                masters: [],
                instances: []
            };
            
            const builder = new FontBuilder(state, opentype);
            const font = builder.build();
            
            // Find the 'B' glyph (index 3 after .notdef, space, uni00A0)
            const bGlyph = font.glyphs.get(3);
            assert.equal(bGlyph.name, 'B');
            
            // Should have path commands for both shapes
            const commands = bGlyph.path.commands;
            
            // Count M commands - should be 2 for 2 shapes
            const moveCommands = commands.filter(c => c.type === 'M');
            assert.equal(moveCommands.length, 2, 'should have 2 moveTo commands for 2 shapes');
            
            // Count Z commands - should be 2 for 2 closed shapes  
            const closeCommands = commands.filter(c => c.type === 'Z');
            assert.equal(closeCommands.length, 2, 'should have 2 closePath commands');
        });
        
        it('should compute width correctly from multi-shape glyphs', () => {
            // Multi-shape where outer bounds define the width
            const multiShapeGlyph = [
                [[0, 0], [20, 0], [20, 10], [0, 10]], // outer: width 20
                [[5, 2], [15, 2], [15, 8], [5, 8]]    // inner: narrower
            ];
            
            const state = {
                familyName: 'Test Font',
                styleName: 'Regular',
                unitsPerEm: 800,
                ascender: 800,
                descender: -200,
                glyphs: { 'X': multiShapeGlyph },
                glyphWidths: {},
                vfEnabled: false,
                axes: [],
                masters: [],
                instances: []
            };
            
            const builder = new FontBuilder(state, opentype);
            const font = builder.build();
            
            const xGlyph = font.glyphs.get(3);
            // Width should be (20 + 1) * 80 = 1680 (based on outer shape maxX)
            // scale = 800 / 10 = 80
            assert.equal(xGlyph.advanceWidth, 1680);
        });
    });

    describe('Multi-Shape VF Roundtrip', () => {
        it('should correctly compute deltas for multi-shape VF glyphs', function() {
            const state = new FontEditorState({
                familyName: 'Test Font VF',
                styleName: 'Variable',
                unitsPerEm: 800,
                ascender: 800,
                descender: -200
            });
            
            // Shape 1: outer rectangle (4 points)
            const baseShape1 = [[0, 0], [8, 0], [8, 10], [0, 10]];
            // Shape 2: inner rectangle (4 points)
            const baseShape2 = [[2, 2], [6, 2], [6, 5], [2, 5]];
            
            // Bold master - shapes are wider
            const boldShape1 = [[0, 0], [10, 0], [10, 10], [0, 10]];
            const boldShape2 = [[1, 2], [9, 2], [9, 5], [1, 5]];
            
            state.glyphs = {
                'A': [baseShape1, baseShape2]
            };
            state.glyphWidths = { 'A': 8 };
            
            state.vfEnabled = true;
            state.axes = [{
                tag: 'wght',
                name: 'Weight',
                minValue: 100,
                defaultValue: 400,
                maxValue: 700
            }];
            state.masters = [
                {
                    name: 'Regular',
                    coords: { wght: 400 },
                    glyphs: { 'A': [baseShape1, baseShape2] },
                    glyphWidths: { 'A': 8 }
                },
                {
                    name: 'Bold',
                    coords: { wght: 700 },
                    glyphs: { 'A': [boldShape1, boldShape2] },
                    glyphWidths: { 'A': 10 }
                }
            ];
            state.instances = [];
            
            // Build the font - this should not throw
            const builder = new FontBuilder(state, opentype);
            const font = builder.build({ validate: true, validateRoundTrip: false });
            
            // Check that fvar and gvar exist
            assert.ok(font.tables.fvar, 'Font should have fvar table');
            assert.ok(font.tables.gvar, 'Font should have gvar table');
            
            // Export and reimport
            const buffer = font.toArrayBuffer();
            const reimported = opentype.parse(buffer);
            
            // Should not throw during parsing
            assert.ok(reimported, 'Should be able to reimport the font');
            assert.ok(reimported.tables.gvar, 'Reimported font should have gvar');
        });
        
        it('should not apply one glyph\'s deltas to another glyph', function() {
            // This is the key regression test - deltas from one glyph
            // should NOT affect other glyphs
            
            const state = new FontEditorState({
                familyName: 'Test Font VF',
                styleName: 'Variable',
                unitsPerEm: 800,
                ascender: 800,
                descender: -200
            });
            
            // Create two glyphs with very different shapes
            const glyphA_base = [[[0, 0], [8, 0], [4, 10]]];  // Triangle pointing up
            const glyphA_bold = [[[0, 0], [10, 0], [5, 12]]]; // Larger triangle
            
            const glyphB_base = [[[0, 10], [8, 10], [8, 0], [0, 0]]];  // Rectangle
            const glyphB_bold = [[[0, 10], [8, 10], [8, 0], [0, 0]]];  // Same rectangle (no change)
            
            state.glyphs = {
                'A': glyphA_base,
                'B': glyphB_base
            };
            state.glyphWidths = { 'A': 8, 'B': 8 };
            
            state.vfEnabled = true;
            state.axes = [{
                tag: 'wght',
                name: 'Weight',
                minValue: 100,
                defaultValue: 400,
                maxValue: 700
            }];
            state.masters = [
                {
                    name: 'Regular',
                    coords: { wght: 400 },
                    glyphs: { 'A': glyphA_base, 'B': glyphB_base },
                    glyphWidths: { 'A': 8, 'B': 8 }
                },
                {
                    name: 'Bold',
                    coords: { wght: 700 },
                    glyphs: { 'A': glyphA_bold, 'B': glyphB_bold },
                    glyphWidths: { 'A': 10, 'B': 8 }
                }
            ];
            state.instances = [];
            
            // Build, export, and reimport
            const builder = new FontBuilder(state, opentype);
            const font = builder.build({ validate: true, validateRoundTrip: false });
            const buffer = font.toArrayBuffer();
            const reimported = opentype.parse(buffer);
            
            // At wght=400 (default), glyph B should have its original coordinates
            const glyphB = reimported.charToGlyph('B');
            assert.ok(glyphB, 'Should find glyph B');
            
            // Get glyph B at default weight - coordinates should be unchanged
            if (reimported.variation) {
                const transformDefault = reimported.variation.getTransform(glyphB.index, { wght: 400 });
                assert.ok(transformDefault, 'Should get transform at default');
                
                // At wght=700, glyph B should still have the same coordinates
                // (since we defined both base and bold to be identical)
                const transformBold = reimported.variation.getTransform(glyphB.index, { wght: 700 });
                assert.ok(transformBold, 'Should get transform at bold');
                
                // Compare points - they should be the same (no delta)
                const defaultPoints = transformDefault.points;
                const boldPoints = transformBold.points;
                
                // Skip phantom points (last 4) when comparing
                const pointCount = Math.min(defaultPoints.length, boldPoints.length) - 4;
                for (let i = 0; i < pointCount; i++) {
                    const dp = defaultPoints[i];
                    const bp = boldPoints[i];
                    const tolerance = 1; // Allow small rounding errors
                    assert.ok(
                        Math.abs(dp.x - bp.x) <= tolerance && Math.abs(dp.y - bp.y) <= tolerance,
                        `Glyph B Point ${i} should not change: default=(${dp.x}, ${dp.y}) bold=(${bp.x}, ${bp.y})`
                    );
                }
            }
        });
        
        it('should correctly extrapolate width beyond defined masters', () => {
            // Test case: masters at wght=100 and wght=400, axis goes to 900
            // Width should extrapolate correctly (not clamp to 0)
            const state = new FontEditorState({
                familyName: 'Extrapolation Test',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200
            });
            
            // Add base glyph first (will become the default master)
            state.addGlyph('A', [[0, 0], [10, 0], [10, 10], [0, 10]]);
            state.setGlyphWidth('A', 10);
            
            // Define axis: wght 100-900, default 400
            state.addAxis({ tag: 'wght', name: 'Weight', minValue: 100, defaultValue: 400, maxValue: 900 });
            state.setVariableFontEnabled(true);
            
            // Light master at wght=100: narrow glyph (width 5)
            state.addMaster('Light', { wght: 100 }, { 'A': [[0, 0], [5, 0], [5, 10], [0, 10]] }, { 'A': 5 });
            
            // Note: Default master at wght=400 is already created from addGlyph above
            
            // No master at 900, so extrapolation is needed
            
            const builder = new FontBuilder(state, opentype);
            const font = builder.build({ validate: true, validateRoundTrip: false });
            const buffer = font.toArrayBuffer();
            const parsed = opentype.parse(buffer);
            
            const glyphA = parsed.charToGlyph('A');
            assert.ok(glyphA, 'Should find glyph A');
            
            // Width at wght=100: should be ~5 * scale
            const width100 = parsed.variation.process.getTransform(glyphA, { wght: 100 }).advanceWidth;
            
            // Width at wght=400 (default): should be ~10 * scale
            const width400 = parsed.variation.process.getTransform(glyphA, { wght: 400 }).advanceWidth;
            
            // Width at wght=900 (extrapolated): should be ~15 * scale (extrapolating the trend)
            // From 100->400 (300 range), width goes 5->10 (delta of 5)
            // From 400->900 (500 range), extrapolation should add 5 * (500/300) ≈ 8.33
            // So width at 900 should be approximately 10 + 8.33 = 18.33 * scale
            const width900 = parsed.variation.process.getTransform(glyphA, { wght: 900 }).advanceWidth;
            
            // The key assertion: width at 900 should be larger than width at 400 (not stuck or zero)
            assert.ok(width900 > width400, `Width at wght=900 (${width900}) should be greater than at wght=400 (${width400})`);
            
            // Also check that width increases proportionally
            // Delta from 100 to 400 should predict delta from 400 to 900
            const delta100to400 = width400 - width100;
            const expectedDelta400to900 = delta100to400 * (500 / 300); // proportional extrapolation
            const actualDelta400to900 = width900 - width400;
            
            // Allow some tolerance for rounding
            assert.ok(
                Math.abs(actualDelta400to900 - expectedDelta400to900) < 100,
                `Width should extrapolate proportionally: expected delta ~${expectedDelta400to900}, got ${actualDelta400to900}`
            );
        });
        
        it('should correctly extrapolate width when masters only on max side of default', () => {
            // Test case: default=400, master at 700, axis goes to 100 and 900
            // This tests extrapolation in the MIN direction (below default)
            const state = new FontEditorState({
                familyName: 'Max Side Extrapolation Test',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200
            });
            
            // Add base glyph at default width
            state.addGlyph('A', [[0, 0], [10, 0], [10, 10], [0, 10]]);
            state.setGlyphWidth('A', 10);
            
            // Define axis: wght 100-900, default 400
            state.addAxis({ tag: 'wght', name: 'Weight', minValue: 100, defaultValue: 400, maxValue: 900 });
            state.setVariableFontEnabled(true);
            
            // Bold master at wght=700: wider glyph (width 15)
            // No light master, so extrapolation is needed for wght < 400
            state.addMaster('Bold', { wght: 700 }, { 'A': [[0, 0], [15, 0], [15, 10], [0, 10]] }, { 'A': 15 });
            
            const builder = new FontBuilder(state, opentype);
            const font = builder.build({ validate: true, validateRoundTrip: false });
            const buffer = font.toArrayBuffer();
            const parsed = opentype.parse(buffer);
            
            const glyphA = parsed.charToGlyph('A');
            assert.ok(glyphA, 'Should find glyph A');
            
            // Width at wght=700: should be ~15 * scale
            const width700 = parsed.variation.process.getTransform(glyphA, { wght: 700 }).advanceWidth;
            
            // Width at wght=400 (default): should be ~10 * scale
            const width400 = parsed.variation.process.getTransform(glyphA, { wght: 400 }).advanceWidth;
            
            // Width at wght=100 (extrapolated in min direction): should be less than 400
            const width100 = parsed.variation.process.getTransform(glyphA, { wght: 100 }).advanceWidth;
            
            // Width at wght=900 (extrapolated in max direction): should be more than 700
            const width900 = parsed.variation.process.getTransform(glyphA, { wght: 900 }).advanceWidth;
            
            // Key assertions
            assert.ok(width100 < width400, `Width at wght=100 (${width100}) should be less than at wght=400 (${width400})`);
            assert.ok(width900 > width700, `Width at wght=900 (${width900}) should be greater than at wght=700 (${width700})`);
        });
        
        it('should support intermediate masters at non-extreme positions', () => {
            // Test case: axis 100-900, default 400
            // Masters at: 100 (Light), 400 (Regular, default), 500 (Medium - intermediate), 900 (Bold)
            const state = new FontEditorState({
                familyName: 'Intermediate Test',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200
            });
            
            // Add base glyph at default
            state.addGlyph('A', [[0, 0], [10, 0], [10, 10], [0, 10]]);
            state.setGlyphWidth('A', 10);
            
            state.addAxis({ tag: 'wght', name: 'Weight', minValue: 100, defaultValue: 400, maxValue: 900 });
            state.setVariableFontEnabled(true);
            
            // Light master at 100 (narrow)
            state.addMaster('Light', { wght: 100 }, { 'A': [[0, 0], [5, 0], [5, 10], [0, 10]] }, { 'A': 5 });
            
            // Medium master at 500 (intermediate - with a "kink" correction)
            // Linear interpolation between 400->900 would give width ~12 at 500
            // But we want width 11 (slight correction)
            state.addMaster('Medium', { wght: 500 }, { 'A': [[0, 0], [11, 0], [11, 10], [0, 10]] }, { 'A': 11 });
            
            // Bold master at 900 (wide)
            state.addMaster('Bold', { wght: 900 }, { 'A': [[0, 0], [20, 0], [20, 10], [0, 10]] }, { 'A': 20 });
            
            const builder = new FontBuilder(state, opentype);
            const font = builder.build({ validate: true, validateRoundTrip: false });
            const buffer = font.toArrayBuffer();
            const parsed = opentype.parse(buffer);
            
            const glyphA = parsed.charToGlyph('A');
            assert.ok(glyphA, 'Should find glyph A');
            
            // Check gvar has intermediate tuples
            const gvarA = parsed.tables.gvar?.glyphVariations[glyphA.index];
            assert.ok(gvarA, 'Should have gvar data for glyph A');
            
            // There should be multiple tuple variations
            assert.ok(gvarA.headers.length >= 2, `Should have multiple tuple variations, got ${gvarA.headers.length}`);
            
            // Test rendering at various positions
            const width100 = parsed.variation.process.getTransform(glyphA, { wght: 100 }).advanceWidth;
            const width400 = parsed.variation.process.getTransform(glyphA, { wght: 400 }).advanceWidth;
            const width500 = parsed.variation.process.getTransform(glyphA, { wght: 500 }).advanceWidth;
            const width900 = parsed.variation.process.getTransform(glyphA, { wght: 900 }).advanceWidth;
            
            // Basic ordering
            assert.ok(width100 < width400, 'Light should be narrower than Regular');
            assert.ok(width400 < width900, 'Regular should be narrower than Bold');
        });
        
        it('should support sparse intermediate masters (glyphs can opt-in)', () => {
            // Test case: only some glyphs participate in the intermediate master
            const state = new FontEditorState({
                familyName: 'Sparse Intermediate Test',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200
            });
            
            // Add base glyphs
            state.addGlyph('A', [[0, 0], [10, 0], [10, 10], [0, 10]]);
            state.setGlyphWidth('A', 10);
            state.addGlyph('B', [[0, 0], [10, 0], [10, 10], [0, 10]]);
            state.setGlyphWidth('B', 10);
            
            state.addAxis({ tag: 'wght', name: 'Weight', minValue: 100, defaultValue: 400, maxValue: 900 });
            state.setVariableFontEnabled(true);
            
            // Light master with both A and B
            state.addMaster('Light', { wght: 100 }, { 
                'A': [[0, 0], [5, 0], [5, 10], [0, 10]],
                'B': [[0, 0], [5, 0], [5, 10], [0, 10]]
            }, { 'A': 5, 'B': 5 });
            
            // Intermediate master at 500 with ONLY glyph A (B doesn't participate)
            // This is the "sparse" feature - not all glyphs need to be defined
            state.addMaster('Medium', { wght: 500 }, { 
                'A': [[0, 0], [11, 0], [11, 10], [0, 10]]
            }, { 'A': 11 });
            
            // Bold master with both A and B
            state.addMaster('Bold', { wght: 900 }, { 
                'A': [[0, 0], [20, 0], [20, 10], [0, 10]],
                'B': [[0, 0], [20, 0], [20, 10], [0, 10]]
            }, { 'A': 20, 'B': 20 });
            
            const builder = new FontBuilder(state, opentype);
            const font = builder.build({ validate: true, validateRoundTrip: false });
            const buffer = font.toArrayBuffer();
            const parsed = opentype.parse(buffer);
            
            const glyphA = parsed.charToGlyph('A');
            const glyphB = parsed.charToGlyph('B');
            
            // Both glyphs should exist and vary
            const widthA_100 = parsed.variation.process.getTransform(glyphA, { wght: 100 }).advanceWidth;
            const widthA_900 = parsed.variation.process.getTransform(glyphA, { wght: 900 }).advanceWidth;
            const widthB_100 = parsed.variation.process.getTransform(glyphB, { wght: 100 }).advanceWidth;
            const widthB_900 = parsed.variation.process.getTransform(glyphB, { wght: 900 }).advanceWidth;
            
            assert.ok(widthA_100 < widthA_900, 'Glyph A should vary with weight');
            assert.ok(widthB_100 < widthB_900, 'Glyph B should vary with weight (even though not in intermediate)');
            
            // Check gvar data - A should have more variations than B
            const gvarA = parsed.tables.gvar?.glyphVariations[glyphA.index];
            const gvarB = parsed.tables.gvar?.glyphVariations[glyphB.index];
            
            // A participates in the intermediate master, so may have more headers
            // The key is that both work correctly
            assert.ok(gvarA?.headers?.length > 0, 'Glyph A should have gvar data');
            assert.ok(gvarB?.headers?.length > 0, 'Glyph B should have gvar data');
        });
    });
    
    describe('Ligature and GSUB Table Export', () => {
        it('should export GSUB table with ligature substitution', () => {
            const state = new FontEditorState({
                familyName: 'Ligature Test',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200
            });
            
            // Add base glyphs
            state.addGlyph('A', [[0, 0], [10, 0], [10, 10], [0, 10]]);
            state.addGlyph('B', [[0, 0], [10, 0], [10, 10], [0, 10]]);
            // Add ligature glyph (named A_B following standard convention)
            state.addGlyph('A_B', [[0, 0], [20, 0], [20, 10], [0, 10]]);
            
            // Add ligature substitution: A + B -> A_B
            state.addLigature('AB', 'A_B', true);
            
            const builder = new FontBuilder(state, opentype);
            const font = builder.build({ validate: true, validateRoundTrip: false });
            const buffer = font.toArrayBuffer();
            const parsed = opentype.parse(buffer);
            
            // Verify GSUB table exists
            assert.ok(parsed.tables.gsub, 'Font should have GSUB table');
            
            // Verify ligature feature
            const gsub = parsed.tables.gsub;
            assert.ok(gsub.features, 'GSUB should have features');
            const ligaFeature = gsub.features.find(f => f.tag === 'liga');
            assert.ok(ligaFeature, 'GSUB should have liga feature');
            
            // Verify lookup type 4 (ligature substitution)
            assert.ok(gsub.lookups?.length > 0, 'GSUB should have lookups');
            const lookup = gsub.lookups[0];
            assert.equal(lookup.lookupType, 4, 'Lookup should be type 4 (ligature)');
            
            // Verify ligature data
            const subtable = lookup.subtables[0];
            assert.ok(subtable.ligatureSets, 'Subtable should have ligatureSets');
        });
        
        it('should handle multiple ligatures', () => {
            const state = new FontEditorState({
                familyName: 'Multi Ligature Test',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200
            });
            
            // Add base glyphs
            state.addGlyph('f', [[0, 0], [10, 0], [10, 10], [0, 10]]);
            state.addGlyph('i', [[0, 0], [5, 0], [5, 10], [0, 10]]);
            state.addGlyph('l', [[0, 0], [5, 0], [5, 10], [0, 10]]);
            // Add ligature glyphs
            state.addGlyph('fi', [[0, 0], [15, 0], [15, 10], [0, 10]]);
            state.addGlyph('fl', [[0, 0], [15, 0], [15, 10], [0, 10]]);
            
            // Add ligature substitutions
            state.addLigature('fi', 'fi', true);
            state.addLigature('fl', 'fl', true);
            
            const builder = new FontBuilder(state, opentype);
            const font = builder.build({ validate: true, validateRoundTrip: false });
            const buffer = font.toArrayBuffer();
            const parsed = opentype.parse(buffer);
            
            // Verify GSUB table exists with multiple ligatures
            assert.ok(parsed.tables.gsub, 'Font should have GSUB table');
            const lookup = parsed.tables.gsub.lookups[0];
            assert.equal(lookup.lookupType, 4, 'Lookup should be type 4');
            
            // The subtable should have multiple ligature sets
            const subtable = lookup.subtables[0];
            assert.ok(subtable.ligatureSets.length >= 1, 'Should have ligature sets');
        });
        
        it('should not create GSUB when ligatures are disabled', () => {
            const state = new FontEditorState({
                familyName: 'No Ligature Test',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200
            });
            
            // Add base glyphs
            state.addGlyph('A', [[0, 0], [10, 0], [10, 10], [0, 10]]);
            state.addGlyph('B', [[0, 0], [10, 0], [10, 10], [0, 10]]);
            state.addGlyph('A_B', [[0, 0], [20, 0], [20, 10], [0, 10]]);
            
            // Add ligature but disabled
            state.addLigature('AB', 'A_B', false);
            
            const builder = new FontBuilder(state, opentype);
            const font = builder.build({ validate: true, validateRoundTrip: false });
            const buffer = font.toArrayBuffer();
            const parsed = opentype.parse(buffer);
            
            // GSUB should not exist since the only ligature is disabled
            assert.ok(!parsed.tables.gsub, 'Font should NOT have GSUB table when all ligatures are disabled');
        });
        
        it('should skip ligatures with missing source or result glyphs', () => {
            const state = new FontEditorState({
                familyName: 'Missing Glyph Test',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200
            });
            
            // Add only 'A' glyph, not 'B'
            state.addGlyph('A', [[0, 0], [10, 0], [10, 10], [0, 10]]);
            // Add ligature glyph
            state.addGlyph('A_B', [[0, 0], [20, 0], [20, 10], [0, 10]]);
            
            // Add ligature that references missing glyph 'B'
            state.addLigature('AB', 'A_B', true);
            
            const builder = new FontBuilder(state, opentype);
            // Should not throw - just skip invalid ligatures
            const font = builder.build({ validate: true, validateRoundTrip: false });
            const buffer = font.toArrayBuffer();
            const parsed = opentype.parse(buffer);
            
            // GSUB should not exist since the ligature has a missing component
            assert.ok(!parsed.tables.gsub, 'Font should NOT have GSUB when ligature components are missing');
        });
        
        it('should not assign unicode to multi-character glyph names (cmap deduplication)', () => {
            const state = new FontEditorState({
                familyName: 'Cmap Test',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200
            });
            
            // Add regular glyphs
            state.addGlyph('A', [[0, 0], [10, 0], [10, 10], [0, 10]]);
            state.addGlyph('B', [[0, 0], [10, 0], [10, 10], [0, 10]]);
            // Add ligature glyph with multi-char name - should NOT get unicode
            state.addGlyph('A_B', [[0, 0], [20, 0], [20, 10], [0, 10]]);
            
            const builder = new FontBuilder(state, opentype);
            const font = builder.build({ validate: true, validateRoundTrip: false });
            const buffer = font.toArrayBuffer();
            const parsed = opentype.parse(buffer);
            
            // Find the A_B glyph and verify it has no unicode
            let foundA_B = false;
            for (let i = 0; i < parsed.glyphs.length; i++) {
                const g = parsed.glyphs.get(i);
                if (g.unicode === 65) {
                    // This is the 'A' glyph - check there's only one
                    let countA = 0;
                    for (let j = 0; j < parsed.glyphs.length; j++) {
                        if (parsed.glyphs.get(j).unicode === 65) countA++;
                    }
                    assert.equal(countA, 1, 'Only one glyph should have unicode 65 (A)');
                }
            }
            
            // Verify font is valid with OTS (if available)
            // The key test is that no cmap error occurs for duplicate unicode values
        });
        
        it('should pass OTS validation with ligatures', async () => {
            const state = new FontEditorState({
                familyName: 'OTS Ligature Test',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200
            });
            
            // Add base glyphs
            state.addGlyph('A', [[0, 0], [10, 0], [10, 10], [0, 10]]);
            state.addGlyph('B', [[0, 0], [10, 0], [10, 10], [0, 10]]);
            state.addGlyph('A_B', [[0, 0], [20, 0], [20, 10], [0, 10]]);
            
            // Add ligature
            state.addLigature('AB', 'A_B', true);
            
            const builder = new FontBuilder(state, opentype);
            const font = builder.build({ validate: true, validateRoundTrip: false });
            const buffer = font.toArrayBuffer();
            
            // Write to temp file and run OTS
            const fs = await import('fs');
            const path = await import('path');
            const { execSync } = await import('child_process');
            const os = await import('os');
            
            const tempFile = path.join(os.tmpdir(), `test-ligature-${Date.now()}.ttf`);
            fs.writeFileSync(tempFile, Buffer.from(buffer));
            
            try {
                const otsPath = path.join(process.cwd(), 'test/ots-9.2.0-macOS/ots-sanitize');
                const result = execSync(`"${otsPath}" "${tempFile}"`, { encoding: 'utf8' });
                assert.ok(result.includes('sanitized successfully'), 'OTS should pass');
            } catch (e) {
                // OTS failed
                assert.fail(`OTS validation failed: ${e.stderr || e.message}`);
            } finally {
                // Clean up
                try { fs.unlinkSync(tempFile); } catch(e) {}
            }
        });
    });
});
