// The `kern` table contains kerning pairs.
// Note that some fonts use the GPOS OpenType layout table to specify kerning.
// https://www.microsoft.com/typography/OTSPEC/kern.htm

import check from '../check.js';
import parse from '../parse.js';
import table from '../table.js';

function log2(v) {
    return Math.log(v) / Math.log(2) | 0;
}

function parseWindowsKernTable(p) {
    const pairs = {};
    // Skip nTables.
    p.skip('uShort');
    const subtableVersion = p.parseUShort();
    check.argument(subtableVersion === 0, 'Unsupported kern sub-table version.');
    // Skip subtableLength, subtableCoverage
    p.skip('uShort', 2);
    const nPairs = p.parseUShort();
    // Skip searchRange, entrySelector, rangeShift.
    p.skip('uShort', 3);
    for (let i = 0; i < nPairs; i += 1) {
        const leftIndex = p.parseUShort();
        const rightIndex = p.parseUShort();
        const value = p.parseShort();
        pairs[leftIndex + ',' + rightIndex] = value;
    }
    return pairs;
}

function parseMacKernTable(p) {
    const pairs = {};
    // The Mac kern table stores the version as a fixed (32 bits) but we only loaded the first 16 bits.
    // Skip the rest.
    p.skip('uShort');
    const nTables = p.parseULong();
    //check.argument(nTables === 1, 'Only 1 subtable is supported (got ' + nTables + ').');
    if (nTables > 1) {
        console.warn('Only the first kern subtable is supported.');
    }
    p.skip('uLong');
    const coverage = p.parseUShort();
    const subtableVersion = coverage & 0xFF;
    p.skip('uShort');
    if (subtableVersion === 0) {
        const nPairs = p.parseUShort();
        // Skip searchRange, entrySelector, rangeShift.
        p.skip('uShort', 3);
        for (let i = 0; i < nPairs; i += 1) {
            const leftIndex = p.parseUShort();
            const rightIndex = p.parseUShort();
            const value = p.parseShort();
            pairs[leftIndex + ',' + rightIndex] = value;
        }
    }
    return pairs;
}

// Parse the `kern` table which contains kerning pairs.
function parseKernTable(data, start) {
    const p = new parse.Parser(data, start);
    const tableVersion = p.parseUShort();
    if (tableVersion === 0) {
        return parseWindowsKernTable(p);
    } else if (tableVersion === 1) {
        return parseMacKernTable(p);
    } else {
        throw new Error('Unsupported kern table version (' + tableVersion + ').');
    }
}

/**
 * Make a kern table from kerning pairs.
 * Creates a Windows format (version 0) kern table with format 0 subtable.
 * @param {Object} kerningPairs - Object with keys 'leftIndex,rightIndex' and values as kerning amounts
 * @returns {any} The kern table, or null if no pairs
 */
function makeKernTable(kerningPairs) {
    if (!kerningPairs || typeof kerningPairs !== 'object') {
        return null;
    }
    
    // Convert kerning pairs object to sorted array
    const pairs = [];
    for (const key in kerningPairs) {
        const parts = key.split(',');
        if (parts.length === 2) {
            const leftIndex = parseInt(parts[0], 10);
            const rightIndex = parseInt(parts[1], 10);
            const value = kerningPairs[key];
            if (!isNaN(leftIndex) && !isNaN(rightIndex) && value !== 0) {
                pairs.push({ left: leftIndex, right: rightIndex, value: value });
            }
        }
    }
    
    if (pairs.length === 0) {
        return null;
    }
    
    // Sort pairs by left index, then right index (required for binary search)
    pairs.sort((a, b) => {
        if (a.left !== b.left) return a.left - b.left;
        return a.right - b.right;
    });
    
    const nPairs = pairs.length;
    
    // Compute searchRange, entrySelector, rangeShift for binary search
    const highestPowerOf2 = Math.pow(2, log2(nPairs));
    const searchRange = highestPowerOf2 * 6; // 6 bytes per entry
    const entrySelector = log2(highestPowerOf2);
    const rangeShift = nPairs * 6 - searchRange;
    
    // Subtable size: header (14 bytes) + pairs (6 bytes each)
    const subtableLength = 14 + nPairs * 6;
    
    // Build the table fields
    const fields = [
        // Table header (Windows format, version 0)
        { name: 'version', type: 'USHORT', value: 0 },
        { name: 'nTables', type: 'USHORT', value: 1 },
        
        // Subtable header (format 0)
        { name: 'subtableVersion', type: 'USHORT', value: 0 },
        { name: 'subtableLength', type: 'USHORT', value: subtableLength },
        // Coverage: horizontal (bit 0), cross-stream=0 (bit 2), override=0 (bit 3), format=0 (bits 8-15)
        { name: 'subtableCoverage', type: 'USHORT', value: 0x0001 },
        
        // Format 0 header
        { name: 'nPairs', type: 'USHORT', value: nPairs },
        { name: 'searchRange', type: 'USHORT', value: searchRange },
        { name: 'entrySelector', type: 'USHORT', value: entrySelector },
        { name: 'rangeShift', type: 'USHORT', value: rangeShift },
    ];
    
    // Add each kerning pair
    for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i];
        fields.push({ name: `left_${i}`, type: 'USHORT', value: pair.left });
        fields.push({ name: `right_${i}`, type: 'USHORT', value: pair.right });
        fields.push({ name: `value_${i}`, type: 'SHORT', value: pair.value });
    }
    
    return new table.Table('kern', fields);
}

export default { parse: parseKernTable, make: makeKernTable };
