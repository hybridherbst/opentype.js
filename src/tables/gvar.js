// The `gvar` table stores information on how to modify glyf outlines across the variation space
// https://learn.microsoft.com/en-us/typography/opentype/spec/gvar

import parse from '../parse.js';
import table from '../table.js';
import { encode } from '../types.js';

function parseGvarTable(data, start, fvar, glyphs) {
    const p = new parse.Parser(data, start);
    const tableVersionMajor = p.parseUShort();
    const tableVersionMinor = p.parseUShort();
    if (tableVersionMajor !== 1) {
        console.warn(`Unsupported gvar table version ${tableVersionMajor}.${tableVersionMinor}`);
    }
    const axisCount = p.parseUShort();
    if(axisCount !== fvar.axes.length) {
        console.warn(`axisCount ${axisCount} in gvar table does not match the number of axes ${fvar.axes.length} in the fvar table!`);
    }
    const sharedTupleCount = p.parseUShort();

    const sharedTuples = p.parsePointer32(function() {
        return this.parseTupleRecords(sharedTupleCount, axisCount);
    });

    const glyphVariations = p.parseTupleVariationStoreList(axisCount, 'gvar', glyphs);

    return {
        version: [tableVersionMajor, tableVersionMinor],
        sharedTuples,
        glyphVariations
    };
}

/**
 * Encode a tuple record (array of F2DOT14 values)
 */
function encodeTuple(tuple) {
    const result = [];
    for (let i = 0; i < tuple.length; i++) {
        result.push(...encode.F2DOT14(tuple[i]));
    }
    return result;
}

/**
 * Encode a TupleVariationHeader
 * @param {object} header - The header object from parsed gvar data
 * @param {number} axisCount - Number of axes
 * @param {number} variationDataSize - Size of the serialized data for this tuple
 * @param {Map} sharedTupleMap - Map from tuple string to shared tuple index
 * @param {Array} originalSharedTuples - Original shared tuples array to resolve indices
 * @param {boolean} hasPrivatePointNumbers - Whether private point numbers are embedded in data
 * @returns {Array} Encoded bytes
 */
function encodeTupleVariationHeader(header, axisCount, variationDataSize, sharedTupleMap, originalSharedTuples, hasPrivatePointNumbers) {
    const result = [];
    
    // variationDataSize (uint16)
    result.push(...encode.USHORT(variationDataSize));
    
    // Build tupleIndex flags
    let tupleIndex = 0;
    
    // Set PRIVATE_POINT_NUMBERS flag if we have point numbers in serialized data
    if (hasPrivatePointNumbers) {
        tupleIndex |= 0x2000; // PRIVATE_POINT_NUMBERS
    }
    
    // Check for intermediate region
    const hasIntermediate = header.intermediateStartTuple && header.intermediateEndTuple;
    if (hasIntermediate) {
        tupleIndex |= 0x4000; // INTERMEDIATE_REGION
    }
    
    // Resolve peak tuple - either from header or from shared tuples
    let peakTuple = header.peakTuple;
    if (!peakTuple && header.sharedTupleRecordsIndex !== undefined && originalSharedTuples) {
        peakTuple = originalSharedTuples[header.sharedTupleRecordsIndex];
    }
    
    // Check if peak tuple is shared or embedded
    let useEmbeddedPeak = true;
    if (peakTuple && sharedTupleMap) {
        const tupleKey = peakTuple.join(',');
        if (sharedTupleMap.has(tupleKey)) {
            useEmbeddedPeak = false;
            tupleIndex |= sharedTupleMap.get(tupleKey);
        }
    }
    
    if (useEmbeddedPeak) {
        tupleIndex |= 0x8000; // EMBEDDED_PEAK_TUPLE
    }
    
    result.push(...encode.USHORT(tupleIndex));
    
    // Peak tuple (if embedded)
    if (useEmbeddedPeak && peakTuple) {
        result.push(...encodeTuple(peakTuple));
    }
    
    // Intermediate start and end tuples
    if (hasIntermediate) {
        result.push(...encodeTuple(header.intermediateStartTuple));
        result.push(...encodeTuple(header.intermediateEndTuple));
    }
    
    return result;
}

/**
 * Encode the serialized data for a TupleVariationTable
 * @param {object} header - The header object
 * @param {boolean} usePrivatePoints - Whether private points are used
 * @returns {Array} Encoded bytes
 */
function encodeTupleSerializedData(header, usePrivatePoints) {
    const result = [];
    
    // Private point numbers (if used)
    if (usePrivatePoints && header.privatePoints && header.privatePoints.length > 0) {
        result.push(...encode.PACKEDPOINTS(header.privatePoints, false));
    } else if (usePrivatePoints) {
        // All points
        result.push(...encode.PACKEDPOINTS([], true));
    }
    
    // Packed deltas for X coordinates
    if (header.deltas) {
        result.push(...encode.VARDELTAS(header.deltas));
    }
    
    // Packed deltas for Y coordinates (gvar only)
    if (header.deltasY) {
        result.push(...encode.VARDELTAS(header.deltasY));
    }
    
    return result;
}

/**
 * Build a set of shared tuples from all glyph variations
 * @param {object} glyphVariations - The glyphVariations object
 * @returns {Array} Array of unique tuples sorted by frequency
 */
function buildSharedTuples(glyphVariations, existingSharedTuples) {
    // Use existing shared tuples if available
    if (existingSharedTuples && existingSharedTuples.length > 0) {
        return existingSharedTuples;
    }
    
    // Count tuple frequencies
    const tupleCounts = new Map();
    
    for (const glyphId in glyphVariations) {
        const variation = glyphVariations[glyphId];
        if (!variation || !variation.headers) continue;
        
        for (const header of variation.headers) {
            if (header.peakTuple) {
                const key = header.peakTuple.join(',');
                tupleCounts.set(key, (tupleCounts.get(key) || 0) + 1);
            }
        }
    }
    
    // Only include tuples that appear multiple times
    const sharedTuples = [];
    for (const [key, count] of tupleCounts) {
        if (count > 1) {
            sharedTuples.push({
                tuple: key.split(',').map(Number),
                count: count
            });
        }
    }
    
    // Sort by frequency (most common first) and limit to 4095 entries
    sharedTuples.sort((a, b) => b.count - a.count);
    return sharedTuples.slice(0, 4095).map(t => t.tuple);
}

/**
 * Encode a GlyphVariationData table for a single glyph
 * @param {object} variation - The variation data for this glyph
 * @param {number} axisCount - Number of axes
 * @param {Map} sharedTupleMap - Map from tuple string to shared tuple index
 * @param {Array} originalSharedTuples - Original shared tuples array to resolve indices
 * @returns {Array} Encoded bytes
 */
function encodeGlyphVariationData(variation, axisCount, sharedTupleMap, originalSharedTuples) {
    if (!variation || !variation.headers || variation.headers.length === 0) {
        return [];
    }
    
    const headers = variation.headers;
    const hasSharedPoints = variation.sharedPoints && variation.sharedPoints.length > 0;
    
    // First, encode all the serialized data to get sizes
    const serializedDataParts = [];
    const usePrivatePointsArray = [];
    for (const header of headers) {
        const usePrivatePoints = !!header.privatePointNumbers || (header.privatePoints && header.privatePoints.length > 0);
        const data = encodeTupleSerializedData(header, usePrivatePoints);
        usePrivatePointsArray.push(usePrivatePoints);
        serializedDataParts.push(data);
    }
    
    // Encode headers
    const tupleVariationHeaders = [];
    for (let i = 0; i < headers.length; i++) {
        const header = headers[i];
        const headerBytes = encodeTupleVariationHeader(
            header, 
            axisCount, 
            serializedDataParts[i].length,
            sharedTupleMap,
            originalSharedTuples,
            usePrivatePointsArray[i]
        );
        tupleVariationHeaders.push(...headerBytes);
    }
    
    // Build complete GlyphVariationData
    const result = [];
    
    // tupleVariationCount with flags
    let tupleVariationCount = headers.length & 0x0FFF;
    if (hasSharedPoints) {
        tupleVariationCount |= 0x8000; // SHARED_POINT_NUMBERS
    }
    result.push(...encode.USHORT(tupleVariationCount));
    
    // Calculate dataOffset: 2 (count) + 2 (offset) + headers
    const dataOffset = 4 + tupleVariationHeaders.length;
    result.push(...encode.USHORT(dataOffset));
    
    // Tuple variation headers
    result.push(...tupleVariationHeaders);
    
    // Shared point numbers (if present)
    if (hasSharedPoints) {
        result.push(...encode.PACKEDPOINTS(variation.sharedPoints, false));
    }
    
    // Serialized data for each tuple variation table
    for (const data of serializedDataParts) {
        result.push(...data);
    }
    
    return result;
}

/**
 * Make a gvar table from parsed gvar data
 * @param {object} gvar - The parsed gvar table data
 * @param {object} fvar - The fvar table (for axis count)
 * @returns {object|undefined}
 */
function makeGvarTable(gvar, fvar) {
    if (!gvar || !gvar.glyphVariations) {
        return undefined;
    }
    
    const axisCount = fvar ? fvar.axes.length : 
        (gvar.sharedTuples && gvar.sharedTuples.length > 0 ? gvar.sharedTuples[0].length : 0);
    
    if (axisCount === 0) {
        console.warn('Cannot write gvar table: no axis count available');
        return undefined;
    }
    
    // Build shared tuples
    const sharedTuples = buildSharedTuples(gvar.glyphVariations, gvar.sharedTuples);
    
    // Keep reference to original shared tuples for resolving indices
    const originalSharedTuples = gvar.sharedTuples || [];
    
    // Create a map from tuple to index
    const sharedTupleMap = new Map();
    for (let i = 0; i < sharedTuples.length; i++) {
        sharedTupleMap.set(sharedTuples[i].join(','), i);
    }
    
    // Encode all glyph variation data
    const glyphIds = Object.keys(gvar.glyphVariations).map(Number).sort((a, b) => a - b);
    const glyphCount = glyphIds.length > 0 ? Math.max(...glyphIds) + 1 : 0;
    
    const glyphVariationDataList = [];
    for (let i = 0; i < glyphCount; i++) {
        const variation = gvar.glyphVariations[i];
        const data = encodeGlyphVariationData(variation, axisCount, sharedTupleMap, originalSharedTuples);
        glyphVariationDataList.push(data);
    }
    
    // Calculate offsets
    // Determine if we need 32-bit offsets
    let totalGlyphDataSize = 0;
    for (const data of glyphVariationDataList) {
        totalGlyphDataSize += data.length;
    }
    
    // Use 16-bit offsets if total size is small enough (offsets are divided by 2)
    const use32BitOffsets = totalGlyphDataSize > 65534;
    
    // Calculate header size
    // Header: 2 (majorVersion) + 2 (minorVersion) + 2 (axisCount) + 2 (sharedTupleCount) + 
    //         4 (sharedTuplesOffset) + 2 (glyphCount) + 2 (flags) + 4 (glyphVariationDataArrayOffset)
    const headerSize = 20;
    
    // Offset array size
    const offsetArraySize = use32BitOffsets ? 
        (glyphCount + 1) * 4 : 
        (glyphCount + 1) * 2;
    
    // Shared tuples offset and size
    const sharedTuplesOffset = headerSize + offsetArraySize;
    const sharedTuplesSize = sharedTuples.length * axisCount * 2; // F2DOT14 = 2 bytes
    
    // Glyph variation data array offset
    const glyphVariationDataArrayOffset = sharedTuplesOffset + sharedTuplesSize;
    
    // Build the table
    const result = new table.Table('gvar', [
        { name: 'majorVersion', type: 'USHORT', value: 1 },
        { name: 'minorVersion', type: 'USHORT', value: 0 },
        { name: 'axisCount', type: 'USHORT', value: axisCount },
        { name: 'sharedTupleCount', type: 'USHORT', value: sharedTuples.length },
        { name: 'sharedTuplesOffset', type: 'ULONG', value: sharedTuplesOffset },
        { name: 'glyphCount', type: 'USHORT', value: glyphCount },
        { name: 'flags', type: 'USHORT', value: use32BitOffsets ? 1 : 0 },
        { name: 'glyphVariationDataArrayOffset', type: 'ULONG', value: glyphVariationDataArrayOffset }
    ]);
    
    // Add offset array
    let currentOffset = 0;
    for (let i = 0; i <= glyphCount; i++) {
        if (use32BitOffsets) {
            result.fields.push({ name: `offset_${i}`, type: 'ULONG', value: currentOffset });
        } else {
            // 16-bit offsets are stored divided by 2
            result.fields.push({ name: `offset_${i}`, type: 'USHORT', value: currentOffset / 2 });
        }
        if (i < glyphCount) {
            currentOffset += glyphVariationDataList[i].length;
            // Ensure alignment for 16-bit offsets
            if (!use32BitOffsets && (currentOffset % 2 !== 0)) {
                // Add padding byte to the data
                glyphVariationDataList[i].push(0);
                currentOffset++;
            }
        }
    }
    
    // Add shared tuples
    for (let i = 0; i < sharedTuples.length; i++) {
        for (let j = 0; j < axisCount; j++) {
            result.fields.push({ 
                name: `sharedTuple_${i}_${j}`, 
                type: 'F2DOT14', 
                value: sharedTuples[i][j] || 0 
            });
        }
    }
    
    // Add glyph variation data as literal bytes
    const allGlyphData = [];
    for (const data of glyphVariationDataList) {
        allGlyphData.push(...data);
    }
    
    if (allGlyphData.length > 0) {
        result.fields.push({ 
            name: 'glyphVariationData', 
            type: 'LITERAL', 
            value: allGlyphData 
        });
    }
    
    return result;
}

export default { make: makeGvarTable, parse: parseGvarTable };
