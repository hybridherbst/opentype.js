/**
 * Trace VF import → export flow to find where data is lost
 */
import * as opentype from '../src/opentype.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load source VF font
const srcPath = path.join(__dirname, 'fonts/RobotoFlex-Variable.ttf');
console.log('Loading source VF:', srcPath);
const srcFont = await opentype.load(srcPath);

console.log('\n=== Source Font Analysis ===');
console.log('Axes:', srcFont.tables.fvar.axes.map(a => a.tag).join(', '));
console.log('Has gvar:', !!srcFont.tables.gvar);

// Simulate what the editor import does
console.log('\n=== Simulating Editor Import ===');

// Helper similar to extractTransformedPoints in font-editor.html
function extractTransformedPoints(transformPoints, unitsPerEm, preserveCurveData = false) {
    const scale = 10 / unitsPerEm * 1.2;
    const shapes = [];
    let currentShape = [];
    
    for (const pt of transformPoints) {
        if (preserveCurveData) {
            currentShape.push([
                Math.round(pt.x * scale * 10) / 10,
                Math.round(pt.y * scale * 10) / 10,
                pt.onCurve !== false ? 1 : 0
            ]);
        } else {
            currentShape.push([
                Math.round(pt.x * scale * 10) / 10,
                Math.round(pt.y * scale * 10) / 10
            ]);
        }
        
        if (pt.lastPointOfContour) {
            shapes.push(currentShape);
            currentShape = [];
        }
    }
    
    if (currentShape.length > 0) {
        shapes.push(currentShape);
    }
    
    return shapes;
}

// Get test glyph
const testGlyph = srcFont.charToGlyph('A');
console.log('Test glyph A - original points:', testGlyph.points?.length);

// Extract at default
const defaultCoords = { wght: 400 };
const maxCoords = { wght: 900 };

const defaultTransform = srcFont.variation.getTransform(testGlyph.index, defaultCoords);
const maxTransform = srcFont.variation.getTransform(testGlyph.index, maxCoords);

console.log('Default transform points:', defaultTransform.points?.length);
console.log('Max transform points:', maxTransform.points?.length);

// Extract using editor function (with curve data preserved)
const defaultShapes = extractTransformedPoints(defaultTransform.points, srcFont.unitsPerEm, true);
const maxShapes = extractTransformedPoints(maxTransform.points, srcFont.unitsPerEm, true);

const defaultFlat = defaultShapes.flat();
const maxFlat = maxShapes.flat();

console.log('\n=== Extracted Points ===');
console.log('Default shapes:', defaultShapes.length, '-> flat points:', defaultFlat.length);
console.log('Max shapes:', maxShapes.length, '-> flat points:', maxFlat.length);
console.log('Sample default point:', defaultFlat[0]);
console.log('Sample max point:', maxFlat[0]);

// Check point delta
if (defaultFlat.length === maxFlat.length) {
    let nonZeroDeltas = 0;
    for (let i = 0; i < defaultFlat.length; i++) {
        const dx = maxFlat[i][0] - defaultFlat[i][0];
        const dy = maxFlat[i][1] - defaultFlat[i][1];
        if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
            nonZeroDeltas++;
        }
    }
    console.log('Points with non-zero deltas:', nonZeroDeltas, 'of', defaultFlat.length);
} else {
    console.log('❌ POINT COUNT MISMATCH between masters!');
}

// Simulate what would happen in state.masters
console.log('\n=== Simulating state.masters ===');
const simulatedState = {
    axes: [{ tag: 'wght', name: 'Weight', minValue: 100, defaultValue: 400, maxValue: 900 }],
    masters: [
        { name: 'Default', coords: { wght: 400 }, glyphs: { 'A': defaultShapes } },
        { name: 'Max', coords: { wght: 900 }, glyphs: { 'A': maxShapes } }
    ]
};

console.log('Master 0 (default) glyph A shapes:', simulatedState.masters[0].glyphs['A'].length);
console.log('Master 1 (max) glyph A shapes:', simulatedState.masters[1].glyphs['A'].length);

// Simulate _flattenGlyphPoints
function _flattenGlyphPoints(pointsOrShapes) {
    if (!pointsOrShapes || pointsOrShapes.length === 0) return [];
    const isNested = Array.isArray(pointsOrShapes[0]) && Array.isArray(pointsOrShapes[0][0]);
    if (isNested) {
        return pointsOrShapes.flat();
    }
    return pointsOrShapes;
}

const basePts = _flattenGlyphPoints(simulatedState.masters[0].glyphs['A']);
const targetPts = _flattenGlyphPoints(simulatedState.masters[1].glyphs['A']);

console.log('\n=== After _flattenGlyphPoints ===');
console.log('Base points:', basePts.length);
console.log('Target points:', targetPts.length);
console.log('Match:', basePts.length === targetPts.length ? '✅' : '❌');

if (basePts.length === targetPts.length) {
    // Calculate deltas
    const scale = 2000 / 10; // unitsPerEm / editorMax
    let nonZeroX = 0, nonZeroY = 0;
    const deltaX = [];
    const deltaY = [];
    
    for (let i = 0; i < basePts.length; i++) {
        const dx = Math.round((targetPts[i][0] - basePts[i][0]) * scale);
        const dy = Math.round((targetPts[i][1] - basePts[i][1]) * scale);
        deltaX.push(dx);
        deltaY.push(dy);
        if (dx !== 0) nonZeroX++;
        if (dy !== 0) nonZeroY++;
    }
    
    console.log('\n=== Delta Calculation ===');
    console.log('Non-zero X deltas:', nonZeroX);
    console.log('Non-zero Y deltas:', nonZeroY);
    console.log('Sample deltas X:', deltaX.slice(0, 5));
    console.log('Sample deltas Y:', deltaY.slice(0, 5));
    
    if (nonZeroX === 0 && nonZeroY === 0) {
        console.log('\n❌ ALL DELTAS ARE ZERO - This is why VF export fails');
        console.log('Investigating why...');
        console.log('Base point 0:', basePts[0]);
        console.log('Target point 0:', targetPts[0]);
        console.log('Raw difference:', targetPts[0][0] - basePts[0][0], targetPts[0][1] - basePts[0][1]);
    } else {
        console.log('\n✅ Deltas look correct - issue may be elsewhere');
    }
}

console.log('\n=== Done ===');
