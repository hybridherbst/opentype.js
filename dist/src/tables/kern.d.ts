declare namespace _default {
    export { parseKernTable as parse };
    export { makeKernTable as make };
}
export default _default;
declare function parseKernTable(data: any, start: any): {};
/**
 * Make a kern table from kerning pairs.
 * Creates a Windows format (version 0) kern table with format 0 subtable.
 * @param {Record<string, number>} kerningPairs - Object with keys 'leftIndex,rightIndex' and values as kerning amounts
 * @returns {object|null} The kern table, or null if no pairs
 */
declare function makeKernTable(kerningPairs: Record<string, number>): object | null;
//# sourceMappingURL=kern.d.ts.map