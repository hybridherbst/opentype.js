export function getEncoding(platformID: any, encodingID: any, languageID: any): any;
export function getNameByID(names: any, nameID: any, allowedStandardIDs?: any[]): any;
export const nameTableNames: string[];
declare namespace _default {
    export { parseNameTable as parse };
    export { makeNameTable as make };
    export { getNameByID };
}
export default _default;
declare function parseNameTable(data: any, start: any, ltag: any): {};
declare function makeNameTable(names: any, ltag: any, options?: {}): import("../table.js").Table;
//# sourceMappingURL=name.d.ts.map