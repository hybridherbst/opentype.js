import { readFileSync } from 'fs';
import { parse } from '../src/opentype.js';

const data = readFileSync('./test/fonts/RobotoFlex-Variable.ttf');
const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);

console.log('Parsing...');
const t0 = Date.now();
const font = parse(buf);
console.log('Parse took:', Date.now() - t0, 'ms');
console.log('Axes:', font.tables.fvar?.axes?.length);
console.log('Glyphs:', font.glyphs?.length);
console.log('Has gvar:', !!font.tables.gvar);

const t1 = Date.now();
console.log('Exporting (toArrayBuffer)...');
const exported = font.toArrayBuffer();
console.log('Export took:', Date.now() - t1, 'ms, size:', exported.byteLength);

const t2 = Date.now();
console.log('Re-parsing...');
const reloaded = parse(exported);
console.log('Re-parse took:', Date.now() - t2, 'ms');
console.log('Has gvar:', !!reloaded.tables.gvar);

const t3 = Date.now();
console.log('Instantiating at wght=700...');
const instance = reloaded.instantiate({ wght: 700 });
console.log('Instantiate took:', Date.now() - t3, 'ms');

const glyph = instance.charToGlyph('A');
console.log('Glyph A:', !!glyph);
console.log('Total:', Date.now() - t0, 'ms');
