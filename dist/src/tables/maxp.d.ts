declare namespace _default {
    export { parseMaxpTable as parse };
    export { makeMaxpTable as make };
}
export default _default;
declare function parseMaxpTable(data: any, start: any): {
    version: any;
    numGlyphs: any;
    maxPoints: any;
    maxContours: any;
    maxCompositePoints: any;
    maxCompositeContours: any;
    maxZones: any;
    maxTwilightPoints: any;
    maxStorage: any;
    maxFunctionDefs: any;
    maxInstructionDefs: any;
    maxStackElements: any;
    maxSizeOfInstructions: any;
    maxComponentElements: any;
    maxComponentDepth: any;
};
/**
 * Create a maxp table.
 * @param {number} numGlyphs - Number of glyphs in the font
 * @param {boolean} isTrueType - Whether this is a TrueType (glyf) font
 * @param {{maxPoints?: number, maxContours?: number, maxCompositePoints?: number, maxCompositeContours?: number, maxComponentElements?: number, maxComponentDepth?: number}} [options] - Optional parameters for TrueType fonts
 */
declare function makeMaxpTable(numGlyphs: number, isTrueType: boolean, options?: {
    maxPoints?: number;
    maxContours?: number;
    maxCompositePoints?: number;
    maxCompositeContours?: number;
    maxComponentElements?: number;
    maxComponentDepth?: number;
}): import("../table.js").Table;
//# sourceMappingURL=maxp.d.ts.map