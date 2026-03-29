export type TableData = {
    /**
     * - The DataView
     */
    data: DataView;
    /**
     * - The data offset.
     */
    offset: number;
};
import Font from './font.js';
import Glyph from './glyph.js';
import Path from './path.js';
import BoundingBox from './bbox.js';
import { VariationManager } from './variation.js';
import { PaletteManager } from './palettes.js';
import { PaintFormat } from './tables/colr.js';
import { CompositeMode } from './tables/colr.js';
import { parseColor } from './tables/cpal.js';
import { formatColor } from './tables/cpal.js';
import { pathToPoints } from './tables/glyf.js';
import { cubicToQuadratics } from './tables/glyf.js';
import { quadraticToCubic } from './conversion.js';
import { convertCFF2ToTTF } from './conversion.js';
import { convertTTFToCFF2 } from './conversion.js';
import { convertStaticCFFToTTF } from './conversion.js';
import { convertStaticTTFToCFF } from './conversion.js';
import { convertFontFormat } from './conversion.js';
import sanitize from './sanitize.js';
import { sanitizeFontForGoogleFonts } from './sanitize.js';
import { sanitizeFontForExport } from './sanitize.js';
import parse from './parse.js';
/**
 * Parse the OpenType file data (as an ArrayBuffer) and return a Font object.
 * Throws an error if the font could not be parsed.
 * @param  {ArrayBuffer} buffer
 * @param  {Record<string, unknown>} [opt] - options for parsing
 * @return {Font}
 */
declare function parseBuffer(buffer: ArrayBuffer, opt?: Record<string, unknown>): Font;
/**
 * List the table tags in a font binary without fully parsing it.
 * Useful for detecting font capabilities (e.g. COLR, CBDT, glyf) before a full parse.
 * @param  {ArrayBuffer} buffer - The font file data
 * @return {{tags: Set<string>, isTrueType: boolean, isCFF: boolean, isWOFF: boolean, isCollection: boolean, isValid: boolean, tableEntries: Array<{tag: string, offset: number, compression: string|boolean, length: number}>, collectionNumFonts?: number, collectionIndex?: number}}
 */
export function listTables(buffer: ArrayBuffer, opt?: {}): {
    tags: Set<string>;
    isTrueType: boolean;
    isCFF: boolean;
    isWOFF: boolean;
    isCollection: boolean;
    isValid: boolean;
    tableEntries: Array<{
        tag: string;
        offset: number;
        compression: string | boolean;
        length: number;
    }>;
    collectionNumFonts?: number;
    collectionIndex?: number;
};
/**
 * Asynchronously load the font from a URL or a filesystem. When done, call the callback
 * with two arguments `(err, font)`. The `err` will be null on success,
 * the `font` is a Font object.
 * We use the node.js callback convention so that
 * opentype.js can integrate with frameworks like async.js.
 * @alias opentype.load
 * @param  {string} url - The URL of the font to load.
 * @param  {Function} callback - The callback.
 */
export function load(url: string, callback: Function, opt?: {}): Promise<any>;
/**
 * Synchronously load the font from a URL or file.
 * When done, returns the font object or throws an error.
 * @alias opentype.loadSync
 * @return {Font}
 */
export function loadSync(): Font;
export { Font, Glyph, Path, BoundingBox, VariationManager, PaletteManager, PaintFormat, CompositeMode, parseColor, formatColor, pathToPoints, cubicToQuadratics, quadraticToCubic, convertCFF2ToTTF, convertTTFToCFF2, convertStaticCFFToTTF, convertStaticTTFToCFF, convertFontFormat, sanitize, sanitizeFontForGoogleFonts, sanitizeFontForExport, parse as _parse, parseBuffer as parse };
//# sourceMappingURL=opentype.d.ts.map