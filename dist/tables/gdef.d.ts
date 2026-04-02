declare namespace _default {
    export { parseGDEFTable as parse };
    export { makeGDEFTable as make };
}
export default _default;
declare function parseGDEFTable(data: any, start: any): {
    version: any;
    classDef: any;
    attachList: any;
    ligCaretList: any;
    markAttachClassDef: any;
};
declare function makeGDEFTable(gdef: any, fvar: any): import("../table.js").Table;
//# sourceMappingURL=gdef.d.ts.map