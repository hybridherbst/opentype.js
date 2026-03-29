declare namespace _default {
    export { parseGaspTable as parse };
    export { makeGaspTable as make };
}
export default _default;
declare function parseGaspTable(data: any, start: any): {
    version: any;
    numRanges: any;
    gaspRanges: any[];
};
declare function makeGaspTable(gasp: any): import("../table.js").Table;
//# sourceMappingURL=gasp.d.ts.map