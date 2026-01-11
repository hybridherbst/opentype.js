/**
 * Performance tests for font-editor import functionality
 * Run with: node test/font-editor-perf.mjs
 */

import { readFileSync } from 'fs';
import * as opentype from '../src/opentype.js';

const ROBOTO_FLEX_PATH = './test/fonts/RobotoFlex-Variable.ttf';

// Helper to measure time
function measure(name, fn) {
    const start = performance.now();
    const result = fn();
    const end = performance.now();
    console.log(`${name}: ${(end - start).toFixed(2)}ms`);
    return { result, time: end - start };
}

async function measureAsync(name, fn) {
    const start = performance.now();
    const result = await fn();
    const end = performance.now();
    console.log(`${name}: ${(end - start).toFixed(2)}ms`);
    return { result, time: end - start };
}

// Extract glyph points into contour format (matching font-editor.html)
function extractGlyphPoints(glyphPoints) {
    const contours = [];
    let currentContour = [];
    
    for (const pt of glyphPoints) {
        currentContour.push({
            x: Math.round(pt.x),
            y: Math.round(pt.y),
            onCurve: pt.onCurve !== false
        });
        
        if (pt.lastPointOfContour) {
            contours.push(currentContour);
            currentContour = [];
        }
    }
    
    if (currentContour.length > 0) {
        contours.push(currentContour);
    }
    
    return contours;
}

// Extract transformed points (for VF masters)
function extractTransformedPoints(transformPoints) {
    const contours = [];
    let currentContour = [];
    
    for (const pt of transformPoints) {
        currentContour.push({
            x: Math.round(pt.x),
            y: Math.round(pt.y),
            onCurve: pt.onCurve !== false
        });
        
        if (pt.lastPointOfContour) {
            contours.push(currentContour);
            currentContour = [];
        }
    }
    
    if (currentContour.length > 0) {
        contours.push(currentContour);
    }
    
    return contours;
}

// ============ TEST: Basic Font Parsing ============
function testFontParsing() {
    console.log('\n=== TEST: Font Parsing ===');
    const buffer = readFileSync(ROBOTO_FLEX_PATH);
    
    const { result: font, time } = measure('Parse font', () => {
        return opentype.parse(buffer.buffer);
    });
    
    console.log(`  Glyphs: ${font.glyphs.length}`);
    console.log(`  unitsPerEm: ${font.unitsPerEm}`);
    console.log(`  Axes: ${font.tables.fvar?.axes?.length || 0}`);
    
    if (time > 200) {
        console.log('  ⚠️ Font parsing is slow (>200ms)');
    } else {
        console.log('  ✅ Font parsing is fast');
    }
    
    return font;
}

// ============ TEST: Glyph Import (lowercase a-z) ============
function testGlyphImportSubset(font) {
    console.log('\n=== TEST: Import lowercase a-z ===');
    
    const glyphs = {};
    const glyphWidths = {};
    const charCodes = [];
    for (let i = 97; i <= 122; i++) charCodes.push(i);
    
    const { time } = measure('Import 26 glyphs', () => {
        for (const code of charCodes) {
            const char = String.fromCharCode(code);
            const glyph = font.charToGlyph(char);
            if (!glyph || glyph.index === 0) continue;
            
            if (glyph.points && glyph.points.length > 0) {
                glyphs[char] = extractGlyphPoints(glyph.points);
                glyphWidths[char] = Math.round(glyph.advanceWidth);
            }
        }
    });
    
    console.log(`  Imported: ${Object.keys(glyphs).length} glyphs`);
    
    if (time > 50) {
        console.log('  ⚠️ Glyph import is slow (>50ms)');
    } else {
        console.log('  ✅ Glyph import is fast');
    }
    
    return { glyphs, glyphWidths };
}

// ============ TEST: Full Font Glyph Import ============
function testGlyphImportFull(font) {
    console.log('\n=== TEST: Import all glyphs (unicode + named) ===');
    
    const glyphs = {};
    const glyphWidths = {};
    const glyphIndices = new Set();
    
    const { time } = measure('Import all glyphs', () => {
        for (let i = 0; i < font.glyphs.length; i++) {
            const glyph = font.glyphs.get(i);
            if (!glyph) continue;
            
            // Determine key same way as font-editor.html
            let key;
            if (glyph.unicodes && glyph.unicodes.length > 0) {
                key = String.fromCharCode(glyph.unicodes[0]);
            } else if (glyph.name) {
                key = '_' + glyph.name;
            } else {
                continue; // Skip glyphs with no identifier
            }
            
            glyphIndices.add(i);
            
            if (glyph.points && glyph.points.length > 0) {
                glyphs[key] = extractGlyphPoints(glyph.points);
                glyphWidths[key] = Math.round(glyph.advanceWidth);
            }
        }
    });
    
    const unicodeCount = Object.keys(glyphs).filter(k => !k.startsWith('_')).length;
    const namedCount = Object.keys(glyphs).filter(k => k.startsWith('_')).length;
    
    console.log(`  Imported: ${Object.keys(glyphs).length} glyphs (${unicodeCount} unicode, ${namedCount} named)`);
    
    if (time > 100) {
        console.log('  ⚠️ Full glyph import is slow (>100ms)');
    } else {
        console.log('  ✅ Full glyph import is fast');
    }
    
    return { glyphs, glyphWidths, glyphIndices };
}

// ============ TEST: VF Master Extraction (BOTTLENECK) ============
function testVFMasterExtraction(font, glyphIndices) {
    console.log('\n=== TEST: VF Master Extraction ===');
    
    if (!font.tables.fvar || !font.variation) {
        console.log('  Skipping - not a variable font');
        return;
    }
    
    const axes = font.tables.fvar.axes;
    console.log(`  Axes: ${axes.length}`);
    console.log(`  Glyphs to process: ${glyphIndices.size}`);
    console.log(`  Expected getTransform calls: ${glyphIndices.size * axes.length * 2}`);
    
    // Test single axis, single glyph
    const testGlyphIdx = Array.from(glyphIndices)[0];
    const testAxis = axes[0];
    
    const { time: singleTime } = measure('Single getTransform call', () => {
        const coords = { [testAxis.tag]: testAxis.minValue };
        font.variation.getTransform(testGlyphIdx, coords);
    });
    
    console.log(`  Estimated total time: ${(singleTime * glyphIndices.size * axes.length * 2 / 1000).toFixed(1)}s`);
    
    // Test one axis min/max for all glyphs
    const { time: oneAxisTime } = measure(`One axis (${testAxis.tag}) min+max for all glyphs`, () => {
        for (const idx of glyphIndices) {
            const glyph = font.glyphs.get(idx);
            if (glyph && glyph.points && glyph.points.length > 0) {
                // Min
                const minCoords = { [testAxis.tag]: testAxis.minValue };
                const minTransform = font.variation.getTransform(idx, minCoords);
                if (minTransform && minTransform.points) {
                    extractTransformedPoints(minTransform.points);
                }
                // Max
                const maxCoords = { [testAxis.tag]: testAxis.maxValue };
                const maxTransform = font.variation.getTransform(idx, maxCoords);
                if (maxTransform && maxTransform.points) {
                    extractTransformedPoints(maxTransform.points);
                }
            }
        }
    });
    
    console.log(`  Estimated full VF import: ${(oneAxisTime * axes.length / 1000).toFixed(1)}s`);
    
    if (oneAxisTime > 5000) {
        console.log('  ❌ VF extraction is VERY slow - major bottleneck');
    } else if (oneAxisTime > 1000) {
        console.log('  ⚠️ VF extraction is slow (>1s per axis)');
    } else {
        console.log('  ✅ VF extraction is acceptable');
    }
}

// ============ TEST: Ligature Import ============
function testLigatureImport(font, importedGlyphs) {
    console.log('\n=== TEST: Ligature Import ===');
    
    if (!font.tables.gsub) {
        console.log('  No GSUB table');
        return { ligatures: [], issues: [] };
    }
    
    const ligatures = [];
    const issues = [];
    const gsub = font.tables.gsub;
    
    for (const lookup of (gsub.lookups || [])) {
        if (lookup.lookupType !== 4) continue; // Ligature substitution
        
        for (const subtable of (lookup.subtables || [])) {
            if (!subtable.ligatureSets || !subtable.coverage) continue;
            const coverageGlyphs = subtable.coverage.glyphs || [];
            
            for (const [posStr, ligSet] of Object.entries(subtable.ligatureSets)) {
                const pos = parseInt(posStr);
                const firstGlyphIdx = coverageGlyphs[pos];
                if (firstGlyphIdx === undefined) continue;
                
                const firstGlyph = font.glyphs.get(firstGlyphIdx);
                const firstChar = firstGlyph?.unicodes?.[0] 
                    ? String.fromCharCode(firstGlyph.unicodes[0]) 
                    : null;
                
                if (!firstChar) continue;
                
                for (const lig of ligSet) {
                    const sequence = [firstChar];
                    let valid = true;
                    
                    for (const compIdx of lig.components) {
                        const compGlyph = font.glyphs.get(compIdx);
                        const compChar = compGlyph?.unicodes?.[0]
                            ? String.fromCharCode(compGlyph.unicodes[0])
                            : null;
                        if (compChar) {
                            sequence.push(compChar);
                        } else {
                            valid = false;
                            break;
                        }
                    }
                    
                    if (valid && sequence.length >= 2) {
                        const ligGlyph = font.glyphs.get(lig.ligGlyph);
                        const sequenceStr = sequence.join('');
                        
                        // Compute the result key the same way glyphs are stored:
                        // - Unicode glyphs use the character as key
                        // - Non-unicode glyphs use '_' + name as key
                        let ligKey;
                        if (ligGlyph?.unicodes && ligGlyph.unicodes.length > 0) {
                            ligKey = String.fromCharCode(ligGlyph.unicodes[0]);
                        } else if (ligGlyph?.name) {
                            ligKey = '_' + ligGlyph.name;
                        } else {
                            ligKey = null;
                        }
                        
                        const glyphFound = ligKey && importedGlyphs[ligKey];
                        
                        ligatures.push({
                            sequence: sequenceStr,
                            resultName: ligGlyph?.name,
                            ligKey,
                            glyphFound: !!glyphFound
                        });
                        
                        if (!glyphFound) {
                            issues.push(`Ligature ${sequenceStr} -> ${ligGlyph?.name}: glyph NOT found (key: ${ligKey})`);
                        }
                    }
                }
            }
        }
    }
    
    console.log(`  Found ${ligatures.length} ligatures`);
    console.log(`  Glyphs found: ${ligatures.filter(l => l.glyphFound).length}`);
    console.log(`  Glyphs NOT found: ${ligatures.filter(l => !l.glyphFound).length}`);
    
    if (issues.length > 0) {
        console.log('  ❌ Ligature mapping issues:');
        issues.forEach(i => console.log(`    - ${i}`));
    } else {
        console.log('  ✅ All ligature glyphs found');
    }
    
    return { ligatures, issues };
}

// ============ MAIN ============
async function main() {
    console.log('Font Editor Performance Tests');
    console.log('==============================');
    
    try {
        const font = testFontParsing();
        
        // Test subset import
        const { glyphs: subsetGlyphs } = testGlyphImportSubset(font);
        
        // Test full import
        const { glyphs: fullGlyphs, glyphIndices } = testGlyphImportFull(font);
        
        // Test VF master extraction (the bottleneck)
        testVFMasterExtraction(font, glyphIndices);
        
        // Test ligature import
        testLigatureImport(font, fullGlyphs);
        
        console.log('\n=== SUMMARY ===');
        console.log('Main bottleneck: VF master extraction (getTransform calls)');
        console.log('Solution options:');
        console.log('  1. Only extract masters on-demand, not upfront');
        console.log('  2. Limit to fewer axes (e.g., wght only)');
        console.log('  3. Use worker threads for parallel extraction');
        console.log('  4. Cache/optimize getTransform in opentype.js');
        
    } catch (err) {
        console.error('Test failed:', err);
        process.exit(1);
    }
}

main();
