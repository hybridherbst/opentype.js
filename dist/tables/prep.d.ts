declare namespace _default {
    export { parsePrepTable as parse };
    export { makePrepTable as make };
}
export default _default;
/**
 * Parse the prep table - this is a simple array of bytes (instructions)
 * @param {DataView} data
 * @param {number} start
 * @param {number} length - table length in bytes
 * @returns {Array<number>} array of instruction bytes
 */
declare function parsePrepTable(data: DataView, start: number, length: number): Array<number>;
/**
 * Create the prep table from an array of instruction bytes
 * @param {Array<number>} prepData - array of unsigned 8-bit instruction bytes
 * @returns {object|undefined} the prep table
 */
declare function makePrepTable(prepData: Array<number>): object | undefined;
//# sourceMappingURL=prep.d.ts.map