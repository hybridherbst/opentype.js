declare namespace _default {
    export { GlyphSet };
    export { glyphLoader };
    export { ttfGlyphLoader };
    export { cffGlyphLoader };
}
export default _default;
/**
 * A GlyphSet represents all glyphs available in the font, but modelled using
 * a deferred glyph loader, for retrieving glyphs only once they are absolutely
 * necessary, to keep the memory footprint down.
 * @exports opentype.GlyphSet
 * @class
 * @param {Record<string, unknown>} font
 * @param {Array} [glyphs]
 */
export function GlyphSet(font: Record<string, unknown>, glyphs?: any[]): void;
export class GlyphSet {
    /**
     * A GlyphSet represents all glyphs available in the font, but modelled using
     * a deferred glyph loader, for retrieving glyphs only once they are absolutely
     * necessary, to keep the memory footprint down.
     * @exports opentype.GlyphSet
     * @class
     * @param {Record<string, unknown>} font
     * @param {Array} [glyphs]
     */
    constructor(font: Record<string, unknown>, glyphs?: any[]);
    font: Record<string, unknown>;
    glyphs: {};
    length: number;
    /**
     * @param  {number} index
     * @return {Glyph}
     */
    get(index: number): Glyph;
    /**
     * @param  {number} index
     * @param  {Function|Glyph} loader
     */
    push(index: number, loader: Function | Glyph): void;
}
/**
 * @alias opentype.glyphLoader
 * @param  {Record<string, unknown>} font
 * @param  {number} index
 * @return {Glyph}
 */
declare function glyphLoader(font: Record<string, unknown>, index: number): Glyph;
/**
 * Generate a stub glyph that can be filled with all metadata *except*
 * the "points" and "path" properties, which must be loaded only once
 * the glyph's path is actually requested for text shaping.
 * @alias opentype.ttfGlyphLoader
 * @param  {Record<string, unknown>} font
 * @param  {number} index
 * @param  {Function} parseGlyph
 * @param  {Record<string, unknown>} data
 * @param  {number} position
 * @param  {Function} buildPath
 * @return {Function}
 */
declare function ttfGlyphLoader(font: Record<string, unknown>, index: number, parseGlyph: Function, data: Record<string, unknown>, position: number, buildPath: Function): Function;
/**
 * @alias opentype.cffGlyphLoader
 * @param  {Record<string, unknown>} font
 * @param  {number} index
 * @param  {Function} parseCFFCharstring
 * @param  {string} charstring
 * @param  {*} [version]
 * @return {Function}
 */
declare function cffGlyphLoader(font: Record<string, unknown>, index: number, parseCFFCharstring: Function, charstring: string, version?: any): Function;
import Glyph from './glyph.js';
//# sourceMappingURL=glyphset.d.ts.map