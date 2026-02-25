import fs from 'fs';
import * as opentype from '../dist/opentype.module.js';

const buf = fs.readFileSync('/Users/herbst/git/opentype-editor/test/fonts/Nabla-Regular-VariableFont_EDPT,EHLT.ttf');
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

// Find glyph A
const aGlyph = font.charToGlyph('A');
console.log('A glyph index:', aGlyph.index);

// Get COLRv1 paint tree for A
const paintTree = font.layers.getPaintTree(aGlyph.index);
if (!paintTree) {
    console.log('No paint tree found for A');
    process.exit(1);
}

console.log('Paint root format:', paintTree.format);

// Recursively find ALL gradient paints
function findGradients(node, results = [], depth = 0) {
    if (!node || depth > 20) return results;
    if (node.format >= 4 && node.format <= 9) {
        results.push(node);
    }
    if (node.paint) findGradients(node.paint, results, depth + 1);
    if (node.layers) {
        for (const l of node.layers) findGradients(l, results, depth + 1);
    }
    return results;
}

const grads = findGradients(paintTree);
console.log('\nFound', grads.length, 'gradient paints');

for (let i = 0; i < Math.min(grads.length, 3); i++) {
    const grad = grads[i];
    console.log(`\n--- Gradient #${i} ---`);
    console.log('  format:', grad.format);
    if (grad.format === 4 || grad.format === 5) {
        console.log('  p0:', grad.x0, grad.y0);
        console.log('  p1:', grad.x1, grad.y1);
        console.log('  p2:', grad.x2, grad.y2);
    }
    const stops = grad.colorLine?.stops || [];
    console.log('  colorLine extend:', grad.colorLine?.extend);
    console.log('  num stops:', stops.length);
    console.log('  first 5 stops:');
    for (let j = 0; j < Math.min(5, stops.length); j++) {
        const s = stops[j];
        console.log(`    [${j}] offset=${s.stopOffset} palette=${s.paletteIndex} alpha=${s.alpha}`);
    }
    if (stops.length > 5) {
        console.log('  last 3 stops:');
        for (let j = stops.length - 3; j < stops.length; j++) {
            const s = stops[j];
            console.log(`    [${j}] offset=${s.stopOffset} palette=${s.paletteIndex} alpha=${s.alpha}`);
        }
    }
    // Check validity
    const bad = stops.filter(s => s.paletteIndex > 9 || s.alpha < -0.01 || s.alpha > 1.01 || s.stopOffset < -0.01 || s.stopOffset > 1.01);
    console.log('  out-of-range stops:', bad.length, 'of', stops.length);
}

// Also check the flattened layers
console.log('\n--- Flattened layers for A ---');
const layers = font.layers.get(aGlyph.index);
console.log('Number of layers:', layers.length);
for (let i = 0; i < layers.length; i++) {
    const l = layers[i];
    const hasPaint = !!l.paint;
    console.log(`  Layer ${i}: glyph=${l.glyph?.index} paletteIndex=${l.paletteIndex} hasPaint=${hasPaint} alpha=${l.alpha}`);
    if (l.paint) {
        console.log(`    paint format: ${l.paint.format}`);
        const pStops = l.paint.colorLine?.stops || [];
        console.log(`    stops: ${pStops.length}`);
        if (pStops.length > 0) {
            console.log(`    first stop: offset=${pStops[0].stopOffset} palette=${pStops[0].paletteIndex} alpha=${pStops[0].alpha}`);
            const badP = pStops.filter(s => s.paletteIndex > 9 || s.alpha < -0.01 || s.stopOffset < -0.01);
            console.log(`    out-of-range: ${badP.length} of ${pStops.length}`);
        }
    }
}
