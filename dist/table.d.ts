export const Record: typeof Table;
declare namespace _default {
    export { Table };
    export { Table as Record };
    export { Coverage };
    export { ClassDef };
    export { ScriptList };
    export { FeatureList };
    export { LookupList };
    export { ushortList };
    export { tableList };
    export { recordList };
}
export default _default;
/**
 * @exports opentype.Table
 * @class
 * @param {string} tableName
 * @param {Array} fields
 * @param {Record<string, unknown>} [options]
 * @constructor
 */
export function Table(tableName: string, fields: any[], options?: Record<string, unknown>): void;
export class Table {
    /**
     * @exports opentype.Table
     * @class
     * @param {string} tableName
     * @param {Array} fields
     * @param {Record<string, unknown>} [options]
     * @constructor
     */
    constructor(tableName: string, fields: any[], options?: Record<string, unknown>);
    tableName: string;
    fields: any[];
    /**
     * Encodes the table and returns an array of bytes
     * @return {Array}
     */
    encode(): any[];
    /**
     * Get the size of the table.
     * @return {number}
     */
    sizeOf(): number;
}
/**
 * @exports opentype.Coverage
 * @class
 * @param {Record<string, unknown>} coverageTable
 * @constructor
 */
declare function Coverage(coverageTable: Record<string, unknown>): void;
declare class Coverage {
    /**
     * @exports opentype.Coverage
     * @class
     * @param {Record<string, unknown>} coverageTable
     * @constructor
     */
    constructor(coverageTable: Record<string, unknown>);
}
/**
 * @exports opentype.ClassDef
 * @class
 * @param {Record<string, unknown>} classDefTable
 * @constructor
 *
 * @see https://learn.microsoft.com/en-us/typography/opentype/spec/chapter2#class-definition-table
 */
declare function ClassDef(classDefTable: Record<string, unknown>): void;
declare class ClassDef {
    /**
     * @exports opentype.ClassDef
     * @class
     * @param {Record<string, unknown>} classDefTable
     * @constructor
     *
     * @see https://learn.microsoft.com/en-us/typography/opentype/spec/chapter2#class-definition-table
     */
    constructor(classDefTable: Record<string, unknown>);
}
declare function ScriptList(scriptListTable: any): void;
declare class ScriptList {
    constructor(scriptListTable: any);
}
/**
 * @exports opentype.FeatureList
 * @class
 * @param {Array<{tag: string, feature: {featureParams: number, lookupListIndexes: number[]}}>} featureListTable
 * @constructor
 */
declare function FeatureList(featureListTable: Array<{
    tag: string;
    feature: {
        featureParams: number;
        lookupListIndexes: number[];
    };
}>): void;
declare class FeatureList {
    /**
     * @exports opentype.FeatureList
     * @class
     * @param {Array<{tag: string, feature: {featureParams: number, lookupListIndexes: number[]}}>} featureListTable
     * @constructor
     */
    constructor(featureListTable: Array<{
        tag: string;
        feature: {
            featureParams: number;
            lookupListIndexes: number[];
        };
    }>);
}
/**
 * @exports opentype.LookupList
 * @class
 * @param {Array<{lookupType: number, lookupFlag: number, subtables: unknown[], markFilteringSet?: number}>} lookupListTable
 * @param {Record<number, Function>} subtableMakers
 * @constructor
 */
declare function LookupList(lookupListTable: Array<{
    lookupType: number;
    lookupFlag: number;
    subtables: unknown[];
    markFilteringSet?: number;
}>, subtableMakers: Record<number, Function>): void;
declare class LookupList {
    /**
     * @exports opentype.LookupList
     * @class
     * @param {Array<{lookupType: number, lookupFlag: number, subtables: unknown[], markFilteringSet?: number}>} lookupListTable
     * @param {Record<number, Function>} subtableMakers
     * @constructor
     */
    constructor(lookupListTable: Array<{
        lookupType: number;
        lookupFlag: number;
        subtables: unknown[];
        markFilteringSet?: number;
    }>, subtableMakers: Record<number, Function>);
}
/**
 * @private
 */
declare function ushortList(itemName: any, list: any, count: any): any[];
/**
 * @private
 */
declare function tableList(itemName: any, records: any, itemCallback: any): any[];
/**
 * @private
 */
declare function recordList(itemName: any, records: any, itemCallback: any): {
    name: string;
    type: string;
    value: any;
}[];
//# sourceMappingURL=table.d.ts.map