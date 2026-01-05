import assert from 'assert';
import fs from 'fs';
import { parse, Path, Glyph, Font } from '../src/opentype.js';

/**
 * Snap utilities - copied from reading-writing.html for testing
 */
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

describe('Snapping', function() {
    describe('parameter scaling', function() {
        it('should apply snapping with visible effect at strength=0.8 distance=50', function() {
            // Create a simple font with known coordinates
            const notdefPath = new Path();
            notdefPath.moveTo(50, 0);
            notdefPath.lineTo(50, 700);
            notdefPath.lineTo(450, 700);
            notdefPath.lineTo(450, 0);
            notdefPath.closePath();

            const notdefGlyph = new Glyph({
                name: '.notdef',
                unicode: 0,
                advanceWidth: 500,
                path: notdefPath
            });

            // Create 'A' glyph with coordinates NOT on grid
            // Points at x: 127, 253, 379 - these should snap significantly with distance=50
            const aPath = new Path();
            aPath.moveTo(127, 0);    // Should snap towards 150 (nearby grid point at 50*3)
            aPath.lineTo(253, 700);  // Should snap towards 250
            aPath.lineTo(379, 0);    // Should snap towards 400
            aPath.closePath();

            const aGlyph = new Glyph({
                name: 'A',
                unicode: 65,
                advanceWidth: 500,
                path: aPath
            });

            const font = new Font({
                familyName: 'TestSnap',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200,
                glyphs: [notdefGlyph, aGlyph]
            });

            // Apply snapping with screen-space-like parameters
            // strength=0.8 (80%), distance=50
            const params = { strength: 0.8, distance: 50, x: 0, y: 0 };
            applySnappingToFontInPlace(font, params);

            // Get the snapped glyph
            const snappedGlyph = font.glyphs.get(1);
            const cmds = snappedGlyph.path.commands;

            // Expected snapping with strength=0.8, distance=50:
            // snapValue(127, 50, 0.8) = 127*0.2 + 0.8 * round(127/50)*50 = 25.4 + 0.8*3*50 = 25.4 + 120 = 145.4
            // snapValue(253, 50, 0.8) = 253*0.2 + 0.8 * round(253/50)*50 = 50.6 + 0.8*5*50 = 50.6 + 200 = 250.6
            // snapValue(379, 50, 0.8) = 379*0.2 + 0.8 * round(379/50)*50 = 75.8 + 0.8*8*50 = 75.8 + 320 = 395.8

            const m = cmds.find(c => c.type === 'M');
            const lines = cmds.filter(c => c.type === 'L');

            // The first point should have moved significantly from 127
            // At 80% strength, it should be ~145, not ~127
            const delta1 = Math.abs(m.x - 127);
            assert.ok(delta1 > 10, 
                `First point should move significantly from 127, got ${m.x} (delta=${delta1})`);

            // The point at 253 should snap toward 250
            const delta2 = Math.abs(lines[0].x - 253);
            assert.ok(delta2 < 10,  // Should snap closer to 250
                `Second point at 253 should snap toward 250, got ${lines[0].x}`);

            // The point at 379 should snap toward 400
            const delta3 = Math.abs(lines[1].x - 379);
            assert.ok(delta3 > 10,
                `Third point should move significantly from 379, got ${lines[1].x} (delta=${delta3})`);
        });

        it('should produce visible snapping in exported baked font', function() {
            // Load FiraSans
            const buf = fs.readFileSync('./docs/fonts/FiraSansMedium.woff');
            const font = parse(buf.buffer);

            // Get original 'A' coordinates
            const origGlyph = font.charToGlyph('A');
            const origFirstCmd = origGlyph.path.commands.find(c => c.type === 'M');
            const origX = origFirstCmd.x;

            // Clone the font
            const cloned = parse(font.toArrayBuffer());

            // Apply snapping with the parameters from reading-writing.html
            // strength=80/100=0.8, distance=50
            const params = { strength: 0.8, distance: 50, x: 0, y: 0 };
            applySnappingToFontInPlace(cloned, params);

            // Get snapped 'A'
            const snappedGlyph = cloned.charToGlyph('A');
            const snappedFirstCmd = snappedGlyph.path.commands.find(c => c.type === 'M');
            const snappedX = snappedFirstCmd.x;

            // The snapping should have a visible effect
            // With distance=50 in font units (unitsPerEm=1000), points should move toward grid
            const delta = Math.abs(snappedX - origX);

            console.log(`Original A first point: ${origX}, Snapped: ${snappedX}, Delta: ${delta}`);

            // The delta should be noticeable - at least a few units
            // If distance=50 and strength=0.8, most points should move by at least 5-10 units
            // unless they happen to be exactly on a grid point
            // For a proper test, we need to check multiple points
            let totalDelta = 0;
            let pointCount = 0;
            for (let i = 0; i < origGlyph.path.commands.length; i++) {
                const orig = origGlyph.path.commands[i];
                const snap = snappedGlyph.path.commands[i];
                if (orig.x !== undefined) {
                    totalDelta += Math.abs(snap.x - orig.x);
                    pointCount++;
                }
                if (orig.y !== undefined) {
                    totalDelta += Math.abs(snap.y - orig.y);
                    pointCount++;
                }
            }

            const avgDelta = totalDelta / pointCount;
            console.log(`Average delta per coordinate: ${avgDelta.toFixed(2)} (${pointCount} coordinates)`);

            // With strength=0.8 and distance=50, average movement should be at least 5 units
            // Currently this test is expected to FAIL because the snapping effect is minimal
            assert.ok(avgDelta > 5, 
                `Average coordinate movement should be > 5 units with strength=0.8, distance=50, but was ${avgDelta.toFixed(2)}`);
        });

        it('preview rendering should match baked font snapping', function() {
            // Load a font
            const buf = fs.readFileSync('./docs/fonts/FiraSansMedium.woff');
            const font = parse(buf.buffer);

            const fontSize = 72;
            const unitsPerEm = font.unitsPerEm;
            const scale = fontSize / unitsPerEm;

            // Simulate what the preview does:
            // 1. Get path at fontSize (scales to screen space)
            // 2. Apply snapping with distance=50 (screen pixels)
            const glyph = font.charToGlyph('A');
            const screenPath = glyph.getPath(0, 0, fontSize, {}, font);
            const screenCommands = screenPath.commands.map(cmd => ({ ...cmd }));
            
            // Apply snapping to screen-space path
            const screenParams = { strength: 0.8, distance: 50, x: 0, y: 0 };
            for (const cmd of screenCommands) {
                snapCommand(cmd, screenParams);
            }

            // Now simulate what baked font export SHOULD do:
            // Apply snapping to font-unit paths, with distance scaled appropriately
            // The key insight: distance=50 screen pixels = 50 * unitsPerEm/fontSize font units
            const fontPath = glyph.path;
            const fontCommands = fontPath.commands.map(cmd => ({ ...cmd }));
            
            // CORRECT: Scale distance to font units
            const fontUnitDistance = 50 * unitsPerEm / fontSize;  // 50 * 1000/72 ≈ 694 font units
            const fontParams = { strength: 0.8, distance: fontUnitDistance, x: 0, y: 0 };
            for (const cmd of fontCommands) {
                snapCommand(cmd, fontParams);
            }

            // Now compare: when we scale font-unit results to screen space, 
            // they should match the screen-space snapping
            const firstScreen = screenCommands.find(c => c.type === 'M');
            const firstFont = fontCommands.find(c => c.type === 'M');

            // Scale font result to screen
            const fontToScreen = firstFont.x * scale;

            console.log(`Screen-space snapped: ${firstScreen.x.toFixed(2)}`);
            console.log(`Font-unit snapped (scaled to screen): ${fontToScreen.toFixed(2)}`);
            console.log(`Difference: ${Math.abs(firstScreen.x - fontToScreen).toFixed(2)}`);

            // They should be very close (within a few pixels due to rounding)
            const diff = Math.abs(firstScreen.x - fontToScreen);
            assert.ok(diff < 5, 
                `Screen-space and font-unit snapping should produce similar results when scaled, but diff=${diff.toFixed(2)}`);
        });

        it('baked font without distance scaling should NOT match preview (documents the bug)', function() {
            // This test documents the current bug where distance is not scaled
            const buf = fs.readFileSync('./docs/fonts/FiraSansMedium.woff');
            const font = parse(buf.buffer);

            const fontSize = 72;
            const unitsPerEm = font.unitsPerEm;
            const scale = fontSize / unitsPerEm;

            const glyph = font.charToGlyph('A');
            
            // Preview: snap in screen space
            const screenPath = glyph.getPath(0, 0, fontSize, {}, font);
            const screenCommands = screenPath.commands.map(cmd => ({ ...cmd }));
            const screenParams = { strength: 0.8, distance: 50, x: 0, y: 0 };
            for (const cmd of screenCommands) {
                snapCommand(cmd, screenParams);
            }

            // BUG: baked font uses same distance without scaling
            const fontCommands = glyph.path.commands.map(cmd => ({ ...cmd }));
            const buggyParams = { strength: 0.8, distance: 50, x: 0, y: 0 }; // NOT scaled!
            for (const cmd of fontCommands) {
                snapCommand(cmd, buggyParams);
            }

            const firstScreen = screenCommands.find(c => c.type === 'M');
            const firstFont = fontCommands.find(c => c.type === 'M');
            const fontToScreen = firstFont.x * scale;

            // With the bug, these should NOT match (difference > 10 pixels)
            const diff = Math.abs(firstScreen.x - fontToScreen);
            console.log(`BUG: Preview=${firstScreen.x.toFixed(2)}, Baked(scaled)=${fontToScreen.toFixed(2)}, diff=${diff.toFixed(2)}`);
            
            assert.ok(diff > 10, 
                `Without distance scaling, preview and baked should NOT match (diff=${diff.toFixed(2)})`);
        });

        it('instantiate should preserve unitsPerEm for snap scaling', function() {
            // This test verifies the fix for the regression where instantiate()
            // created a font without unitsPerEm, causing snap distance scaling to fail
            const buf = fs.readFileSync('./docs/fonts/FiraSansMedium.woff');
            const font = parse(buf.buffer);
            
            const origUnitsPerEm = font.unitsPerEm;
            assert.ok(origUnitsPerEm > 0, 'Original font should have unitsPerEm');
            
            // Instantiate (even for non-variable fonts)
            const inst = font.instantiate();
            
            assert.equal(inst.unitsPerEm, origUnitsPerEm, 
                'Instantiated font should preserve unitsPerEm');
            
            // Also verify glyphs are preserved
            const origA = font.charToGlyph('A');
            const instA = inst.charToGlyph('A');
            assert.ok(instA, 'Instantiated font should have glyph A');
            assert.equal(instA.path.commands.length, origA.path.commands.length,
                'Glyph A should have same number of commands');
        });
    });
});
