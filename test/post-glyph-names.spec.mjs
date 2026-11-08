import assert from 'assert';
import { Font, Glyph, Path, parse, findDuplicateGlyphNames } from '../src/opentype.mjs';
import { standardNames } from '../src/encoding.mjs';

function fontWith(names) {
    const glyphs = [new Glyph({ name: '.notdef', advanceWidth: 500, path: new Path() }),
        ...names.map((name, index) => new Glyph({ name, unicode: 0x41 + index, advanceWidth: 500, path: new Path() }))];
    return new Font({ familyName: 'Names', styleName: 'Regular', unitsPerEm: 1000, ascender: 800, descender: -200, glyphs });
}
/** Names as the written post table states them (CFF fonts name glyphs in CFF, not post). */
const writtenNames = (font, options) => {
    const { post } = parse(font.toArrayBuffer({ postFormat: 2, ...options })).tables;
    return post.glyphNameIndex.map(index => index < 258 ? standardNames[index] : post.names[index - 258]);
};

describe('post glyph names', function() {
    it('reports names written for several glyphs, including sanitized collisions', function() {
        const font = fontWith(['a', 'a', 'é', 'à', 'b']);
        assert.deepEqual(findDuplicateGlyphNames(font), [
            { name: 'a', glyphIndices: [1, 2] },
            { name: '_', glyphIndices: [3, 4] },
        ]);
    });

    it('preserves duplicate names by default, so imported fonts write back unchanged', function() {
        assert.deepEqual(writtenNames(fontWith(['a', 'a', 'b'])), ['.notdef', 'a', 'a', 'b']);
    });

    it('renames later duplicates on request without changing glyph identity', function() {
        const font = fontWith(['a', 'a', 'a.1', 'a']);
        assert.deepEqual(writtenNames(font, { glyphNames: 'unique' }), ['.notdef', 'a', 'a.2', 'a.1', 'a.3']);
        const parsed = parse(font.toArrayBuffer({ postFormat: 2, glyphNames: 'unique' }));
        assert.equal(parsed.charToGlyphIndex('B'), 2, 'cmap still addresses the same glyph ID');
    });
});
