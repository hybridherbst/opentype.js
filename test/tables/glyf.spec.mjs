import assert from 'assert';
import glyf, { cubicToQuadratics, pathToPoints } from '../../src/tables/glyf.mjs';
import Glyph from '../../src/glyph.mjs';
import Path from '../../src/path.mjs';
import Font from '../../src/font.mjs';
import { parse } from '../../src/opentype.mjs';

function squarePath() {
    const path = new Path();
    path.moveTo(0, 0);
    path.lineTo(100, 0);
    path.lineTo(100, 100);
    path.lineTo(0, 100);
    path.closePath();
    return path;
}

function compositeFont(component) {
    const notdef = new Glyph({ name: '.notdef', path: new Path(), advanceWidth: 500 });
    const base = new Glyph({ name: 'square', path: squarePath(), advanceWidth: 100 });
    const glyph = new Glyph({ name: 'scaled', path: new Path(), advanceWidth: 500 });
    glyph.isComposite = true;
    glyph.components = [{ glyphIndex: 1, xScale: 1, yScale: 1, scale01: 0, scale10: 0, dx: 0, dy: 0, ...component }];
    Object.assign(glyph, { _xMin: -400, _yMin: -400, _xMax: 400, _yMax: 400 });
    const font = new Font({
        familyName: 'Composite', styleName: 'Regular', unitsPerEm: 1000, ascender: 800, descender: -200,
        glyphs: [notdef, base, glyph],
    });
    font.outlinesFormat = 'truetype';
    return font;
}

/** First component flags of the composite glyph at index 2 in a built font. */
function firstComponentFlags(buffer) {
    const view = new DataView(buffer);
    return view.getUint16(compositeFlagsOffset(buffer));
}

/** Byte offset of the first component's flags of glyph 2, via the table directory and loca. */
function compositeFlagsOffset(buffer) {
    const view = new DataView(buffer);
    const tables = {};
    for (let i = 0; i < view.getUint16(4); i++) {
        const record = 12 + i * 16;
        const tag = String.fromCharCode(...[0, 1, 2, 3].map(k => view.getUint8(record + k)));
        tables[tag] = view.getUint32(record + 8);
    }
    const longLoca = parse(buffer).tables.head.indexToLocFormat === 1;
    const glyphOffset = longLoca ? view.getUint32(tables.loca + 2 * 4) : view.getUint16(tables.loca + 2 * 2) * 2;
    return tables.glyf + glyphOffset + 10;
}

/** Byte-level composite glyph with one component and the given flags. */
function rawCompositeFont(flags, { dx, dy, scale }) {
    const font = compositeFont({ xScale: scale, yScale: scale, dx, dy });
    const buffer = font.toArrayBuffer();
    const view = new DataView(buffer);
    const flagsAt = compositeFlagsOffset(buffer);
    view.setUint16(flagsAt, (view.getUint16(flagsAt) & ~0x1800) | flags);
    return buffer;
}

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

    describe('component offset scaling', function() {
        it('marks transformed components as UNSCALED_COMPONENT_OFFSET', function() {
            const scaled = firstComponentFlags(compositeFont({ xScale: 0.5, yScale: 0.5, dx: 200, dy: 100 }).toArrayBuffer());
            assert.equal(scaled & 0x1000, 0x1000);
            assert.equal(scaled & 0x0800, 0);
            const flipped = firstComponentFlags(compositeFont({ xScale: -1, yScale: 1, dx: 300, dy: 0 }).toArrayBuffer());
            assert.equal(flipped & 0x1000, 0x1000);
            const turned = firstComponentFlags(compositeFont({ xScale: 0, yScale: 0, scale01: 1, scale10: -1, dx: 50, dy: 0 }).toArrayBuffer());
            assert.equal(turned & 0x1000, 0x1000);
            const translated = firstComponentFlags(compositeFont({ dx: 200, dy: 100 }).toArrayBuffer());
            assert.equal(translated & 0x1800, 0);
        });

        it('applies an unscaled offset after the component matrix', function() {
            const font = parse(compositeFont({ xScale: 0.5, yScale: 0.5, dx: 200, dy: 100 }).toArrayBuffer());
            const box = font.glyphs.get(2).getPath(0, 0, 1000).getBoundingBox();
            // Square 0..100 scaled by 0.5 then moved by (200, 100); y is flipped by getPath.
            assert.deepEqual([box.x1, box.x2, -box.y2, -box.y1], [200, 250, 100, 150]);
        });

        it('honours SCALED_COMPONENT_OFFSET and UNSCALED_COMPONENT_OFFSET when parsing', function() {
            const cases = [
                { flags: 0x0800, x: [100, 150] },          // Apple: offset scaled by 0.5
                { flags: 0x1000, x: [200, 250] },          // Microsoft: offset added after scaling
                { flags: 0x1800, x: [200, 250] },          // both set: unscaled wins (HarfBuzz)
                { flags: 0, x: [200, 250] },               // neither: unscaled default
            ];
            for (const { flags, x } of cases) {
                const font = parse(rawCompositeFont(flags, { dx: 200, dy: 100, scale: 0.5 }));
                const glyph = font.glyphs.get(2);
                const box = glyph.getPath(0, 0, 1000).getBoundingBox();
                assert.deepEqual([box.x1, box.x2], x, `flags 0x${flags.toString(16)}`);
            }
        });

        it('rewrites a scaled offset as an equivalent unscaled one', function() {
            const source = parse(rawCompositeFont(0x0800, { dx: 200, dy: 100, scale: 0.5 }));
            const glyph = source.glyphs.get(2);
            glyph.getPath();
            const component = glyph.components[0];
            assert.deepEqual([component.dx, component.dy], [100, 50]);
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
