declare namespace _default {
    export { parseOS2Table as parse };
    export { makeOS2Table as make };
    export { unicodeRanges };
    export { getUnicodeRange };
}
export default _default;
export type Os2Table = {
    /**
     * - Table version number
     */
    version: number;
    /**
     * - Average weighted advance width of lower case letters and space
     */
    xAvgCharWidth: number;
    /**
     * - Visual weight of stroke in glyphs (100–900)
     */
    usWeightClass: number;
    /**
     * - Relative change from the normal aspect ratio (1–9)
     */
    usWidthClass: number;
    /**
     * - Type flags (embedding licensing bits)
     */
    fsType: number;
    /**
     * - Recommended horizontal size in design units for subscripts
     */
    ySubscriptXSize: number;
    /**
     * - Recommended vertical size in design units for subscripts
     */
    ySubscriptYSize: number;
    /**
     * - Recommended horizontal offset for subscripts
     */
    ySubscriptXOffset: number;
    /**
     * - Recommended vertical offset from the baseline for subscripts
     */
    ySubscriptYOffset: number;
    /**
     * - Recommended horizontal size in design units for superscripts
     */
    ySuperscriptXSize: number;
    /**
     * - Recommended vertical size in design units for superscripts
     */
    ySuperscriptYSize: number;
    /**
     * - Recommended horizontal offset for superscripts
     */
    ySuperscriptXOffset: number;
    /**
     * - Recommended vertical offset from the baseline for superscripts
     */
    ySuperscriptYOffset: number;
    /**
     * - Width of the strikeout stroke
     */
    yStrikeoutSize: number;
    /**
     * - Position of the top of the strikeout stroke
     */
    yStrikeoutPosition: number;
    /**
     * - Classification of font-family design (IBM class/subclass)
     */
    sFamilyClass: number;
    /**
     * - 10-element array describing the font's visual characteristics
     */
    panose: number[];
    /**
     * - Unicode character range bits 0–31
     */
    ulUnicodeRange1: number;
    /**
     * - Unicode character range bits 32–63
     */
    ulUnicodeRange2: number;
    /**
     * - Unicode character range bits 64–95
     */
    ulUnicodeRange3: number;
    /**
     * - Unicode character range bits 96–127
     */
    ulUnicodeRange4: number;
    /**
     * - 4-character font vendor identification
     */
    achVendID: string;
    /**
     * - Bit field containing information about the font style
     */
    fsSelection: number;
    /**
     * - Minimum Unicode index in this font
     */
    usFirstCharIndex: number;
    /**
     * - Maximum Unicode index in this font
     */
    usLastCharIndex: number;
    /**
     * - Typographic ascender (version >= 0)
     */
    sTypoAscender: number;
    /**
     * - Typographic descender (version >= 0)
     */
    sTypoDescender: number;
    /**
     * - Typographic line gap (version >= 0)
     */
    sTypoLineGap: number;
    /**
     * - Windows ascender metric (version >= 0)
     */
    usWinAscent: number;
    /**
     * - Windows descender metric (version >= 0)
     */
    usWinDescent: number;
    /**
     * - Code page character range bits 0–31 (version >= 1)
     */
    ulCodePageRange1?: number;
    /**
     * - Code page character range bits 32–63 (version >= 1)
     */
    ulCodePageRange2?: number;
    /**
     * - Distance between baseline and top of lowercase letters (version >= 2)
     */
    sxHeight?: number;
    /**
     * - Distance between baseline and top of uppercase letters (version >= 2)
     */
    sCapHeight?: number;
    /**
     * - Default glyph index when no glyph exists for a character (version >= 2)
     */
    usDefaultChar?: number;
    /**
     * - Code point used for word breaking (version >= 2)
     */
    usBreakChar?: number;
    /**
     * - Length of the longest target glyph context (version >= 2)
     */
    usMaxContent?: number;
};
declare function parseOS2Table(data: any, start: any): {
    version: any;
    xAvgCharWidth: any;
    usWeightClass: any;
    usWidthClass: any;
    fsType: any;
    ySubscriptXSize: any;
    ySubscriptYSize: any;
    ySubscriptXOffset: any;
    ySubscriptYOffset: any;
    ySuperscriptXSize: any;
    ySuperscriptYSize: any;
    ySuperscriptXOffset: any;
    ySuperscriptYOffset: any;
    yStrikeoutSize: any;
    yStrikeoutPosition: any;
    sFamilyClass: any;
    panose: any[];
    ulUnicodeRange1: any;
    ulUnicodeRange2: any;
    ulUnicodeRange3: any;
    ulUnicodeRange4: any;
    achVendID: string;
    fsSelection: any;
    usFirstCharIndex: any;
    usLastCharIndex: any;
    sTypoAscender: any;
    sTypoDescender: any;
    sTypoLineGap: any;
    usWinAscent: any;
    usWinDescent: any;
    ulCodePageRange1: any;
    ulCodePageRange2: any;
    sxHeight: any;
    sCapHeight: any;
    usDefaultChar: any;
    usBreakChar: any;
    usMaxContent: any;
};
declare function makeOS2Table(options: any): import("../table.js").Table;
/**
 * @typedef {object} Os2Table
 * @property {number} version - Table version number
 * @property {number} xAvgCharWidth - Average weighted advance width of lower case letters and space
 * @property {number} usWeightClass - Visual weight of stroke in glyphs (100–900)
 * @property {number} usWidthClass - Relative change from the normal aspect ratio (1–9)
 * @property {number} fsType - Type flags (embedding licensing bits)
 * @property {number} ySubscriptXSize - Recommended horizontal size in design units for subscripts
 * @property {number} ySubscriptYSize - Recommended vertical size in design units for subscripts
 * @property {number} ySubscriptXOffset - Recommended horizontal offset for subscripts
 * @property {number} ySubscriptYOffset - Recommended vertical offset from the baseline for subscripts
 * @property {number} ySuperscriptXSize - Recommended horizontal size in design units for superscripts
 * @property {number} ySuperscriptYSize - Recommended vertical size in design units for superscripts
 * @property {number} ySuperscriptXOffset - Recommended horizontal offset for superscripts
 * @property {number} ySuperscriptYOffset - Recommended vertical offset from the baseline for superscripts
 * @property {number} yStrikeoutSize - Width of the strikeout stroke
 * @property {number} yStrikeoutPosition - Position of the top of the strikeout stroke
 * @property {number} sFamilyClass - Classification of font-family design (IBM class/subclass)
 * @property {number[]} panose - 10-element array describing the font's visual characteristics
 * @property {number} ulUnicodeRange1 - Unicode character range bits 0–31
 * @property {number} ulUnicodeRange2 - Unicode character range bits 32–63
 * @property {number} ulUnicodeRange3 - Unicode character range bits 64–95
 * @property {number} ulUnicodeRange4 - Unicode character range bits 96–127
 * @property {string} achVendID - 4-character font vendor identification
 * @property {number} fsSelection - Bit field containing information about the font style
 * @property {number} usFirstCharIndex - Minimum Unicode index in this font
 * @property {number} usLastCharIndex - Maximum Unicode index in this font
 * @property {number} sTypoAscender - Typographic ascender (version >= 0)
 * @property {number} sTypoDescender - Typographic descender (version >= 0)
 * @property {number} sTypoLineGap - Typographic line gap (version >= 0)
 * @property {number} usWinAscent - Windows ascender metric (version >= 0)
 * @property {number} usWinDescent - Windows descender metric (version >= 0)
 * @property {number} [ulCodePageRange1] - Code page character range bits 0–31 (version >= 1)
 * @property {number} [ulCodePageRange2] - Code page character range bits 32–63 (version >= 1)
 * @property {number} [sxHeight] - Distance between baseline and top of lowercase letters (version >= 2)
 * @property {number} [sCapHeight] - Distance between baseline and top of uppercase letters (version >= 2)
 * @property {number} [usDefaultChar] - Default glyph index when no glyph exists for a character (version >= 2)
 * @property {number} [usBreakChar] - Code point used for word breaking (version >= 2)
 * @property {number} [usMaxContent] - Length of the longest target glyph context (version >= 2)
 */
declare const unicodeRanges: {
    begin: number;
    end: number;
}[];
declare function getUnicodeRange(unicode: any): number;
//# sourceMappingURL=os2.d.ts.map