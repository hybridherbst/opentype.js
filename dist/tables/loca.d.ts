declare namespace _default {
    export { parseLocaTable as parse };
    export { makeLocaTable as make };
}
export default _default;
declare function parseLocaTable(data: any, start: any, numGlyphs: any, shortVersion: any): any[];
/**
 * Make a loca table from glyph offsets.
 * @param {Array} offsets - Array of glyph offsets from glyf.make
 * @param {boolean} useShort - Whether to use short (16-bit) format
 * @returns {object} The loca table
 */
declare function makeLocaTable(offsets: any[], useShort: boolean): object;
//# sourceMappingURL=loca.d.ts.map