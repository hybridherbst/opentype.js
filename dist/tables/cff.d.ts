declare namespace _default {
    export { parseCFFTable as parse };
    export { makeCFFTable as make };
}
export default _default;
export type CffPrivateDict = {
    /**
     * - Offset to local subroutines
     */
    subrs: number;
    /**
     * - Default width for glyphs not in hmtx
     */
    defaultWidthX: number;
    /**
     * - Bias added to widths stored in charstrings
     */
    nominalWidthX: number;
    /**
     * - PostScript alignment zones (CFF2)
     */
    blueValues?: number[];
    /**
     * - Additional alignment zones (CFF2)
     */
    otherBlues?: number[];
    /**
     * - Family alignment zones (CFF2)
     */
    familyBlues?: number[];
    /**
     * - Additional family alignment zones (CFF2)
     */
    familyOtherBlues?: number[];
    /**
     * - Point size at which overshoot suppression stops (CFF2)
     */
    blueScale?: number;
    /**
     * - Value of the overshoot (CFF2)
     */
    blueShift?: number;
    /**
     * - Extension of alignment zones (CFF2)
     */
    blueFuzz?: number;
    /**
     * - Dominant width of horizontal stems (CFF2)
     */
    stdHW?: number;
    /**
     * - Dominant width of vertical stems (CFF2)
     */
    stdVW?: number;
    /**
     * - Language group code (CFF2)
     */
    languageGroup?: number;
    /**
     * - Limit for global coloring algorithm (CFF2)
     */
    expansionFactor?: number;
    /**
     * - Variation store index (CFF2)
     */
    vsindex?: number;
    /**
     * - Horizontal stem snap values (CFF2)
     */
    stemSnapH?: number[];
    /**
     * - Vertical stem snap values (CFF2)
     */
    stemSnapV?: number[];
};
export type CffTopDict = {
    /**
     * - Version of the font (SID)
     */
    version: string | null;
    /**
     * - Copyright notice (SID)
     */
    notice: string | null;
    /**
     * - Copyright string (SID)
     */
    copyright: string | null;
    /**
     * - Full name of the font (SID)
     */
    fullName: string | null;
    /**
     * - Family name of the font (SID)
     */
    familyName: string | null;
    /**
     * - Weight of the font, e.g. 'Bold' (SID)
     */
    weight: string | null;
    /**
     * - 1 if fixed-pitch (monospaced), 0 otherwise
     */
    isFixedPitch: number;
    /**
     * - Angle of italic in degrees counter-clockwise from vertical
     */
    italicAngle: number;
    /**
     * - Underline position
     */
    underlinePosition: number;
    /**
     * - Underline thickness
     */
    underlineThickness: number;
    /**
     * - 0 for fill, 2 for stroke
     */
    paintType: number;
    /**
     * - Charstring type (always 2 for Type 2)
     */
    charstringType: number;
    /**
     * - Six-element transformation matrix
     */
    fontMatrix: number[];
    /**
     * - Unique identifier for the font
     */
    uniqueId: number | null;
    /**
     * - Font bounding box [xMin, yMin, xMax, yMax]
     */
    fontBBox: number[];
    /**
     * - Dominant width of strokes for paintType 2
     */
    strokeWidth: number;
    /**
     * - Extended unique id
     */
    xuid: any[] | null;
    /**
     * - Offset to charset data (0=ISOAdobe, 1=Expert, 2=ExpertSubset)
     */
    charset: number;
    /**
     * - Offset to encoding data (0=standard, 1=expert)
     */
    encoding: number;
    /**
     * - Offset to charstrings INDEX
     */
    charStrings: number;
    /**
     * - Two-element array [size, offset] of Private DICT
     */
    private: number[];
    /**
     * - Registry-Ordering-Supplement for CID-keyed fonts
     */
    ros?: any[] | null;
    /**
     * - CID font version
     */
    cidFontVersion?: number;
    /**
     * - CID font revision
     */
    cidFontRevision?: number;
    /**
     * - CID font type
     */
    cidFontType?: number;
    /**
     * - Count of CIDs in the font
     */
    cidCount?: number;
    /**
     * - UID base value for CID fonts
     */
    uidBase?: number;
    /**
     * - Offset to Font DICT INDEX for CID fonts
     */
    fdArray?: number;
    /**
     * - Offset to FDSelect table for CID fonts
     */
    fdSelect?: number;
    /**
     * - Offset to variation store (CFF2 only)
     */
    vstore?: number;
    /**
     * - PostScript font name for CID fonts (SID)
     */
    fontName?: string | null;
    /**
     * - Parsed local subroutines (added during parsing)
     */
    _subrs?: any[];
    /**
     * - Subroutine bias (added during parsing)
     */
    _subrsBias?: number;
    /**
     * - Default glyph width (added during parsing)
     */
    _defaultWidthX?: number;
    /**
     * - Nominal glyph width (added during parsing)
     */
    _nominalWidthX?: number;
    /**
     * - Parsed Private DICT (added during parsing)
     */
    _privateDict?: CffPrivateDict;
    /**
     * - Parsed Font DICT array for CID fonts (added during parsing)
     */
    _fdArray?: any[];
    /**
     * - Parsed FDSelect data for CID fonts (added during parsing)
     */
    _fdSelect?: any[];
    /**
     * - Parsed variation store for CFF2 fonts (added during parsing)
     */
    _vstore?: object;
};
export type CffTable = {
    /**
     * - The parsed top-level CFF dictionary
     */
    topDict: CffTopDict;
};
declare function parseCFFTable(data: any, start: any, font: any, opt: any): void;
declare function makeCFFTable(glyphs: any, options: any, version: any): any;
/**
 * Applies path styles according to a CFF font's PaintType
 * @param {Record<string, unknown>} font
 * @param {import('../path.js').default} path
 * @returns {number} paintType
 */
export function applyPaintType(font: Record<string, unknown>, path: import("../path.js").default): number;
//# sourceMappingURL=cff.d.ts.map