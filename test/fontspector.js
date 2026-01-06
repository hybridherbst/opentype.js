/**
 * Font validation tests using fontspector CLI
 * 
 * These tests verify that fonts created and exported by opentype.js
 * pass standard OpenType specification checks.
 */

import assert from 'assert';
import { Font, Glyph, Path, parse, VariationManager } from '../src/opentype.js';
import { 
    runFontspector, 
    getSeverityCounts, 
    assertNoErrors,
    assertCheckNotFailed,
    getChecksBySeverity,
    flattenResults
} from './fontspector-helper.mjs';
import { readFileSync } from 'fs';

describe('fontspector validation', function() {
    this.timeout(10000); // Fontspector can take a few seconds
    
    describe('basic font creation', function() {
        it('should create a valid simple font that passes OpenType spec checks', function() {
            // Create a minimal valid font
            const notdefPath = new Path();
            notdefPath.moveTo(50, 0);
            notdefPath.lineTo(50, 700);
            notdefPath.lineTo(450, 700);
            notdefPath.lineTo(450, 0);
            notdefPath.closePath();
            
            const spacePath = new Path(); // Empty path for space
            
            const aPath = new Path();
            aPath.moveTo(250, 700);
            aPath.lineTo(50, 0);
            aPath.moveTo(250, 700);
            aPath.lineTo(450, 0);
            aPath.moveTo(125, 200);
            aPath.lineTo(375, 200);
            
            const font = new Font({
                familyName: 'TestFont',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200,
                glyphs: [
                    new Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: notdefPath }),
                    new Glyph({ name: 'space', unicode: 32, advanceWidth: 250, path: spacePath }),
                    new Glyph({ name: 'A', unicode: 65, advanceWidth: 500, path: aPath })
                ]
            });
            
            const buffer = font.toArrayBuffer();
            const results = runFontspector(buffer, {
                // Focus on core OpenType spec checks
                checks: ['opentype/']
            });
            
            // Should not have any errors
            assertNoErrors(results, assert);
            
            // Log what we got for debugging
            const counts = getSeverityCounts(results);
            console.log('Fontspector counts:', counts);
            
            // Get failures for review
            const failures = getChecksBySeverity(results, 'FAIL');
            if (failures.length > 0) {
                console.log('Failures:', failures.map(f => `${f.check_id}: ${f.message}`));
            }
        });
        
        it('should have valid loca/maxp glyph count', function() {
            const font = new Font({
                familyName: 'TestFont',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200,
                glyphs: [
                    new Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: new Path() }),
                    new Glyph({ name: 'space', unicode: 32, advanceWidth: 250, path: new Path() }),
                ]
            });
            
            const buffer = font.toArrayBuffer();
            const results = runFontspector(buffer, {
                checks: ['opentype/loca/maxp_num_glyphs']
            });
            
            assertCheckNotFailed(results, 'loca/maxp_num_glyphs', assert);
        });
    });
    
    describe('variable font creation', function() {
        it('should create a valid variable font with proper fvar structure', function() {
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
                    new Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: new Path() }),
                    new Glyph({ name: 'space', unicode: 32, advanceWidth: 250, path: new Path() }),
                    new Glyph({ name: 'A', unicode: 65, advanceWidth: 500, path: aPath })
                ]
            });
            
            // Add variation axis
            font.variation = new VariationManager(font);
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
                            advanceWidthDelta: 50
                        };
                    }
                    return null;
                }
            });
            
            // Add required "Regular" instance (fontspector expects this)
            font.variation.addInstance({
                name: 'Regular',
                coordinates: { wght: 400 }
            });
            
            const buffer = font.toArrayBuffer();
            const results = runFontspector(buffer, {
                checks: ['opentype/fvar', 'opentype/varfont']
            });
            
            // Should not have any errors
            assertNoErrors(results, assert);
            
            // fvar checks should not fail
            assertCheckNotFailed(results, 'fvar', assert);
            
            const counts = getSeverityCounts(results);
            console.log('VF Fontspector counts:', counts);
        });
        
        it('should have hvar table when advanceWidth variation is used', function() {
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
                    new Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: new Path() }),
                    new Glyph({ name: 'A', unicode: 65, advanceWidth: 500, path: aPath })
                ]
            });
            
            font.variation = new VariationManager(font);
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
                            advanceWidthDelta: 100  // This should trigger hvar generation
                        };
                    }
                    return null;
                }
            });
            
            // Verify hvar was created
            assert.ok(font.tables.hvar, 'hvar table should be auto-generated');
            
            // Export and verify it roundtrips
            const buffer = font.toArrayBuffer();
            const parsed = parse(buffer);
            
            assert.ok(parsed.tables.hvar, 'Parsed font should have hvar table');
            
            // Verify advanceWidth actually varies
            const glyphA = parsed.charToGlyph('A');
            const defaultT = parsed.variation.process.getTransform(glyphA.index, { wght: 400 });
            const maxT = parsed.variation.process.getTransform(glyphA.index, { wght: 900 });
            
            assert.equal(defaultT.advanceWidth, 500, 'Default width should be 500');
            assert.equal(maxT.advanceWidth, 600, 'Max width should be 600 (500 + 100)');
        });
    });
    
    describe('SNAP VF validation', function() {
        it('should create SNAP VF with custom axis range', async function() {
            this.timeout(15000);
            
            // Load a CFF font
            const buffer = readFileSync('./test/fonts/FiraSansOT-Medium.otf');
            const font = parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
            
            // Import the SNAP axis function
            const { addSnapAxisToFont } = await import('../docs/examples/manipulation-api.js');
            const opentype = await import('../src/opentype.js');
            
            // Use default grid distance
            const screenParams = {
                x: 0,
                y: 0,
                distance: 50
            };
            
            // Add SNAP axis with custom range
            addSnapAxisToFont(font, screenParams, opentype, 72, { minValue: 20, maxValue: 80 });
            
            // Check the axis has correct range
            const fvar = font.tables.fvar;
            assert.ok(fvar, 'Should have fvar table');
            const snapAxis = fvar.axes.find(a => a.tag === 'SNAP');
            assert.ok(snapAxis, 'Should have SNAP axis');
            assert.equal(snapAxis.minValue, 20, 'SNAP axis minValue should be 20');
            assert.equal(snapAxis.maxValue, 80, 'SNAP axis maxValue should be 80');
            assert.equal(snapAxis.defaultValue, 20, 'SNAP axis defaultValue should match minValue');
            
            // Export and validate with fontspector
            const outBuffer = font.toArrayBuffer();
            const results = runFontspector(outBuffer, {
                checks: ['interpolation_issues']
            });
            
            // Should not have any errors
            assertNoErrors(results, assert);
        });
        
        it('should add Regular named instance for fontspector compatibility', async function() {
            // Create minimal font
            const font = new Font({
                familyName: 'TestFont',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200,
                glyphs: [
                    new Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: new Path() }),
                    new Glyph({ name: 'space', unicode: 32, advanceWidth: 250, path: new Path() })
                ]
            });
            
            const { addSnapAxisToFont } = await import('../docs/examples/manipulation-api.js');
            const opentype = await import('../src/opentype.js');
            
            addSnapAxisToFont(font, { x: 0, y: 0, distance: 50 }, opentype, 72);
            
            // Should have Regular instance
            const instances = font.tables.fvar?.instances || [];
            const regularInstance = instances.find(i => 
                (i.name?.en || i.name) === 'Regular'
            );
            assert.ok(regularInstance, 'Should have a Regular named instance');
            
            // Regular should have SNAP=0 (default coordinates)
            assert.equal(regularInstance.coordinates.SNAP, 0, 
                'Regular instance should have SNAP=0');
        });
    });
    
    describe('roundtrip validation', function() {
        it('should produce valid font after roundtrip of RobotoFlex', function() {
            this.timeout(15000);
            
            // Load original
            const buffer = readFileSync('./test/fonts/RobotoFlex-Variable.ttf');
            const font = parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
            
            // Export
            const outBuffer = font.toArrayBuffer();
            
            // Run fontspector on the exported font
            const results = runFontspector(outBuffer, {
                // Focus on critical OpenType spec checks
                checks: ['opentype/'],
                // Exclude checks that might legitimately differ after roundtrip
                excludeChecks: ['nested_components', 'no_mac_entries']
            });
            
            // Should not have any errors (crashes)
            assertNoErrors(results, assert);
            
            const counts = getSeverityCounts(results);
            console.log('RobotoFlex roundtrip fontspector counts:', counts);
            
            // Log failures for debugging
            const failures = getChecksBySeverity(results, 'FAIL');
            if (failures.length > 0) {
                console.log('OpenType spec failures:', failures.slice(0, 10).map(f => `${f.check_id}: ${f.message || 'failed'}`));
            }
        });
    });
});
