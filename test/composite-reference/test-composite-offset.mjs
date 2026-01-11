/**
 * Test for composite glyph positioning with non-origin component shapes.
 * 
 * Issue: When a component glyph has its first point NOT at (0,0), 
 * the X offset in the exported composite may be incorrect.
 * 
 * Test case:
 * - _Test2 component: shape at (3,5)-(6,10) - first point NOT at origin
 * - O glyph references _Test2 with dx=4, dy=-5
 * - Expected: _Test2's point (3,5) should end up at (3+4, 5-5) = (7, 0)
 */

import * as opentype from '../../src/opentype.js';
import { FontEditorState, FontBuilder } from '../../docs/examples/font-editor-api.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const UNITS_PER_EM = 800;
const EDITOR_SCALE = 10;
const SCALE = UNITS_PER_EM / EDITOR_SCALE; // 80

/**
 * Create a test state with a component at non-origin position
 */
function createTestState() {
    const state = new FontEditorState({
        familyName: 'CompositeTest',
        styleName: 'Regular',
        unitsPerEm: UNITS_PER_EM,
        ascender: UNITS_PER_EM,
        descender: -200
    });

    // Component glyph _Test2 at (3,5)-(6,10) - NOT starting at origin
    state.glyphs = {
        '_Test2': [[[3, 5], [6, 5], [6, 10], [3, 10]]]
    };
    state.glyphWidths = {};

    // O glyph references _Test2 with dx=4, dy=-5
    // Expected: point (3,5) + (4,-5) = (7, 0)
    state.glyphReferences = {
        'O': [{ 
            name: '_Test2', 
            dx: 4, 
            dy: -5, 
            scaleX: 1, 
            scaleY: 1, 
            rotation: 0, 
            skewX: 0, 
            skewY: 0 
        }]
    };
    
    // O has no own shapes, only the reference
    state.glyphs['O'] = [];

    return state;
}

/**
 * Analyze composite glyph and extract final point positions
 */
function analyzeCompositeGlyph(font, glyphIndex) {
    const glyph = font.glyphs.get(glyphIndex);
    
    // Force path generation for composite
    if (glyph.getPath) {
        glyph.getPath();
    }
    
    const result = {
        name: glyph.name,
        isComposite: glyph.isComposite,
        components: glyph.components,
        advanceWidth: glyph.advanceWidth,
        points: []
    };
    
    // Extract points from path
    if (glyph.path && glyph.path.commands) {
        for (const cmd of glyph.path.commands) {
            if (cmd.type === 'M' || cmd.type === 'L') {
                result.points.push({
                    x: cmd.x,
                    y: cmd.y,
                    editorX: cmd.x / SCALE,
                    editorY: cmd.y / SCALE
                });
            }
        }
    }
    
    return result;
}

/**
 * Main test function
 */
async function runTest() {
    console.log('=== Composite Reference Offset Test ===\n');
    
    // Create test state
    const state = createTestState();
    
    console.log('Test Setup:');
    console.log('  _Test2 component: points at (3,5), (6,5), (6,10), (3,10)');
    console.log('  O reference: dx=4, dy=-5');
    console.log('  Scale factor:', SCALE);
    console.log('');
    
    console.log('Expected Transformation:');
    console.log('  _Test2 point (3,5) + ref (4,-5) = (7, 0) editor = (560, 0) font units');
    console.log('  _Test2 point (6,5) + ref (4,-5) = (10, 0) editor = (800, 0) font units');
    console.log('  _Test2 point (6,10) + ref (4,-5) = (10, 5) editor = (800, 400) font units');
    console.log('  _Test2 point (3,10) + ref (4,-5) = (7, 5) editor = (560, 400) font units');
    console.log('');
    
    // Build font using the API
    const builder = new FontBuilder(state, opentype);
    const font = builder.build({ 
        validate: true, 
        validateRoundTrip: false, 
        useComposites: true 
    });
    
    // Save the font for external inspection
    const buffer = font.toArrayBuffer();
    const outputPath = path.join(__dirname, 'test-composite-offset.ttf');
    fs.writeFileSync(outputPath, Buffer.from(buffer));
    console.log('Font saved to:', outputPath);
    console.log('');
    
    // Reload and analyze
    const reloaded = opentype.parse(new Uint8Array(buffer).buffer);
    
    console.log('Exported Font Analysis:');
    console.log('  Total glyphs:', reloaded.glyphs.length);
    console.log('');
    
    // Find and analyze each glyph
    for (let i = 0; i < reloaded.glyphs.length; i++) {
        const analysis = analyzeCompositeGlyph(reloaded, i);
        
        if (analysis.points.length > 0 || analysis.isComposite) {
            console.log(`Glyph ${i}: ${analysis.name || 'undefined'}`);
            
            if (analysis.isComposite) {
                console.log('  Type: Composite');
                console.log('  Components:');
                for (const comp of analysis.components) {
                    console.log(`    - glyphIndex: ${comp.glyphIndex}, dx: ${comp.dx}, dy: ${comp.dy}`);
                    console.log(`      (dx in editor units: ${comp.dx / SCALE}, dy in editor units: ${comp.dy / SCALE})`);
                }
            }
            
            if (analysis.points.length > 0) {
                console.log('  Final points:');
                for (const pt of analysis.points) {
                    console.log(`    (${pt.x}, ${pt.y}) = editor (${pt.editorX.toFixed(2)}, ${pt.editorY.toFixed(2)})`);
                }
            }
            console.log('');
        }
    }
    
    // Verify the O glyph specifically
    const oGlyph = reloaded.charToGlyph('O');
    if (oGlyph.getPath) oGlyph.getPath();
    
    console.log('=== O Glyph Verification ===');
    console.log('');
    
    const oAnalysis = analyzeCompositeGlyph(reloaded, oGlyph.index);
    
    // Check if points are at expected positions
    const expectedPoints = [
        { x: 560, y: 0, desc: '(3,5) + (4,-5) = (7,0)' },
        { x: 800, y: 0, desc: '(6,5) + (4,-5) = (10,0)' },
        { x: 800, y: 400, desc: '(6,10) + (4,-5) = (10,5)' },
        { x: 560, y: 400, desc: '(3,10) + (4,-5) = (7,5)' }
    ];
    
    let allCorrect = true;
    for (const expected of expectedPoints) {
        const found = oAnalysis.points.some(p => 
            Math.abs(p.x - expected.x) < 1 && Math.abs(p.y - expected.y) < 1
        );
        const status = found ? '✓' : '✗';
        console.log(`  ${status} Expected (${expected.x}, ${expected.y}): ${expected.desc}`);
        if (!found) {
            allCorrect = false;
            // Find closest actual point
            let closest = null;
            let minDist = Infinity;
            for (const p of oAnalysis.points) {
                const dist = Math.abs(p.x - expected.x) + Math.abs(p.y - expected.y);
                if (dist < minDist) {
                    minDist = dist;
                    closest = p;
                }
            }
            if (closest) {
                console.log(`    Closest actual: (${closest.x}, ${closest.y}) = editor (${closest.editorX.toFixed(2)}, ${closest.editorY.toFixed(2)})`);
            }
        }
    }
    
    console.log('');
    if (allCorrect) {
        console.log('TEST PASSED: All points at expected positions');
    } else {
        console.log('TEST FAILED: Some points not at expected positions');
        console.log('');
        console.log('Actual points in O glyph:');
        for (const pt of oAnalysis.points) {
            console.log(`  (${pt.x}, ${pt.y}) = editor (${pt.editorX.toFixed(2)}, ${pt.editorY.toFixed(2)})`);
        }
    }
    
    return allCorrect;
}

// Run the test
runTest().then(passed => {
    process.exit(passed ? 0 : 1);
}).catch(err => {
    console.error('Test error:', err);
    process.exit(1);
});
