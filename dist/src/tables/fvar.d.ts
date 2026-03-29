declare namespace _default {
    export { makeFvarTable as make };
    export { parseFvarTable as parse };
}
export default _default;
export type FvarAxis = {
    /**
     * - Four-character axis tag (e.g. 'wght', 'wdth')
     */
    tag: string;
    /**
     * - Minimum value for this axis
     */
    minValue: number;
    /**
     * - Default value for this axis
     */
    defaultValue: number;
    /**
     * - Maximum value for this axis
     */
    maxValue: number;
    /**
     * - Name ID for the axis name in the 'name' table
     */
    axisNameID: number;
    /**
     * - Human-readable axis name resolved from the 'name' table
     */
    name: string;
};
export type FvarInstance = {
    /**
     * - Name ID for the instance subfamily name in the 'name' table
     */
    subfamilyNameID: number;
    /**
     * - Human-readable instance name resolved from the 'name' table
     */
    name: string;
    /**
     * - Map of axis tag to coordinate value for this instance
     */
    coordinates: Record<string, number>;
    /**
     * - Optional name ID for the PostScript name (undefined if absent)
     */
    postScriptNameID: number | undefined;
    /**
     * - Optional PostScript name resolved from the 'name' table
     */
    postScriptName: string | undefined;
};
export type FvarTable = {
    /**
     * - Array of variation axes defined in the font
     */
    axes: FvarAxis[];
    /**
     * - Array of named variation instances
     */
    instances: FvarInstance[];
};
declare function makeFvarTable(fvar: any, names: any): import("../table.js").Table;
declare function parseFvarTable(data: any, start: any, names: any): {
    axes: {
        tag: string;
        minValue: any;
        defaultValue: any;
        maxValue: any;
        axisNameID: any;
        name: any;
    }[];
    instances: {
        subfamilyNameID: any;
        name: any;
        coordinates: {};
        postScriptNameID: any;
        postScriptName: any;
    }[];
};
//# sourceMappingURL=fvar.d.ts.map