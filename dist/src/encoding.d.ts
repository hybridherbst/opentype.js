export const cffStandardStrings: string[];
export const cffISOAdobeStrings: string[];
export const cffIExpertStrings: string[];
export const cffExpertSubsetStrings: string[];
export const cffStandardEncoding: string[];
export const cffExpertEncoding: string[];
export const standardNames: string[];
/**
 * This is the encoding used for fonts created from scratch.
 * It loops through all glyphs and finds the appropriate unicode value.
 * Since it's linear time, other encodings will be faster.
 * @exports opentype.DefaultEncoding
 * @class
 * @constructor
 * @param {import('./font.js').default} font
 */
export function DefaultEncoding(font: import("./font.js").default): void;
export class DefaultEncoding {
    /**
     * This is the encoding used for fonts created from scratch.
     * It loops through all glyphs and finds the appropriate unicode value.
     * Since it's linear time, other encodings will be faster.
     * @exports opentype.DefaultEncoding
     * @class
     * @constructor
     * @param {import('./font.js').default} font
     */
    constructor(font: import("./font.js").default);
    font: import("./font.js").Font;
    charToGlyphIndex(c: any): number;
}
/**
 * @exports opentype.CmapEncoding
 * @class
 * @constructor
 * @param {{glyphIndexMap: Record<string, number>}} cmap - a object with the cmap encoded data
 */
export function CmapEncoding(cmap: {
    glyphIndexMap: Record<string, number>;
}): void;
export class CmapEncoding {
    /**
     * @exports opentype.CmapEncoding
     * @class
     * @constructor
     * @param {{glyphIndexMap: Record<string, number>}} cmap - a object with the cmap encoded data
     */
    constructor(cmap: {
        glyphIndexMap: Record<string, number>;
    });
    cmap: {
        glyphIndexMap: Record<string, number>;
    };
    /**
     * @param  {string} c - the character
     * @return {number} The glyph index.
     */
    charToGlyphIndex(c: string): number;
}
/**
 * @exports opentype.CffEncoding
 * @class
 * @constructor
 * @param {string} encoding - The encoding
 * @param {Array} charset - The character set.
 */
export function CffEncoding(encoding: string, charset: any[]): void;
export class CffEncoding {
    /**
     * @exports opentype.CffEncoding
     * @class
     * @constructor
     * @param {string} encoding - The encoding
     * @param {Array} charset - The character set.
     */
    constructor(encoding: string, charset: any[]);
    encoding: string;
    charset: any[];
    /**
     * @param  {string} s - The character
     * @return {number} The index.
     */
    charToGlyphIndex(s: string): number;
}
/**
 * @exports opentype.GlyphNames
 * @class
 * @constructor
 * @param {{version: number, numberOfGlyphs: number, glyphNameIndex: number[], names: string[]}} post
 */
export function GlyphNames(post: {
    version: number;
    numberOfGlyphs: number;
    glyphNameIndex: number[];
    names: string[];
}): void;
export class GlyphNames {
    /**
     * @exports opentype.GlyphNames
     * @class
     * @constructor
     * @param {{version: number, numberOfGlyphs: number, glyphNameIndex: number[], names: string[]}} post
     */
    constructor(post: {
        version: number;
        numberOfGlyphs: number;
        glyphNameIndex: number[];
        names: string[];
    });
    names: any[];
    /**
     * Gets the index of a glyph by name.
     * @param  {string} name - The glyph name
     * @return {number} The index
     */
    nameToGlyphIndex(name: string): number;
    /**
     * @param  {number} gid
     * @return {string}
     */
    glyphIndexToName(gid: number): string;
}
/**
 * @alias opentype.addGlyphNames
 * @param {import('./font.js').default} font
 * @param {{lowMemory?: boolean}} opt
 */
export function addGlyphNames(font: import("./font.js").default, opt: {
    lowMemory?: boolean;
}): void;
//# sourceMappingURL=encoding.d.ts.map