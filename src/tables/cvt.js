// The `cvt` table contains Control Value Table data for TrueType hinting
// https://learn.microsoft.com/en-us/typography/opentype/spec/cvt

import table from '../table.js';

/**
 * Parse the cvt table - this is a simple array of FWORDs (signed 16-bit values)
 * @param {DataView} data
 * @param {number} start
 * @param {number} length - table length in bytes
 * @returns {Array<number>} array of control values
 */
function parseCvtTable(data, start, length) {
    const values = [];
    const view = new DataView(data.buffer, data.byteOffset + start, length);
    for (let i = 0; i < length; i += 2) {
        values.push(view.getInt16(i, false)); // big-endian
    }
    return values;
}

/**
 * Create the cvt table from an array of control values
 * @param {Array<number>} cvtData - array of signed 16-bit control values
 * @returns {any} the cvt table
 */
function makeCvtTable(cvtData) {
    if (!cvtData || cvtData.length === 0) {
        return undefined;
    }
    
    const fields = [];
    for (let i = 0; i < cvtData.length; i++) {
        fields.push({name: `cv${i}`, type: 'SHORT', value: cvtData[i]});
    }
    
    return new table.Table('cvt ', fields);
}

export default { parse: parseCvtTable, make: makeCvtTable };
