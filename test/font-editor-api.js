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
    extractPathPoints
} from '../docs/examples/font-editor-api.js';
import * as opentype from '../src/opentype.js';

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
    });
});
