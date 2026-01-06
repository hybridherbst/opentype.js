/**
 * Font Validation Tests using fonttools
 * 
 * These tests generate fonts using the opentype.js API and validate them
 * using Python's fonttools library to ensure cross-platform compatibility.
 * 
 * Run with: node test/fonttools-validation.mjs
 */

import * as opentype from '../dist/opentype.module.js';
import { addSnapAxisToFont, PREVIEW_FONT_SIZE } from '../docs/examples/manipulation-api.js';
import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_PATH = '/usr/bin/python3';
const OUTPUT_DIR = path.join(__dirname, 'fonttools-output');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * Run a Python script and return the result
 */
function runPython(script) {
    try {
        const result = execSync(`${PYTHON_PATH} -c "${script.replace(/"/g, '\\"')}"`, {
            encoding: 'utf-8',
            maxBuffer: 10 * 1024 * 1024
        });
        return { success: true, output: result };
    } catch (e) {
        return { success: false, output: e.stderr || e.message };
    }
}

/**
 * Validate a font file with fonttools
 * Returns an array of issues found
 */
function validateWithFonttools(fontPath) {
    const script = `
import sys
import json
from fontTools.ttLib import TTFont
from io import BytesIO

font_path = '${fontPath.replace(/'/g, "\\'")}'
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
        required_name_ids = {0: 'Copyright', 1: 'Family', 2: 'Subfamily', 4: 'Full Name', 5: 'Version', 6: 'PostScript Name'}
        for nid, desc in required_name_ids.items():
            val = name.getDebugName(nid)
            if not val:
                issues.append({'severity': 'WARNING', 'test': 'name-table', 'message': f'Missing nameID {nid} ({desc})'})
    
    # Test 4: VF-specific checks
    if 'fvar' in font:
        fvar = font['fvar']
        
        # Check each axis has valid values
        for axis in fvar.axes:
            if axis.minValue > axis.defaultValue or axis.defaultValue > axis.maxValue:
                issues.append({'severity': 'ERROR', 'test': 'fvar-axes', 'message': f'Axis {axis.axisTag} has invalid min/default/max: {axis.minValue}/{axis.defaultValue}/{axis.maxValue}'})
        
        # Check instances have valid nameIDs
        for i, inst in enumerate(fvar.instances):
            name_val = name.getDebugName(inst.subfamilyNameID) if name and inst.subfamilyNameID else None
            if not name_val:
                issues.append({'severity': 'ERROR', 'test': 'fvar-instances', 'message': f'Instance {i} has invalid nameID {inst.subfamilyNameID}'})
        
        # Check for STAT table
        if 'STAT' not in font:
            issues.append({'severity': 'WARNING', 'test': 'vf-stat', 'message': 'Variable font missing STAT table'})
        else:
            stat = font['STAT']
            if not stat.table.DesignAxisRecord:
                issues.append({'severity': 'ERROR', 'test': 'vf-stat', 'message': 'STAT table missing DesignAxisRecord'})
            else:
                stat_axis_count = len(stat.table.DesignAxisRecord.Axis)
                fvar_axis_count = len(fvar.axes)
                if stat_axis_count != fvar_axis_count:
                    issues.append({'severity': 'ERROR', 'test': 'vf-stat', 'message': f'STAT has {stat_axis_count} axes but fvar has {fvar_axis_count}'})
        
        # Check for avar table
        if 'avar' not in font:
            issues.append({'severity': 'WARNING', 'test': 'vf-avar', 'message': 'Variable font missing avar table'})
        
        # Check gvar point counts match glyf
        if 'gvar' in font and 'glyf' in font:
            gvar = font['gvar']
            glyf = font['glyf']
            for gname in list(gvar.variations.keys())[:50]:
                try:
                    glyph = glyf[gname]
                    if glyph.numberOfContours > 0:
                        num_points = len(glyph.coordinates)
                        for var in gvar.variations[gname]:
                            if var.coordinates:
                                expected = num_points + 4  # +4 phantom points
                                actual = len(var.coordinates)
                                if actual != expected and actual != num_points:
                                    issues.append({'severity': 'ERROR', 'test': 'gvar-points', 'message': f'{gname}: expected {expected} coords, got {actual}'})
                except Exception as e:
                    issues.append({'severity': 'ERROR', 'test': 'gvar-points', 'message': f'{gname}: {str(e)}'})
    
    # Test 5: head table magic number
    head = font.get('head')
    if head and head.magicNumber != 0x5F0F3CF5:
        issues.append({'severity': 'ERROR', 'test': 'head-magic', 'message': f'Invalid magic number: {hex(head.magicNumber)}'})
    
    # Test 6: cmap subtable coverage
    cmap = font.get('cmap')
    if cmap:
        has_unicode_bmp = any(t.platformID == 3 and t.platEncID == 1 for t in cmap.tables)
        has_unicode_full = any(t.platformID == 3 and t.platEncID == 10 for t in cmap.tables)
        if not has_unicode_bmp and not has_unicode_full:
            issues.append({'severity': 'ERROR', 'test': 'cmap', 'message': 'Missing Windows Unicode cmap subtable'})
    
    # Test 7: OS/2 table validation
    os2 = font.get('OS/2')
    if os2:
        if os2.usWeightClass < 1 or os2.usWeightClass > 1000:
            issues.append({'severity': 'WARNING', 'test': 'os2', 'message': f'usWeightClass {os2.usWeightClass} outside normal range 1-1000'})
        if os2.usWidthClass < 1 or os2.usWidthClass > 9:
            issues.append({'severity': 'WARNING', 'test': 'os2', 'message': f'usWidthClass {os2.usWidthClass} outside range 1-9'})
    
    # Test 8: Variable font instantiation
    if 'fvar' in font:
        try:
            from fontTools.varLib import instancer
            for axis in font['fvar'].axes:
                for val in [axis.minValue, axis.defaultValue, axis.maxValue]:
                    buffer = BytesIO()
                    font.save(buffer)
                    buffer.seek(0)
                    test_font = TTFont(buffer)
                    instancer.instantiateVariableFont(test_font, {axis.axisTag: val})
        except Exception as e:
            issues.append({'severity': 'ERROR', 'test': 'vf-instantiation', 'message': str(e)})

except Exception as e:
    issues.append({'severity': 'FATAL', 'test': 'load', 'message': str(e)})

print(json.dumps(issues))
`;
    
    const result = runPython(script);
    if (!result.success) {
        return [{ severity: 'FATAL', test: 'python', message: result.output }];
    }
    
    try {
        return JSON.parse(result.output);
    } catch (e) {
        return [{ severity: 'FATAL', test: 'parse', message: `Failed to parse fonttools output: ${result.output}` }];
    }
}

/**
 * Generate a SNAP variable font from the test font
 */
function generateSnapVF() {
    console.log('\n=== Generating SNAP Variable Font ===\n');
    
    // Load the FiraSans CFF font
    const fontPath = path.join(__dirname, '../docs/fonts/FiraSansMedium.woff');
    const buffer = fs.readFileSync(fontPath);
    const font = opentype.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
    
    console.log(`Loaded: ${font.getEnglishName('fontFamily')} (${font.outlinesFormat})`);
    
    // Define snap parameters (screen-space)
    const snapParams = { strength: 0.8, distance: 50, x: 0, y: 0 };
    
    // Add SNAP axis
    console.log('Adding SNAP axis...');
    addSnapAxisToFont(font, snapParams, opentype, PREVIEW_FONT_SIZE, { minValue: 0, maxValue: 100 });
    
    // Apply sanitization
    console.log('Applying sanitization...');
    opentype.sanitizeFontForGoogleFonts(font);
    
    // Change PostScript name to avoid "duplicate font" warnings from Apple validator
    // (The user may have Fira Sans installed on their system)
    const timestamp = Date.now();
    if (font.names.windows?.postScriptName) {
        font.names.windows.postScriptName.en = `FiraSansSNAPTest${timestamp}`;
    }
    if (font.names.windows?.variationsPostScriptNamePrefix) {
        font.names.windows.variationsPostScriptNamePrefix.en = `FiraSansSNAPTest${timestamp}`;
    }
    
    // Export
    const outputPath = path.join(OUTPUT_DIR, 'FiraSans-SNAP-VF.ttf');
    const arrayBuffer = font.toArrayBuffer();
    fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
    
    console.log(`Exported: ${outputPath} (${arrayBuffer.byteLength} bytes)`);
    
    return outputPath;
}

/**
 * Generate a static (baked) font from the test font
 */
function generateStaticFont() {
    console.log('\n=== Generating Static Font ===\n');
    
    const fontPath = path.join(__dirname, '../docs/fonts/FiraSansMedium.woff');
    const buffer = fs.readFileSync(fontPath);
    const font = opentype.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
    
    console.log(`Loaded: ${font.getEnglishName('fontFamily')} (${font.outlinesFormat})`);
    
    // Apply sanitization
    opentype.sanitizeFontForExport(font);
    
    // Export
    const outputPath = path.join(OUTPUT_DIR, 'FiraSans-Static.ttf');
    const arrayBuffer = font.toArrayBuffer();
    fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
    
    console.log(`Exported: ${outputPath} (${arrayBuffer.byteLength} bytes)`);
    
    return outputPath;
}

/**
 * Test font created with FontBuilder (font-editor-api style)
 */
function generateFontBuilderFont() {
    console.log('\n=== Generating Font with FontBuilder API ===\n');
    
    // Create a simple font using the opentype API
    const notdefGlyph = new opentype.Glyph({
        name: '.notdef',
        unicode: 0,
        advanceWidth: 650,
        path: new opentype.Path()
    });
    
    const aPath = new opentype.Path();
    aPath.moveTo(100, 0);
    aPath.lineTo(300, 700);
    aPath.lineTo(500, 0);
    aPath.lineTo(400, 0);
    aPath.lineTo(350, 200);
    aPath.lineTo(250, 200);
    aPath.lineTo(200, 0);
    aPath.closePath();
    
    const aGlyph = new opentype.Glyph({
        name: 'A',
        unicode: 65,
        advanceWidth: 600,
        path: aPath
    });
    
    const bPath = new opentype.Path();
    bPath.moveTo(100, 0);
    bPath.lineTo(100, 700);
    bPath.lineTo(350, 700);
    bPath.quadraticCurveTo(500, 700, 500, 550);
    bPath.quadraticCurveTo(500, 400, 350, 400);
    bPath.lineTo(100, 400);
    bPath.moveTo(100, 400);
    bPath.lineTo(350, 400);
    bPath.quadraticCurveTo(500, 400, 500, 200);
    bPath.quadraticCurveTo(500, 0, 350, 0);
    bPath.lineTo(100, 0);
    bPath.closePath();
    
    const bGlyph = new opentype.Glyph({
        name: 'B',
        unicode: 66,
        advanceWidth: 600,
        path: bPath
    });
    
    const font = new opentype.Font({
        familyName: 'TestFont',
        styleName: 'Regular',
        unitsPerEm: 1000,
        ascender: 800,
        descender: -200,
        glyphs: [notdefGlyph, aGlyph, bGlyph]
    });
    
    console.log(`Created: ${font.getEnglishName('fontFamily')}`);
    
    // Apply sanitization
    opentype.sanitizeFontForExport(font);
    
    // Export
    const outputPath = path.join(OUTPUT_DIR, 'TestFont-FontBuilder.ttf');
    const arrayBuffer = font.toArrayBuffer();
    fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
    
    console.log(`Exported: ${outputPath} (${arrayBuffer.byteLength} bytes)`);
    
    return outputPath;
}

/**
 * Main test runner
 */
async function runTests() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║         Font Validation Tests with fonttools                 ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    
    // Check Python and fonttools are available
    const pythonCheck = runPython('from fontTools.ttLib import TTFont; print("OK")');
    if (!pythonCheck.success) {
        console.error('ERROR: fonttools not available. Install with: pip install fonttools');
        process.exit(1);
    }
    console.log('✓ fonttools available\n');
    
    const testResults = [];
    
    // Test 1: SNAP Variable Font
    try {
        const snapVFPath = generateSnapVF();
        console.log('\n--- Validating SNAP VF ---');
        const issues = validateWithFonttools(snapVFPath);
        testResults.push({ name: 'SNAP VF', path: snapVFPath, issues });
    } catch (e) {
        testResults.push({ name: 'SNAP VF', path: null, issues: [{ severity: 'FATAL', test: 'generate', message: e.message }] });
    }
    
    // Test 2: Static Font
    try {
        const staticPath = generateStaticFont();
        console.log('\n--- Validating Static Font ---');
        const issues = validateWithFonttools(staticPath);
        testResults.push({ name: 'Static Font', path: staticPath, issues });
    } catch (e) {
        testResults.push({ name: 'Static Font', path: null, issues: [{ severity: 'FATAL', test: 'generate', message: e.message }] });
    }
    
    // Test 3: FontBuilder Font
    try {
        const builderPath = generateFontBuilderFont();
        console.log('\n--- Validating FontBuilder Font ---');
        const issues = validateWithFonttools(builderPath);
        testResults.push({ name: 'FontBuilder Font', path: builderPath, issues });
    } catch (e) {
        testResults.push({ name: 'FontBuilder Font', path: null, issues: [{ severity: 'FATAL', test: 'generate', message: e.message }] });
    }
    
    // Print summary
    console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                     VALIDATION SUMMARY                        ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    
    let totalErrors = 0;
    let totalWarnings = 0;
    
    for (const result of testResults) {
        const errors = result.issues.filter(i => i.severity === 'ERROR' || i.severity === 'FATAL');
        const warnings = result.issues.filter(i => i.severity === 'WARNING');
        
        totalErrors += errors.length;
        totalWarnings += warnings.length;
        
        const status = errors.length > 0 ? '❌ FAIL' : (warnings.length > 0 ? '⚠️  WARN' : '✅ PASS');
        console.log(`${status} ${result.name}`);
        
        if (errors.length > 0) {
            console.log(`   Errors: ${errors.length}`);
            for (const issue of errors) {
                console.log(`   - [${issue.test}] ${issue.message}`);
            }
        }
        if (warnings.length > 0) {
            console.log(`   Warnings: ${warnings.length}`);
            for (const issue of warnings) {
                console.log(`   - [${issue.test}] ${issue.message}`);
            }
        }
        console.log();
    }
    
    console.log('──────────────────────────────────────────────────────────────');
    console.log(`Total: ${totalErrors} errors, ${totalWarnings} warnings`);
    console.log();
    
    if (totalErrors > 0) {
        console.log('❌ Some tests failed. See errors above.');
        process.exit(1);
    } else {
        console.log('✅ All validation tests passed!');
        process.exit(0);
    }
}

// Run tests
runTests().catch(e => {
    console.error('Test runner error:', e);
    process.exit(1);
});
