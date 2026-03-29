declare namespace _default {
    export { parseCvtTable as parse };
    export { makeCvtTable as make };
}
export default _default;
/**
 * Parse the cvt table - this is a simple array of FWORDs (signed 16-bit values)
 * @param {DataView} data
 * @param {number} start
 * @param {number} length - table length in bytes
 * @returns {Array<number>} array of control values
 */
declare function parseCvtTable(data: DataView, start: number, length: number): Array<number>;
/**
 * Create the cvt table from an array of control values
 * @param {Array<number>} cvtData - array of signed 16-bit control values
 * @returns {object|undefined} the cvt table
 */
declare function makeCvtTable(cvtData: Array<number>): object | undefined;
//# sourceMappingURL=cvt.d.ts.map