export default Layout;
export type GsubTable = import("./tables/gsub.js").GsubTable;
export type GsubLookupTable = import("./tables/gsub.js").GsubLookupTable;
export type ScriptRecord = import("./tables/gsub.js").ScriptRecord;
export type ScriptTable = import("./tables/gsub.js").ScriptTable;
export type LangSysTable = import("./tables/gsub.js").LangSysTable;
export type FeatureRecord = import("./tables/gsub.js").FeatureRecord;
export type GposTable = import("./tables/gpos.js").GposTable;
export type GposLookupTable = import("./tables/gpos.js").GposLookupTable;
/**
 * A parsed OpenType ClassDef table.
 */
export type ClassDefTable = {
    /**
     * - 1 (array) or 2 (ranges)
     */
    format: number;
    /**
     * - (format 1) first glyph covered
     */
    startGlyph?: number;
    /**
     * - (format 1) class value per glyph
     */
    classes?: number[];
    /**
     * - (format 2) class ranges
     */
    ranges?: Array<{
        start: number;
        end: number;
        classId: number;
    }>;
};
/**
 * @exports opentype.Layout
 * @class
 */
declare function Layout(font: any, tableName: any): void;
declare class Layout {
    /**
     * @exports opentype.Layout
     * @class
     */
    constructor(font: any, tableName: any);
    font: any;
    tableName: any;
    searchTag: typeof searchTag;
    binSearch: typeof binSearch;
    getTable: (create?: boolean) => GsubTable | GposTable | undefined;
    getScriptNames: () => any[];
    getDefaultScriptName: () => "DFLT" | "latn";
    getScriptTable: (script?: string, create?: boolean) => ScriptTable | undefined;
    getLangSysTable: (script?: string, language?: string, create?: boolean) => LangSysTable | undefined;
    getFeatureTable: (script?: string, language?: string, feature?: string, create?: boolean) => {
        featureParams: number;
        lookupListIndexes: number[];
    } | undefined;
    getLookupTables: (script?: string, language?: string, feature?: string, lookupType?: number, create?: boolean) => GsubLookupTable[] | GposLookupTable[];
    getGlyphClass: (classDefTable: ClassDefTable, glyphIndex: number) => number;
    getCoverageIndex: (coverageTable: object, glyphIndex: number) => number;
    expandCoverage: (coverageTable: {
        format: number;
        glyphs?: number[];
        ranges?: Array<{
            start: number;
            end: number;
        }>;
    }) => number[];
}
/**
 * @typedef {import('./tables/gsub.js').GsubTable} GsubTable
 * @typedef {import('./tables/gsub.js').GsubLookupTable} GsubLookupTable
 * @typedef {import('./tables/gsub.js').ScriptRecord} ScriptRecord
 * @typedef {import('./tables/gsub.js').ScriptTable} ScriptTable
 * @typedef {import('./tables/gsub.js').LangSysTable} LangSysTable
 * @typedef {import('./tables/gsub.js').FeatureRecord} FeatureRecord
 * @typedef {import('./tables/gpos.js').GposTable} GposTable
 * @typedef {import('./tables/gpos.js').GposLookupTable} GposLookupTable
 */
/**
 * A parsed OpenType ClassDef table.
 * @typedef {object} ClassDefTable
 * @property {number} format - 1 (array) or 2 (ranges)
 * @property {number} [startGlyph] - (format 1) first glyph covered
 * @property {number[]} [classes] - (format 1) class value per glyph
 * @property {Array<{start: number, end: number, classId: number}>} [ranges] - (format 2) class ranges
 */
declare function searchTag(arr: any, tag: any): number;
declare function binSearch(arr: any, value: any): number;
//# sourceMappingURL=layout.d.ts.map