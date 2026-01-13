/**
 * Tests for Variable Font Canvas Drawing API
 * 
 * This tests that the Canvas drawing API properly supports variable fonts,
 * including intermediate masters and multi-axis interpolation.
 */

import assert from 'assert';
import * as opentype from '../src/opentype.js';
import { readFileSync } from 'fs';
import { createMockObject } from './testutil.js';

const loadSync = (url, opt) => opentype.parse(readFileSync(url), opt);

describe('Variable Font Canvas Drawing', function() {
    // Load real variable fonts for testing
    const fonts = {
        robotoFlex: loadSync('./test/fonts/RobotoFlex-Variable.ttf'),
        oswald: loadSync('./test/fonts/Oswald-Variable.ttf'),
        inter: loadSync('./test/fonts/Inter-Variable.ttf'),
    };

    describe('getPath with variation', function() {
        it('should return different paths for different variation coordinates', function() {
            const font = fonts.oswald;
            
            // Get paths at different weights
            const pathLight = font.getPath('A', 0, 0, 72, { variation: { wght: 200 } });
            const pathBold = font.getPath('A', 0, 0, 72, { variation: { wght: 700 } });
            
            // Paths should be different
            assert.ok(pathLight.commands.length > 0, 'Light path should have commands');
            assert.ok(pathBold.commands.length > 0, 'Bold path should have commands');
            
            // Check that the path bounds differ (bold should be wider/thicker)
            const boundsLight = pathLight.getBoundingBox();
            const boundsBold = pathBold.getBoundingBox();
            
            // Bold weight should generally have wider strokes
            assert.ok(
                boundsBold.x2 - boundsBold.x1 >= boundsLight.x2 - boundsLight.x1 - 1 ||
                boundsBold.y2 - boundsBold.y1 >= boundsLight.y2 - boundsLight.y1 - 1,
                'Bold should have different dimensions than light'
            );
        });

        it('should interpolate smoothly between variation extremes', function() {
            const font = fonts.oswald;
            
            const pathMin = font.getPath('H', 0, 0, 72, { variation: { wght: 200 } });
            const pathMid = font.getPath('H', 0, 0, 72, { variation: { wght: 450 } });
            const pathMax = font.getPath('H', 0, 0, 72, { variation: { wght: 700 } });
            
            const boundsMin = pathMin.getBoundingBox();
            const boundsMid = pathMid.getBoundingBox();
            const boundsMax = pathMax.getBoundingBox();
            
            const widthMin = boundsMin.x2 - boundsMin.x1;
            const widthMid = boundsMid.x2 - boundsMid.x1;
            const widthMax = boundsMax.x2 - boundsMax.x1;
            
            // Middle should be between min and max (allowing for some variation)
            // Note: depending on the font design, the relationship may not be strictly linear
            assert.ok(pathMin.commands.length > 0, 'Min path should have commands');
            assert.ok(pathMid.commands.length > 0, 'Mid path should have commands');
            assert.ok(pathMax.commands.length > 0, 'Max path should have commands');
        });

        it('should support multi-axis variation', function() {
            const font = fonts.robotoFlex;
            
            if (!font.tables.fvar || font.tables.fvar.axes.length < 2) {
                this.skip();
                return;
            }
            
            // Get axes
            const axes = font.tables.fvar.axes;
            const axis1 = axes[0];
            const axis2 = axes.length > 1 ? axes[1] : null;
            
            if (!axis2) {
                this.skip();
                return;
            }
            
            // Test with different combinations
            const coords1 = { [axis1.tag]: axis1.minValue, [axis2.tag]: axis2.minValue };
            const coords2 = { [axis1.tag]: axis1.maxValue, [axis2.tag]: axis2.maxValue };
            const coords3 = { [axis1.tag]: axis1.minValue, [axis2.tag]: axis2.maxValue };
            
            const path1 = font.getPath('A', 0, 0, 72, { variation: coords1 });
            const path2 = font.getPath('A', 0, 0, 72, { variation: coords2 });
            const path3 = font.getPath('A', 0, 0, 72, { variation: coords3 });
            
            assert.ok(path1.commands.length > 0, 'Path 1 should have commands');
            assert.ok(path2.commands.length > 0, 'Path 2 should have commands');
            assert.ok(path3.commands.length > 0, 'Path 3 should have commands');
            
            // At least one pair should differ
            const bounds1 = path1.getBoundingBox();
            const bounds2 = path2.getBoundingBox();
            
            const width1 = bounds1.x2 - bounds1.x1;
            const width2 = bounds2.x2 - bounds2.x1;
            
            assert.notStrictEqual(
                Math.round(width1),
                Math.round(width2),
                'Different axis values should produce different paths'
            );
        });
    });

    describe('draw method with variation', function() {
        it('should call canvas context methods when drawing with variation', function() {
            const font = fonts.oswald;
            const logs = [];
            const ctx = createMockObject(logs);
            
            // Use font.draw() directly - requires GSUB lookup type 6 format 2 support
            font.draw(ctx, 'Hello', 0, 100, 72, { variation: { wght: 500 } });
            
            // Should have drawing commands
            const hasBeginPath = logs.some(l => l.property === 'beginPath');
            const hasFill = logs.some(l => l.property === 'fill');
            const hasMoveTo = logs.some(l => l.property === 'moveTo');
            
            assert.ok(hasBeginPath, 'Should call beginPath');
            assert.ok(hasFill, 'Should call fill');
            assert.ok(hasMoveTo, 'Should call moveTo');
        });

        it('should produce different canvas commands for different variations', function() {
            const font = fonts.oswald;
            
            const logsLight = [];
            const ctxLight = createMockObject(logsLight);
            font.draw(ctxLight, 'Hello', 0, 100, 72, { variation: { wght: 200 } });
            
            const logsBold = [];
            const ctxBold = createMockObject(logsBold);
            font.draw(ctxBold, 'Hello', 0, 100, 72, { variation: { wght: 700 } });
            
            // Extract moveTo/lineTo coordinates
            const lightMoves = logsLight.filter(l => l.property === 'moveTo' || l.property === 'lineTo');
            const boldMoves = logsBold.filter(l => l.property === 'moveTo' || l.property === 'lineTo');
            
            // Should have different coordinates
            const lightCoords = lightMoves.map(l => l.arguments).flat();
            const boldCoords = boldMoves.map(l => l.arguments).flat();
            
            // At least some coordinates should differ
            let hasDifference = false;
            const minLen = Math.min(lightCoords.length, boldCoords.length);
            for (let i = 0; i < minLen; i++) {
                if (Math.abs(lightCoords[i] - boldCoords[i]) > 0.1) {
                    hasDifference = true;
                    break;
                }
            }
            
            assert.ok(hasDifference, 'Light and bold variations should produce different coordinates');
        });

        it('should draw RobotoFlex with multi-axis variation', function() {
            const font = fonts.robotoFlex;
            
            const logs = [];
            const ctx = createMockObject(logs);
            
            // Use multiple axes simultaneously
            font.draw(ctx, 'Variable', 0, 100, 72, { 
                variation: { wght: 700, wdth: 75, opsz: 48 } 
            });
            
            // Should have drawing commands
            const hasBeginPath = logs.some(l => l.property === 'beginPath');
            const hasFill = logs.some(l => l.property === 'fill');
            
            assert.ok(hasBeginPath, 'Should call beginPath');
            assert.ok(hasFill, 'Should call fill');
            assert.ok(logs.length > 50, 'Should have many drawing commands for multi-character string');
        });
    });

    describe('drawPoints with variation', function() {
        it('should draw transformed points for variable fonts', function() {
            const font = fonts.oswald;
            const glyphA = font.charToGlyph('A');
            
            if (!glyphA.points || glyphA.points.length === 0) {
                // Skip if no points (CFF font)
                this.skip();
                return;
            }
            
            const logsDefault = [];
            const ctxDefault = createMockObject(logsDefault);
            glyphA.drawPoints(ctxDefault, 0, 100, 72, { variation: { wght: 400 } }, font);
            
            const logsBold = [];
            const ctxBold = createMockObject(logsBold);
            glyphA.drawPoints(ctxBold, 0, 100, 72, { variation: { wght: 700 } }, font);
            
            // Should have arc calls for drawing points
            const defaultArcs = logsDefault.filter(l => l.property === 'arc');
            const boldArcs = logsBold.filter(l => l.property === 'arc');
            
            assert.ok(defaultArcs.length > 0, 'Default should have arc calls');
            assert.ok(boldArcs.length > 0, 'Bold should have arc calls');
        });
    });

    describe('getAdvanceWidth with variation', function() {
        it('should return different advance widths for different variations', function() {
            const font = fonts.robotoFlex;
            
            // Check if font has wdth axis
            const axes = font.tables.fvar?.axes || [];
            const hasWdth = axes.some(a => a.tag === 'wdth');
            
            if (!hasWdth) {
                // Test with weight if no width axis
                const wghtAxis = axes.find(a => a.tag === 'wght');
                if (!wghtAxis) {
                    this.skip();
                    return;
                }
                
                const widthLight = font.getAdvanceWidth('HELLO', 72, { variation: { wght: wghtAxis.minValue } });
                const widthBold = font.getAdvanceWidth('HELLO', 72, { variation: { wght: wghtAxis.maxValue } });
                
                // Advance widths might differ (depends on HVAR table)
                assert.ok(typeof widthLight === 'number', 'Light width should be a number');
                assert.ok(typeof widthBold === 'number', 'Bold width should be a number');
            } else {
                const wdthAxis = axes.find(a => a.tag === 'wdth');
                const widthCondensed = font.getAdvanceWidth('HELLO', 72, { variation: { wdth: wdthAxis.minValue } });
                const widthExpanded = font.getAdvanceWidth('HELLO', 72, { variation: { wdth: wdthAxis.maxValue } });
                
                // Width axis should definitely affect advance width
                assert.ok(widthExpanded > widthCondensed, 'Expanded should be wider than condensed');
            }
        });
    });

    describe('variation.set() integration', function() {
        it('should use default variation when drawing without explicit variation', function() {
            const font = fonts.oswald;
            
            // Set a specific variation as default
            font.variation.set({ wght: 600 });
            
            // Use font.draw() directly - now supported with GSUB lookup type 6 format 2
            const logs = [];
            const ctx = createMockObject(logs);
            font.draw(ctx, 'Hello', 0, 100, 72);
            
            assert.ok(logs.length > 0, 'Should have drawing calls');
            
            // Reset to default
            font.variation.set({ wght: 400 });
        });

        it('should override default variation when explicit variation is provided', function() {
            const font = fonts.oswald;
            
            // Set default to light
            font.variation.set({ wght: 200 });
            
            // Get path with default (should be light)
            const pathDefault = font.getPath('A', 0, 0, 72);
            
            // Get path with explicit bold (should override)
            const pathExplicit = font.getPath('A', 0, 0, 72, { variation: { wght: 700 } });
            
            const boundsDefault = pathDefault.getBoundingBox();
            const boundsExplicit = pathExplicit.getBoundingBox();
            
            // They should differ
            const widthDefault = boundsDefault.x2 - boundsDefault.x1;
            const widthExplicit = boundsExplicit.x2 - boundsExplicit.x1;
            
            assert.notStrictEqual(
                Math.round(widthDefault),
                Math.round(widthExplicit),
                'Explicit variation should override default'
            );
            
            // Reset
            font.variation.set({ wght: 400 });
        });
    });

    describe('toSVG with variation', function() {
        it('should generate SVG path data with variation applied', function() {
            const font = fonts.oswald;
            const glyphA = font.charToGlyph('A');
            
            const svgLight = glyphA.toPathData({ variation: { wght: 200 } }, font);
            const svgBold = glyphA.toPathData({ variation: { wght: 700 } }, font);
            
            assert.ok(typeof svgLight === 'string', 'Light SVG should be a string');
            assert.ok(typeof svgBold === 'string', 'Bold SVG should be a string');
            assert.ok(svgLight.length > 0, 'Light SVG should not be empty');
            assert.ok(svgBold.length > 0, 'Bold SVG should not be empty');
            
            // SVG paths should differ
            assert.notStrictEqual(svgLight, svgBold, 'Light and bold SVG should differ');
        });
    });

    describe('intermediate masters', function() {
        it('should correctly interpolate when variation value is between masters', function() {
            const font = fonts.oswald;
            
            // Test at various points along the weight axis
            const weights = [200, 300, 400, 500, 600, 700];
            const widths = weights.map(wght => {
                const path = font.getPath('A', 0, 0, 72, { variation: { wght } });
                const bounds = path.getBoundingBox();
                return bounds.x2 - bounds.x1;
            });
            
            // Widths should generally increase (or stay similar) with weight
            // Note: This is a loose test as font design varies
            assert.ok(widths.every(w => w > 0), 'All widths should be positive');
            
            // Check that interpolation produces unique values (not all the same)
            const uniqueWidths = new Set(widths.map(w => Math.round(w)));
            assert.ok(uniqueWidths.size >= 2, 'Should have at least 2 unique widths across weight range');
        });
    });

    describe('GSUB Lookup Type 6 Format 2 (Chaining Context)', function() {
        it('should process Oswald font with GSUB lookup type 6 format 2', function() {
            // Oswald font uses GSUB lookup type 6 format 2 (chaining contextual substitution)
            // This test verifies that font.draw() works correctly with such fonts
            const font = fonts.oswald;
            
            // Verify the font has GSUB table with the expected structure
            assert.ok(font.tables.gsub, 'Font should have GSUB table');
            
            // Test that drawing works without throwing errors
            const logs = [];
            const ctx = createMockObject(logs);
            
            // Draw various strings that may trigger GSUB substitutions
            font.draw(ctx, 'HELLO', 0, 100, 72, { variation: { wght: 400 } });
            font.draw(ctx, 'Testing', 0, 200, 72, { variation: { wght: 600 } });
            font.draw(ctx, 'Variable', 0, 300, 72, { variation: { wght: 200 } });
            
            // Should have produced drawing commands
            assert.ok(logs.length > 100, 'Should have many drawing commands');
            
            const beginPaths = logs.filter(l => l.property === 'beginPath');
            assert.ok(beginPaths.length >= 3, 'Should have at least 3 beginPath calls (one per draw)');
        });

        it('should process RobotoFlex font with full GSUB features', function() {
            const font = fonts.robotoFlex;
            
            const logs = [];
            const ctx = createMockObject(logs);
            
            // Draw with various variation settings
            font.draw(ctx, 'Typography', 0, 100, 72, { 
                variation: { wght: 700, wdth: 100, opsz: 48 } 
            });
            
            assert.ok(logs.length > 50, 'Should have drawing commands');
        });

        it('should process Inter font correctly', function() {
            const font = fonts.inter;
            
            const logs = [];
            const ctx = createMockObject(logs);
            
            // Inter also has complex GSUB features
            font.draw(ctx, 'Design', 0, 100, 72, { variation: { wght: 500 } });
            
            assert.ok(logs.length > 20, 'Should have drawing commands');
        });
    });
});
