export default BoundingBox;
/**
 * A bounding box is an enclosing box that describes the smallest measure within which all the points lie.
 * It is used to calculate the bounding box of a glyph or text path.
 *
 * On initialization, x1/y1/x2/y2 will be NaN. Check if the bounding box is empty using `isEmpty()`.
 *
 * @exports opentype.BoundingBox
 * @class
 * @constructor
 */
declare function BoundingBox(): void;
declare class BoundingBox {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    /**
     * Returns true if the bounding box is empty, that is, no points have been added to the box yet.
     */
    isEmpty(): boolean;
    /**
     * Add the point to the bounding box.
     * The x1/y1/x2/y2 coordinates of the bounding box will now encompass the given point.
     * @param {number} x - The X coordinate of the point.
     * @param {number} y - The Y coordinate of the point.
     */
    addPoint(x: number, y: number): void;
    /**
     * Add a X coordinate to the bounding box.
     * This extends the bounding box to include the X coordinate.
     * This function is used internally inside of addBezier.
     * @param {number} x - The X coordinate of the point.
     */
    addX(x: number): void;
    /**
     * Add a Y coordinate to the bounding box.
     * This extends the bounding box to include the Y coordinate.
     * This function is used internally inside of addBezier.
     * @param {number} y - The Y coordinate of the point.
     */
    addY(y: number): void;
    /**
     * Add a Bézier curve to the bounding box.
     * This extends the bounding box to include the entire Bézier.
     * @param {number} x0 - The starting X coordinate.
     * @param {number} y0 - The starting Y coordinate.
     * @param {number} x1 - The X coordinate of the first control point.
     * @param {number} y1 - The Y coordinate of the first control point.
     * @param {number} x2 - The X coordinate of the second control point.
     * @param {number} y2 - The Y coordinate of the second control point.
     * @param {number} x - The ending X coordinate.
     * @param {number} y - The ending Y coordinate.
     */
    addBezier(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x: number, y: number): void;
    /**
     * Add a quadratic curve to the bounding box.
     * This extends the bounding box to include the entire quadratic curve.
     * @param {number} x0 - The starting X coordinate.
     * @param {number} y0 - The starting Y coordinate.
     * @param {number} x1 - The X coordinate of the control point.
     * @param {number} y1 - The Y coordinate of the control point.
     * @param {number} x - The ending X coordinate.
     * @param {number} y - The ending Y coordinate.
     */
    addQuad(x0: number, y0: number, x1: number, y1: number, x: number, y: number): void;
}
//# sourceMappingURL=bbox.d.ts.map