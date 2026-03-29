declare namespace _default {
    export { parseHeadTable as parse };
    export { makeHeadTable as make };
}
export default _default;
export type HeadTable = {
    /**
     * - Table version number (Fixed 16.16)
     */
    version: number;
    /**
     * - Set by font manufacturer (Fixed 16.16)
     */
    fontRevision: number;
    /**
     * - To compute: set to 0, sum the entire font as ULong, then store 0xB1B0AFBA - sum
     */
    checkSumAdjustment: number;
    /**
     * - Set to 0x5F0F3CF5
     */
    magicNumber: number;
    /**
     * - Bit flag field
     */
    flags: number;
    /**
     * - Valid range is from 16 to 16384
     */
    unitsPerEm: number;
    /**
     * - Number of seconds since 12:00 midnight that started January 1st 1904
     */
    created: number;
    /**
     * - Number of seconds since 12:00 midnight that started January 1st 1904
     */
    modified: number;
    /**
     * - For all glyph bounding boxes
     */
    xMin: number;
    /**
     * - For all glyph bounding boxes
     */
    yMin: number;
    /**
     * - For all glyph bounding boxes
     */
    xMax: number;
    /**
     * - For all glyph bounding boxes
     */
    yMax: number;
    /**
     * - Bit field for style flags (bold, italic, etc.)
     */
    macStyle: number;
    /**
     * - Smallest readable size in pixels
     */
    lowestRecPPEM: number;
    /**
     * - Deprecated, set to 2
     */
    fontDirectionHint: number;
    /**
     * - 0 for short offsets, 1 for long
     */
    indexToLocFormat: number;
    /**
     * - 0 for current format
     */
    glyphDataFormat: number;
};
/**
 * @typedef {object} HeadTable
 * @property {number} version - Table version number (Fixed 16.16)
 * @property {number} fontRevision - Set by font manufacturer (Fixed 16.16)
 * @property {number} checkSumAdjustment - To compute: set to 0, sum the entire font as ULong, then store 0xB1B0AFBA - sum
 * @property {number} magicNumber - Set to 0x5F0F3CF5
 * @property {number} flags - Bit flag field
 * @property {number} unitsPerEm - Valid range is from 16 to 16384
 * @property {number} created - Number of seconds since 12:00 midnight that started January 1st 1904
 * @property {number} modified - Number of seconds since 12:00 midnight that started January 1st 1904
 * @property {number} xMin - For all glyph bounding boxes
 * @property {number} yMin - For all glyph bounding boxes
 * @property {number} xMax - For all glyph bounding boxes
 * @property {number} yMax - For all glyph bounding boxes
 * @property {number} macStyle - Bit field for style flags (bold, italic, etc.)
 * @property {number} lowestRecPPEM - Smallest readable size in pixels
 * @property {number} fontDirectionHint - Deprecated, set to 2
 * @property {number} indexToLocFormat - 0 for short offsets, 1 for long
 * @property {number} glyphDataFormat - 0 for current format
 */
declare function parseHeadTable(data: any, start: any): {
    version: any;
    fontRevision: number;
    checkSumAdjustment: any;
    magicNumber: any;
    flags: any;
    unitsPerEm: any;
    created: any;
    modified: any;
    xMin: any;
    yMin: any;
    xMax: any;
    yMax: any;
    macStyle: any;
    lowestRecPPEM: any;
    fontDirectionHint: any;
    indexToLocFormat: any;
    glyphDataFormat: any;
};
declare function makeHeadTable(options: any): import("../table.js").Table;
//# sourceMappingURL=head.d.ts.map