/**
 * Analyze the user's exported font to compare with expected values.
 */

import * as opentype from '../../src/opentype.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCALE = 80; // 800 / 10

async function analyzeFont(fontPath, description) {
    console.log(`\n=== ${description} ===`);
    console.log(`File: ${fontPath}`);
    
    if (!fs.existsSync(fontPath)) {
        console.log('ERROR: File not found');
        return null;
    }
    
    const buffer = fs.readFileSync(fontPath);
    let font;
    try {
        font = opentype.parse(new Uint8Array(buffer).buffer);
    } catch (e) {
        console.log('ERROR: Could not parse font:', e.message);
        return null;
    }
    
    console.log(`Total glyphs: ${font.glyphs.length}`);
    console.log('');
    
    const results = [];
    
    for (let i = 0; i < font.glyphs.length; i++) {
        const glyph = font.glyphs.get(i);
        if (glyph.getPath) glyph.getPath();
        
        const info = {
            index: i,
            name: glyph.name,
            isComposite: glyph.isComposite,
            components: glyph.components,
            advanceWidth: glyph.advanceWidth,
            points: []
        };
        
        if (glyph.path && glyph.path.commands) {
            for (const cmd of glyph.path.commands) {
                if (cmd.type === 'M' || cmd.type === 'L') {
                    info.points.push({
                        x: cmd.x,
                        y: cmd.y,
                        editorX: cmd.x / SCALE,
                        editorY: cmd.y / SCALE
                    });
                }
            }
        }
        
        // Only show glyphs with content
        if (info.points.length > 0 || info.isComposite) {
            results.push(info);
            
            console.log(`Glyph ${i}: ${info.name || 'undefined'}`);
            console.log(`  advanceWidth: ${info.advanceWidth} (editor: ${info.advanceWidth / SCALE})`);
            
            if (info.isComposite && info.components) {
                console.log('  Composite components:');
                for (const comp of info.components) {
                    console.log(`    glyphIndex=${comp.glyphIndex}, dx=${comp.dx} (${comp.dx/SCALE}), dy=${comp.dy} (${comp.dy/SCALE})`);
                    if (comp.xScale !== 1 || comp.yScale !== 1 || comp.scale01 !== 0 || comp.scale10 !== 0) {
                        console.log(`    matrix: xScale=${comp.xScale}, yScale=${comp.yScale}, scale01=${comp.scale01}, scale10=${comp.scale10}`);
                    }
                }
            }
            
            if (info.points.length > 0) {
                console.log('  Points:');
                // Remove duplicates (close path repeats first point)
                const uniquePoints = [];
                for (const p of info.points) {
                    const exists = uniquePoints.some(u => u.x === p.x && u.y === p.y);
                    if (!exists) uniquePoints.push(p);
                }
                for (const p of uniquePoints) {
                    console.log(`    (${p.x}, ${p.y}) = editor (${p.editorX.toFixed(2)}, ${p.editorY.toFixed(2)})`);
                }
            }
            console.log('');
        }
    }
    
    return results;
}

async function main() {
    // Analyze user's exported font
    const userFontPath = '/Users/herbst/Downloads/custom-font (7).ttf';
    const userResults = await analyzeFont(userFontPath, "User's Exported Font");
    
    // Analyze our test font
    const testFontPath = path.join(__dirname, 'test-composite-offset.ttf');
    const testResults = await analyzeFont(testFontPath, 'API Test Font');
    
    // Compare the O glyph specifically
    console.log('\n=== Comparison ===');
    console.log('');
    console.log('Expected positions for _Test2 component with dx=4, dy=-5:');
    console.log('  (3,5) + (4,-5) = (7, 0) = (560, 0) font units');
    console.log('  (6,5) + (4,-5) = (10, 0) = (800, 0) font units');
    console.log('  (6,10) + (4,-5) = (10, 5) = (800, 400) font units');
    console.log('  (3,10) + (4,-5) = (7, 5) = (560, 400) font units');
}

main().catch(console.error);
