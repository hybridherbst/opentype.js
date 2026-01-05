/**
 * Fontspector test helper - wrapper for running fontspector CLI checks on fonts
 */

import { spawnSync } from 'child_process';
import { writeFileSync, unlinkSync, existsSync, mkdtempSync, rmdirSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Run fontspector checks on a font buffer and return results
 * 
 * @param {ArrayBuffer|Buffer} fontBuffer - The font data to check
 * @param {Object} options - Options for fontspector
 * @param {string[]} [options.checks] - Specific check IDs to run (or partial matches)
 * @param {string[]} [options.excludeChecks] - Check IDs to exclude
 * @param {string} [options.profile] - Profile to use (default: 'universal')
 * @returns {Object} Parsed fontspector results
 */
export function runFontspector(fontBuffer, options = {}) {
    // Create a temporary file for the font
    const tmpDir = mkdtempSync(join(tmpdir(), 'fontspector-'));
    const tmpFontPath = join(tmpDir, 'test-font.ttf');
    const tmpJsonPath = join(tmpDir, 'results.json');
    
    try {
        // Write the font buffer to temp file
        const buffer = fontBuffer instanceof ArrayBuffer 
            ? Buffer.from(fontBuffer) 
            : fontBuffer;
        writeFileSync(tmpFontPath, buffer);
        
        // Build command arguments
        const args = [
            tmpFontPath,
            '--json', tmpJsonPath,
            '--quiet'
        ];
        
        if (options.profile) {
            args.push('--profile', options.profile);
        }
        
        if (options.checks) {
            for (const check of options.checks) {
                args.push('-c', check);
            }
        }
        
        if (options.excludeChecks) {
            for (const check of options.excludeChecks) {
                args.push('-x', check);
            }
        }
        
        // Run fontspector
        const result = spawnSync(join(process.cwd(), 'test', 'fontspector'), args, {
            encoding: 'utf8',
            timeout: 30000 // 30 second timeout
        });
        
        // Parse JSON results
        if (existsSync(tmpJsonPath)) {
            const jsonContent = readFileSync(tmpJsonPath, 'utf8');
            return JSON.parse(jsonContent);
        }
        
        // If no JSON output, return error info
        return {
            error: true,
            stderr: result.stderr,
            stdout: result.stdout,
            status: result.status
        };
    } finally {
        // Cleanup temp files
        try {
            if (existsSync(tmpFontPath)) unlinkSync(tmpFontPath);
            if (existsSync(tmpJsonPath)) unlinkSync(tmpJsonPath);
            if (existsSync(tmpDir)) rmdirSync(tmpDir);
        } catch (e) {
            // Ignore cleanup errors
        }
    }
}

/**
 * Extract all check results from fontspector output, flattening nested structure
 * 
 * @param {Object} results - Fontspector JSON results
 * @returns {Object[]} Array of check results with check_id, severity, message, etc.
 */
export function flattenResults(results) {
    const flattened = [];
    
    if (!results || !results.results) {
        return flattened;
    }
    
    for (const [filename, sections] of Object.entries(results.results)) {
        for (const [sectionName, checks] of Object.entries(sections)) {
            if (!Array.isArray(checks)) continue;
            
            for (const check of checks) {
                if (check.subresults) {
                    for (const sub of check.subresults) {
                        flattened.push({
                            filename,
                            section: sectionName,
                            check_id: check.check_id,
                            check_name: check.check_name,
                            severity: sub.severity,
                            message: sub.message,
                            code: sub.code
                        });
                    }
                } else {
                    flattened.push({
                        filename,
                        section: sectionName,
                        check_id: check.check_id,
                        check_name: check.check_name,
                        severity: check.worst_status
                    });
                }
            }
        }
    }
    
    return flattened;
}

/**
 * Get counts of each severity level
 * 
 * @param {Object} results - Fontspector JSON results
 * @returns {Object} Counts by severity: { PASS, FAIL, WARN, ERROR, SKIP, INFO }
 */
export function getSeverityCounts(results) {
    return results?.summary || { PASS: 0, FAIL: 0, WARN: 0, ERROR: 0, SKIP: 0, INFO: 0 };
}

/**
 * Check if any checks failed
 * 
 * @param {Object} results - Fontspector JSON results
 * @returns {boolean} True if any checks have FAIL severity
 */
export function hasFailures(results) {
    const counts = getSeverityCounts(results);
    return counts.FAIL > 0;
}

/**
 * Check if any checks errored
 * 
 * @param {Object} results - Fontspector JSON results
 * @returns {boolean} True if any checks have ERROR severity
 */
export function hasErrors(results) {
    const counts = getSeverityCounts(results);
    return counts.ERROR > 0;
}

/**
 * Get all checks with a specific severity
 * 
 * @param {Object} results - Fontspector JSON results
 * @param {string} severity - Severity to filter: 'PASS', 'FAIL', 'WARN', 'ERROR', 'SKIP', 'INFO'
 * @returns {Object[]} Array of check results with that severity
 */
export function getChecksBySeverity(results, severity) {
    return flattenResults(results).filter(r => r.severity === severity);
}

/**
 * Get result for a specific check ID
 * 
 * @param {Object} results - Fontspector JSON results
 * @param {string} checkId - The check ID to find (exact or partial match)
 * @returns {Object[]} Array of matching check results
 */
export function getCheckResults(results, checkId) {
    return flattenResults(results).filter(r => 
        r.check_id === checkId || r.check_id?.includes(checkId)
    );
}

/**
 * Assert that a specific check passed
 * 
 * @param {Object} results - Fontspector JSON results
 * @param {string} checkId - The check ID to verify
 * @param {Function} assert - Assertion function
 */
export function assertCheckPassed(results, checkId, assert) {
    const checks = getCheckResults(results, checkId);
    assert.ok(checks.length > 0, `Check ${checkId} should exist in results`);
    
    const failed = checks.filter(c => c.severity === 'FAIL' || c.severity === 'ERROR');
    assert.equal(
        failed.length, 
        0, 
        `Check ${checkId} should pass but got: ${failed.map(f => f.message || f.severity).join(', ')}`
    );
}

/**
 * Assert that a specific check did not fail (can be PASS, WARN, SKIP, or INFO)
 * 
 * @param {Object} results - Fontspector JSON results
 * @param {string} checkId - The check ID to verify
 * @param {Function} assert - Assertion function
 */
export function assertCheckNotFailed(results, checkId, assert) {
    const checks = getCheckResults(results, checkId);
    if (checks.length === 0) return; // Check didn't run, that's OK
    
    const failed = checks.filter(c => c.severity === 'FAIL' || c.severity === 'ERROR');
    assert.equal(
        failed.length, 
        0, 
        `Check ${checkId} should not fail but got: ${failed.map(f => f.message || f.severity).join(', ')}`
    );
}

/**
 * Assert no checks failed
 * 
 * @param {Object} results - Fontspector JSON results
 * @param {Function} assert - Assertion function
 * @param {string[]} [excludeChecks] - Check IDs to ignore failures for
 */
export function assertNoFailures(results, assert, excludeChecks = []) {
    const failed = getChecksBySeverity(results, 'FAIL')
        .filter(f => !excludeChecks.some(ex => f.check_id?.includes(ex)));
    
    assert.equal(
        failed.length, 
        0, 
        `Expected no failures but got ${failed.length}: ${failed.map(f => `${f.check_id}: ${f.message || 'failed'}`).join('; ')}`
    );
}

/**
 * Assert no errors occurred
 * 
 * @param {Object} results - Fontspector JSON results
 * @param {Function} assert - Assertion function
 */
export function assertNoErrors(results, assert) {
    const errors = getChecksBySeverity(results, 'ERROR');
    assert.equal(
        errors.length, 
        0, 
        `Expected no errors but got ${errors.length}: ${errors.map(e => `${e.check_id}: ${e.message || 'error'}`).join('; ')}`
    );
}
