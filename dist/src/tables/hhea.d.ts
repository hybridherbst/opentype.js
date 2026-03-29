declare namespace _default {
    export { parseHheaTable as parse };
    export { makeHheaTable as make };
}
export default _default;
export type HheaTable = {
    /**
     * - Table version number (Fixed 16.16)
     */
    version: number;
    /**
     * - Typographic ascent in font design units
     */
    ascender: number;
    /**
     * - Typographic descent in font design units (negative)
     */
    descender: number;
    /**
     * - Typographic line gap in font design units
     */
    lineGap: number;
    /**
     * - Maximum advance width value in 'hmtx' table
     */
    advanceWidthMax: number;
    /**
     * - Minimum left sidebearing value in 'hmtx' table
     */
    minLeftSideBearing: number;
    /**
     * - Minimum right sidebearing value
     */
    minRightSideBearing: number;
    /**
     * - Max(lsb + (xMax - xMin))
     */
    xMaxExtent: number;
    /**
     * - Used to calculate the slope of the cursor (rise/run)
     */
    caretSlopeRise: number;
    /**
     * - 0 for vertical
     */
    caretSlopeRun: number;
    /**
     * - The amount by which a slanted highlight on a glyph needs to be shifted
     */
    caretOffset: number;
    /**
     * - 0 for current format
     */
    metricDataFormat: number;
    /**
     * - Number of hMetric entries in 'hmtx' table
     */
    numberOfHMetrics: number;
};
/**
 * @typedef {object} HheaTable
 * @property {number} version - Table version number (Fixed 16.16)
 * @property {number} ascender - Typographic ascent in font design units
 * @property {number} descender - Typographic descent in font design units (negative)
 * @property {number} lineGap - Typographic line gap in font design units
 * @property {number} advanceWidthMax - Maximum advance width value in 'hmtx' table
 * @property {number} minLeftSideBearing - Minimum left sidebearing value in 'hmtx' table
 * @property {number} minRightSideBearing - Minimum right sidebearing value
 * @property {number} xMaxExtent - Max(lsb + (xMax - xMin))
 * @property {number} caretSlopeRise - Used to calculate the slope of the cursor (rise/run)
 * @property {number} caretSlopeRun - 0 for vertical
 * @property {number} caretOffset - The amount by which a slanted highlight on a glyph needs to be shifted
 * @property {number} metricDataFormat - 0 for current format
 * @property {number} numberOfHMetrics - Number of hMetric entries in 'hmtx' table
 */
declare function parseHheaTable(data: any, start: any): {
    version: any;
    ascender: any;
    descender: any;
    lineGap: any;
    advanceWidthMax: any;
    minLeftSideBearing: any;
    minRightSideBearing: any;
    xMaxExtent: any;
    caretSlopeRise: any;
    caretSlopeRun: any;
    caretOffset: any;
    metricDataFormat: any;
    numberOfHMetrics: any;
};
declare function makeHheaTable(options: any): import("../table.js").Table;
//# sourceMappingURL=hhea.d.ts.map