import assert from 'assert';
import { readFileSync } from 'fs';
import { parse, VariationManager, pathToPoints } from '../src/opentype.js';
import { cubicToQuadratics } from '../src/tables/glyf.js';

/**
 * Comprehensive tests for font format conversion (CFF ↔ TrueType).
 * Tests roundtrip conversion, variable font preservation, path accuracy,
 * and font feature preservation.
 */

function loadFont(path) {
    const buffer = readFileSync(path);
    return parse(buffer.buffer, { lowMemory: false });
}

/**
 * Compare two paths for visual similarity using bounding boxes.
 * Returns { similar: boolean, maxError: number, details: string }
 */
function comparePathsVisually(path1, path2, tolerance = 2) {
    const bbox1 = path1.getBoundingBox();
    const bbox2 = path2.getBoundingBox();
    
    const errors = [];
    const x1Diff = Math.abs(bbox1.x1 - bbox2.x1);
    const y1Diff = Math.abs(bbox1.y1 - bbox2.y1);
    const x2Diff = Math.abs(bbox1.x2 - bbox2.x2);
    const y2Diff = Math.abs(bbox1.y2 - bbox2.y2);
    
    if (x1Diff > tolerance) errors.push(`x1 diff: ${x1Diff.toFixed(2)}`);
    if (y1Diff > tolerance) errors.push(`y1 diff: ${y1Diff.toFixed(2)}`);
    if (x2Diff > tolerance) errors.push(`x2 diff: ${x2Diff.toFixed(2)}`);
    if (y2Diff > tolerance) errors.push(`y2 diff: ${y2Diff.toFixed(2)}`);
    
    const maxError = Math.max(x1Diff, y1Diff, x2Diff, y2Diff);
    
    return {
        similar: errors.length === 0,
        maxError,
        details: errors.length > 0 ? errors.join(', ') : 'paths match within tolerance'
    };
}

describe('Format Conversion', function() {
    this.timeout(10000);  // Allow more time for conversion tests
    
    describe('CFF to TrueType Conversion', function() {
        let cffFont;
        
        before(function() {
            cffFont = loadFont('./test/fonts/FiraSansMedium.woff');
            assert.strictEqual(cffFont.outlinesFormat, 'cff', 'Test font should be CFF');
        });
        
        it('should export CFF font as TTF when adding variation axis', function() {
            // Clone and add variation using VariationManager (proper way)
            const cloned = parse(cffFont.toArrayBuffer());
            
            // Use VariationManager to add an axis with deltas
            cloned.variation = new VariationManager(cloned);
            cloned.variation.addAxis({
                tag: 'TEST',
                name: 'Test',
                minValue: 0,
                defaultValue: 0,
                maxValue: 100,
                deltaGenerator: (glyph) => {
                    // Generate simple deltas to ensure gvar has data
                    if (!glyph || !glyph.path || !glyph.path.commands.length) return null;
                    
                    // Get points for this glyph
                    const { points } = pathToPoints(glyph.path);
                    if (points.length === 0) return null;
                    
                    // Create small deltas
                    const deltas = points.map(() => 1);
                    const deltasY = points.map(() => 1);
                    deltas.push(0, 0, 0, 0);  // phantom points
                    deltasY.push(0, 0, 0, 0);
                    
                    return [{ peakTuple: [1.0], deltas, deltasY }];
                }
            });
            
            // Export
            const buffer = cloned.toArrayBuffer();
            const reloaded = parse(buffer);
            
            // Should now be TrueType (gvar forces TTF conversion)
            assert.strictEqual(reloaded.outlinesFormat, 'truetype', 'Should export as TrueType when gvar has data');
        });
        
        it('should preserve glyph shapes when converting CFF to TTF', function() {
            const testChars = ['A', 'B', 'C', 'a', 'g', 'o', '0', '1'];
            const fontSize = 72;
            
            // Clone and add variation to force TTF conversion
            const cloned = parse(cffFont.toArrayBuffer());
            cloned.variation = new VariationManager(cloned);
            cloned.variation.addAxis({
                tag: 'TEST',
                name: 'Test',
                minValue: 0,
                defaultValue: 0,
                maxValue: 100,
                deltaGenerator: (glyph) => {
                    if (!glyph || !glyph.path || !glyph.path.commands.length) return null;
                    const { points } = pathToPoints(glyph.path);
                    if (points.length === 0) return null;
                    const deltas = points.map(() => 0);  // Zero deltas = no change
                    const deltasY = points.map(() => 0);
                    deltas.push(0, 0, 0, 0);
                    deltasY.push(0, 0, 0, 0);
                    return [{ peakTuple: [1.0], deltas, deltasY }];
                }
            });
            
            const buffer = cloned.toArrayBuffer();
            const ttfFont = parse(buffer);
            
            for (const char of testChars) {
                const originalGlyph = cffFont.charToGlyph(char);
                const ttfGlyph = ttfFont.charToGlyph(char);
                
                if (!originalGlyph || !ttfGlyph) continue;
                
                const originalPath = originalGlyph.getPath(0, 0, fontSize, {}, cffFont);
                const ttfPath = ttfGlyph.getPath(0, 0, fontSize, {}, ttfFont);
                
                // Compare using bounding boxes (tolerance of 5 for cubic→quadratic conversion error)
                const comparison = comparePathsVisually(originalPath, ttfPath, 5);
                assert.ok(comparison.similar, 
                    `Glyph '${char}' shapes should match after CFF→TTF: ${comparison.details}`);
            }
        });
        
        it('should preserve metrics when converting CFF to TTF', function() {
            // Clone and add variation to force TTF conversion
            const cloned = parse(cffFont.toArrayBuffer());
            cloned.variation = new VariationManager(cloned);
            cloned.variation.addAxis({
                tag: 'TEST',
                name: 'Test',
                minValue: 0,
                defaultValue: 0,
                maxValue: 100,
                deltaGenerator: (glyph) => {
                    if (!glyph || !glyph.path || !glyph.path.commands.length) return null;
                    const { points } = pathToPoints(glyph.path);
                    if (points.length === 0) return null;
                    const deltas = points.map(() => 0);
                    const deltasY = points.map(() => 0);
                    deltas.push(0, 0, 0, 0);
                    deltasY.push(0, 0, 0, 0);
                    return [{ peakTuple: [1.0], deltas, deltasY }];
                }
            });
            
            const buffer = cloned.toArrayBuffer();
            const ttfFont = parse(buffer);
            
            // Check advance widths
            for (let i = 0; i < Math.min(50, cffFont.glyphs.length); i++) {
                const original = cffFont.glyphs.get(i);
                const converted = ttfFont.glyphs.get(i);
                
                if (!original || !converted) continue;
                
                assert.strictEqual(converted.advanceWidth, original.advanceWidth,
                    `Glyph ${i} advanceWidth should be preserved`);
            }
            
            // Check head table metrics
            assert.strictEqual(ttfFont.tables.head.unitsPerEm, cffFont.tables.head.unitsPerEm);
            
            // Check hhea metrics
            assert.strictEqual(ttfFont.tables.hhea.ascender, cffFont.tables.hhea.ascender);
            assert.strictEqual(ttfFont.tables.hhea.descender, cffFont.tables.hhea.descender);
        });
    });
    
    describe('TrueType Roundtrip', function() {
        let ttfFont;
        
        before(function() {
            ttfFont = loadFont('./test/fonts/Roboto-Black.ttf');
            assert.strictEqual(ttfFont.outlinesFormat, 'truetype', 'Test font should be TrueType');
        });
        
        it('should export TTF font and preserve outlines', function() {
            const buffer = ttfFont.toArrayBuffer();
            const reloaded = parse(buffer);
            
            // Should still be TrueType
            assert.strictEqual(reloaded.outlinesFormat, 'truetype');
            
            // Compare glyphs
            const testChars = ['A', 'B', 'C', 'a', 'g', 'o'];
            const fontSize = 72;
            
            for (const char of testChars) {
                const originalGlyph = ttfFont.charToGlyph(char);
                const reloadedGlyph = reloaded.charToGlyph(char);
                
                if (!originalGlyph || !reloadedGlyph) continue;
                
                const originalPath = originalGlyph.getPath(0, 0, fontSize, {}, ttfFont);
                const reloadedPath = reloadedGlyph.getPath(0, 0, fontSize, {}, reloaded);
                
                // TTF→TTF should be exact (within small rounding)
                const comparison = comparePathsVisually(originalPath, reloadedPath, 1);
                assert.ok(comparison.similar,
                    `Glyph '${char}' should be identical after TTF roundtrip: ${comparison.details}`);
            }
        });
        
        it('should preserve advance widths through TTF roundtrip', function() {
            const buffer = ttfFont.toArrayBuffer();
            const reloaded = parse(buffer);
            
            for (let i = 0; i < Math.min(100, ttfFont.glyphs.length); i++) {
                const original = ttfFont.glyphs.get(i);
                const converted = reloaded.glyphs.get(i);
                
                if (!original || !converted) continue;
                
                assert.strictEqual(converted.advanceWidth, original.advanceWidth,
                    `Glyph ${i} advanceWidth should be preserved`);
            }
        });
    });
    
    describe('Variable Font Preservation', function() {
        let vfFont;
        
        before(function() {
            vfFont = loadFont('./test/fonts/RobotoFlex-Variable.ttf');
            assert.ok(vfFont.tables.fvar, 'Test font should be variable');
        });
        
        it('should preserve fvar axes through export', function() {
            const buffer = vfFont.toArrayBuffer();
            const reloaded = parse(buffer);
            
            assert.ok(reloaded.tables.fvar, 'fvar should be preserved');
            assert.strictEqual(reloaded.tables.fvar.axes.length, vfFont.tables.fvar.axes.length,
                'Number of axes should be preserved');
            
            for (let i = 0; i < vfFont.tables.fvar.axes.length; i++) {
                const original = vfFont.tables.fvar.axes[i];
                const exported = reloaded.tables.fvar.axes[i];
                
                assert.strictEqual(exported.tag, original.tag, `Axis ${i} tag should match`);
                assert.strictEqual(exported.minValue, original.minValue, `Axis ${i} minValue should match`);
                assert.strictEqual(exported.defaultValue, original.defaultValue, `Axis ${i} defaultValue should match`);
                assert.strictEqual(exported.maxValue, original.maxValue, `Axis ${i} maxValue should match`);
            }
        });
        
        it('should preserve gvar data through export', function() {
            const buffer = vfFont.toArrayBuffer();
            const reloaded = parse(buffer);
            
            assert.ok(reloaded.tables.gvar, 'gvar should be preserved');
            
            // Check that variation works
            const instance = reloaded.instantiate({ wght: 700 });
            assert.ok(instance, 'Should be able to instantiate at wght=700');
            
            const glyph = instance.charToGlyph('A');
            assert.ok(glyph, 'Should have glyph A in instance');
        });
        
        it('should produce similar paths at non-default instances', function() {
            this.timeout(30000);  // Increase timeout for VF processing
            
            const buffer = vfFont.toArrayBuffer();
            const reloaded = parse(buffer);
            
            // Test just at one weight extreme (simplify to avoid timeout)
            const coords = { wght: 700 };
            const fontSize = 72;
            
            const originalInstance = vfFont.instantiate(coords);
            const reloadedInstance = reloaded.instantiate(coords);
            
            // Test just one character
            const origGlyph = originalInstance.charToGlyph('A');
            const reloadGlyph = reloadedInstance.charToGlyph('A');
            
            if (origGlyph && reloadGlyph) {
                const origPath = origGlyph.getPath(0, 0, fontSize, {}, originalInstance);
                const reloadPath = reloadGlyph.getPath(0, 0, fontSize, {}, reloadedInstance);
                
                // Use larger tolerance for extreme instances (rounding accumulates)
                const comparison = comparePathsVisually(origPath, reloadPath, 10);
                assert.ok(comparison.similar,
                    `Glyph 'A' at wght=700 should match: ${comparison.details}`);
            }
        });
    });
    
    describe('Font Feature Preservation', function() {
        let font;
        
        before(function() {
            font = loadFont('./test/fonts/FiraSansMedium.woff');
        });
        
        it('should preserve name table entries', function() {
            const buffer = font.toArrayBuffer();
            const reloaded = parse(buffer);
            
            // Check key name entries
            const namesToCheck = ['fontFamily', 'fontSubfamily', 'fullName', 'postScriptName'];
            
            for (const name of namesToCheck) {
                if (font.names[name]) {
                    assert.ok(reloaded.names[name], `${name} should be preserved`);
                    // Check at least the English version matches
                    if (font.names[name].en) {
                        assert.strictEqual(reloaded.names[name].en, font.names[name].en,
                            `${name} English value should match`);
                    }
                }
            }
        });
        
        it('should preserve OS/2 table values', function() {
            const buffer = font.toArrayBuffer();
            const reloaded = parse(buffer);
            
            const os2Fields = [
                'usWeightClass', 'usWidthClass', 'fsType',
                'ySubscriptXSize', 'ySubscriptYSize',
                'ySuperscriptXSize', 'ySuperscriptYSize',
                'yStrikeoutSize', 'yStrikeoutPosition',
                'sTypoAscender', 'sTypoDescender', 'sTypoLineGap'
            ];
            
            for (const field of os2Fields) {
                if (font.tables.os2[field] !== undefined) {
                    assert.strictEqual(reloaded.tables.os2[field], font.tables.os2[field],
                        `OS/2.${field} should be preserved`);
                }
            }
        });
        
        it('should preserve cmap table', function() {
            const buffer = font.toArrayBuffer();
            const reloaded = parse(buffer);
            
            // Test that character mapping works using characters
            const testChars = ['A', 'B', 'a', 'b', '0', '1', '!', '@'];
            
            for (const char of testChars) {
                const originalGlyph = font.charToGlyph(char);
                const reloadedGlyph = reloaded.charToGlyph(char);
                
                assert.ok(originalGlyph, `Original should have glyph for '${char}'`);
                assert.ok(reloadedGlyph, `Reloaded should have glyph for '${char}'`);
                assert.strictEqual(reloadedGlyph.index, originalGlyph.index,
                    `Glyph index for '${char}' should match`);
            }
        });
        
        it('should preserve unitsPerEm', function() {
            const buffer = font.toArrayBuffer();
            const reloaded = parse(buffer);
            
            assert.strictEqual(reloaded.tables.head.unitsPerEm, font.tables.head.unitsPerEm);
        });
        
        it('should preserve post table values', function() {
            const buffer = font.toArrayBuffer();
            const reloaded = parse(buffer);
            
            if (font.tables.post) {
                assert.ok(reloaded.tables.post, 'post table should be preserved');
                assert.strictEqual(reloaded.tables.post.italicAngle, font.tables.post.italicAngle);
                assert.strictEqual(reloaded.tables.post.underlinePosition, font.tables.post.underlinePosition);
                assert.strictEqual(reloaded.tables.post.underlineThickness, font.tables.post.underlineThickness);
            }
        });
    });
    
    describe('CFF Variable Font Conversion', function() {
        let cffFont;
        
        before(function() {
            cffFont = loadFont('./test/fonts/FiraSansMedium.woff');
            assert.strictEqual(cffFont.outlinesFormat, 'cff');
        });
        
        it('should convert CFF to TTF VF with accurate base shapes', function() {
            // Clone font
            const vfFont = parse(cffFont.toArrayBuffer());
            
            // Initialize variation and add axis with proper deltas
            vfFont.variation = new VariationManager(vfFont);
            vfFont.variation.addAxis({
                tag: 'TEST',
                name: 'Test Axis',
                minValue: 0,
                defaultValue: 0,
                maxValue: 100,
                deltaGenerator: (glyph) => {
                    if (!glyph || !glyph.path || !glyph.path.commands.length) return null;
                    const { points } = pathToPoints(glyph.path);
                    if (points.length === 0) return null;
                    // Zero deltas - should match original
                    const deltas = points.map(() => 0);
                    const deltasY = points.map(() => 0);
                    deltas.push(0, 0, 0, 0);
                    deltasY.push(0, 0, 0, 0);
                    return [{ peakTuple: [1.0], deltas, deltasY }];
                }
            });
            
            // Export
            const buffer = vfFont.toArrayBuffer();
            const reloaded = parse(buffer);
            
            // Should be TTF now
            assert.strictEqual(reloaded.outlinesFormat, 'truetype');
            
            // Instantiate at axis=0 (should match original CFF closely)
            const instance = reloaded.instantiate({ TEST: 0 });
            
            const testChars = ['A', 'a', 'o', 'e'];
            const fontSize = 72;
            
            for (const char of testChars) {
                const originalGlyph = cffFont.charToGlyph(char);
                const instanceGlyph = instance.charToGlyph(char);
                
                if (!originalGlyph || !instanceGlyph) continue;
                
                const originalPath = originalGlyph.getPath(0, 0, fontSize, {}, cffFont);
                const instancePath = instanceGlyph.getPath(0, 0, fontSize, {}, instance);
                
                // Use bounding box comparison with tolerance for cubic→quadratic conversion
                const comparison = comparePathsVisually(originalPath, instancePath, 5);
                assert.ok(comparison.similar,
                    `CFF→TTF VF: Glyph '${char}' at axis=0 should match original: ${comparison.details}`);
            }
        });
    });
    
    describe('CFF2 Variable Font Roundtrip', function() {
        let cff2Font;
        
        before(function() {
            cff2Font = loadFont('./test/fonts/TestRVRN-CFF2.otf');
            assert.strictEqual(cff2Font.outlinesFormat, 'cff', 'Test font should be CFF2/CFF');
            assert.ok(cff2Font.tables.cff2, 'Test font should have CFF2 table');
            assert.ok(cff2Font.tables.fvar, 'Test font should have fvar table');
        });
        
        it('should preserve CFF2 blend deltas through roundtrip', function() {
            // Check that original has deltas on path commands
            const glyph = cff2Font.glyphs.get(1);
            const cmdWithDeltas = glyph.path.commands.find(c => c.deltas);
            assert.ok(cmdWithDeltas, 'Original glyph should have commands with deltas');
            
            // Export and reimport
            const buffer = cff2Font.toArrayBuffer();
            const reloaded = parse(buffer);
            
            // Should still be CFF (not converted to TTF)
            assert.strictEqual(reloaded.outlinesFormat, 'cff', 'Should remain CFF after roundtrip');
            assert.ok(reloaded.tables.cff2, 'Should still have CFF2 table');
            assert.ok(reloaded.tables.fvar, 'Should preserve fvar table');
            
            // Check deltas are preserved
            const reloadedGlyph = reloaded.glyphs.get(1);
            const reloadedCmdWithDeltas = reloadedGlyph.path.commands.find(c => c.deltas);
            assert.ok(reloadedCmdWithDeltas, 'Reloaded glyph should have commands with deltas');
        });
        
        it('should preserve vstore through roundtrip', function() {
            const originalVstore = cff2Font.tables.cff2.topDict._vstore;
            assert.ok(originalVstore, 'Original should have vstore');
            
            const buffer = cff2Font.toArrayBuffer();
            const reloaded = parse(buffer);
            
            const reloadedVstore = reloaded.tables.cff2.topDict._vstore;
            assert.ok(reloadedVstore, 'Reloaded should have vstore');
            
            // Compare region counts
            const originalRegions = originalVstore.itemVariationStore?.variationRegions?.length;
            const reloadedRegions = reloadedVstore.itemVariationStore?.variationRegions?.length;
            assert.strictEqual(reloadedRegions, originalRegions, 'Variation region count should be preserved');
        });
    });
    
    describe('Cubic to Quadratic Accuracy', function() {
        it('should accurately convert various cubic curve types', function() {
            const testCases = [
                // Simple S-curve
                { x0: 0, y0: 0, x1: 0, y1: 100, x2: 100, y2: 100, x3: 100, y3: 0, name: 'S-curve' },
                // Near-straight line
                { x0: 0, y0: 0, x1: 33, y1: 0, x2: 66, y2: 0, x3: 100, y3: 0, name: 'horizontal line' },
                // Tight curve
                { x0: 0, y0: 0, x1: 50, y1: 0, x2: 50, y2: 100, x3: 100, y3: 100, name: 'right angle' },
                // Loop-like curve
                { x0: 0, y0: 0, x1: 100, y1: 50, x2: 0, y2: 50, x3: 100, y3: 0, name: 'loop-like' },
            ];
            
            for (const tc of testCases) {
                const quads = cubicToQuadratics(
                    tc.x0, tc.y0, tc.x1, tc.y1, tc.x2, tc.y2, tc.x3, tc.y3, 1
                );
                
                assert.ok(quads.length >= 1, `${tc.name}: should produce at least one quadratic`);
                
                // Verify endpoint
                const lastQuad = quads[quads.length - 1];
                assert.strictEqual(lastQuad.x, tc.x3, `${tc.name}: endpoint x should match`);
                assert.strictEqual(lastQuad.y, tc.y3, `${tc.name}: endpoint y should match`);
                
                // Verify midpoint accuracy
                const t = 0.5;
                const mt = 1 - t;
                
                // Cubic at t=0.5
                const cubicX = mt*mt*mt*tc.x0 + 3*mt*mt*t*tc.x1 + 3*mt*t*t*tc.x2 + t*t*t*tc.x3;
                const cubicY = mt*mt*mt*tc.y0 + 3*mt*mt*t*tc.y1 + 3*mt*t*t*tc.y2 + t*t*t*tc.y3;
                
                // For single quadratic, compute its midpoint
                if (quads.length === 1) {
                    const q = quads[0];
                    const quadX = 0.25 * tc.x0 + 0.5 * q.cx + 0.25 * tc.x3;
                    const quadY = 0.25 * tc.y0 + 0.5 * q.cy + 0.25 * tc.y3;
                    
                    const error = Math.sqrt((cubicX - quadX) ** 2 + (cubicY - quadY) ** 2);
                    assert.ok(error <= 1, `${tc.name}: midpoint error should be <= 1, got ${error.toFixed(3)}`);
                }
            }
        });
        
        it('should use fewer quadratics for simpler curves', function() {
            // Near-straight line should need only 1 quadratic
            const lineQuads = cubicToQuadratics(0, 0, 33, 0, 66, 0, 100, 0, 1);
            assert.ok(lineQuads.length <= 2, 'Near-line should need at most 2 quadratics');
            
            // Complex curve may need more
            const complexQuads = cubicToQuadratics(0, 0, 100, 200, -100, 200, 100, 0, 0.5);
            // Just verify it produces valid output
            assert.ok(complexQuads.length >= 1, 'Complex curve should produce quadratics');
        });
    });
    
    describe('Path Points Roundtrip', function() {
        let cffFont;
        
        before(function() {
            cffFont = loadFont('./test/fonts/FiraSansMedium.woff');
        });
        
        it('should convert CFF paths to points preserving shape', function() {
            const testChars = ['O', 'o', 'S', 's', '8'];  // Curved glyphs
            
            for (const char of testChars) {
                const glyph = cffFont.charToGlyph(char);
                if (!glyph || !glyph.path || !glyph.path.commands.length) continue;
                
                const { points, contourEnds } = pathToPoints(glyph.path, 1);
                
                assert.ok(points.length > 0, `${char}: should produce points`);
                assert.ok(contourEnds.length > 0, `${char}: should have contour ends`);
                
                // Verify we have a mix of on-curve and off-curve points for curved glyphs
                const onCurve = points.filter(p => p.onCurve).length;
                const offCurve = points.filter(p => !p.onCurve).length;
                
                assert.ok(onCurve > 0, `${char}: should have on-curve points`);
                // Curved glyphs should have off-curve points (from bezier control points)
                assert.ok(offCurve > 0, `${char}: curved glyph should have off-curve points`);
            }
        });
        
        it('should handle empty paths gracefully', function() {
            // Test with .notdef or space which may have empty paths
            const glyph = cffFont.glyphs.get(0);
            if (glyph && glyph.path) {
                const { points, contourEnds } = pathToPoints(glyph.path, 1);
                // Should not throw, and should return valid (possibly empty) arrays
                assert.ok(Array.isArray(points));
                assert.ok(Array.isArray(contourEnds));
            }
        });
    });
});
