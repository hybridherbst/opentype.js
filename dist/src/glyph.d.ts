export default Glyph;
export type GlyphOptions = {
    index?: number;
    /**
     * - The glyph name
     */
    name?: string;
    unicode?: number;
    unicodes?: any[];
    xMin?: number;
    yMin?: number;
    xMax?: number;
    yMax?: number;
    advanceWidth?: number;
    leftSideBearing?: number;
    path?: Path | Function;
    points?: object[];
    font?: object;
};
export type GlyphRenderOptions = {
    script?: string;
    language?: string;
    kerning?: boolean;
    features?: Record<string, unknown>;
    hinting?: boolean;
    usePalette?: number;
    drawLayers?: boolean;
    drawSVG?: boolean;
    variation?: Record<string, unknown>;
    letterSpacing?: number;
    tracking?: number;
    fill?: string;
    colorFormat?: string;
    xScale?: number;
    yScale?: number;
};
/**
 * @typedef GlyphOptions
 * @property {number} [index]
 * @property {string} [name] - The glyph name
 * @property {number} [unicode]
 * @property {Array} [unicodes]
 * @property {number} [xMin]
 * @property {number} [yMin]
 * @property {number} [xMax]
 * @property {number} [yMax]
 * @property {number} [advanceWidth]
 * @property {number} [leftSideBearing]
 * @property {Path|Function} [path]
 * @property {object[]} [points]
 * @property {object} [font]
 */
/**
 * @typedef GlyphRenderOptions
 * @property {string} [script]
 * @property {string} [language]
 * @property {boolean} [kerning]
 * @property {Record<string, unknown>} [features]
 * @property {boolean} [hinting]
 * @property {number} [usePalette]
 * @property {boolean} [drawLayers]
 * @property {boolean} [drawSVG]
 * @property {Record<string, unknown>} [variation]
 * @property {number} [letterSpacing]
 * @property {number} [tracking]
 * @property {string} [fill]
 * @property {string} [colorFormat]
 * @property {number} [xScale]
 * @property {number} [yScale]
 */
/**
 * @exports opentype.Glyph
 * @class
 * @param {GlyphOptions} options
 * @constructor
 */
export function Glyph(options: GlyphOptions): void;
export class Glyph {
    /**
     * @typedef GlyphOptions
     * @property {number} [index]
     * @property {string} [name] - The glyph name
     * @property {number} [unicode]
     * @property {Array} [unicodes]
     * @property {number} [xMin]
     * @property {number} [yMin]
     * @property {number} [xMax]
     * @property {number} [yMax]
     * @property {number} [advanceWidth]
     * @property {number} [leftSideBearing]
     * @property {Path|Function} [path]
     * @property {object[]} [points]
     * @property {object} [font]
     */
    /**
     * @typedef GlyphRenderOptions
     * @property {string} [script]
     * @property {string} [language]
     * @property {boolean} [kerning]
     * @property {Record<string, unknown>} [features]
     * @property {boolean} [hinting]
     * @property {number} [usePalette]
     * @property {boolean} [drawLayers]
     * @property {boolean} [drawSVG]
     * @property {Record<string, unknown>} [variation]
     * @property {number} [letterSpacing]
     * @property {number} [tracking]
     * @property {string} [fill]
     * @property {string} [colorFormat]
     * @property {number} [xScale]
     * @property {number} [yScale]
     */
    /**
     * @exports opentype.Glyph
     * @class
     * @param {GlyphOptions} options
     * @constructor
     */
    constructor(options: GlyphOptions);
    /**
     * @param  {GlyphOptions} options
     */
    bindConstructorValues(options: GlyphOptions): void;
    index: number;
    name: string;
    unicode: number;
    unicodes: any[];
    xMin: number;
    yMin: number;
    xMax: number;
    yMax: number;
    advanceWidth: number;
    leftSideBearing: number;
    points: any[];
    /**
     * @param {number} unicode
     */
    addUnicode(unicode: number): void;
    /**
     * Calculate the minimum bounding box for this glyph.
     * @this {object}
     * @return {import('./bbox.js').default}
     */
    getBoundingBox(this: any): import("./bbox.js").default;
    /**
     * Convert the glyph to a Path we can draw on a drawing context.
     * @this {object}
     * @param  {number} [x=0] - Horizontal position of the beginning of the text.
     * @param  {number} [y=0] - Vertical position of the *baseline* of the text.
     * @param  {number} [fontSize=72] - Font size in pixels. We scale the glyph units by `1 / unitsPerEm * fontSize`.
     * @param  {object} [options] - xScale, yScale to stretch the glyph.
     * @param  {object} [font] if hinting is to be used, or CPAL/COLR / variation needs to be rendered, the font
     * @return {Path}
     */
    getPath(this: any, x?: number, y?: number, fontSize?: number, options?: object, font?: object): Path;
    /**
     * @param {object} font
     * @returns {Array}
     */
    getLayers(font: object): any[];
    /**
     * @param {object} font
     * @returns {object}
     */
    getSvgImage(font: object): object;
    /**
     * Split the glyph into contours.
     * This function is here for backwards compatibility, and to
     * provide raw access to the TrueType glyph outlines.
     * @this {object}
     * @param {Array|null} [transformedPoints=null] Use the supplied transformed points from a glyph variation instead of the regular glyph points
     * @return {Array}
     */
    getContours(this: any, transformedPoints?: any[] | null): any[];
    /**
     * Calculate the xMin/yMin/xMax/yMax/lsb/rsb for a Glyph.
     * @this {object}
     * @return {object}
     */
    getMetrics(this: any): object;
    /**
     * Draw the glyph on the given context.
     * @param  {CanvasRenderingContext2D} ctx - A 2D drawing context, like Canvas.
     * @param  {number} [x=0] - Horizontal position of the beginning of the text.
     * @param  {number} [y=0] - Vertical position of the *baseline* of the text.
     * @param  {number} [fontSize=72] - Font size in pixels. We scale the glyph units by `1 / unitsPerEm * fontSize`.
     * @param  {object} [options] - xScale, yScale to stretch the glyph.
     * @param  {object} [font] - if hinting is to be used, or CPAL/COLR / variation needs to be rendered, the font
     */
    draw(ctx: CanvasRenderingContext2D, x?: number, y?: number, fontSize?: number, options?: object, font?: object): void;
    /**
     * Draw the points of the glyph.
     * On-curve points will be drawn in blue, off-curve points will be drawn in red.
     * @this {object}
     * @param  {CanvasRenderingContext2D} ctx - A 2D drawing context, like Canvas.
     * @param  {number} [x=0] - Horizontal position of the beginning of the text.
     * @param  {number} [y=0] - Vertical position of the *baseline* of the text.
     * @param  {number} [fontSize=72] - Font size in pixels. We scale the glyph units by `1 / unitsPerEm * fontSize`.
     * @param  {object} [options]
     * @param  {object} [font] - used to get the default render options, may be needed for variable fonts in the future
     */
    drawPoints(this: any, ctx: CanvasRenderingContext2D, x?: number, y?: number, fontSize?: number, options?: object, font?: object): void;
    /**
     * Draw lines indicating important font measurements.
     * Black lines indicate the origin of the coordinate system (point 0,0).
     * Blue lines indicate the glyph bounding box.
     * Green line indicates the advance width of the glyph.
     * @this {object}
     * @param  {CanvasRenderingContext2D} ctx - A 2D drawing context, like Canvas.
     * @param  {number} [x=0] - Horizontal position of the beginning of the text.
     * @param  {number} [y=0] - Vertical position of the *baseline* of the text.
     * @param  {number} [fontSize=72] - Font size in pixels. We scale the glyph units by `1 / unitsPerEm * fontSize`.
     */
    drawMetrics(this: any, ctx: CanvasRenderingContext2D, x?: number, y?: number, fontSize?: number): void;
    /**
     * Convert the Glyph's Path to a string of path data instructions
     * @this {object}
     * @param  {object|number} [options={decimalPlaces:2, optimize:true, variation:undefined}] - Options object (or amount of decimal places for floating-point values for backwards compatibility)
     * @param  {object} [font] - A font object is required if variation is to be applied in order to get the variation data from the tables
     * @return {string}
     * @see Path.toPathData
     */
    toPathData(this: any, options?: object | number, font?: object): string;
    /**
     * Sets the path data from an SVG path element or path notation
     * @this {object}
     * @param  {string|SVGPathElement} pathData
     * @param  {object} [options]
     */
    fromSVG(this: any, pathData: string | SVGPathElement, options?: object): any;
    /**
     * Convert the Glyph's Path to an SVG <path> element, as a string.
     * @this {object}
     * @param  {object|number} [options={decimalPlaces:2, optimize:true, variation:undefined}] - Options object (or amount of decimal places for floating-point values for backwards compatibility)
     * @param  {object} [font] - A font object is required if variation is to be applied in order to get the variation data from the tables
     * @return {string}
     */
    toSVG(this: any, options?: object | number, font?: object): string;
    /**
     * Convert the path to a DOM element.
     * @this {object}
     * @param  {object|number} [options={decimalPlaces:2, optimize:true, variation:undefined}] - Options object (or amount of decimal places for floating-point values for backwards compatibility)
     * @param  {object} [font] - A font object is required if variation is to be applied in order to get the variation data from the tables
     * @return {SVGPathElement}
     */
    toDOMElement(this: any, options?: object | number, font?: object): SVGPathElement;
    /** @type {Path} */
    path: Path;
    /** @type {boolean} */
    isComposite: boolean;
    /** @type {number|undefined} */
    _advanceWidth: number | undefined;
    /** @type {number|undefined} */
    _leftSideBearing: number | undefined;
    /** @type {Function|undefined} */
    getBlendPath: Function | undefined;
}
import Path from './path.js';
//# sourceMappingURL=glyph.d.ts.map