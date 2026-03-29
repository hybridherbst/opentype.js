declare namespace _default {
    export { parseColrTable as parse };
    export { makeColrTable as make };
    export { getClipBoxAtCoords };
    export { PaintFormat };
    export { CompositeMode };
}
export default _default;
export namespace PaintFormat {
    let ColrLayers: number;
    let Solid: number;
    let VarSolid: number;
    let LinearGradient: number;
    let VarLinearGradient: number;
    let RadialGradient: number;
    let VarRadialGradient: number;
    let SweepGradient: number;
    let VarSweepGradient: number;
    let Glyph: number;
    let ColrGlyph: number;
    let Transform: number;
    let VarTransform: number;
    let Translate: number;
    let VarTranslate: number;
    let Scale: number;
    let VarScale: number;
    let ScaleAroundCenter: number;
    let VarScaleAroundCenter: number;
    let ScaleUniform: number;
    let VarScaleUniform: number;
    let ScaleUniformAroundCenter: number;
    let VarScaleUniformAroundCenter: number;
    let Rotate: number;
    let VarRotate: number;
    let RotateAroundCenter: number;
    let VarRotateAroundCenter: number;
    let Skew: number;
    let VarSkew: number;
    let SkewAroundCenter: number;
    let VarSkewAroundCenter: number;
    let Composite: number;
}
export namespace CompositeMode {
    let CLEAR: number;
    let SRC: number;
    let DEST: number;
    let SRC_OVER: number;
    let DEST_OVER: number;
    let SRC_IN: number;
    let DEST_IN: number;
    let SRC_OUT: number;
    let DEST_OUT: number;
    let SRC_ATOP: number;
    let DEST_ATOP: number;
    let XOR: number;
    let PLUS: number;
    let SCREEN: number;
    let OVERLAY: number;
    let DARKEN: number;
    let LIGHTEN: number;
    let COLOR_DODGE: number;
    let COLOR_BURN: number;
    let HARD_LIGHT: number;
    let SOFT_LIGHT: number;
    let DIFFERENCE: number;
    let EXCLUSION: number;
    let MULTIPLY: number;
    let HSL_HUE: number;
    let HSL_SATURATION: number;
    let HSL_COLOR: number;
    let HSL_LUMINOSITY: number;
}
declare function parseColrTable(data: any, start: any): {
    version: any;
    baseGlyphRecords: any[];
    layerRecords: any[];
};
declare function makeColrTable(colr: any): import("../table.js").Table;
/**
 * Compute the ClipBox for a specific glyph at given normalized variation coordinates.
 * Applies ItemVariationStore deltas if the ClipBox has a varIndexBase (format 2).
 *
 * @param {Record<string, unknown>} colr - Parsed COLR table (from parseColrTable)
 * @param {number} glyphID - Glyph index
 * @param {Record<string, unknown>} fvar - Parsed fvar table (font.tables.fvar)
 * @param {Record<string, number>} coords - Variation coordinates (e.g. {wght: 700})
 * @returns {{ xMin: number, yMin: number, xMax: number, yMax: number } | null}
 */
declare function getClipBoxAtCoords(colr: Record<string, unknown>, glyphID: number, fvar: Record<string, unknown>, coords: Record<string, number>): {
    xMin: number;
    yMin: number;
    xMax: number;
    yMax: number;
} | null;
//# sourceMappingURL=colr.d.ts.map