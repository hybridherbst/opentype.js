// The `loca` table stores the offsets to the locations of the glyphs in the font.
// https://www.microsoft.com/typography/OTSPEC/loca.htm

import parse from '../parse.mjs';
import table from '../table.mjs';

// Parse the `loca` table. This table stores the offsets to the locations of the glyphs in the font,
// relative to the beginning of the glyphData table.
// The number of glyphs stored in the `loca` table is specified in the `maxp` table (under numGlyphs)
// The loca table has two versions: a short version where offsets are stored as uShorts, and a long
// version where offsets are stored as uLongs. The `head` table specifies which version to use
// (under indexToLocFormat).
function parseLocaTable(data, start, numGlyphs, shortVersion) {
    const p = new parse.Parser(data, start);
    const parseFn = shortVersion ? p.parseUShort : p.parseULong;
    // There is an extra entry after the last index element to compute the length of the last glyph.
    // That's why we use numGlyphs + 1.
    const glyphOffsets = [];
    for (let i = 0; i < numGlyphs + 1; i += 1) {
        let glyphOffset = parseFn.call(p);
        if (shortVersion) {
            // The short table version stores the actual offset divided by 2.
            glyphOffset *= 2;
        }

        glyphOffsets.push(glyphOffset);
    }

    return glyphOffsets;
}

/**
 * Make a loca table from glyph offsets.
 * @param {Array} offsets - Array of glyph offsets from glyf.make
 * @param {boolean} useShort - Whether to use short (16-bit) format
 * @returns {object} The loca table
 */
function makeLocaTable(offsets, useShort) {
    const fields = [];
    
    for (let i = 0; i < offsets.length; i++) {
        if (useShort) {
            // Short version: store offset / 2 as USHORT
            fields.push({ name: `offset_${i}`, type: 'USHORT', value: Math.floor(offsets[i] / 2) });
        } else {
            // Long version: store offset as ULONG
            fields.push({ name: `offset_${i}`, type: 'ULONG', value: offsets[i] });
        }
    }
    
    return new table.Table('loca', fields);
}

export default { parse: parseLocaTable, make: makeLocaTable };
