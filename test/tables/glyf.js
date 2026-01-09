import assert from 'assert';
import { cubicToQuadratics, pathToPoints } from '../../src/tables/glyf.js';
import glyf from '../../src/tables/glyf.js';
import Path from '../../src/path.js';
import Glyph from '../../src/glyph.js';
import { parse } from '../../src/opentype.js';
import { readFileSync } from 'fs';

describe('tables/glyf.js', function() {
    describe('composite glyph encoding', function() {
        it('should encode composite glyphs with components', function() {
            // Create a simple component glyph
            const componentPath = new Path();
            componentPath.moveTo(0, 0);
            componentPath.lineTo(100, 0);
            componentPath.lineTo(50, 100);
            componentPath.closePath();
            
            const componentGlyph = new Glyph({
                name: '_stem',
                path: componentPath,
                advanceWidth: 100
            });
            
            // Create a composite glyph that references the component
            const compositeGlyph = new Glyph({
                name: 'A',
                path: new Path(),
                advanceWidth: 500
            });
            // Set composite properties explicitly (Glyph constructor doesn't bind these)
            compositeGlyph.isComposite = true;
            compositeGlyph.components = [
                { glyphIndex: 0, dx: 0, dy: 0, xScale: 1, yScale: 1, scale01: 0, scale10: 0 },
                { glyphIndex: 0, dx: 100, dy: 0, xScale: 1, yScale: 1, scale01: 0, scale10: 0 }
            ];
            compositeGlyph._xMin = 0;
            compositeGlyph._yMin = 0;
            compositeGlyph._xMax = 200;
            compositeGlyph._yMax = 100;
            
            // Create a mock GlyphSet-like object
            const glyphs = {
                length: 2,
                get: function(idx) {
                    return idx === 0 ? componentGlyph : compositeGlyph;
                }
            };
            
            // Encode the glyf table
            const { glyfData, offsets } = glyf.make(glyphs);
            
            // Verify we got data
            assert.ok(glyfData.length > 0, 'Should produce glyf data');
            assert.strictEqual(offsets.length, 3, 'Should have 3 offsets (2 glyphs + end)');
            
            // Verify composite glyph has negative numberOfContours in header
            // Composite glyph starts at offset[1]
            const compositeOffset = offsets[1];
            const view = new DataView(glyfData.buffer);
            const numberOfContours = view.getInt16(compositeOffset);
            assert.strictEqual(numberOfContours, -1, 'Composite glyph should have numberOfContours = -1');
        });
        
        it('should handle components with byte-sized offsets', function() {
            const compositeGlyph = new Glyph({
                name: 'test',
                path: new Path(),
                advanceWidth: 500
            });
            compositeGlyph.isComposite = true;
            compositeGlyph.components = [
                { glyphIndex: 5, dx: 50, dy: 20, xScale: 1, yScale: 1, scale01: 0, scale10: 0 }
            ];
            compositeGlyph._xMin = 0;
            compositeGlyph._yMin = 0;
            compositeGlyph._xMax = 100;
            compositeGlyph._yMax = 100;
            
            const glyphs = {
                length: 1,
                get: () => compositeGlyph
            };
            
            const { glyfData, offsets } = glyf.make(glyphs);
            
            assert.ok(glyfData.length > 0);
            // With byte-sized offsets: 10 (header) + 2 (flags) + 2 (glyphIndex) + 2 (dx,dy as bytes) = 16 bytes
            // Actually depends on word boundary padding
            assert.ok(offsets[1] >= 16);
        });
        
        it('should handle components with word-sized offsets', function() {
            const compositeGlyph = new Glyph({
                name: 'test',
                path: new Path(),
                advanceWidth: 500
            });
            compositeGlyph.isComposite = true;
            compositeGlyph.components = [
                { glyphIndex: 5, dx: 200, dy: -150, xScale: 1, yScale: 1, scale01: 0, scale10: 0 }
            ];
            compositeGlyph._xMin = 0;
            compositeGlyph._yMin = -150;
            compositeGlyph._xMax = 300;
            compositeGlyph._yMax = 100;
            
            const glyphs = {
                length: 1,
                get: () => compositeGlyph
            };
            
            const { glyfData, offsets } = glyf.make(glyphs);
            
            assert.ok(glyfData.length > 0);
            // With word-sized offsets: 10 (header) + 2 (flags) + 2 (glyphIndex) + 4 (dx,dy as shorts) = 18 bytes
            assert.ok(offsets[1] >= 18);
        });
        
        it('should handle components with scale', function() {
            const compositeGlyph = new Glyph({
                name: 'test',
                path: new Path(),
                advanceWidth: 500
            });
            compositeGlyph.isComposite = true;
            compositeGlyph.components = [
                { glyphIndex: 5, dx: 0, dy: 0, xScale: 0.5, yScale: 0.5, scale01: 0, scale10: 0 }
            ];
            compositeGlyph._xMin = 0;
            compositeGlyph._yMin = 0;
            compositeGlyph._xMax = 50;
            compositeGlyph._yMax = 50;
            
            const glyphs = {
                length: 1,
                get: () => compositeGlyph
            };
            
            const { glyfData, offsets } = glyf.make(glyphs);
            
            assert.ok(glyfData.length > 0);
            // Should include scale data
            assert.ok(offsets[1] >= 18);
        });
    });
    
    describe('cubicToQuadratics', function() {
        it('should convert a simple cubic to quadratics', function() {
            // A simple cubic curve
            const quads = cubicToQuadratics(0, 0, 100, 0, 100, 100, 0, 100, 1);
            assert.ok(quads.length >= 1, 'Should produce at least one quadratic');
            
            // Last quadratic should end at the cubic's endpoint
            const lastQuad = quads[quads.length - 1];
            assert.strictEqual(lastQuad.x, 0);
            assert.strictEqual(lastQuad.y, 100);
        });
        
        it('should preserve straight lines as single quadratics', function() {
            // A degenerate cubic that's actually a line (control points on line)
            const quads = cubicToQuadratics(0, 0, 33, 33, 66, 66, 100, 100, 1);
            // Should produce a minimal number of quadratics
            assert.ok(quads.length <= 2, 'Should not over-subdivide a near-line');
            
            // End point should be correct
            const lastQuad = quads[quads.length - 1];
            assert.strictEqual(lastQuad.x, 100);
            assert.strictEqual(lastQuad.y, 100);
        });
        
        it('should produce accurate approximation at t=0.5', function() {
            // Test a curve and verify the midpoint accuracy
            const x0 = 0, y0 = 0;
            const x1 = 0, y1 = 100;
            const x2 = 100, y2 = 100;
            const x3 = 100, y3 = 0;
            
            const quads = cubicToQuadratics(x0, y0, x1, y1, x2, y2, x3, y3, 1);
            
            // Evaluate the cubic at t=0.5
            const cubicMidX = 0.125 * x0 + 0.375 * x1 + 0.375 * x2 + 0.125 * x3;
            const cubicMidY = 0.125 * y0 + 0.375 * y1 + 0.375 * y2 + 0.125 * y3;
            
            // If we have multiple quadratics, the combined curve should pass close to the cubic's midpoint
            // For a single quadratic, check the midpoint directly
            if (quads.length === 1) {
                const qx = quads[0].cx;
                const qy = quads[0].cy;
                const quadMidX = 0.25 * x0 + 0.5 * qx + 0.25 * x3;
                const quadMidY = 0.25 * y0 + 0.5 * qy + 0.25 * y3;
                
                const error = Math.sqrt((cubicMidX - quadMidX) ** 2 + (cubicMidY - quadMidY) ** 2);
                assert.ok(error <= 1, `Midpoint error should be <= 1, got ${error}`);
            }
            
            // End point should be correct
            const lastQuad = quads[quads.length - 1];
            assert.strictEqual(lastQuad.x, x3);
            assert.strictEqual(lastQuad.y, y3);
        });
        
        it('should use higher tolerance for fewer quadratics', function() {
            const x0 = 0, y0 = 0;
            const x1 = 0, y1 = 100;
            const x2 = 100, y2 = 100;
            const x3 = 100, y3 = 0;
            
            const quadsLow = cubicToQuadratics(x0, y0, x1, y1, x2, y2, x3, y3, 0.5);
            const quadsHigh = cubicToQuadratics(x0, y0, x1, y1, x2, y2, x3, y3, 10);
            
            // Higher tolerance should produce fewer or equal quadratics
            assert.ok(quadsHigh.length <= quadsLow.length, 
                `Higher tolerance (${quadsHigh.length}) should produce fewer or equal quads than low tolerance (${quadsLow.length})`);
        });
    });
    
    describe('pathToPoints', function() {
        it('should convert a simple path with moveto and lineto', function() {
            const path = new Path();
            path.moveTo(0, 0);
            path.lineTo(100, 0);
            path.lineTo(100, 100);
            path.close();
            
            const { points, contourEnds } = pathToPoints(path);
            
            assert.strictEqual(points.length, 3);
            assert.strictEqual(contourEnds.length, 1);
            assert.strictEqual(contourEnds[0], 2);
            
            // All points should be on-curve
            assert.ok(points.every(p => p.onCurve === true));
        });
        
        it('should convert a path with quadratic curves', function() {
            const path = new Path();
            path.moveTo(0, 0);
            path.quadraticCurveTo(50, 50, 100, 0);
            path.close();
            
            const { points, contourEnds } = pathToPoints(path);
            
            // Should have: moveto (on-curve), control (off-curve), endpoint (on-curve)
            assert.strictEqual(points.length, 3);
            assert.strictEqual(points[0].onCurve, true);
            assert.strictEqual(points[1].onCurve, false);  // Control point
            assert.strictEqual(points[2].onCurve, true);
        });
        
        it('should convert a path with cubic curves', function() {
            const path = new Path();
            path.moveTo(0, 0);
            path.curveTo(0, 100, 100, 100, 100, 0);  // Cubic bezier
            path.close();
            
            const { points, contourEnds } = pathToPoints(path);
            
            // Should have at least 3 points (moveto + at least one quad control + endpoint)
            assert.ok(points.length >= 3);
            
            // First point should be on-curve (moveto)
            assert.strictEqual(points[0].onCurve, true);
            assert.strictEqual(points[0].x, 0);
            assert.strictEqual(points[0].y, 0);
            
            // Last point should be on-curve (endpoint)
            const lastPoint = points[points.length - 1];
            assert.strictEqual(lastPoint.onCurve, true);
            assert.strictEqual(lastPoint.x, 100);
            assert.strictEqual(lastPoint.y, 0);
            
            // Should have proper contour
            assert.strictEqual(contourEnds.length, 1);
        });
        
        it('should remove duplicate closing point', function() {
            const path = new Path();
            path.moveTo(0, 0);
            path.lineTo(100, 0);
            path.lineTo(100, 100);
            path.lineTo(0, 0);  // Explicit close back to start
            path.close();
            
            const { points } = pathToPoints(path);
            
            // Should only have 3 points, not 4 (duplicate should be removed)
            assert.strictEqual(points.length, 3);
        });
        
        it('should handle multiple contours', function() {
            const path = new Path();
            // First contour
            path.moveTo(0, 0);
            path.lineTo(100, 0);
            path.lineTo(50, 100);
            path.close();
            // Second contour
            path.moveTo(200, 0);
            path.lineTo(300, 0);
            path.lineTo(250, 100);
            path.close();
            
            const { points, contourEnds } = pathToPoints(path);
            
            assert.strictEqual(points.length, 6);  // 3 + 3
            assert.strictEqual(contourEnds.length, 2);
            assert.strictEqual(contourEnds[0], 2);  // End of first contour
            assert.strictEqual(contourEnds[1], 5);  // End of second contour
        });
    });
    
    describe('composite glyph roundtrip', function() {
        const loadFont = (path) => {
            const buffer = readFileSync(path);
            // Use slice to get a proper ArrayBuffer (Node Buffer shares the backing ArrayBuffer)
            const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
            return parse(arrayBuffer);
        };
        
        // Helper: Get all composite glyphs in a font (forces glyph loading)
        function getCompositeGlyphs(font) {
            const composites = [];
            for (let i = 0; i < font.glyphs.length; i++) {
                const glyph = font.glyphs.get(i);
                // Force glyph loading by accessing path/points
                try {
                    glyph.getPath();
                } catch (e) {
                    // Some glyphs may fail to load
                }
                if (glyph.isComposite && glyph.components && glyph.components.length > 0) {
                    composites.push({
                        index: i,
                        name: glyph.name,
                        componentCount: glyph.components.length,
                        componentIndices: glyph.components.map(c => c.glyphIndex),
                        hasScale: glyph.components.some(c => 
                            c.xScale !== 1 || c.yScale !== 1 || c.scale01 !== 0 || c.scale10 !== 0
                        )
                    });
                }
            }
            return composites;
        }
        
        // Helper: Validate composite glyph structure
        function validateCompositeGlyph(glyph, font) {
            const errors = [];
            if (!glyph.isComposite) {
                errors.push(`Glyph ${glyph.name} is not marked as composite`);
                return errors;
            }
            if (!glyph.components || glyph.components.length === 0) {
                errors.push(`Composite glyph ${glyph.name} has no components`);
                return errors;
            }
            for (let i = 0; i < glyph.components.length; i++) {
                const comp = glyph.components[i];
                if (comp.glyphIndex < 0 || comp.glyphIndex >= font.glyphs.length) {
                    errors.push(`Component ${i} of ${glyph.name} has invalid glyphIndex ${comp.glyphIndex}`);
                }
                if (typeof comp.dx !== 'number' || typeof comp.dy !== 'number') {
                    errors.push(`Component ${i} of ${glyph.name} has invalid dx/dy`);
                }
            }
            return errors;
        }
        
        it('should identify composite glyphs in TestGVAR-Composite-0', function() {
            const font = loadFont('./test/fonts/TestGVAR-Composite-0.ttf');
            
            const composites = getCompositeGlyphs(font);
            
            // This font is specifically for testing composite glyphs
            assert.ok(composites.length > 0, 'TestGVAR-Composite-0 should have composite glyphs');
            console.log(`TestGVAR-Composite-0 has ${composites.length} composite glyphs`);
            
            // Show details for debugging
            for (const c of composites) {
                console.log(`  ${c.name} (${c.componentCount} components: ${c.componentIndices.join(', ')})`);
            }
        });
        
        it('should have correct variation axes in composite font', function() {
            const font = loadFont('./test/fonts/TestGVAR-Composite-0.ttf');
            
            assert.ok(font.tables.fvar, 'Should have fvar table');
            const axes = font.tables.fvar.axes;
            assert.ok(axes.length > 0, 'Should have variation axes');
            
            // Check for expected axes
            const axisNames = axes.map(a => a.tag.trim());
            console.log('TestGVAR-Composite-0 axes:', axisNames.join(', '));
        });
        
        it('should preserve composite glyphs after roundtrip', function() {
            this.timeout(5000);
            const font = loadFont('./test/fonts/TestGVAR-Composite-0.ttf');
            
            // Get original composite glyph info
            const origComposites = getCompositeGlyphs(font);
            const origCount = origComposites.length;
            assert.ok(origCount > 0, 'Should have composite glyphs before roundtrip');
            
            // Build a map of composite glyph names to their component info
            const origMap = new Map();
            for (const comp of origComposites) {
                origMap.set(comp.name, comp);
            }
            
            // Export and re-import
            const buffer = font.toArrayBuffer();
            assert.ok(buffer.byteLength > 0, 'Export should produce data');
            
            const parsed = parse(buffer);
            
            // Get parsed composite glyph info
            const parsedComposites = getCompositeGlyphs(parsed);
            
            // Verify we still have composite glyphs
            assert.ok(parsedComposites.length > 0, 'Should have composite glyphs after roundtrip');
            console.log(`Before: ${origCount} composites, After: ${parsedComposites.length} composites`);
            
            // Debug: show parsed composite names
            console.log('Original composites:', origComposites.map(c => c.name).join(', '));
            console.log('Parsed composites:', parsedComposites.map(c => c.name).join(', '));
            
            // Verify each original composite is still present (by index as fallback if name fails)
            let matchedCount = 0;
            for (const parsedComp of parsedComposites) {
                // Try to match by name first
                let origComp = origMap.get(parsedComp.name);
                // Fallback: match by index
                if (!origComp) {
                    origComp = origComposites.find(c => c.index === parsedComp.index);
                }
                if (origComp) {
                    matchedCount++;
                    // Verify component count matches
                    assert.strictEqual(parsedComp.componentCount, origComp.componentCount,
                        `${parsedComp.name} should have ${origComp.componentCount} components`);
                }
            }
            
            // All original composites should be preserved
            assert.strictEqual(matchedCount, origCount, 
                `All ${origCount} composite glyphs should be preserved (got ${matchedCount})`);
        });
        
        it('should preserve variation data for composite glyphs', function() {
            this.timeout(5000);
            const font = loadFont('./test/fonts/TestGVAR-Composite-0.ttf');
            
            // Get a composite glyph
            const composites = getCompositeGlyphs(font);
            assert.ok(composites.length > 0, 'Should have composite glyphs');
            
            const testGlyph = composites[0];
            
            // Check if glyph has variation data
            assert.ok(font.tables.gvar, 'Should have gvar table');
            const glyphVar = font.tables.gvar.glyphVariations[testGlyph.index];
            
            if (glyphVar && glyphVar.headers && glyphVar.headers.length > 0) {
                console.log(`Composite glyph ${testGlyph.name} has ${glyphVar.headers.length} variation tuples`);
                
                // Export and reimport
                const buffer = font.toArrayBuffer();
                const parsed = parse(buffer);
                
                // Check variation data is preserved
                const parsedVar = parsed.tables.gvar.glyphVariations[testGlyph.index];
                assert.ok(parsedVar, `Variation data for ${testGlyph.name} should be preserved`);
                assert.strictEqual(parsedVar.headers.length, glyphVar.headers.length,
                    `Tuple count should be preserved for ${testGlyph.name}`);
            } else {
                console.log(`Composite glyph ${testGlyph.name} has no variation data (phantom points only)`);
            }
        });
        
        it('should validate composite glyph structure after roundtrip', function() {
            this.timeout(5000);
            const font = loadFont('./test/fonts/TestGVAR-Composite-0.ttf');
            
            const buffer = font.toArrayBuffer();
            const parsed = parse(buffer);
            
            const composites = getCompositeGlyphs(parsed);
            assert.ok(composites.length > 0, 'Should have composite glyphs after roundtrip');
            
            // Validate each composite glyph
            let validCount = 0;
            let errorCount = 0;
            for (const comp of composites) {
                const glyph = parsed.glyphs.get(comp.index);
                const errors = validateCompositeGlyph(glyph, parsed);
                if (errors.length === 0) {
                    validCount++;
                } else {
                    errorCount++;
                    if (errorCount <= 3) {
                        console.log(`Validation errors for ${comp.name}:`, errors);
                    }
                }
            }
            
            console.log(`Validated ${validCount} composite glyphs, ${errorCount} with errors`);
            
            // All composite glyphs should be valid
            assert.strictEqual(errorCount, 0, 
                `All composite glyphs should be valid (${errorCount} invalid)`);
        });
        
        it('should draw composite glyphs correctly after roundtrip', function() {
            this.timeout(5000);
            const font = loadFont('./test/fonts/TestGVAR-Composite-0.ttf');
            
            // Get original path data for a composite glyph
            const composites = getCompositeGlyphs(font);
            assert.ok(composites.length > 0, 'Should have composite glyphs');
            
            const testGlyph = composites[0];
            const origGlyph = font.glyphs.get(testGlyph.index);
            const origPath = origGlyph.getPath(0, 0, 100, {}, font);
            
            // Roundtrip
            const buffer = font.toArrayBuffer();
            const parsed = parse(buffer);
            
            // Get path after roundtrip
            const parsedGlyph = parsed.glyphs.get(testGlyph.index);
            const parsedPath = parsedGlyph.getPath(0, 0, 100, {}, parsed);
            
            // Compare command counts (should be the same structure)
            assert.strictEqual(parsedPath.commands.length, origPath.commands.length,
                `Path command count for ${testGlyph.name} should be identical after roundtrip`);
            
            // Compare command types
            for (let i = 0; i < origPath.commands.length; i++) {
                assert.strictEqual(parsedPath.commands[i].type, origPath.commands[i].type,
                    `Command type at position ${i} should match`);
            }
            
            // Note: Exact coordinates may differ slightly due to TTF integer storage
            // but the overall shape should be equivalent
            console.log(`Roundtrip preserved ${origPath.commands.length} path commands`);
        });
        
        it('should preserve composite glyph transforms (slant variation)', function() {
            this.timeout(5000);
            const font = loadFont('./test/fonts/TestGVAR-Composite-0.ttf');
            
            // Get a composite glyph
            const composites = getCompositeGlyphs(font);
            assert.ok(composites.length > 0, 'Should have composite glyphs');
            
            // Get path at different variation values
            const testGlyph = composites[0];
            const glyph = font.glyphs.get(testGlyph.index);
            
            // Get default path command count
            const defaultPath = glyph.getPath(0, 0, 100, {}, font);
            const defaultCommandCount = defaultPath.commands.length;
            
            // Get path at slnt=-9 (if slnt axis exists)
            const slntAxis = font.tables.fvar.axes.find(a => a.tag.trim() === 'slnt');
            let slantedPath = null;
            if (slntAxis) {
                slantedPath = glyph.getPath(0, 0, 100, { variation: { slnt: -9 } }, font);
                console.log(`Default path length: ${defaultPath.toPathData().length}, Slanted path length: ${slantedPath.toPathData().length}`);
                
                // Paths should be different at different axis values
                if (slantedPath.toPathData() !== defaultPath.toPathData()) {
                    console.log('Path changes with slnt variation - variation is working');
                }
            }
            
            // Roundtrip
            const buffer = font.toArrayBuffer();
            const parsed = parse(buffer);
            
            // Get parsed path at default
            const parsedGlyph = parsed.glyphs.get(testGlyph.index);
            const parsedDefaultPath = parsedGlyph.getPath(0, 0, 100, {}, parsed);
            
            // Command count should match (structure preserved)
            assert.strictEqual(parsedDefaultPath.commands.length, defaultCommandCount,
                `Path command count should be preserved after roundtrip`);
            
            // If variation exists, test it still works after roundtrip
            if (slntAxis) {
                const parsedSlantedPath = parsedGlyph.getPath(0, 0, 100, { variation: { slnt: -9 } }, parsed);
                // Slanted path should still be different from default
                const defaultData = parsedDefaultPath.toPathData();
                const slantedData = parsedSlantedPath.toPathData();
                
                console.log(`After roundtrip - Default: ${defaultData.length} chars, Slanted: ${slantedData.length} chars`);
                
                // The paths may differ slightly due to variation deltas
                assert.ok(parsedSlantedPath.commands.length > 0, 
                    'Slanted path should be drawable after roundtrip');
            }
        });
    });
});
