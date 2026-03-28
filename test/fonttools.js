import assert from 'assert';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import * as opentype from '../src/opentype.js';
import { addSnapAxisToFont, PREVIEW_FONT_SIZE } from '../docs/examples/manipulation-api.js';

const _require = createRequire(import.meta.url);
const wawoff2Decompress = _require('wawoff2/decompress.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Output directory for generated fonts
const OUTPUT_DIR = path.join(__dirname, 'fonttools-output');

// Check if fonttools is available
function checkFonttools() {
    try {
        execSync('/usr/bin/python3 -c "from fontTools.ttLib import TTFont"', { encoding: 'utf8', stdio: 'pipe' });
        return true;
    } catch (e) {
        return false;
    }
}

const FONTTOOLS_AVAILABLE = checkFonttools();

// Run Python fonttools validation script
function runFonttoolsValidation(fontPath) {
    const script = `
import sys
import json
from fontTools.ttLib import TTFont
from io import BytesIO

font_path = sys.argv[1]
issues = []

try:
    font = TTFont(font_path)
    
    # Test 1: Round-trip save/load
    try:
        buffer = BytesIO()
        font.save(buffer)
        buffer.seek(0)
        font2 = TTFont(buffer)
    except Exception as e:
        issues.append({'severity': 'ERROR', 'test': 'round-trip', 'message': str(e)})
    
    # Test 2: Required tables
    required_tables = ['head', 'hhea', 'maxp', 'OS/2', 'name', 'cmap', 'post']
    for table in required_tables:
        if table not in font:
            issues.append({'severity': 'ERROR', 'test': 'required-tables', 'message': f'Missing {table} table'})
    
    # Test 3: Name table entries
    name = font.get('name')
    if name:
        required_name_ids = {1: 'Family', 2: 'Subfamily', 4: 'Full Name', 5: 'Version', 6: 'PostScript Name'}
        for nid, desc in required_name_ids.items():
            val = name.getDebugName(nid)
            if not val:
                issues.append({'severity': 'ERROR', 'test': 'name-table', 'message': f'Missing nameID {nid} ({desc})'})
    
    # Test 4: Variable font specific
    if 'fvar' in font:
        fvar = font['fvar']
        if not fvar.axes:
            issues.append({'severity': 'ERROR', 'test': 'fvar', 'message': 'fvar has no axes'})
        
        # Check for required VF tables
        vf_tables = ['gvar', 'STAT']
        for table in vf_tables:
            if table not in font:
                issues.append({'severity': 'WARNING', 'test': 'vf-tables', 'message': f'Variable font missing {table} table'})
        
        # Check for HVAR (recommended for VF)
        if 'HVAR' not in font:
            issues.append({'severity': 'WARNING', 'test': 'vf-tables', 'message': 'Variable font missing HVAR table'})
    
    # Test 5: Glyph drawing
    try:
        from fontTools.pens.recordingPen import RecordingPen
        gs = font.getGlyphSet()
        for glyph_name in list(gs.keys())[:20]:
            pen = RecordingPen()
            gs[glyph_name].draw(pen)
    except Exception as e:
        issues.append({'severity': 'ERROR', 'test': 'glyph-draw', 'message': str(e)})
    
    # Test 6: maxp values
    if 'maxp' in font:
        maxp = font['maxp']
        if hasattr(maxp, 'maxPoints') and maxp.maxPoints == 0:
            has_points = False
            if 'glyf' in font:
                for glyph in font['glyf'].glyphs.values():
                    if hasattr(glyph, 'numberOfContours') and glyph.numberOfContours > 0:
                        has_points = True
                        break
            if has_points:
                issues.append({'severity': 'ERROR', 'test': 'maxp', 'message': 'maxPoints is 0 but font has glyphs with points'})

except Exception as e:
    issues.append({'severity': 'FATAL', 'test': 'load', 'message': str(e)})

print(json.dumps(issues))
`;
    
    // Write script to temp file
    const tempScript = path.join(os.tmpdir(), 'fonttools_validate.py');
    fs.writeFileSync(tempScript, script);
    
    try {
        const result = execSync(`/usr/bin/python3 "${tempScript}" "${fontPath}"`, { 
            encoding: 'utf8', 
            stdio: ['pipe', 'pipe', 'pipe'],
            maxBuffer: 10 * 1024 * 1024
        });
        return JSON.parse(result.trim());
    } catch (e) {
        return [{ severity: 'FATAL', test: 'python', message: e.message }];
    } finally {
        try { fs.unlinkSync(tempScript); } catch (e) { /* ignore */ }
    }
}

describe('fonttools validation', function() {
    this.timeout(30000); // Allow 30 seconds for font generation and validation
    
    before(function() {
        if (!FONTTOOLS_AVAILABLE) {
            this.skip();
        }
        // Ensure output directory exists
        if (!fs.existsSync(OUTPUT_DIR)) {
            fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        }
    });

    describe('Static TTF fonts', function() {
        it('should validate Fira Sans TTF export', function() {
            const fontPath = path.join(__dirname, '../docs/fonts/FiraSansMedium.woff');
            const buffer = fs.readFileSync(fontPath);
            const font = opentype.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
            
            // Apply sanitization (converts to TTF)
            opentype.sanitizeFontForExport(font);
            
            // Export
            const outputPath = path.join(OUTPUT_DIR, 'FiraSans-Static.ttf');
            const arrayBuffer = font.toArrayBuffer();
            fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
            
            // Validate
            const issues = runFonttoolsValidation(outputPath);
            const errors = issues.filter(i => i.severity === 'ERROR' || i.severity === 'FATAL');
            
            assert.strictEqual(errors.length, 0, 
                `Font has errors: ${errors.map(e => `[${e.test}] ${e.message}`).join(', ')}`);
        });
        
        it('should validate FontBuilder API font', function() {
            const notdefPath = new opentype.Path();
            notdefPath.moveTo(100, 0);
            notdefPath.lineTo(100, 700);
            notdefPath.lineTo(500, 700);
            notdefPath.lineTo(500, 0);
            notdefPath.close();
            
            const glyphs = [
                new opentype.Glyph({
                    name: '.notdef',
                    unicode: 0,
                    advanceWidth: 650,
                    path: notdefPath
                }),
                new opentype.Glyph({
                    name: 'space',
                    unicode: 32,
                    advanceWidth: 250,
                    path: new opentype.Path()
                }),
                new opentype.Glyph({
                    name: 'A',
                    unicode: 65,
                    advanceWidth: 600,
                    path: (function() {
                        const p = new opentype.Path();
                        p.moveTo(300, 700);
                        p.lineTo(50, 0);
                        p.lineTo(150, 0);
                        p.lineTo(300, 500);
                        p.lineTo(450, 0);
                        p.lineTo(550, 0);
                        p.close();
                        return p;
                    })()
                })
            ];
            
            const font = new opentype.Font({
                familyName: 'TestFont',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200,
                glyphs: glyphs
            });
            
            // Export
            const outputPath = path.join(OUTPUT_DIR, 'TestFont-FontBuilder.ttf');
            const arrayBuffer = font.toArrayBuffer();
            fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
            
            // Validate
            const issues = runFonttoolsValidation(outputPath);
            const errors = issues.filter(i => i.severity === 'ERROR' || i.severity === 'FATAL');
            
            assert.strictEqual(errors.length, 0, 
                `Font has errors: ${errors.map(e => `[${e.test}] ${e.message}`).join(', ')}`);
        });
    });

    describe('Variable TTF fonts', function() {
        it('should validate SNAP variable font export', function() {
            const fontPath = path.join(__dirname, '../docs/fonts/FiraSansMedium.woff');
            const buffer = fs.readFileSync(fontPath);
            const font = opentype.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
            
            // Add SNAP axis
            const snapParams = { strength: 0.8, distance: 50, x: 0, y: 0 };
            addSnapAxisToFont(font, snapParams, opentype, PREVIEW_FONT_SIZE, { minValue: 0, maxValue: 100 });
            
            // Apply sanitization
            opentype.sanitizeFontForGoogleFonts(font);
            
            // Use unique PostScript name
            const timestamp = Date.now();
            if (font.names.windows?.postScriptName) {
                font.names.windows.postScriptName.en = `FiraSansSNAPTest${timestamp}`;
            }
            
            // Export
            const outputPath = path.join(OUTPUT_DIR, 'FiraSans-SNAP-VF.ttf');
            const arrayBuffer = font.toArrayBuffer();
            fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
            
            // Validate
            const issues = runFonttoolsValidation(outputPath);
            const errors = issues.filter(i => i.severity === 'ERROR' || i.severity === 'FATAL');
            
            assert.strictEqual(errors.length, 0, 
                `Font has errors: ${errors.map(e => `[${e.test}] ${e.message}`).join(', ')}`);
            
            // Check VF-specific requirements
            const parsed = opentype.parse(Buffer.from(fs.readFileSync(outputPath)));
            assert.ok(parsed.tables.fvar, 'Should have fvar table');
            assert.ok(parsed.tables.gvar, 'Should have gvar table');
            assert.strictEqual(parsed.tables.fvar.axes[0].tag, 'SNAP', 'Should have SNAP axis');
        });
        
        it('should validate existing variable font (Roboto)', async function() {
            const fontPath = path.join(__dirname, 'fonts/Roboto-Regular-Variable.woff2');
            if (!fs.existsSync(fontPath)) {
                this.skip();
            }

            const compressed = fs.readFileSync(fontPath);
            const decompressed = await wawoff2Decompress(compressed);
            const font = opentype.parse(decompressed.buffer.slice(decompressed.byteOffset, decompressed.byteOffset + decompressed.length));

            // Re-export
            const outputPath = path.join(OUTPUT_DIR, 'Roboto-VF-reexport.ttf');
            const arrayBuffer = font.toArrayBuffer();
            fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
            
            // Validate
            const issues = runFonttoolsValidation(outputPath);
            const errors = issues.filter(i => i.severity === 'ERROR' || i.severity === 'FATAL');
            
            assert.strictEqual(errors.length, 0, 
                `Font has errors: ${errors.map(e => `[${e.test}] ${e.message}`).join(', ')}`);
        });
    });

    describe('OTF (CFF) fonts', function() {
        it('should validate CFF font parsing without errors', function() {
            const fontPath = path.join(__dirname, '../docs/fonts/FiraSansMedium.woff');
            const buffer = fs.readFileSync(fontPath);
            const font = opentype.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
            
            // Verify it's a CFF font
            assert.strictEqual(font.outlinesFormat, 'cff', 'Should be a CFF font');
            
            // Check essential properties
            assert.ok(font.glyphs.length > 0, 'Should have glyphs');
            assert.ok(font.unitsPerEm > 0, 'Should have unitsPerEm');
        });
        
        it('should validate CAT-Eckmann TTF font', function() {
            const fontPath = path.join(__dirname, 'fonts/CAT-Eckmann.ttf');
            if (!fs.existsSync(fontPath)) {
                this.skip();
            }

            const buffer = fs.readFileSync(fontPath);
            const font = opentype.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));

            assert.ok(font.glyphs.length > 0, 'Should have glyphs');

            // Re-export and validate
            const outputPath = path.join(OUTPUT_DIR, 'CAT-Eckmann-reexport.ttf');
            fs.writeFileSync(outputPath, Buffer.from(font.toArrayBuffer()));

            const issues = runFonttoolsValidation(outputPath);
            const errors = issues.filter(i => i.severity === 'ERROR' || i.severity === 'FATAL');
            assert.strictEqual(errors.length, 0,
                `Font has errors: ${errors.map(e => `[${e.test}] ${e.message}`).join(', ')}`);
        });
    });

    describe('Additional fonts - double roundtrip', function() {
        this.timeout(60000);

        const additionalFonts = [
            { name: 'HIKARUMONO-Regular.otf', outName: 'HIKARUMONO-Regular-reexport.ttf' },
            { name: 'SchulfibelNord-Linie2.ttf', outName: 'SchulfibelNord-Linie2-reexport.ttf' },
        ];

        for (const { name, outName } of additionalFonts) {
            it(`should double-roundtrip ${name}`, function() {
                const fontPath = path.join(__dirname, 'fonts', name);
                if (!fs.existsSync(fontPath)) { this.skip(); }

                const buffer = fs.readFileSync(fontPath);
                const font = opentype.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
                assert.ok(font.glyphs.length > 0, 'Should have glyphs');

                const outputPath = path.join(OUTPUT_DIR, outName);
                fs.writeFileSync(outputPath, Buffer.from(font.toArrayBuffer()));

                const issues = runFonttoolsValidation(outputPath);
                const errors = issues.filter(i => i.severity === 'ERROR' || i.severity === 'FATAL');
                assert.strictEqual(errors.length, 0,
                    `Font has errors: ${errors.map(e => `[${e.test}] ${e.message}`).join(', ')}`);
            });
        }

        it('should double-roundtrip all Baltic fonts', function() {
            const balticDir = path.join(__dirname, 'fonts/Baltic_Fonts');
            if (!fs.existsSync(balticDir)) { this.skip(); }

            const ttfs = fs.readdirSync(balticDir).filter(f => f.endsWith('.ttf'));
            assert.ok(ttfs.length > 0, 'Baltic_Fonts folder should contain TTF files');

            for (const name of ttfs) {
                const fontPath = path.join(balticDir, name);
                const buffer = fs.readFileSync(fontPath);
                const font = opentype.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
                assert.ok(font.glyphs.length > 0, `${name}: should have glyphs`);

                const outName = `Baltic-${name.replace(/ /g, '_')}-reexport.ttf`;
                const outputPath = path.join(OUTPUT_DIR, outName);
                fs.writeFileSync(outputPath, Buffer.from(font.toArrayBuffer()));

                const issues = runFonttoolsValidation(outputPath);
                const errors = issues.filter(i => i.severity === 'ERROR' || i.severity === 'FATAL');
                assert.strictEqual(errors.length, 0,
                    `${name} has errors: ${errors.map(e => `[${e.test}] ${e.message}`).join(', ')}`);
            }
        });
    });

    describe('Font structure validation', function() {
        it('should have correct maxp values after SNAP VF conversion (TTF)', function() {
            // The SNAP VF conversion is what creates TTF outlines
            // Check the generated SNAP VF font
            const outputPath = path.join(OUTPUT_DIR, 'FiraSans-SNAP-VF.ttf');
            if (!fs.existsSync(outputPath)) {
                this.skip();
            }
            
            const parsed = opentype.parse(Buffer.from(fs.readFileSync(outputPath)));
            
            // SNAP VF should be TTF outlines
            assert.strictEqual(parsed.outlinesFormat, 'truetype', 'Should have TrueType outlines');
            
            // Check maxp values are non-zero for a font with actual outlines
            assert.ok(parsed.tables.maxp.maxPoints > 0, `maxPoints should be > 0, got ${parsed.tables.maxp.maxPoints}`);
            assert.ok(parsed.tables.maxp.maxContours > 0, `maxContours should be > 0, got ${parsed.tables.maxp.maxContours}`);
        });
        
        it('should have correct hhea xMaxExtent after export', function() {
            const fontPath = path.join(__dirname, '../docs/fonts/FiraSansMedium.woff');
            const buffer = fs.readFileSync(fontPath);
            const font = opentype.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
            
            opentype.sanitizeFontForExport(font);
            
            const outputPath = path.join(OUTPUT_DIR, 'FiraSans-hhea-test.ttf');
            const arrayBuffer = font.toArrayBuffer();
            fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
            
            const parsed = opentype.parse(Buffer.from(fs.readFileSync(outputPath)));
            
            // xMaxExtent should be reasonable (not excessively large like the old 2793 bug)
            // For Fira Sans, it should be around 1000-1400
            assert.ok(parsed.tables.hhea.xMaxExtent < 2000, 
                `xMaxExtent (${parsed.tables.hhea.xMaxExtent}) should be < 2000`);
            assert.ok(parsed.tables.hhea.xMaxExtent > 0, 
                `xMaxExtent should be > 0`);
        });
        
        it('should have head bounds that include all glyphs', function() {
            const fontPath = path.join(__dirname, '../docs/fonts/FiraSansMedium.woff');
            const buffer = fs.readFileSync(fontPath);
            const font = opentype.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
            
            opentype.sanitizeFontForExport(font);
            
            const outputPath = path.join(OUTPUT_DIR, 'FiraSans-head-test.ttf');
            const arrayBuffer = font.toArrayBuffer();
            fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
            
            const parsed = opentype.parse(Buffer.from(fs.readFileSync(outputPath)));
            
            // Get .notdef glyph bounds
            const notdef = parsed.glyphs.get(0);
            const bbox = notdef.getBoundingBox();
            
            // head bounds should include .notdef
            assert.ok(parsed.tables.head.yMin <= bbox.y1, 
                `head.yMin (${parsed.tables.head.yMin}) should be <= .notdef yMin (${bbox.y1})`);
            assert.ok(parsed.tables.head.yMax >= bbox.y2, 
                `head.yMax (${parsed.tables.head.yMax}) should be >= .notdef yMax (${bbox.y2})`);
        });
    });
});
