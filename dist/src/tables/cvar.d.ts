declare namespace _default {
    export { makeCvarTable as make };
    export { parseCvarTable as parse };
}
export default _default;
/**
 * Make a cvar table from parsed cvar data
 * @param {object} cvar - The parsed cvar table data
 * @param {object} fvar - The fvar table (for axis count)
 * @returns {object|undefined}
 */
declare function makeCvarTable(cvar: object, fvar: object): object | undefined;
declare function parseCvarTable(data: any, start: any, fvar: any, cvt: any): {
    headers: {
        variationDataSize: any;
        peakTuple: number[];
        intermediateStartTuple: number[];
        intermediateEndTuple: number[];
        flags: {
            embeddedPeakTuple: boolean;
            intermediateRegion: boolean;
            privatePointNumbers: boolean;
        };
    }[];
    version: any[];
};
//# sourceMappingURL=cvar.d.ts.map