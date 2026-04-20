export default Substitution;
export type GsubTable = import("./tables/gsub.js").GsubTable;
export type GsubLookupTable = import("./tables/gsub.js").GsubLookupTable;
/** @typedef {import('./tables/gsub.js').GsubTable} GsubTable */
/** @typedef {import('./tables/gsub.js').GsubLookupTable} GsubLookupTable */
/**
 * @exports opentype.Substitution
 * @class
 * @param {Record<string, unknown>} font
 * @constructor
 */
declare function Substitution(font: Record<string, unknown>): void;
declare class Substitution {
    /** @typedef {import('./tables/gsub.js').GsubTable} GsubTable */
    /** @typedef {import('./tables/gsub.js').GsubLookupTable} GsubLookupTable */
    /**
     * @exports opentype.Substitution
     * @class
     * @param {Record<string, unknown>} font
     * @constructor
     */
    constructor(font: Record<string, unknown>);
    /**
     * Create a default GSUB table.
     * @this {object}
     * @return {GsubTable} gsub - The GSUB table.
     */
    createDefaultTable(this: any): GsubTable;
    /**
     * List all single substitutions (lookup type 1) for a given script, language, and feature.
     * @param {string} [script='DFLT']
     * @param {string} [language='dflt']
     * @this {object}
     * @param {string} feature - 4-character feature name ('aalt', 'salt', 'ss01'...)
     * @return {Array} substitutions - The list of substitutions.
     */
    getSingle(this: any, feature: string, script?: string, language?: string): any[];
    /**
     * List all multiple substitutions (lookup type 2) for a given script, language, and feature.
     * @param {string} [script='DFLT']
     * @param {string} [language='dflt']
     * @this {object}
     * @param {string} feature - 4-character feature name ('ccmp', 'stch')
     * @return {Array} substitutions - The list of substitutions.
     */
    getMultiple(this: any, feature: string, script?: string, language?: string): any[];
    /**
     * List all alternates (lookup type 3) for a given script, language, and feature.
     * @param {string} [script='DFLT']
     * @param {string} [language='dflt']
     * @this {object}
     * @param {string} feature - 4-character feature name ('aalt', 'salt'...)
     * @return {Array} alternates - The list of alternates
     */
    getAlternates(this: any, feature: string, script?: string, language?: string): any[];
    /**
     * List all chaining context substitutions (lookup type 6) for a given script, language, and feature.
     * Returns an array of rules with backtrack, input, lookahead contexts and the substitutions to apply.
     * The 'sub' field contains the substitution details that reference other lookups.
     * @param {string} feature - 4-letter feature name ('calt', 'rclt', etc.)
     * @param {string} [script='DFLT']
     * @param {string} [language='dflt']
     * @this {object}
     * @return {Array} rules - Array of { backtrack: [ids], input: [ids], lookahead: [ids], lookupRecords: [{sequenceIndex, lookupListIndex}] }
     */
    getChaining(this: any, feature: string, script?: string, language?: string): any[];
    private _resolveLookupRecords;
    /**
     * List all ligatures (lookup type 4) for a given script, language, and feature.
     * The result is an array of ligature objects like { sub: [ids], by: id }
     * @param {string} feature - 4-letter feature name ('liga', 'rlig', 'dlig'...)
     * @param {string} [script='DFLT']
     * @param {string} [language='dflt']
     * @this {object}
     * @return {Array} ligatures - The list of ligatures.
     */
    getLigatures(this: any, feature: string, script?: string, language?: string): any[];
    /**
     * Add or modify a single substitution (lookup type 1)
     * Format 2, more flexible, is always used.
     * @param {string} feature - 4-letter feature name ('liga', 'rlig', 'dlig'...)
     * @this {object}
     * @param {{sub: number, by: number}} substitution - { sub: id, by: id } (format 1 is not supported)
     * @param {string} [script='DFLT']
     * @param {string} [language='dflt']
     */
    addSingle(this: any, feature: string, substitution: {
        sub: number;
        by: number;
    }, script?: string, language?: string): void;
    /**
     * Add or modify a multiple substitution (lookup type 2)
     * @param {string} feature - 4-letter feature name ('ccmp', 'stch')
     * @this {object}
     * @param {{sub: number, by: number[]}} substitution - { sub: id, by: [id] } for format 2.
     * @param {string} [script='DFLT']
     * @param {string} [language='dflt']
     */
    addMultiple(this: any, feature: string, substitution: {
        sub: number;
        by: number[];
    }, script?: string, language?: string): void;
    /**
     * Add or modify an alternate substitution (lookup type 3)
     * @param {string} feature - 4-letter feature name ('liga', 'rlig', 'dlig'...)
     * @this {object}
     * @param {{sub: number, by: number[]}} substitution - { sub: id, by: [ids] }
     * @param {string} [script='DFLT']
     * @param {string} [language='dflt']
     */
    addAlternate(this: any, feature: string, substitution: {
        sub: number;
        by: number[];
    }, script?: string, language?: string): void;
    /**
     * Add a ligature (lookup type 4)
     * Ligatures with more components must be stored ahead of those with fewer components in order to be found
     * @param {string} feature - 4-letter feature name ('liga', 'rlig', 'dlig'...)
     * @this {object}
     * @param {{sub: number[], by: number}} ligature - { sub: [ids], by: id }
     * @param {string} [script='DFLT']
     * @param {string} [language='dflt']
     */
    addLigature(this: any, feature: string, ligature: {
        sub: number[];
        by: number;
    }, script?: string, language?: string): void;
    /**
     * Add a chaining context substitution (lookup type 6, format 3)
     * This creates a rule that matches glyphs in context and applies a substitution.
     *
     * @this {object}
     * @param {string} feature - 4-letter feature name ('calt', 'rclt', etc.)
     * @param {{backtrack?: (number|number[])[], input: (number|number[])[], lookahead?: (number|number[])[], substitution?: {sequenceIndex: number, sub: number, by: number}|{sequenceIndex: number, sub: number, by: number}[], lookupRecords?: {sequenceIndex: number, lookupListIndex: number}[]}} rule - The chaining rule definition:
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
    addChaining(this: any, feature: string, rule: {
        backtrack?: (number | number[])[];
        input: (number | number[])[];
        lookahead?: (number | number[])[];
        substitution?: {
            sequenceIndex: number;
            sub: number;
            by: number;
        } | {
            sequenceIndex: number;
            sub: number;
            by: number;
        }[];
        lookupRecords?: {
            sequenceIndex: number;
            lookupListIndex: number;
        }[];
    }, script?: string, language?: string): void;
    /**
     * Add a chaining context rule using extension lookups (type 7).
     * This is the same as addChaining but wraps the lookup in an extension,
     * allowing for larger tables that exceed 16-bit offset limits.
     * Use this for rules with large coverage arrays.
     *
     * @this {object}
     * @param {string} feature - 4-letter feature name
     * @param {{backtrack?: (number|number[])[], input: (number|number[])[], lookahead?: (number|number[])[], substitution?: {sequenceIndex: number, sub: number, by: number}|{sequenceIndex: number, sub: number, by: number}[], lookupRecords?: {sequenceIndex: number, lookupListIndex: number}[]}} rule - The chaining context rule:
     *   - backtrack: Array of glyph ID arrays (glyphs that must precede input)
     *   - input: Array of glyph ID arrays (glyphs that may be substituted)
     *   - lookahead: Array of glyph ID arrays (glyphs that must follow input)
     *   - substitution: Object or array of { sequenceIndex, sub, by }
     * @param {string} [script='DFLT']
     * @param {string} [language='dflt']
     */
    addChainingExtension(this: any, feature: string, rule: {
        backtrack?: (number | number[])[];
        input: (number | number[])[];
        lookahead?: (number | number[])[];
        substitution?: {
            sequenceIndex: number;
            sub: number;
            by: number;
        } | {
            sequenceIndex: number;
            sub: number;
            by: number;
        }[];
        lookupRecords?: {
            sequenceIndex: number;
            lookupListIndex: number;
        }[];
    }, script?: string, language?: string): void;
    private _getOrCreateSingleSubLookupExtension;
    private _getOrCreateExtensionLookup;
    private _getOrCreateSingleSubLookup;
    /**
     * List all feature data for a given script and language.
     * @this {object}
     * @param {string} feature - 4-letter feature name
     * @param {string} [script='DFLT']
     * @param {string} [language='dflt']
     * @return {Array} substitutions - The list of substitutions.
     */
    getFeature(this: any, feature: string, script?: string, language?: string): any[];
    /**
     * Add a substitution to a feature for a given script and language.
     * @this {object}
     * @param {string} feature - 4-letter feature name
     * @param {Record<string, unknown>} sub - the substitution to add (an object like { sub: id or [ids], by: id or [ids] })
     *                       For chaining features (calt, rclt), use { backtrack, input, lookahead, substitution }
     * @param {string} [script='DFLT']
     * @param {string} [language='dflt']
     */
    add(this: any, feature: string, sub: Record<string, unknown>, script?: string, language?: string): any;
}
//# sourceMappingURL=substitution.d.ts.map