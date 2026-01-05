// Test for SNAP variable font creation from CFF font
import * as opentype from '../dist/opentype.module.js';
import fs from 'fs';

// Load the CFF font that's used in reading-writing.html
const buffer = fs.readFileSync('./docs/fonts/FiraSansMedium.woff');
const font = opentype.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));

console.log('Font loaded:', font.getEnglishName('fontFamily'));
console.log('Outlines format:', font.outlinesFormat);
console.log('Has CFF:', !!font.tables.cff);

// Create VariationManager if needed
if (!font.variation) {
    font.variation = new opentype.VariationManager(font);
}

// Simple delta generator like in reading-writing.html
const snapParams = { strength: 0.8, distance: 50, x: 0, y: 0 };

function snapValue(v, dist, s) {
    return (v * (1.0 - s)) + (s * Math.round(v / dist) * dist);
}

function snapCommand(cmd, p) {
    const apply = (val, offset) => snapValue(val + offset, p.distance, p.strength) - offset;
    const newCmd = { ...cmd };
    if (newCmd.x !== undefined) newCmd.x = apply(newCmd.x, p.x);
    if (newCmd.y !== undefined) newCmd.y = apply(newCmd.y, p.y);
    return newCmd;
}

// Pre-compute snapped paths for ALL glyphs (like the browser does)
const snappedPaths = new Map();
for (let i = 0; i < font.glyphs.length; i++) {
    const glyph = font.glyphs.get(i);
    if (!glyph || !glyph.path || !glyph.path.commands || glyph.path.commands.length === 0) continue;
    const snappedCommands = glyph.path.commands.map(cmd => snapCommand(cmd, snapParams));
    snappedPaths.set(i, snappedCommands);
}

console.log('Snapped paths computed for', snappedPaths.size, 'glyphs');

try {
    font.variation.addAxis({
        tag: 'SNAP',
        name: 'Snapping',
        minValue: 0,
        defaultValue: 0,
        maxValue: 100,
        deltaGenerator: (glyph) => {
            const snappedCommands = snappedPaths.get(glyph.index);
            if (!snappedCommands) return null;
            
            const baseCommands = glyph.path.commands;
            if (baseCommands.length !== snappedCommands.length) return null;
            
            const deltas = [];
            const deltasY = [];
            
            for (let i = 0; i < baseCommands.length; i++) {
                const base = baseCommands[i];
                const target = snappedCommands[i];
                
                if (base.x !== undefined && target.x !== undefined) {
                    deltas.push(Math.round(target.x - base.x));
                    deltasY.push(Math.round(target.y - base.y));
                }
                if (base.x1 !== undefined && target.x1 !== undefined) {
                    deltas.push(Math.round(target.x1 - base.x1));
                    deltasY.push(Math.round(target.y1 - base.y1));
                }
                if (base.x2 !== undefined && target.x2 !== undefined) {
                    deltas.push(Math.round(target.x2 - base.x2));
                    deltasY.push(Math.round(target.y2 - base.y2));
                }
            }
            
            // Phantom points
            deltas.push(0, 0, 0, 0);
            deltasY.push(0, 0, 0, 0);
            
            return { deltas, deltasY };
        }
    });
    console.log('Axis added successfully');
    console.log('Has gvar:', !!font.tables.gvar);
    console.log('Has fvar:', !!font.tables.fvar);
    
    // Now try to serialize
    console.log('Attempting toArrayBuffer...');
    const arrayBuffer = font.toArrayBuffer();
    console.log('SUCCESS! ArrayBuffer size:', arrayBuffer.byteLength);
} catch (e) {
    console.error('ERROR:', e.message);
    console.error(e.stack);
}
