import { readFileSync } from 'fs';
import { parse } from '../src/opentype.js';

const fontEditorApi = await import('../docs/examples/font-editor-api.js');
const { FontEditorState, FontBuilder } = fontEditorApi;

const stateJson = readFileSync('./test/fonts/vf-shapes-and-references-state.json', 'utf8');
const stateData = JSON.parse(stateJson);

const state = new FontEditorState({});
state.glyphs = stateData.glyphs || {};
state.glyphWidths = stateData.glyphWidths || {};
state.glyphReferences = stateData.glyphReferences || {};

if (stateData.vf) {
    state.vfEnabled = stateData.vf.enabled;
    state.axes = stateData.vf.axes || [];
    state.masters = stateData.vf.masters || [];
    state.instances = stateData.vf.instances || [];
}

const opentype = await import('../src/opentype.js');
const builder = new FontBuilder(state, opentype);
const font = builder.build({ useComposites: true });
const buffer = builder.toArrayBuffer();
const data = Buffer.from(buffer);
const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
const reimported = parse(arrayBuffer);

// Debug: list all glyphs
for (let i = 0; i < reimported.glyphs.length; i++) {
    const g = reimported.glyphs.get(i);
    console.log(`Glyph ${i}: name=${g.name}, isComposite=${g.isComposite}, points=${g.points?.length}, components=${g.components?.length}`);
    if (g.components) {
        g.components.forEach((c, j) => console.log(`  Component ${j}: glyphIndex=${c.glyphIndex} dx=${c.dx} dy=${c.dy} xScale=${c.xScale} yScale=${c.yScale}`));
    }
}

// Debug: check gvar data
const gvar = reimported.tables.gvar;
console.log('\ngvar entries:');
for (let i = 0; i < 8; i++) {
    const v = gvar?.glyphVariations[i];
    console.log(`  Glyph ${i}: ${v ? 'has gvar (' + (v.headers?.length || 0) + ' headers)' : 'no gvar'}`);
    if (v && v.headers) {
        v.headers.forEach((h, j) => {
            console.log(`    Header ${j}: deltas=${JSON.stringify(h.deltas?.slice(0, 8))}, deltasY=${JSON.stringify(h.deltasY?.slice(0, 8))}`);
            console.log(`      peakTuple=${JSON.stringify(h.peakTuple)}, privatePoints=${JSON.stringify(h.privatePoints)}`);
        });
    }
}

// Check _Test glyph points (raw)
const testGlyph = reimported.glyphs.get(3);
console.log('\n_Test (glyph 3) raw points:');
console.log(testGlyph.points?.map(p => ({ x: p.x, y: p.y })));

// Check standalone _Test at TEST=400 (default)
const test400 = reimported.variation.getTransform(3, { TEST: 400 });
console.log('\nStandalone _Test at TEST=400 (default):');
console.log(test400.points.slice(0, 6).map(p => ({ x: p.x, y: p.y })));

// Check standalone _Test at TEST=100
const test100 = reimported.variation.getTransform(3, { TEST: 100 });
console.log('\nStandalone _Test at TEST=100:');
console.log(test100.points.slice(0, 6).map(p => ({ x: p.x, y: p.y })));

// Check O glyph points (raw)
const oGlyph = reimported.glyphs.get(5);
console.log('\nO (glyph 5) raw points:');
console.log(oGlyph.points?.map(p => ({ x: p.x, y: p.y })));
console.log('O isComposite:', oGlyph.isComposite);

// Check composite O at TEST=400 (default)
const composite400 = reimported.variation.getTransform(5, { TEST: 400 });
console.log('\nComposite O at TEST=400 (default):');
console.log(composite400.points.map(p => ({ x: p.x, y: p.y })));

// Check composite O at TEST=100
const composite100 = reimported.variation.getTransform(5, { TEST: 100 });
console.log('\nComposite O at TEST=100:');
console.log(composite100.points.map(p => ({ x: p.x, y: p.y })));
