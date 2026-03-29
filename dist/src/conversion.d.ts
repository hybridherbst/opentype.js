/**
 * Convert a CFF2 variable font to TrueType variable font format.
 * This extracts deltas from CFF2 blend operators and creates gvar table data.
 *
 * @param {object} font - The font to convert (modifies in place)
 * @returns {boolean} True if conversion was successful
 */
export function convertCFF2ToTTF(font: object): boolean;
/**
 * Force eager parsing of gvar deltas.
 * Gvar deltas are lazily parsed - accessing them forces parsing which can fail
/**
 * Convert a TrueType variable font to CFF2 variable font format.
 * This extracts deltas from gvar and creates CFF2 blend operators with vstore.
 *
 * @param {object} font - The font to convert (modifies in place)
 * @returns {boolean} True if conversion was successful
 */
export function convertTTFToCFF2(font: object): boolean;
/**
 * Convert a static CFF font (no variation) to TrueType format.
 * This handles cubic-to-quadratic bezier conversion for all glyphs.
 *
 * @param {object} font - The font to convert (modifies in place)
 * @returns {boolean} True if conversion was successful
 */
export function convertStaticCFFToTTF(font: object): boolean;
/**
 * Convert a static TrueType font (no variation) to CFF format.
 * This handles quadratic-to-cubic bezier conversion for all glyphs.
 *
 * @param {object} font - The font to convert (modifies in place)
 * @returns {boolean} True if conversion was successful
 */
export function convertStaticTTFToCFF(font: object): boolean;
/**
 * Convert a font to a specific format, handling both static and variable fonts.
 * This is the main entry point for format conversion.
 *
 * @param {object} font - The font to convert (modifies in place)
 * @param {string} targetFormat - Target format: 'truetype' or 'cff'
 * @returns {boolean} True if conversion was successful (or already in target format)
 */
export function convertFontFormat(font: object, targetFormat: string): boolean;
/**
 * Convert quadratic paths from TTF to cubic paths for CFF.
 * This is a simpler conversion since quadratic -> cubic is exact.
 *
 * @param {Path} path - The quadratic path to convert
 * @returns {Path} New path with cubic curves
 */
export function quadraticToCubic(path: Path): Path;
import Path from './path.js';
//# sourceMappingURL=conversion.d.ts.map