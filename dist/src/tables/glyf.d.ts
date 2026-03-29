declare namespace _default {
    export { getPath };
    export { parseGlyfTable as parse };
    export { makeGlyfTable as make };
}
export default _default;
export type TrueTypeGlyph = import("../glyph.js").Glyph & {
    numberOfContours?: number;
    contourEnds?: number[];
    instructions?: number[];
    components?: Array<{
        glyphIndex: number;
        dx: number;
        dy: number;
        xScale?: number;
        yScale?: number;
        scale01?: number;
        scale10?: number;
    }>;
    _xMin?: number;
    _yMin?: number;
    _xMax?: number;
    _yMax?: number;
    isComposite?: boolean;
};
export function getPath(points: any): Path;
declare function parseGlyfTable(data: any, start: any, loca: any, font: any, opt: any): import("../glyphset.js").GlyphSet;
/**
 * Make a glyf table from a GlyphSet.
 * @param {import('../glyphset.js').GlyphSet} glyphs - The glyphs to encode
 * @returns {{ glyfData: Uint8Array, offsets: Array<number> }}
 */
declare function makeGlyfTable(glyphs: import("../glyphset.js").GlyphSet): {
    glyfData: Uint8Array;
    offsets: Array<number>;
};
export function transformPoints(points: any, transform: any): {
    x: any;
    y: any;
    onCurve: any;
    lastPointOfContour: any;
}[];
/**
 * Convert a Path to TrueType glyph points.
 * Uses proper cubic-to-quadratic conversion for CFF fonts.
 *
 * @param {Path} path - The path to convert
 * @param {number} [tolerance=1] - Maximum error for cubic-to-quadratic conversion
 * @returns {{ points: Array<{x: number, y: number, onCurve: boolean}>, contourEnds: Array<number> }}
 */
export function pathToPoints(path: Path, tolerance?: number): {
    points: Array<{
        x: number;
        y: number;
        onCurve: boolean;
    }>;
    contourEnds: Array<number>;
};
/**
 * Convert a cubic bezier curve to a sequence of quadratic bezier curves.
 * Uses recursive subdivision to achieve accurate approximation.
 *
 * @param {number} x0 - Start point x
 * @param {number} y0 - Start point y
 * @param {number} x1 - First control point x
 * @param {number} y1 - First control point y
 * @param {number} x2 - Second control point x
 * @param {number} y2 - Second control point y
 * @param {number} x3 - End point x
 * @param {number} y3 - End point y
 * @param {number} [tolerance=1] - Maximum allowed error in font units
 * @param {number} [_depth=0] - Internal: recursion depth for safety limit
 * @returns {Array} Array of quadratic segments: { cx, cy, x, y }
 */
export function cubicToQuadratics(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, tolerance?: number, _depth?: number): any[];
import Path from '../path.js';
//# sourceMappingURL=glyf.d.ts.map