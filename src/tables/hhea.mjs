// The `hhea` table contains information for horizontal layout.
// https://www.microsoft.com/typography/OTSPEC/hhea.htm

import parse from '../parse.mjs';
import table from '../table.mjs';

/**
 * @typedef {object} HheaTable
 * @property {number} version - Table version number (Fixed 16.16)
 * @property {number} ascender - Typographic ascent in font design units
 * @property {number} descender - Typographic descent in font design units (negative)
 * @property {number} lineGap - Typographic line gap in font design units
 * @property {number} advanceWidthMax - Maximum advance width value in 'hmtx' table
 * @property {number} minLeftSideBearing - Minimum left sidebearing value in 'hmtx' table
 * @property {number} minRightSideBearing - Minimum right sidebearing value
 * @property {number} xMaxExtent - Max(lsb + (xMax - xMin))
 * @property {number} caretSlopeRise - Used to calculate the slope of the cursor (rise/run)
 * @property {number} caretSlopeRun - 0 for vertical
 * @property {number} caretOffset - The amount by which a slanted highlight on a glyph needs to be shifted
 * @property {number} metricDataFormat - 0 for current format
 * @property {number} numberOfHMetrics - Number of hMetric entries in 'hmtx' table
 */

// Parse the horizontal header `hhea` table
function parseHheaTable(data, start) {
    const hhea = {};
    const p = new parse.Parser(data, start);
    hhea.version = p.parseVersion();
    hhea.ascender = p.parseShort();
    hhea.descender = p.parseShort();
    hhea.lineGap = p.parseShort();
    hhea.advanceWidthMax = p.parseUShort();
    hhea.minLeftSideBearing = p.parseShort();
    hhea.minRightSideBearing = p.parseShort();
    hhea.xMaxExtent = p.parseShort();
    hhea.caretSlopeRise = p.parseShort();
    hhea.caretSlopeRun = p.parseShort();
    hhea.caretOffset = p.parseShort();
    p.relativeOffset += 8;
    hhea.metricDataFormat = p.parseShort();
    hhea.numberOfHMetrics = p.parseUShort();
    return hhea;
}

function makeHheaTable(options) {
    return new table.Table('hhea', [
        {name: 'version', type: 'FIXED', value: 0x00010000},
        {name: 'ascender', type: 'FWORD', value: 0},
        {name: 'descender', type: 'FWORD', value: 0},
        {name: 'lineGap', type: 'FWORD', value: 0},
        {name: 'advanceWidthMax', type: 'UFWORD', value: 0},
        {name: 'minLeftSideBearing', type: 'FWORD', value: 0},
        {name: 'minRightSideBearing', type: 'FWORD', value: 0},
        {name: 'xMaxExtent', type: 'FWORD', value: 0},
        {name: 'caretSlopeRise', type: 'SHORT', value: 1},
        {name: 'caretSlopeRun', type: 'SHORT', value: 0},
        {name: 'caretOffset', type: 'SHORT', value: 0},
        {name: 'reserved1', type: 'SHORT', value: 0},
        {name: 'reserved2', type: 'SHORT', value: 0},
        {name: 'reserved3', type: 'SHORT', value: 0},
        {name: 'reserved4', type: 'SHORT', value: 0},
        {name: 'metricDataFormat', type: 'SHORT', value: 0},
        {name: 'numberOfHMetrics', type: 'USHORT', value: 0}
    ], options);
}

export default { parse: parseHheaTable, make: makeHheaTable };
