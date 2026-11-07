import assert from 'assert';
import { Font, Glyph, Path, parse } from '../src/opentype.mjs';
import { VariationManager } from '../src/variation.mjs';

describe('empty glyph advance variations', function() {
 it('writes HVAR for spaces and the matching advance phantom delta', function() {
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
  // Only the four phantom points (origin, advance, top, bottom) vary, so
  // consumers that read phantom points instead of HVAR agree on the advance.
  const headers = font.tables.gvar.glyphVariations[1].headers;
  assert.equal(headers.length,1);
  assert.deepEqual(headers[0].deltas,[0,200,0,0]);
  assert.deepEqual(headers[0].deltasY,[0,0,0,0]);
  assert.deepEqual(parsed.tables.gvar.glyphVariations[1].headers[0].deltas,[0,200,0,0]);
 });
});
