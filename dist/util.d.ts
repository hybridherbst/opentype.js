export function isBrowser(): boolean;
export function isNode(): boolean;
export function checkArgument(expression: any, message: any): void;
export function arraysEqual(ar1: any, ar2: any): boolean;
export function objectsEqual(obj1: any, obj2: any): boolean;
export function binarySearch(array: any, key: any, value: any): any;
export function binarySearchIndex(array: any, key: any, value: any): number;
export function binarySearchInsert(array: any, key: any, value: any): number;
/**
 * [GZIP File Format Specification](https://datatracker.ietf.org/doc/html/rfc1952#section-2.3)
 * @param {Uint8Array} buf
 * @returns {boolean}
 */
export function isGzip(buf: Uint8Array): boolean;
/**
 * [GZIP File Format Specification](https://datatracker.ietf.org/doc/html/rfc1952#section-2.3)
 * @param {Uint8Array} gzip
 * @returns {Uint8Array}
 */
export function unGzip(gzip: Uint8Array): Uint8Array;
export function copyPoint(p: any): {
    x: any;
    y: any;
    onCurve: any;
    lastPointOfContour: any;
};
export function copyComponent(c: any): {
    glyphIndex: any;
    xScale: any;
    scale01: any;
    scale10: any;
    yScale: any;
    dx: any;
    dy: any;
};
export function chunkArray(array: any, chunks: any): any;
//# sourceMappingURL=util.d.ts.map