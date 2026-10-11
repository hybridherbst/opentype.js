import assert from 'assert';
import { Font, Glyph, Path, parse } from '../src/opentype.mjs';
import { VariationManager } from '../src/variation.mjs';

describe('empty glyph advance variations', function() {
 it('writes HVAR for spaces without writing contour tuple data', function() {
  const font = new Font({familyName:'Empty variable', styleName:'Regular', unitsPerEm:1000,
   ascender:800, descender:-200, glyphs:[new Glyph({name:'.notdef', advanceWidth:500, path:new Path()}),
    new Glyph({name:'space', unicode:32, advanceWidth:400, path:new Path()})]});
  font.variation = new VariationManager(font);
  font.variation.addAxis({tag:'wght', name:'Weight', minValue:100, defaultValue:400, maxValue:900,
   deltaGenerator:glyph=>glyph.name==='space'?{peakTuple:[1],advanceWidthDelta:200}:null});
  font.variation.finalizeHvar();
  const parsed = parse(font.toArrayBuffer());
  assert.ok(parsed.tables.hvar);
  assert.equal(parsed.variation.getTransform(1,{wght:900}).advanceWidth,600);
  assert.equal(font.tables.gvar.glyphVariations[1].headers.length,0);
 });
});
