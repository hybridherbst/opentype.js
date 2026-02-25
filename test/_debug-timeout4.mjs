import { readFileSync } from 'fs';
import { parse } from '../src/opentype.js';

const data = readFileSync('./test/fonts/RobotoFlex-Variable.ttf');
const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
const font = parse(buf);

let composites = 0;
let maxComponents = 0;
let nested = 0;
for (let i = 0; i < font.glyphs.length; i++) {
    const g = font.glyphs.get(i);
    if (g.isComposite) {
        composites++;
        const n = g.components?.length || 0;
        if (n > maxComponents) maxComponents = n;
        // Check for nested composites
        for (const c of g.components || []) {
            const cg = font.glyphs.get(c.glyphIndex);
            if (cg && cg.isComposite) nested++;
        }
    }
}
console.log(`Total: ${font.glyphs.length} glyphs, ${composites} composites, max components: ${maxComponents}, nested: ${nested}`);

// How many total gvar variation headers?
const gvar = font.tables.gvar;
let totalHeaders = 0;
let maxHeaders = 0;
for (let i = 0; i < font.glyphs.length; i++) {
    const v = gvar?.glyphVariations[i];
    if (v && v.headers) {
        totalHeaders += v.headers.length;
        if (v.headers.length > maxHeaders) maxHeaders = v.headers.length;
    }
}
console.log(`Gvar: ${totalHeaders} total headers, max per glyph: ${maxHeaders}`);

// Check how many times getTransform is called for a single composite
let callCount = 0;
const origGetTransform = font.variation.process.getTransform.bind(font.variation.process);
font.variation.process.getTransform = function(glyph, coords) {
    callCount++;
    return origGetTransform(glyph, coords);
};

// Try one composite
const g168 = font.glyphs.get(168);
callCount = 0;
const t = Date.now();
font.variation.process.getTransform(g168, { wght: 700 });
console.log(`\nGlyph 168: ${Date.now()-t}ms, getTransform called ${callCount} times`);

// Try a nested composite
for (let i = 0; i < font.glyphs.length; i++) {
    const g = font.glyphs.get(i);
    if (g.isComposite) {
        for (const c of g.components || []) {
            const cg = font.glyphs.get(c.glyphIndex);
            if (cg && cg.isComposite) {
                callCount = 0;
                const t2 = Date.now();
                font.variation.process.getTransform(g, { wght: 700 });
                console.log(`Glyph ${i} (nested): ${Date.now()-t2}ms, getTransform called ${callCount} times`);
                break;
            }
        }
        if (nested > 0) break;
    }
}
