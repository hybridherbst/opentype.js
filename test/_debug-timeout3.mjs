import { readFileSync } from 'fs';
import { parse } from '../src/opentype.js';

const data = readFileSync('./test/fonts/RobotoFlex-Variable.ttf');
const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
const font = parse(buf);

console.log('Glyphs:', font.glyphs.length, 'Axes:', font.tables.fvar.axes.length);

// Test getTransform on each glyph individually with timeout
const coords = { wght: 700 };
for (let i = 0; i < font.glyphs.length; i++) {
    const g = font.glyphs.get(i);
    const t = Date.now();
    try {
        const ng = font.variation.process.getTransform(g, coords);
        const elapsed = Date.now() - t;
        if (elapsed > 100) {
            console.log(`Glyph ${i} (${g.name}): ${elapsed}ms, composite=${g.isComposite}, components=${g.components?.length || 0}`);
        }
    } catch(e) {
        console.log(`Glyph ${i} ERROR: ${e.message}`);
    }
    if (Date.now() - t > 5000) {
        console.log(`Glyph ${i} took too long, aborting`);
        process.exit(1);
    }
}
console.log('All glyphs processed successfully');
