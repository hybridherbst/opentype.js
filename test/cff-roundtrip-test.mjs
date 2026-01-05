// Test simple CFF round-trip
import * as opentype from '../dist/opentype.module.js';
import fs from 'fs';

// Load the CFF font
const buffer = fs.readFileSync('./docs/fonts/FiraSansMedium.woff');
const font = opentype.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));

console.log('Font loaded:', font.getEnglishName('fontFamily'));
console.log('Outlines format:', font.outlinesFormat);
console.log('Has CFF:', !!font.tables.cff);
console.log('Glyph count:', font.glyphs.length);

// Check for undefined metrics like in browser
let hasUndefined = false;
for (let i = 0; i < font.glyphs.length; i++) {
    const g = font.glyphs.get(i);
    if (g.name === '.notdef') continue;
    const m = g.getMetrics();
    if (m.xMin === undefined || m.yMin === undefined || m.xMax === undefined || m.yMax === undefined ||
        m.leftSideBearing === undefined) {
        console.log('Glyph', i, g.name, 'has undefined metrics:', m);
        hasUndefined = true;
    }
    if (isNaN(m.xMin) || isNaN(m.yMin) || isNaN(m.xMax) || isNaN(m.yMax)) {
        console.log('Glyph', i, g.name, 'has NaN metrics:', m);
        hasUndefined = true;
    }
}

if (!hasUndefined) {
    console.log('All glyphs have valid metrics');
}

try {
    console.log('Attempting toArrayBuffer (simple roundtrip)...');
    const arrayBuffer = font.toArrayBuffer();
    console.log('SUCCESS! ArrayBuffer size:', arrayBuffer.byteLength);
    
    // Try to parse the re-serialized font
    const font2 = opentype.parse(arrayBuffer);
    console.log('Re-parsed font:', font2.getEnglishName('fontFamily'));
    console.log('Re-parsed glyphs:', font2.glyphs.length);
} catch (e) {
    console.error('ERROR:', e.message);
    console.error(e.stack);
}
