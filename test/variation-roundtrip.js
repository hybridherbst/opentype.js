import assert from 'assert';
import { Font, Glyph, Path, parse, VariationManager } from '../src/opentype.js';

describe('variation roundtrip', function() {
    
    it('should preserve non-zero deltas after export/import', function() {
        // Create a simple font
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

        const aPath = new Path();
        aPath.moveTo(100, 0);
        aPath.lineTo(250, 700);
        aPath.lineTo(400, 0);
        aPath.closePath();

        const aGlyph = new Glyph({
            name: 'A',
            unicode: 65,
            advanceWidth: 500,
            path: aPath
        });

        const font = new Font({
            familyName: 'TestVF',
            styleName: 'Regular',
            unitsPerEm: 1000,
            ascender: 800,
            descender: -200,
            glyphs: [notdefGlyph, aGlyph]
        });

        // Add variation
        font.variation = new VariationManager(font);

        // Define deltas - these should make the glyph wider at max weight
        const deltaMap = new Map();
        deltaMap.set('A', {
            deltas: [-50, 0, 50, 0, 0, 0, 0],  // Move left point left, right point right + 4 phantom
            deltasY: [0, 0, 0, 0, 0, 0, 0]
        });
        deltaMap.set('.notdef', {
            deltas: [-25, -25, 25, 25, 0, 0, 0, 0],  // + 4 phantom
            deltasY: [0, 0, 0, 0, 0, 0, 0, 0]
        });

        font.variation.addAxis({
            tag: 'wght',
            name: 'Weight',
            minValue: 100,
            defaultValue: 400,
            maxValue: 900,
            deltaGenerator: (glyph) => {
                return deltaMap.get(glyph.name) || null;
            }
        });

        // Verify gvar was created with non-zero deltas
        assert.ok(font.tables.gvar, 'gvar table should exist');
        const origVar = font.tables.gvar.glyphVariations[1];
        assert.ok(origVar && origVar.headers && origVar.headers.length > 0, 'Glyph 1 should have variations');
        const origDeltas = origVar.headers[0].deltas;
        assert.ok(origDeltas.some(d => d !== 0), 'Original deltas should have non-zero values');

        // Export
        const buffer = font.toArrayBuffer();
        assert.ok(buffer.byteLength > 0, 'Buffer should have content');

        // Re-import
        const parsed = parse(buffer);
        assert.ok(parsed.tables.gvar, 'Parsed font should have gvar table');

        // Check deltas are preserved
        const parsedVar = parsed.tables.gvar.glyphVariations[1];
        assert.ok(parsedVar && parsedVar.headers && parsedVar.headers.length > 0, 
                  'Parsed glyph 1 should have variations');
        
        // Force load the glyph to trigger delta processing
        const glyph = parsed.glyphs.get(1);
        glyph.path;
        
        const parsedDeltas = parsedVar.headers[0].deltas;
        assert.ok(parsedDeltas.some(d => d !== 0), 
                  'Parsed deltas should have non-zero values');
        
        // Verify the actual values match
        assert.deepEqual(parsedDeltas.slice(0, 3), origDeltas.slice(0, 3),
                        'Parsed deltas should match original');
    });
    
    it('should produce different glyph shapes at different axis values', function() {
        // Create a simple font
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

        const aPath = new Path();
        aPath.moveTo(100, 0);
        aPath.lineTo(250, 700);
        aPath.lineTo(400, 0);
        aPath.closePath();

        const aGlyph = new Glyph({
            name: 'A',
            unicode: 65,
            advanceWidth: 500,
            path: aPath
        });

        const font = new Font({
            familyName: 'TestVF',
            styleName: 'Regular',
            unitsPerEm: 1000,
            ascender: 800,
            descender: -200,
            glyphs: [notdefGlyph, aGlyph]
        });

        // Add variation
        font.variation = new VariationManager(font);

        // Define deltas with significant differences
        const deltaMap = new Map();
        deltaMap.set('A', {
            deltas: [-50, 0, 50, 0, 0, 0, 0],
            deltasY: [0, 0, 0, 0, 0, 0, 0]
        });
        deltaMap.set('.notdef', {
            deltas: [-25, -25, 25, 25, 0, 0, 0, 0],
            deltasY: [0, 0, 0, 0, 0, 0, 0, 0]
        });

        font.variation.addAxis({
            tag: 'wght',
            name: 'Weight',
            minValue: 100,
            defaultValue: 400,
            maxValue: 900,
            deltaGenerator: (glyph) => {
                return deltaMap.get(glyph.name) || null;
            }
        });

        // Export and re-import
        const buffer = font.toArrayBuffer();
        const parsed = parse(buffer);

        // Get glyph A at different weights
        const glyphA = parsed.charToGlyph('A');
        
        const defaultTransform = parsed.variation.process.getTransform(glyphA.index, {wght: 400});
        const maxTransform = parsed.variation.process.getTransform(glyphA.index, {wght: 900});
        
        assert.ok(defaultTransform.points, 'Default transform should have points');
        assert.ok(maxTransform.points, 'Max transform should have points');
        
        // The first point should be different (original: 100, at max should be 50)
        assert.notEqual(defaultTransform.points[0].x, maxTransform.points[0].x,
                       'Points should differ at different axis values');
        
        // Check the delta was applied correctly
        // At wght=900 (max), the delta of -50 should be fully applied
        // So x should go from 100 to 50
        assert.equal(maxTransform.points[0].x, 50, 
                    'First point x should be 100 + (-50) = 50 at max weight');
    });
    
    it('should support both min and max deltas', function() {
        const aPath = new Path();
        aPath.moveTo(200, 0);
        aPath.lineTo(300, 700);
        aPath.lineTo(400, 0);
        aPath.closePath();

        const aGlyph = new Glyph({
            name: 'A',
            unicode: 65,
            advanceWidth: 600,
            path: aPath
        });

        const font = new Font({
            familyName: 'TestVF',
            styleName: 'Regular',
            unitsPerEm: 1000,
            ascender: 800,
            descender: -200,
            glyphs: [
                new Glyph({name: '.notdef', unicode: 0, advanceWidth: 500, path: new Path()}),
                aGlyph
            ]
        });

        font.variation = new VariationManager(font);

        // Return deltas for both min and max directions
        font.variation.addAxis({
            tag: 'wght',
            name: 'Weight',
            minValue: 100,
            defaultValue: 400,
            maxValue: 900,
            deltaGenerator: (glyph) => {
                if (glyph.name === 'A') {
                    // Return array with min and max variations
                    return [
                        {
                            peakTuple: [-1],  // Min direction
                            deltas: [50, 0, -50, 0, 0, 0, 0],  // Narrower at min
                            deltasY: [0, 0, 0, 0, 0, 0, 0]
                        },
                        {
                            peakTuple: [1],   // Max direction  
                            deltas: [-50, 0, 50, 0, 0, 0, 0],  // Wider at max
                            deltasY: [0, 0, 0, 0, 0, 0, 0]
                        }
                    ];
                }
                return null;
            }
        });

        // Export and re-import
        const buffer = font.toArrayBuffer();
        const parsed = parse(buffer);

        const glyphA = parsed.charToGlyph('A');
        
        const minTransform = parsed.variation.process.getTransform(glyphA.index, {wght: 100});
        const defaultTransform = parsed.variation.process.getTransform(glyphA.index, {wght: 400});
        const maxTransform = parsed.variation.process.getTransform(glyphA.index, {wght: 900});
        
        // Default should be at 200
        assert.equal(defaultTransform.points[0].x, 200, 'Default x should be 200');
        
        // Min should be narrower (200 + 50 = 250)
        assert.equal(minTransform.points[0].x, 250, 'Min x should be 250 (200 + 50)');
        
        // Max should be wider (200 - 50 = 150)
        assert.equal(maxTransform.points[0].x, 150, 'Max x should be 150 (200 - 50)');
    });
    
    // This test simulates what font-editor does when exporting
    it('should correctly calculate deltas from master glyph differences', function() {
        // Simulate font-editor state with masters
        const TTF_SCALE = 100;  // font-editor uses 100
        
        // Simulate state.vf.masters with actual different glyph data
        const masters = [
            {
                name: 'Default',
                coords: { wght: 400 },
                glyphs: { 'A': [[100, 0], [250, 700], [400, 0]] }
            },
            {
                name: 'wght Min',
                coords: { wght: 100 },
                glyphs: { 'A': [[150, 0], [250, 700], [350, 0]] }  // Narrower
            },
            {
                name: 'wght Max',
                coords: { wght: 900 },
                glyphs: { 'A': [[50, 0], [250, 700], [450, 0]] }   // Wider
            }
        ];
        
        const axis = { tag: 'wght', name: 'Weight', minValue: 100, defaultValue: 400, maxValue: 900 };
        
        // Calculate deltas similar to buildMasterDeltas
        const defaultMaster = masters[0];
        const minMaster = masters[1];
        const maxMaster = masters[2];
        
        // Build the font with these deltas
        const aPath = new Path();
        const basePoints = defaultMaster.glyphs['A'];
        aPath.moveTo(basePoints[0][0] * TTF_SCALE, basePoints[0][1] * TTF_SCALE);
        for (let i = 1; i < basePoints.length; i++) {
            aPath.lineTo(basePoints[i][0] * TTF_SCALE, basePoints[i][1] * TTF_SCALE);
        }
        aPath.closePath();

        const font = new Font({
            familyName: 'TestVF',
            styleName: 'Regular',
            unitsPerEm: 1000,
            ascender: 800,
            descender: -200,
            glyphs: [
                new Glyph({name: '.notdef', unicode: 0, advanceWidth: 500, path: new Path()}),
                new Glyph({name: 'A', unicode: 65, advanceWidth: 600, path: aPath})
            ]
        });

        font.variation = new VariationManager(font);
        
        // Generate deltas from master differences
        font.variation.addAxis({
            tag: axis.tag,
            name: axis.name,
            minValue: axis.minValue,
            defaultValue: axis.defaultValue,
            maxValue: axis.maxValue,
            deltaGenerator: (glyph) => {
                if (glyph.name !== 'A') return null;
                
                const base = defaultMaster.glyphs['A'];
                const min = minMaster.glyphs['A'];
                const max = maxMaster.glyphs['A'];
                
                const results = [];
                
                // Min direction deltas
                const minDeltas = [];
                const minDeltasY = [];
                const minRange = axis.defaultValue - axis.minValue;  // 400 - 100 = 300
                const minOffset = axis.defaultValue - minMaster.coords.wght;  // 400 - 100 = 300
                const minScale = minRange / minOffset;  // 1
                
                for (let i = 0; i < base.length; i++) {
                    minDeltas.push(Math.round((min[i][0] - base[i][0]) * TTF_SCALE * minScale));
                    minDeltasY.push(Math.round((min[i][1] - base[i][1]) * TTF_SCALE * minScale));
                }
                // Add phantom points
                minDeltas.push(0, 0, 0, 0);
                minDeltasY.push(0, 0, 0, 0);
                
                results.push({
                    peakTuple: [-1],
                    deltas: minDeltas,
                    deltasY: minDeltasY
                });
                
                // Max direction deltas
                const maxDeltas = [];
                const maxDeltasY = [];
                const maxRange = axis.maxValue - axis.defaultValue;  // 900 - 400 = 500
                const maxOffset = maxMaster.coords.wght - axis.defaultValue;  // 900 - 400 = 500
                const maxScale = maxRange / maxOffset;  // 1
                
                for (let i = 0; i < base.length; i++) {
                    maxDeltas.push(Math.round((max[i][0] - base[i][0]) * TTF_SCALE * maxScale));
                    maxDeltasY.push(Math.round((max[i][1] - base[i][1]) * TTF_SCALE * maxScale));
                }
                maxDeltas.push(0, 0, 0, 0);
                maxDeltasY.push(0, 0, 0, 0);
                
                results.push({
                    peakTuple: [1],
                    deltas: maxDeltas,
                    deltasY: maxDeltasY
                });
                
                return results;
            }
        });

        // Check the gvar before export
        assert.ok(font.tables.gvar, 'gvar should exist before export');
        const gvarBefore = font.tables.gvar.glyphVariations[1];
        assert.ok(gvarBefore && gvarBefore.headers.length >= 2, 'Should have 2 variation headers (min and max)');
        
        // Verify deltas are non-zero
        const minDeltasBefore = gvarBefore.headers.find(h => h.peakTuple[0] === -1);
        const maxDeltasBefore = gvarBefore.headers.find(h => h.peakTuple[0] === 1);
        assert.ok(minDeltasBefore, 'Should have min deltas');
        assert.ok(maxDeltasBefore, 'Should have max deltas');
        assert.ok(minDeltasBefore.deltas.some(d => d !== 0), 'Min deltas should be non-zero');
        assert.ok(maxDeltasBefore.deltas.some(d => d !== 0), 'Max deltas should be non-zero');
        
        // Export
        const buffer = font.toArrayBuffer();
        
        // Re-import
        const parsed = parse(buffer);
        
        // Check deltas after import
        assert.ok(parsed.tables.gvar, 'Parsed font should have gvar');
        const gvarAfter = parsed.tables.gvar.glyphVariations[1];
        
        // Force load glyph
        const glyph = parsed.glyphs.get(1);
        glyph.path;
        
        assert.ok(gvarAfter && gvarAfter.headers.length >= 2, 'Should still have 2 variation headers after roundtrip');
        
        // Check the actual transformed points
        const minT = parsed.variation.process.getTransform(1, {wght: 100});
        const defT = parsed.variation.process.getTransform(1, {wght: 400});
        const maxT = parsed.variation.process.getTransform(1, {wght: 900});
        
        // At wght=100, point 0 should be at 150 * 100 = 15000
        // At wght=400, point 0 should be at 100 * 100 = 10000
        // At wght=900, point 0 should be at 50 * 100 = 5000
        
        assert.equal(defT.points[0].x, 10000, 'Default x should be 10000');
        assert.equal(minT.points[0].x, 15000, 'Min x should be 15000');
        assert.equal(maxT.points[0].x, 5000, 'Max x should be 5000');
    });
    
    // Issue: When only min master exists (100), extrapolation to max (900) requires mirrored deltas
    // OpenType doesn't automatically extrapolate - you must provide deltas for both directions
    it('should support extrapolation with mirrored deltas', function() {
        // Simulates: axis 100..400(default)..900, with only a min master at 100
        // For proper extrapolation, we provide min deltas AND mirrored max deltas
        const aPath = new Path();
        aPath.moveTo(200, 0);
        aPath.lineTo(300, 700);
        aPath.lineTo(400, 0);
        aPath.closePath();

        const aGlyph = new Glyph({
            name: 'A',
            unicode: 65,
            advanceWidth: 600,
            path: aPath
        });

        const font = new Font({
            familyName: 'TestVF',
            styleName: 'Regular',
            unitsPerEm: 1000,
            ascender: 800,
            descender: -200,
            glyphs: [
                new Glyph({name: '.notdef', unicode: 0, advanceWidth: 500, path: new Path()}),
                aGlyph
            ]
        });

        font.variation = new VariationManager(font);

        // Provide BOTH min and mirrored max deltas for proper extrapolation
        // At min (100), glyph should be narrower: delta = +50
        // At max (900), glyph should be wider: delta = -50 (mirror of min)
        font.variation.addAxis({
            tag: 'wght',
            name: 'Weight',
            minValue: 100,
            defaultValue: 400,
            maxValue: 900,
            deltaGenerator: (glyph) => {
                if (glyph.name === 'A') {
                    return [
                        {
                            peakTuple: [-1],  // Min direction
                            deltas: [50, 0, -50, 0, 0, 0, 0],  // Narrower at min
                            deltasY: [0, 0, 0, 0, 0, 0, 0]
                        },
                        {
                            peakTuple: [1],   // Max direction (mirrored for extrapolation)
                            deltas: [-50, 0, 50, 0, 0, 0, 0],  // Wider at max (negated min deltas)
                            deltasY: [0, 0, 0, 0, 0, 0, 0]
                        }
                    ];
                }
                return null;
            }
        });

        // Export and re-import
        const buffer = font.toArrayBuffer();
        const parsed = parse(buffer);

        const glyphA = parsed.charToGlyph('A');
        
        const minT = parsed.variation.process.getTransform(glyphA.index, {wght: 100});
        const defT = parsed.variation.process.getTransform(glyphA.index, {wght: 400});
        const maxT = parsed.variation.process.getTransform(glyphA.index, {wght: 900});
        
        // Default should be at 200
        assert.equal(defT.points[0].x, 200, 'Default x should be 200');
        
        // Min should be narrower (200 + 50 = 250)
        assert.equal(minT.points[0].x, 250, 'Min x should be 250 (200 + 50)');
        
        // Max should be wider (200 - 50 = 150) due to mirrored deltas
        assert.equal(maxT.points[0].x, 150, 'Max x should be 150 (200 - 50, mirrored extrapolation)');
    });
    
    // Issue: advanceWidth variation should be exported and preserved via hvar table
    // This test manually creates hvar to verify hvar parsing/encoding works
    it('should preserve advanceWidth variation after roundtrip when hvar is manually created', function() {
        const aPath = new Path();
        aPath.moveTo(100, 0);
        aPath.lineTo(250, 700);
        aPath.lineTo(400, 0);
        aPath.closePath();

        const aGlyph = new Glyph({
            name: 'A',
            unicode: 65,
            advanceWidth: 500,
            path: aPath
        });

        const font = new Font({
            familyName: 'TestVF',
            styleName: 'Regular',
            unitsPerEm: 1000,
            ascender: 800,
            descender: -200,
            glyphs: [
                new Glyph({name: '.notdef', unicode: 0, advanceWidth: 500, path: new Path()}),
                aGlyph
            ]
        });

        font.variation = new VariationManager(font);

        // Add the axis first
        font.variation.addAxis({
            tag: 'wght',
            name: 'Weight',
            minValue: 100,
            defaultValue: 400,
            maxValue: 900,
            deltaGenerator: (glyph) => {
                if (glyph.name === 'A') {
                    return {
                        deltas: [0, 0, 0, 0, 0, 0, 0],  // No point deltas
                        deltasY: [0, 0, 0, 0, 0, 0, 0]
                    };
                }
                return null;
            }
        });

        // Create hvar table for advanceWidth variation
        // The hvar table stores width deltas per glyph
        font.tables.hvar = {
            version: [1, 0],
            itemVariationStore: {
                format: 1,
                variationRegions: [
                    {
                        regionAxes: [
                            { startCoord: 0, peakCoord: 1, endCoord: 1 }  // Max direction
                        ]
                    }
                ],
                itemVariationSubtables: [
                    {
                        regionIndexes: [0],
                        deltaSets: [
                            [0],    // .notdef: no width change
                            [100]   // 'A': +100 at max weight
                        ]
                    }
                ]
            },
            advanceWidth: {
                format: 0,
                map: [
                    { outerIndex: 0, innerIndex: 0 },  // .notdef -> subtable 0, delta 0
                    { outerIndex: 0, innerIndex: 1 }   // 'A' -> subtable 0, delta 1
                ]
            }
        };

        // Verify advanceWidth is 500 at default
        assert.equal(aGlyph.advanceWidth, 500, 'Original advanceWidth should be 500');
        
        // Export and re-import
        const buffer = font.toArrayBuffer();
        const parsed = parse(buffer);

        const glyphA = parsed.charToGlyph('A');
        
        // Get transformed glyph at max weight
        const defT = parsed.variation.process.getTransform(glyphA.index, {wght: 400});
        const maxT = parsed.variation.process.getTransform(glyphA.index, {wght: 900});
        
        // At default, advanceWidth should be 500
        assert.equal(defT.advanceWidth, 500, 'Default advanceWidth should be 500');
        
        // At max weight, advanceWidth should be 500 + 100 = 600
        assert.equal(maxT.advanceWidth, 600, 'Max advanceWidth should be 600 (500 + 100)');
    });
    
    // Issue: advanceWidth variation should be AUTO-GENERATED via hvar table when using addAxis
    // with advanceWidthDeltaGenerator - THIS TEST SHOULD INITIALLY FAIL
    it('should auto-generate hvar table when advanceWidthDeltas are provided', function() {
        const aPath = new Path();
        aPath.moveTo(100, 0);
        aPath.lineTo(250, 700);
        aPath.lineTo(400, 0);
        aPath.closePath();

        const font = new Font({
            familyName: 'TestVF',
            styleName: 'Regular',
            unitsPerEm: 1000,
            ascender: 800,
            descender: -200,
            glyphs: [
                new Glyph({name: '.notdef', unicode: 0, advanceWidth: 500, path: new Path()}),
                new Glyph({name: 'A', unicode: 65, advanceWidth: 500, path: aPath})
            ]
        });

        font.variation = new VariationManager(font);

        // Add the axis with BOTH point deltas AND advanceWidth deltas
        font.variation.addAxis({
            tag: 'wght',
            name: 'Weight',
            minValue: 100,
            defaultValue: 400,
            maxValue: 900,
            deltaGenerator: (glyph) => {
                if (glyph.name === 'A') {
                    return {
                        deltas: [-20, 0, 20, 0, 0, 0, 0],
                        deltasY: [0, 0, 0, 0, 0, 0, 0],
                        advanceWidthDelta: 100  // Width should increase by 100 at max weight
                    };
                }
                if (glyph.name === '.notdef') {
                    return {
                        deltas: [0, 0, 0, 0, 0, 0, 0, 0],
                        deltasY: [0, 0, 0, 0, 0, 0, 0, 0],
                        advanceWidthDelta: 0
                    };
                }
                return null;
            }
        });

        // CRITICAL: hvar table should be auto-generated
        assert.ok(font.tables.hvar, 'hvar table should be auto-generated when advanceWidthDelta is provided');
        
        // Export and re-import
        const buffer = font.toArrayBuffer();
        const parsed = parse(buffer);

        // Verify hvar was exported
        assert.ok(parsed.tables.hvar, 'Parsed font should have hvar table');
        
        const glyphA = parsed.charToGlyph('A');
        
        // Get transformed glyph at max weight
        const defT = parsed.variation.process.getTransform(glyphA.index, {wght: 400});
        const maxT = parsed.variation.process.getTransform(glyphA.index, {wght: 900});
        
        // At default, advanceWidth should be 500
        assert.equal(defT.advanceWidth, 500, 'Default advanceWidth should be 500');
        
        // At max weight, advanceWidth should be 500 + 100 = 600
        assert.equal(maxT.advanceWidth, 600, 'Max advanceWidth should be 600 (500 + 100)');
    });
    
    // Test RobotoFlex Variable Font roundtrip
    it('should roundtrip RobotoFlex Variable Font preserving variation data', async function() {
        this.timeout(5000);  // Allow more time for this larger font
        
        const fs = await import('fs');
        const buffer = fs.readFileSync('./test/fonts/RobotoFlex-Variable.ttf');
        const font = parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
        
        // Verify font loaded correctly with variation data
        assert.ok(font.tables.fvar, 'Original font should have fvar table');
        assert.ok(font.tables.gvar, 'Original font should have gvar table');
        
        const origAxes = font.tables.fvar.axes;
        assert.ok(origAxes.length > 0, 'Original font should have axes');
        
        // Get glyph 'A' at different axis values before export
        const glyphA = font.charToGlyph('A');
        assert.ok(glyphA, 'Should find glyph A');
        
        const wghtAxis = origAxes.find(a => a.tag.trim() === 'wght');
        assert.ok(wghtAxis, 'Should have wght axis');
        
        // Export and re-import
        const outBuffer = font.toArrayBuffer();
        assert.ok(outBuffer.byteLength > 0, 'Exported buffer should have content');
        
        const parsed = parse(outBuffer);
        
        // Verify parsed font has variation data
        assert.ok(parsed.tables.fvar, 'Parsed font should have fvar table');
        assert.ok(parsed.tables.gvar, 'Parsed font should have gvar table');
        
        const parsedAxes = parsed.tables.fvar.axes;
        assert.equal(parsedAxes.length, origAxes.length, 'Should have same number of axes');
        
        // Verify axis properties are preserved
        const parsedWghtAxis = parsedAxes.find(a => a.tag.trim() === 'wght');
        assert.ok(parsedWghtAxis, 'Parsed font should have wght axis');
        assert.equal(parsedWghtAxis.minValue, wghtAxis.minValue, 'wght minValue should match');
        assert.equal(parsedWghtAxis.defaultValue, wghtAxis.defaultValue, 'wght defaultValue should match');
        assert.equal(parsedWghtAxis.maxValue, wghtAxis.maxValue, 'wght maxValue should match');
        
        // Get glyph 'A' at different axis values after roundtrip
        const parsedGlyphA = parsed.charToGlyph('A');
        assert.ok(parsedGlyphA, 'Should find glyph A in parsed font');
        
        const parsedDefaultT = parsed.variation.process.getTransform(parsedGlyphA.index, {wght: wghtAxis.defaultValue});
        const parsedMinT = parsed.variation.process.getTransform(parsedGlyphA.index, {wght: wghtAxis.minValue});
        const parsedMaxT = parsed.variation.process.getTransform(parsedGlyphA.index, {wght: wghtAxis.maxValue});
        
        // Verify parsed font has transforms with points
        assert.ok(parsedDefaultT.points, 'Parsed default transform should have points');
        assert.ok(parsedMinT.points, 'Parsed min transform should have points');
        assert.ok(parsedMaxT.points, 'Parsed max transform should have points');
        
        // Verify that min and max are actually different from default (variations work)
        // Note: Due to path→points conversion, exact coordinates may differ,
        // but the RELATIVE differences should show that variations are working
        const defaultBounds = getBounds(parsedDefaultT.points);
        const minBounds = getBounds(parsedMinT.points);
        const maxBounds = getBounds(parsedMaxT.points);
        
        // At heavier weights, glyphs typically get wider
        // So we check that bounds differ
        assert.ok(
            minBounds.width !== defaultBounds.width || maxBounds.width !== defaultBounds.width,
            'Variation should affect glyph width (min or max should differ from default)'
        );
        
        function getBounds(points) {
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            for (const p of points) {
                if (p.x < minX) minX = p.x;
                if (p.x > maxX) maxX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.y > maxY) maxY = p.y;
            }
            return { width: maxX - minX, height: maxY - minY };
        }
    });
});
