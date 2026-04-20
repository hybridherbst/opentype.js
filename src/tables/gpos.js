// The `GPOS` table contains kerning pairs, among other things.
// https://docs.microsoft.com/en-us/typography/opentype/spec/gpos

import check from '../check.js';
import { encode } from '../types.js';
import { Parser } from '../parse.js';
import table from '../table.js';
import featureVariationsTable from './featurevariations.js';

const subtableParsers = new Array(10);         // subtableParsers[0] is unused

// https://docs.microsoft.com/en-us/typography/opentype/spec/gpos#lookup-type-1-single-adjustment-positioning-subtable
// this = Parser instance
/** @this {Parser} */
subtableParsers[1] = function parseLookup1() {
    const subtableStart = this.offset + this.relativeOffset;
    const posformat = this.parseUShort();
    if (posformat === 1) {
        const coverageOffset = this.parseOffset16();
        const valueFormat = this.parseUShort();
        return {
            posFormat: 1,
            coverage: coverageOffset > 0 ? new Parser(this.data, subtableStart + coverageOffset).parseStruct(Parser.coverage) : undefined,
            value: this.parseValueRecord(valueFormat, subtableStart)
        };
    } else if (posformat === 2) {
        const coverageOffset = this.parseOffset16();
        const valueFormat = this.parseUShort();
        const valueCount = this.parseUShort();
        const values = new Array(valueCount);
        for (let i = 0; i < valueCount; i++) {
            values[i] = this.parseValueRecord(valueFormat, subtableStart);
        }
        return {
            posFormat: 2,
            coverage: coverageOffset > 0 ? new Parser(this.data, subtableStart + coverageOffset).parseStruct(Parser.coverage) : undefined,
            values: values
        };
    }
    check.assert(false, '0x' + subtableStart.toString(16) + ': GPOS lookup type 1 format must be 1 or 2.');
};

// https://docs.microsoft.com/en-us/typography/opentype/spec/gpos#lookup-type-2-pair-adjustment-positioning-subtable
/** @this {Parser} */
subtableParsers[2] = function parseLookup2() {
    const subtableStart = this.offset + this.relativeOffset;
    const posFormat = this.parseUShort();
    check.assert(posFormat === 1 || posFormat === 2, '0x' + subtableStart.toString(16) + ': GPOS lookup type 2 format must be 1 or 2.');
    const coverageOffset = this.parseOffset16();
    const coverage = coverageOffset > 0 ? new Parser(this.data, subtableStart + coverageOffset).parseStruct(Parser.coverage) : undefined;
    const valueFormat1 = this.parseUShort();
    const valueFormat2 = this.parseUShort();
    if (posFormat === 1) {
        // Adjustments for Glyph Pairs - PairPosFormat1
        // For Format 1, Device/VariationIndex offsets are relative to PairSet table
        const pairSetCount = this.parseUShort();
        const pairSetOffsets = [];
        for (let i = 0; i < pairSetCount; i++) {
            pairSetOffsets.push(this.parseOffset16());
        }
        const pairSets = [];
        for (let i = 0; i < pairSetCount; i++) {
            if (pairSetOffsets[i] === 0) {
                pairSets.push(null);
                continue;
            }
            const pairSetStart = subtableStart + pairSetOffsets[i];
            const pairSetParser = new Parser(this.data, pairSetStart);
            const pairValueCount = pairSetParser.parseUShort();
            const pairValues = [];
            for (let j = 0; j < pairValueCount; j++) {
                pairValues.push({
                    secondGlyph: pairSetParser.parseUShort(),
                    value1: pairSetParser.parseValueRecord(valueFormat1, pairSetStart),
                    value2: pairSetParser.parseValueRecord(valueFormat2, pairSetStart)
                });
            }
            pairSets.push(pairValues);
        }
        return {
            posFormat: posFormat,
            coverage: coverage,
            valueFormat1: valueFormat1,
            valueFormat2: valueFormat2,
            pairSets: pairSets
        };
    } else if (posFormat === 2) {
        // Class Pair Adjustment - PairPosFormat2
        // For Format 2, Device/VariationIndex offsets are relative to the subtable
        const classDef1Offset = this.parseOffset16();
        const classDef2Offset = this.parseOffset16();
        const classDef1 = classDef1Offset > 0 ? new Parser(this.data, subtableStart + classDef1Offset).parseStruct(Parser.classDef) : undefined;
        const classDef2 = classDef2Offset > 0 ? new Parser(this.data, subtableStart + classDef2Offset).parseStruct(Parser.classDef) : undefined;
        const class1Count = this.parseUShort();
        const class2Count = this.parseUShort();
        const classRecords = [];
        for (let i = 0; i < class1Count; i++) {
            const class2Records = [];
            for (let j = 0; j < class2Count; j++) {
                class2Records.push({
                    value1: this.parseValueRecord(valueFormat1, subtableStart),
                    value2: this.parseValueRecord(valueFormat2, subtableStart)
                });
            }
            classRecords.push(class2Records);
        }
        return {
            posFormat: posFormat,
            coverage: coverage,
            valueFormat1: valueFormat1,
            valueFormat2: valueFormat2,
            classDef1: classDef1,
            classDef2: classDef2,
            class1Count: class1Count,
            class2Count: class2Count,
            classRecords: classRecords
        };
    }
};

// https://docs.microsoft.com/en-us/typography/opentype/spec/gpos#lookup-type-3-cursive-attachment-positioning-subtable
/** @this {Parser} */
subtableParsers[3] = function parseLookup3() { return { error: 'GPOS Lookup 3 not supported' }; };

// https://docs.microsoft.com/en-us/typography/opentype/spec/gpos#lookup-type-4-mark-to-base-attachment-positioning-subtable
/** @this {Parser} */
subtableParsers[4] = function parseLookup4() {
    const subtableStart = this.offset + this.relativeOffset;
    const posFormat = this.parseUShort();
    check.assert(posFormat === 1, '0x' + subtableStart.toString(16) + ': GPOS lookup type 4 format must be 1.');
    
    const markCoverageOffset = this.parseOffset16();
    const baseCoverageOffset = this.parseOffset16();
    const markClassCount = this.parseUShort();
    const markArrayOffset = this.parseOffset16();
    const baseArrayOffset = this.parseOffset16();
    
    // Parse coverages
    const markCoverage = markCoverageOffset > 0 ? new Parser(this.data, subtableStart + markCoverageOffset).parseStruct(Parser.coverage) : undefined;
    const baseCoverage = baseCoverageOffset > 0 ? new Parser(this.data, subtableStart + baseCoverageOffset).parseStruct(Parser.coverage) : undefined;
    
    // Parse mark array
    const markArray = [];
    if (markArrayOffset > 0) {
        const markArrayParser = new Parser(this.data, subtableStart + markArrayOffset);
        const markCount = markArrayParser.parseUShort();
        for (let i = 0; i < markCount; i++) {
            const markClass = markArrayParser.parseUShort();
            const markAnchorOffset = markArrayParser.parseOffset16();
            let markAnchor;
            if (markAnchorOffset > 0) {
                const anchorParser = new Parser(this.data, subtableStart + markArrayOffset + markAnchorOffset);
                markAnchor = anchorParser.parseStruct(Parser.anchor);
            }
            markArray.push({ markClass, markAnchor });
        }
    }
    
    // Parse base array
    const baseArray = [];
    if (baseArrayOffset > 0) {
        const baseArrayParser = new Parser(this.data, subtableStart + baseArrayOffset);
        const baseCount = baseArrayParser.parseUShort();
        for (let i = 0; i < baseCount; i++) {
            const baseRecord = [];
            for (let j = 0; j < markClassCount; j++) {
                const baseAnchorOffset = baseArrayParser.parseOffset16();
                let baseAnchor;
                if (baseAnchorOffset > 0) {
                    const anchorParser = new Parser(this.data, subtableStart + baseArrayOffset + baseAnchorOffset);
                    baseAnchor = anchorParser.parseStruct(Parser.anchor);
                }
                baseRecord.push(baseAnchor);
            }
            baseArray.push(baseRecord);
        }
    }
    
    return {
        posFormat,
        markCoverage,
        baseCoverage,
        markClassCount,
        markArray,
        baseArray
    };
};

// https://docs.microsoft.com/en-us/typography/opentype/spec/gpos#lookup-type-5-mark-to-ligature-attachment-positioning-subtable
/** @this {Parser} */
subtableParsers[5] = function parseLookup5() {
    const subtableStart = this.offset + this.relativeOffset;
    const posFormat = this.parseUShort();
    check.assert(posFormat === 1, '0x' + subtableStart.toString(16) + ': GPOS lookup type 5 format must be 1.');
    
    const markCoverageOffset = this.parseOffset16();
    const ligatureCoverageOffset = this.parseOffset16();
    const markClassCount = this.parseUShort();
    const markArrayOffset = this.parseOffset16();
    const ligatureArrayOffset = this.parseOffset16();
    
    // Parse coverages
    const markCoverage = markCoverageOffset > 0 ? new Parser(this.data, subtableStart + markCoverageOffset).parseStruct(Parser.coverage) : undefined;
    const ligatureCoverage = ligatureCoverageOffset > 0 ? new Parser(this.data, subtableStart + ligatureCoverageOffset).parseStruct(Parser.coverage) : undefined;
    
    // Parse mark array (same as type 4)
    const markArray = [];
    if (markArrayOffset > 0) {
        const markArrayParser = new Parser(this.data, subtableStart + markArrayOffset);
        const markCount = markArrayParser.parseUShort();
        for (let i = 0; i < markCount; i++) {
            const markClass = markArrayParser.parseUShort();
            const markAnchorOffset = markArrayParser.parseOffset16();
            let markAnchor;
            if (markAnchorOffset > 0) {
                const anchorParser = new Parser(this.data, subtableStart + markArrayOffset + markAnchorOffset);
                markAnchor = anchorParser.parseStruct(Parser.anchor);
            }
            markArray.push({ markClass, markAnchor });
        }
    }
    
    // Parse ligature array
    const ligatureArray = [];
    if (ligatureArrayOffset > 0) {
        const ligatureArrayParser = new Parser(this.data, subtableStart + ligatureArrayOffset);
        const ligatureCount = ligatureArrayParser.parseUShort();
        for (let i = 0; i < ligatureCount; i++) {
            const ligatureAttachOffset = ligatureArrayParser.parseOffset16();
            const ligatureAttach = [];
            if (ligatureAttachOffset > 0) {
                const attachParser = new Parser(this.data, subtableStart + ligatureArrayOffset + ligatureAttachOffset);
                const componentCount = attachParser.parseUShort();
                for (let compIdx = 0; compIdx < componentCount; compIdx++) {
                    const componentRecord = [];
                    for (let j = 0; j < markClassCount; j++) {
                        const componentAnchorOffset = attachParser.parseOffset16();
                        let componentAnchor;
                        if (componentAnchorOffset > 0) {
                            const anchorParser = new Parser(this.data, subtableStart + ligatureArrayOffset + ligatureAttachOffset + componentAnchorOffset);
                            componentAnchor = anchorParser.parseStruct(Parser.anchor);
                        }
                        componentRecord.push(componentAnchor);
                    }
                    ligatureAttach.push(componentRecord);
                }
            }
            ligatureArray.push(ligatureAttach);
        }
    }
    
    return {
        posFormat,
        markCoverage,
        ligatureCoverage,
        markClassCount,
        markArray,
        ligatureArray
    };
};

// https://docs.microsoft.com/en-us/typography/opentype/spec/gpos#lookup-type-6-mark-to-mark-attachment-positioning-subtable
/** @this {Parser} */
subtableParsers[6] = function parseLookup6() {
    const subtableStart = this.offset + this.relativeOffset;
    const posFormat = this.parseUShort();
    check.assert(posFormat === 1, '0x' + subtableStart.toString(16) + ': GPOS lookup type 6 format must be 1.');
    
    const mark1CoverageOffset = this.parseOffset16();
    const mark2CoverageOffset = this.parseOffset16();
    const markClassCount = this.parseUShort();
    const mark1ArrayOffset = this.parseOffset16();
    const mark2ArrayOffset = this.parseOffset16();
    
    // Parse coverages
    const mark1Coverage = mark1CoverageOffset > 0 ? new Parser(this.data, subtableStart + mark1CoverageOffset).parseStruct(Parser.coverage) : undefined;
    const mark2Coverage = mark2CoverageOffset > 0 ? new Parser(this.data, subtableStart + mark2CoverageOffset).parseStruct(Parser.coverage) : undefined;
    
    // Parse mark1 array
    const mark1Array = [];
    if (mark1ArrayOffset > 0) {
        const mark1ArrayParser = new Parser(this.data, subtableStart + mark1ArrayOffset);
        const mark1Count = mark1ArrayParser.parseUShort();
        for (let i = 0; i < mark1Count; i++) {
            const markClass = mark1ArrayParser.parseUShort();
            const mark1AnchorOffset = mark1ArrayParser.parseOffset16();
            let mark1Anchor;
            if (mark1AnchorOffset > 0) {
                const anchorParser = new Parser(this.data, subtableStart + mark1ArrayOffset + mark1AnchorOffset);
                mark1Anchor = anchorParser.parseStruct(Parser.anchor);
            }
            mark1Array.push({ markClass, markAnchor: mark1Anchor });
        }
    }
    
    // Parse mark2 array
    const mark2Array = [];
    if (mark2ArrayOffset > 0) {
        const mark2ArrayParser = new Parser(this.data, subtableStart + mark2ArrayOffset);
        const mark2Count = mark2ArrayParser.parseUShort();
        for (let i = 0; i < mark2Count; i++) {
            const mark2Record = [];
            for (let j = 0; j < markClassCount; j++) {
                const mark2AnchorOffset = mark2ArrayParser.parseOffset16();
                let mark2Anchor;
                if (mark2AnchorOffset > 0) {
                    const anchorParser = new Parser(this.data, subtableStart + mark2ArrayOffset + mark2AnchorOffset);
                    mark2Anchor = anchorParser.parseStruct(Parser.anchor);
                }
                mark2Record.push(mark2Anchor);
            }
            mark2Array.push(mark2Record);
        }
    }
    
    return {
        posFormat,
        mark1Coverage,
        mark2Coverage,
        markClassCount,
        mark1Array,
        mark2Array
    };
};

/** @this {Parser} */
subtableParsers[7] = function parseLookup7() { return { error: 'GPOS Lookup 7 not supported' }; };
/** @this {Parser} */
subtableParsers[8] = function parseLookup8() { return { error: 'GPOS Lookup 8 not supported' }; };
// Extension Positioning subtable (lookup type 9)
// https://docs.microsoft.com/en-us/typography/opentype/spec/gpos#lookup-type-9-extension-positioning-subtable
/** @this {Parser} */
subtableParsers[9] = function parseLookup9() {
    let posFormat;
    let extensionLookupType;
    let extensionOffset;
    try {
        posFormat = this.parseUShort();
        check.argument(posFormat === 1, 'GPOS Extension Positioning subtable identifier-format must be 1');
        extensionLookupType = this.parseUShort();
        extensionOffset = this.parseULong();
    } catch (err) {
        if (err instanceof RangeError) {
            return { error: 'GPOS extension subtable truncated' };
        }
        throw err;
    }

    const extensionStart = this.offset + extensionOffset;
    if (!subtableParsers[extensionLookupType]) {
        return { error: 'Unsupported GPOS extension lookup type ' + extensionLookupType };
    }
    if (extensionOffset === 0 || extensionStart < 0 || extensionStart >= this.data.byteLength) {
        return { error: 'Invalid GPOS extension offset ' + extensionOffset };
    }

    const extensionParser = new Parser(this.data, extensionStart);
    let extension;
    try {
        extension = subtableParsers[extensionLookupType].call(extensionParser);
    } catch (err) {
        if (err instanceof RangeError) {
            return { error: 'GPOS extension parse out of bounds' };
        }
        throw err;
    }
    return {
        posFormat: 1,
        lookupType: extensionLookupType,
        extensionLookupType: extensionLookupType,
        extension: extension
    };
};

// ---- Type definitions ----

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

// https://docs.microsoft.com/en-us/typography/opentype/spec/gpos
/**
 * @param {DataView} data
 * @param {number} [start]
 * @returns {GposTable}
 */
function parseGposTable(data, start) {
    start = start || 0;
    const p = new Parser(data, start);
    const tableVersion = p.parseVersion(1);
    check.argument(tableVersion === 1 || tableVersion === 1.1, 'Unsupported GPOS table version ' + tableVersion);

    if (tableVersion === 1) {
        return {
            version: tableVersion,
            scripts: p.parseScriptList(),
            features: p.parseFeatureList(),
            lookups: p.parseLookupList(subtableParsers)
        };
    } else {
        return {
            version: tableVersion,
            scripts: p.parseScriptList(),
            features: p.parseFeatureList(),
            lookups: p.parseLookupList(subtableParsers),
            variations: p.parseFeatureVariationsList()
        };
    }

}

// GPOS Writing //////////////////////////////////////////////

const subtableMakers = new Array(10);

// Helper to create an Anchor table
// https://docs.microsoft.com/en-us/typography/opentype/spec/gpos#anchor-table
function makeAnchor(anchor) {
    if (!anchor) return null;
    
    const format = anchor.format || 1;
    const fields = [
        {name: 'anchorFormat', type: 'USHORT', value: format},
        {name: 'xCoordinate', type: 'SHORT', value: anchor.xCoordinate || 0},
        {name: 'yCoordinate', type: 'SHORT', value: anchor.yCoordinate || 0}
    ];
    
    if (format === 2) {
        fields.push({name: 'anchorPoint', type: 'USHORT', value: anchor.anchorPoint || 0});
    } else if (format === 3) {
        fields.push({name: 'xDeviceTableOffset', type: 'OFFSET16', value: makeDeviceOrVariationIndexTable(anchor.xDevice)});
        fields.push({name: 'yDeviceTableOffset', type: 'OFFSET16', value: makeDeviceOrVariationIndexTable(anchor.yDevice)});
    }
    
    return new table.Table('anchorTable', fields);
}

// Helper to create a Coverage table
// https://docs.microsoft.com/en-us/typography/opentype/spec/gpos#coverage-table
function makeCoverageTable(coverage) {
    if (!coverage) return null;
    
    // Use the built-in Coverage constructor which handles both format 1 and format 2
    return new table.Coverage(coverage);
}

// Helper to infer valueFormat bitmask from parsed value record fields
function inferValueFormat(value) {
    if (!value) return 0;
    let format = 0;
    if ('xPlacement' in value) format |= 0x0001;
    if ('yPlacement' in value) format |= 0x0002;
    if ('xAdvance' in value) format |= 0x0004;
    if ('yAdvance' in value) format |= 0x0008;
    if ('xPlaDevice' in value || 'xPlaDeviceOffset' in value) format |= 0x0010;
    if ('yPlaDevice' in value || 'yPlaDeviceOffset' in value) format |= 0x0020;
    if ('xAdvDevice' in value || 'xAdvDeviceOffset' in value) format |= 0x0040;
    if ('yAdvDevice' in value || 'yAdvDeviceOffset' in value) format |= 0x0080;
    return format;
}

// Helper to write inline value record fields based on valueFormat
function valueRecordFields(prefix, value, valueFormat) {
    const fields = [];
    if (valueFormat & 0x0001) fields.push({name: prefix + 'xPlacement', type: 'SHORT', value: value?.xPlacement || 0});
    if (valueFormat & 0x0002) fields.push({name: prefix + 'yPlacement', type: 'SHORT', value: value?.yPlacement || 0});
    if (valueFormat & 0x0004) fields.push({name: prefix + 'xAdvance', type: 'SHORT', value: value?.xAdvance || 0});
    if (valueFormat & 0x0008) fields.push({name: prefix + 'yAdvance', type: 'SHORT', value: value?.yAdvance || 0});
    if (valueFormat & 0x0010) fields.push({name: prefix + 'xPlaDevOff', type: 'OFFSET16', value: makeDeviceOrVariationIndexTable(value?.xPlaDevice)});
    if (valueFormat & 0x0020) fields.push({name: prefix + 'yPlaDevOff', type: 'OFFSET16', value: makeDeviceOrVariationIndexTable(value?.yPlaDevice)});
    if (valueFormat & 0x0040) fields.push({name: prefix + 'xAdvDevOff', type: 'OFFSET16', value: makeDeviceOrVariationIndexTable(value?.xAdvDevice)});
    if (valueFormat & 0x0080) fields.push({name: prefix + 'yAdvDevOff', type: 'OFFSET16', value: makeDeviceOrVariationIndexTable(value?.yAdvDevice)});
    return fields;
}

function packDeviceTableWords(device) {
    const fields = [];
    const values = device.deltaValues || [];
    const bitsPerValue = [0, 2, 4, 8][device.deltaFormat] || 2;
    const valuesPerWord = 16 / bitsPerValue;
    const mask = (1 << bitsPerValue) - 1;
    for (let i = 0; i < values.length; i += valuesPerWord) {
        let word = 0;
        for (let j = 0; j < valuesPerWord && (i + j) < values.length; j++) {
            let v = values[i + j];
            if (v < 0) v += (1 << bitsPerValue);
            word |= (v & mask) << (16 - bitsPerValue * (j + 1));
        }
        fields.push({name: 'deltaValueWord' + (i / valuesPerWord), type: 'USHORT', value: word});
    }
    return fields;
}

// https://docs.microsoft.com/en-us/typography/opentype/spec/chapter2#device-and-variationindex-tables
function makeDeviceOrVariationIndexTable(device) {
    if (!device) return null;
    if (device.type === 'variationIndex') {
        return new table.Table('variationIndexTable', [
            {name: 'deltaSetOuterIndex', type: 'USHORT', value: device.deltaSetOuterIndex || 0},
            {name: 'deltaSetInnerIndex', type: 'USHORT', value: device.deltaSetInnerIndex || 0},
            {name: 'deltaFormat', type: 'USHORT', value: device.deltaFormat || 0}
        ]);
    }
    if (device.type === 'device') {
        return new table.Table('deviceTable', [
            {name: 'startSize', type: 'USHORT', value: device.startSize || 0},
            {name: 'endSize', type: 'USHORT', value: device.endSize || 0},
            {name: 'deltaFormat', type: 'USHORT', value: device.deltaFormat || 0}
        ].concat(packDeviceTableWords(device)));
    }
    check.assert(false, 'Unsupported GPOS device table type ' + device.type + '.');
    return null;
}

function makePairSetTable(pairSet, valueFormat1, valueFormat2, pairSetIndex) {
    const fields = [
        {name: 'pairValueCount', type: 'USHORT', value: pairSet.length}
    ];
    for (let i = 0; i < pairSet.length; i++) {
        const pair = pairSet[i] || {};
        const prefix = 'pairSet' + pairSetIndex + 'Pair' + i + '_';
        fields.push({name: prefix + 'secondGlyph', type: 'USHORT', value: pair.secondGlyph || 0});
        fields.push(...valueRecordFields(prefix + 'value1_', pair.value1, valueFormat1));
        fields.push(...valueRecordFields(prefix + 'value2_', pair.value2, valueFormat2));
    }
    return new table.Table('pairSetTable', fields);
}

// Lookup Type 1: Single Adjustment Positioning
// https://docs.microsoft.com/en-us/typography/opentype/spec/gpos#lookup-type-1-single-adjustment-positioning-subtable
subtableMakers[1] = function makeLookup1(subtable) {
    if (subtable.posFormat === 1) {
        // Format 1: single value record applied to all glyphs in coverage
        const valueFormat = inferValueFormat(subtable.value);
        return new table.Table('singlePosFormat1', [
            {name: 'posFormat', type: 'USHORT', value: 1},
            {name: 'coverage', type: 'TABLE', value: new table.Coverage(subtable.coverage)},
            {name: 'valueFormat', type: 'USHORT', value: valueFormat}
        ].concat(valueRecordFields('v_', subtable.value, valueFormat)));
    } else if (subtable.posFormat === 2) {
        // Format 2: per-glyph value records
        const values = subtable.values || [];
        let valueFormat = 0;
        for (const v of values) {
            valueFormat |= inferValueFormat(v);
        }
        const vFields = [];
        for (let i = 0; i < values.length; i++) {
            vFields.push(...valueRecordFields('v' + i + '_', values[i], valueFormat));
        }
        return new table.Table('singlePosFormat2', [
            {name: 'posFormat', type: 'USHORT', value: 2},
            {name: 'coverage', type: 'TABLE', value: new table.Coverage(subtable.coverage)},
            {name: 'valueFormat', type: 'USHORT', value: valueFormat},
            {name: 'valueCount', type: 'USHORT', value: values.length}
        ].concat(vFields));
    }
    check.assert(false, 'GPOS lookup type 1 posFormat must be 1 or 2.');
};

// Lookup Type 2: Pair Adjustment Positioning (Kerning)
// https://docs.microsoft.com/en-us/typography/opentype/spec/gpos#lookup-type-2-pair-adjustment-positioning-subtable
subtableMakers[2] = function makeLookup2(subtable) {
    check.assert(subtable.posFormat === 1 || subtable.posFormat === 2,
        'Lookup type 2 posFormat must be 1 or 2.');

    if (subtable.posFormat === 1) {
        const pairSets = subtable.pairSets || [];
        const valueFormat1 = subtable.valueFormat1 || 0;
        const valueFormat2 = subtable.valueFormat2 || 0;
        const fields = [
            {name: 'posFormat', type: 'USHORT', value: 1},
            {name: 'coverage', type: 'TABLE', value: new table.Coverage(subtable.coverage), appendPhase: 1},
            {name: 'valueFormat1', type: 'USHORT', value: valueFormat1},
            {name: 'valueFormat2', type: 'USHORT', value: valueFormat2},
            {name: 'pairSetCount', type: 'USHORT', value: pairSets.length}
        ];
        for (let i = 0; i < pairSets.length; i++) {
            fields.push({
                name: 'pairSet' + i,
                type: 'TABLE',
                value: pairSets[i] ? makePairSetTable(pairSets[i], valueFormat1, valueFormat2, i) : null
            });
        }
        return new table.Table('pairPosFormat1', fields);
    } else {
        const valueFormat1 = subtable.valueFormat1 || 0;
        const valueFormat2 = subtable.valueFormat2 || 0;
        const class1Count = subtable.class1Count || 0;
        const class2Count = subtable.class2Count || 0;
        const classRecords = subtable.classRecords || [];
        const fields = [
            {name: 'posFormat', type: 'USHORT', value: 2},
            {name: 'coverage', type: 'TABLE', value: new table.Coverage(subtable.coverage)},
            {name: 'valueFormat1', type: 'USHORT', value: valueFormat1},
            {name: 'valueFormat2', type: 'USHORT', value: valueFormat2},
            {name: 'classDef1', type: 'TABLE', value: subtable.classDef1 ? new table.ClassDef(subtable.classDef1) : null},
            {name: 'classDef2', type: 'TABLE', value: subtable.classDef2 ? new table.ClassDef(subtable.classDef2) : null},
            {name: 'class1Count', type: 'USHORT', value: class1Count},
            {name: 'class2Count', type: 'USHORT', value: class2Count}
        ];
        for (let i = 0; i < class1Count; i++) {
            const class2Records = classRecords[i] || [];
            for (let j = 0; j < class2Count; j++) {
                const record = class2Records[j] || {};
                const prefix = 'class1_' + i + '_class2_' + j + '_';
                fields.push(...valueRecordFields(prefix + 'value1_', record.value1, valueFormat1));
                fields.push(...valueRecordFields(prefix + 'value2_', record.value2, valueFormat2));
            }
        }
        return new table.Table('pairPosFormat2', fields);
    }
};

// Lookup Type 3: Cursive Attachment Positioning
// https://docs.microsoft.com/en-us/typography/opentype/spec/gpos#lookup-type-3-cursive-attachment-positioning-subtable
subtableMakers[3] = function makeLookup3(subtable) {
    check.assert(subtable.posFormat === 1, 'Lookup type 3 posFormat must be 1.');

    const coverageTable = makeCoverageTable(subtable.coverage);
    const coverageSize = /** @type {{ sizeOf: () => number }} */ (/** @type {unknown} */ (coverageTable))?.sizeOf() || 0;
    const entryExitCount = subtable.entryExitRecords?.length || 0;

    const anchorTables = [];
    if (subtable.entryExitRecords) {
        for (let i = 0; i < subtable.entryExitRecords.length; i++) {
            const record = subtable.entryExitRecords[i];
            record._entryAnchorTable = makeAnchor(record.entryAnchor);
            record._exitAnchorTable = makeAnchor(record.exitAnchor);
            anchorTables.push(
                record._entryAnchorTable?.sizeOf() || 0,
                record._exitAnchorTable?.sizeOf() || 0
            );
        }
    }

    const headerSize = 6;
    const entryExitRecordsSize = entryExitCount * 4;

    let currentOffset = headerSize + coverageSize + entryExitRecordsSize;
    const entryExitRecordFields = [];
    if (subtable.entryExitRecords) {
        for (let i = 0; i < subtable.entryExitRecords.length; i++) {
            const record = subtable.entryExitRecords[i];
            const entrySize = record._entryAnchorTable?.sizeOf() || 0;
            const exitSize = record._exitAnchorTable?.sizeOf() || 0;

            entryExitRecordFields.push(
                { name: `entryAnchorOffset${i}`, type: 'USHORT', value: entrySize > 0 ? currentOffset : 0 }
            );
            currentOffset += entrySize;

            entryExitRecordFields.push(
                { name: `exitAnchorOffset${i}`, type: 'USHORT', value: exitSize > 0 ? currentOffset : 0 }
            );
            currentOffset += exitSize;
        }
    }

    const fields = [
        { name: 'posFormat', type: 'USHORT', value: 1 },
        { name: 'coverageOffset', type: 'USHORT', value: headerSize },
        { name: 'entryExitCount', type: 'USHORT', value: entryExitCount }
    ];

    if (coverageTable) {
        fields.push({ name: 'coverage', type: 'TABLE', value: coverageTable });
    }

    fields.push(...entryExitRecordFields);

    if (subtable.entryExitRecords) {
        for (let i = 0; i < subtable.entryExitRecords.length; i++) {
            const record = subtable.entryExitRecords[i];
            if (record._entryAnchorTable) {
                fields.push({ name: `entryAnchor${i}`, type: 'TABLE', value: record._entryAnchorTable });
            }
            if (record._exitAnchorTable) {
                fields.push({ name: `exitAnchor${i}`, type: 'TABLE', value: record._exitAnchorTable });
            }
        }
    }

    return new table.Table('cursivePosTable', fields);
};

// Lookup Type 4: Mark-to-Base Attachment Positioning
// https://docs.microsoft.com/en-us/typography/opentype/spec/gpos#lookup-type-4-mark-to-base-attachment-positioning-subtable
subtableMakers[4] = function makeLookup4(subtable) {
    if (!subtable || !subtable.posFormat) {
        return new table.Table('markToBaseTable', [
            { name: 'posFormat', type: 'USHORT', value: 1 }
        ]);
    }
    
    check.assert(subtable.posFormat === 1, 'Lookup type 4 posFormat must be 1.');
    
    const markClassCount = subtable.markClassCount || 1;
    
    // Build MarkArray subtable
    const markArrayFields = [
        { name: 'markCount', type: 'USHORT', value: subtable.markArray?.length || 0 }
    ];
    if (subtable.markArray) {
        for (let i = 0; i < subtable.markArray.length; i++) {
            const rec = subtable.markArray[i];
            markArrayFields.push(
                { name: 'markClass_' + i, type: 'USHORT', value: rec.markClass || 0 },
                { name: 'markAnchor_' + i, type: 'TABLE', value: makeAnchor(rec.markAnchor) }
            );
        }
    }
    const markArrayTable = new table.Table('markArray', markArrayFields);
    
    // Build BaseArray subtable
    const baseArrayFields = [
        { name: 'baseCount', type: 'USHORT', value: subtable.baseArray?.length || 0 }
    ];
    if (subtable.baseArray) {
        for (let i = 0; i < subtable.baseArray.length; i++) {
            const baseRecord = subtable.baseArray[i];
            for (let c = 0; c < markClassCount; c++) {
                const anchor = baseRecord ? baseRecord[c] : null;
                baseArrayFields.push(
                    { name: 'baseAnchor_' + i + '_' + c, type: 'TABLE', value: makeAnchor(anchor) }
                );
            }
        }
    }
    const baseArrayTable = new table.Table('baseArray', baseArrayFields);
    
    return new table.Table('markToBaseTable', [
        { name: 'posFormat', type: 'USHORT', value: 1 },
        { name: 'markCoverage', type: 'TABLE', value: new table.Coverage(subtable.markCoverage) },
        { name: 'baseCoverage', type: 'TABLE', value: new table.Coverage(subtable.baseCoverage) },
        { name: 'markClassCount', type: 'USHORT', value: markClassCount },
        { name: 'markArray', type: 'TABLE', value: markArrayTable },
        { name: 'baseArray', type: 'TABLE', value: baseArrayTable }
    ]);
};
subtableMakers[5] = function makeLookup5(subtable) {
    if (!subtable || !subtable.posFormat) {
        return new table.Table('markToLigatureTable', [
            { name: 'posFormat', type: 'USHORT', value: 1 }
        ]);
    }

    check.assert(subtable.posFormat === 1, 'Lookup type 5 posFormat must be 1.');

    const markClassCount = subtable.markClassCount || 1;

    // Build MarkArray subtable (identical to type 4)
    const markArrayFields = [
        { name: 'markCount', type: 'USHORT', value: subtable.markArray?.length || 0 }
    ];
    if (subtable.markArray) {
        for (let i = 0; i < subtable.markArray.length; i++) {
            const rec = subtable.markArray[i];
            markArrayFields.push(
                { name: 'markClass_' + i, type: 'USHORT', value: rec.markClass || 0 },
                { name: 'markAnchor_' + i, type: 'TABLE', value: makeAnchor(rec.markAnchor) }
            );
        }
    }
    const markArrayTable = new table.Table('markArray', markArrayFields);

    // Build LigatureArray subtable
    // LigatureArray → LigatureAttach[] → ComponentRecord[] → anchor[markClassCount]
    const ligatureAttachTables = [];
    if (subtable.ligatureArray) {
        for (let i = 0; i < subtable.ligatureArray.length; i++) {
            const components = subtable.ligatureArray[i]; // array of ComponentRecords
            const attachFields = [
                { name: 'componentCount', type: 'USHORT', value: components?.length || 0 }
            ];
            if (components) {
                for (let compIdx = 0; compIdx < components.length; compIdx++) {
                    const componentRecord = components[compIdx]; // array of markClassCount anchors
                    for (let c = 0; c < markClassCount; c++) {
                        const anchor = componentRecord ? componentRecord[c] : null;
                        attachFields.push(
                            { name: 'anchor_' + i + '_' + compIdx + '_' + c, type: 'TABLE', value: makeAnchor(anchor) }
                        );
                    }
                }
            }
            ligatureAttachTables.push(new table.Table('ligatureAttach_' + i, attachFields));
        }
    }

    /** @type {Array<{name: string, type: string, value: unknown}>} */
    const ligatureArrayFields = [
        { name: 'ligatureCount', type: 'USHORT', value: ligatureAttachTables.length }
    ];
    for (let i = 0; i < ligatureAttachTables.length; i++) {
        ligatureArrayFields.push(
            { name: 'ligatureAttach_' + i, type: 'TABLE', value: ligatureAttachTables[i] }
        );
    }
    const ligatureArrayTable = new table.Table('ligatureArray', ligatureArrayFields);

    return new table.Table('markToLigatureTable', [
        { name: 'posFormat', type: 'USHORT', value: 1 },
        { name: 'markCoverage', type: 'TABLE', value: new table.Coverage(subtable.markCoverage) },
        { name: 'ligatureCoverage', type: 'TABLE', value: new table.Coverage(subtable.ligatureCoverage) },
        { name: 'markClassCount', type: 'USHORT', value: markClassCount },
        { name: 'markArray', type: 'TABLE', value: markArrayTable },
        { name: 'ligatureArray', type: 'TABLE', value: ligatureArrayTable }
    ]);
};

// Lookup Type 6: Mark-to-Mark Attachment Positioning
subtableMakers[6] = function makeLookup6(subtable) {
    check.assert(subtable.posFormat === 1, 'Lookup type 6 posFormat must be 1.');
    
    const markClassCount = subtable.markClassCount || 1;
    
    // Build Mark1Array subtable
    const mark1ArrayFields = [
        { name: 'mark1Count', type: 'USHORT', value: subtable.mark1Array?.length || 0 }
    ];
    if (subtable.mark1Array) {
        for (let i = 0; i < subtable.mark1Array.length; i++) {
            const rec = subtable.mark1Array[i];
            mark1ArrayFields.push(
                { name: 'markClass_' + i, type: 'USHORT', value: rec.markClass || 0 },
                { name: 'mark1Anchor_' + i, type: 'TABLE', value: makeAnchor(rec.markAnchor) }
            );
        }
    }
    const mark1ArrayTable = new table.Table('mark1Array', mark1ArrayFields);
    
    // Build Mark2Array subtable
    const mark2ArrayFields = [
        { name: 'mark2Count', type: 'USHORT', value: subtable.mark2Array?.length || 0 }
    ];
    if (subtable.mark2Array) {
        for (let i = 0; i < subtable.mark2Array.length; i++) {
            const mark2Record = subtable.mark2Array[i];
            for (let c = 0; c < markClassCount; c++) {
                const anchor = mark2Record[c];
                mark2ArrayFields.push(
                    { name: 'mark2Anchor_' + i + '_' + c, type: 'TABLE', value: makeAnchor(anchor) }
                );
            }
        }
    }
    const mark2ArrayTable = new table.Table('mark2Array', mark2ArrayFields);
    
    return new table.Table('markToMarkTable', [
        { name: 'posFormat', type: 'USHORT', value: 1 },
        { name: 'mark1Coverage', type: 'TABLE', value: new table.Coverage(subtable.mark1Coverage) },
        { name: 'mark2Coverage', type: 'TABLE', value: new table.Coverage(subtable.mark2Coverage) },
        { name: 'markClassCount', type: 'USHORT', value: markClassCount },
        { name: 'mark1Array', type: 'TABLE', value: mark1ArrayTable },
        { name: 'mark2Array', type: 'TABLE', value: mark2ArrayTable }
    ]);
};

// Lookup Type 7: Context Positioning
// https://docs.microsoft.com/en-us/typography/opentype/spec/gpos#lookup-type-7-contextual-positioning-subtable
subtableMakers[7] = function makeLookup7(subtable) {
    if (subtable.posFormat === 1) {
        const coverageTable = makeCoverageTable(subtable.coverage);
        
        return new table.Table('contextualPosTable', [
            { name: 'posFormat', type: 'USHORT', value: 1 },
            { name: 'coverageOffset', type: 'USHORT', value: 0 },
            { name: 'posRuleSetCount', type: 'USHORT', value: subtable.ruleSets?.length || 0 }
        ].concat(coverageTable ? [{ name: 'coverage', type: 'TABLE', value: coverageTable }] : []).concat(table.tableList('posRuleSet', subtable.ruleSets || [], function(posRuleSet) {
            if (!posRuleSet) {
                return new table.Table('NULL', null);
            }
            return new table.Table('posRuleSetTable', table.tableList('posRule', posRuleSet, function(posRule) {
                let tableData = [
                    { name: 'glyphCount', type: 'USHORT', value: (posRule.input?.length || 0) + 1 },
                    { name: 'posCount', type: 'USHORT', value: posRule.posLookupRecords?.length || 0 }
                ];

                tableData = tableData.concat(table.ushortList('inputSequence', posRule.input, (posRule.input?.length || 0) + 1));

                for (let i = 0; i < (posRule.posLookupRecords?.length || 0); i++) {
                    const record = posRule.posLookupRecords[i];
                    tableData = tableData
                        .concat({ name: 'sequenceIndex' + i, type: 'USHORT', value: record.sequenceIndex })
                        .concat({ name: 'lookupListIndex' + i, type: 'USHORT', value: record.lookupListIndex });
                }
                return new table.Table('posRuleTable', tableData);
            }));
        })));
    } else if (subtable.posFormat === 2) {
        const coverageTable = makeCoverageTable(subtable.coverage);
        const classDefTable = subtable.classDef ? new table.ClassDef(subtable.classDef) : null;

        return new table.Table('contextualPosTable', [
            { name: 'posFormat', type: 'USHORT', value: 2 },
            { name: 'coverageOffset', type: 'USHORT', value: 0 },
            { name: 'classDefOffset', type: 'USHORT', value: 0 },
            { name: 'posClassSetCount', type: 'USHORT', value: subtable.classSets?.length || 0 }
        ].concat(coverageTable ? [{ name: 'coverage', type: 'TABLE', value: coverageTable }] : [])
            .concat(classDefTable ? [{ name: 'classDef', type: 'TABLE', value: classDefTable }] : [])
            .concat(table.tableList('posClassSet', subtable.classSets || [], function(posClassSet) {
                if (!posClassSet) {
                    return new table.Table('NULL', null);
                }
                return new table.Table('posClassSetTable', table.tableList('posClassRule', posClassSet, function(posClassRule) {
                    let tableData = [
                        { name: 'glyphCount', type: 'USHORT', value: (posClassRule.classes?.length || 0) + 1 },
                        { name: 'posCount', type: 'USHORT', value: posClassRule.posLookupRecords?.length || 0 }
                    ];

                    tableData = tableData.concat(table.ushortList('classSequence', posClassRule.classes, (posClassRule.classes?.length || 0) + 1));

                    for (let i = 0; i < (posClassRule.posLookupRecords?.length || 0); i++) {
                        const record = posClassRule.posLookupRecords[i];
                        tableData = tableData
                            .concat({ name: 'sequenceIndex' + i, type: 'USHORT', value: record.sequenceIndex })
                            .concat({ name: 'lookupListIndex' + i, type: 'USHORT', value: record.lookupListIndex });
                    }
                    return new table.Table('posClassRuleTable', tableData);
                }));
            })));
    } else if (subtable.posFormat === 3) {
        let tableData = [
            { name: 'posFormat', type: 'USHORT', value: 3 },
            { name: 'glyphCount', type: 'USHORT', value: subtable.coverages?.length || 0 },
            { name: 'posCount', type: 'USHORT', value: subtable.posLookupRecords?.length || 0 }
        ];

        for (let i = 0; i < (subtable.coverages?.length || 0); i++) {
            const coverage = subtable.coverages[i];
            tableData.push({ name: 'inputCoverageOffset' + i, type: 'USHORT', value: 0 });
            if (coverage) {
                tableData.push({ name: 'inputCoverage' + i, type: 'TABLE', value: new table.Coverage(coverage) });
            }
        }

        for (let i = 0; i < (subtable.posLookupRecords?.length || 0); i++) {
            const record = subtable.posLookupRecords[i];
            tableData = tableData
                .concat({ name: 'sequenceIndex' + i, type: 'USHORT', value: record.sequenceIndex })
                .concat({ name: 'lookupListIndex' + i, type: 'USHORT', value: record.lookupListIndex });
        }

        return new table.Table('contextualPosTable', tableData);
    }

    check.assert(false, 'GPOS lookup type 7 posFormat must be 1, 2 or 3.');
};

// Lookup Type 8: Chaining Context Positioning
// https://docs.microsoft.com/en-us/typography/opentype/spec/gpos#lookup-type-8-chaining-context-positioning-subtable
subtableMakers[8] = function makeLookup8(subtable) {
    // Format 1: Coverage-based chaining context
    if (subtable.posFormat === 1) {
        // Build Coverage tables
        const backtrackCoverageTable = makeCoverageTable(subtable.backtrackCoverage);
        const inputCoverageTable = makeCoverageTable(subtable.inputCoverage);
        
        // Calculate sizes
        const headerSize = 6; // posFormat + backtrackCount + inputCount + lookaheadCount + reserved
        const backtrackSize = /** @type {{ sizeOf: () => number }} */ (/** @type {unknown} */ (backtrackCoverageTable))?.sizeOf() || 0;
        const inputSize = /** @type {{ sizeOf: () => number }} */ (/** @type {unknown} */ (inputCoverageTable))?.sizeOf() || 0;
        
        // Build position rules if present
        const posRules = subtable.posRuleSet || [];
        
        // For now, create a minimal valid table
        // Full implementation would require proper position rule construction
        return new table.Table('chainingContextTable', [
            { name: 'posFormat', type: 'USHORT', value: 1 },
            { name: 'backtrackCoverageOffset', type: 'USHORT', value: headerSize },
            { name: 'inputCoverageOffset', type: 'USHORT', value: headerSize + backtrackSize },
            { name: 'lookaheadCoverageOffset', type: 'USHORT', value: headerSize + backtrackSize + inputSize },
            { name: 'posRuleSetCount', type: 'USHORT', value: posRules.length }
        ]);
    } else if (subtable.posFormat === 2) {
        const coverageTable = makeCoverageTable(subtable.coverage);
        const backtrackClassDef = subtable.backtrackClassDef ? new table.ClassDef(subtable.backtrackClassDef) : null;
        const inputClassDef = subtable.inputClassDef ? new table.ClassDef(subtable.inputClassDef) : null;
        const lookaheadClassDef = subtable.lookaheadClassDef ? new table.ClassDef(subtable.lookaheadClassDef) : null;

        return new table.Table('chainContextPosTable', [
            { name: 'posFormat', type: 'USHORT', value: 2 },
            { name: 'coverageOffset', type: 'USHORT', value: 0 },
            { name: 'backtrackClassDefOffset', type: 'USHORT', value: 0 },
            { name: 'inputClassDefOffset', type: 'USHORT', value: 0 },
            { name: 'lookaheadClassDefOffset', type: 'USHORT', value: 0 },
            { name: 'chainPosClassSetCount', type: 'USHORT', value: subtable.chainClassSet?.length || 0 }
        ].concat(coverageTable ? [{ name: 'coverage', type: 'TABLE', value: coverageTable }] : [])
            .concat(backtrackClassDef ? [{ name: 'backtrackClassDef', type: 'TABLE', value: backtrackClassDef }] : [])
            .concat(inputClassDef ? [{ name: 'inputClassDef', type: 'TABLE', value: inputClassDef }] : [])
            .concat(lookaheadClassDef ? [{ name: 'lookaheadClassDef', type: 'TABLE', value: lookaheadClassDef }] : [])
            .concat(table.tableList('chainPosClassSet', subtable.chainClassSet || [], function(chainPosClassSet) {
                if (!chainPosClassSet) {
                    return new table.Table('NULL', null);
                }
                return new table.Table('chainPosClassSetTable', table.tableList('chainPosClassRule', chainPosClassSet, function(chainPosClassRule) {
                    let tableData = table.ushortList('backtrackClass', chainPosClassRule.backtrack, chainPosClassRule.backtrack?.length || 0)
                        .concat(table.ushortList('inputClass', chainPosClassRule.input, (chainPosClassRule.input?.length || 0) + 1))
                        .concat(table.ushortList('lookaheadClass', chainPosClassRule.lookahead, chainPosClassRule.lookahead?.length || 0))
                        .concat(table.ushortList('posCount', [], chainPosClassRule.posLookupRecords?.length || 0));

                    for (let i = 0; i < (chainPosClassRule.posLookupRecords?.length || 0); i++) {
                        const record = chainPosClassRule.posLookupRecords[i];
                        tableData = tableData
                            .concat({ name: 'sequenceIndex' + i, type: 'USHORT', value: record.sequenceIndex })
                            .concat({ name: 'lookupListIndex' + i, type: 'USHORT', value: record.lookupListIndex });
                    }
                    return new table.Table('chainPosClassRuleTable', tableData);
                }));
            })));
    } else if (subtable.posFormat === 3) {
        let tableData = [
            { name: 'posFormat', type: 'USHORT', value: 3 },
            { name: 'backtrackGlyphCount', type: 'USHORT', value: subtable.backtrackCoverage?.length || 0 }
        ];

        for (let i = 0; i < (subtable.backtrackCoverage?.length || 0); i++) {
            const coverage = subtable.backtrackCoverage[i];
            tableData.push({ name: 'backtrackCoverageOffset' + i, type: 'USHORT', value: 0 });
            if (coverage) {
                tableData.push({ name: 'backtrackCoverage' + i, type: 'TABLE', value: new table.Coverage(coverage) });
            }
        }

        tableData.push({ name: 'inputGlyphCount', type: 'USHORT', value: subtable.inputCoverage?.length || 0 });

        for (let i = 0; i < (subtable.inputCoverage?.length || 0); i++) {
            const coverage = subtable.inputCoverage[i];
            tableData.push({ name: 'inputCoverageOffset' + i, type: 'USHORT', value: 0 });
            if (coverage) {
                tableData.push({ name: 'inputCoverage' + i, type: 'TABLE', value: new table.Coverage(coverage) });
            }
        }

        tableData.push({ name: 'lookaheadGlyphCount', type: 'USHORT', value: subtable.lookaheadCoverage?.length || 0 });

        for (let i = 0; i < (subtable.lookaheadCoverage?.length || 0); i++) {
            const coverage = subtable.lookaheadCoverage[i];
            tableData.push({ name: 'lookaheadCoverageOffset' + i, type: 'USHORT', value: 0 });
            if (coverage) {
                tableData.push({ name: 'lookaheadCoverage' + i, type: 'TABLE', value: new table.Coverage(coverage) });
            }
        }

        tableData.push({ name: 'posCount', type: 'USHORT', value: subtable.posLookupRecords?.length || 0 });

        for (let i = 0; i < (subtable.posLookupRecords?.length || 0); i++) {
            const record = subtable.posLookupRecords[i];
            tableData = tableData
                .concat({ name: 'sequenceIndex' + i, type: 'USHORT', value: record.sequenceIndex })
                .concat({ name: 'lookupListIndex' + i, type: 'USHORT', value: record.lookupListIndex });
        }

        return new table.Table('chainContextPosTable', tableData);
    }

    check.assert(false, 'GPOS lookup type 8 posFormat must be 1, 2 or 3.');
};

// Lookup Type 9: Extension Positioning
// https://docs.microsoft.com/en-us/typography/opentype/spec/gpos#lookup-type-9-extension-positioning-subtable
// The inner subtable is encoded as a first-class 32-bit offset reference from
// the extension header rather than being emitted and patched in a custom pass.
subtableMakers[9] = function makeLookup9(subtable) {
    // Handle error case from parser (unsupported lookup type)
    if (!subtable || subtable.error || subtable.posFormat === undefined) {
        return new table.Table('extensionPosTable', [
            { name: 'posFormat', type: 'USHORT', value: 1 },
            { name: 'extensionLookupType', type: 'USHORT', value: 0 },
            { name: 'extensionOffset', type: 'ULONG', value: 0 }
        ]);
    }

    check.argument(subtable.posFormat === 1, 'Extension positioning format must be 1');
    const extLookupType = subtable.extensionLookupType;
    check.argument(extLookupType && extLookupType !== 9, 'Extension cannot wrap another extension');

    // Get the maker for the actual lookup type
    const actualMaker = subtableMakers[extLookupType];
    check.assert(actualMaker, 'No maker for extension lookup type ' + extLookupType);

    // Get the actual subtable data
    const extSubtable = subtable.extensionSubtable || subtable.extension;

    if (extSubtable && !extSubtable.error) {
        const actualTable = actualMaker(extSubtable);
        return new table.Table('extensionPosTable', [
            { name: 'posFormat', type: 'USHORT', value: 1 },
            { name: 'extensionLookupType', type: 'USHORT', value: extLookupType },
            { name: 'extensionOffset', type: 'OFFSET32', value: actualTable, targetScope: 'root' }
        ]);
    }

    // No subtable data available
    return new table.Table('extensionPosTable', [
        { name: 'posFormat', type: 'USHORT', value: 1 },
        { name: 'extensionLookupType', type: 'USHORT', value: extLookupType || 0 },
        { name: 'extensionOffset', type: 'ULONG', value: 0 }
    ]);
};

/**
 * @param {GposTable} gpos
 * @returns {object}
 */
function makeGposTable(gpos) {
    const hasFeatureVariations = gpos.variations && gpos.variations.length > 0;
    /** @type {Array<{name: string, type: string, value?: unknown}>} */
    const fields = [
        {name: 'version', type: 'ULONG', value: hasFeatureVariations ? 0x00010001 : 0x10000},
        {name: 'scripts', type: 'TABLE', value: new table.ScriptList(gpos.scripts)},
        {name: 'features', type: 'TABLE', value: new table.FeatureList(gpos.features)},
        {name: 'lookups', type: 'TABLE', value: new table.LookupList(gpos.lookups, subtableMakers)}
    ];

    if (hasFeatureVariations) {
        fields.push({
            name: 'featureVariations',
            type: 'OFFSET32',
            value: featureVariationsTable.make(gpos.variations)
        });
    }

    return new table.Table('GPOS', fields);
}

export default { parse: parseGposTable, make: makeGposTable };
