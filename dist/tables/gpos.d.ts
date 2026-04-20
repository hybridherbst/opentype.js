declare namespace _default {
    export { parseGposTable as parse };
    export { makeGposTable as make };
}
export default _default;
/**
 * A GPOS value record describing positioning adjustments.
 * Each field is optional; only fields whose corresponding bit is set in valueFormat are present.
 */
export type GposValueRecord = {
    /**
     * - x placement adjustment
     */
    xPlacement?: number;
    /**
     * - y placement adjustment
     */
    yPlacement?: number;
    /**
     * - x advance adjustment
     */
    xAdvance?: number;
    /**
     * - y advance adjustment
     */
    yAdvance?: number;
    /**
     * - raw offset to x placement device table
     */
    xPlaDeviceOffset?: number;
    /**
     * - parsed device/variation table for x placement
     */
    xPlaDevice?: object;
    /**
     * - raw offset to y placement device table
     */
    yPlaDeviceOffset?: number;
    /**
     * - parsed device/variation table for y placement
     */
    yPlaDevice?: object;
    /**
     * - raw offset to x advance device table
     */
    xAdvDeviceOffset?: number;
    /**
     * - parsed device/variation table for x advance
     */
    xAdvDevice?: object;
    /**
     * - raw offset to y advance device table
     */
    yAdvDeviceOffset?: number;
    /**
     * - parsed device/variation table for y advance
     */
    yAdvDevice?: object;
};
/**
 * An anchor point used for mark/base attachment.
 */
export type GposAnchor = {
    /**
     * - anchor format (1, 2, or 3)
     */
    format: number;
    /**
     * - x coordinate
     */
    xCoordinate: number;
    /**
     * - y coordinate
     */
    yCoordinate: number;
    /**
     * - (format 2) contour point index
     */
    anchorPoint?: number;
    /**
     * - (format 3) device/variation table for x coordinate
     */
    xDevice?: object;
    /**
     * - (format 3) device/variation table for y coordinate
     */
    yDevice?: object;
};
/**
 * A mark record: class index + anchor.
 */
export type GposMarkRecord = {
    /**
     * - mark class index
     */
    markClass: number;
    /**
     * - anchor point for the mark
     */
    markAnchor: GposAnchor | undefined;
};
/**
 * A lookup record referencing another lookup to apply at a sequence position.
 */
export type GposLookupRecord = {
    /**
     * - index into the input sequence
     */
    sequenceIndex: number;
    /**
     * - index into the lookup list
     */
    lookupListIndex: number;
};
/**
 * A single GPOS positioning subtable. Properties vary by lookup type and posFormat.
 */
export type GposSubtable = {
    /**
     * - positioning format (1 or 2 for most lookup types)
     */
    posFormat?: number;
    /**
     * - coverage table
     */
    coverage?: object;
    /**
     * - (type 1 fmt 1) single value record
     */
    value?: GposValueRecord;
    /**
     * - (type 1 fmt 2) per-glyph value records
     */
    values?: GposValueRecord[];
    /**
     * - (type 2) value format bitmask for first glyph
     */
    valueFormat1?: number;
    /**
     * - (type 2) value format bitmask for second glyph
     */
    valueFormat2?: number;
    /**
     * - (type 2 fmt 1)
     */
    pairSets?: Array<Array<{
        secondGlyph: number;
        value1: GposValueRecord;
        value2: GposValueRecord;
    }> | null>;
    /**
     * - (type 2 fmt 2) class definition for first glyph
     */
    classDef1?: object;
    /**
     * - (type 2 fmt 2) class definition for second glyph
     */
    classDef2?: object;
    /**
     * - (type 2 fmt 2) number of class 1 entries
     */
    class1Count?: number;
    /**
     * - (type 2 fmt 2) number of class 2 entries
     */
    class2Count?: number;
    /**
     * - (type 2 fmt 2)
     */
    classRecords?: Array<Array<{
        value1: GposValueRecord;
        value2: GposValueRecord;
    }>>;
    /**
     * - (type 3)
     */
    entryExitRecords?: Array<{
        entryAnchor: GposAnchor | undefined;
        exitAnchor: GposAnchor | undefined;
    }>;
    /**
     * - (types 4, 5, 6) mark coverage
     */
    markCoverage?: object;
    /**
     * - (type 4) base coverage
     */
    baseCoverage?: object;
    /**
     * - (type 5) ligature coverage
     */
    ligatureCoverage?: object;
    /**
     * - (type 6) first mark coverage
     */
    mark1Coverage?: object;
    /**
     * - (type 6) second mark coverage
     */
    mark2Coverage?: object;
    /**
     * - (types 4, 5, 6) number of mark classes
     */
    markClassCount?: number;
    /**
     * - (types 4, 5) mark array
     */
    markArray?: GposMarkRecord[];
    /**
     * - (type 6) first mark array
     */
    mark1Array?: GposMarkRecord[];
    /**
     * - (type 4) base anchors per glyph per mark class
     */
    baseArray?: Array<Array<GposAnchor | undefined>>;
    /**
     * - (type 5) ligature attach arrays
     */
    ligatureArray?: Array<Array<Array<GposAnchor | undefined>>>;
    /**
     * - (type 6) second mark anchors
     */
    mark2Array?: Array<Array<GposAnchor | undefined>>;
    /**
     * - (type 7 fmt 3) coverage tables
     */
    coverages?: object[];
    /**
     * - (type 7 fmt 3) lookup records
     */
    posLookupRecords?: GposLookupRecord[];
    /**
     * - (type 7 fmt 1)
     */
    ruleSets?: Array<Array<{
        input: number[];
        posLookupRecords: GposLookupRecord[];
    }>>;
    /**
     * - (type 7 fmt 2) class definition
     */
    classDef?: object;
    /**
     * - (type 7 fmt 2)
     */
    classSets?: Array<Array<{
        classes: number[];
        posLookupRecords: GposLookupRecord[];
    }>>;
    /**
     * - (type 9) extension: actual lookup type wrapped
     */
    lookupType?: number;
    /**
     * - (type 9) extension: actual lookup type wrapped
     */
    extensionLookupType?: number;
    /**
     * - (type 9) extension: inner subtable
     */
    extension?: GposSubtable;
    /**
     * - error message if parsing failed
     */
    error?: string;
};
/**
 * A single GPOS lookup table.
 */
export type GposLookupTable = {
    /**
     * - lookup type (1–9)
     */
    lookupType: number;
    /**
     * - lookup flags bitmask
     */
    lookupFlag: number;
    /**
     * - list of subtables
     */
    subtables: GposSubtable[];
    /**
     * - index into MarkGlyphSetsTable
     */
    markFilteringSet?: number;
};
/**
 * The top-level parsed GPOS table.
 */
export type GposTable = {
    /**
     * - table version (1 or 1.1)
     */
    version: number;
    /**
     * - script list
     */
    scripts: import("./gsub.js").ScriptRecord[];
    /**
     * - feature list
     */
    features: import("./gsub.js").FeatureRecord[];
    /**
     * - lookup list
     */
    lookups: GposLookupTable[];
    /**
     * - (version 1.1) feature variations list
     */
    variations?: object[];
};
/**
 * A GPOS value record describing positioning adjustments.
 * Each field is optional; only fields whose corresponding bit is set in valueFormat are present.
 * @typedef {object} GposValueRecord
 * @property {number} [xPlacement] - x placement adjustment
 * @property {number} [yPlacement] - y placement adjustment
 * @property {number} [xAdvance] - x advance adjustment
 * @property {number} [yAdvance] - y advance adjustment
 * @property {number} [xPlaDeviceOffset] - raw offset to x placement device table
 * @property {object} [xPlaDevice] - parsed device/variation table for x placement
 * @property {number} [yPlaDeviceOffset] - raw offset to y placement device table
 * @property {object} [yPlaDevice] - parsed device/variation table for y placement
 * @property {number} [xAdvDeviceOffset] - raw offset to x advance device table
 * @property {object} [xAdvDevice] - parsed device/variation table for x advance
 * @property {number} [yAdvDeviceOffset] - raw offset to y advance device table
 * @property {object} [yAdvDevice] - parsed device/variation table for y advance
 */
/**
 * An anchor point used for mark/base attachment.
 * @typedef {object} GposAnchor
 * @property {number} format - anchor format (1, 2, or 3)
 * @property {number} xCoordinate - x coordinate
 * @property {number} yCoordinate - y coordinate
 * @property {number} [anchorPoint] - (format 2) contour point index
 * @property {object} [xDevice] - (format 3) device/variation table for x coordinate
 * @property {object} [yDevice] - (format 3) device/variation table for y coordinate
 */
/**
 * A mark record: class index + anchor.
 * @typedef {object} GposMarkRecord
 * @property {number} markClass - mark class index
 * @property {GposAnchor|undefined} markAnchor - anchor point for the mark
 */
/**
 * A lookup record referencing another lookup to apply at a sequence position.
 * @typedef {object} GposLookupRecord
 * @property {number} sequenceIndex - index into the input sequence
 * @property {number} lookupListIndex - index into the lookup list
 */
/**
 * A single GPOS positioning subtable. Properties vary by lookup type and posFormat.
 * @typedef {object} GposSubtable
 * @property {number} [posFormat] - positioning format (1 or 2 for most lookup types)
 * @property {object} [coverage] - coverage table
 * @property {GposValueRecord} [value] - (type 1 fmt 1) single value record
 * @property {GposValueRecord[]} [values] - (type 1 fmt 2) per-glyph value records
 * @property {number} [valueFormat1] - (type 2) value format bitmask for first glyph
 * @property {number} [valueFormat2] - (type 2) value format bitmask for second glyph
 * @property {Array<Array<{secondGlyph: number, value1: GposValueRecord, value2: GposValueRecord}>|null>} [pairSets] - (type 2 fmt 1)
 * @property {object} [classDef1] - (type 2 fmt 2) class definition for first glyph
 * @property {object} [classDef2] - (type 2 fmt 2) class definition for second glyph
 * @property {number} [class1Count] - (type 2 fmt 2) number of class 1 entries
 * @property {number} [class2Count] - (type 2 fmt 2) number of class 2 entries
 * @property {Array<Array<{value1: GposValueRecord, value2: GposValueRecord}>>} [classRecords] - (type 2 fmt 2)
 * @property {Array<{entryAnchor: GposAnchor|undefined, exitAnchor: GposAnchor|undefined}>} [entryExitRecords] - (type 3)
 * @property {object} [markCoverage] - (types 4, 5, 6) mark coverage
 * @property {object} [baseCoverage] - (type 4) base coverage
 * @property {object} [ligatureCoverage] - (type 5) ligature coverage
 * @property {object} [mark1Coverage] - (type 6) first mark coverage
 * @property {object} [mark2Coverage] - (type 6) second mark coverage
 * @property {number} [markClassCount] - (types 4, 5, 6) number of mark classes
 * @property {GposMarkRecord[]} [markArray] - (types 4, 5) mark array
 * @property {GposMarkRecord[]} [mark1Array] - (type 6) first mark array
 * @property {Array<Array<GposAnchor|undefined>>} [baseArray] - (type 4) base anchors per glyph per mark class
 * @property {Array<Array<Array<GposAnchor|undefined>>>} [ligatureArray] - (type 5) ligature attach arrays
 * @property {Array<Array<GposAnchor|undefined>>} [mark2Array] - (type 6) second mark anchors
 * @property {object[]} [coverages] - (type 7 fmt 3) coverage tables
 * @property {GposLookupRecord[]} [posLookupRecords] - (type 7 fmt 3) lookup records
 * @property {Array<Array<{input: number[], posLookupRecords: GposLookupRecord[]}>>} [ruleSets] - (type 7 fmt 1)
 * @property {object} [classDef] - (type 7 fmt 2) class definition
 * @property {Array<Array<{classes: number[], posLookupRecords: GposLookupRecord[]}>>} [classSets] - (type 7 fmt 2)
 * @property {number} [lookupType] - (type 9) extension: actual lookup type wrapped
 * @property {number} [extensionLookupType] - (type 9) extension: actual lookup type wrapped
 * @property {GposSubtable} [extension] - (type 9) extension: inner subtable
 * @property {string} [error] - error message if parsing failed
 */
/**
 * A single GPOS lookup table.
 * @typedef {object} GposLookupTable
 * @property {number} lookupType - lookup type (1–9)
 * @property {number} lookupFlag - lookup flags bitmask
 * @property {GposSubtable[]} subtables - list of subtables
 * @property {number} [markFilteringSet] - index into MarkGlyphSetsTable
 */
/**
 * The top-level parsed GPOS table.
 * @typedef {object} GposTable
 * @property {number} version - table version (1 or 1.1)
 * @property {import('./gsub.js').ScriptRecord[]} scripts - script list
 * @property {import('./gsub.js').FeatureRecord[]} features - feature list
 * @property {GposLookupTable[]} lookups - lookup list
 * @property {object[]} [variations] - (version 1.1) feature variations list
 */
/**
 * @param {DataView} data
 * @param {number} [start]
 * @returns {GposTable}
 */
declare function parseGposTable(data: DataView, start?: number): GposTable;
/**
 * @param {GposTable} gpos
 * @returns {object}
 */
declare function makeGposTable(gpos: GposTable): object;
//# sourceMappingURL=gpos.d.ts.map