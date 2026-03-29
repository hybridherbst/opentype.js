export default Font;
export type FontOptions = {
    /**
     * - whether to create a new empty font
     */
    empty?: boolean;
    familyName?: string;
    styleName?: string;
    fullName?: string;
    postScriptName?: string;
    designer?: string;
    designerURL?: string;
    manufacturer?: string;
    manufacturerURL?: string;
    license?: string;
    licenseURL?: string;
    version?: string;
    description?: string;
    copyright?: string;
    trademark?: string;
    unitsPerEm?: number;
    ascender?: number;
    descender?: number;
    createdTimestamp?: number;
    weightClass?: number;
    italicAngle?: number;
    widthClass?: string;
    fsSelection?: string | number;
    tables?: Record<string, unknown>;
    panose?: number[];
    glyphs?: any[];
};
export type GlyphRenderOptions = {
    /**
     * - script used to determine which features to apply. By default, 'DFLT' or 'latn' is used.
     *    See https://www.microsoft.com/typography/otspec/scripttags.htm
     */
    script?: string;
    /**
     * - language system used to determine which features to apply.
     *    See https://www.microsoft.com/typography/developers/opentype/languagetags.aspx
     */
    language?: string;
    /**
     * - whether to include kerning values
     */
    kerning?: boolean;
    /**
     * - OpenType Layout feature tags. Used to enable or disable the features of the given script/language system.
     * See https://www.microsoft.com/typography/otspec/featuretags.htm
     */
    features?: Array<{
        script: string;
        tags: string[];
    }>;
    /**
     * - whether to apply font hinting to the outlines
     */
    hinting?: boolean;
    /**
     * For COLR/CPAL fonts, the zero-based index of the color palette to use. (Use `Font.palettes.get()` to get the available palettes)
     */
    usePalette?: number;
    /**
     * For COLR/CPAL fonts, this can be turned to false in order to draw the fallback glyphs instead
     */
    drawLayers?: boolean;
    /**
     * For SVG fonts, this can be turned to false in order to draw the fallback glyphs instead
     */
    drawSVG?: boolean;
    /**
     * - Variation coordinates for variable fonts
     */
    variation?: Record<string, number>;
    /**
     * - Additional letter spacing as a fraction of fontSize
     */
    letterSpacing?: number;
    /**
     * - Tracking value in thousandths of an em
     */
    tracking?: number;
};
/**
 * @typedef {object} FontOptions
 * @property {boolean} [empty] - whether to create a new empty font
 * @property {string} [familyName]
 * @property {string} [styleName]
 * @property {string} [fullName]
 * @property {string} [postScriptName]
 * @property {string} [designer]
 * @property {string} [designerURL]
 * @property {string} [manufacturer]
 * @property {string} [manufacturerURL]
 * @property {string} [license]
 * @property {string} [licenseURL]
 * @property {string} [version]
 * @property {string} [description]
 * @property {string} [copyright]
 * @property {string} [trademark]
 * @property {Number} [unitsPerEm]
 * @property {Number} [ascender]
 * @property {Number} [descender]
 * @property {Number} [createdTimestamp]
 * @property {Number} [weightClass]
 * @property {Number} [italicAngle]
 * @property {string} [widthClass]
 * @property {string|number} [fsSelection]
 * @property {Record<string, unknown>} [tables]
 * @property {number[]} [panose]
 * @property {Array} [glyphs]
 */
/**
 * A Font represents a loaded OpenType font file.
 * It contains a set of glyphs and methods to draw text on a drawing context,
 * or to get a path representing the text.
 * @exports opentype.Font
 * @class
 * @param {FontOptions} options
 * @constructor
 */
export function Font(options: FontOptions): void;
export class Font {
    /**
     * @typedef {object} FontOptions
     * @property {boolean} [empty] - whether to create a new empty font
     * @property {string} [familyName]
     * @property {string} [styleName]
     * @property {string} [fullName]
     * @property {string} [postScriptName]
     * @property {string} [designer]
     * @property {string} [designerURL]
     * @property {string} [manufacturer]
     * @property {string} [manufacturerURL]
     * @property {string} [license]
     * @property {string} [licenseURL]
     * @property {string} [version]
     * @property {string} [description]
     * @property {string} [copyright]
     * @property {string} [trademark]
     * @property {Number} [unitsPerEm]
     * @property {Number} [ascender]
     * @property {Number} [descender]
     * @property {Number} [createdTimestamp]
     * @property {Number} [weightClass]
     * @property {Number} [italicAngle]
     * @property {string} [widthClass]
     * @property {string|number} [fsSelection]
     * @property {Record<string, unknown>} [tables]
     * @property {number[]} [panose]
     * @property {Array} [glyphs]
     */
    /**
     * A Font represents a loaded OpenType font file.
     * It contains a set of glyphs and methods to draw text on a drawing context,
     * or to get a path representing the text.
     * @exports opentype.Font
     * @class
     * @param {FontOptions} options
     * @constructor
     */
    constructor(options: FontOptions);
    names: {};
    unitsPerEm: number;
    ascender: number;
    descender: number;
    createdTimestamp: number;
    italicAngle: number;
    weightClass: number;
    tables: Record<string, unknown>;
    supported: boolean;
    glyphs: import("./glyphset.js").GlyphSet;
    encoding: DefaultEncoding;
    position: Position;
    substitution: Substitution;
    variation: VariationManager;
    palettes: PaletteManager;
    layers: LayerManager;
    svgImages: SVGImageManager;
    _push: any;
    _hmtxTableData: {};
    options: FontOptions;
    /** @type {string|undefined} */
    outlinesFormat: string | undefined;
    /** @type {import('./encoding.js').GlyphNames|undefined} */
    glyphNames: import("./encoding.js").GlyphNames | undefined;
    /** @type {Record<string, number>|undefined} */
    kerningPairs: Record<string, number> | undefined;
    /** @type {{index: number, numFonts: number, format: string}|undefined} */
    collection: {
        index: number;
        numFonts: number;
        format: string;
    } | undefined;
    /** @type {number|undefined} */
    numberOfHMetrics: number | undefined;
    /** @type {number|undefined} */
    numGlyphs: number | undefined;
    /** @type {Record<string, unknown>|undefined} */
    metas: Record<string, unknown> | undefined;
    /**
     * Check if the font has a glyph for the given character.
     * @param  {string} c
     * @return {Boolean}
     */
    hasChar(c: string): boolean;
    /**
     * Convert the given character to a single glyph index.
     * Note that this function assumes that there is a one-to-one mapping between
     * the given character and a glyph; for complex scripts this might not be the case.
     * @param  {string} s
     * @return {Number}
     */
    charToGlyphIndex(s: string): number;
    /**
     * Convert the given character to a single Glyph object.
     * Note that this function assumes that there is a one-to-one mapping between
     * the given character and a glyph; for complex scripts this might not be the case.
     * @param  {string} c
     * @return {Glyph}
     */
    charToGlyph(c: string): Glyph;
    /**
     * Instantiate a static font at given variation coords or a named instance.
     * Bakes current deltas into outlines and strips variation tables.
     * @param {Record<string, number>|string} coordsOrName e.g., {wght:700} or 'Bold'
     * @returns {Font} a new Font object with static outlines
     */
    instantiate(coordsOrName: Record<string, number> | string): Font;
    /**
     * Update features
     * @param {Record<string, boolean>} options features options
     */
    updateFeatures(options: Record<string, boolean>): {
        script: string;
        tags: string[];
    }[];
    /**
     * Convert the given text to a list of Glyph indexes.
     * Note that there is no strict one-to-one mapping between characters and
     * glyphs, so the list of returned glyph indexes can be larger or smaller than the
     * length of the given string.
     * @param  {string} s
     * @param  {GlyphRenderOptions} [options]
     * @return {number[]}
     */
    stringToGlyphIndexes(s: string, options?: GlyphRenderOptions): number[];
    /**
     * Convert the given text to a list of Glyph objects.
     * Note that there is no strict one-to-one mapping between characters and
     * glyphs, so the list of returned glyphs can be larger or smaller than the
     * length of the given string.
     * @param  {string} s
     * @param  {GlyphRenderOptions} [options]
     * @return {Glyph[]}
     */
    stringToGlyphs(s: string, options?: GlyphRenderOptions): Glyph[];
    /**
     * @param  {string} name
     * @return {Number}
     */
    nameToGlyphIndex(name: string): number;
    /**
     * @param  {string} name
     * @return {Glyph}
     */
    nameToGlyph(name: string): Glyph;
    /**
     * @param  {Number} gid
     * @return {String}
     */
    glyphIndexToName(gid: number): string;
    /**
     * Retrieve the value of the kerning pair between the left glyph (or its index)
     * and the right glyph (or its index). If no kerning pair is found, return 0.
     * The kerning value gets added to the advance width when calculating the spacing
     * between glyphs.
     * For GPOS kerning, this method uses the default script and language, which covers
     * most use cases. To have greater control, use font.position.getKerningValue .
     * @param  {Glyph|number} leftGlyph
     * @param  {Glyph|number} rightGlyph
     * @return {Number}
     */
    getKerningValue(leftGlyph: Glyph | number, rightGlyph: Glyph | number): number;
    /**
     * @typedef {object} GlyphRenderOptions
     * @property {string} [script] - script used to determine which features to apply. By default, 'DFLT' or 'latn' is used.
     *                               See https://www.microsoft.com/typography/otspec/scripttags.htm
     * @property {string} [language='dflt'] - language system used to determine which features to apply.
     *                                        See https://www.microsoft.com/typography/developers/opentype/languagetags.aspx
     * @property {boolean} [kerning=true] - whether to include kerning values
     * @property {Array<{script: string, tags: string[]}>} [features] - OpenType Layout feature tags. Used to enable or disable the features of the given script/language system.
     *                                 See https://www.microsoft.com/typography/otspec/featuretags.htm
     * @property {boolean} [hinting=false] - whether to apply font hinting to the outlines
     * @property {number} [usePalette=0] For COLR/CPAL fonts, the zero-based index of the color palette to use. (Use `Font.palettes.get()` to get the available palettes)
     * @property {boolean} [drawLayers=true] For COLR/CPAL fonts, this can be turned to false in order to draw the fallback glyphs instead
     * @property {boolean} [drawSVG=true] For SVG fonts, this can be turned to false in order to draw the fallback glyphs instead
     * @property {Record<string, number>} [variation] - Variation coordinates for variable fonts
     * @property {number} [letterSpacing] - Additional letter spacing as a fraction of fontSize
     * @property {number} [tracking] - Tracking value in thousandths of an em
     */
    defaultRenderOptions: {
        kerning: boolean;
        features: {
            script: string;
            tags: string[];
        }[];
        hinting: boolean;
        usePalette: number;
        drawLayers: boolean;
        drawSVG: boolean;
    };
    /**
     * Helper function that invokes the given callback for each glyph in the given text.
     * The callback gets `(glyph, x, y, fontSize, options)`.* @param  {string} text
     * @param {string} text - The text to apply.
     * @param  {number} [x=0] - Horizontal position of the beginning of the text.
     * @param  {number} [y=0] - Vertical position of the *baseline* of the text.
     * @param  {number} [fontSize=72] - Font size in pixels. We scale the glyph units by `1 / unitsPerEm * fontSize`.
     * @param  {GlyphRenderOptions} [options]
     * @param  {Function} [callback]
     */
    forEachGlyph(text: string, x?: number, y?: number, fontSize?: number, options?: GlyphRenderOptions, callback?: Function): number;
    /**
     * Create a Path object that represents the given text.
     * @param  {string} text - The text to create.
     * @param  {number} [x=0] - Horizontal position of the beginning of the text.
     * @param  {number} [y=0] - Vertical position of the *baseline* of the text.
     * @param  {number} [fontSize=72] - Font size in pixels. We scale the glyph units by `1 / unitsPerEm * fontSize`.
     * @param  {GlyphRenderOptions=} options
     * @return {Path}
     */
    getPath(text: string, x?: number, y?: number, fontSize?: number, options?: GlyphRenderOptions | undefined): Path;
    /**
     * Create an array of Path objects that represent the glyphs of a given text.
     * @param  {string} text - The text to create.
     * @param  {number} [x=0] - Horizontal position of the beginning of the text.
     * @param  {number} [y=0] - Vertical position of the *baseline* of the text.
     * @param  {number} [fontSize=72] - Font size in pixels. We scale the glyph units by `1 / unitsPerEm * fontSize`.
     * @param  {GlyphRenderOptions=} options
     * @return {Path[]}
     */
    getPaths(text: string, x?: number, y?: number, fontSize?: number, options?: GlyphRenderOptions | undefined): Path[];
    /**
     * Returns the advance width of a text.
     *
     * This is something different than Path.getBoundingBox() as for example a
     * suffixed whitespace increases the advanceWidth but not the bounding box
     * or an overhanging letter like a calligraphic 'f' might have a quite larger
     * bounding box than its advance width.
     *
     * This corresponds to canvas2dContext.measureText(text).width
     *
     * @param  {string} text - The text to create.
     * @param  {number} [fontSize=72] - Font size in pixels. We scale the glyph units by `1 / unitsPerEm * fontSize`.
     * @param  {GlyphRenderOptions=} options
     * @return advance width
     */
    getAdvanceWidth(text: string, fontSize?: number, options?: GlyphRenderOptions | undefined): number;
    /**
     * Draw the text on the given drawing context.
     * @param  {CanvasRenderingContext2D} ctx - A 2D drawing context, like Canvas.
     * @param  {string} text - The text to create.
     * @param  {number} [x=0] - Horizontal position of the beginning of the text.
     * @param  {number} [y=0] - Vertical position of the *baseline* of the text.
     * @param  {number} [fontSize=72] - Font size in pixels. We scale the glyph units by `1 / unitsPerEm * fontSize`.
     * @param  {GlyphRenderOptions=} options
     */
    draw(ctx: CanvasRenderingContext2D, text: string, x?: number, y?: number, fontSize?: number, options?: GlyphRenderOptions | undefined): void;
    /**
     * Draw the points of all glyphs in the text.
     * On-curve points will be drawn in blue, off-curve points will be drawn in red.
     * @param {CanvasRenderingContext2D} ctx - A 2D drawing context, like Canvas.
     * @param {string} text - The text to create.
     * @param {number} [x=0] - Horizontal position of the beginning of the text.
     * @param {number} [y=0] - Vertical position of the *baseline* of the text.
     * @param {number} [fontSize=72] - Font size in pixels. We scale the glyph units by `1 / unitsPerEm * fontSize`.
     * @param {GlyphRenderOptions=} options
     */
    drawPoints(ctx: CanvasRenderingContext2D, text: string, x?: number, y?: number, fontSize?: number, options?: GlyphRenderOptions | undefined): void;
    /**
     * Draw lines indicating important font measurements for all glyphs in the text.
     * Black lines indicate the origin of the coordinate system (point 0,0).
     * Blue lines indicate the glyph bounding box.
     * Green line indicates the advance width of the glyph.
     * @param {CanvasRenderingContext2D} ctx - A 2D drawing context, like Canvas.
     * @param {string} text - The text to create.
     * @param {number} [x=0] - Horizontal position of the beginning of the text.
     * @param {number} [y=0] - Vertical position of the *baseline* of the text.
     * @param {number} [fontSize=72] - Font size in pixels. We scale the glyph units by `1 / unitsPerEm * fontSize`.
     * @param {GlyphRenderOptions=} options
     */
    drawMetrics(ctx: CanvasRenderingContext2D, text: string, x?: number, y?: number, fontSize?: number, options?: GlyphRenderOptions | undefined): void;
    /**
     * @param  {string} name
     * @return {string}
     */
    getEnglishName(name: string): string;
    /**
     * Validate
     */
    validate(): any[];
    /**
     * Convert the font object to a SFNT data structure.
     * This structure contains all the necessary tables and metadata to create a binary OTF file.
     * @param {{postFormat?: number}} [options] - Options for table generation
     * @return {Record<string, unknown> & {encode: Function}}
     */
    toTables(options?: {
        postFormat?: number;
    }): Record<string, unknown> & {
        encode: Function;
    };
    /**
     * @deprecated Font.toBuffer is deprecated. Use Font.toArrayBuffer instead.
     */
    toBuffer(): ArrayBuffer;
    /**
     * Converts a `opentype.Font` into an `ArrayBuffer`
     * @param {{postFormat?: number}} [options] - Options for table generation
     * @return {ArrayBuffer}
     */
    toArrayBuffer(options?: {
        postFormat?: number;
    }): ArrayBuffer;
    /**
     * Initiate a download of the OpenType font.
     */
    download(fileName: any): void;
    /**
     * @private
     */
    private fsSelectionValues;
    /**
     * @private
     */
    private macStyleValues;
    /**
     * @private
     */
    private usWidthClasses;
    /**
     * @private
     */
    private usWeightClasses;
    /**
     * Convert a CFF2 variable font to TrueType variable font format.
     * This extracts deltas from CFF2 blend operators and creates gvar table data.
     * Modifies the font in place.
     *
     * @returns {boolean} True if conversion was successful
     */
    convertToTrueType(): boolean;
    /**
     * Convert a TrueType variable font to CFF2 variable font format.
     * This extracts deltas from gvar and creates CFF2 blend operators with vstore.
     * Modifies the font in place.
     *
     * @returns {boolean} True if conversion was successful
     */
    convertToCFF2(): boolean;
}
import { DefaultEncoding } from './encoding.js';
import Position from './position.js';
import Substitution from './substitution.js';
import { VariationManager } from './variation.js';
import { PaletteManager } from './palettes.js';
import { LayerManager } from './layers.js';
import { SVGImageManager } from './svgimages.js';
import Glyph from './glyph.js';
import Path from './path.js';
//# sourceMappingURL=font.d.ts.map