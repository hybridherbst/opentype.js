import fs from 'fs';
import * as opentype from '../dist/opentype.module.js';
import { Parser } from '../src/parse.js';

const buf = fs.readFileSync('/Users/herbst/git/opentype-editor/test/fonts/Nabla-Regular-VariableFont_EDPT,EHLT.ttf');
const data = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

// Find COLR table start
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

// Parse table directory to find COLR
const p = new Parser(data, 0);
const sfVersion = p.parseULong();
const numTables = p.parseUShort();
p.parseUShort(); // searchRange
p.parseUShort(); // entrySelector
p.parseUShort(); // rangeShift

let colrStart = 0;
for (let i = 0; i < numTables; i++) {
    const tag = p.parseTag();
    p.parseULong(); // checksum
    const off = p.parseULong();
    const len = p.parseULong();
    if (tag === 'COLR') {
        colrStart = off;
        console.log(`COLR table at offset ${off}, length ${len}`);
        break;
    }
}

if (!colrStart) {
    console.log('No COLR table found');
    process.exit(1);
}

// Parse COLR header 
const cp = new Parser(data, colrStart);
const version = cp.parseUShort();
console.log('COLR version:', version);

const numBaseGlyphRecords = cp.parseUShort();
const baseGlyphRecordsOffset = cp.parseOffset32();
const layerRecordsOffset = cp.parseOffset32();
const numLayerRecords = cp.parseUShort();
console.log('v0: numBaseGlyph:', numBaseGlyphRecords, 'baseGlyphOffset:', baseGlyphRecordsOffset,
    'layerRecordsOffset:', layerRecordsOffset, 'numLayerRecords:', numLayerRecords);

// v1 offsets (right after v0 header = 14 bytes from start)
const v1p = new Parser(data, colrStart + 14);
const baseGlyphListOffset = v1p.parseOffset32();
const layerListOffset = v1p.parseOffset32();
const clipListOffset = v1p.parseOffset32();
console.log('\nv1 offsets from COLR start:');
console.log('  baseGlyphListOffset:', baseGlyphListOffset);
console.log('  layerListOffset:', layerListOffset);
console.log('  clipListOffset:', clipListOffset);

// Parse first entry in BaseGlyphList
const bglp = new Parser(data, colrStart + baseGlyphListOffset);
const numBGP = bglp.parseULong();
console.log('\nBaseGlyphList: numRecords:', numBGP);

// Find A (glyphID=2)
for (let i = 0; i < Math.min(numBGP, 100); i++) {
    const glyphID = bglp.parseUShort();
    const paintOff = bglp.parseOffset32();
    if (glyphID === 2) {
        const paintAbsolute = colrStart + baseGlyphListOffset + paintOff;
        console.log(`\nA (glyphID=2) found at record ${i}, paintOffset=${paintOff}`);
        console.log(`  paint absolute offset: ${paintAbsolute}`);
        
        // Read the paint at this offset
        const pp = new Parser(data, paintAbsolute);
        const format = pp.parseByte();
        console.log('  paint format:', format, '(should be 1 = PaintColrLayers)');
        
        if (format === 1) {
            const numLayers = pp.parseByte();
            const firstLayerIndex = pp.parseULong();
            console.log('  numLayers:', numLayers, 'firstLayerIndex:', firstLayerIndex);
            
            // Parse LayerList to get paint offsets
            const llp = new Parser(data, colrStart + layerListOffset);
            const numPaints = llp.parseULong();
            console.log('\n  LayerList: numPaints:', numPaints);
            
            // Read paint offsets  
            const offsets = [];
            for (let j = 0; j < numPaints; j++) {
                offsets.push(llp.parseOffset32());
            }
            
            // Look at the first few layers for A
            for (let li = 0; li < numLayers; li++) {
                const layerIdx = firstLayerIndex + li;
                const layerPaintOff = offsets[layerIdx];
                const layerPaintAbs = colrStart + layerListOffset + layerPaintOff;
                
                const lpp = new Parser(data, layerPaintAbs);
                const lFormat = lpp.parseByte();
                console.log(`\n  --- Layer ${li} (index ${layerIdx}) ---`);
                console.log(`  paint offset from LayerList: ${layerPaintOff}`);
                console.log(`  paint absolute: ${layerPaintAbs}`);
                console.log(`  format: ${lFormat}`);
                
                if (lFormat === 10) { // PaintGlyph
                    const innerPaintOff = lpp.parseUInt24();
                    const glyphID = lpp.parseUShort();
                    console.log(`  PaintGlyph: innerPaintOffset=${innerPaintOff}, glyphID=${glyphID}`);
                    
                    // Parse inner paint
                    const innerAbs = layerPaintAbs + innerPaintOff;
                    const ipp = new Parser(data, innerAbs);
                    const innerFormat = ipp.parseByte();
                    console.log(`  Inner paint: format=${innerFormat}, absoluteOffset=${innerAbs}`);
                    
                    if (innerFormat === 4 || innerFormat === 5) {
                        const colorLineOffset = ipp.parseUInt24();
                        const x0 = ipp.parseShort();
                        const y0 = ipp.parseShort();
                        const x1 = ipp.parseShort();
                        const y1 = ipp.parseShort();
                        const x2 = ipp.parseShort();
                        const y2 = ipp.parseShort();
                        console.log(`  LinearGradient: colorLineOffset=${colorLineOffset}`);
                        console.log(`    p0=(${x0},${y0}) p1=(${x1},${y1}) p2=(${x2},${y2})`);
                        console.log(`    colorLine absolute: ${innerAbs + colorLineOffset}`);
                        
                        // Parse the colorLine manually
                        const clp = new Parser(data, innerAbs + colorLineOffset);
                        const extend = clp.parseUShort();
                        const numStops = clp.parseUShort();
                        console.log(`    extend=${extend}, numStops=${numStops}`);
                        
                        // Read first 3 stops
                        for (let si = 0; si < Math.min(3, numStops); si++) {
                            const stopOffset = clp.parseF2Dot14();
                            const palIdx = clp.parseUShort();
                            const alpha = clp.parseF2Dot14();
                            console.log(`    stop[${si}]: offset=${stopOffset} palette=${palIdx} alpha=${alpha}`);
                        }
                        
                        // Also try reading bytes raw from the colorLine position
                        console.log('\n    Raw bytes at colorLine offset:');
                        const rawBytes = [];
                        for (let b = 0; b < 24; b++) {
                            rawBytes.push(data.getUint8(innerAbs + colorLineOffset + b));
                        }
                        console.log('    ', rawBytes.map(b => b.toString(16).padStart(2, '0')).join(' '));
                        
                        // Also try what happens if colorLine offset is from the COLR table start
                        console.log('\n    Alternative: colorLineOffset from COLR start:');
                        const clp2 = new Parser(data, colrStart + colorLineOffset);
                        const extend2 = clp2.parseUShort();
                        const numStops2 = clp2.parseUShort();
                        console.log(`    extend=${extend2}, numStops=${numStops2}`);
                        if (numStops2 < 100) {
                            for (let si = 0; si < Math.min(3, numStops2); si++) {
                                const so = clp2.parseF2Dot14();
                                const pi = clp2.parseUShort();
                                const al = clp2.parseF2Dot14();
                                console.log(`    stop[${si}]: offset=${so} palette=${pi} alpha=${al}`);
                            }
                        }
                    } else if (innerFormat === 2 || innerFormat === 3) {
                        const palIdx = ipp.parseUShort();
                        const alpha = ipp.parseF2Dot14();
                        console.log(`  Solid: palette=${palIdx} alpha=${alpha}`);
                    }
                }
            }
        }
        break;
    }
}
