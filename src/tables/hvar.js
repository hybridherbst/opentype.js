// The `hvar` table stores variation data for the hmtx table.
// https://learn.microsoft.com/en-us/typography/opentype/spec/hvar

import parse from '../parse.js';
import table from '../table.js';
import { encode } from '../types.js';

function parseHvarTable(data, start) {
    const p = new parse.Parser(data, start);
    const tableVersionMajor = p.parseUShort();
    const tableVersionMinor = p.parseUShort();

    if (tableVersionMajor !== 1) {
        console.warn(`Unsupported hvar table version ${tableVersionMajor}.${tableVersionMinor}`);
    }

    const version = [
        tableVersionMajor, tableVersionMinor
    ];

    const itemVariationStore = p.parsePointer32(function() {
        return this.parseItemVariationStore();
    });
    const advanceWidth = p.parsePointer32(function() {
        return this.parseDeltaSetIndexMap();
    }); 
    const lsb = p.parsePointer32(function() {
        return this.parseDeltaSetIndexMap();
    }); 
    const rsb = p.parsePointer32(function() {
        return this.parseDeltaSetIndexMap();
    }); 
    
    return {
        version,
        itemVariationStore,
        advanceWidth,
        lsb,
        rsb,
    };
}

/**
 * Encode a VariationRegionList
 * @param {Array} regions - Array of regions with regionAxes
 * @returns {Array} Encoded bytes
 */
function encodeVariationRegionList(regions) {
    if (!regions || regions.length === 0) {
        return [0, 0, 0, 0]; // axisCount = 0, regionCount = 0
    }
    
    const axisCount = regions[0].regionAxes ? regions[0].regionAxes.length : 0;
    const regionCount = regions.length;
    
    const result = [];
    result.push(...encode.USHORT(axisCount));
    result.push(...encode.USHORT(regionCount));
    
    for (const region of regions) {
        for (const axis of region.regionAxes) {
            result.push(...encode.F2DOT14(axis.startCoord));
            result.push(...encode.F2DOT14(axis.peakCoord));
            result.push(...encode.F2DOT14(axis.endCoord));
        }
    }
    
    return result;
}

/**
 * Encode an ItemVariationData subtable
 * @param {object} subtable - The subtable with regionIndexes and deltaSets
 * @returns {Array} Encoded bytes
 */
function encodeItemVariationSubtable(subtable) {
    const result = [];
    
    const itemCount = subtable.deltaSets ? subtable.deltaSets.length : 0;
    const regionIndexCount = subtable.regionIndexes ? subtable.regionIndexes.length : 0;
    
    // Determine the delta format by analyzing the delta values
    // We need to find the max absolute value to decide between byte/word/long
    let maxAbsDelta = 0;
    let needsLongWords = false;
    
    if (subtable.deltaSets) {
        for (const deltaSet of subtable.deltaSets) {
            for (const delta of deltaSet) {
                const absDelta = Math.abs(delta);
                if (absDelta > maxAbsDelta) {
                    maxAbsDelta = absDelta;
                }
            }
        }
    }
    
    // Use word deltas if values exceed byte range
    let wordDeltaCount = 0;
    if (maxAbsDelta > 127) {
        wordDeltaCount = regionIndexCount;
    }
    if (maxAbsDelta > 32767) {
        needsLongWords = true;
        wordDeltaCount |= 0x8000; // LONG_WORDS flag
    }
    
    result.push(...encode.USHORT(itemCount));
    result.push(...encode.USHORT(wordDeltaCount));
    
    // Region index count and indexes
    result.push(...encode.USHORT(regionIndexCount));
    for (const idx of subtable.regionIndexes || []) {
        result.push(...encode.USHORT(idx));
    }
    
    // Delta sets
    if (subtable.deltaSets) {
        const wordCount = wordDeltaCount & 0x7FFF;
        for (const deltaSet of subtable.deltaSets) {
            for (let j = 0; j < regionIndexCount; j++) {
                const delta = deltaSet[j] || 0;
                if (j < wordCount) {
                    if (needsLongWords) {
                        result.push(...encode.LONG(delta));
                    } else {
                        result.push(...encode.SHORT(delta));
                    }
                } else {
                    if (needsLongWords) {
                        result.push(...encode.SHORT(delta));
                    } else {
                        result.push(delta & 0xFF);
                    }
                }
            }
        }
    }
    
    return result;
}

/**
 * Encode an ItemVariationStore
 * @param {object} store - The item variation store
 * @returns {Array} Encoded bytes
 */
function encodeItemVariationStore(store) {
    if (!store) {
        return [];
    }
    
    const result = [];
    
    // Format (USHORT)
    result.push(...encode.USHORT(store.format || 1));
    
    // We'll fill in offsets later
    const headerSize = 2 + 4 + 2; // format + regionListOffset + subtableCount
    const subtableOffsetArraySize = (store.itemVariationSubtables || []).length * 4;
    
    // Encode variation region list
    const regionListBytes = encodeVariationRegionList(store.variationRegions);
    
    // Encode subtables
    const subtableBytes = [];
    for (const subtable of store.itemVariationSubtables || []) {
        subtableBytes.push(encodeItemVariationSubtable(subtable));
    }
    
    // Calculate offsets
    const regionListOffset = headerSize + subtableOffsetArraySize;
    let currentOffset = regionListOffset + regionListBytes.length;
    
    const subtableOffsets = [];
    for (const bytes of subtableBytes) {
        subtableOffsets.push(currentOffset);
        currentOffset += bytes.length;
    }
    
    // Write header with offsets
    result.push(...encode.ULONG(regionListOffset));
    result.push(...encode.USHORT(subtableBytes.length));
    
    // Subtable offsets
    for (const offset of subtableOffsets) {
        result.push(...encode.ULONG(offset));
    }
    
    // Region list
    result.push(...regionListBytes);
    
    // Subtables
    for (const bytes of subtableBytes) {
        result.push(...bytes);
    }
    
    return result;
}

/**
 * Encode a DeltaSetIndexMap
 * @param {object} indexMap - The delta set index map
 * @returns {Array} Encoded bytes
 */
function encodeDeltaSetIndexMap(indexMap) {
    if (!indexMap || !indexMap.map || indexMap.map.length === 0) {
        return [];
    }
    
    const result = [];
    const map = indexMap.map;
    const mapCount = map.length;
    
    // Determine the required entry format
    let maxOuterIndex = 0;
    let maxInnerIndex = 0;
    
    for (const entry of map) {
        if (entry.outerIndex > maxOuterIndex) maxOuterIndex = entry.outerIndex;
        if (entry.innerIndex > maxInnerIndex) maxInnerIndex = entry.innerIndex;
    }
    
    // Calculate bits needed for inner index
    let innerBitCount = 0;
    let temp = maxInnerIndex;
    while (temp > 0) {
        innerBitCount++;
        temp >>= 1;
    }
    if (innerBitCount === 0) innerBitCount = 1;
    
    // Calculate total bits needed
    let outerBitCount = 0;
    temp = maxOuterIndex;
    while (temp > 0) {
        outerBitCount++;
        temp >>= 1;
    }
    
    const totalBits = innerBitCount + outerBitCount;
    let entrySize;
    if (totalBits <= 8) {
        entrySize = 1;
    } else if (totalBits <= 16) {
        entrySize = 2;
    } else if (totalBits <= 24) {
        entrySize = 3;
    } else {
        entrySize = 4;
    }
    
    // Format: 0 for short map count, 1 for long
    const format = mapCount > 65535 ? 1 : 0;
    result.push(format);
    
    // Entry format: inner index bit count - 1 in low 4 bits, entry size - 1 in high 4 bits
    const entryFormat = ((entrySize - 1) << 4) | (innerBitCount - 1);
    result.push(entryFormat);
    
    // Map count
    if (format === 0) {
        result.push(...encode.USHORT(mapCount));
    } else {
        result.push(...encode.ULONG(mapCount));
    }
    
    // Map entries
    const innerMask = (1 << innerBitCount) - 1;
    for (const entry of map) {
        const value = (entry.outerIndex << innerBitCount) | (entry.innerIndex & innerMask);
        if (entrySize === 1) {
            result.push(value & 0xFF);
        } else if (entrySize === 2) {
            result.push(...encode.USHORT(value));
        } else if (entrySize === 3) {
            result.push((value >> 16) & 0xFF);
            result.push(...encode.USHORT(value & 0xFFFF));
        } else {
            result.push(...encode.ULONG(value));
        }
    }
    
    return result;
}

/**
 * Make an hvar table from parsed hvar data
 * @param {object} hvar - The parsed hvar table data
 * @returns {table.Table|undefined}
 */
function makeHvarTable(hvar) {
    if (!hvar || !hvar.itemVariationStore) {
        return undefined;
    }
    
    // Encode the parts
    const itemVariationStoreBytes = encodeItemVariationStore(hvar.itemVariationStore);
    const advanceWidthBytes = encodeDeltaSetIndexMap(hvar.advanceWidth);
    const lsbBytes = encodeDeltaSetIndexMap(hvar.lsb);
    const rsbBytes = encodeDeltaSetIndexMap(hvar.rsb);
    
    // Calculate offsets
    // Header: 2 (majorVersion) + 2 (minorVersion) + 4 (itemVariationStoreOffset) + 
    //         4 (advanceWidthOffset) + 4 (lsbOffset) + 4 (rsbOffset) = 20 bytes
    const headerSize = 20;
    
    let currentOffset = headerSize;
    const itemVariationStoreOffset = itemVariationStoreBytes.length > 0 ? currentOffset : 0;
    currentOffset += itemVariationStoreBytes.length;
    
    const advanceWidthOffset = advanceWidthBytes.length > 0 ? currentOffset : 0;
    currentOffset += advanceWidthBytes.length;
    
    const lsbOffset = lsbBytes.length > 0 ? currentOffset : 0;
    currentOffset += lsbBytes.length;
    
    const rsbOffset = rsbBytes.length > 0 ? currentOffset : 0;
    
    // Build the table
    const result = new table.Table('HVAR', [
        { name: 'majorVersion', type: 'USHORT', value: 1 },
        { name: 'minorVersion', type: 'USHORT', value: 0 },
        { name: 'itemVariationStoreOffset', type: 'ULONG', value: itemVariationStoreOffset },
        { name: 'advanceWidthMappingOffset', type: 'ULONG', value: advanceWidthOffset },
        { name: 'lsbMappingOffset', type: 'ULONG', value: lsbOffset },
        { name: 'rsbMappingOffset', type: 'ULONG', value: rsbOffset }
    ]);
    
    // Add literal data
    if (itemVariationStoreBytes.length > 0) {
        result.fields.push({ 
            name: 'itemVariationStore', 
            type: 'LITERAL', 
            value: itemVariationStoreBytes 
        });
    }
    
    if (advanceWidthBytes.length > 0) {
        result.fields.push({ 
            name: 'advanceWidthMapping', 
            type: 'LITERAL', 
            value: advanceWidthBytes 
        });
    }
    
    if (lsbBytes.length > 0) {
        result.fields.push({ 
            name: 'lsbMapping', 
            type: 'LITERAL', 
            value: lsbBytes 
        });
    }
    
    if (rsbBytes.length > 0) {
        result.fields.push({ 
            name: 'rsbMapping', 
            type: 'LITERAL', 
            value: rsbBytes 
        });
    }
    
    return result;
}


export default { make: makeHvarTable, parse: parseHvarTable };
