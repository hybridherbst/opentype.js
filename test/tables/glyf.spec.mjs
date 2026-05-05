import assert from 'assert';
import glyf, { cubicToQuadratics, pathToPoints } from '../../src/tables/glyf.mjs';
import Glyph from '../../src/glyph.mjs';
import Path from '../../src/path.mjs';

describe('tables/glyf.mjs', function() {
    describe('composite glyph encoding', function() {
        it('encodes composite glyphs with component records', function() {
            const componentPath = new Path();
            componentPath.moveTo(0, 0);
            componentPath.lineTo(100, 0);
            componentPath.lineTo(50, 100);
            componentPath.closePath();

            const componentGlyph = new Glyph({
                name: '_stem',
                path: componentPath,
                advanceWidth: 100
            });
            const compositeGlyph = new Glyph({
                name: 'A',
                path: new Path(),
                advanceWidth: 500
            });
            compositeGlyph.isComposite = true;
            compositeGlyph.components = [
                { glyphIndex: 0, dx: 0, dy: 0, xScale: 1, yScale: 1, scale01: 0, scale10: 0 },
                { glyphIndex: 0, dx: 100, dy: 0, xScale: 1, yScale: 1, scale01: 0, scale10: 0 }
            ];
            compositeGlyph._xMin = 0;
            compositeGlyph._yMin = 0;
            compositeGlyph._xMax = 200;
            compositeGlyph._yMax = 100;

            const glyphs = {
                length: 2,
                get: index => index === 0 ? componentGlyph : compositeGlyph
            };
            const { glyfData, offsets } = glyf.make(glyphs);
            const view = new DataView(glyfData.buffer);

            assert.ok(glyfData.length > 0);
            assert.deepEqual(offsets.length, 3);
            assert.equal(view.getInt16(offsets[1]), -1);
        });

        it('encodes byte, word, scale, and matrix component arguments', function() {
            const cases = [
                { dx: 50, dy: 20, xScale: 1, yScale: 1, scale01: 0, scale10: 0, minSize: 16 },
                { dx: 200, dy: -150, xScale: 1, yScale: 1, scale01: 0, scale10: 0, minSize: 18 },
                { dx: 0, dy: 0, xScale: 0.5, yScale: 0.5, scale01: 0, scale10: 0, minSize: 18 },
                { dx: 0, dy: 0, xScale: 1, yScale: 1, scale01: 0.25, scale10: -0.25, minSize: 24 }
            ];

            for (const component of cases) {
                const compositeGlyph = new Glyph({
                    name: 'test',
                    path: new Path(),
                    advanceWidth: 500
                });
                compositeGlyph.isComposite = true;
                compositeGlyph.components = [{
                    glyphIndex: 5,
                    dx: component.dx,
                    dy: component.dy,
                    xScale: component.xScale,
                    yScale: component.yScale,
                    scale01: component.scale01,
                    scale10: component.scale10
                }];
                compositeGlyph._xMin = 0;
                compositeGlyph._yMin = -150;
                compositeGlyph._xMax = 300;
                compositeGlyph._yMax = 100;

                const { glyfData } = glyf.make({
                    length: 1,
                    get: () => compositeGlyph
                });
                assert.ok(glyfData.length >= component.minSize);
            }
        });
    });

    describe('cubicToQuadratics', function() {
        it('approximates cubic curves while preserving endpoints', function() {
            const quads = cubicToQuadratics(0, 0, 0, 100, 100, 100, 100, 0, 1);
            const last = quads[quads.length - 1];

            assert.ok(quads.length >= 1);
            assert.equal(last.x, 100);
            assert.equal(last.y, 0);
        });

        it('uses higher tolerance for fewer or equal quadratics', function() {
            const lowTolerance = cubicToQuadratics(0, 0, 0, 100, 100, 100, 100, 0, 0.5);
            const highTolerance = cubicToQuadratics(0, 0, 0, 100, 100, 100, 100, 0, 10);

            assert.ok(highTolerance.length <= lowTolerance.length);
        });
    });

    describe('pathToPoints', function() {
        it('converts line, quadratic, and cubic commands into TrueType points', function() {
            const path = new Path();
            path.moveTo(0, 0);
            path.lineTo(100, 0);
            path.quadraticCurveTo(150, 50, 100, 100);
            path.curveTo(50, 150, 0, 150, 0, 100);
            path.closePath();

            const { points, contourEnds } = pathToPoints(path);

            assert.equal(contourEnds.length, 1);
            assert.equal(contourEnds[0], points.length - 1);
            assert.equal(points[0].onCurve, true);
            assert.ok(points.some(point => point.onCurve === false));
            assert.equal(points[points.length - 1].onCurve, true);
        });

        it('removes duplicate explicit closing points', function() {
            const path = new Path();
            path.moveTo(0, 0);
            path.lineTo(100, 0);
            path.lineTo(100, 100);
            path.lineTo(0, 0);
            path.closePath();

            assert.equal(pathToPoints(path).points.length, 3);
        });

        it('tracks multiple contour ends', function() {
            const path = new Path();
            path.moveTo(0, 0);
            path.lineTo(100, 0);
            path.lineTo(50, 100);
            path.closePath();
            path.moveTo(200, 0);
            path.lineTo(300, 0);
            path.lineTo(250, 100);
            path.closePath();

            assert.deepEqual(pathToPoints(path).contourEnds, [2, 5]);
        });
    });
});
