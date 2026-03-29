declare namespace _default {
    export { makeAvarTable as make };
    export { parseAvarTable as parse };
}
export default _default;
declare function makeAvarTable(avar: any, fvar: any): import("../table.js").Table;
declare function parseAvarTable(data: any, start: any, fvar: any): {
    version: any[];
    axisSegmentMaps: {
        axisValueMaps: {
            fromCoordinate: number;
            toCoordinate: number;
        }[];
    }[];
};
//# sourceMappingURL=avar.d.ts.map