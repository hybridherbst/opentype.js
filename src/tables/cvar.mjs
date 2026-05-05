// The `cvar` table stores variation data for CVT values
// https://learn.microsoft.com/en-us/typography/opentype/spec/cvar

import parse from '../parse.mjs';
import table from '../table.mjs';
import { encode } from '../types.mjs';

function parseCvarTable(data, start, fvar, cvt) {
    const p = new parse.Parser(data, start);
    const cvtVariations = p.parseTupleVariationStore(
        p.relativeOffset,
        fvar.axes.length,
        'cvar',
        cvt
    );
    const tableVersionMajor = p.parseUShort();
    const tableVersionMinor = p.parseUShort();
    if (tableVersionMajor !== 1) {
        console.warn(`Unsupported cvar table version ${tableVersionMajor}.${tableVersionMinor}`);
    }

    return {
        version: [tableVersionMajor, tableVersionMinor],
        ...cvtVariations,
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
 * Encode serialized data for a single tuple variation table
 * @param {object} header - The header object
 * @param {boolean} usePrivatePoints - Whether to use private points
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
    
    // Packed deltas (cvar only has X deltas, no Y)
    if (header.deltas) {
        result.push(...encode.VARDELTAS(header.deltas));
    }
    
    return result;
}

/**
 * Encode a TupleVariationHeader
 * @param {object} header - The header object from parsed cvar data
 * @param {number} axisCount - Number of axes
 * @param {number} variationDataSize - Size of the serialized data for this tuple
 * @returns {Array} Encoded bytes
 */
function encodeTupleVariationHeader(header, axisCount, variationDataSize) {
    const result = [];
    
    // variationDataSize (uint16)
    result.push(...encode.USHORT(variationDataSize));
    
    // Build tupleIndex flags
    let tupleIndex = 0;
    
    // Check if we have private points
    const hasPrivatePoints = header.privatePoints && header.privatePoints.length > 0;
    if (hasPrivatePoints) {
        tupleIndex |= 0x2000; // PRIVATE_POINT_NUMBERS
    }
    
    // Check for intermediate region
    const hasIntermediate = header.intermediateStartTuple && header.intermediateEndTuple;
    if (hasIntermediate) {
        tupleIndex |= 0x4000; // INTERMEDIATE_REGION
    }
    
    // Always use embedded peak tuple for cvar (no shared tuples)
    tupleIndex |= 0x8000; // EMBEDDED_PEAK_TUPLE
    
    result.push(...encode.USHORT(tupleIndex));
    
    // Peak tuple (always embedded for cvar)
    if (header.peakTuple) {
        result.push(...encodeTuple(header.peakTuple));
    }
    
    // Intermediate start and end tuples
    if (hasIntermediate) {
        result.push(...encodeTuple(header.intermediateStartTuple));
        result.push(...encodeTuple(header.intermediateEndTuple));
    }
    
    return result;
}

/**
 * Make a cvar table from parsed cvar data
 * @param {object} cvar - The parsed cvar table data
 * @param {object} fvar - The fvar table (for axis count)
 * @returns {object|undefined}
 */
function makeCvarTable(cvar, fvar) {
    if (!cvar || !cvar.headers || cvar.headers.length === 0) {
        return undefined;
    }
    
    const axisCount = fvar ? fvar.axes.length : 
        (cvar.headers[0] && cvar.headers[0].peakTuple ? cvar.headers[0].peakTuple.length : 0);
    
    if (axisCount === 0) {
        console.warn('Cannot write cvar table: no axis count available');
        return undefined;
    }
    
    const headers = cvar.headers;
    const hasSharedPoints = cvar.sharedPoints && cvar.sharedPoints.length > 0;
    
    // First, encode all the serialized data to get sizes
    const serializedDataParts = [];
    for (const header of headers) {
        const usePrivatePoints = !hasSharedPoints || (header.privatePoints && header.privatePoints.length > 0);
        const data = encodeTupleSerializedData(header, usePrivatePoints);
        serializedDataParts.push(data);
    }
    
    // Encode headers
    const tupleVariationHeaders = [];
    for (let i = 0; i < headers.length; i++) {
        const header = headers[i];
        const headerBytes = encodeTupleVariationHeader(
            header, 
            axisCount, 
            serializedDataParts[i].length
        );
        tupleVariationHeaders.push(...headerBytes);
    }
    
    // Build the serialized data blob
    const serializedData = [];
    
    // Shared point numbers (if present)
    if (hasSharedPoints) {
        serializedData.push(...encode.PACKEDPOINTS(cvar.sharedPoints, false));
    }
    
    // Serialized data for each tuple variation table
    for (const data of serializedDataParts) {
        serializedData.push(...data);
    }
    
    // Build the table
    const result = new table.Table('cvar', [
        { name: 'majorVersion', type: 'USHORT', value: 1 },
        { name: 'minorVersion', type: 'USHORT', value: 0 }
    ]);
    
    // tupleVariationCount with flags
    let tupleVariationCount = headers.length & 0x0FFF;
    if (hasSharedPoints) {
        tupleVariationCount |= 0x8000; // SHARED_POINT_NUMBERS
    }
    result.fields.push({ name: 'tupleVariationCount', type: 'USHORT', value: tupleVariationCount });
    
    // Calculate dataOffset: 2 (majorVersion) + 2 (minorVersion) + 2 (count) + 2 (offset) + headers
    const dataOffset = 8 + tupleVariationHeaders.length;
    result.fields.push({ name: 'dataOffset', type: 'USHORT', value: dataOffset });
    
    // Tuple variation headers
    if (tupleVariationHeaders.length > 0) {
        result.fields.push({ 
            name: 'tupleVariationHeaders', 
            type: 'LITERAL', 
            value: tupleVariationHeaders 
        });
    }
    
    // Serialized data
    if (serializedData.length > 0) {
        result.fields.push({ 
            name: 'serializedData', 
            type: 'LITERAL', 
            value: serializedData 
        });
    }
    
    return result;
}

export default { make: makeCvarTable, parse: parseCvarTable };
