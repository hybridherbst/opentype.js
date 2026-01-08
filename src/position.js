// The Position object provides utility methods to manipulate
// the GPOS position table.

import Layout from './layout.js';

/**
 * @exports opentype.Position
 * @class
 * @extends opentype.Layout
 * @param {opentype.Font}
 * @constructor
 */
function Position(font) {
    Layout.call(this, font, 'gpos');
}

Position.prototype = Layout.prototype;

/**
 * Init some data for faster and easier access later.
 */
Position.prototype.init = function() {
    const script = this.getDefaultScriptName();
    this.defaultKerningTables = this.getKerningTables(script);
};

/**
 * Apply variation deltas to a value record property.
 * @param {Object} deviceOrVariationIndex - Device or VariationIndex table data
 * @param {Object} coords - Variation coordinates (optional, uses current variation if not provided)
 * @returns {number} - The delta value to add
 */
Position.prototype.getVariationDelta = function(deviceOrVariationIndex, coords) {
    if (!deviceOrVariationIndex) {
        return 0;
    }
    
    if (deviceOrVariationIndex.type === 'variationIndex') {
        // Get the ItemVariationStore from GDEF table
        const gdef = this.font.tables.gdef;
        if (!gdef || !gdef.itemVariationStore) {
            return 0;
        }
        
        // Use the variation processor to compute the delta
        if (!this.font.variation || !this.font.variation.process) {
            return 0;
        }
        
        return this.font.variation.process.getDelta(
            gdef.itemVariationStore,
            deviceOrVariationIndex.deltaSetOuterIndex,
            deviceOrVariationIndex.deltaSetInnerIndex,
            coords
        );
    } else if (deviceOrVariationIndex.type === 'device') {
        // Device tables are for non-variable fonts, used for pixel-level hinting
        // at specific sizes. We don't apply these deltas in the general case.
        return 0;
    }
    
    return 0;
};

/**
 * Apply variation deltas to a value record.
 * @param {Object} valueRecord - The value record to adjust
 * @param {Object} coords - Variation coordinates (optional)
 * @returns {Object} - The adjusted value record
 */
Position.prototype.applyVariationDeltas = function(valueRecord, coords) {
    if (!valueRecord) {
        return valueRecord;
    }
    
    // Check if this font has GPOS variations
    const gdef = this.font.tables.gdef;
    if (!gdef || !gdef.itemVariationStore) {
        return valueRecord;
    }
    
    // Create a copy of the value record with adjusted values
    const adjusted = Object.assign({}, valueRecord);
    
    if (valueRecord.xPlaDevice) {
        adjusted.xPlacement = (valueRecord.xPlacement || 0) + 
            this.getVariationDelta(valueRecord.xPlaDevice, coords);
    }
    if (valueRecord.yPlaDevice) {
        adjusted.yPlacement = (valueRecord.yPlacement || 0) + 
            this.getVariationDelta(valueRecord.yPlaDevice, coords);
    }
    if (valueRecord.xAdvDevice) {
        adjusted.xAdvance = (valueRecord.xAdvance || 0) + 
            this.getVariationDelta(valueRecord.xAdvDevice, coords);
    }
    if (valueRecord.yAdvDevice) {
        adjusted.yAdvance = (valueRecord.yAdvance || 0) + 
            this.getVariationDelta(valueRecord.yAdvDevice, coords);
    }
    
    return adjusted;
};

/**
 * Find a glyph pair in a list of lookup tables of type 2 and retrieve the xAdvance kerning value.
 *
 * @param {integer} leftIndex - left glyph index
 * @param {integer} rightIndex - right glyph index
 * @param {Object} coords - Variation coordinates (optional, for variable fonts)
 * @returns {integer}
 */
Position.prototype.getKerningValue = function(kerningLookups, leftIndex, rightIndex, coords) {
    for (let i = 0; i < kerningLookups.length; i++) {
        const subtables = kerningLookups[i].subtables;
        for (let j = 0; j < subtables.length; j++) {
            const subtable = subtables[j];
            const covIndex = this.getCoverageIndex(subtable.coverage, leftIndex);
            if (covIndex < 0) continue;
            switch (subtable.posFormat) {
                case 1: {
                    // Search Pair Adjustment Positioning Format 1
                    let pairSet = subtable.pairSets[covIndex];
                    for (let k = 0; k < pairSet.length; k++) {
                        let pair = pairSet[k];
                        if (pair.secondGlyph === rightIndex) {
                            const value1 = this.applyVariationDeltas(pair.value1, coords);
                            return value1 && value1.xAdvance || 0;
                        }
                    }
                    break;      // left glyph found, not right glyph - try next subtable
                }
                case 2: {
                    // Search Pair Adjustment Positioning Format 2
                    const class1 = this.getGlyphClass(subtable.classDef1, leftIndex);
                    const class2 = this.getGlyphClass(subtable.classDef2, rightIndex);
                    const pair = subtable.classRecords[class1][class2];
                    const value1 = this.applyVariationDeltas(pair.value1, coords);
                    return value1 && value1.xAdvance || 0;
                }
            }
        }
    }
    return 0;
};

/**
 * List all kerning lookup tables.
 *
 * @param {string} [script='DFLT'] - use font.position.getDefaultScriptName() for a better default value
 * @param {string} [language='dflt']
 * @return {object[]} The list of kerning lookup tables (may be empty), or undefined if there is no GPOS table (and we should use the kern table)
 */
Position.prototype.getKerningTables = function(script, language) {
    if (this.font.tables.gpos) {
        return this.getLookupTables(script, language, 'kern', 2);
    }
};

export default Position;
