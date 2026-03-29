declare namespace _default {
    export { makeSfntTable as make };
    export { fontToSfntTable as fontToTable };
    export { computeCheckSum };
}
export default _default;
declare function makeSfntTable(tables: any): import("../table.js").Table;
declare function fontToSfntTable(font: any, options?: {}): import("../table.js").Table;
declare function computeCheckSum(bytes: any): number;
//# sourceMappingURL=sfnt.d.ts.map