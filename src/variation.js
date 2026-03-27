import { VariationProcessor } from './variationprocessor.js';

export class VariationManager {
    constructor(font) {
        this.font = font;
        this.process = new VariationProcessor(this.font);
        this.activateDefaultVariation();
        this.getTransform = this.process.getTransform.bind(this.process);
        // Accumulate HVAR tuples across addAxis calls
        this._hvarTuples = [];
        this._hvarTupleMap = new Map();
    }

    /**
     * Tries to determine the default instance and sets its variation data as the font.defaultRenderOptions.
     * If not defaultInstance can be determined, the default coordinates of all axes are used.
     */
    activateDefaultVariation() {
        // Skip if no fvar table exists yet (font is being built from scratch)
        if (!this.fvar()) {
            this.font.defaultRenderOptions = this.font.defaultRenderOptions || {};
            this.font.defaultRenderOptions.variation = {};
            return;
        }
        const defaultInstance = this.getDefaultInstanceIndex();
        if (defaultInstance > -1) {
            this.set(defaultInstance);
        } else {
            this.set(this.getDefaultCoordinates());
        }
    }

    /**
     * Retrieves the default coordinates for the font's variation axes.
     * @returns {Record<string, number>} An object mapping axis tags to their default values.
     */
    getDefaultCoordinates() {
        const fvar = this.fvar();
        if (!fvar || !fvar.axes) {
            return {};
        }
        return fvar.axes.reduce((acc, axis) => {
            acc[axis.tag] = axis.defaultValue;
            return acc;
        }, {});
    }

    /**
     * Gets the index of the default variation instance or -1 if not able to determine
     * @returns {number} default index or -1
     */
    getDefaultInstanceIndex() {
        const fvar = this.fvar();
        if (!fvar || !fvar.axes) {
            return -1;
        }
        const defaultCoordinates = this.getDefaultCoordinates();
        
        let defaultInstanceIndex = this.getInstanceIndex(defaultCoordinates);
        
        if (defaultInstanceIndex < 0 && fvar.instances) {
            defaultInstanceIndex = fvar.instances.findIndex(instance => instance.name && instance.name.en === 'Regular');
        }

        return defaultInstanceIndex;
    }

    /**
     * Retrieves the index of the variation instance matching the coordinates object or -1 if not able to determine
     * @param {number|Record<string, number>} coordinates An object where keys are axis tags and values are the corresponding variation values.
     * @returns {number} The index of the matching instance or -1 if no match is found.
     */
    getInstanceIndex(coordinates) {
        const fvar = this.fvar();
        if (!fvar || !fvar.instances) {
            return -1;
        }
        return fvar.instances.findIndex(instance =>
            Object.keys(coordinates).every(axis =>
                instance.coordinates[axis] === coordinates[axis]
            )
        );
    }

    /**
     * Retrieves a variation instance by its zero-based index
     * @param {number} index - zero-based index of the variation instance
     */
    getInstance(index) {
        return this.fvar().instances && this.fvar().instances[index];
    }

    /**
     * Set the variation coordinates to use by default for rendering in the font.defaultRenderOptions
     * @param {number|object} instanceIdOrObject Either the zero-based index of a variation instance or an object with axis tags as keys and variation values as values
     */
    set(instanceIdOrObject) {
        let variationData;
        if(Number.isInteger(instanceIdOrObject)) {
            const instance = this.getInstance(instanceIdOrObject);
            if (!instance) {
                throw Error(`Invalid instance index ${instanceIdOrObject}`);
            }
            variationData = {...instance.coordinates};
        } else {
            variationData = instanceIdOrObject;
            this.process.normalizeCoordTags(variationData);
        }
        variationData = Object.assign({},
            this.font.defaultRenderOptions.variation,
            variationData
        );
        this.font.defaultRenderOptions = Object.assign({},
            this.font.defaultRenderOptions,
            {variation: variationData}
        );
    }

    /**
     * Returns the variation coordinates currently set in the font.defaultRenderOptions
     * @returns {Record<string, number>}
     */
    get() {
        return Object.assign({}, this.font.defaultRenderOptions.variation);
    }

    /** Helper method that returns the font's avar table if present */
    avar() {
        return this.font.tables.avar;
    }

    /** Helper method that returns the font's cvar table if present */
    cvar() {
        return this.font.tables.cvar;
    }

    /** Helper method that returns the font's fvar table if present */
    fvar() {
        return this.font.tables.fvar;
    }

    /** Helper method that returns the font's gvar table if present */
    gvar() {
        return this.font.tables.gvar;
    }

    /** Helper method that returns the font's hvar table if present */
    hvar() {
        return this.font.tables.hvar;
    }

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
    addAxis(axisOptions) {
        const { tag, name, minValue, defaultValue, maxValue, deltaGenerator } = axisOptions;
        
        // Validate tag
        if (!tag || tag.length !== 4) {
            throw new Error('Axis tag must be exactly 4 characters');
        }
        
        // Initialize fvar if not present
        if (!this.font.tables.fvar) {
            this.font.tables.fvar = {
                axes: [],
                instances: []
            };
        }
        
        const fvar = this.font.tables.fvar;
        
        // Check for duplicate axis
        const existingAxis = fvar.axes.find(a => a.tag === tag);
        if (existingAxis) {
            throw new Error(`Axis with tag "${tag}" already exists`);
        }
        
        // Assign a nameID (we'll need to add to names table)
        const axisNameID = this._addNameEntry(name);
        
        // Add the axis
        const newAxis = {
            tag,
            minValue,
            defaultValue,
            maxValue,
            axisNameID,
            name: { en: name }
        };
        fvar.axes.push(newAxis);
        
        // Initialize STAT if not present
        if (!this.font.tables.stat) {
            this.font.tables.stat = {
                axes: [],
                values: [],
                elidedFallbackNameID: 2 // "Regular"
            };
        }
        
        // Add axis to STAT
        const axisIndex = fvar.axes.length - 1;
        this.font.tables.stat.axes.push({
            tag,
            nameID: axisNameID,
            ordering: axisIndex
        });
        
        // Add STAT axis values for the new axis (required by Microsoft/fontspector)
        // Add at least a value for the default (and optionally min/max if they differ)
        if (!this.font.tables.stat.values) {
            this.font.tables.stat.values = [];
        }
        
        // Add a STAT value for the default position of this axis
        // Format 1: single value for one axis
        this.font.tables.stat.values.push({
            format: 1,
            axisIndex: axisIndex,
            flags: 0x0002, // ELIDABLE_AXIS_VALUE_NAME - value can be omitted when constructing name
            valueNameID: axisNameID, // Use axis name
            value: defaultValue
        });
        
        // Initialize gvar if needed and deltaGenerator is provided
        if (deltaGenerator) {
            this._addGvarDeltasForAxis(fvar.axes.length - 1, deltaGenerator);
        }
        
        // Initialize variation manager if this is the first axis
        if (!this.font.variation) {
            this.font.variation = this;
        }
        
        // Update default render options with new axis at default value
        if (this.font.defaultRenderOptions && this.font.defaultRenderOptions.variation) {
            this.font.defaultRenderOptions.variation[tag] = defaultValue;
        }
        
        return newAxis;
    }

    /**
     * Add a named instance to the font's fvar table.
     *
     * @param {object} instanceOptions - The instance configuration
     * @param {string} instanceOptions.name - Human-readable name (e.g., "Bold")
     * @param {Record<string, number>} instanceOptions.coordinates - Object mapping axis tags to values
     * @returns {Record<string, unknown>} The newly added instance
     */
    addInstance(instanceOptions) {
        const { name, coordinates } = instanceOptions;
        
        if (!this.font.tables.fvar) {
            throw new Error('Cannot add instance: no fvar table exists. Add an axis first.');
        }
        
        const fvar = this.font.tables.fvar;
        
        // Validate coordinates
        for (const axis of fvar.axes) {
            if (coordinates[axis.tag] === undefined) {
                throw new Error(`Missing coordinate for axis "${axis.tag}"`);
            }
        }
        
        // Check if this is the default instance (coordinates match default values)
        const isDefaultInstance = fvar.axes.every(axis => 
            coordinates[axis.tag] === axis.defaultValue
        );
        
        // For the default instance, use nameID 2 (fontSubfamily) as per OpenType spec
        // This is required for fontspector validation
        let subfamilyNameID;
        if (isDefaultInstance || name === 'Regular') {
            subfamilyNameID = 2; // Use standard fontSubfamily nameID
        } else {
            subfamilyNameID = this._addNameEntry(name);
        }
        
        const newInstance = {
            subfamilyNameID,
            name: { en: name },
            coordinates: { ...coordinates }
        };
        
        fvar.instances.push(newInstance);
        
        // Ensure STAT table has values for all axis coordinates used by this instance
        // This is required by Microsoft/fontspector ("fvar_STAT_axis_ranges" check)
        this._ensureStatValuesForInstance(coordinates);
        
        return newInstance;
    }
    
    /**
     * Ensure STAT table has axis values for all coordinates in an instance.
     * @private
     */
    _ensureStatValuesForInstance(coordinates) {
        if (!this.font.tables.stat) {
            this.font.tables.stat = {
                axes: [],
                values: [],
                elidedFallbackNameID: 2
            };
        }
        
        const stat = this.font.tables.stat;
        if (!stat.values) stat.values = [];
        
        const fvar = this.font.tables.fvar;
        
        for (const axis of fvar.axes) {
            const value = coordinates[axis.tag];
            const axisIndex = fvar.axes.indexOf(axis);
            
            // Check if a STAT value already exists for this axis at this value
            const existingValue = stat.values.find(v => 
                v.axisIndex === axisIndex && v.value === value
            );
            
            if (!existingValue) {
                // Add a STAT value for this axis at this coordinate
                // Use the axis nameID as the value name (simple approach)
                stat.values.push({
                    format: 1,
                    axisIndex: axisIndex,
                    flags: 0, // No special flags
                    valueNameID: axis.axisNameID,
                    value: value
                });
            }
        }
    }

    /**
     * Add a name entry to the names table and return its ID.
     * @private
     */
    _addNameEntry(name) {
        if (!this.font.names) {
            this.font.names = { windows: {}, macintosh: {} };
        }
        
        // Find the highest used nameID and use the next one
        let maxId = 255; // Start after standard name IDs
        const windows = this.font.names.windows || {};
        
        // Look through existing name records for IDs
        for (const key of Object.keys(windows)) {
            const match = key.match(/^(\d+)$/);
            if (match) {
                maxId = Math.max(maxId, parseInt(match[1]));
            }
        }
        
        const newId = maxId + 1;
        
        // Add to both platforms
        if (!this.font.names.windows) this.font.names.windows = {};
        if (!this.font.names.macintosh) this.font.names.macintosh = {};
        
        this.font.names.windows[newId] = { en: name };
        this.font.names.macintosh[newId] = { en: name };
        
        return newId;
    }

    /**
     * Add gvar deltas for a new axis.
     * @private
     * @param {number} axisIndex - Index of the axis in fvar
     * @param {Function} deltaGenerator - Function that returns delta data for each glyph.
     *        Can return a single object {deltas, deltasY} or an array of
     *        {peakTuple, deltas, deltasY} for multiple variations (e.g., min and max).
     */
    _addGvarDeltasForAxis(axisIndex, deltaGenerator) {
        const font = this.font;
        const axisCount = font.tables.fvar.axes.length;
        
        // Initialize gvar if not present
        if (!font.tables.gvar) {
            font.tables.gvar = {
                version: [1, 0],
                sharedTuples: [],
                glyphVariations: {}
            };
        }
        
        const gvar = font.tables.gvar;
        
        // Update existing shared tuples and glyph variations to account for the new axis
        // by adding a 0 value for the new axis dimension (only if they're shorter than axisCount)
        if (gvar.sharedTuples) {
            for (const tuple of gvar.sharedTuples) {
                while (tuple.length < axisCount) {
                    tuple.push(0);
                }
            }
        }
        
        for (const glyphId in gvar.glyphVariations) {
            const variation = gvar.glyphVariations[glyphId];
            if (variation && variation.headers) {
                for (const header of variation.headers) {
                    if (header.peakTuple) {
                        while (header.peakTuple.length < axisCount) {
                            header.peakTuple.push(0);
                        }
                    }
                    if (header.intermediateStartTuple) {
                        while (header.intermediateStartTuple.length < axisCount) {
                            header.intermediateStartTuple.push(0);
                        }
                    }
                    if (header.intermediateEndTuple) {
                        while (header.intermediateEndTuple.length < axisCount) {
                            header.intermediateEndTuple.push(0);
                        }
                    }
                }
            }
        }
        
        // Default peak tuple for max value (legacy behavior)
        const defaultPeakTuple = new Array(axisCount).fill(0);
        defaultPeakTuple[axisIndex] = 1.0;
        
        // Collect advance width deltas per peakTuple for multi-axis HVAR
        // Each unique peakTuple becomes a region in the ItemVariationStore
        const hvarTuples = []; // Array of { peakTuple, deltas: number[] }
        const hvarTupleMap = new Map(); // peakTuple key -> index in hvarTuples

        // Generate deltas for each glyph
        for (let i = 0; i < font.glyphs.length; i++) {
            const glyph = font.glyphs.get(i);

            const hasSimpleOutlines = glyph && glyph.path && glyph.path.commands && glyph.path.commands.length > 0;
            const isComposite = glyph && glyph.isComposite;
            if (!hasSimpleOutlines && !isComposite) {
                continue;
            }
            
            const deltaResult = deltaGenerator(glyph, font);
            if (!deltaResult) {
                continue;
            }
            
            // Normalize to array format
            const deltaArray = Array.isArray(deltaResult) ? deltaResult : [deltaResult];
            
            for (const item of deltaArray) {
                // Collect advanceWidthDelta per peakTuple for multi-axis HVAR
                if (item.advanceWidthDelta !== undefined && item.advanceWidthDelta !== 0) {
                    // Use provided peakTuple or construct default for this axis
                    const peak = item.peakTuple || defaultPeakTuple;
                    const tupleKey = peak.join(',');
                    let tupleIdx = hvarTupleMap.get(tupleKey);
                    if (tupleIdx === undefined) {
                        tupleIdx = hvarTuples.length;
                        hvarTuples.push({ peakTuple: [...peak], deltas: [] });
                        hvarTupleMap.set(tupleKey, tupleIdx);
                    }
                    // Ensure deltas array is big enough
                    while (hvarTuples[tupleIdx].deltas.length <= i) {
                        hvarTuples[tupleIdx].deltas.push(0);
                    }
                    hvarTuples[tupleIdx].deltas[i] = item.advanceWidthDelta;
                }
                
                if (!item.deltas && !item.deltasY) {
                    continue;
                }
                
                // Initialize glyph variation if not present
                // sharedPoints must be initialized (empty = all points)
                if (!gvar.glyphVariations[i]) {
                    gvar.glyphVariations[i] = {
                        headers: [],
                        sharedPoints: []
                    };
                }
                
                // Use custom peakTuple if provided, otherwise use default
                const peakTuple = item.peakTuple ? [...item.peakTuple] : [...defaultPeakTuple];
                
                // Add new variation header
                // privatePoints must be initialized (empty = all points affected)
                const header = {
                    peakTuple,
                    deltas: item.deltas || [],
                    deltasY: item.deltasY || [],
                    privatePoints: item.privatePoints || []
                };
                
                gvar.glyphVariations[i].headers.push(header);
            }
        }
        
        // Ensure all glyph indices have entries in glyphVariations
        // gvar table requires entries for ALL glyphs from 0 to numGlyphs-1
        for (let i = 0; i < font.glyphs.length; i++) {
            if (!gvar.glyphVariations[i]) {
                gvar.glyphVariations[i] = {
                    headers: [],
                    sharedPoints: []
                };
            }
        }
        
        // Add default max tuple to shared tuples
        gvar.sharedTuples.push([...defaultPeakTuple]);
        
        // Also add min tuple if it might be used
        const minPeakTuple = new Array(axisCount).fill(0);
        minPeakTuple[axisIndex] = -1.0;
        gvar.sharedTuples.push([...minPeakTuple]);
        
        // Accumulate HVAR tuples across addAxis calls
        for (const tuple of hvarTuples) {
            const key = tuple.peakTuple.join(',');
            let existIdx = this._hvarTupleMap.get(key);
            if (existIdx !== undefined) {
                // Merge deltas into existing tuple
                const existing = this._hvarTuples[existIdx];
                for (let i = 0; i < tuple.deltas.length; i++) {
                    if (tuple.deltas[i]) {
                        while (existing.deltas.length <= i) existing.deltas.push(0);
                        existing.deltas[i] = (existing.deltas[i] || 0) + tuple.deltas[i];
                    }
                }
            } else {
                existIdx = this._hvarTuples.length;
                this._hvarTuples.push({ peakTuple: [...tuple.peakTuple], deltas: [...tuple.deltas] });
                this._hvarTupleMap.set(key, existIdx);
            }
        }

        // Auto-generate HVAR from accumulated tuples (rebuilds each time, final call wins)
        if (this._hvarTuples.length > 0) {
            this._generateHvarTableMultiAxis(this._hvarTuples, font.glyphs.length);
        }
    }
    
    /**
     * Generate or update hvar table for advanceWidth variation.
     * @private
     * @param {number} axisIndex - Index of the axis in fvar
     * @param {number[]} deltasMin - Array of advanceWidth deltas per glyph (at min axis value)
     * @param {number[]} deltasMax - Array of advanceWidth deltas per glyph (at max axis value)
     * @param {boolean} hasMinDeltas - Whether there are any min direction deltas
     * @param {boolean} hasMaxDeltas - Whether there are any max direction deltas
     */
    _generateHvarTable(axisIndex, deltasMin, deltasMax, hasMinDeltas, hasMaxDeltas) {
        const font = this.font;
        const axisCount = font.tables.fvar.axes.length;
        
        const variationRegions = [];
        const regionIndexMap = {};
        let regionIndex = 0;
        
        // Create region for min direction (-1 to 0) if we have min deltas
        if (hasMinDeltas) {
            const minRegionAxes = [];
            for (let a = 0; a < axisCount; a++) {
                if (a === axisIndex) {
                    minRegionAxes.push({ startCoord: -1, peakCoord: -1, endCoord: 0 });
                } else {
                    minRegionAxes.push({ startCoord: 0, peakCoord: 0, endCoord: 0 });
                }
            }
            variationRegions.push({ regionAxes: minRegionAxes });
            regionIndexMap.min = regionIndex++;
        }
        
        // Create region for max direction (0 to 1) if we have max deltas
        if (hasMaxDeltas) {
            const maxRegionAxes = [];
            for (let a = 0; a < axisCount; a++) {
                if (a === axisIndex) {
                    maxRegionAxes.push({ startCoord: 0, peakCoord: 1, endCoord: 1 });
                } else {
                    maxRegionAxes.push({ startCoord: 0, peakCoord: 0, endCoord: 0 });
                }
            }
            variationRegions.push({ regionAxes: maxRegionAxes });
            regionIndexMap.max = regionIndex++;
        }
        
        // Build delta sets - one per glyph, with deltas for each region
        const glyphCount = Math.max(deltasMin.length, deltasMax.length);
        const deltaSets = [];
        const regionIndexes = [];
        
        if (hasMinDeltas) regionIndexes.push(regionIndexMap.min);
        if (hasMaxDeltas) regionIndexes.push(regionIndexMap.max);
        
        for (let i = 0; i < glyphCount; i++) {
            const glyphDeltas = [];
            if (hasMinDeltas) glyphDeltas.push(Math.round(deltasMin[i] || 0));
            if (hasMaxDeltas) glyphDeltas.push(Math.round(deltasMax[i] || 0));
            deltaSets.push(glyphDeltas);
        }
        
        // Build the hvar table
        font.tables.hvar = {
            version: [1, 0],
            itemVariationStore: {
                format: 1,
                variationRegions: variationRegions,
                itemVariationSubtables: [
                    {
                        regionIndexes: regionIndexes,
                        deltaSets: deltaSets
                    }
                ]
            },
            advanceWidth: {
                format: 0,
                map: deltaSets.map((_, i) => ({ outerIndex: 0, innerIndex: i }))
            }
        };
    }

    /**
     * Finalize HVAR table after all axes have been added.
     * Must be called after all addAxis() calls to generate the HVAR table
     * with accumulated advance width deltas from ALL axes.
     */
    finalizeHvar() {
        if (this._hvarTuples.length > 0) {
            this._generateHvarTableMultiAxis(this._hvarTuples, this.font.glyphs.length);
        }
    }

    /**
     * Generate HVAR table supporting multiple axes.
     * Creates one region per unique peakTuple from the delta generator.
     */
    _generateHvarTableMultiAxis(hvarTuples, glyphCount) {
        const font = this.font;
        const axisCount = font.tables.fvar.axes.length;

        // Build variation regions from peakTuples
        const variationRegions = [];
        const regionIndexes = [];
        for (let r = 0; r < hvarTuples.length; r++) {
            const peak = hvarTuples[r].peakTuple;
            const regionAxes = [];
            for (let a = 0; a < axisCount; a++) {
                const p = peak[a] || 0;
                if (p > 0) {
                    regionAxes.push({ startCoord: 0, peakCoord: p, endCoord: p });
                } else if (p < 0) {
                    regionAxes.push({ startCoord: p, peakCoord: p, endCoord: 0 });
                } else {
                    regionAxes.push({ startCoord: 0, peakCoord: 0, endCoord: 0 });
                }
            }
            variationRegions.push({ regionAxes });
            regionIndexes.push(r);
        }

        // Build delta sets — one row per glyph, one column per region
        const deltaSets = [];
        for (let i = 0; i < glyphCount; i++) {
            const row = [];
            for (let r = 0; r < hvarTuples.length; r++) {
                row.push(Math.round(hvarTuples[r].deltas[i] || 0));
            }
            deltaSets.push(row);
        }

        font.tables.hvar = {
            version: [1, 0],
            itemVariationStore: {
                format: 1,
                variationRegions,
                itemVariationSubtables: [{
                    regionIndexes,
                    deltaSets
                }]
            },
            advanceWidth: {
                format: 0,
                map: deltaSets.map((_, i) => ({ outerIndex: 0, innerIndex: i }))
            }
        };
    }

    /**
     * Compute deltas by comparing two glyph paths.
     * This is a helper for creating deltaGenerator functions.
     *
     * @param {{commands: Array<{type: string, x?: number, y?: number, x1?: number, y1?: number, x2?: number, y2?: number}>}} basePath - The base glyph path (at default axis value)
     * @param {{commands: Array<{type: string, x?: number, y?: number, x1?: number, y1?: number, x2?: number, y2?: number}>}} targetPath - The target glyph path (at max axis value)
     * @returns {{deltas: number[], deltasY: number[]}} { deltas: number[], deltasY: number[] }
     */
    static computeDeltas(basePath, targetPath) {
        const baseCommands = basePath.commands;
        const targetCommands = targetPath.commands;
        
        // Commands must match in number and type
        if (baseCommands.length !== targetCommands.length) {
            console.warn('Cannot compute deltas: command counts differ');
            return null;
        }
        
        const deltas = [];
        const deltasY = [];
        
        for (let i = 0; i < baseCommands.length; i++) {
            const base = baseCommands[i];
            const target = targetCommands[i];
            
            if (base.type !== target.type) {
                console.warn(`Cannot compute deltas: command types differ at ${i}`);
                return null;
            }
            
            // Add delta for each coordinate in the command
            if (base.x !== undefined && target.x !== undefined) {
                deltas.push(Math.round(target.x - base.x));
                deltasY.push(Math.round(target.y - base.y));
            }
            if (base.x1 !== undefined && target.x1 !== undefined) {
                deltas.push(Math.round(target.x1 - base.x1));
                deltasY.push(Math.round(target.y1 - base.y1));
            }
            if (base.x2 !== undefined && target.x2 !== undefined) {
                deltas.push(Math.round(target.x2 - base.x2));
                deltasY.push(Math.round(target.y2 - base.y2));
            }
        }
        
        // Include phantom points (4 points: LSB, RSB, TSB, BSB)
        // These should be 0 if advance widths don't change
        deltas.push(0, 0, 0, 0);
        deltasY.push(0, 0, 0, 0);
        
        return { deltas, deltasY };
    }
}