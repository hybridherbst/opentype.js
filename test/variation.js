import assert from 'assert';
import { parse, Font, Glyph, Path } from '../src/opentype.js';
import { VariationManager } from '../src/variation.js';
import { readFileSync } from 'fs';
const loadSync = (url, opt) => parse(readFileSync(url), opt);

describe('variation.js', function() {
    const fonts = {
        avar: loadSync('./test/fonts/TestAVAR.ttf'),
        hvar: loadSync('./test/fonts/TestHVAROne.otf'),
        hvar2: loadSync('./test/fonts/TestHVARTwo.ttf'),
        zycon: loadSync('./test/fonts/Zycon.ttf'),
        cvar1: loadSync('./test/fonts/TestCVARGVAROne.ttf'),
        cvar2: loadSync('./test/fonts/TestCVARGVARTwo.ttf'),
    };

    it('pads axis tags with spaces for lookup', function() {
        const font = fonts.zycon;
        const untransformedPoints = [
            2026, 1022, 2026, 606, 1437, 17, 1021, 17, 605, 17, 16, 606, 16, 1022, 16, 1438, 605, 2027,
            1021, 2027, 1437, 2027, 2026, 1438, 1976, 1022, 1976, 1418, 1417, 1980, 1021, 1980, 625,
            1980, 66, 1417, 66, 1021, 66, 625, 625, 64, 1021, 64, 1417, 64, 1976, 626, 1586, 1441,
            1378, 1482, 1178, 1418, 1297, 1371, 1297, 1371, 1274, 1334, 1274, 1317, 1274, 1274, 1343,
            1214, 1386, 1214, 1434, 1214, 1494, 1279, 1494, 1326, 1494, 1351, 1474, 1393, 1474, 1393,
            881, 1416, 681, 1485, 484, 1441, 587, 1394, 587, 1394, 562, 1331, 562, 1315, 562, 1265, 635,
            1209, 681, 1209, 718, 1209, 785, 1265, 785, 1304, 785, 1317, 770, 1371, 770, 1371, 1245, 868,
            1245, 868, 1213, 941, 1186, 954, 1159, 967, 1086, 947, 1086, 947, 1027, 1380, 965, 950, 965,
            950, 881, 969, 853, 955, 825, 941, 794, 861, 794, 861, 919, 888, 919, 888, 997, 839, 1033, 839,
            1068, 839, 1142, 885, 1142, 885, 1346, 607, 1294, 577, 1100, 544, 1022, 544, 912, 544, 728, 599,
            698, 614, 727, 529, 914, 422, 1025, 422, 1133, 422, 1321, 546
        ];
        const transformedPoints = untransformedPoints.slice(0, 32)
            .concat([1005, 1980, 983, 1417, 983, 1021, 983, 625, 1005, 64])
            .concat(untransformedPoints.slice(42));
        assert.deepEqual(font.variation.getTransform(15).points.map(p => [p.x, p.y]).flat(), untransformedPoints);
        assert.deepEqual(font.variation.getTransform(15, {M1: 0.48}).points.map(p => [p.x, p.y]).flat(), transformedPoints);
        
        font.variation.set({M1: -0.42});
        assert.deepEqual(font.variation.get(), {
            'M1  ': -0.42,
            'M2  ': 0,
            'T1  ': 0,
            'T2  ': 0,
            'T3  ': 0,
            'T4  ': 0,
        });
    });

    describe('avar', function() {
        it('applies variation limits', function() {
            const font = fonts.avar;
            const expectedFactors = [
                [ -1 ],
                [ -0.6666666666666667 ],
                [ -0.33333333333333326 ]
            ].concat(Array(9).fill([ 0 ]))
            .concat([
                [ 0.19999999999999996 ],
                [ 0.3999999999999999 ],
                [ 0.6000000000000001 ],
                [ 0.8 ],
                [ 1 ]
            ]);
            assert.deepEqual(
                [100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800, 850, 900].map((v) => {
                    font.variation.set({TEST:v});
                    return font.variation.process.getNormalizedCoords();
                }),
                expectedFactors
            );
        });
    });
    
    describe('cvar', function() {
        it('handles cvar data correctly', function() {
            
            ['cvar1','cvar2'].forEach((f) => {
                let font = fonts[f];
                let glyphPos = [];
                assert.equal(
                    font.forEachGlyph('hon', 0, 0, font.unitsPerEm, {}, function(glyph, gX, gY, gFontSize) {
                        glyphPos.push({w: glyph.advanceWidth, lsb: glyph.leftSideBearing, gX, count: glyph.path.commands.length});
                    }),
                    1857
                );
                assert.deepEqual(glyphPos, [
                    {count: 53, w: 635, lsb: 18, gX: 0},
                    {count: 32, w: 577, lsb: 55, gX: 635},
                    {count: 49, w: 645, lsb: 28, gX: 1212},
                ]);
                glyphPos = [];
                font.variation.set({wght: 1000})
                assert.equal(
                    font.forEachGlyph('hon', 0, 0, font.unitsPerEm, {}, function(glyph, gX, gY, gFontSize) {
                        glyphPos.push({w: glyph.advanceWidth, lsb: glyph.leftSideBearing, gX, count: glyph.path.commands.length});
                    }),
                    1857
                );
                assert.deepEqual(glyphPos, [
                    {count: 53, w: 635, lsb: 18, gX: 0},
                    {count: 32, w: 577, lsb: 55, gX: 635},
                    {count: 49, w: 645, lsb: 28, gX: 1212},
                ]);

                font = fonts.hvar2;
                glyphPos = [];
                assert.equal(
                    font.forEachGlyph('AB', 0, 0, font.unitsPerEm, {}, function(glyph, gX, gY, gFontSize) {
                        glyphPos.push({w: glyph.advanceWidth, lsb: glyph.leftSideBearing, gX});
                    }),
                    900
                );
                assert.deepEqual(glyphPos, [
                    {w: 450, lsb: 0, gX: 0},
                    {w: 450, lsb: 0, gX: 450},
                ]);
                glyphPos = [];
                font.variation.set({wght: 1000})
                assert.equal(
                    font.forEachGlyph('AB', 0, 0, font.unitsPerEm, {}, function(glyph, gX, gY, gFontSize) {
                        glyphPos.push({w: glyph.advanceWidth, lsb: glyph.leftSideBearing, gX});
                    }),
                    900
                );
                assert.deepEqual(glyphPos, [
                    {w: 450, lsb: 0, gX: 0},
                    {w: 450, lsb: 0, gX: 450},
                ]);
            });
        });
    });
    
    describe('hvar', function() {
        it('transforms advanceWidth', function() {
            let font = fonts.hvar;
            let glyphPos = [];
            assert.equal(
                font.forEachGlyph('ABC', 0, 0, font.unitsPerEm, {}, function(glyph, gX, gY, gFontSize) {
                    glyphPos.push({w: glyph.advanceWidth, lsb: glyph.leftSideBearing, gX});
                }),
                1656
            );
            assert.deepEqual(glyphPos, [
                {w: 520, lsb: 10, gX: 0},
                {w: 574, lsb: 100, gX: 520},
                {w: 562, lsb: 56, gX: 1094},
            ]);
            glyphPos = [];
            font.variation.set({wght: 1000})
            assert.equal(
                font.forEachGlyph('ABC', 0, 0, font.unitsPerEm, {}, function(glyph, gX, gY, gFontSize) {
                    glyphPos.push({w: glyph.advanceWidth, lsb: glyph.leftSideBearing, gX});
                }),
                1656
            );
            assert.deepEqual(glyphPos, [
                {w: 520, lsb: 10, gX: 0},
                {w: 574, lsb: 100, gX: 520},
                {w: 562, lsb: 56, gX: 1094},
            ]);

            font = fonts.hvar2;
            glyphPos = [];
            assert.equal(
                font.forEachGlyph('AB', 0, 0, font.unitsPerEm, {}, function(glyph, gX, gY, gFontSize) {
                    glyphPos.push({w: glyph.advanceWidth, lsb: glyph.leftSideBearing, gX});
                }),
                900
            );
            assert.deepEqual(glyphPos, [
                {w: 450, lsb: 0, gX: 0},
                {w: 450, lsb: 0, gX: 450},
            ]);
            glyphPos = [];
            font.variation.set({wght: 1000})
            assert.equal(
                font.forEachGlyph('AB', 0, 0, font.unitsPerEm, {}, function(glyph, gX, gY, gFontSize) {
                    glyphPos.push({w: glyph.advanceWidth, lsb: glyph.leftSideBearing, gX});
                }),
                900
            );
            assert.deepEqual(glyphPos, [
                {w: 450, lsb: 0, gX: 0},
                {w: 450, lsb: 0, gX: 450},
            ]);
        });
    });

    describe('addAxis', function() {
        it('can add a new variation axis to a static font', function() {
            // Create a simple static font
            const notdefPath = new Path();
            notdefPath.moveTo(0, 0);
            notdefPath.lineTo(400, 0);
            notdefPath.lineTo(400, 700);
            notdefPath.lineTo(0, 700);
            notdefPath.closePath();

            const aPath = new Path();
            aPath.moveTo(0, 0);
            aPath.lineTo(200, 700);
            aPath.lineTo(400, 0);
            aPath.closePath();

            const font = new Font({
                familyName: 'Test',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200,
                glyphs: [
                    new Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: notdefPath }),
                    new Glyph({ name: 'A', unicode: 65, advanceWidth: 500, path: aPath })
                ]
            });

            // Initialize variation manager
            font.variation = new VariationManager(font);

            // Add a weight axis
            const axis = font.variation.addAxis({
                tag: 'wght',
                name: 'Weight',
                minValue: 100,
                defaultValue: 400,
                maxValue: 900
            });

            assert.equal(axis.tag, 'wght');
            assert.equal(axis.minValue, 100);
            assert.equal(axis.defaultValue, 400);
            assert.equal(axis.maxValue, 900);
            assert.ok(font.tables.fvar);
            assert.equal(font.tables.fvar.axes.length, 1);
        });

        it('can add an axis with delta generator', function() {
            const basePath = new Path();
            basePath.moveTo(0, 0);
            basePath.lineTo(100, 0);
            basePath.lineTo(100, 100);
            basePath.lineTo(0, 100);
            basePath.closePath();

            const font = new Font({
                familyName: 'Test',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200,
                glyphs: [
                    new Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: new Path() }),
                    new Glyph({ name: 'A', unicode: 65, advanceWidth: 500, path: basePath })
                ]
            });

            font.variation = new VariationManager(font);

            // Add a custom axis with deltas
            font.variation.addAxis({
                tag: 'TEST',
                name: 'Test Axis',
                minValue: 0,
                defaultValue: 0,
                maxValue: 100,
                deltaGenerator: (glyph) => {
                    if (!glyph.path || !glyph.path.commands || glyph.path.commands.length === 0) {
                        return null;
                    }
                    // Simple delta: move all points by 10 units
                    const deltas = [];
                    const deltasY = [];
                    for (const cmd of glyph.path.commands) {
                        if (cmd.x !== undefined) {
                            deltas.push(10);
                            deltasY.push(10);
                        }
                    }
                    // Add phantom point deltas
                    deltas.push(0, 0, 0, 0);
                    deltasY.push(0, 0, 0, 0);
                    return { deltas, deltasY };
                }
            });

            assert.ok(font.tables.gvar);
            assert.ok(font.tables.gvar.glyphVariations[1]);
            assert.equal(font.tables.gvar.glyphVariations[1].headers.length, 1);
        });

        it('can roundtrip a font with a new axis', function() {
            const basePath = new Path();
            basePath.moveTo(0, 0);
            basePath.lineTo(100, 0);
            basePath.lineTo(100, 100);
            basePath.lineTo(0, 100);
            basePath.closePath();

            const font = new Font({
                familyName: 'TestVF',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200,
                glyphs: [
                    new Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: new Path() }),
                    new Glyph({ name: 'A', unicode: 65, advanceWidth: 500, path: basePath })
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

            // Export and re-import
            const buffer = font.toArrayBuffer();
            const font2 = parse(buffer);

            assert.ok(font2.tables.fvar);
            assert.equal(font2.tables.fvar.axes.length, 1);
            assert.equal(font2.tables.fvar.axes[0].tag, 'wght');
            assert.equal(font2.tables.fvar.axes[0].minValue, 100);
            assert.equal(font2.tables.fvar.axes[0].maxValue, 900);
        });

        it('computeDeltas correctly calculates path differences', function() {
            const basePath = new Path();
            basePath.moveTo(0, 0);
            basePath.lineTo(100, 0);
            basePath.lineTo(100, 100);
            basePath.closePath();

            const targetPath = new Path();
            targetPath.moveTo(10, 10);
            targetPath.lineTo(110, 10);
            targetPath.lineTo(110, 110);
            targetPath.closePath();

            const result = VariationManager.computeDeltas(basePath, targetPath);
            
            assert.ok(result);
            // 3 moveTo/lineTo commands with x,y = 6 points + 4 phantom points = 10
            assert.equal(result.deltas.length, 7); // 3 coords + 4 phantom
            assert.equal(result.deltasY.length, 7);
            // Check first point delta (0,0) -> (10,10) = delta of 10,10
            assert.equal(result.deltas[0], 10);
            assert.equal(result.deltasY[0], 10);
        });

        it('should include gvar entries for all glyphs including composite glyphs', function() {
            // Regression test for gvar glyph count mismatch
            // Composite glyphs (with no path commands) must still have gvar entries
            const basePath = new Path();
            basePath.moveTo(0, 0);
            basePath.lineTo(100, 0);
            basePath.lineTo(100, 100);
            basePath.closePath();

            const emptyPath = new Path(); // For composite glyph

            const font = new Font({
                familyName: 'TestVF',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200,
                glyphs: [
                    new Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: new Path() }),
                    new Glyph({ name: 'A', unicode: 65, advanceWidth: 500, path: basePath }),
                    new Glyph({ name: 'B', unicode: 66, advanceWidth: 500, path: emptyPath }) // Simulates composite
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
                    if (!glyph.path || !glyph.path.commands || glyph.path.commands.length === 0) {
                        return null;
                    }
                    const deltas = [];
                    const deltasY = [];
                    for (const cmd of glyph.path.commands) {
                        if (cmd.x !== undefined) {
                            deltas.push(10);
                            deltasY.push(0);
                        }
                    }
                    deltas.push(0, 0, 0, 0);
                    deltasY.push(0, 0, 0, 0);
                    return { deltas, deltasY };
                }
            });

            // All 3 glyphs must have gvar entries
            assert.ok(font.tables.gvar);
            assert.ok(font.tables.gvar.glyphVariations[0] !== undefined, 'Glyph 0 should have gvar entry');
            assert.ok(font.tables.gvar.glyphVariations[1] !== undefined, 'Glyph 1 should have gvar entry');
            assert.ok(font.tables.gvar.glyphVariations[2] !== undefined, 'Glyph 2 (composite) should have gvar entry');
            
            // Verify the font can export and re-import successfully
            const buffer = font.toArrayBuffer();
            const font2 = parse(buffer);
            assert.ok(font2.tables.fvar);
            assert.ok(font2.tables.gvar);
        });

        it('should roundtrip addAxis with delta on specific glyph', function() {
            // Regression test from test-check-variation.mjs
            const buf = readFileSync('./docs/fonts/FiraSansMedium.woff');
            const font = parse(buf.buffer);

            // Convert to TTF first
            const ttfBuf = font.toArrayBuffer();
            const ttfFont = parse(ttfBuf);

            // Create VF from TTF
            const vfFont = parse(ttfFont.toArrayBuffer());
            vfFont.variation = new VariationManager(vfFont);
            vfFont.variation.addAxis({
                tag: 'TEST',
                name: 'Test',
                minValue: 0,
                defaultValue: 0,
                maxValue: 100,
                deltaGenerator: (glyph) => {
                    if (glyph.index === 37) {
                        return { 
                            deltas: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 0, 0, 0, 0], 
                            deltasY: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] 
                        };
                    }
                    return null;
                }
            });

            const exported = vfFont.toArrayBuffer();
            const reimported = parse(exported);

            assert.ok(reimported.variation, 'Reimported font should have variation');
            assert.ok(reimported.tables.fvar, 'Reimported font should have fvar');
            assert.ok(reimported.tables.gvar, 'Reimported font should have gvar');
        });
    });

    describe('composite glyph variation', function() {
        it('should apply variation to composite glyph components even without explicit gvar entry', async function() {
            // This tests the fix for composite glyphs that reference other glyphs with variation
            // Uses the vf-shapes-and-references-state.json test file which has:
            // - Glyph "O" with shapes AND a reference to "_Test"  
            // - The "_Test" glyph has variation data
            // - The "O" composite should show the interpolated _Test at different axis values
            
            const fontEditorApi = await import('../docs/examples/font-editor-api.js');
            const { FontEditorState, FontBuilder } = fontEditorApi;
            
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
            
            // We need to pass opentype module to FontBuilder
            const opentype = await import('../src/opentype.js');
            const builder = new FontBuilder(state, opentype);
            const font = builder.build({ useComposites: true });
            
            // Export and reimport
            const buffer = builder.toArrayBuffer();
            const data = Buffer.from(buffer);
            const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
            const reimported = parse(arrayBuffer);
            
            // Glyph 3 is _Test (simple glyph with variation)
            // Glyph 5 is O (composite referencing _Test)
            
            // Get transformed glyphs at different TEST axis values
            const test400 = reimported.variation.getTransform(3, { TEST: 400 });
            const test100 = reimported.variation.getTransform(3, { TEST: 100 });
            
            const composite400 = reimported.variation.getTransform(5, { TEST: 400 });
            const composite100 = reimported.variation.getTransform(5, { TEST: 100 });
            
            // Verify _Test actually changes with variation
            assert.notDeepStrictEqual(
                test400.points.slice(0, 4).map(p => ({ x: p.x, y: p.y })),
                test100.points.slice(0, 4).map(p => ({ x: p.x, y: p.y })),
                '_Test points should change with variation'
            );
            
            // The composite's _Test component (points 4-7) should match _Test standalone
            // At default (400)
            assert.deepStrictEqual(
                test400.points.slice(0, 4).map(p => ({ x: p.x, y: p.y })),
                composite400.points.slice(4, 8).map(p => ({ x: p.x, y: p.y })),
                'At default, composite _Test component should match _Test standalone'
            );
            
            // At min (100) - THIS IS THE KEY TEST - composite components should get variation applied
            assert.deepStrictEqual(
                test100.points.slice(0, 4).map(p => ({ x: p.x, y: p.y })),
                composite100.points.slice(4, 8).map(p => ({ x: p.x, y: p.y })),
                'At min, composite _Test component should match interpolated _Test'
            );
        });
    });

});
