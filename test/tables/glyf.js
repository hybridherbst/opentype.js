import assert from 'assert';
import { cubicToQuadratics, pathToPoints } from '../../src/tables/glyf.js';
import Path from '../../src/path.js';

describe('tables/glyf.js', function() {
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
});
