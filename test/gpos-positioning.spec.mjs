import assert from 'assert';
import fs from 'fs';
import { parse } from '../src/opentype.mjs';

const load = (name) => {
    const bytes = fs.readFileSync(`./test/fonts/${name}`);
    return parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
};

/** Where each glyph is drawn (pen plus offset) and the run's advance, order-free: HarfBuzz
 * lists a right-to-left cluster base first, opentype.js mark first, at the same places. */
const drawn = (glyphs) => {
    let pen = 0;
    const out = glyphs.map(([g, ax, dx, dy]) => { const at = [g, pen + dx, dy]; pen += ax; return at; });
    return { glyphs: out.sort((a, b) => a[0] - b[0] || a[1] - b[1]), advance: pen };
};

describe('GPOS positioning (getPositions, forEachGlyph)', function() {
    // HarfBuzz's OpenType shaper (hb-shape --shapers=ot) on the same fonts and texts.
    const expected = JSON.parse(fs.readFileSync('./test/fonts/gpos-positions.harfbuzz.json', 'utf8'));
    for (const [file, cases] of Object.entries(expected)) {
        const font = load(file);
        for (const [text, want] of Object.entries(cases)) {
            it(`positions ${JSON.stringify(text)} in ${file} as HarfBuzz does`, function() {
                const runs = font.stringToGlyphRuns(text);
                const positions = font.position.getVisualPositions(runs.indexes, runs.rtlRuns, {
                    script: font.position.getTextScript(text, (tag) => tag !== 'arab'),
                });
                const got = runs.indexes.map((g, i) => [g, (font.glyphs.get(g).advanceWidth || 0) + positions[i].xAdvance, positions[i].xOffset, positions[i].yOffset]);
                assert.deepEqual(drawn(got), want);
            });
        }
    }

    it('draws glyphs where the positions put them (forEachGlyph, so getPath and draw)', function() {
        const font = load('SourceSansPro-Regular.otf');
        const text = 'q̃́'; // no precomposed q with either mark: three glyphs, the marks stacked
        const runs = font.stringToGlyphRuns(text);
        assert.equal(runs.indexes.length, 3);
        const positions = font.position.getVisualPositions(runs.indexes, runs.rtlRuns);
        const placed = [];
        font.forEachGlyph(text, 0, 0, font.unitsPerEm, {}, (glyph, x, y) => placed.push([glyph.index, Math.round(x), Math.round(-y)]));
        let pen = 0;
        assert.deepEqual(placed, runs.indexes.map((g, i) => {
            const at = [g, pen + positions[i].xOffset, positions[i].yOffset];
            pen += (font.glyphs.get(g).advanceWidth || 0) + positions[i].xAdvance;
            return at;
        }));
        assert.ok(placed[2][1] < pen && placed[1][1] < pen, 'both marks are drawn back over q, not after it');
    });

    it('turns positioning off with kerning: false and per-feature flags', function() {
        const font = load('SourceSansPro-Regular.otf');
        const advance = (options) => font.getAdvanceWidth('AV', 1000, options);
        assert.ok(advance({ kerning: true }) < advance({ kerning: false }), 'kern tightens AV');
        // The acute is drawn for lowercase height; mark attachment moves it back over q.
        const markX = (options) => { const xs = []; font.forEachGlyph('q́', 0, 0, 1000, options, (g, x) => xs.push(x)); return xs[1]; };
        const advanceQ = font.charToGlyph('q').advanceWidth;
        assert.ok(markX({}) < advanceQ, 'the acute attaches over q');
        assert.equal(markX({ features: { mark: false } }), advanceQ, 'without mark the acute stays at the pen');
    });
});

describe('normalization against the font (normalizeForFont)', function() {
    const font = load('SourceSansPro-Regular.otf');
    const has = (ch) => font.charToGlyphIndex(ch) > 0;

    it('decomposes a character the font lacks, then recomposes what it has', function() {
        assert.ok(!has('Ḉ') && has('Ç'));
        // C with cedilla and acute -> C + cedilla + acute -> C-cedilla + acute.
        assert.equal(font.normalizeForFont('Ḉ'), 'Ḉ');
    });

    it('composes a base and a mark into a character the font has', function() {
        assert.equal(font.normalizeForFont('Â'), 'Â');
        assert.equal(font.normalizeForFont('Ẫ'), has('Ẫ') ? 'Ẫ' : 'Ẫ');
    });

    it('orders marks canonically and does not compose across a blocking mark', function() {
        // Dot below (class 220) sorts before acute (230); q has no precomposed form with either.
        assert.equal(font.normalizeForFont('q̣́'), 'q̣́');
        // Two marks of one class: the second is blocked by the first and stays a mark.
        assert.equal(font.normalizeForFont('ã́'), 'ã́');
    });

    it('keeps characters the font has', function() {
        assert.equal(font.normalizeForFont('é'), 'é');
    });
});
