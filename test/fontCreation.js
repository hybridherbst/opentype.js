import assert from 'assert';
import { Font, Glyph, Path, parse } from '../src/opentype.js';
import { VariationManager } from '../src/variation.js';

/**
 * Tests for font creation and export - validates that fonts created programmatically
 * (as would be done in the font-editor) are valid and can be parsed back.
 */
describe('Font Creation and Export', function() {

    describe('Basic Font Creation', function() {
        it('creates a valid font with simple glyphs', function() {
            const path = new Path();
            path.moveTo(0, 0);
            path.lineTo(400, 0);
            path.lineTo(400, 700);
            path.lineTo(0, 700);
            path.closePath();

            const glyphs = [
                new Glyph({ name: '.notdef', unicode: 0, advanceWidth: 0, path: new Path() }),
                new Glyph({ name: 'space', unicode: 32, advanceWidth: 250, path: new Path() }),
                new Glyph({ name: 'A', unicode: 65, advanceWidth: 500, path: path })
            ];

            const font = new Font({
                familyName: 'Test Font',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200,
                glyphs: glyphs
            });

            // Export to buffer
            const buffer = font.toArrayBuffer();
            assert.ok(buffer instanceof ArrayBuffer);
            assert.ok(buffer.byteLength > 0);

            // Parse it back
            const font2 = parse(buffer);
            assert.ok(font2);
            assert.ok(font2.names.windows || font2.names.unicode);
            const names = font2.names.windows || font2.names.unicode;
            assert.equal(names.fontFamily.en, 'Test Font');
            assert.equal(font2.unitsPerEm, 1000);
            assert.equal(font2.glyphs.length, 3);
        });

        it('creates fonts with multiple glyphs and correct unicodes', function() {
            const glyphs = [
                new Glyph({ name: '.notdef', unicode: 0, advanceWidth: 0, path: new Path() }),
            ];

            // Add A-Z
            for (let i = 65; i <= 90; i++) {
                const char = String.fromCharCode(i);
                const path = new Path();
                path.moveTo(0, 0);
                path.lineTo(400, 0);
                path.lineTo(200, 700);
                path.closePath();

                glyphs.push(new Glyph({
                    name: char,
                    unicode: i,
                    advanceWidth: 500,
                    path: path
                }));
            }

            const font = new Font({
                familyName: 'Alphabet Font',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200,
                glyphs: glyphs
            });

            const buffer = font.toArrayBuffer();
            const font2 = parse(buffer);

            assert.equal(font2.glyphs.length, 27); // .notdef + 26 letters

            // Check each letter can be found
            for (let i = 65; i <= 90; i++) {
                const glyph = font2.charToGlyph(String.fromCharCode(i));
                assert.ok(glyph, `Glyph for ${String.fromCharCode(i)} should exist`);
                assert.equal(glyph.unicode, i);
            }
        });

        it('preserves glyph path data through roundtrip', function() {
            const originalPath = new Path();
            originalPath.moveTo(50, 0);
            originalPath.lineTo(250, 0);
            originalPath.lineTo(300, 700);
            originalPath.lineTo(0, 700);
            originalPath.closePath();

            const font = new Font({
                familyName: 'Path Test',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200,
                glyphs: [
                    new Glyph({ name: '.notdef', unicode: 0, advanceWidth: 0, path: new Path() }),
                    new Glyph({ name: 'A', unicode: 65, advanceWidth: 400, path: originalPath })
                ]
            });

            const buffer = font.toArrayBuffer();
            const font2 = parse(buffer);

            const glyph = font2.charToGlyph('A');
            const commands = glyph.path.commands;

            // Should have moveTo, 3 lineTo, closePath = 5 commands
            assert.ok(commands.length >= 4);
            
            // Check first point
            const firstCmd = commands.find(c => c.type === 'M');
            assert.ok(firstCmd);
            assert.equal(firstCmd.x, 50);
            assert.equal(firstCmd.y, 0);
        });

        it('handles glyphs with curves', function() {
            const path = new Path();
            path.moveTo(0, 0);
            path.quadraticCurveTo(200, 400, 400, 0);
            path.closePath();

            const font = new Font({
                familyName: 'Curve Test',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200,
                glyphs: [
                    new Glyph({ name: '.notdef', unicode: 0, advanceWidth: 0, path: new Path() }),
                    new Glyph({ name: 'A', unicode: 65, advanceWidth: 500, path: path })
                ]
            });

            const buffer = font.toArrayBuffer();
            const font2 = parse(buffer);

            const glyph = font2.charToGlyph('A');
            assert.ok(glyph);
            assert.ok(glyph.path.commands.length > 0);
        });
    });

    describe('Variable Font Creation', function() {
        it('creates a valid variable font with one axis', function() {
            const path = new Path();
            path.moveTo(0, 0);
            path.lineTo(400, 0);
            path.lineTo(400, 700);
            path.lineTo(0, 700);
            path.closePath();

            const font = new Font({
                familyName: 'Variable Test',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200,
                glyphs: [
                    new Glyph({ name: '.notdef', unicode: 0, advanceWidth: 0, path: new Path() }),
                    new Glyph({ name: 'A', unicode: 65, advanceWidth: 500, path: path })
                ]
            });

            // Add variation axis
            font.variation = new VariationManager(font);
            font.variation.addAxis({
                tag: 'wght',
                name: 'Weight',
                minValue: 100,
                defaultValue: 400,
                maxValue: 900
            });

            const buffer = font.toArrayBuffer();
            const font2 = parse(buffer);

            assert.ok(font2.tables.fvar, 'Font should have fvar table');
            assert.equal(font2.tables.fvar.axes.length, 1);
            assert.equal(font2.tables.fvar.axes[0].tag, 'wght');
            assert.equal(font2.tables.fvar.axes[0].minValue, 100);
            assert.equal(font2.tables.fvar.axes[0].defaultValue, 400);
            assert.equal(font2.tables.fvar.axes[0].maxValue, 900);
        });

        it('creates a variable font with multiple axes', function() {
            const path = new Path();
            path.moveTo(0, 0);
            path.lineTo(400, 0);
            path.lineTo(400, 700);
            path.closePath();

            const font = new Font({
                familyName: 'Multi-Axis VF',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200,
                glyphs: [
                    new Glyph({ name: '.notdef', unicode: 0, advanceWidth: 0, path: new Path() }),
                    new Glyph({ name: 'A', unicode: 65, advanceWidth: 500, path: path })
                ]
            });

            font.variation = new VariationManager(font);
            
            font.variation.addAxis({
                tag: 'wght',
                name: 'Weight',
                minValue: 100,
                defaultValue: 400,
                maxValue: 900
            });

            font.variation.addAxis({
                tag: 'wdth',
                name: 'Width',
                minValue: 50,
                defaultValue: 100,
                maxValue: 200
            });

            const buffer = font.toArrayBuffer();
            const font2 = parse(buffer);

            assert.ok(font2.tables.fvar);
            assert.equal(font2.tables.fvar.axes.length, 2);
            
            const axes = font2.tables.fvar.axes;
            assert.equal(axes[0].tag, 'wght');
            assert.equal(axes[1].tag, 'wdth');
        });

        it('creates a variable font with named instances', function() {
            const font = new Font({
                familyName: 'Instance Test',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200,
                glyphs: [
                    new Glyph({ name: '.notdef', unicode: 0, advanceWidth: 0, path: new Path() })
                ]
            });

            font.variation = new VariationManager(font);
            
            font.variation.addAxis({
                tag: 'wght',
                name: 'Weight',
                minValue: 100,
                defaultValue: 400,
                maxValue: 900
            });

            font.variation.addInstance({ name: 'Light', coordinates: { wght: 300 } });
            font.variation.addInstance({ name: 'Regular', coordinates: { wght: 400 } });
            font.variation.addInstance({ name: 'Bold', coordinates: { wght: 700 } });

            const buffer = font.toArrayBuffer();
            const font2 = parse(buffer);

            assert.ok(font2.tables.fvar.instances);
            assert.equal(font2.tables.fvar.instances.length, 3);
        });

        it('creates a variable font with glyph deltas', function() {
            const basePath = new Path();
            basePath.moveTo(100, 0);
            basePath.lineTo(300, 0);
            basePath.lineTo(300, 600);
            basePath.lineTo(100, 600);
            basePath.closePath();

            const font = new Font({
                familyName: 'Delta Test',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200,
                glyphs: [
                    new Glyph({ name: '.notdef', unicode: 0, advanceWidth: 0, path: new Path() }),
                    new Glyph({ name: 'I', unicode: 73, advanceWidth: 400, path: basePath })
                ]
            });

            font.variation = new VariationManager(font);
            
            font.variation.addAxis({
                tag: 'wght',
                name: 'Weight',
                minValue: 100,
                defaultValue: 400,
                maxValue: 900,
                deltaGenerator: (glyph) => {
                    if (glyph.name === '.notdef') return null;
                    // Simple weight: make strokes thicker
                    return {
                        deltas: [-50, 50, 50, -50, 0, 0, 0, 0], // 4 points + 4 phantom
                        deltasY: [0, 0, 0, 0, 0, 0, 0, 0]
                    };
                }
            });

            const buffer = font.toArrayBuffer();
            const font2 = parse(buffer);

            assert.ok(font2.tables.gvar, 'Font should have gvar table');
            assert.ok(font2.tables.gvar.glyphVariations);
        });

        it('creates a variable font with custom axis tag', function() {
            const font = new Font({
                familyName: 'Custom Axis Test',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200,
                glyphs: [
                    new Glyph({ name: '.notdef', unicode: 0, advanceWidth: 0, path: new Path() })
                ]
            });

            font.variation = new VariationManager(font);
            
            font.variation.addAxis({
                tag: 'SNAP',
                name: 'Snapping',
                minValue: 0,
                defaultValue: 0,
                maxValue: 100
            });

            const buffer = font.toArrayBuffer();
            const font2 = parse(buffer);

            assert.ok(font2.tables.fvar);
            assert.equal(font2.tables.fvar.axes[0].tag, 'SNAP');
        });
    });

    describe('Font Validation', function() {
        it('exported fonts have valid table structure', function() {
            const font = new Font({
                familyName: 'Table Test',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200,
                glyphs: [
                    new Glyph({ name: '.notdef', unicode: 0, advanceWidth: 0, path: new Path() }),
                    new Glyph({ name: 'A', unicode: 65, advanceWidth: 500, path: new Path() })
                ]
            });

            const buffer = font.toArrayBuffer();
            const font2 = parse(buffer);

            // Check required tables exist
            assert.ok(font2.tables.head, 'head table should exist');
            assert.ok(font2.tables.hhea, 'hhea table should exist');
            assert.ok(font2.tables.maxp, 'maxp table should exist');
            assert.ok(font2.tables.name, 'name table should exist');
            assert.ok(font2.tables.os2, 'OS/2 table should exist');
            assert.ok(font2.tables.post, 'post table should exist');
            assert.ok(font2.tables.cmap, 'cmap table should exist');
        });

        it('exported font metrics are correct', function() {
            const font = new Font({
                familyName: 'Metrics Test',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200,
                glyphs: [
                    new Glyph({ name: '.notdef', unicode: 0, advanceWidth: 0, path: new Path() }),
                    new Glyph({ name: 'A', unicode: 65, advanceWidth: 600, path: new Path() })
                ]
            });

            const buffer = font.toArrayBuffer();
            const font2 = parse(buffer);

            assert.equal(font2.unitsPerEm, 1000);
            assert.equal(font2.ascender, 800);
            assert.equal(font2.descender, -200);
            
            const glyph = font2.charToGlyph('A');
            assert.equal(glyph.advanceWidth, 600);
        });

        it('variable fonts have correct variation data', function() {
            const font = new Font({
                familyName: 'VF Validation',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200,
                glyphs: [
                    new Glyph({ name: '.notdef', unicode: 0, advanceWidth: 0, path: new Path() })
                ]
            });

            font.variation = new VariationManager(font);
            font.variation.addAxis({
                tag: 'wght',
                name: 'Weight',
                minValue: 200,
                defaultValue: 400,
                maxValue: 800
            });
            font.variation.addInstance({ name: 'Regular', coordinates: { wght: 400 } });
            font.variation.addInstance({ name: 'Bold', coordinates: { wght: 700 } });

            const buffer = font.toArrayBuffer();
            const font2 = parse(buffer);

            // Verify fvar table exists and has correct data
            assert.ok(font2.tables.fvar);
            assert.equal(font2.tables.fvar.axes[0].defaultValue, 400);
            
            // Verify variation manager can be used
            if (font2.variation) {
                const coords = font2.variation.getDefaultCoordinates();
                assert.equal(coords.wght, 400);
            }
        });
    });

    describe('Edge Cases', function() {
        it('handles empty glyphs correctly', function() {
            const font = new Font({
                familyName: 'Empty Glyph Test',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200,
                glyphs: [
                    new Glyph({ name: '.notdef', unicode: 0, advanceWidth: 0, path: new Path() }),
                    new Glyph({ name: 'space', unicode: 32, advanceWidth: 250, path: new Path() }),
                    new Glyph({ name: 'A', unicode: 65, advanceWidth: 500, path: new Path() })
                ]
            });

            const buffer = font.toArrayBuffer();
            const font2 = parse(buffer);

            assert.equal(font2.glyphs.length, 3);
            const space = font2.charToGlyph(' ');
            assert.equal(space.advanceWidth, 250);
        });

        it('handles large number of glyphs', function() {
            const glyphs = [
                new Glyph({ name: '.notdef', unicode: 0, advanceWidth: 0, path: new Path() })
            ];

            // Add 256 glyphs
            for (let i = 0; i < 256; i++) {
                const path = new Path();
                path.moveTo(0, 0);
                path.lineTo(100, 0);
                path.lineTo(50, 100);
                path.closePath();

                glyphs.push(new Glyph({
                    name: 'glyph' + i,
                    unicode: 0x100 + i,
                    advanceWidth: 200,
                    path: path
                }));
            }

            const font = new Font({
                familyName: 'Many Glyphs',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200,
                glyphs: glyphs
            });

            const buffer = font.toArrayBuffer();
            const font2 = parse(buffer);

            assert.equal(font2.glyphs.length, 257);
        });

        it('handles complex paths with many points', function() {
            const path = new Path();
            path.moveTo(0, 0);
            
            // Create a path with many points
            for (let i = 0; i < 50; i++) {
                const angle = (i / 50) * Math.PI * 2;
                const x = 200 + Math.cos(angle) * 150;
                const y = 200 + Math.sin(angle) * 150;
                path.lineTo(x, y);
            }
            path.closePath();

            const font = new Font({
                familyName: 'Complex Path',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200,
                glyphs: [
                    new Glyph({ name: '.notdef', unicode: 0, advanceWidth: 0, path: new Path() }),
                    new Glyph({ name: 'circle', unicode: 0x25CF, advanceWidth: 500, path: path })
                ]
            });

            const buffer = font.toArrayBuffer();
            const font2 = parse(buffer);

            const glyph = font2.glyphs.get(1);
            assert.ok(glyph.path.commands.length >= 50);
        });
    });

    describe('Font Editor Style Variable Font Creation', function() {
        /**
         * This test simulates exactly what the font-editor does:
         * - Creates glyphs from simple points
         * - Stores masters with different point coordinates
         * - Builds deltas from the difference between masters
         */
        it('creates VF from masters like font-editor', function() {
            const TTF_SCALE = 80;
            
            // Simulate font-editor state with masters
            const masters = [
                {
                    name: 'Light',
                    coords: { wght: 100 },
                    glyphs: {
                        'I': [[1, 0], [1, 10], [3, 10], [3, 0]] // Thin I
                    }
                },
                {
                    name: 'Bold',
                    coords: { wght: 900 },
                    glyphs: {
                        'I': [[0, 0], [0, 10], [4, 10], [4, 0]] // Thick I
                    }
                }
            ];
            
            const axes = [
                { tag: 'wght', name: 'Weight', minValue: 100, defaultValue: 100, maxValue: 900 }
            ];
            
            // Build glyphs from default master
            const baseGlyphs = masters[0].glyphs;
            const otGlyphs = [
                new Glyph({ name: '.notdef', unicode: 0, advanceWidth: 0, path: new Path() }),
                new Glyph({ name: 'space', unicode: 32, advanceWidth: 5 * TTF_SCALE, path: new Path() })
            ];
            
            const glyphIndexMap = new Map();
            glyphIndexMap.set('.notdef', 0);
            glyphIndexMap.set('space', 1);
            
            for (const [char, points] of Object.entries(baseGlyphs)) {
                const path = new Path();
                if (points.length > 0) {
                    path.moveTo(points[0][0] * TTF_SCALE, points[0][1] * TTF_SCALE);
                    for (let i = 1; i < points.length; i++) {
                        path.lineTo(points[i][0] * TTF_SCALE, points[i][1] * TTF_SCALE);
                    }
                    path.closePath();
                }
                
                otGlyphs.push(new Glyph({
                    name: char,
                    unicode: char.charCodeAt(0),
                    advanceWidth: 5 * TTF_SCALE,
                    path: path
                }));
                glyphIndexMap.set(char, otGlyphs.length - 1);
            }
            
            const font = new Font({
                familyName: 'Font Editor Test',
                styleName: 'Variable',
                unitsPerEm: 800,
                ascender: 800,
                descender: -200,
                glyphs: otGlyphs
            });
            
            // Build delta map similar to font-editor's buildMasterDeltas
            function buildMasterDeltas(axis, scale) {
                const deltas = new Map();
                const defaultMaster = masters[0];
                
                // Find master at max value
                let maxMaster = null;
                for (const master of masters) {
                    if (master.coords[axis.tag] === axis.maxValue) {
                        maxMaster = master;
                        break;
                    }
                }
                
                if (!maxMaster) return deltas;
                
                for (const [char, basePoints] of Object.entries(defaultMaster.glyphs)) {
                    const targetPoints = maxMaster.glyphs[char];
                    if (!targetPoints || basePoints.length !== targetPoints.length) continue;
                    
                    const deltaX = [];
                    const deltaY = [];
                    
                    for (let i = 0; i < basePoints.length; i++) {
                        deltaX.push(Math.round((targetPoints[i][0] - basePoints[i][0]) * scale));
                        deltaY.push(Math.round((targetPoints[i][1] - basePoints[i][1]) * scale));
                    }
                    
                    // Add phantom points
                    deltaX.push(0, 0, 0, 0);
                    deltaY.push(0, 0, 0, 0);
                    
                    deltas.set(char, { deltas: deltaX, deltasY: deltaY });
                }
                
                return deltas;
            }
            
            // Initialize VariationManager
            font.variation = new VariationManager(font);
            
            // Add axis with delta generator
            const axis = axes[0];
            const axisDeltas = buildMasterDeltas(axis, TTF_SCALE);
            
            font.variation.addAxis({
                tag: axis.tag,
                name: axis.name,
                minValue: axis.minValue,
                defaultValue: axis.defaultValue,
                maxValue: axis.maxValue,
                deltaGenerator: (glyph) => axisDeltas.get(glyph.name) || null
            });
            
            // Export
            const buffer = font.toArrayBuffer();
            assert.ok(buffer instanceof ArrayBuffer);
            assert.ok(buffer.byteLength > 0);
            
            // Verify export
            const font2 = parse(buffer);
            assert.ok(font2.tables.fvar, 'Should have fvar table');
            assert.equal(font2.tables.fvar.axes.length, 1, 'Should have one axis');
            assert.equal(font2.tables.fvar.axes[0].tag, 'wght', 'Should be wght axis');
            
            assert.ok(font2.tables.gvar, 'Should have gvar table');
            assert.ok(font2.tables.gvar.glyphVariations, 'Should have glyph variations');
            
            // Check that the 'I' glyph has deltas
            const iGlyphIndex = glyphIndexMap.get('I');
            const iVariation = font2.tables.gvar.glyphVariations[iGlyphIndex];
            assert.ok(iVariation, 'I glyph should have variation data');
        });

        it('creates VF with multiple axes from masters', function() {
            const TTF_SCALE = 80;
            
            // More complex state with 2 axes
            const masters = [
                { name: 'Default', coords: { wght: 400, wdth: 100 }, glyphs: { 'A': [[4, 0], [0, 10], [8, 10]] } },
                { name: 'Bold', coords: { wght: 900, wdth: 100 }, glyphs: { 'A': [[4, 0], [-1, 10], [9, 10]] } },
                { name: 'Wide', coords: { wght: 400, wdth: 200 }, glyphs: { 'A': [[5, 0], [-2, 10], [12, 10]] } }
            ];
            
            const axes = [
                { tag: 'wght', name: 'Weight', minValue: 100, defaultValue: 400, maxValue: 900 },
                { tag: 'wdth', name: 'Width', minValue: 50, defaultValue: 100, maxValue: 200 }
            ];
            
            // Create base glyphs
            const basePoints = masters[0].glyphs['A'];
            const path = new Path();
            path.moveTo(basePoints[0][0] * TTF_SCALE, basePoints[0][1] * TTF_SCALE);
            for (let i = 1; i < basePoints.length; i++) {
                path.lineTo(basePoints[i][0] * TTF_SCALE, basePoints[i][1] * TTF_SCALE);
            }
            path.closePath();
            
            const font = new Font({
                familyName: 'Multi-Axis Editor Test',
                styleName: 'Variable',
                unitsPerEm: 800,
                ascender: 800,
                descender: -200,
                glyphs: [
                    new Glyph({ name: '.notdef', unicode: 0, advanceWidth: 0, path: new Path() }),
                    new Glyph({ name: 'A', unicode: 65, advanceWidth: 10 * TTF_SCALE, path: path })
                ]
            });
            
            font.variation = new VariationManager(font);
            
            // Add both axes
            for (const axis of axes) {
                // Find master for this axis at max
                const maxMaster = masters.find(m => m.coords[axis.tag] === axis.maxValue);
                const defaultMaster = masters[0];
                
                if (maxMaster) {
                    const deltas = new Map();
                    for (const [char, baseP] of Object.entries(defaultMaster.glyphs)) {
                        const targetP = maxMaster.glyphs[char];
                        if (targetP && baseP.length === targetP.length) {
                            const dx = [], dy = [];
                            for (let i = 0; i < baseP.length; i++) {
                                dx.push(Math.round((targetP[i][0] - baseP[i][0]) * TTF_SCALE));
                                dy.push(Math.round((targetP[i][1] - baseP[i][1]) * TTF_SCALE));
                            }
                            dx.push(0, 0, 0, 0);
                            dy.push(0, 0, 0, 0);
                            deltas.set(char, { deltas: dx, deltasY: dy });
                        }
                    }
                    
                    font.variation.addAxis({
                        tag: axis.tag,
                        name: axis.name,
                        minValue: axis.minValue,
                        defaultValue: axis.defaultValue,
                        maxValue: axis.maxValue,
                        deltaGenerator: (glyph) => deltas.get(glyph.name) || null
                    });
                }
            }
            
            const buffer = font.toArrayBuffer();
            const font2 = parse(buffer);
            
            assert.ok(font2.tables.fvar);
            assert.equal(font2.tables.fvar.axes.length, 2);
            assert.ok(font2.tables.gvar);
        });

        it('VF roundtrip preserves all data', function() {
            const TTF_SCALE = 80;
            
            // Create a VF
            const path = new Path();
            path.moveTo(100, 0);
            path.lineTo(100, 600);
            path.lineTo(300, 600);
            path.lineTo(300, 0);
            path.closePath();
            
            const font = new Font({
                familyName: 'Roundtrip Test',
                styleName: 'Variable',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200,
                glyphs: [
                    new Glyph({ name: '.notdef', unicode: 0, advanceWidth: 0, path: new Path() }),
                    new Glyph({ name: 'I', unicode: 73, advanceWidth: 400, path: path })
                ]
            });
            
            font.variation = new VariationManager(font);
            font.variation.addAxis({
                tag: 'wght',
                name: 'Weight',
                minValue: 100,
                defaultValue: 400,
                maxValue: 900,
                deltaGenerator: (glyph) => {
                    if (glyph.name === 'I') {
                        return {
                            deltas: [-50, -50, 50, 50, 0, 0, 0, 0],
                            deltasY: [0, 0, 0, 0, 0, 0, 0, 0]
                        };
                    }
                    return null;
                }
            });
            
            font.variation.addInstance({ name: 'Light', coordinates: { wght: 200 } });
            font.variation.addInstance({ name: 'Regular', coordinates: { wght: 400 } });
            font.variation.addInstance({ name: 'Bold', coordinates: { wght: 700 } });
            
            // Export
            const buffer = font.toArrayBuffer();
            
            // Parse back
            const font2 = parse(buffer);
            
            // Verify all data
            assert.ok(font2.tables.fvar);
            assert.equal(font2.tables.fvar.axes.length, 1);
            assert.equal(font2.tables.fvar.axes[0].tag, 'wght');
            assert.equal(font2.tables.fvar.axes[0].minValue, 100);
            assert.equal(font2.tables.fvar.axes[0].defaultValue, 400);
            assert.equal(font2.tables.fvar.axes[0].maxValue, 900);
            
            assert.equal(font2.tables.fvar.instances.length, 3);
            
            assert.ok(font2.tables.gvar);
            assert.ok(font2.tables.gvar.glyphVariations);
        });

        it('VF deltas actually affect glyph rendering', function() {
            // Create a simple glyph with known coordinates
            const path = new Path();
            path.moveTo(100, 0);    // Point 0
            path.lineTo(100, 600);  // Point 1
            path.lineTo(300, 600);  // Point 2
            path.lineTo(300, 0);    // Point 3
            path.closePath();
            
            const font = new Font({
                familyName: 'Delta Test',
                styleName: 'Variable',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200,
                glyphs: [
                    new Glyph({ name: '.notdef', unicode: 0, advanceWidth: 0, path: new Path() }),
                    new Glyph({ name: 'I', unicode: 73, advanceWidth: 400, path: path })
                ]
            });
            
            font.variation = new VariationManager(font);
            
            // Add deltas: make the I wider at wght=900
            // Deltas move left points left by -50, right points right by +50
            font.variation.addAxis({
                tag: 'wght',
                name: 'Weight',
                minValue: 100,
                defaultValue: 100,
                maxValue: 900,
                deltaGenerator: (glyph) => {
                    if (glyph.name === 'I') {
                        return {
                            // 4 points + 4 phantom points
                            deltas: [-50, -50, 50, 50, 0, 0, 0, 0],
                            deltasY: [0, 0, 0, 0, 0, 0, 0, 0]
                        };
                    }
                    return null;
                }
            });
            
            // Export and re-import
            const buffer = font.toArrayBuffer();
            const font2 = parse(buffer);
            
            // Verify we have TrueType outlines (glyf table, not CFF)
            assert.ok(font2.tables.glyf || font2.outlinesFormat === 'truetype', 
                'Variable font should have TrueType outlines');
            assert.ok(!font2.tables.cff && !font2.tables.cff2, 
                'Variable font with gvar should NOT have CFF table');
            
            // Verify gvar table exists
            assert.ok(font2.tables.gvar, 'Should have gvar table');
            assert.ok(font2.tables.gvar.glyphVariations, 'Should have glyph variations');
            
            // Verify font2 has a VariationManager
            assert.ok(font2.variation, 'Parsed font should have a VariationManager');
            
            // Get the I glyph
            const iGlyph = font2.charToGlyph('I');
            assert.ok(iGlyph, 'Should find I glyph');
            
            // Get path at default (wght=100)
            const pathDefault = iGlyph.getPath(0, 0, 1000, {}, font2);
            
            // Set variation to max and get path
            font2.variation.set({ wght: 900 });
            const pathMax = iGlyph.getPath(0, 0, 1000, {}, font2);
            
            // The paths should be different if deltas are applied
            // At default, first point x should be around 100
            // At max, first point x should be around 50 (100 - 50)
            
            // Find the first moveTo command
            const defaultMove = pathDefault.commands.find(c => c.type === 'M');
            const maxMove = pathMax.commands.find(c => c.type === 'M');
            
            assert.ok(defaultMove, 'Default path should have moveTo');
            assert.ok(maxMove, 'Max path should have moveTo');
            
            // The x coordinates should differ by approximately 50
            const xDiff = Math.abs(defaultMove.x - maxMove.x);
            assert.ok(xDiff > 10, 
                `Variable font should show different coordinates at different weights. ` +
                `Default x: ${defaultMove.x}, Max x: ${maxMove.x}, Diff: ${xDiff}`);
        });
    });
});
