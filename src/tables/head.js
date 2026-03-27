// The `head` table contains global information about the font.
// https://www.microsoft.com/typography/OTSPEC/head.htm

import check from '../check.js';
import parse from '../parse.js';
import table from '../table.js';

/**
 * @typedef {object} HeadTable
 * @property {number} version - Table version number (Fixed 16.16)
 * @property {number} fontRevision - Set by font manufacturer (Fixed 16.16)
 * @property {number} checkSumAdjustment - To compute: set to 0, sum the entire font as ULong, then store 0xB1B0AFBA - sum
 * @property {number} magicNumber - Set to 0x5F0F3CF5
 * @property {number} flags - Bit flag field
 * @property {number} unitsPerEm - Valid range is from 16 to 16384
 * @property {number} created - Number of seconds since 12:00 midnight that started January 1st 1904
 * @property {number} modified - Number of seconds since 12:00 midnight that started January 1st 1904
 * @property {number} xMin - For all glyph bounding boxes
 * @property {number} yMin - For all glyph bounding boxes
 * @property {number} xMax - For all glyph bounding boxes
 * @property {number} yMax - For all glyph bounding boxes
 * @property {number} macStyle - Bit field for style flags (bold, italic, etc.)
 * @property {number} lowestRecPPEM - Smallest readable size in pixels
 * @property {number} fontDirectionHint - Deprecated, set to 2
 * @property {number} indexToLocFormat - 0 for short offsets, 1 for long
 * @property {number} glyphDataFormat - 0 for current format
 */

// Parse the header `head` table
function parseHeadTable(data, start) {
    const head = {};
    const p = new parse.Parser(data, start);
    head.version = p.parseVersion();
    head.fontRevision = Math.round(p.parseFixed() * 1000) / 1000;
    head.checkSumAdjustment = p.parseULong();
    head.magicNumber = p.parseULong();
    check.argument(head.magicNumber === 0x5F0F3CF5, 'Font header has wrong magic number.');
    head.flags = p.parseUShort();
    head.unitsPerEm = p.parseUShort();
    head.created = p.parseLongDateTime();
    head.modified = p.parseLongDateTime();
    head.xMin = p.parseShort();
    head.yMin = p.parseShort();
    head.xMax = p.parseShort();
    head.yMax = p.parseShort();
    head.macStyle = p.parseUShort();
    head.lowestRecPPEM = p.parseUShort();
    head.fontDirectionHint = p.parseShort();
    head.indexToLocFormat = p.parseShort();
    head.glyphDataFormat = p.parseShort();
    return head;
}

function makeHeadTable(options) {
    // Apple Mac timestamp epoch is 01/01/1904 not 01/01/1970
    const timestamp = Math.round(new Date().getTime() / 1000) + 2082844800;
    let createdTimestamp = timestamp;
    let macStyle = options.macStyle || 0;
    if (options.createdTimestamp) {
        createdTimestamp = options.createdTimestamp + 2082844800;
    }

    return new table.Table('head', [
        {name: 'version', type: 'FIXED', value: 0x00010000},
        {name: 'fontRevision', type: 'FIXED', value: 0x00010000},
        {name: 'checkSumAdjustment', type: 'ULONG', value: 0},
        {name: 'magicNumber', type: 'ULONG', value: 0x5F0F3CF5},
        {name: 'flags', type: 'USHORT', value: 0},
        {name: 'unitsPerEm', type: 'USHORT', value: 1000},
        {name: 'created', type: 'LONGDATETIME', value: createdTimestamp},
        {name: 'modified', type: 'LONGDATETIME', value: timestamp},
        {name: 'xMin', type: 'SHORT', value: 0},
        {name: 'yMin', type: 'SHORT', value: 0},
        {name: 'xMax', type: 'SHORT', value: 0},
        {name: 'yMax', type: 'SHORT', value: 0},
        {name: 'macStyle', type: 'USHORT', value: macStyle},
        {name: 'lowestRecPPEM', type: 'USHORT', value: 0},
        {name: 'fontDirectionHint', type: 'SHORT', value: 2},
        {name: 'indexToLocFormat', type: 'SHORT', value: 0},
        {name: 'glyphDataFormat', type: 'SHORT', value: 0}
    ], options);
}

export default { parse: parseHeadTable, make: makeHeadTable };
