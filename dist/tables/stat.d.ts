declare namespace _default {
    export { makeSTATTable as make };
    export { parseSTATTable as parse };
}
export default _default;
declare function makeSTATTable(STAT: any): import("../table.js").Table;
declare function parseSTATTable(data: any, start: any, fvar: any): {
    version: any[];
    axes: any[];
    values: any[];
    elidedFallbackNameID: any;
};
//# sourceMappingURL=stat.d.ts.map