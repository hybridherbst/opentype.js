declare namespace _default {
    export { parseCmapTable as parse };
    export { makeCmapTable as make };
}
export default _default;
/**
 * Format 4 cmap subtable (segment mapping to delta values, BMP only)
 */
export type CmapFormat4 = {
    /**
     * - Length in bytes of the subtable
     */
    length: number;
    /**
     * - Language code (0 for Unicode)
     */
    language: number;
    /**
     * - Number of segments
     */
    segCount: number;
    /**
     * - Map of Unicode code point to glyph index
     */
    glyphIndexMap: Record<number, number>;
};
/**
 * Format 12 cmap subtable (segmented coverage, full Unicode range)
 */
export type CmapFormat12 = {
    /**
     * - Length in bytes of the subtable
     */
    length: number;
    /**
     * - Language code (0 for Unicode)
     */
    language: number;
    /**
     * - Number of sequential map groups
     */
    groupCount: number;
    /**
     * - Map of Unicode code point to glyph index
     */
    glyphIndexMap: Record<number, number>;
};
/**
 * Parsed representation of the 'cmap' table, containing the selected subtable.
 */
export type CmapTable = {
    /**
     * - Table version (always 0)
     */
    version: number;
    /**
     * - Number of subtables in the cmap
     */
    numTables: number;
    /**
     * - Format of the selected subtable (0, 4, 12, or 13)
     */
    format: number;
    /**
     * - Length in bytes of the selected subtable
     */
    length?: number;
    /**
     * - Language code of the selected subtable
     */
    language?: number;
    /**
     * - Segment count (format 4 only)
     */
    segCount?: number;
    /**
     * - Group count (format 12/13 only)
     */
    groupCount?: number;
    /**
     * - Map of Unicode code point to glyph index
     */
    glyphIndexMap?: Record<number, number>;
    /**
     * - Format 14 variation selector records
     */
    varSelectorList?: Record<number, {
        varSelector: number;
        defaultUVS?: {
            ranges: Array<{
                startUnicodeValue: number;
                additionalCount: number;
            }>;
        };
        nonDefaultUVS?: {
            uvsMappings: Record<number, {
                unicodeValue: number;
                glyphID: number;
            }>;
        };
    }>;
};
declare function parseCmapTable(data: any, start: any): {
    version: any;
    numTables: any;
    format: any;
};
declare function makeCmapTable(glyphs: any): import("../table.js").Table;
/**
 * @typedef {object} CmapFormat4
 * Format 4 cmap subtable (segment mapping to delta values, BMP only)
 * @property {number} length - Length in bytes of the subtable
 * @property {number} language - Language code (0 for Unicode)
 * @property {number} segCount - Number of segments
 * @property {Record<number, number>} glyphIndexMap - Map of Unicode code point to glyph index
 */
/**
 * @typedef {object} CmapFormat12
 * Format 12 cmap subtable (segmented coverage, full Unicode range)
 * @property {number} length - Length in bytes of the subtable
 * @property {number} language - Language code (0 for Unicode)
 * @property {number} groupCount - Number of sequential map groups
 * @property {Record<number, number>} glyphIndexMap - Map of Unicode code point to glyph index
 */
/**
 * @typedef {object} CmapTable
 * Parsed representation of the 'cmap' table, containing the selected subtable.
 * @property {number} version - Table version (always 0)
 * @property {number} numTables - Number of subtables in the cmap
 * @property {number} format - Format of the selected subtable (0, 4, 12, or 13)
 * @property {number} [length] - Length in bytes of the selected subtable
 * @property {number} [language] - Language code of the selected subtable
 * @property {number} [segCount] - Segment count (format 4 only)
 * @property {number} [groupCount] - Group count (format 12/13 only)
 * @property {Record<number, number>} [glyphIndexMap] - Map of Unicode code point to glyph index
 * @property {Record<number, {varSelector: number, defaultUVS?: {ranges: Array<{startUnicodeValue: number, additionalCount: number}>}, nonDefaultUVS?: {uvsMappings: Record<number, {unicodeValue: number, glyphID: number}>}}>} [varSelectorList] - Format 14 variation selector records
 */
export function parseCmapTableFormat0(cmap: any, p: any, platformID: any, encodingID: any): void;
export function parseCmapTableFormat14(cmap: any, p: any): void;
//# sourceMappingURL=cmap.d.ts.map