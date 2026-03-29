declare namespace _default {
    export { parseFpgmTable as parse };
    export { makeFpgmTable as make };
}
export default _default;
/**
 * Parse the fpgm table - this is a simple array of bytes (instructions)
 * @param {DataView} data
 * @param {number} start
 * @param {number} length - table length in bytes
 * @returns {Array<number>} array of instruction bytes
 */
declare function parseFpgmTable(data: DataView, start: number, length: number): Array<number>;
/**
 * Create the fpgm table from an array of instruction bytes
 * @param {Array<number>} fpgmData - array of unsigned 8-bit instruction bytes
 * @returns {object|undefined} the fpgm table
 */
declare function makeFpgmTable(fpgmData: Array<number>): object | undefined;
//# sourceMappingURL=fpgm.d.ts.map