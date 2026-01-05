import { VariationProcessor } from './variationprocessor.js';

export class VariationManager {
    constructor(font) {
        this.font = font;
        this.process = new VariationProcessor(this.font);
        this.activateDefaultVariation();
        this.getTransform = this.process.getTransform.bind(this.process);
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
     * @returns {Object} An object mapping axis tags to their default values.
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
     * @returns {integer} default index or -1
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
     * @param {integer|Object} coordinates An object where keys are axis tags and values are the corresponding variation values.
     * @returns {integer} The index of the matching instance or -1 if no match is found.
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
     * @param {integer} index - zero-based index of the variation instance
     * @returns {Object} - variation instance or null if the index is invalid.
     */
    getInstance(index) {
        return this.fvar().instances && this.fvar().instances[index];
    }

    /**
     * Set the variation coordinates to use by default for rendering in the font.defaultRenderOptions
     * @param {integer|Object} instanceIdOrObject Either the zero-based index of a variation instance or an object with axis tags as keys and variation values as values
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
     * @returns {Object}
     */
    get() {
        return Object.assign({}, this.font.defaultRenderOptions.variation);
    }

    /**
     * Helper method that returns the font's avar table if present
     * @returns {Object|undefined}
     */
    avar() {
        return this.font.tables.avar;
    }

    /**
     * Helper method that returns the font's cvar table if present
     * @returns {Object|undefined}
     */
    cvar() {
        return this.font.tables.cvar;
    }

    /**
     * Helper method that returns the font's fvar table if present
     * @returns {Object|undefined}
     */
    fvar() {
        return this.font.tables.fvar;
    }

    /**
     * Helper method that returns the font's gvar table if present
     * @returns {Object|undefined}
     */
    gvar() {
        return this.font.tables.gvar;
    }

    /**
     * Helper method that returns the font's hvar table if present
     * @returns {Object|undefined}
     */
    hvar() {
        return this.font.tables.hvar;
    }

    /**
     * Add a new variation axis to the font.
     * 
     * @param {Object} axisOptions - The axis configuration
     * @param {string} axisOptions.tag - 4-character axis tag (e.g., 'wght', 'SNAP')
     * @param {string} axisOptions.name - Human-readable name for the axis
     * @param {number} axisOptions.minValue - Minimum value for the axis
     * @param {number} axisOptions.defaultValue - Default value for the axis
     * @param {number} axisOptions.maxValue - Maximum value for the axis
     * @param {Function} [axisOptions.deltaGenerator] - Optional function(glyph, font) that returns 
     *        {deltas: number[], deltasY: number[]} for each glyph when axis is at max.
     *        If not provided, no gvar deltas are added for this axis.
     * @returns {Object} The newly added axis
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
     * @param {Object} instanceOptions - The instance configuration
     * @param {string} instanceOptions.name - Human-readable name (e.g., "Bold")
     * @param {Object} instanceOptions.coordinates - Object mapping axis tags to values
     * @returns {Object} The newly added instance
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
        
        const subfamilyNameID = this._addNameEntry(name);
        
        const newInstance = {
            subfamilyNameID,
            name: { en: name },
            coordinates: { ...coordinates }
        };
        
        fvar.instances.push(newInstance);
        return newInstance;
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
        // by adding a 0 value for the new axis dimension
        if (gvar.sharedTuples) {
            for (const tuple of gvar.sharedTuples) {
                tuple.push(0);
            }
        }
        
        for (const glyphId in gvar.glyphVariations) {
            const variation = gvar.glyphVariations[glyphId];
            if (variation && variation.headers) {
                for (const header of variation.headers) {
                    if (header.peakTuple) {
                        header.peakTuple.push(0);
                    }
                    if (header.intermediateStartTuple) {
                        header.intermediateStartTuple.push(0);
                    }
                    if (header.intermediateEndTuple) {
                        header.intermediateEndTuple.push(0);
                    }
                }
            }
        }
        
        // Default peak tuple for max value (legacy behavior)
        const defaultPeakTuple = new Array(axisCount).fill(0);
        defaultPeakTuple[axisIndex] = 1.0;
        
        // Generate deltas for each glyph
        for (let i = 0; i < font.glyphs.length; i++) {
            const glyph = font.glyphs.get(i);
            if (!glyph || !glyph.path || !glyph.path.commands || glyph.path.commands.length === 0) {
                continue;
            }
            
            const deltaResult = deltaGenerator(glyph, font);
            if (!deltaResult) {
                continue;
            }
            
            // Normalize to array format
            const deltaArray = Array.isArray(deltaResult) ? deltaResult : [deltaResult];
            
            for (const item of deltaArray) {
                if (!item.deltas && !item.deltasY) {
                    continue;
                }
                
                // Initialize glyph variation if not present
                if (!gvar.glyphVariations[i]) {
                    gvar.glyphVariations[i] = {
                        headers: []
                    };
                }
                
                // Use custom peakTuple if provided, otherwise use default
                const peakTuple = item.peakTuple ? [...item.peakTuple] : [...defaultPeakTuple];
                
                // Add new variation header
                const header = {
                    peakTuple,
                    deltas: item.deltas || [],
                    deltasY: item.deltasY || []
                };
                
                // If there are private points (subset of points affected)
                if (item.privatePoints) {
                    header.privatePoints = item.privatePoints;
                }
                
                gvar.glyphVariations[i].headers.push(header);
            }
        }
        
        // Add default max tuple to shared tuples
        gvar.sharedTuples.push([...defaultPeakTuple]);
        
        // Also add min tuple if it might be used
        const minPeakTuple = new Array(axisCount).fill(0);
        minPeakTuple[axisIndex] = -1.0;
        gvar.sharedTuples.push([...minPeakTuple]);
    }

    /**
     * Compute deltas by comparing two glyph paths.
     * This is a helper for creating deltaGenerator functions.
     * 
     * @param {Path} basePath - The base glyph path (at default axis value)
     * @param {Path} targetPath - The target glyph path (at max axis value)
     * @returns {Object} { deltas: number[], deltasY: number[] }
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