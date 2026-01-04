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
});
