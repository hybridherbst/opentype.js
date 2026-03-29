declare namespace _default {
    export { makeGvarTable as make };
    export { parseGvarTable as parse };
}
export default _default;
/**
 * Make a gvar table from parsed gvar data
 * @param {object} gvar - The parsed gvar table data
 * @param {object} fvar - The fvar table (for axis count)
 * @returns {object|undefined}
 */
declare function makeGvarTable(gvar: object, fvar: object): object | undefined;
declare function parseGvarTable(data: any, start: any, fvar: any, glyphs: any): {
    version: any[];
    sharedTuples: any;
    glyphVariations: {};
};
//# sourceMappingURL=gvar.d.ts.map