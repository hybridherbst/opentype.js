import assert from 'assert';
import {Font,Glyph,Path,VariationManager,parse} from '../src/opentype.mjs';

describe('constant horizontal metrics in variable fonts',()=>{
 it('writes a valid HVAR with zero adjustments across a custom axis',()=>{
  const path=new Path();path.moveTo(0,0);path.lineTo(100,0);path.lineTo(50,100);path.close();
  const font=new Font({familyName:'Constant metrics',styleName:'Regular',unitsPerEm:1000,ascender:800,descender:-200,glyphs:[new Glyph({name:'.notdef',advanceWidth:500,path:new Path()}),new Glyph({name:'A',unicode:65,advanceWidth:400,path})]});
  font.variation=new VariationManager(font);
  font.variation.addAxis({tag:'TEST',name:'Shape',minValue:0,defaultValue:50,maxValue:100,deltaGenerator:glyph=>glyph.name==='A'?{peakTuple:[1],deltas:[0,20,0,0,0,0,0],deltasY:[0,0,0,0,0,0,0],advanceWidthDelta:0}:null});
  font.variation.finalizeHvar();
  const parsed=parse(font.toArrayBuffer());
  assert.ok(parsed.tables.hvar,'Variable font explicitly declares constant advances');
  for(const TEST of [0,25,50,75,100])assert.equal(parsed.variation.getTransform(1,{TEST}).advanceWidth,400);
 });
 it('does not replace an existing HVAR when no new metric deltas were collected',()=>{
  const font=new Font({familyName:'Preserved metrics',styleName:'Regular',unitsPerEm:1000,ascender:800,descender:-200,glyphs:[]});
  font.variation=new VariationManager(font);font.variation.addAxis({tag:'TEST',name:'Shape',minValue:0,defaultValue:0,maxValue:1});
  const table={version:[1,0]};font.tables.hvar=table;font.variation.finalizeHvar();assert.equal(font.tables.hvar,table);
 });
});
