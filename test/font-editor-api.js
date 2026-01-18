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


/**
 * Helper to create contours from simple [x, y] pairs.
 * @param {Array<[number, number]>} points - Array of [x, y] pairs
 * @returns {Array<Array<{x: number, y: number, onCurve: boolean}>>} Contours
 */
function contours(points) {
    return [points.map(([x, y]) => ({ x, y, onCurve: true }))];
}

/**
 * Helper to create multiple contours from arrays of [x, y] pairs.
 * @param {Array<Array<[number, number]>>} shapes - Array of contours, each an array of [x, y] pairs
 * @returns {Array<Array<{x: number, y: number, onCurve: boolean}>>} Contours
 */
function multiContours(shapes) {
    return shapes.map(shape => shape.map(([x, y]) => ({ x, y, onCurve: true })));
}


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
                const points = extractPathPoints(path);
                assert.equal(points.length, 3);
            });
            
            it('should return points in font units without scaling', () => {
                const path = {
                    commands: [
                        { type: 'M', x: 500, y: 500 }
                    ]
                };
                const points = extractPathPoints(path);
                // Points are returned in font units without scaling
                assert.equal(points[0][0], 500, 'Points should be in font units');
                assert.equal(points[0][1], 500, 'Points should be in font units');
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
                state.addGlyph('A', contours([[0, 0], [350, 700], [700, 0]]));
                assert.deepEqual(state.getGlyphPoints('A'), contours([[0, 0], [350, 700], [700, 0]]));
            });
            
            it('should add a glyph with explicit width', () => {
                state.addGlyph('A', contours([[0, 0], [350, 700], [700, 0]]), 750);
                assert.equal(state.glyphWidths['A'], 750);
            });
            
            it('should delete a glyph', () => {
                state.addGlyph('A', contours([[0, 0]]));
                assert.ok(state.deleteGlyph('A'));
                assert.deepEqual(state.getGlyphPoints('A'), []);
            });
            
            it('should return false when deleting non-existent glyph', () => {
                assert.ok(!state.deleteGlyph('Z'));
            });
            
            it('should calculate glyph width from points', () => {
                state.addGlyph('A', contours([[0, 0], [350, 700], [700, 0]]));
                assert.equal(state.getGlyphWidth('A'), 700);
            });
            
            it('should use explicit width if set', () => {
                state.addGlyph('A', contours([[0, 0], [350, 700], [700, 0]]), 800);
                assert.equal(state.getGlyphWidth('A'), 800);
            });
        });
        
        describe('point management', () => {
            let state;
            
            beforeEach(() => {
                state = new FontEditorState();
                state.addGlyph('A', contours([[0, 0], [350, 700]]));
                state.currentGlyph = 'A';
            });
            
            it('should add a point', () => {
                const idx = state.addPoint(10, 0);
                assert.equal(idx, 2);
                // Check the first contour has 3 points
                assert.equal(state.getGlyphPoints('A')[0].length, 3);
            });
            
            it('should update a point', () => {
                assert.ok(state.updatePoint(0, 1, 2));
                const point = state.getGlyphPoints('A')[0][0];
                assert.deepEqual({ x: point.x, y: point.y }, { x: 1, y: 2 });
            });
            
            it('should delete a point', () => {
                assert.ok(state.deletePoint(0));
                assert.equal(state.getGlyphPoints('A')[0].length, 1);
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
                state.addGlyph('A', contours([[0, 0], [350, 700], [700, 0]]));
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
                state.addGlyph('A', contours([[0, 0], [350, 700], [700, 0]]));
                
                const json = state.toJSON();
                assert.equal(json.familyName, 'Test');
                assert.ok(json.glyphs['A']);
            });
            
            it('should deserialize from JSON', () => {
                const json = {
                    familyName: 'Restored Font',
                    glyphs: { 'B': contours([[100, 200]]) },
                    glyphWidths: { 'B': 500 },
                    axes: [{ tag: 'wght', name: 'Weight', minValue: 100, defaultValue: 400, maxValue: 900 }]
                };
                
                const state = new FontEditorState();
                state.fromJSON(json);
                
                assert.equal(state.familyName, 'Restored Font');
                assert.deepEqual(state.getGlyphPoints('B'), contours([[100, 200]]));
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
            state.addGlyph('A', contours([[0, 0], [320, 700], [640, 0]]));
            state.addGlyph('B', contours([[0, 0], [480, 0], [480, 700], [0, 700]]));
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
            state.addGlyph('A', contours([[0, 0], [320, 700], [640, 0]]));
            
            state.addAxis({
                tag: 'wght',
                name: 'Weight',
                minValue: 100,
                defaultValue: 400,
                maxValue: 700
            });
            
            state.setVariableFontEnabled(true);
            
            // Add bold master with wider/taller glyph
            state.addMaster('Bold', { wght: 700 }, { 'A': contours([[0, 0], [400, 750], [800, 0]]) });
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
            
            // Create a component glyph (stem shape)
            state.addGlyph('_stem', contours([[0, 0], [120, 0], [120, 700], [0, 700]]));
            
            // Create a glyph that only references the component (no own shapes)
            state.addGlyph('I', []);  // Empty - no own shapes
            // Add reference directly to state (no addGlyphReference method yet)
            state.glyphReferences['I'] = [{
                name: '_stem',
                dx: 60,
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
            
            // Create a component glyph (stem shape)
            state.addGlyph('_stem', contours([[0, 0], [120, 0], [120, 700], [0, 700]]));
            
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
            state.addGlyph('A', contours([[0, 0], [320, 700], [640, 0]]));
            
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
            
            // Create a component glyph (stem shape)
            state.addGlyph('_stem', contours([[0, 0], [120, 0], [120, 700], [0, 700]]));
            
            // Create a glyph that only references the component
            state.addGlyph('I', []);
            state.glyphReferences['I'] = [{
                name: '_stem',
                dx: 60,
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
                '_stem': contours([[0, 0], [240, 0], [240, 700], [0, 700]]),
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
            state.addGlyph('_stem', contours([[0, 0], [120, 0], [120, 700], [0, 700]]));
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
                '_stem': contours([[0, 0], [240, 0], [240, 700], [0, 700]]),
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
            state.addGlyph('_dot', contours([[280, 560], [350, 560], [350, 630], [280, 630]]));
            
            // Create 'i' with its own shapes (stem) AND a reference to the dot
            state.addGlyph('i', contours([[140, 0], [280, 0], [280, 420], [140, 420]])); // stem shape
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
            state.addGlyph('_accent', contours([[210, 630], [350, 630], [280, 700]]));
            
            // Create 'e' with own shape and accent reference
            state.addGlyph('e', contours([[70, 0], [420, 0], [420, 210], [70, 210], [70, 350], [420, 350], [420, 560], [70, 560]])); // e shape
            state.glyphReferences['e'] = [{
                name: '_accent',
                dx: 0,
                dy: 70,
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
            state.addGlyph('A', contours([[0, 0], [320, 700], [640, 0]]));
            
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
            state.addGlyph('_stem', contours([[0, 0], [120, 700]]));
            
            // Create a glyph with ONLY references, no own shapes
            state.addGlyph('I', []);
            state.glyphReferences['I'] = [{
                name: '_stem',
                dx: 60,
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
            originalState.addGlyph('A', contours([[0, 0], [320, 700], [640, 0]]));
            
            const builder = new FontBuilder(originalState, opentype);
            const buffer = builder.toArrayBuffer();
            
            // Import it
            const importer = new FontImporter(opentype);
            const newState = new FontEditorState();
            const result = importer.import(newState, buffer, { range: 'uppercase' });
            
            assert.ok(result.importedCount >= 1);
            assert.ok(newState.glyphs['A'], 'Should have imported glyph A');
        });
        
        it('should import ligature data with correct glyph keys', () => {
            // Import RobotoFlex which has ligatures
            const buffer = readFileSync('./test/fonts/RobotoFlex-Variable.ttf');
            const importer = new FontImporter(opentype);
            const state = new FontEditorState();
            
            // Import lowercase (includes fi, fl, ff, ffi, ffl ligatures)
            const result = importer.import(state, buffer.buffer, { range: 'lowercase' });
            
            // Should have imported some glyphs
            assert.ok(result.importedCount > 20, 'Should import lowercase glyphs');
            
            // Should have imported ligatures
            assert.ok(state.ligatures.length > 0, 'Should import ligatures');
            
            // Check that ligature result keys match glyph storage keys
            for (const lig of state.ligatures) {
                const resultKey = lig.result;
                // If the result key exists in state.glyphs, the mapping is correct
                // The result should either be a Unicode character or _name for non-unicode glyphs
                if (state.glyphs[resultKey]) {
                    // Ligature glyph found - mapping is correct
                    assert.ok(true, `Ligature ${lig.sequence} -> ${resultKey} maps correctly`);
                } else {
                    // Ligature glyph not found - this is OK if it wasn't in the import range
                    // But if the glyph exists under a different key, that's a bug
                    const hasUnderscoredVersion = state.glyphs['_' + resultKey];
                    assert.ok(!hasUnderscoredVersion, 
                        `Ligature ${lig.sequence} result ${resultKey} should not need underscore prefix`);
                }
            }
        });
        
        it('should import font metrics (ascender, descender, unitsPerEm)', () => {
            // Import RobotoFlex and verify metrics are preserved
            const buffer = readFileSync('./test/fonts/RobotoFlex-Variable.ttf');
            const importer = new FontImporter(opentype);
            const state = new FontEditorState();
            
            importer.import(state, buffer.buffer, { range: 'lowercase' });
            
            // RobotoFlex has unitsPerEm=2048, ascender=1900, descender=-500
            assert.strictEqual(state.unitsPerEm, 2048, 'unitsPerEm should be 2048');
            assert.strictEqual(state.ascender, 1900, 'ascender should be 1900');
            assert.strictEqual(state.descender, -500, 'descender should be -500');
        });
    });
    
    describe('Font Metrics Roundtrip', () => {
        it('should preserve font metrics through import-export-import cycle', () => {
            // Step 1: Import RobotoFlex lowercase subset
            const buffer = readFileSync('./test/fonts/RobotoFlex-Variable.ttf');
            const importer = new FontImporter(opentype);
            const state = new FontEditorState();
            
            importer.import(state, buffer.buffer, { range: 'lowercase', importVF: false });
            
            // Verify original metrics
            const originalMetrics = {
                unitsPerEm: state.unitsPerEm,
                ascender: state.ascender,
                descender: state.descender
            };
            
            assert.strictEqual(originalMetrics.unitsPerEm, 2048);
            assert.strictEqual(originalMetrics.ascender, 1900);
            assert.strictEqual(originalMetrics.descender, -500);
            
            // Step 2: Export the font
            const builder = new FontBuilder(state, opentype);
            const exportedBuffer = builder.toArrayBuffer();
            
            // Step 3: Re-import the exported font
            const reimportState = new FontEditorState();
            importer.import(reimportState, exportedBuffer, { range: 'lowercase' });
            
            // Step 4: Verify metrics are preserved
            assert.strictEqual(reimportState.unitsPerEm, originalMetrics.unitsPerEm, 'unitsPerEm should be preserved');
            assert.strictEqual(reimportState.ascender, originalMetrics.ascender, 'ascender should be preserved');
            assert.strictEqual(reimportState.descender, originalMetrics.descender, 'descender should be preserved');
        });
        
        it('should preserve glyph advance widths through roundtrip', () => {
            // Import RobotoFlex lowercase
            const buffer = readFileSync('./test/fonts/RobotoFlex-Variable.ttf');
            const importer = new FontImporter(opentype);
            const state = new FontEditorState();
            
            importer.import(state, buffer.buffer, { range: 'lowercase', importVF: false });
            
            // Record original widths for a few glyphs
            const originalWidths = {};
            for (const char of ['a', 'b', 'c', 'm', 'w']) {
                if (state.glyphWidths[char]) {
                    originalWidths[char] = state.glyphWidths[char];
                }
            }
            
            // Export
            const builder = new FontBuilder(state, opentype);
            const exportedBuffer = builder.toArrayBuffer();
            
            // Re-import
            const reimportState = new FontEditorState();
            importer.import(reimportState, exportedBuffer, { range: 'lowercase' });
            
            // Verify widths are preserved (within 1 unit tolerance for rounding)
            for (const [char, origWidth] of Object.entries(originalWidths)) {
                const reimportedWidth = reimportState.glyphWidths[char];
                assert.ok(reimportedWidth, `Glyph ${char} should have width after reimport`);
                const diff = Math.abs(reimportedWidth - origWidth);
                assert.ok(diff <= 1, `Glyph ${char} width should be preserved: original=${origWidth}, reimported=${reimportedWidth}`);
            }
        });
        
        it('should preserve kerning through roundtrip', () => {
            // Import RobotoFlex which has kerning
            const buffer = readFileSync('./test/fonts/RobotoFlex-Variable.ttf');
            const importer = new FontImporter(opentype);
            const state = new FontEditorState();
            
            // Import both uppercase and lowercase for kerning pairs
            importer.import(state, buffer.buffer, { range: 'both', importVF: false });
            
            const originalKerning = { ...state.kerning };
            const kernPairCount = Object.keys(originalKerning).length;
            
            // Skip if no kerning
            if (kernPairCount === 0) {
                console.log('No kerning pairs found in import, skipping roundtrip test');
                return;
            }
            
            // Export
            const builder = new FontBuilder(state, opentype);
            const exportedBuffer = builder.toArrayBuffer();
            
            // Re-import
            const reimportState = new FontEditorState();
            importer.import(reimportState, exportedBuffer, { range: 'both' });
            
            // Verify kerning pairs are preserved
            const reimportedKernCount = Object.keys(reimportState.kerning).length;
            
            // Not all kerning pairs can be preserved if they involve glyphs not in our range
            // Just verify we have at least some kerning preserved
            assert.ok(reimportedKernCount > 0, 
                `Should have some kerning pairs after roundtrip: original=${kernPairCount}, reimported=${reimportedKernCount}`);
            
            // Verify specific kerning pairs that should definitely exist (if they were in original)
            // Common letter pairs that should be in A-Z a-z range
            let matchedPairs = 0;
            for (const [pair, value] of Object.entries(originalKerning)) {
                if (reimportState.kerning[pair] !== undefined) {
                    matchedPairs++;
                    // Check value is close (within rounding)
                    const diff = Math.abs(reimportState.kerning[pair] - value);
                    assert.ok(diff <= 1, `Kerning for ${pair} should be preserved: original=${value}, reimported=${reimportState.kerning[pair]}`);
                }
            }
            assert.ok(matchedPairs > 10, `Should have matched at least 10 kerning pairs, got ${matchedPairs}`);
        });
        
        it('should preserve ligatures through roundtrip', () => {
            // Import RobotoFlex which has ligatures
            const buffer = readFileSync('./test/fonts/RobotoFlex-Variable.ttf');
            const importer = new FontImporter(opentype);
            const state = new FontEditorState();
            
            importer.import(state, buffer.buffer, { range: 'lowercase', importVF: false });
            
            const originalLigatures = [...state.ligatures];
            const ligCount = originalLigatures.length;
            
            // Skip if no ligatures
            if (ligCount === 0) {
                console.log('No ligatures found in import, skipping roundtrip test');
                return;
            }
            
            // Verify all ligature result glyphs are imported
            for (const lig of originalLigatures) {
                assert.ok(state.glyphs[lig.result] !== undefined, 
                    `Ligature result glyph '${lig.result}' should be imported`);
            }
            
            // Export
            const builder = new FontBuilder(state, opentype);
            const exportedBuffer = builder.toArrayBuffer();
            
            // Re-import
            const reimportState = new FontEditorState();
            importer.import(reimportState, exportedBuffer, { range: 'lowercase' });
            
            // Verify ligatures are preserved
            const reimportedLigCount = reimportState.ligatures.length;
            // All ligatures should be preserved
            assert.ok(reimportedLigCount >= ligCount, 
                `Ligatures should be preserved: original=${ligCount}, reimported=${reimportedLigCount}. ` +
                `Original: ${originalLigatures.map(l => l.sequence + '->' + l.result).join(', ')}. ` +
                `Reimported: ${reimportState.ligatures.map(l => l.sequence + '->' + l.result).join(', ')}`);
            
            
            // Check that specific common ligatures exist
            const sequences = reimportState.ligatures.map(l => l.sequence);
            for (const lig of originalLigatures) {
                assert.ok(sequences.includes(lig.sequence), 
                    `Ligature sequence ${lig.sequence} should be preserved`);
                
                // Also verify the result glyph exists
                const reimportedLig = reimportState.ligatures.find(l => l.sequence === lig.sequence);
                assert.ok(reimportedLig, `Should find ligature for sequence ${lig.sequence}`);
                assert.ok(reimportState.glyphs[reimportedLig.result], 
                    `Ligature result glyph ${reimportedLig.result} should exist in state.glyphs`);
            }
        });
        
        it('should preserve JSON state through serialization cycle', () => {
            // Create state with various metrics
            const state = new FontEditorState({
                unitsPerEm: 2048,
                ascender: 1900,
                descender: -500,
                sidebearing: 50
            });
            state.addGlyph('a', contours([[0, 0], [500, 0], [500, 800], [0, 800]]), 600);
            state.addGlyph('b', contours([[0, 0], [450, 0], [450, 900], [0, 900]]), 550);
            state.kerning = { 'ab': -20 };
            state.ligatures = [{ sequence: 'ab', result: 'a', enabled: true }];
            
            // Serialize to JSON
            const json = state.toJSON();
            
            // Verify all metrics are in JSON
            assert.strictEqual(json.unitsPerEm, 2048);
            assert.strictEqual(json.ascender, 1900);
            assert.strictEqual(json.descender, -500);
            assert.strictEqual(json.sidebearing, 50);
            
            // Deserialize
            const restoredState = new FontEditorState();
            restoredState.fromJSON(json);
            
            // Verify metrics restored
            assert.strictEqual(restoredState.unitsPerEm, 2048);
            assert.strictEqual(restoredState.ascender, 1900);
            assert.strictEqual(restoredState.descender, -500);
            assert.strictEqual(restoredState.sidebearing, 50);
            
            // Verify glyphs restored
            assert.ok(restoredState.glyphs['a']);
            assert.ok(restoredState.glyphs['b']);
            assert.strictEqual(restoredState.glyphWidths['a'], 600);
            assert.strictEqual(restoredState.glyphWidths['b'], 550);
            
            // Verify kerning and ligatures
            assert.strictEqual(restoredState.kerning['ab'], -20);
            assert.strictEqual(restoredState.ligatures.length, 1);
            assert.strictEqual(restoredState.ligatures[0].sequence, 'ab');
        });
        
        it('should import ligature result glyphs when calling _importLigatureData directly', () => {
            // This tests the browser flow where the HTML calls _importLigatureData
            // separately from the main import (which is what happens during confirmImport)
            const buffer = readFileSync('./test/fonts/RobotoFlex-Variable.ttf');
            const font = opentype.parse(buffer.buffer);
            
            // Create state with just glyphs (simulating HTML's confirmImport flow)
            const state = {
                glyphs: {},
                glyphWidths: {},
                kerning: {},
                ligatures: []
            };
            
            // Import a-z glyphs manually (like the HTML does)
            const extractGlyphContours = (glyph) => {
                if (!glyph || !glyph.points || glyph.points.length === 0) return [];
                const contours = [];
                let currentContour = [];
                for (const point of glyph.points) {
                    if (point.lastPointOfContour) {
                        currentContour.push({ x: point.x, y: point.y, onCurve: point.onCurve !== false });
                        contours.push(currentContour);
                        currentContour = [];
                    } else {
                        currentContour.push({ x: point.x, y: point.y, onCurve: point.onCurve !== false });
                    }
                }
                return contours;
            };
            
            for (let i = 97; i <= 122; i++) { // a-z
                const char = String.fromCharCode(i);
                const glyph = font.charToGlyph(char);
                if (glyph && glyph.index !== 0 && glyph.points) {
                    const contours = extractGlyphContours(glyph);
                    if (contours.length > 0) {
                        state.glyphs[char] = contours;
                        state.glyphWidths[char] = glyph.advanceWidth;
                    }
                }
            }
            
            // Now call _importLigatureData directly (like HTML does)
            const importer = new FontImporter(opentype);
            importer._importLigatureData(state, font, false);
            
            // Verify ligatures were imported
            assert.ok(state.ligatures.length > 0, 'Should have imported ligatures');
            
            // Verify ligature result glyphs were also imported
            const underscoreGlyphs = Object.keys(state.glyphs).filter(k => k.startsWith('_'));
            assert.ok(underscoreGlyphs.length > 0, 
                'Should have imported underscore-prefixed ligature result glyphs');
            
            // Verify each ligature has its result glyph
            for (const lig of state.ligatures) {
                assert.ok(state.glyphs[lig.result] !== undefined, 
                    `Ligature '${lig.sequence}' result glyph '${lig.result}' should exist in state.glyphs`);
            }
        });
    });
    
    describe('Export Validation', () => {
        describe('glyph path validation', () => {
            it('should pass validation when glyphs have paths', () => {
                const state = new FontEditorState();
                state.addGlyph('A', contours([[0, 0], [320, 700], [640, 0]]));
                state.addGlyph('B', contours([[0, 0], [0, 700], [350, 700], [350, 0]]));
                
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
                state.addGlyph('X', contours([[0, 0], [210, 350], [420, 0], [280, 210], [420, 420], [210, 350], [0, 420], [140, 210]]));
                
                const builder = new FontBuilder(state, opentype);
                // Should not throw
                const font = builder.build({ validate: true, validateRoundTrip: true });
                assert.ok(font);
            });
            
            it('should preserve glyph paths after export and reparse', () => {
                const state = new FontEditorState();
                state.addGlyph('T', contours([[140, 0], [140, 490], [0, 490], [0, 700], [490, 700], [490, 490], [350, 490], [350, 0]]));
                
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
                const state = new FontEditorState({ sidebearing: 0 });
                state.addGlyph('W', contours([[0, 700], [140, 0], [280, 420], [420, 0], [560, 700]]));
                state.setGlyphWidth('W', 600);
                
                const builder = new FontBuilder(state, opentype);
                const buffer = builder.toArrayBuffer();
                
                const parsed = opentype.parse(buffer);
                const glyphW = parsed.charToGlyph('W');
                
                // Width should be 600 + sidebearing (0) = 600 (scale = 1, data in font units)
                assert.equal(glyphW.advanceWidth, 600, 'Advance width should be preserved');
            });
            
            it('should compute width from bounding box when not explicit', () => {
                const state = new FontEditorState({ sidebearing: 0 });
                // Glyph from x=0 to x=560
                state.addGlyph('H', contours([[0, 0], [0, 700], [560, 700], [560, 0]]));
                // No explicit width set
                
                const builder = new FontBuilder(state, opentype);
                const buffer = builder.toArrayBuffer();
                
                const parsed = opentype.parse(buffer);
                const glyphH = parsed.charToGlyph('H');
                
                // Width should be maxX (560) + sidebearing (0) = 560 (scale = 1, data in font units)
                assert.equal(glyphH.advanceWidth, 560, 'Advance width should be computed from bounds');
            });
        });
    });
    
    describe('Edit-Export-Import Roundtrip', () => {
        it('should preserve edited glyph points after export and reimport', () => {
            // Create state with initial glyph
            const state = new FontEditorState({ sidebearing: 0 });
            state.addGlyph('A', contours([[0, 0], [320, 700], [640, 0]]));
            
            // "Edit" the glyph - simulate user modification
            state.glyphs['A'] = contours([[70, 70], [350, 750], [630, 70]]);
            
            // Export to font
            const builder = new FontBuilder(state, opentype);
            const buffer = builder.toArrayBuffer();
            
            // Import back
            const importer = new FontImporter(opentype);
            const newState = new FontEditorState();
            importer.import(newState, buffer, { range: 'uppercase' });
            
            // Verify the imported glyph has the EDITED points, not original
            assert.ok(newState.glyphs['A'], 'Glyph A should exist after import');
            const importedContours = newState.glyphs['A'];
            
            // Check contour structure
            assert.ok(Array.isArray(importedContours) && importedContours.length > 0, 'Should have contours');
            const importedPoints = importedContours[0]; // First contour
            
            // Check point count matches
            assert.equal(importedPoints.length, 3, 'Point count should match');
            
            // Check points are approximately the edited ones (now scale=1)
            const editedPoints = [[70, 70], [350, 750], [630, 70]];
            for (let i = 0; i < editedPoints.length; i++) {
                const origX = editedPoints[i][0];
                const origY = editedPoints[i][1];
                const impX = importedPoints[i].x;
                const impY = importedPoints[i].y;
                
                // Allow tolerance for rounding
                assert.ok(Math.abs(impX - origX) < 2, `Point ${i} X should be close: ${impX} vs ${origX}`);
                assert.ok(Math.abs(impY - origY) < 2, `Point ${i} Y should be close: ${impY} vs ${origY}`);
            }
        });
        
        it('should export the current state, not initial state', () => {
            const state = new FontEditorState({ sidebearing: 0 });
            
            // Add initial glyphs
            state.addGlyph('A', contours([[0, 0], [320, 700], [640, 0]]));
            state.addGlyph('B', contours([[0, 0], [0, 700], [350, 700], [350, 0]]));
            
            // Modify A completely
            state.glyphs['A'] = contours([[140, 140], [420, 750], [700, 140]]);
            
            // Build font and check the path is the modified one
            const builder = new FontBuilder(state, opentype);
            const font = builder.build({ validate: false, validateRoundTrip: false });
            
            const glyphA = font.charToGlyph('A');
            assert.ok(glyphA.path, 'Glyph A should have path');
            
            // Path should start at the modified point (scale=1)
            const firstCmd = glyphA.path.commands.find(c => c.type === 'M');
            assert.ok(firstCmd, 'Should have moveTo command');
            assert.equal(firstCmd.x, 140, 'First point X should be modified value');
            assert.equal(firstCmd.y, 140, 'First point Y should be modified value');
        });
        
        it('should preserve multiple glyphs with edits', () => {
            const state = new FontEditorState();
            
            // Add and modify multiple glyphs
            state.addGlyph('X', contours([[0, 0], [560, 700], [560, 0], [0, 700]]));
            state.addGlyph('Y', contours([[0, 700], [280, 350], [560, 700], [280, 0]]));
            state.addGlyph('Z', contours([[0, 700], [560, 700], [0, 0], [560, 0]]));
            
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
            
            const state = new FontEditorState({ sidebearing: 0 });
            state.addGlyph('A', contours([[0, 0], [320, 700], [640, 0]]));
            state.addGlyph('B', contours([[0, 0], [0, 700], [420, 700], [420, 0]]));
            
            // User edits: move point 1 of A from {x:320, y:700} to {x:350, y:750}
            state.glyphs['A'][0][1] = { x: 350, y: 750, onCurve: true };
            
            // User edits: widen B
            state.glyphs['B'] = contours([[0, 0], [0, 700], [560, 700], [560, 0]]);
            
            // Export
            const builder = new FontBuilder(state, opentype);
            const buffer = builder.toArrayBuffer();
            
            // Reimport - also use sidebearing: 0 for consistent coordinates
            const importer = new FontImporter(opentype);
            const newState = new FontEditorState({ sidebearing: 0 });
            importer.import(newState, buffer, { range: 'uppercase' });
            
            // Verify A was modified
            const importedA = newState.glyphs['A'];
            assert.ok(importedA, 'Glyph A should exist');
            assert.ok(importedA[0], 'A should have first contour');
            assert.equal(importedA[0].length, 3, 'A contour should have 3 points');
            
            // Point 1 should be close to {x:350, y:750}
            const pt1 = importedA[0][1];
            assert.ok(Math.abs(pt1.x - 350) < 2, `A point 1 X should be ~350, got ${pt1.x}`);
            assert.ok(Math.abs(pt1.y - 750) < 2, `A point 1 Y should be ~750, got ${pt1.y}`);
            
            // Verify B was modified  
            const importedB = newState.glyphs['B'];
            assert.ok(importedB, 'Glyph B should exist');
            assert.ok(importedB[0], 'B should have first contour');
            
            // B's rightmost point should be at x=560
            const maxX = Math.max(...importedB[0].map(p => p.x));
            assert.ok(Math.abs(maxX - 560) < 2, `B max X should be ~560, got ${maxX}`);
        });
        
        it('should correctly scale widths through export-reimport', () => {
            const state = new FontEditorState();
            
            // Add glyph with specific width
            state.addGlyph('W', contours([[0, 700], [280, 0], [560, 700], [840, 0], [1120, 700]]));
            state.setGlyphWidth('W', 1200); // Explicit width
            
            // Export and reimport
            const builder = new FontBuilder(state, opentype);
            const buffer = builder.toArrayBuffer();
            
            const importer = new FontImporter(opentype);
            const newState = new FontEditorState();
            importer.import(newState, buffer, { range: 'uppercase' });
            
            // Check width is preserved (approximately)
            const importedWidth = newState.glyphWidths['W'] || 0;
            // Width should be close to 1200
            assert.ok(importedWidth > 1100, `Width should be preserved, got ${importedWidth}`);
        });
    });
    
    describe('Font Validation', () => {
        it('should create .notdef glyph with a drawing (not empty)', () => {
            const state = new FontEditorState();
            state.addGlyph('A', contours([[0, 0], [320, 700], [640, 0]]));
            
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
            state.addGlyph('A', contours([[0, 0], [320, 700], [640, 0]]));
            
            const builder = new FontBuilder(state, opentype);
            const font = builder.build();
            
            // Check version in names
            const version = font.names.windows?.version?.en;
            assert.ok(version, 'Version should be set in names');
            assert.ok(version.includes('1.'), 'Version should match 1.x format');
        });
        
        it('should create STAT table for variable fonts', () => {
            const state = new FontEditorState();
            state.addGlyph('A', contours([[0, 0], [320, 700], [640, 0]]));
            state.setVariableFontEnabled(true);
            state.addAxis({ tag: 'wght', name: 'Weight', minValue: 100, defaultValue: 400, maxValue: 900 });
            state.addMaster('Light', { wght: 100 }, { 'A': contours([[0, 0], [210, 560], [420, 0]]) });
            state.addMaster('Bold', { wght: 900 }, { 'A': contours([[0, 0], [400, 750], [800, 0]]) });
            
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
        
        describe('contour format handling', () => {
            
            it('should detect single vs multiple contours', () => {
                // Test the format detection logic for contour format
                // Single contour: [[{x, y, onCurve}, ...]]
                // Multiple contours: [[{x, y, onCurve}, ...], [{x, y, onCurve}, ...]]
                
                const singleContour = contours([[0, 0], [400, 800], [800, 0]]);
                const multiContour = multiContours([
                    [[0, 0], [400, 800], [800, 0]],
                    [[160, 160], [240, 400], [320, 160]]
                ]);
                
                // Single contour has length 1
                assert.equal(singleContour.length, 1, 'Single contour should have 1 contour');
                // Multi contour has length 2
                assert.equal(multiContour.length, 2, 'Multi contour should have 2 contours');
                
                // Each contour is an array of point objects
                assert.ok(singleContour[0][0].x !== undefined, 'Points should have x property');
                assert.ok(singleContour[0][0].y !== undefined, 'Points should have y property');
                assert.ok(singleContour[0][0].onCurve !== undefined, 'Points should have onCurve property');
            });
            
            it('should flatten contours for interpolation', () => {
                // Flatten all points from all contours
                const flattenContours = (contours) => {
                    if (!contours || contours.length === 0) return [];
                    return contours.flat();
                };
                
                const single = contours([[0, 0], [400, 800], [800, 0]]);
                const multi = multiContours([
                    [[0, 0], [400, 800]],
                    [[160, 160], [320, 160]]
                ]);
                
                const flatSingle = flattenContours(single);
                assert.equal(flatSingle.length, 3, 'Flattened single contour should have 3 points');
                assert.equal(flatSingle[0].x, 0);
                assert.equal(flatSingle[1].x, 400);
                
                const flatMulti = flattenContours(multi);
                assert.equal(flatMulti.length, 4, 'Flattened multi contour should have 4 points');
                assert.equal(flatMulti[2].x, 160);
            });
            
            it('should build SVG path from contours', () => {
                // Build SVG path from contour format
                const buildSVGPath = (contours, height = 800) => {
                    if (!contours || contours.length === 0) return '';
                    
                    let d = '';
                    for (const points of contours) {
                        if (points && points.length > 0) {
                            d += 'M' + points.map(p => p.x + ' ' + (height - p.y)).join(' L') + ' Z ';
                        }
                    }
                    return d.trim();
                };
                
                // Single contour
                const single = contours([[0, 0], [400, 800], [800, 0]]);
                assert.equal(buildSVGPath(single), 'M0 800 L400 0 L800 800 Z');
                
                // Multi contour (two shapes)
                const multi = multiContours([
                    [[0, 0], [400, 800]],
                    [[160, 160], [240, 400]]
                ]);
                assert.equal(buildSVGPath(multi), 'M0 800 L400 0 Z M160 640 L240 400 Z');
                
                // Empty data
                assert.equal(buildSVGPath([]), '');
                assert.equal(buildSVGPath(null), '');
            });
            
            it('should not produce NaN in SVG path coordinates', () => {
                const buildSVGPath = (contours, height = 800) => {
                    if (!contours || contours.length === 0) return '';
                    
                    let d = '';
                    for (const points of contours) {
                        if (points && points.length > 0) {
                            d += 'M' + points.map(p => p.x + ' ' + (height - p.y)).join(' L') + ' Z ';
                        }
                    }
                    return d.trim();
                };
                
                // Test with various valid contour data
                const testCases = [
                    contours([[0, 0], [400, 800], [800, 0]]),
                    multiContours([[[0, 0], [400, 800], [800, 0]]]),
                    multiContours([[[0, 0]], [[400, 400]]]),
                    multiContours([[[120, 200], [280, 360]]])
                ];
                
                for (const data of testCases) {
                    const path = buildSVGPath(data);
                    assert.ok(!path.includes('NaN'), `Path should not contain NaN: ${path}`);
                    assert.ok(!path.includes('undefined'), `Path should not contain undefined: ${path}`);
                }
            });
        });
        
        describe('contour interpolation for variable fonts', () => {
            
            it('should interpolate contours correctly', () => {
                // Interpolation logic for contour format
                const interpolateContours = (c1, c2, t) => {
                    if (c1.length !== c2.length) return c1;
                    
                    return c1.map((contour1, contourIdx) => {
                        const contour2 = c2[contourIdx];
                        if (!contour1 || !contour2 || contour1.length !== contour2.length) {
                            return contour1 || contour2 || [];
                        }
                        return contour1.map((pt, i) => ({
                            x: pt.x + (contour2[i].x - pt.x) * t,
                            y: pt.y + (contour2[i].y - pt.y) * t,
                            onCurve: pt.onCurve
                        }));
                    });
                };
                
                // Test single contour interpolation (font units)
                const shape1 = contours([[0, 0], [400, 800]]);
                const shape2 = contours([[0, 0], [600, 800]]);
                
                const midpoint = interpolateContours(shape1, shape2, 0.5);
                assert.equal(midpoint[0][0].x, 0);
                assert.equal(midpoint[0][1].x, 500, 'Midpoint X should be 500');
                assert.equal(midpoint[0][1].y, 800);
                
                // Test extrapolation (t > 1)
                const extrapolated = interpolateContours(shape1, shape2, 2);
                assert.equal(extrapolated[0][1].x, 800, 'Extrapolated X should be 800');
                
                // Test multi-contour interpolation
                const multi1 = multiContours([[[0, 0]], [[400, 400]]]);
                const multi2 = multiContours([[[0, 0]], [[600, 600]]]);
                
                const multiMidpoint = interpolateContours(multi1, multi2, 0.5);
                assert.equal(multiMidpoint[1][0].x, 500);
                assert.equal(multiMidpoint[1][0].y, 500);
            });
        });
    });

    describe('Multi-Shape Glyph Export', () => {
        it('should export fonts with multi-shape glyphs without NaN advanceWidth', () => {
            // Glyph with multiple shapes (like the letter 'B' with inner counters)
            // Using proper font units (unitsPerEm = 800)
            const multiShapeGlyph = multiContours([
                [[0, 0], [600, 0], [600, 700], [0, 700]], // outer shape
                [[100, 100], [500, 100], [500, 600], [100, 600]]  // inner counter
            ]);
            
            const state = {
                familyName: 'Test Font',
                styleName: 'Regular',
                unitsPerEm: 800,
                ascender: 700,
                descender: -100,
                glyphs: {
                    'A': contours([[0, 0], [300, 700], [600, 0]]),  // simple single-shape
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
            const multiShapeGlyph = multiContours([
                [[0, 0], [600, 0], [600, 700], [0, 700]],
                [[100, 100], [500, 100], [500, 600], [100, 600]]
            ]);
            
            const state = {
                familyName: 'Test Font',
                styleName: 'Regular',
                unitsPerEm: 800,
                ascender: 700,
                descender: -100,
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
            const multiShapeGlyph = multiContours([
                [[0, 0], [700, 0], [700, 600], [0, 600]], // outer: width 700
                [[100, 100], [600, 100], [600, 500], [100, 500]]  // inner: narrower
            ]);
            
            const state = {
                familyName: 'Test Font',
                styleName: 'Regular',
                unitsPerEm: 800,
                ascender: 700,
                descender: -100,
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
            // Width should be 700 + sidebearing (0) = 700 (based on outer shape maxX)
            assert.equal(xGlyph.advanceWidth, 700);
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
            
            // Shape 1: outer rectangle (4 points) in font units
            const baseGlyph = multiContours([
                [[0, 0], [560, 0], [560, 700], [0, 700]],
                [[140, 140], [420, 140], [420, 350], [140, 350]]
            ]);
            
            // Bold master - shapes are wider
            const boldGlyph = multiContours([
                [[0, 0], [700, 0], [700, 700], [0, 700]],
                [[70, 140], [630, 140], [630, 350], [70, 350]]
            ]);
            
            state.glyphs = { 'A': baseGlyph };
            state.glyphWidths = { 'A': 560 };
            
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
                    glyphs: { 'A': baseGlyph },
                    glyphWidths: { 'A': 560 }
                },
                {
                    name: 'Bold',
                    coords: { wght: 700 },
                    glyphs: { 'A': boldGlyph },
                    glyphWidths: { 'A': 700 }
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
            
            // Create two glyphs with very different shapes (using font units)
            const glyphA_base = contours([[0, 0], [560, 0], [280, 700]]);  // Triangle pointing up
            const glyphA_bold = contours([[0, 0], [700, 0], [350, 750]]); // Larger triangle
            
            const glyphB_base = contours([[0, 700], [560, 700], [560, 0], [0, 0]]);  // Rectangle
            const glyphB_bold = contours([[0, 700], [560, 700], [560, 0], [0, 0]]);  // Same rectangle (no change)
            
            state.glyphs = {
                'A': glyphA_base,
                'B': glyphB_base
            };
            state.glyphWidths = { 'A': 560, 'B': 560 };
            
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
                    glyphWidths: { 'A': 560, 'B': 560 }
                },
                {
                    name: 'Bold',
                    coords: { wght: 700 },
                    glyphs: { 'A': glyphA_bold, 'B': glyphB_bold },
                    glyphWidths: { 'A': 700, 'B': 560 }
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
            state.addGlyph('A', contours([[0, 0], [600, 0], [600, 700], [0, 700]]));
            state.setGlyphWidth('A', 600);
            
            // Define axis: wght 100-900, default 400
            state.addAxis({ tag: 'wght', name: 'Weight', minValue: 100, defaultValue: 400, maxValue: 900 });
            state.setVariableFontEnabled(true);
            
            // Light master at wght=100: narrow glyph (width 300)
            state.addMaster('Light', { wght: 100 }, { 'A': contours([[0, 0], [300, 0], [300, 700], [0, 700]]) }, { 'A': 300 });
            
            // Note: Default master at wght=400 is already created from addGlyph above
            
            // No master at 900, so extrapolation is needed
            
            const builder = new FontBuilder(state, opentype);
            const font = builder.build({ validate: true, validateRoundTrip: false });
            const buffer = font.toArrayBuffer();
            const parsed = opentype.parse(buffer);
            
            const glyphA = parsed.charToGlyph('A');
            assert.ok(glyphA, 'Should find glyph A');
            
            // Width at wght=100: should be ~300
            const width100 = parsed.variation.process.getTransform(glyphA, { wght: 100 }).advanceWidth;
            
            // Width at wght=400 (default): should be ~600
            const width400 = parsed.variation.process.getTransform(glyphA, { wght: 400 }).advanceWidth;
            
            // Width at wght=900 (extrapolated): should be ~900 (extrapolating the trend)
            // From 100->400 (300 range), width goes 300->600 (delta of 300)
            // From 400->900 (500 range), extrapolation should add 300 * (500/300) = 500
            // So width at 900 should be approximately 600 + 500 = 1100
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
            state.addGlyph('A', contours([[0, 0], [600, 0], [600, 700], [0, 700]]));
            state.setGlyphWidth('A', 600);
            
            // Define axis: wght 100-900, default 400
            state.addAxis({ tag: 'wght', name: 'Weight', minValue: 100, defaultValue: 400, maxValue: 900 });
            state.setVariableFontEnabled(true);
            
            // Bold master at wght=700: wider glyph (width 900)
            // No light master, so extrapolation is needed for wght < 400
            state.addMaster('Bold', { wght: 700 }, { 'A': contours([[0, 0], [900, 0], [900, 700], [0, 700]]) }, { 'A': 900 });
            
            const builder = new FontBuilder(state, opentype);
            const font = builder.build({ validate: true, validateRoundTrip: false });
            const buffer = font.toArrayBuffer();
            const parsed = opentype.parse(buffer);
            
            const glyphA = parsed.charToGlyph('A');
            assert.ok(glyphA, 'Should find glyph A');
            
            // Width at wght=700: should be ~900
            const width700 = parsed.variation.process.getTransform(glyphA, { wght: 700 }).advanceWidth;
            
            // Width at wght=400 (default): should be ~600
            const width400 = parsed.variation.process.getTransform(glyphA, { wght: 400 }).advanceWidth;
            
            // Width at wght=100 (extrapolated in min direction): should be less than 600
            const width100 = parsed.variation.process.getTransform(glyphA, { wght: 100 }).advanceWidth;
            
            // Width at wght=900 (extrapolated in max direction): should be more than 900
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
            state.addGlyph('A', contours([[0, 0], [600, 0], [600, 700], [0, 700]]));
            state.setGlyphWidth('A', 600);
            
            state.addAxis({ tag: 'wght', name: 'Weight', minValue: 100, defaultValue: 400, maxValue: 900 });
            state.setVariableFontEnabled(true);
            
            // Light master at 100 (narrow)
            state.addMaster('Light', { wght: 100 }, { 'A': contours([[0, 0], [300, 0], [300, 700], [0, 700]]) }, { 'A': 300 });
            
            // Medium master at 500 (intermediate - with a "kink" correction)
            // Linear interpolation between 400->900 would give width ~720 at 500
            // But we want width 660 (slight correction)
            state.addMaster('Medium', { wght: 500 }, { 'A': contours([[0, 0], [660, 0], [660, 700], [0, 700]]) }, { 'A': 660 });
            
            // Bold master at 900 (wide)
            state.addMaster('Bold', { wght: 900 }, { 'A': contours([[0, 0], [1200, 0], [1200, 700], [0, 700]]) }, { 'A': 1200 });
            
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
            state.addGlyph('A', contours([[0, 0], [600, 0], [600, 700], [0, 700]]));
            state.setGlyphWidth('A', 600);
            state.addGlyph('B', contours([[0, 0], [600, 0], [600, 700], [0, 700]]));
            state.setGlyphWidth('B', 600);
            
            state.addAxis({ tag: 'wght', name: 'Weight', minValue: 100, defaultValue: 400, maxValue: 900 });
            state.setVariableFontEnabled(true);
            
            // Light master with both A and B
            state.addMaster('Light', { wght: 100 }, { 
                'A': contours([[0, 0], [300, 0], [300, 700], [0, 700]]),
                'B': contours([[0, 0], [300, 0], [300, 700], [0, 700]])
            }, { 'A': 300, 'B': 300 });
            
            // Intermediate master at 500 with ONLY glyph A (B doesn't participate)
            // This is the "sparse" feature - not all glyphs need to be defined
            state.addMaster('Medium', { wght: 500 }, { 
                'A': contours([[0, 0], [660, 0], [660, 700], [0, 700]])
            }, { 'A': 660 });
            
            // Bold master with both A and B
            state.addMaster('Bold', { wght: 900 }, { 
                'A': contours([[0, 0], [1200, 0], [1200, 700], [0, 700]]),
                'B': contours([[0, 0], [1200, 0], [1200, 700], [0, 700]])
            }, { 'A': 1200, 'B': 1200 });
            
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
            
            // Add base glyphs (using font units)
            state.addGlyph('A', contours([[0, 0], [600, 0], [600, 700], [0, 700]]));
            state.addGlyph('B', contours([[0, 0], [600, 0], [600, 700], [0, 700]]));
            // Add ligature glyph (named A_B following standard convention)
            state.addGlyph('A_B', contours([[0, 0], [1200, 0], [1200, 700], [0, 700]]));
            
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
            
            // Add base glyphs (using font units)
            state.addGlyph('f', contours([[0, 0], [400, 0], [400, 700], [0, 700]]));
            state.addGlyph('i', contours([[0, 0], [250, 0], [250, 700], [0, 700]]));
            state.addGlyph('l', contours([[0, 0], [250, 0], [250, 700], [0, 700]]));
            // Add ligature glyphs
            state.addGlyph('fi', contours([[0, 0], [650, 0], [650, 700], [0, 700]]));
            state.addGlyph('fl', contours([[0, 0], [650, 0], [650, 700], [0, 700]]));
            
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
            
            // Add base glyphs (using font units)
            state.addGlyph('A', contours([[0, 0], [600, 0], [600, 700], [0, 700]]));
            state.addGlyph('B', contours([[0, 0], [600, 0], [600, 700], [0, 700]]));
            state.addGlyph('A_B', contours([[0, 0], [1200, 0], [1200, 700], [0, 700]]));
            
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
            
            // Add only 'A' glyph, not 'B' (using font units)
            state.addGlyph('A', contours([[0, 0], [600, 0], [600, 700], [0, 700]]));
            // Add ligature glyph
            state.addGlyph('A_B', contours([[0, 0], [1200, 0], [1200, 700], [0, 700]]));
            
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
            
            // Add regular glyphs (using font units)
            state.addGlyph('A', contours([[0, 0], [600, 0], [600, 700], [0, 700]]));
            state.addGlyph('B', contours([[0, 0], [600, 0], [600, 700], [0, 700]]));
            // Add ligature glyph with multi-char name - should NOT get unicode
            state.addGlyph('A_B', contours([[0, 0], [1200, 0], [1200, 700], [0, 700]]));
            
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
            
            // Add base glyphs (using font units)
            state.addGlyph('A', contours([[0, 0], [600, 0], [600, 700], [0, 700]]));
            state.addGlyph('B', contours([[0, 0], [600, 0], [600, 700], [0, 700]]));
            state.addGlyph('A_B', contours([[0, 0], [1200, 0], [1200, 700], [0, 700]]));
            
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
        
        it('should export dlig (discretionary ligatures) feature separately from liga', () => {
            const state = new FontEditorState({
                familyName: 'Dlig Test',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200
            });
            
            // Add base glyphs
            state.addGlyph('A', contours([[0, 0], [600, 0], [600, 700], [0, 700]]));
            state.addGlyph('f', contours([[0, 0], [400, 0], [400, 700], [0, 700]]));
            state.addGlyph('i', contours([[0, 0], [250, 0], [250, 700], [0, 700]]));
            
            // Add dlig result glyph (AA -> larger A)
            state.addGlyph('A.dlig', contours([[0, 0], [800, 0], [800, 800], [0, 800]]));
            // Add liga result glyph (fi)
            state.addGlyph('fi', contours([[0, 0], [650, 0], [650, 700], [0, 700]]));
            
            // Add dlig substitution (AA -> A.dlig)
            state.ligatures.push({ sequence: 'AA', result: 'A.dlig', enabled: true, feature: 'dlig' });
            // Add liga substitution (fi -> fi)
            state.ligatures.push({ sequence: 'fi', result: 'fi', enabled: true, feature: 'liga' });
            
            const builder = new FontBuilder(state, opentype);
            const font = builder.build({ validate: true, validateRoundTrip: false });
            const buffer = font.toArrayBuffer();
            const parsed = opentype.parse(buffer);
            
            // Verify GSUB table has both liga and dlig features
            assert.ok(parsed.tables.gsub, 'Font should have GSUB table');
            const gsub = parsed.tables.gsub;
            
            const ligaFeature = gsub.features.find(f => f.tag === 'liga');
            const dligFeature = gsub.features.find(f => f.tag === 'dlig');
            
            assert.ok(ligaFeature, 'GSUB should have liga feature');
            assert.ok(dligFeature, 'GSUB should have dlig feature');
            
            // Verify dlig can be retrieved
            const dligLigatures = parsed.substitution.getLigatures('dlig');
            assert.ok(dligLigatures.length > 0, 'Should have dlig ligatures');
            
            // Verify the dlig content
            const dligSub = dligLigatures[0];
            assert.equal(dligSub.sub.length, 2, 'dlig should substitute 2 glyphs');
        });
        
        it('should import dlig ligatures from existing font with feature property', async () => {
            // This tests that when importing a font with dlig, the feature property is preserved
            const state = new FontEditorState({
                familyName: 'Dlig Import Test',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200
            });
            
            // Add base glyphs
            state.addGlyph('A', contours([[0, 0], [600, 0], [600, 700], [0, 700]]));
            state.addGlyph('A.dlig', contours([[0, 0], [800, 0], [800, 800], [0, 800]]));
            
            // Add dlig substitution
            state.ligatures.push({ sequence: 'AA', result: 'A.dlig', enabled: true, feature: 'dlig' });
            state.features = { liga: true, kern: true, dlig: true, smcp: false };
            
            // Build and export
            const builder = new FontBuilder(state, opentype);
            const font = builder.build({ validate: true, validateRoundTrip: false });
            const buffer = font.toArrayBuffer();
            
            // Re-import
            const importState = new FontEditorState();
            const importer = new FontImporter(opentype);
            await importer.import(importState, buffer, { verbose: false });
            
            // Verify dlig was imported with feature property
            const dligLigs = importState.ligatures.filter(l => l.feature === 'dlig');
            assert.ok(dligLigs.length > 0, 'Should have imported dlig ligatures');
            assert.ok(importState.features.dlig, 'dlig feature should be enabled after import');
        });
    });

    describe('Kerning and kern Table Export', () => {
        it('should export kern table with kerning pairs', () => {
            const state = new FontEditorState({
                familyName: 'Kern Test',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200
            });

            // Add glyphs
            state.addGlyph('A', contours([[0, 0], [600, 0], [600, 700], [0, 700]]));
            state.addGlyph('V', contours([[0, 0], [600, 0], [600, 700], [0, 700]]));
            state.addGlyph('T', contours([[0, 0], [600, 0], [600, 700], [0, 700]]));
            state.addGlyph('o', contours([[0, 0], [400, 0], [400, 500], [0, 500]]));

            // Add kerning pairs (in editor units)
            state.kerning = {
                'AV': -50,
                'To': -30
            };

            const builder = new FontBuilder(state, opentype);
            const font = builder.build({ validate: true, validateRoundTrip: false });
            const buffer = font.toArrayBuffer();
            const parsed = opentype.parse(buffer);

            // Verify kern table exists
            assert.ok(parsed.kerningPairs, 'Font should have kerningPairs');
            assert.ok(Object.keys(parsed.kerningPairs).length > 0, 'Should have kerning pairs');

            // Check kerning values (scaled from editor units to font units)
            // A is glyph index 1, V is glyph index 2 (after .notdef at 0)
            // The value should be negative (tighter kerning)
            const pairCount = Object.keys(parsed.kerningPairs).length;
            assert.equal(pairCount, 2, 'Should have 2 kerning pairs');
        });

        it('should not create kern table when no kerning defined', () => {
            const state = new FontEditorState({
                familyName: 'No Kern Test',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200
            });

            state.addGlyph('A', contours([[0, 0], [600, 0], [600, 700], [0, 700]]));
            state.addGlyph('V', contours([[0, 0], [600, 0], [600, 700], [0, 700]]));
            // No kerning

            const builder = new FontBuilder(state, opentype);
            const font = builder.build({ validate: true, validateRoundTrip: false });
            const buffer = font.toArrayBuffer();
            const parsed = opentype.parse(buffer);

            // kerningPairs should be empty
            assert.equal(Object.keys(parsed.kerningPairs).length, 0, 'Should have no kerning pairs');
        });

        it('should not create kern table when kern feature is disabled', () => {
            const state = new FontEditorState({
                familyName: 'Kern Disabled Test',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200
            });

            state.addGlyph('A', contours([[0, 0], [600, 0], [600, 700], [0, 700]]));
            state.addGlyph('V', contours([[0, 0], [600, 0], [600, 700], [0, 700]]));
            state.kerning = { 'AV': -50 };
            state.features = { kern: false };

            const builder = new FontBuilder(state, opentype);
            const font = builder.build({ validate: true, validateRoundTrip: false });
            const buffer = font.toArrayBuffer();
            const parsed = opentype.parse(buffer);

            // kerningPairs should be empty since kern feature is disabled
            assert.equal(Object.keys(parsed.kerningPairs).length, 0, 'Should have no kerning pairs when kern disabled');
        });

        it('should skip kerning pairs with missing glyphs', () => {
            const state = new FontEditorState({
                familyName: 'Kern Missing Glyph Test',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200
            });

            state.addGlyph('A', contours([[0, 0], [600, 0], [600, 700], [0, 700]]));
            // V is NOT added
            state.kerning = { 'AV': -50 };

            const builder = new FontBuilder(state, opentype);
            const font = builder.build({ validate: true, validateRoundTrip: false });
            const buffer = font.toArrayBuffer();
            const parsed = opentype.parse(buffer);

            // kerningPairs should be empty since V doesn't exist
            assert.equal(Object.keys(parsed.kerningPairs).length, 0, 'Should have no kerning pairs when glyph missing');
        });

        it('should correctly scale kerning values from editor units', () => {
            const state = new FontEditorState({
                familyName: 'Kern Scale Test',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200
            });

            state.addGlyph('A', contours([[0, 0], [600, 0], [600, 700], [0, 700]]));
            state.addGlyph('V', contours([[0, 0], [600, 0], [600, 700], [0, 700]]));
            state.kerning = { 'AV': -100 }; // Large negative value

            const builder = new FontBuilder(state, opentype);
            const font = builder.build({ validate: true, validateRoundTrip: false });
            const buffer = font.toArrayBuffer();
            const parsed = opentype.parse(buffer);

            // Find the kerning value
            const keys = Object.keys(parsed.kerningPairs);
            assert.equal(keys.length, 1, 'Should have 1 kerning pair');
            const value = parsed.kerningPairs[keys[0]];
            assert.ok(value < 0, 'Kerning value should be negative');
        });

        it('should pass OTS validation with kerning', async () => {
            const state = new FontEditorState({
                familyName: 'OTS Kern Test',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200
            });

            state.addGlyph('A', contours([[0, 0], [600, 0], [600, 700], [0, 700]]));
            state.addGlyph('V', contours([[0, 0], [600, 0], [600, 700], [0, 700]]));
            state.addGlyph('T', contours([[0, 0], [600, 0], [600, 700], [0, 700]]));
            state.addGlyph('o', contours([[0, 0], [400, 0], [400, 500], [0, 500]]));
            state.kerning = {
                'AV': -50,
                'To': -30,
                'VA': -40
            };

            const builder = new FontBuilder(state, opentype);
            const font = builder.build({ validate: true, validateRoundTrip: false });
            const buffer = font.toArrayBuffer();

            // Write to temp file and run OTS
            const fs = await import('fs');
            const path = await import('path');
            const { execSync } = await import('child_process');
            const os = await import('os');

            const tempFile = path.join(os.tmpdir(), `test-kern-${Date.now()}.ttf`);
            fs.writeFileSync(tempFile, Buffer.from(buffer));

            try {
                const otsPath = path.join(process.cwd(), 'test/ots-9.2.0-macOS/ots-sanitize');
                const result = execSync(`"${otsPath}" "${tempFile}"`, { encoding: 'utf8' });
                assert.ok(result.includes('sanitized successfully'), 'OTS should pass');
            } catch (e) {
                assert.fail(`OTS validation failed: ${e.stderr || e.message}`);
            } finally {
                try { fs.unlinkSync(tempFile); } catch(e) {}
            }
        });
    });
});
