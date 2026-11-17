// The `MVAR` table stores variation data for font-wide metrics (OS/2, hhea, vhea, post).
// https://learn.microsoft.com/en-us/typography/opentype/spec/mvar

import { Parser } from '../parse.mjs';
import table from '../table.mjs';
import { encodeItemVariationStore } from './hvar.mjs';

/**
 * Value tags MVAR may vary, with the table field each one adjusts.
 * https://learn.microsoft.com/en-us/typography/opentype/spec/mvar#value-tags
 */
export const MVAR_VALUE_TAGS = Object.freeze({
    hasc: 'OS/2.sTypoAscender',
    hdsc: 'OS/2.sTypoDescender',
    hlgp: 'OS/2.sTypoLineGap',
    hcla: 'OS/2.usWinAscent',
    hcld: 'OS/2.usWinDescent',
    vasc: 'vhea.ascent',
    vdsc: 'vhea.descent',
    vlgp: 'vhea.lineGap',
    hcrs: 'hhea.caretSlopeRise',
    hcrn: 'hhea.caretSlopeRun',
    hcof: 'hhea.caretOffset',
    vcrs: 'vhea.caretSlopeRise',
    vcrn: 'vhea.caretSlopeRun',
    vcof: 'vhea.caretOffset',
    xhgt: 'OS/2.sxHeight',
    cpht: 'OS/2.sCapHeight',
    sbxs: 'OS/2.ySubscriptXSize',
    sbys: 'OS/2.ySubscriptYSize',
    sbxo: 'OS/2.ySubscriptXOffset',
    sbyo: 'OS/2.ySubscriptYOffset',
    spxs: 'OS/2.ySuperscriptXSize',
    spys: 'OS/2.ySuperscriptYSize',
    spxo: 'OS/2.ySuperscriptXOffset',
    spyo: 'OS/2.ySuperscriptYOffset',
    strs: 'OS/2.yStrikeoutSize',
    stro: 'OS/2.yStrikeoutPosition',
    unds: 'post.underlineThickness',
    undo: 'post.underlinePosition',
    gsp0: 'gasp.gaspRange[0].rangeMaxPPEM',
    gsp1: 'gasp.gaspRange[1].rangeMaxPPEM',
    gsp2: 'gasp.gaspRange[2].rangeMaxPPEM',
    gsp3: 'gasp.gaspRange[3].rangeMaxPPEM',
    gsp4: 'gasp.gaspRange[4].rangeMaxPPEM',
    gsp5: 'gasp.gaspRange[5].rangeMaxPPEM',
    gsp6: 'gasp.gaspRange[6].rangeMaxPPEM',
    gsp7: 'gasp.gaspRange[7].rangeMaxPPEM',
    gsp8: 'gasp.gaspRange[8].rangeMaxPPEM',
    gsp9: 'gasp.gaspRange[9].rangeMaxPPEM',
});

/**
 * @typedef {{valueTag: string, deltaSetOuterIndex: number, deltaSetInnerIndex: number}} MvarValueRecord
 * @typedef {{version: number[], valueRecords: MvarValueRecord[], itemVariationStore?: object}} MvarTable
 */

/**
 * @param {DataView} data
 * @param {number} start
 * @returns {MvarTable}
 */
function parseMvarTable(data, start) {
    const p = new Parser(data, start);
    const majorVersion = p.parseUShort();
    const minorVersion = p.parseUShort();
    if (majorVersion !== 1) {
        console.warn(`Unsupported MVAR table version ${majorVersion}.${minorVersion}`);
    }
    p.parseUShort(); // reserved
    const valueRecordSize = p.parseUShort();
    const valueRecordCount = p.parseUShort();
    const itemVariationStore = p.parsePointer(function() {
        return this.parseItemVariationStore();
    });
    const valueRecords = [];
    const recordsStart = p.relativeOffset;
    for (let i = 0; i < valueRecordCount; i++) {
        p.relativeOffset = recordsStart + i * valueRecordSize;
        valueRecords.push({
            valueTag: p.parseTag(),
            deltaSetOuterIndex: p.parseUShort(),
            deltaSetInnerIndex: p.parseUShort(),
        });
    }
    return {
        version: [majorVersion, minorVersion],
        valueRecords,
        ...(itemVariationStore ? {itemVariationStore} : {}),
    };
}

/**
 * @param {MvarTable} mvar
 * @returns {InstanceType<typeof table.Table>|undefined}
 */
function makeMvarTable(mvar) {
    if (!mvar || !mvar.itemVariationStore || !mvar.valueRecords?.length) {
        return undefined;
    }
    // Value records are sorted by tag (binary-searched by renderers).
    const records = [...mvar.valueRecords].sort((a, b) => a.valueTag < b.valueTag ? -1 : a.valueTag > b.valueTag ? 1 : 0);
    const storeBytes = encodeItemVariationStore(mvar.itemVariationStore);
    const headerSize = 12;
    const recordSize = 8;
    const storeOffset = headerSize + records.length * recordSize;
    const result = new table.Table('MVAR', [
        {name: 'majorVersion', type: 'USHORT', value: 1},
        {name: 'minorVersion', type: 'USHORT', value: 0},
        {name: 'reserved', type: 'USHORT', value: 0},
        {name: 'valueRecordSize', type: 'USHORT', value: recordSize},
        {name: 'valueRecordCount', type: 'USHORT', value: records.length},
        {name: 'itemVariationStoreOffset', type: 'USHORT', value: storeOffset},
    ]);
    records.forEach((record, i) => {
        result.fields.push({name: `valueTag_${i}`, type: 'TAG', value: record.valueTag});
        result.fields.push({name: `deltaSetOuterIndex_${i}`, type: 'USHORT', value: record.deltaSetOuterIndex});
        result.fields.push({name: `deltaSetInnerIndex_${i}`, type: 'USHORT', value: record.deltaSetInnerIndex});
    });
    result.fields.push({name: 'itemVariationStore', type: 'LITERAL', value: storeBytes});
    return result;
}

export default { make: makeMvarTable, parse: parseMvarTable };
