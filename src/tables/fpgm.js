// The `fpgm` table contains the Font Program for TrueType hinting
// https://learn.microsoft.com/en-us/typography/opentype/spec/fpgm

import table from '../table.js';

/**
 * Parse the fpgm table - this is a simple array of bytes (instructions)
 * @param {DataView} data
 * @param {number} start
 * @param {number} length - table length in bytes
 * @returns {Array<number>} array of instruction bytes
 */
function parseFpgmTable(data, start, length) {
    const instructions = [];
    const view = new DataView(data.buffer, data.byteOffset + start, length);
    for (let i = 0; i < length; i++) {
        instructions.push(view.getUint8(i));
    }
    return instructions;
}

/**
 * Create the fpgm table from an array of instruction bytes
 * @param {Array<number>} fpgmData - array of unsigned 8-bit instruction bytes
 * @returns {Table} the fpgm table
 */
function makeFpgmTable(fpgmData) {
    if (!fpgmData || fpgmData.length === 0) {
        return undefined;
    }
    
    const fields = [];
    for (let i = 0; i < fpgmData.length; i++) {
        fields.push({name: `instr${i}`, type: 'BYTE', value: fpgmData[i]});
    }
    
    return new table.Table('fpgm', fields);
}

export default { parse: parseFpgmTable, make: makeFpgmTable };
