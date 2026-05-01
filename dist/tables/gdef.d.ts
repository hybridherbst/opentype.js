declare namespace _default {
    export { parseGDEFTable as parse };
    export { makeGDEFTable as make };
}
export default _default;
export type GdefHeaderField = {
    name: string;
    type: string;
    value: number | null | InstanceType<typeof table.ClassDef>;
    appendPhase?: number;
};
declare function parseGDEFTable(data: any, start: any): {
    version: any;
    classDef: any;
    attachList: any;
    ligCaretList: any;
    markAttachClassDef: any;
};
declare function makeGDEFTable(gdef: any, fvar: any): import("../table.js").Table;
import table from '../table.js';
//# sourceMappingURL=gdef.d.ts.map