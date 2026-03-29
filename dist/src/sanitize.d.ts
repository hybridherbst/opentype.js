/**
 * Font Sanitization Module
 *
 * Provides clean methods to fix common font export issues for better
 * cross-platform compatibility and to pass fontspector validation.
 * Each method is designed to be reusable for sanitizing font exports.
 */
/**
 * @typedef {import('./font.js').default} SanitizeFont
 */
/**
 * Remove Mac platform name entries (platformID=1).
 * Modern fonts should only use Windows platform (platformID=3).
 * Apple no longer produces Mac name table entries in their system fonts.
 *
 * @param {Record<string, unknown>} names - The font.names object
 * @returns {Record<string, unknown>} - Sanitized names object without macintosh entries
 */
export function removeMacNameEntries(names: Record<string, unknown>): Record<string, unknown>;
/**
 * Remove the ltag table from a font.
 * The ltag table is an Apple-specific AAT table that is not part of the
 * OpenType specification and can cause fontspector validation failures.
 *
 * @param {SanitizeFont} font - The font object
 */
export function removeLtagTable(font: SanitizeFont): void;
/**
 * Match OS/2 and hhea vertical metrics.
 * This produces consistent linespacing across Mac, GNU+Linux and Windows.
 * Updates OS/2 to match hhea values.
 *
 * @param {SanitizeFont} font - The font object
 */
export function matchOS2HheaMetrics(font: SanitizeFont): void;
/**
 * Sync head.fontRevision with name table version string.
 * The fontRevision in head and nameID 5 (version) should match.
 *
 * @param {SanitizeFont} font - The font object
 */
export function syncFontVersion(font: SanitizeFont): void;
/**
 * Fix the default instance nameID to use nameID 2 or 17 as required.
 * According to OpenType spec, the default instance's subfamilyNameID
 * should be set to 2 (fontSubfamily) or 17 (preferredSubfamily).
 *
 * @param {SanitizeFont} font - The font object
 */
export function fixDefaultInstanceNameID(font: SanitizeFont): void;
/**
 * Fix full font name to start with family name.
 * The FULL_FONT_NAME (nameID 4) must start with the Family Name.
 *
 * @param {SanitizeFont} font - The font object
 */
export function fixFullFontName(font: SanitizeFont): void;
/**
 * Apply all sanitization fixes to a font for export.
 * This is the main entry point for font sanitization.
 *
 * @param {SanitizeFont} font - The font object to sanitize (modified in place)
 * @returns {SanitizeFont} - The sanitized font object
 */
export function sanitizeFontForExport(font: SanitizeFont): SanitizeFont;
/**
 * Remove duplicate fvar instances with the same coordinates.
 * Google Fonts requires each instance to have distinct coordinates.
 * Keeps the first instance with each unique coordinate set.
 *
 * @param {SanitizeFont} font - The font object
 * @returns {number} - Number of instances removed
 */
export function removeDuplicateInstances(font: SanitizeFont): number;
/**
 * Create a linear avar table for variable fonts.
 * Google Fonts requires variable fonts to have an avar table, even if linear.
 * A linear avar table means no axis remapping occurs.
 *
 * @param {SanitizeFont} font - The font object
 * @returns {boolean} - Whether avar was created or already exists
 */
export function ensureAvarTable(font: SanitizeFont): boolean;
/**
 * Ensure font ascender exceeds yMax of all glyphs.
 * Google Fonts requires OS/2 sTypoAscender to be greater than the yMax
 * of all glyphs (especially accented characters like Agrave).
 *
 * This function calculates the maximum yMax across all glyphs and updates
 * the font's ascender if it's too low. A small margin is added.
 *
 * @param {SanitizeFont} font - The font object
 * @returns {{ adjusted: boolean, oldAscender: number, newAscender: number, maxYMax: number }}
 */
export function fixAscenderForGlyphBounds(font: SanitizeFont): {
    adjusted: boolean;
    oldAscender: number;
    newAscender: number;
    maxYMax: number;
};
/**
 * Set OS/2.sTypoLineGap to 0 as required by Google Fonts vertical metrics spec.
 * Also ensures lineGap in hhea is 0.
 *
 * @param {SanitizeFont} font - The font object
 */
export function fixLineGap(font: SanitizeFont): void;
/**
 * Check and optionally fix vertical metrics to be within Google Fonts recommended range.
 * The sum of hhea ascender + abs(descender) + linegap should be 1.2-1.5x of UPM.
 *
 * @param {SanitizeFont} font - The font object
 * @returns {{ valid: boolean, ratio: number, message: string }}
 */
export function checkVerticalMetricsRatio(font: SanitizeFont): {
    valid: boolean;
    ratio: number;
    message: string;
};
/**
 * Ensure the font has a gasp table with all 4 flags ON for all sizes.
 * This is required by Google Fonts for optimal rendering.
 *
 * @param {SanitizeFont} font - The font object
 */
export function ensureGaspTable(font: SanitizeFont): void;
/**
 * Ensure variable font has an HVAR table.
 * Variable fonts require HVAR for proper text layout on some platforms.
 *
 * This function creates a minimal HVAR table if the font has gvar data
 * but no HVAR table. The HVAR table allows horizontal metrics to vary
 * across the design space.
 *
 * @param {SanitizeFont} font - The font object
 * @returns {boolean} - Whether HVAR was created or already exists
 */
export function ensureHvarTable(font: SanitizeFont): boolean;
/**
 * Apply all Google Fonts profile sanitization fixes.
 * Includes all base sanitization plus Google-specific requirements.
 *
 * @param {SanitizeFont} font - The font object to sanitize (modified in place)
 * @returns {SanitizeFont} - The sanitized font object
 */
export function sanitizeFontForGoogleFonts(font: SanitizeFont): SanitizeFont;
declare namespace _default {
    export { removeMacNameEntries };
    export { removeLtagTable };
    export { matchOS2HheaMetrics };
    export { syncFontVersion };
    export { fixDefaultInstanceNameID };
    export { fixFullFontName };
    export { sanitizeFontForExport };
    export { fixLineGap };
    export { fixAscenderForGlyphBounds };
    export { checkVerticalMetricsRatio };
    export { ensureGaspTable };
    export { ensureHvarTable };
    export { removeDuplicateInstances };
    export { ensureAvarTable };
    export { sanitizeFontForGoogleFonts };
}
export default _default;
export type SanitizeFont = import("./font.js").default;
//# sourceMappingURL=sanitize.d.ts.map