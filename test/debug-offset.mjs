import * as opentype from '../src/opentype.js';
import * as fs from 'fs';

// Snapping functions - EXACT copies from reading-writing.html
const PREVIEW_FONT_SIZE = 72;

function getSnapParams(strength, distance, x, y) {
    return { strength: strength / 100, distance, x, y };
}

function getSnapParamsForFont(font, strength, distance, x, y) {
    const params = getSnapParams(strength, distance, x, y);
    const scale = font.unitsPerEm / PREVIEW_FONT_SIZE;
    return {
        ...params,
        distance: params.distance * scale,
        x: params.x * scale,
        y: params.y * scale
    };
}

function snapValue(v, dist, s) {
    return (v * (1.0 - s)) + (s * Math.round(v / dist) * dist);
}

function snapCommand(cmd, p) {
    const apply = (val, offset) => snapValue(val + offset, p.distance, p.strength) - offset;
    if (cmd.x !== undefined) cmd.x = apply(cmd.x, p.x);
    if (cmd.y !== undefined) cmd.y = apply(cmd.y, p.y);
    if (cmd.x1 !== undefined) cmd.x1 = apply(cmd.x1, p.x);
    if (cmd.y1 !== undefined) cmd.y1 = apply(cmd.y1, p.y);
    if (cmd.x2 !== undefined) cmd.x2 = apply(cmd.x2, p.x);
    if (cmd.y2 !== undefined) cmd.y2 = apply(cmd.y2, p.y);
}

function applySnappingToFontInPlace(font, params) {
    for (let i = 0; i < font.glyphs.length; i++) {
        const g = font.glyphs.get(i);
        if (!g || !g.path || !g.path.commands) continue;
        for (const cmd of g.path.commands) snapCommand(cmd, params);
    }
}

const buf = fs.readFileSync('./docs/fonts/FiraSansMedium.woff');
const font = opentype.parse(buf.buffer);

// Simulate the full export pipeline
console.log('=== Full Export Pipeline Test ===');
console.log('Testing with: strength=80, distance=50, xOffset=25, yOffset=10\n');

const strength = 80;
const distance = 50;
const xOffset = 25;
const yOffset = 10;

// 1. Preview: render glyph at fontSize=72, apply screen-space snap
const glyph = font.charToGlyph('A');
const screenPath = glyph.getPath(0, 0, PREVIEW_FONT_SIZE, {}, font);
const screenParams = getSnapParams(strength, distance, xOffset, yOffset);
for (const cmd of screenPath.commands) snapCommand(cmd, screenParams);

console.log('Preview (screen-space snap):');
console.log('  Params:', screenParams);
const screenFirst = screenPath.commands.find(c => c.type === 'M');
console.log('  First M command:', screenFirst.x.toFixed(2), screenFirst.y.toFixed(2));

// 2. Export: instantiate, apply font-unit snap, export, reimport
const baked = font.instantiate();
const fontParams = getSnapParamsForFont(baked, strength, distance, xOffset, yOffset);
console.log('\nExport (font-unit snap):');
console.log('  Params:', { ...fontParams, distance: fontParams.distance.toFixed(2), x: fontParams.x.toFixed(2), y: fontParams.y.toFixed(2) });
applySnappingToFontInPlace(baked, fontParams);

// Check before export
const bakedGlyph = baked.charToGlyph('A');
const bakedFirst = bakedGlyph.path.commands.find(c => c.type === 'M');
console.log('  Before export, first M:', bakedFirst.x.toFixed(2), bakedFirst.y.toFixed(2));

// Export and reimport
const buffer = baked.toArrayBuffer();
const reimported = opentype.parse(buffer);
const reimportedGlyph = reimported.charToGlyph('A');
const reimportedFirst = reimportedGlyph.path.commands.find(c => c.type === 'M');
console.log('  After reimport, first M:', reimportedFirst.x.toFixed(2), reimportedFirst.y.toFixed(2));

// 3. Render reimported glyph at fontSize=72 to compare
const reimportedPath = reimportedGlyph.getPath(0, 0, PREVIEW_FONT_SIZE, {}, reimported);
const reimportedScreenFirst = reimportedPath.commands.find(c => c.type === 'M');
console.log('  Rendered at fontSize=72:', reimportedScreenFirst.x.toFixed(2), reimportedScreenFirst.y.toFixed(2));

// Compare
console.log('\n=== Comparison ===');
console.log('Preview result:', screenFirst.x.toFixed(2), screenFirst.y.toFixed(2));
console.log('Export result:', reimportedScreenFirst.x.toFixed(2), reimportedScreenFirst.y.toFixed(2));

const diffX = Math.abs(screenFirst.x - reimportedScreenFirst.x);
const diffY = Math.abs(screenFirst.y - reimportedScreenFirst.y);
console.log('Difference: X=' + diffX.toFixed(4) + ', Y=' + diffY.toFixed(4));
console.log('Match:', diffX < 0.1 && diffY < 0.1 ? 'YES ✓' : 'NO ✗');
