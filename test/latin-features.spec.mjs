import assert from 'assert';
import fs from 'fs';
import { parse } from '../src/opentype.mjs';

// Expected glyphs from HarfBuzz (hb-shape --features=…) on the same font.
describe('latin features beyond the ligatures', function() {
    const bytes = fs.readFileSync('./test/fonts/FiraSansOT-Medium.otf');
    const font = parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const names = (text, features) => font.stringToGlyphs(text, { features }).map(glyph => glyph.name).join('|');

    it('small caps reach accented and extended Latin letters (smcp)', function() {
        assert.equal(names('café Straße', { smcp: true }), 'c.sc|a.sc|f.sc|eacute.sc|space|S|t.sc|r.sc|a.sc|germandbls.sc|e.sc');
    });
    it('capitals to small caps (c2sc with smcp)', function() {
        assert.equal(names('Café', { c2sc: true, smcp: true }), 'c.sc|a.sc|f.sc|eacute.sc');
    });
    it('oldstyle figures (onum)', function() {
        assert.equal(names('2024', { onum: true }), 'two.osf|zero.osf|two.osf|four.osf');
    });
    it('fractions (frac)', function() {
        assert.equal(names('1/2', { frac: true }), 'one.numr|fraction|two.dnom');
    });
    it('case-sensitive forms (case)', function() {
        assert.equal(names('(HELLO)-', { case: true }), 'parenleft.case|H|E|L|L|O|parenright.case|hyphen.case');
    });
    it('ligatures still apply, and nothing changes without features', function() {
        assert.equal(names('café', {}), 'c|a|f|eacute');
    });
});
