declare namespace _default {
    export { parsePostTable as parse };
    export { makePostTable as make };
}
export default _default;
declare function parsePostTable(data: any, start: any): {
    version: any;
    italicAngle: any;
    underlinePosition: any;
    underlineThickness: any;
    isFixedPitch: any;
    minMemType42: any;
    maxMemType42: any;
    minMemType1: any;
    maxMemType1: any;
    names: any[] | string[];
    numberOfGlyphs: any;
    glyphNameIndex: any[];
    offset: any[];
};
declare function makePostTable(font: any, options?: {}): import("../table.js").Table;
//# sourceMappingURL=post.d.ts.map