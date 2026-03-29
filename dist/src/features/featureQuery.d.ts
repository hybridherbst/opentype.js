export default FeatureQuery;
export type GsubSubtable = import("../tables/gsub.js").GsubSubtable;
export type GsubLookupTable = import("../tables/gsub.js").GsubLookupTable;
export type FQueryParams = {
    tag: string;
    script: string;
    contextParams: ContextParams;
};
export type FQuery = {
    /**
     * feature tag
     */
    tag: string;
    /**
     * feature script
     */
    script: string;
    /**
     * context params
     */
    contextParams: ContextParams;
};
/**
 * @typedef {import('../tables/gsub.js').GsubSubtable} GsubSubtable
 */
/**
 * @typedef {import('../tables/gsub.js').GsubLookupTable} GsubLookupTable
 */
/**
 * @typedef {{ tag: string, script: string, contextParams: ContextParams }} FQueryParams
 */
/**
 * Create feature query instance
 * @param {Record<string, unknown>} font opentype font instance
 */
export function FeatureQuery(font: Record<string, unknown>): void;
export class FeatureQuery {
    /**
     * @typedef {import('../tables/gsub.js').GsubSubtable} GsubSubtable
     */
    /**
     * @typedef {import('../tables/gsub.js').GsubLookupTable} GsubLookupTable
     */
    /**
     * @typedef {{ tag: string, script: string, contextParams: ContextParams }} FQueryParams
     */
    /**
     * Create feature query instance
     * @param {Record<string, unknown>} font opentype font instance
     */
    constructor(font: Record<string, unknown>);
    font: Record<string, unknown>;
    features: {};
    /**
     * Get default script features indexes
     */
    getDefaultScriptFeaturesIndexes(): unknown;
    /**
     * Get feature indexes of a specific script
     * @param {string} scriptTag script tag
     */
    getScriptFeaturesIndexes(scriptTag: string): unknown;
    /**
     * Map a feature tag to a gsub feature
     * @param {Array<Record<string, unknown>>} features gsub features
     * @param {string} scriptTag script tag
     */
    mapTagsToFeatures(features: Array<Record<string, unknown>>, scriptTag: string): void;
    /**
     * Get features of a specific script
     * @param {string} scriptTag script tag
     */
    getScriptFeatures(scriptTag: string): any;
    /**
     * Get substitution type
     * @param {GsubLookupTable} lookupTable lookup table
     * @param {GsubSubtable} subtable subtable
     */
    getSubstitutionType(lookupTable: GsubLookupTable, subtable: GsubSubtable): string;
    /**
     * Get lookup method
     * @param {GsubLookupTable} lookupTable lookup table
     * @param {GsubSubtable} subtable subtable
     */
    getLookupMethod(lookupTable: GsubLookupTable, subtable: GsubSubtable): (glyphIndex: any) => any;
    /**
     * [ LOOKUP TYPES ]
     * -------------------------------
     * Single                        1;
     * Multiple                      2;
     * Alternate                     3;
     * Ligature                      4;
     * Context                       5;
     * ChainingContext               6;
     * ExtensionSubstitution         7;
     * ReverseChainingContext        8;
     * -------------------------------
     *
     */
    /**
     * @typedef FQuery
     * @type {object}
     * @property {string} tag feature tag
     * @property {string} script feature script
     * @property {ContextParams} contextParams context params
     */
    /**
     * Lookup a feature using a query parameters
     * @param {FQuery} query feature query
     */
    lookupFeature(query: FQuery): any[] | Error;
    /**
     * Checks if a font supports a specific features
     * @param {{script?: string, tag?: string}} query feature query object
     */
    supports(query: {
        script?: string;
        tag?: string;
    }): any;
    /**
     * Get lookup table subtables
     * @param {GsubLookupTable} lookupTable lookup table
     * @returns {GsubSubtable[] | null}
     */
    getLookupSubtables(lookupTable: GsubLookupTable): GsubSubtable[] | null;
    /**
     * Get lookup table by index
     * @param {number} index lookup table index
     */
    getLookupByIndex(index: number): unknown;
    /**
     * Get lookup tables for a feature
     * @param {Record<string, unknown>} feature
     */
    getFeatureLookups(feature: Record<string, unknown>): any[];
    /**
     * Query a feature by it's properties
     * @param {{script: string, tag: string}} query an object that describes the properties of a query
     */
    getFeature(query: {
        script: string;
        tag: string;
    }): any;
}
/**
 * Create a substitution action instance
 * @param {{id: number, tag: string, substitution: unknown}} action
 */
export function SubstitutionAction(action: {
    id: number;
    tag: string;
    substitution: unknown;
}): void;
export class SubstitutionAction {
    /**
     * Create a substitution action instance
     * @param {{id: number, tag: string, substitution: unknown}} action
     */
    constructor(action: {
        id: number;
        tag: string;
        substitution: unknown;
    });
    id: number;
    tag: string;
    substitution: unknown;
}
import { ContextParams } from '../tokenizer.js';
//# sourceMappingURL=featureQuery.d.ts.map