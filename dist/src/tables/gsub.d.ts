declare namespace _default {
    export { parseGsubTable as parse };
    export { makeGsubTable as make };
}
export default _default;
/**
 * A lookup record referencing another lookup to apply at a sequence position.
 */
export type GsubLookupRecord = {
    /**
     * - index into the input sequence
     */
    sequenceIndex: number;
    /**
     * - index into the lookup list
     */
    lookupListIndex: number;
};
/**
 * A single GSUB substitution subtable. Properties vary by lookup type and substFormat.
 * All subtables share `substFormat`; other properties are type-specific.
 */
export type GsubSubtable = {
    /**
     * - substitution format (1 or 2 for most lookup types)
     */
    substFormat: number;
    /**
     * - coverage table (format 1 or 2)
     */
    coverage?: object;
    /**
     * - (type 1 fmt 1) delta added to glyph index
     */
    deltaGlyphId?: number;
    /**
     * - (type 1 fmt 2) list of substitute glyph ids
     */
    substitute?: number[];
    /**
     * - (type 2) per-coverage-index sequences of glyph ids
     */
    sequences?: number[][];
    /**
     * - (type 3) per-coverage-index alternate glyph sets
     */
    alternateSets?: number[][];
    /**
     * - (type 4) ligature sets per coverage index
     */
    ligatureSets?: Array<Array<{
        ligGlyph: number;
        components: number[];
    }>>;
    /**
     * - (type 5 fmt 1) sequence rule sets
     */
    ruleSets?: Array<Array<{
        input: number[];
        lookupRecords: GsubLookupRecord[];
    }>>;
    /**
     * - (type 5 fmt 2) class definition table
     */
    classDef?: object;
    /**
     * - (type 5 fmt 2) class sets
     */
    classSets?: Array<Array<{
        classes: number[];
        lookupRecords: GsubLookupRecord[];
    }>>;
    /**
     * - (type 5 fmt 3 / type 6 fmt 3) list of coverage tables
     */
    coverages?: object[];
    /**
     * - (type 5 fmt 3 / type 6 fmt 3) lookup records
     */
    lookupRecords?: GsubLookupRecord[];
    /**
     * - (type 6 fmt 1)
     */
    chainRuleSets?: Array<Array<{
        backtrack: number[];
        input: number[];
        lookahead: number[];
        lookupRecords: GsubLookupRecord[];
    }>>;
    /**
     * - (type 6 fmt 2) backtrack class definition
     */
    backtrackClassDef?: object;
    /**
     * - (type 6 fmt 2) input class definition
     */
    inputClassDef?: object;
    /**
     * - (type 6 fmt 2) lookahead class definition
     */
    lookaheadClassDef?: object;
    /**
     * - (type 6 fmt 2)
     */
    chainClassSet?: Array<Array<{
        backtrack: number[];
        input: number[];
        lookahead: number[];
        lookupRecords: GsubLookupRecord[];
    }>>;
    /**
     * - (type 6 fmt 3 / type 8) backtrack coverage tables
     */
    backtrackCoverage?: object[];
    /**
     * - (type 6 fmt 3) input coverage tables
     */
    inputCoverage?: object[];
    /**
     * - (type 6 fmt 3 / type 8) lookahead coverage tables
     */
    lookaheadCoverage?: object[];
    /**
     * - (type 8) reverse chain single substitution glyph ids
     */
    substitutes?: number[];
    /**
     * - (type 7) extension: actual lookup type wrapped
     */
    lookupType?: number;
    /**
     * - (type 7) extension: inner subtable
     */
    extension?: GsubSubtable;
    /**
     * - error message if parsing failed
     */
    error?: string;
};
/**
 * A single GSUB lookup table.
 */
export type GsubLookupTable = {
    /**
     * - lookup type (1–8)
     */
    lookupType: number;
    /**
     * - lookup flags bitmask
     */
    lookupFlag: number;
    /**
     * - list of subtables
     */
    subtables: GsubSubtable[];
    /**
     * - index into MarkGlyphSetsTable (when UseMarkFilteringSet flag is set)
     */
    markFilteringSet?: number;
};
/**
 * A LangSys table entry.
 */
export type LangSysTable = {
    /**
     * - reserved field (always 0)
     */
    reserved: number;
    /**
     * - required feature index (0xFFFF = none)
     */
    reqFeatureIndex: number;
    /**
     * - indices into the feature list
     */
    featureIndexes: number[];
};
/**
 * A script record containing the default LangSys and any language-specific LangSys tables.
 */
export type ScriptTable = {
    /**
     * - default language system table
     */
    defaultLangSys: LangSysTable;
    /**
     * - language-specific records
     */
    langSysRecords: Array<{
        tag: string;
        langSys: LangSysTable;
    }>;
};
/**
 * A feature record: tag + feature table.
 */
export type FeatureRecord = {
    /**
     * - 4-character feature tag
     */
    tag: string;
    /**
     * - feature table
     */
    feature: {
        featureParams: number;
        lookupListIndexes: number[];
    };
};
/**
 * A script list entry (tag + script table).
 */
export type ScriptRecord = {
    /**
     * - 4-character script tag
     */
    tag: string;
    /**
     * - script table
     */
    script: ScriptTable;
};
/**
 * The top-level parsed GSUB table.
 */
export type GsubTable = {
    /**
     * - table version (1 or 1.1)
     */
    version: number;
    /**
     * - script list
     */
    scripts: ScriptRecord[];
    /**
     * - feature list
     */
    features: FeatureRecord[];
    /**
     * - lookup list
     */
    lookups: GsubLookupTable[];
    /**
     * - (version 1.1) feature variations list
     */
    variations?: object[];
};
/**
 * A lookup record referencing another lookup to apply at a sequence position.
 * @typedef {object} GsubLookupRecord
 * @property {number} sequenceIndex - index into the input sequence
 * @property {number} lookupListIndex - index into the lookup list
 */
/**
 * A single GSUB substitution subtable. Properties vary by lookup type and substFormat.
 * All subtables share `substFormat`; other properties are type-specific.
 * @typedef {object} GsubSubtable
 * @property {number} substFormat - substitution format (1 or 2 for most lookup types)
 * @property {object} [coverage] - coverage table (format 1 or 2)
 * @property {number} [deltaGlyphId] - (type 1 fmt 1) delta added to glyph index
 * @property {number[]} [substitute] - (type 1 fmt 2) list of substitute glyph ids
 * @property {number[][]} [sequences] - (type 2) per-coverage-index sequences of glyph ids
 * @property {number[][]} [alternateSets] - (type 3) per-coverage-index alternate glyph sets
 * @property {Array<Array<{ligGlyph: number, components: number[]}>>} [ligatureSets] - (type 4) ligature sets per coverage index
 * @property {Array<Array<{input: number[], lookupRecords: GsubLookupRecord[]}>>} [ruleSets] - (type 5 fmt 1) sequence rule sets
 * @property {object} [classDef] - (type 5 fmt 2) class definition table
 * @property {Array<Array<{classes: number[], lookupRecords: GsubLookupRecord[]}>>} [classSets] - (type 5 fmt 2) class sets
 * @property {object[]} [coverages] - (type 5 fmt 3 / type 6 fmt 3) list of coverage tables
 * @property {GsubLookupRecord[]} [lookupRecords] - (type 5 fmt 3 / type 6 fmt 3) lookup records
 * @property {Array<Array<{backtrack: number[], input: number[], lookahead: number[], lookupRecords: GsubLookupRecord[]}>>} [chainRuleSets] - (type 6 fmt 1)
 * @property {object} [backtrackClassDef] - (type 6 fmt 2) backtrack class definition
 * @property {object} [inputClassDef] - (type 6 fmt 2) input class definition
 * @property {object} [lookaheadClassDef] - (type 6 fmt 2) lookahead class definition
 * @property {Array<Array<{backtrack: number[], input: number[], lookahead: number[], lookupRecords: GsubLookupRecord[]}>>} [chainClassSet] - (type 6 fmt 2)
 * @property {object[]} [backtrackCoverage] - (type 6 fmt 3 / type 8) backtrack coverage tables
 * @property {object[]} [inputCoverage] - (type 6 fmt 3) input coverage tables
 * @property {object[]} [lookaheadCoverage] - (type 6 fmt 3 / type 8) lookahead coverage tables
 * @property {number[]} [substitutes] - (type 8) reverse chain single substitution glyph ids
 * @property {number} [lookupType] - (type 7) extension: actual lookup type wrapped
 * @property {GsubSubtable} [extension] - (type 7) extension: inner subtable
 * @property {string} [error] - error message if parsing failed
 */
/**
 * A single GSUB lookup table.
 * @typedef {object} GsubLookupTable
 * @property {number} lookupType - lookup type (1–8)
 * @property {number} lookupFlag - lookup flags bitmask
 * @property {GsubSubtable[]} subtables - list of subtables
 * @property {number} [markFilteringSet] - index into MarkGlyphSetsTable (when UseMarkFilteringSet flag is set)
 */
/**
 * A LangSys table entry.
 * @typedef {object} LangSysTable
 * @property {number} reserved - reserved field (always 0)
 * @property {number} reqFeatureIndex - required feature index (0xFFFF = none)
 * @property {number[]} featureIndexes - indices into the feature list
 */
/**
 * A script record containing the default LangSys and any language-specific LangSys tables.
 * @typedef {object} ScriptTable
 * @property {LangSysTable} defaultLangSys - default language system table
 * @property {Array<{tag: string, langSys: LangSysTable}>} langSysRecords - language-specific records
 */
/**
 * A feature record: tag + feature table.
 * @typedef {object} FeatureRecord
 * @property {string} tag - 4-character feature tag
 * @property {{featureParams: number, lookupListIndexes: number[]}} feature - feature table
 */
/**
 * A script list entry (tag + script table).
 * @typedef {object} ScriptRecord
 * @property {string} tag - 4-character script tag
 * @property {ScriptTable} script - script table
 */
/**
 * The top-level parsed GSUB table.
 * @typedef {object} GsubTable
 * @property {number} version - table version (1 or 1.1)
 * @property {ScriptRecord[]} scripts - script list
 * @property {FeatureRecord[]} features - feature list
 * @property {GsubLookupTable[]} lookups - lookup list
 * @property {object[]} [variations] - (version 1.1) feature variations list
 */
/**
 * @param {DataView} data
 * @param {number} [start]
 * @returns {GsubTable}
 */
declare function parseGsubTable(data: DataView, start?: number): GsubTable;
/**
 * @param {GsubTable} gsub
 * @returns {object}
 */
declare function makeGsubTable(gsub: GsubTable): object;
//# sourceMappingURL=gsub.d.ts.map