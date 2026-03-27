// The `maxp` table establishes the memory requirements for the font.
// We need it just to get the number of glyphs in the font.
// https://www.microsoft.com/typography/OTSPEC/maxp.htm

import parse from '../parse.js';
import table from '../table.js';

// Parse the maximum profile `maxp` table.
function parseMaxpTable(data, start) {
    const maxp = {};
    const p = new parse.Parser(data, start);
    maxp.version = p.parseVersion();
    maxp.numGlyphs = p.parseUShort();
    if (maxp.version === 1.0) {
        maxp.maxPoints = p.parseUShort();
        maxp.maxContours = p.parseUShort();
        maxp.maxCompositePoints = p.parseUShort();
        maxp.maxCompositeContours = p.parseUShort();
        maxp.maxZones = p.parseUShort();
        maxp.maxTwilightPoints = p.parseUShort();
        maxp.maxStorage = p.parseUShort();
        maxp.maxFunctionDefs = p.parseUShort();
        maxp.maxInstructionDefs = p.parseUShort();
        maxp.maxStackElements = p.parseUShort();
        maxp.maxSizeOfInstructions = p.parseUShort();
        maxp.maxComponentElements = p.parseUShort();
        maxp.maxComponentDepth = p.parseUShort();
    }

    return maxp;
}

/**
 * Create a maxp table.
 * @param {number} numGlyphs - Number of glyphs in the font
 * @param {boolean} isTrueType - Whether this is a TrueType (glyf) font
 * @param {{maxPoints?: number, maxContours?: number, maxCompositePoints?: number, maxCompositeContours?: number, maxComponentElements?: number, maxComponentDepth?: number}} [options] - Optional parameters for TrueType fonts
 */
function makeMaxpTable(numGlyphs, isTrueType, options = {}) {
    if (isTrueType) {
        // Version 1.0 for TrueType fonts with glyf table
        return new table.Table('maxp', [
            {name: 'version', type: 'FIXED', value: 0x00010000},
            {name: 'numGlyphs', type: 'USHORT', value: numGlyphs},
            {name: 'maxPoints', type: 'USHORT', value: options.maxPoints || 0},
            {name: 'maxContours', type: 'USHORT', value: options.maxContours || 0},
            {name: 'maxCompositePoints', type: 'USHORT', value: options.maxCompositePoints || 0},
            {name: 'maxCompositeContours', type: 'USHORT', value: options.maxCompositeContours || 0},
            {name: 'maxZones', type: 'USHORT', value: 2},
            {name: 'maxTwilightPoints', type: 'USHORT', value: 0},
            {name: 'maxStorage', type: 'USHORT', value: 0},
            {name: 'maxFunctionDefs', type: 'USHORT', value: 0},
            {name: 'maxInstructionDefs', type: 'USHORT', value: 0},
            {name: 'maxStackElements', type: 'USHORT', value: 0},
            {name: 'maxSizeOfInstructions', type: 'USHORT', value: 0},
            {name: 'maxComponentElements', type: 'USHORT', value: options.maxComponentElements || 0},
            {name: 'maxComponentDepth', type: 'USHORT', value: options.maxComponentDepth || 0}
        ]);
    }
    // Version 0.5 for CFF fonts
    return new table.Table('maxp', [
        {name: 'version', type: 'FIXED', value: 0x00005000},
        {name: 'numGlyphs', type: 'USHORT', value: numGlyphs}
    ]);
}

export default { parse: parseMaxpTable, make: makeMaxpTable };
