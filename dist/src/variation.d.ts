export class VariationManager {
    /**
     * Compute deltas by comparing two glyph paths.
     * This is a helper for creating deltaGenerator functions.
     *
     * @param {{commands: Array<{type: string, x?: number, y?: number, x1?: number, y1?: number, x2?: number, y2?: number}>}} basePath - The base glyph path (at default axis value)
     * @param {{commands: Array<{type: string, x?: number, y?: number, x1?: number, y1?: number, x2?: number, y2?: number}>}} targetPath - The target glyph path (at max axis value)
     * @returns {{deltas: number[], deltasY: number[]}} { deltas: number[], deltasY: number[] }
     */
    static computeDeltas(basePath: {
        commands: Array<{
            type: string;
            x?: number;
            y?: number;
            x1?: number;
            y1?: number;
            x2?: number;
            y2?: number;
        }>;
    }, targetPath: {
        commands: Array<{
            type: string;
            x?: number;
            y?: number;
            x1?: number;
            y1?: number;
            x2?: number;
            y2?: number;
        }>;
    }): {
        deltas: number[];
        deltasY: number[];
    };
    constructor(font: any);
    font: any;
    process: VariationProcessor;
    getTransform: any;
    _hvarTuples: any[];
    _hvarTupleMap: Map<any, any>;
    /**
     * Tries to determine the default instance and sets its variation data as the font.defaultRenderOptions.
     * If not defaultInstance can be determined, the default coordinates of all axes are used.
     */
    activateDefaultVariation(): void;
    /**
     * Retrieves the default coordinates for the font's variation axes.
     * @returns {Record<string, number>} An object mapping axis tags to their default values.
     */
    getDefaultCoordinates(): Record<string, number>;
    /**
     * Gets the index of the default variation instance or -1 if not able to determine
     * @returns {number} default index or -1
     */
    getDefaultInstanceIndex(): number;
    /**
     * Retrieves the index of the variation instance matching the coordinates object or -1 if not able to determine
     * @param {number|Record<string, number>} coordinates An object where keys are axis tags and values are the corresponding variation values.
     * @returns {number} The index of the matching instance or -1 if no match is found.
     */
    getInstanceIndex(coordinates: number | Record<string, number>): number;
    /**
     * Retrieves a variation instance by its zero-based index
     * @param {number} index - zero-based index of the variation instance
     */
    getInstance(index: number): any;
    /**
     * Set the variation coordinates to use by default for rendering in the font.defaultRenderOptions
     * @param {number|object} instanceIdOrObject Either the zero-based index of a variation instance or an object with axis tags as keys and variation values as values
     */
    set(instanceIdOrObject: number | object): void;
    /**
     * Returns the variation coordinates currently set in the font.defaultRenderOptions
     * @returns {Record<string, number>}
     */
    get(): Record<string, number>;
    /** Helper method that returns the font's avar table if present */
    avar(): any;
    /** Helper method that returns the font's cvar table if present */
    cvar(): any;
    /** Helper method that returns the font's fvar table if present */
    fvar(): any;
    /** Helper method that returns the font's gvar table if present */
    gvar(): any;
    /** Helper method that returns the font's hvar table if present */
    hvar(): any;
    /**
     * Add a new variation axis to the font.
     *
     * @param {object} axisOptions - The axis configuration
     * @param {string} axisOptions.tag - 4-character axis tag (e.g., 'wght', 'SNAP')
     * @param {string} axisOptions.name - Human-readable name for the axis
     * @param {number} axisOptions.minValue - Minimum value for the axis
     * @param {number} axisOptions.defaultValue - Default value for the axis
     * @param {number} axisOptions.maxValue - Maximum value for the axis
     * @param {Function} [axisOptions.deltaGenerator] - Optional function(glyph, font) that returns
     *        {deltas: number[], deltasY: number[]} for each glyph when axis is at max.
     *        If not provided, no gvar deltas are added for this axis.
     * @returns {Record<string, unknown>} The newly added axis
     */
    addAxis(axisOptions: {
        tag: string;
        name: string;
        minValue: number;
        defaultValue: number;
        maxValue: number;
        deltaGenerator?: Function;
    }): Record<string, unknown>;
    /**
     * Add a named instance to the font's fvar table.
     *
     * @param {object} instanceOptions - The instance configuration
     * @param {string} instanceOptions.name - Human-readable name (e.g., "Bold")
     * @param {Record<string, number>} instanceOptions.coordinates - Object mapping axis tags to values
     * @returns {Record<string, unknown>} The newly added instance
     */
    addInstance(instanceOptions: {
        name: string;
        coordinates: Record<string, number>;
    }): Record<string, unknown>;
    /**
     * Ensure STAT table has axis values for all coordinates in an instance.
     * @private
     */
    private _ensureStatValuesForInstance;
    /**
     * Add a name entry to the names table and return its ID.
     * @private
     */
    private _addNameEntry;
    /**
     * Add gvar deltas for a new axis.
     * @private
     * @param {number} axisIndex - Index of the axis in fvar
     * @param {Function} deltaGenerator - Function that returns delta data for each glyph.
     *        Can return a single object {deltas, deltasY} or an array of
     *        {peakTuple, deltas, deltasY} for multiple variations (e.g., min and max).
     */
    private _addGvarDeltasForAxis;
    /**
     * Generate or update hvar table for advanceWidth variation.
     * @private
     * @param {number} axisIndex - Index of the axis in fvar
     * @param {number[]} deltasMin - Array of advanceWidth deltas per glyph (at min axis value)
     * @param {number[]} deltasMax - Array of advanceWidth deltas per glyph (at max axis value)
     * @param {boolean} hasMinDeltas - Whether there are any min direction deltas
     * @param {boolean} hasMaxDeltas - Whether there are any max direction deltas
     */
    private _generateHvarTable;
    /**
     * Finalize HVAR table after all axes have been added.
     * Must be called after all addAxis() calls to generate the HVAR table
     * with accumulated advance width deltas from ALL axes.
     */
    finalizeHvar(): void;
    /**
     * Generate HVAR table supporting multiple axes.
     * Creates one region per unique peakTuple from the delta generator.
     */
    _generateHvarTableMultiAxis(hvarTuples: any, glyphCount: any): void;
}
import { VariationProcessor } from './variationprocessor.js';
//# sourceMappingURL=variation.d.ts.map