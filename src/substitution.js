// The Substitution object provides utility methods to manipulate
// the GSUB substitution table.

import check from './check.js';
import Layout from './layout.js';
import { arraysEqual } from './util.js';

/**
 * @exports opentype.Substitution
 * @class
 * @extends opentype.Layout
 * @param {opentype.Font}
 * @constructor
 */
function Substitution(font) {
    Layout.call(this, font, 'gsub');
}

// Find the first subtable of a lookup table in a particular format.
function getSubstFormat(lookupTable, format, defaultSubtable) {
    const subtables = lookupTable.subtables;
    for (let i = 0; i < subtables.length; i++) {
        const subtable = subtables[i];
        if (subtable.substFormat === format) {
            return subtable;
        }
    }
    if (defaultSubtable) {
        subtables.push(defaultSubtable);
        return defaultSubtable;
    }
    return undefined;
}

Substitution.prototype = Layout.prototype;

/**
 * Create a default GSUB table.
 * @return {Object} gsub - The GSUB table.
 */
Substitution.prototype.createDefaultTable = function() {
    // Generate a default empty GSUB table with just a DFLT script and dflt lang sys.
    return {
        version: 1,
        scripts: [{
            tag: 'DFLT',
            script: {
                defaultLangSys: { reserved: 0, reqFeatureIndex: 0xffff, featureIndexes: [] },
                langSysRecords: []
            }
        }],
        features: [],
        lookups: []
    };
};

/**
 * List all single substitutions (lookup type 1) for a given script, language, and feature.
 * @param {string} [script='DFLT']
 * @param {string} [language='dflt']
 * @param {string} feature - 4-character feature name ('aalt', 'salt', 'ss01'...)
 * @return {Array} substitutions - The list of substitutions.
 */
Substitution.prototype.getSingle = function(feature, script, language) {
    const substitutions = [];
    const lookupTables = this.getLookupTables(script, language, feature, 1);
    for (let idx = 0; idx < lookupTables.length; idx++) {
        const subtables = lookupTables[idx].subtables;
        for (let i = 0; i < subtables.length; i++) {
            const subtable = subtables[i];
            const glyphs = this.expandCoverage(subtable.coverage);
            let j;
            if (subtable.substFormat === 1) {
                const delta = subtable.deltaGlyphId;
                for (j = 0; j < glyphs.length; j++) {
                    const glyph = glyphs[j];
                    substitutions.push({ sub: glyph, by: glyph + delta });
                }
            } else {
                const substitute = subtable.substitute;
                for (j = 0; j < glyphs.length; j++) {
                    substitutions.push({ sub: glyphs[j], by: substitute[j] });
                }
            }
        }
    }
    return substitutions;
};

/**
 * List all multiple substitutions (lookup type 2) for a given script, language, and feature.
 * @param {string} [script='DFLT']
 * @param {string} [language='dflt']
 * @param {string} feature - 4-character feature name ('ccmp', 'stch')
 * @return {Array} substitutions - The list of substitutions.
 */
Substitution.prototype.getMultiple = function(feature, script, language) {
    const substitutions = [];
    const lookupTables = this.getLookupTables(script, language, feature, 2);
    for (let idx = 0; idx < lookupTables.length; idx++) {
        const subtables = lookupTables[idx].subtables;
        for (let i = 0; i < subtables.length; i++) {
            const subtable = subtables[i];
            const glyphs = this.expandCoverage(subtable.coverage);
            let j;

            for (j = 0; j < glyphs.length; j++) {
                const glyph = glyphs[j];
                const replacements = subtable.sequences[j];
                substitutions.push({ sub: glyph, by: replacements });
            }
        }
    }
    return substitutions;
};

/**
 * List all alternates (lookup type 3) for a given script, language, and feature.
 * @param {string} [script='DFLT']
 * @param {string} [language='dflt']
 * @param {string} feature - 4-character feature name ('aalt', 'salt'...)
 * @return {Array} alternates - The list of alternates
 */
Substitution.prototype.getAlternates = function(feature, script, language) {
    const alternates = [];
    const lookupTables = this.getLookupTables(script, language, feature, 3);
    for (let idx = 0; idx < lookupTables.length; idx++) {
        const subtables = lookupTables[idx].subtables;
        for (let i = 0; i < subtables.length; i++) {
            const subtable = subtables[i];
            const glyphs = this.expandCoverage(subtable.coverage);
            const alternateSets = subtable.alternateSets;
            for (let j = 0; j < glyphs.length; j++) {
                alternates.push({ sub: glyphs[j], by: alternateSets[j] });
            }
        }
    }
    return alternates;
};

/**
 * List all chaining context substitutions (lookup type 6) for a given script, language, and feature.
 * Returns an array of rules with backtrack, input, lookahead contexts and the substitutions to apply.
 * The 'sub' field contains the substitution details that reference other lookups.
 * @param {string} feature - 4-letter feature name ('calt', 'rclt', etc.)
 * @param {string} [script='DFLT']
 * @param {string} [language='dflt']
 * @return {Array} rules - Array of { backtrack: [ids], input: [ids], lookahead: [ids], lookupRecords: [{sequenceIndex, lookupListIndex}] }
 */
Substitution.prototype.getChaining = function(feature, script, language) {
    const rules = [];
    const lookupTables = this.getLookupTables(script, language, feature, 6);
    const allLookups = this.font.tables.gsub ? this.font.tables.gsub.lookups : [];
    
    for (let idx = 0; idx < lookupTables.length; idx++) {
        const subtables = lookupTables[idx].subtables;
        for (let i = 0; i < subtables.length; i++) {
            const subtable = subtables[i];
            
            if (subtable.substFormat === 1) {
                // Format 1: Simple Chaining Context - glyph-based
                const coverageGlyphs = this.expandCoverage(subtable.coverage);
                const chainRuleSets = subtable.chainRuleSets || [];
                
                for (let j = 0; j < coverageGlyphs.length; j++) {
                    const firstGlyph = coverageGlyphs[j];
                    const chainRuleSet = chainRuleSets[j];
                    if (!chainRuleSet) continue;
                    
                    for (const chainRule of chainRuleSet) {
                        // Resolve the lookups to get actual substitution info
                        const substitutions = this._resolveLookupRecords(chainRule.lookupRecords, allLookups);
                        rules.push({
                            backtrack: chainRule.backtrack.slice(),
                            input: [firstGlyph].concat(chainRule.input),
                            lookahead: chainRule.lookahead.slice(),
                            lookupRecords: chainRule.lookupRecords.slice(),
                            substitutions: substitutions
                        });
                    }
                }
            } else if (subtable.substFormat === 3) {
                // Format 3: Coverage-based Chaining Context
                const backtrack = [];
                const input = [];
                const lookahead = [];
                
                // Expand coverages to get glyph lists
                for (const cov of (subtable.backtrackCoverage || [])) {
                    backtrack.push(this.expandCoverage(cov));
                }
                for (const cov of (subtable.inputCoverage || [])) {
                    input.push(this.expandCoverage(cov));
                }
                for (const cov of (subtable.lookaheadCoverage || [])) {
                    lookahead.push(this.expandCoverage(cov));
                }
                
                // Resolve the lookups to get actual substitution info
                const substitutions = this._resolveLookupRecords(subtable.lookupRecords, allLookups);
                
                rules.push({
                    backtrack: backtrack,  // Array of arrays (coverage sets)
                    input: input,          // Array of arrays (coverage sets)
                    lookahead: lookahead,  // Array of arrays (coverage sets)
                    lookupRecords: (subtable.lookupRecords || []).slice(),
                    substitutions: substitutions
                });
            }
            // Format 2 (class-based) is more complex and less common for calt, 
            // could be added later if needed
        }
    }
    return rules;
};

/**
 * Helper to resolve lookup records to actual substitution information
 * @private
 */
Substitution.prototype._resolveLookupRecords = function(lookupRecords, allLookups) {
    const substitutions = [];
    for (const record of (lookupRecords || [])) {
        let lookup = allLookups[record.lookupListIndex];
        if (!lookup) continue;
        
        // Unwrap extension lookups (type 7) to get the actual lookup
        let actualLookupType = lookup.lookupType;
        let actualSubtables = lookup.subtables;
        if (lookup.lookupType === 7 && lookup.subtables && lookup.subtables.length > 0) {
            const extSubtable = lookup.subtables[0];
            if (extSubtable.extension) {
                actualLookupType = extSubtable.lookupType;
                actualSubtables = [extSubtable.extension];
            }
        }
        
        const subInfo = {
            sequenceIndex: record.sequenceIndex,
            lookupType: actualLookupType,
            substitutions: []
        };
        
        // Extract substitution mappings from the referenced lookup
        for (const subtable of (actualSubtables || [])) {
            if (actualLookupType === 1) {
                // Single substitution
                const glyphs = this.expandCoverage(subtable.coverage);
                if (subtable.substFormat === 1) {
                    for (const glyph of glyphs) {
                        subInfo.substitutions.push({ sub: glyph, by: glyph + subtable.deltaGlyphId });
                    }
                } else if (subtable.substFormat === 2) {
                    for (let k = 0; k < glyphs.length; k++) {
                        subInfo.substitutions.push({ sub: glyphs[k], by: subtable.substitute[k] });
                    }
                }
            } else if (actualLookupType === 4) {
                // Ligature substitution
                const glyphs = this.expandCoverage(subtable.coverage);
                for (let k = 0; k < glyphs.length; k++) {
                    const ligSet = subtable.ligatureSets[k];
                    for (const lig of (ligSet || [])) {
                        subInfo.substitutions.push({
                            sub: [glyphs[k]].concat(lig.components),
                            by: lig.ligGlyph
                        });
                    }
                }
            }
        }
        substitutions.push(subInfo);
    }
    return substitutions;
};

/**
 * List all ligatures (lookup type 4) for a given script, language, and feature.
 * The result is an array of ligature objects like { sub: [ids], by: id }
 * @param {string} feature - 4-letter feature name ('liga', 'rlig', 'dlig'...)
 * @param {string} [script='DFLT']
 * @param {string} [language='dflt']
 * @return {Array} ligatures - The list of ligatures.
 */
Substitution.prototype.getLigatures = function(feature, script, language) {
    const ligatures = [];
    const lookupTables = this.getLookupTables(script, language, feature, 4);
    for (let idx = 0; idx < lookupTables.length; idx++) {
        const subtables = lookupTables[idx].subtables;
        for (let i = 0; i < subtables.length; i++) {
            const subtable = subtables[i];
            const glyphs = this.expandCoverage(subtable.coverage);
            const ligatureSets = subtable.ligatureSets;
            for (let j = 0; j < glyphs.length; j++) {
                const startGlyph = glyphs[j];
                const ligSet = ligatureSets[j];
                for (let k = 0; k < ligSet.length; k++) {
                    const lig = ligSet[k];
                    ligatures.push({
                        sub: [startGlyph].concat(lig.components),
                        by: lig.ligGlyph
                    });
                }
            }
        }
    }
    return ligatures;
};

/**
 * Add or modify a single substitution (lookup type 1)
 * Format 2, more flexible, is always used.
 * @param {string} feature - 4-letter feature name ('liga', 'rlig', 'dlig'...)
 * @param {Object} substitution - { sub: id, by: id } (format 1 is not supported)
 * @param {string} [script='DFLT']
 * @param {string} [language='dflt']
 */
Substitution.prototype.addSingle = function(feature, substitution, script, language) {
    const lookupTable = this.getLookupTables(script, language, feature, 1, true)[0];
    const subtable = getSubstFormat(lookupTable, 2, {                // lookup type 1 subtable, format 2, coverage format 1
        substFormat: 2,
        coverage: {format: 1, glyphs: []},
        substitute: []
    });
    check.assert(subtable.coverage.format === 1, 'Single: unable to modify coverage table format ' + subtable.coverage.format);
    const coverageGlyph = substitution.sub;
    let pos = this.binSearch(subtable.coverage.glyphs, coverageGlyph);
    if (pos < 0) {
        pos = -1 - pos;
        subtable.coverage.glyphs.splice(pos, 0, coverageGlyph);
        subtable.substitute.splice(pos, 0, 0);
    }
    subtable.substitute[pos] = substitution.by;
};

/**
 * Add or modify a multiple substitution (lookup type 2)
 * @param {string} feature - 4-letter feature name ('ccmp', 'stch')
 * @param {Object} substitution - { sub: id, by: [id] } for format 2.
 * @param {string} [script='DFLT']
 * @param {string} [language='dflt']
 */
Substitution.prototype.addMultiple = function(feature, substitution, script, language) {
    check.assert(substitution.by instanceof Array && substitution.by.length > 1, 'Multiple: "by" must be an array of two or more ids');
    const lookupTable = this.getLookupTables(script, language, feature, 2, true)[0];
    const subtable = getSubstFormat(lookupTable, 1, {                // lookup type 2 subtable, format 1, coverage format 1
        substFormat: 1,
        coverage: {format: 1, glyphs: []},
        sequences: []
    });
    check.assert(subtable.coverage.format === 1, 'Multiple: unable to modify coverage table format ' + subtable.coverage.format);
    const coverageGlyph = substitution.sub;
    let pos = this.binSearch(subtable.coverage.glyphs, coverageGlyph);
    if (pos < 0) {
        pos = -1 - pos;
        subtable.coverage.glyphs.splice(pos, 0, coverageGlyph);
        subtable.sequences.splice(pos, 0, 0);
    }
    subtable.sequences[pos] = substitution.by;
};

/**
 * Add or modify an alternate substitution (lookup type 3)
 * @param {string} feature - 4-letter feature name ('liga', 'rlig', 'dlig'...)
 * @param {Object} substitution - { sub: id, by: [ids] }
 * @param {string} [script='DFLT']
 * @param {string} [language='dflt']
 */
Substitution.prototype.addAlternate = function(feature, substitution, script, language) {
    const lookupTable = this.getLookupTables(script, language, feature, 3, true)[0];
    const subtable = getSubstFormat(lookupTable, 1, {                // lookup type 3 subtable, format 1, coverage format 1
        substFormat: 1,
        coverage: {format: 1, glyphs: []},
        alternateSets: []
    });
    check.assert(subtable.coverage.format === 1, 'Alternate: unable to modify coverage table format ' + subtable.coverage.format);
    const coverageGlyph = substitution.sub;
    let pos = this.binSearch(subtable.coverage.glyphs, coverageGlyph);
    if (pos < 0) {
        pos = -1 - pos;
        subtable.coverage.glyphs.splice(pos, 0, coverageGlyph);
        subtable.alternateSets.splice(pos, 0, 0);
    }
    subtable.alternateSets[pos] = substitution.by;
};

/**
 * Add a ligature (lookup type 4)
 * Ligatures with more components must be stored ahead of those with fewer components in order to be found
 * @param {string} feature - 4-letter feature name ('liga', 'rlig', 'dlig'...)
 * @param {Object} ligature - { sub: [ids], by: id }
 * @param {string} [script='DFLT']
 * @param {string} [language='dflt']
 */
Substitution.prototype.addLigature = function(feature, ligature, script, language) {
    const lookupTable = this.getLookupTables(script, language, feature, 4, true)[0];
    let subtable = lookupTable.subtables[0];
    if (!subtable) {
        subtable = {                // lookup type 4 subtable, format 1, coverage format 1
            substFormat: 1,
            coverage: { format: 1, glyphs: [] },
            ligatureSets: []
        };
        lookupTable.subtables[0] = subtable;
    }
    check.assert(subtable.coverage.format === 1, 'Ligature: unable to modify coverage table format ' + subtable.coverage.format);
    const coverageGlyph = ligature.sub[0];
    const ligComponents = ligature.sub.slice(1);
    const ligatureTable = {
        ligGlyph: ligature.by,
        components: ligComponents
    };
    let pos = this.binSearch(subtable.coverage.glyphs, coverageGlyph);
    if (pos >= 0) {
        // ligatureSet already exists
        const ligatureSet = subtable.ligatureSets[pos];
        for (let i = 0; i < ligatureSet.length; i++) {
            // If ligature already exists, return.
            if (arraysEqual(ligatureSet[i].components, ligComponents)) {
                return;
            }
        }
        // ligature does not exist: add it.
        ligatureSet.push(ligatureTable);
    } else {
        // Create a new ligatureSet and add coverage for the first glyph.
        pos = -1 - pos;
        subtable.coverage.glyphs.splice(pos, 0, coverageGlyph);
        subtable.ligatureSets.splice(pos, 0, [ligatureTable]);
    }
};

/**
 * Add a chaining context substitution (lookup type 6, format 3)
 * This creates a rule that matches glyphs in context and applies a substitution.
 * 
 * @param {string} feature - 4-letter feature name ('calt', 'rclt', etc.)
 * @param {Object} rule - The chaining rule definition:
 *   - backtrack: Array of glyph IDs that must precede the input (in visual order, reversed internally)
 *   - input: Array of glyph IDs to match (the glyphs that may be substituted)
 *   - lookahead: Array of glyph IDs that must follow the input
 *   - substitution: Object { sequenceIndex: number, sub: glyphId, by: glyphId } or array of such objects
 *     - sequenceIndex: which input glyph to substitute (0-based)
 *     - sub: the glyph to substitute (must be in input at that index)
 *     - by: the replacement glyph
 * @param {string} [script='DFLT']
 * @param {string} [language='dflt']
 * 
 * @example
 * // Replace 'a' with 'a.end' when preceded by any letter and followed by space
 * font.substitution.addChaining('calt', {
 *   backtrack: [letterGlyphId],
 *   input: [aGlyphId],
 *   lookahead: [spaceGlyphId],
 *   substitution: { sequenceIndex: 0, sub: aGlyphId, by: aEndGlyphId }
 * });
 * 
 * // Multi-glyph input: replace 'fi' sequence contextually
 * font.substitution.addChaining('calt', {
 *   backtrack: [],
 *   input: [fGlyphId, iGlyphId],
 *   lookahead: [],
 *   substitution: [
 *     { sequenceIndex: 0, sub: fGlyphId, by: fiLigGlyphId },
 *     { sequenceIndex: 1, sub: iGlyphId, by: 0 }  // 0 could be .notdef or handle differently
 *   ]
 * });
 */
Substitution.prototype.addChaining = function(feature, rule, script, language) {
    check.assert(rule.input && rule.input.length > 0, 'Chaining: input must have at least one glyph');
    
    // Ensure GSUB table exists
    let gsub = this.font.tables.gsub;
    if (!gsub) {
        gsub = this.font.tables.gsub = this.createDefaultTable();
    }
    
    // Normalize substitution to array
    const substitutions = Array.isArray(rule.substitution) ? rule.substitution : [rule.substitution];
    
    // Step 1: Create or find a single substitution lookup for the actual replacements
    // We need a separate lookup that the chaining context will reference
    const singleSubLookupIndex = this._getOrCreateSingleSubLookup(gsub, substitutions);
    
    // Step 2: Create the chaining context lookup (type 6, format 3)
    const chainLookup = this.getLookupTables(script, language, feature, 6, true)[0];
    
    // Create a new subtable for this rule (format 3: coverage-based)
    const subtable = {
        substFormat: 3,
        backtrackCoverage: [],
        inputCoverage: [],
        lookaheadCoverage: [],
        lookupRecords: []
    };
    
    // Add backtrack coverages (stored in reverse order per OT spec)
    const backtrack = rule.backtrack || [];
    for (let i = backtrack.length - 1; i >= 0; i--) {
        const glyph = backtrack[i];
        subtable.backtrackCoverage.push({
            format: 1,
            glyphs: Array.isArray(glyph) ? glyph.slice().sort((a, b) => a - b) : [glyph]
        });
    }
    
    // Add input coverages
    for (const glyph of rule.input) {
        subtable.inputCoverage.push({
            format: 1,
            glyphs: Array.isArray(glyph) ? glyph.slice().sort((a, b) => a - b) : [glyph]
        });
    }
    
    // Add lookahead coverages
    const lookahead = rule.lookahead || [];
    for (const glyph of lookahead) {
        subtable.lookaheadCoverage.push({
            format: 1,
            glyphs: Array.isArray(glyph) ? glyph.slice().sort((a, b) => a - b) : [glyph]
        });
    }
    
    // Add lookup records - each substitution references the single sub lookup
    // Group substitutions by sequenceIndex to handle multi-glyph inputs
    const subsByIndex = new Map();
    for (const sub of substitutions) {
        if (!subsByIndex.has(sub.sequenceIndex)) {
            subsByIndex.set(sub.sequenceIndex, []);
        }
        subsByIndex.get(sub.sequenceIndex).push(sub);
    }
    
    for (const [sequenceIndex] of subsByIndex) {
        subtable.lookupRecords.push({
            sequenceIndex: sequenceIndex,
            lookupListIndex: singleSubLookupIndex
        });
    }
    
    chainLookup.subtables.push(subtable);
};

/**
 * Add a chaining context rule using extension lookups (type 7).
 * This is the same as addChaining but wraps the lookup in an extension,
 * allowing for larger tables that exceed 16-bit offset limits.
 * Use this for rules with large coverage arrays.
 * 
 * @param {string} feature - 4-letter feature name
 * @param {Object} rule - The chaining context rule:
 *   - backtrack: Array of glyph ID arrays (glyphs that must precede input)
 *   - input: Array of glyph ID arrays (glyphs that may be substituted)
 *   - lookahead: Array of glyph ID arrays (glyphs that must follow input)
 *   - substitution: Object or array of { sequenceIndex, sub, by }
 * @param {string} [script='DFLT']
 * @param {string} [language='dflt']
 */
Substitution.prototype.addChainingExtension = function(feature, rule, script, language) {
    check.assert(rule.input && rule.input.length > 0, 'Chaining: input must have at least one glyph');
    
    // Ensure GSUB table exists
    let gsub = this.font.tables.gsub;
    if (!gsub) {
        gsub = this.font.tables.gsub = this.createDefaultTable();
    }
    
    // Normalize substitution to array
    const substitutions = Array.isArray(rule.substitution) ? rule.substitution : [rule.substitution];
    
    // Step 1: Create a single substitution lookup for the actual replacements
    // This lookup also needs to be wrapped in an extension for consistency
    const singleSubLookupIndex = this._getOrCreateSingleSubLookupExtension(gsub, substitutions);
    
    // Step 2: Create the chaining context subtable (format 3: coverage-based)
    const chainSubtable = {
        substFormat: 3,
        backtrackCoverage: [],
        inputCoverage: [],
        lookaheadCoverage: [],
        lookupRecords: []
    };
    
    // Add backtrack coverages (stored in reverse order per OT spec)
    const backtrack = rule.backtrack || [];
    for (let i = backtrack.length - 1; i >= 0; i--) {
        const glyph = backtrack[i];
        chainSubtable.backtrackCoverage.push({
            format: 1,
            glyphs: Array.isArray(glyph) ? glyph.slice().sort((a, b) => a - b) : [glyph]
        });
    }
    
    // Add input coverages
    for (const glyph of rule.input) {
        chainSubtable.inputCoverage.push({
            format: 1,
            glyphs: Array.isArray(glyph) ? glyph.slice().sort((a, b) => a - b) : [glyph]
        });
    }
    
    // Add lookahead coverages
    const lookahead = rule.lookahead || [];
    for (const glyph of lookahead) {
        chainSubtable.lookaheadCoverage.push({
            format: 1,
            glyphs: Array.isArray(glyph) ? glyph.slice().sort((a, b) => a - b) : [glyph]
        });
    }
    
    // Add lookup records - each substitution references the single sub lookup
    const subsByIndex = new Map();
    for (const sub of substitutions) {
        if (!subsByIndex.has(sub.sequenceIndex)) {
            subsByIndex.set(sub.sequenceIndex, []);
        }
        subsByIndex.get(sub.sequenceIndex).push(sub);
    }
    
    for (const [sequenceIndex] of subsByIndex) {
        chainSubtable.lookupRecords.push({
            sequenceIndex: sequenceIndex,
            lookupListIndex: singleSubLookupIndex
        });
    }
    
    // Step 3: Wrap in extension subtable (will be added to extension lookup)
    const extensionSubtable = {
        substFormat: 1,
        lookupType: 6,  // Chaining Context
        extension: chainSubtable
    };
    
    // Step 4: Get or create the extension lookup for this feature
    // CRITICAL: Reuse the same lookup to preserve blocking rule semantics
    // (blocking rules only prevent matches in subsequent subtables of the SAME lookup)
    const extLookup = this._getOrCreateExtensionLookup(gsub, script, language, feature, 6);
    extLookup.subtables.push(extensionSubtable);
};

/**
 * Helper to create a single substitution lookup wrapped in extension
 * @private
 */
Substitution.prototype._getOrCreateSingleSubLookupExtension = function(gsub, substitutions) {
    // Create a new single substitution lookup wrapped in extension
    const lookupIndex = gsub.lookups.length;
    
    // Build the single substitution subtable
    const singleSubtable = {
        substFormat: 2,
        coverage: { format: 1, glyphs: [] },
        substitute: []
    };
    
    // Build the substitution mappings
    for (const sub of substitutions) {
        if (sub.sub === undefined || sub.by === undefined) continue;
        
        let pos = this.binSearch(singleSubtable.coverage.glyphs, sub.sub);
        if (pos < 0) {
            pos = -1 - pos;
            singleSubtable.coverage.glyphs.splice(pos, 0, sub.sub);
            singleSubtable.substitute.splice(pos, 0, sub.by);
        } else {
            singleSubtable.substitute[pos] = sub.by;
        }
    }
    
    // Wrap in extension
    const extensionLookup = {
        lookupType: 7,  // Extension
        lookupFlag: 0,
        subtables: [{
            substFormat: 1,
            lookupType: 1,  // Single substitution
            extension: singleSubtable
        }]
    };
    
    gsub.lookups.push(extensionLookup);
    return lookupIndex;
};

/**
 * Helper to get or create an extension lookup (type 7) for a specific feature and lookup type.
 * CRITICAL: This reuses the same lookup for the same feature/type to preserve
 * blocking rule semantics (blocking rules only work within the same lookup).
 * @private
 * @param {Object} gsub - The GSUB table
 * @param {string} script - Script tag
 * @param {string} language - Language tag  
 * @param {string} feature - Feature tag (e.g., 'calt')
 * @param {number} innerLookupType - The lookup type for the extension's inner content (e.g., 6 for chaining)
 * @returns {Object} The extension lookup to add subtables to
 */
Substitution.prototype._getOrCreateExtensionLookup = function(gsub, script, language, feature, innerLookupType) {
    // Get or create the feature table
    const featureTable = this.getFeatureTable(script, language, feature, true);
    
    // Look for an existing extension lookup for this feature with the correct inner type
    for (const lookupIndex of featureTable.lookupListIndexes) {
        const lookup = gsub.lookups[lookupIndex];
        if (lookup && lookup.lookupType === 7) {  // Extension lookup
            // Check if any subtable has the matching inner lookup type
            if (lookup.subtables && lookup.subtables.length > 0) {
                const firstSubtable = lookup.subtables[0];
                if (firstSubtable.lookupType === innerLookupType) {
                    return lookup;
                }
            }
        }
    }
    
    // No existing extension lookup found, create a new one
    const lookupIndex = gsub.lookups.length;
    const extLookup = {
        lookupType: 7,  // Extension
        lookupFlag: 0,
        subtables: []  // Subtables will be added by the caller
    };
    gsub.lookups.push(extLookup);
    
    // Add the lookup to the feature's lookupListIndexes
    featureTable.lookupListIndexes.push(lookupIndex);
    
    return extLookup;
};

/**
 * Helper to get or create a single substitution lookup for chaining context
 * @private
 */
Substitution.prototype._getOrCreateSingleSubLookup = function(gsub, substitutions) {
    // Look for an existing single sub lookup we can add to, or create a new one
    // For simplicity, we always create a new lookup to avoid conflicts
    const lookupIndex = gsub.lookups.length;
    
    const lookup = {
        lookupType: 1,  // Single substitution
        lookupFlag: 0,
        subtables: [{
            substFormat: 2,
            coverage: { format: 1, glyphs: [] },
            substitute: []
        }]
    };
    
    const subtable = lookup.subtables[0];
    
    // Build the substitution mappings
    for (const sub of substitutions) {
        if (sub.sub === undefined || sub.by === undefined) continue;
        
        let pos = this.binSearch(subtable.coverage.glyphs, sub.sub);
        if (pos < 0) {
            pos = -1 - pos;
            subtable.coverage.glyphs.splice(pos, 0, sub.sub);
            subtable.substitute.splice(pos, 0, sub.by);
        } else {
            // Update existing
            subtable.substitute[pos] = sub.by;
        }
    }
    
    gsub.lookups.push(lookup);
    return lookupIndex;
};

/**
 * List all feature data for a given script and language.
 * @param {string} feature - 4-letter feature name
 * @param {string} [script='DFLT']
 * @param {string} [language='dflt']
 * @return {Array} substitutions - The list of substitutions.
 */
Substitution.prototype.getFeature = function(feature, script, language) {
    if (/ss\d\d/.test(feature)) {
        // ss01 - ss20
        return this.getSingle(feature, script, language);
    }
    switch (feature) {
        case 'aalt':
        case 'salt':
            return this.getSingle(feature, script, language)
                .concat(this.getAlternates(feature, script, language));
        case 'dlig':
        case 'liga':
        case 'rlig':
            return this.getLigatures(feature, script, language);
        case 'ccmp':
            return this.getMultiple(feature, script, language)
                .concat(this.getLigatures(feature, script, language));
        case 'stch':
            return this.getMultiple(feature, script, language);
        case 'calt':
        case 'rclt':
            return this.getChaining(feature, script, language);
    }
    return undefined;
};

/**
 * Add a substitution to a feature for a given script and language.
 * @param {string} feature - 4-letter feature name
 * @param {Object} sub - the substitution to add (an object like { sub: id or [ids], by: id or [ids] })
 *                       For chaining features (calt, rclt), use { backtrack, input, lookahead, substitution }
 * @param {string} [script='DFLT']
 * @param {string} [language='dflt']
 */
Substitution.prototype.add = function(feature, sub, script, language) {
    if (/ss\d\d/.test(feature)) {
        // ss01 - ss20
        return this.addSingle(feature, sub, script, language);
    }
    switch (feature) {
        case 'aalt':
        case 'salt':
            if (typeof sub.by === 'number') {
                return this.addSingle(feature, sub, script, language);
            }
            return this.addAlternate(feature, sub, script, language);
        case 'dlig':
        case 'liga':
        case 'rlig':
            return this.addLigature(feature, sub, script, language);
        case 'ccmp':
            if (sub.by instanceof Array) {
                return this.addMultiple(feature, sub, script, language);
            }
            return this.addLigature(feature, sub, script, language);
        case 'calt':
        case 'rclt':
            return this.addChaining(feature, sub, script, language);
    }
    return undefined;
};

export default Substitution;
