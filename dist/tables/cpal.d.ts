declare namespace _default {
    export { parseCpalTable as parse };
    export { makeCpalTable as make };
    export { getPaletteColor };
    export { parseColor };
    export { formatColor };
}
export default _default;
export function parseCpalTable(data: any, start: any): {
    version: any;
    numPaletteEntries: any;
    colorRecords: any[];
    colorRecordIndices: any[];
};
export function makeCpalTable({ version, numPaletteEntries, colorRecords, colorRecordIndices, paletteTypes, paletteLabels, paletteEntryLabels }: {
    version?: number;
    numPaletteEntries?: number;
    colorRecords?: any[];
    colorRecordIndices?: number[];
    paletteTypes?: any[];
    paletteLabels?: any[];
    paletteEntryLabels?: any[];
}): import("../table.js").Table;
export function getPaletteColor(font: any, index: any, palette?: number, colorFormat?: string): any;
export function parseColor(color: any, targetFormat?: string): any;
export function formatColor(bgra: any, format?: string): any;
//# sourceMappingURL=cpal.d.ts.map