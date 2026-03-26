// The `prep` table contains the Control Value Program for TrueType hinting
// https://learn.microsoft.com/en-us/typography/opentype/spec/prep

import table from '../table.js';

/**
 * Parse the prep table - this is a simple array of bytes (instructions)
 * @param {DataView} data
 * @param {number} start
 * @param {number} length - table length in bytes
 * @returns {Array<number>} array of instruction bytes
 */
function parsePrepTable(data, start, length) {
    const instructions = [];
    const view = new DataView(data.buffer, data.byteOffset + start, length);
    for (let i = 0; i < length; i++) {
        instructions.push(view.getUint8(i));
    }
    return instructions;
}

/**
 * Create the prep table from an array of instruction bytes
 * @param {Array<number>} prepData - array of unsigned 8-bit instruction bytes
 * @returns {any} the prep table
 */
function makePrepTable(prepData) {
    if (!prepData || prepData.length === 0) {
        return undefined;
    }
    
    const fields = [];
    for (let i = 0; i < prepData.length; i++) {
        fields.push({name: `instr${i}`, type: 'BYTE', value: prepData[i]});
    }
    
    return new table.Table('prep', fields);
}

export default { parse: parsePrepTable, make: makePrepTable };
