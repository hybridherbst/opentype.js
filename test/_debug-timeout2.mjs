import { readFileSync } from 'fs';
import { parse } from '../src/opentype.js';

const data = readFileSync('./test/fonts/RobotoFlex-Variable.ttf');
const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);

console.log('Parsing...');
const font = parse(buf);
console.log('Glyphs:', font.glyphs.length, 'Axes:', font.tables.fvar.axes.length);

// Test instantiate on original font
console.log('Instantiating original at wght=700...');
const t0 = Date.now();
const instance = font.instantiate({ wght: 700 });
console.log('Original instantiate took:', Date.now() - t0, 'ms');

// Now try the roundtripped font
console.log('\nExporting...');
const t1 = Date.now();
const exported = font.toArrayBuffer();
console.log('Export took:', Date.now() - t1, 'ms');

console.log('Re-parsing...');
const reloaded = parse(exported);

// Check gvar structure
const gvar = reloaded.tables.gvar;
let compositeCount = 0;
let compositeWithGvar = 0;
for (let i = 0; i < reloaded.glyphs.length; i++) {
    const g = reloaded.glyphs.get(i);
    if (g.isComposite) {
        compositeCount++;
        const v = gvar?.glyphVariations[i];
        if (v && v.headers && v.headers.length > 0) {
            compositeWithGvar++;
        }
    }
}
console.log('Composites:', compositeCount, 'with gvar:', compositeWithGvar);

// Test getTransform on just one composite glyph to see if it hangs
console.log('\nTesting getTransform on first composite...');
for (let i = 0; i < reloaded.glyphs.length; i++) {
    const g = reloaded.glyphs.get(i);
    if (g.isComposite) {
        console.log(`  Glyph ${i}: components=${g.components?.length}`);
        if (g.components) {
            g.components.forEach(c => console.log(`    -> glyphIndex=${c.glyphIndex}`));
        }
        const t2 = Date.now();
        try {
            const transformed = reloaded.variation.getTransform(g, { wght: 700 });
            console.log(`  getTransform took: ${Date.now() - t2}ms`);
        } catch(e) {
            console.log(`  getTransform error: ${e.message}`);
        }
        break;
    }
}

console.log('\nInstantiating reloaded at wght=700...');
const t3 = Date.now();
let count = 0;
for (let i = 0; i < reloaded.glyphs.length; i++) {
    const g = reloaded.glyphs.get(i);
    if (reloaded.variation && reloaded.variation.process) {
        const ng = reloaded.variation.process.getTransform(g, { wght: 700 });
    }
    count++;
    if (count % 100 === 0) {
        console.log(`  Processed ${count}/${reloaded.glyphs.length} glyphs (${Date.now() - t3}ms)`);
    }
}
console.log('Instantiation loop took:', Date.now() - t3, 'ms');
