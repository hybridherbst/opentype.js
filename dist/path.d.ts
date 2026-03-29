export default Path;
/**
 * A bézier path containing a set of path commands similar to a SVG path.
 * Paths can be drawn on a context using `draw`.
 * @exports opentype.Path
 * @class
 * @constructor
 */
declare function Path(): void;
declare class Path {
    commands: any[];
    fill: string;
    stroke: any;
    strokeWidth: number;
    /** @type {Path[]|undefined} */
    _layers: Path[] | undefined;
    /** @type {{image: CanvasImageSource, x: number, y: number, width: number, height: number}|undefined} */
    _image: {
        image: CanvasImageSource;
        x: number;
        y: number;
        width: number;
        height: number;
    } | undefined;
    /** @type {unknown} */
    _paint: unknown;
    /** @type {number|undefined} */
    _alpha: number | undefined;
    /** @type {unknown} */
    _transform: unknown;
    /**
     * Sets the path data from an SVG path element or path notation
     * @param  {string|SVGPathElement} pathData
     * @param  {object} options
     */
    fromSVG(pathData: string | SVGPathElement, options?: object): this;
    /**
     * @param  {number} x
     * @param  {number} y
     */
    moveTo(x: number, y: number): void;
    /**
     * @param  {number} x
     * @param  {number} y
     */
    lineTo(x: number, y: number): void;
    /**
     * Draws cubic curve
     * @function
     * curveTo
     * @memberof opentype.Path.prototype
     * @param  {number} x1 - x of control 1
     * @param  {number} y1 - y of control 1
     * @param  {number} x2 - x of control 2
     * @param  {number} y2 - y of control 2
     * @param  {number} x - x of path point
     * @param  {number} y - y of path point
     */
    /**
     * Draws cubic curve
     * @function
     * bezierCurveTo
     * @memberof opentype.Path.prototype
     * @param  {number} x1 - x of control 1
     * @param  {number} y1 - y of control 1
     * @param  {number} x2 - x of control 2
     * @param  {number} y2 - y of control 2
     * @param  {number} x - x of path point
     * @param  {number} y - y of path point
     * @see curveTo
     */
    curveTo: (x1: number, y1: number, x2: number, y2: number, x: number, y: number) => void;
    bezierCurveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void;
    /**
     * Draws quadratic curve
     * @function
     * quadraticCurveTo
     * @memberof opentype.Path.prototype
     * @param  {number} x1 - x of control
     * @param  {number} y1 - y of control
     * @param  {number} x - x of path point
     * @param  {number} y - y of path point
     */
    /**
     * Draws quadratic curve
     * @function
     * quadTo
     * @memberof opentype.Path.prototype
     * @param  {number} x1 - x of control
     * @param  {number} y1 - y of control
     * @param  {number} x - x of path point
     * @param  {number} y - y of path point
     */
    quadTo: (x1: number, y1: number, x: number, y: number) => void;
    quadraticCurveTo(x1: number, y1: number, x: number, y: number): void;
    /**
     * Closes the path
     * @function closePath
     * @memberof opentype.Path.prototype
     */
    /**
     * Close the path
     * @function close
     * @memberof opentype.Path.prototype
     */
    close: () => void;
    closePath(): void;
    /**
     * Add the given path or list of commands to the commands of this path.
     * @param  {Path|BoundingBox|Array<object>} pathOrCommands - another opentype.Path, an opentype.BoundingBox, or an array of commands.
     */
    extend(pathOrCommands: Path | BoundingBox | Array<object>): void;
    /**
     * Calculate the bounding box of the path.
     * @returns {BoundingBox}
     */
    getBoundingBox(): BoundingBox;
    /**
     * Draw the path to a 2D context.
     * @this {Path}
     * @param {CanvasRenderingContext2D} ctx - A 2D drawing context.
     */
    draw(this: Path, ctx: CanvasRenderingContext2D): void;
    /**
     * Convert the Path to a string of path data instructions
     * See http://www.w3.org/TR/SVG/paths.html#PathData
     * @param  {object|number} [options={decimalPlaces:2, optimize:true}] - Options object (or amount of decimal places for floating-point values for backwards compatibility)
     * @return {string}
     */
    toPathData(options?: object | number): string;
    /**
     * Convert the path to an SVG <path> element, as a string.
     * @this {Path}
     * @param  {object|number} [options={decimalPlaces:2, optimize:true}] - Options object (or amount of decimal places for floating-point values for backwards compatibility)
     * @param  {string} [pathData] - will be calculated automatically, but can be provided from Glyph's wrapper function
     * @return {string}
     */
    toSVG(this: Path, options?: object | number, pathData?: string): string;
    /**
     * Convert the path to a DOM element.
     * @this {Path}
     * @param  {object|number} [options={decimalPlaces:2, optimize:true}] - Options object (or amount of decimal places for floating-point values for backwards compatibility)
     * @param  {string} [pathData] - will be calculated automatically, but can be provided from Glyph's wrapper function
     * @return {SVGPathElement}
     */
    toDOMElement(this: Path, options?: object | number, pathData?: string): SVGPathElement;
    /**
     * Get structured color path data for COLR font layers.
     * Returns an array of {d: string, fill: string} objects for each color layer,
     * or null if no color layers exist (regular monochrome path).
     * @this {Path}
     * @param  {object|number} [options={decimalPlaces:2, optimize:true}] - Options for path data generation
     * @return {Array<{d: string, fill: string}>|null}
     */
    toColorPaths(this: Path, options?: object | number): Array<{
        d: string;
        fill: string;
    }> | null;
}
declare namespace Path {
    /**
     * Generates a new Path() from an SVG path element or path notation
     * @param  {string|SVGPathElement} path
     * @param  {object} options
     */
    function fromSVG(path: string | SVGPathElement, options: object): Path;
}
import BoundingBox from './bbox.js';
//# sourceMappingURL=path.d.ts.map