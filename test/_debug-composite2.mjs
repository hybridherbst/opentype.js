import { readFileSync } from 'fs';

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

// Monkey-patch the _addVariationData to intercept delta generation
const origAddVarData = builder._addVariationData.bind(builder);
builder._addVariationData = function(font, glyphIndexMap, scale, syntheticShapeComponents, vfCompositeChars, ...rest) {
    console.log('\n=== _addVariationData called ===');
    console.log('syntheticShapeComponents:', [...syntheticShapeComponents.entries()]);
    console.log('vfCompositeChars:', vfCompositeChars ? [...vfCompositeChars.entries()].map(([k, v]) => [k, v.map(r => ({name: r.name, dx: r.dx, dy: r.dy}))]) : 'undefined');
    console.log('glyphIndexMap:', [...glyphIndexMap.entries()]);
    
    // List all glyphs in font before addAxis
    console.log('\nGlyphs in font:');
    for (let i = 0; i < font.glyphs.length; i++) {
        const g = font.glyphs.get(i);
        console.log(`  ${i}: name="${g.name}" isComposite=${g.isComposite} components=${g.components?.length || 0}`);
    }
    
    return origAddVarData(font, glyphIndexMap, scale, syntheticShapeComponents, vfCompositeChars, ...rest);
};

// Also monkey-patch _buildMasterDeltas to see what deltas are generated
const origBuildDeltas = builder._buildMasterDeltas.bind(builder);
builder._buildMasterDeltas = function(axis, scale, axisIndex, axisCount, syntheticShapeComponents, vfCompositeChars, ...rest) {
    const result = origBuildDeltas(axis, scale, axisIndex, axisCount, syntheticShapeComponents, vfCompositeChars, ...rest);
    console.log('\n=== _buildMasterDeltas result ===');
    for (const deltaSet of result) {
        console.log(`  peakTuple: ${JSON.stringify(deltaSet.peakTuple)}`);
        for (const [name, data] of deltaSet.deltas) {
            console.log(`    "${name}": deltas=${JSON.stringify(data.deltas)}, deltasY=${JSON.stringify(data.deltasY)}`);
        }
    }
    return result;
};

const font = builder.build({ useComposites: true });

// Now check gvar in the built font (before export)
console.log('\n=== gvar in built font ===');
const gvar = font.tables.gvar;
if (gvar) {
    for (let i = 0; i < font.glyphs.length; i++) {
        const v = gvar.glyphVariations[i];
        if (v && v.headers && v.headers.length > 0) {
            const g = font.glyphs.get(i);
            console.log(`Glyph ${i} (name="${g.name}"): ${v.headers.length} headers`);
            for (const h of v.headers) {
                console.log(`  deltas=${JSON.stringify(h.deltas)}, deltasY=${JSON.stringify(h.deltasY)}, peak=${JSON.stringify(h.peakTuple)}`);
            }
        }
    }
}
