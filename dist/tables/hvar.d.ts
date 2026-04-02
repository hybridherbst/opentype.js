/**
 * Encode an ItemVariationStore
 * @param {object} store - The item variation store
 * @returns {Array} Encoded bytes
 */
export function encodeItemVariationStore(store: object): any[];
declare namespace _default {
    export { makeHvarTable as make };
    export { parseHvarTable as parse };
}
export default _default;
/**
 * Make an hvar table from parsed hvar data
 * @param {object} hvar - The parsed hvar table data
 * @returns {object|undefined}
 */
declare function makeHvarTable(hvar: object): object | undefined;
declare function parseHvarTable(data: any, start: any, _fvar: any): {
    version: any[];
    itemVariationStore: any;
    advanceWidth: any;
    lsb: any;
    rsb: any;
};
//# sourceMappingURL=hvar.d.ts.map