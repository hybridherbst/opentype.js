import assert from 'assert';
import Font from '../../src/font.mjs';
import Glyph from '../../src/glyph.mjs';
import Path from '../../src/path.mjs';
import { parse } from '../../src/opentype.mjs';

function triangle() {
    const path = new Path();
    path.moveTo(0, 0);
    path.lineTo(100, 0);
    path.lineTo(50, 100);
    path.closePath();
    return path;
}

function composite(name, components) {
    const glyph = new Glyph({ name, path: new Path(), advanceWidth: 500 });
    glyph.isComposite = true;
    glyph.components = components.map((glyphIndex, i) => ({ glyphIndex, dx: i * 100, dy: 0, xScale: 1, yScale: 1, scale01: 0, scale10: 0 }));
    Object.assign(glyph, { _xMin: 0, _yMin: 0, _xMax: 300, _yMax: 100 });
    return glyph;
}

describe('tables/maxp composite statistics', function() {
    it('counts flattened composite points, contours and nesting depth', function() {
        const notdef = new Glyph({ name: '.notdef', path: new Path(), advanceWidth: 500 });
        const simple = new Glyph({ name: 'tri', path: triangle(), advanceWidth: 100 });
        const pair = composite('pair', [1, 1]);         // 2 × triangle, depth 1
        const nested = composite('nested', [2, 2, 1]);  // 2 × pair + triangle, depth 2
        const font = new Font({
            familyName: 'Maxp', styleName: 'Regular', unitsPerEm: 1000, ascender: 800, descender: -200,
            glyphs: [notdef, simple, pair, nested],
        });
        font.outlinesFormat = 'truetype';
        const maxp = parse(font.toArrayBuffer()).tables.maxp;
        assert.equal(maxp.maxPoints, 3);
        assert.equal(maxp.maxContours, 1);
        assert.equal(maxp.maxCompositePoints, 15);
        assert.equal(maxp.maxCompositeContours, 5);
        assert.equal(maxp.maxComponentElements, 3);
        assert.equal(maxp.maxComponentDepth, 2);
    });
});
