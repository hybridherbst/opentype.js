import assert from 'assert';
import { Font, Glyph, Path, parse } from '../src/opentype.mjs';

describe('hhea caret slope', function() {
    const build = (italicAngle, unitsPerEm = 1000) => {
        const notdef = new Glyph({ name: '.notdef', advanceWidth: 500, path: new Path() });
        const font = new Font({ familyName: 'Caret', styleName: 'Regular', unitsPerEm, ascender: 800, descender: -200, glyphs: [notdef], italicAngle });
        return parse(font.toArrayBuffer()).tables.hhea;
    };

    it('stands upright in an upright font', function() {
        const hhea = build(0);
        assert.deepEqual([hhea.caretSlopeRise, hhea.caretSlopeRun], [1, 0]);
    });

    it('leans with the italic angle', function() {
        const hhea = build(-10);
        assert.deepEqual([hhea.caretSlopeRise, hhea.caretSlopeRun], [1000, 176]);
        const wide = build(-12, 2048);
        assert.deepEqual([wide.caretSlopeRise, wide.caretSlopeRun], [2048, Math.round(2048 * Math.tan(12 * Math.PI / 180))]);
    });
});
