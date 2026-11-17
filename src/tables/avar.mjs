// The `avar` table stores information on how to modify a variation along a variation axis
// https://learn.microsoft.com/en-us/typography/opentype/spec/avar

import check from '../check.mjs';
import { Parser } from '../parse.mjs';
import table from '../table.mjs';
import { encodeItemVariationStore, encodeDeltaSetIndexMap } from './hvar.mjs';

function makeAvarAxisValueMap(n, axisValueMap) {
    return new table.Record('axisValueMap_' + n, [
        {name: 'fromCoordinate_' + n, type: 'F2DOT14', value: axisValueMap.fromCoordinate},
        {name: 'toCoordinate_' + n, type: 'F2DOT14', value: axisValueMap.toCoordinate}
    ]);
}

function makeAvarSegmentMap(n, axis) {
    const returnTable = new table.Record('segmentMap_' + n, [
        {name: 'positionMapCount_' + n, type: 'USHORT', value: axis.axisValueMaps.length}
    ]);

    let axisValueMaps = [];
    for (let i = 0; i < axis.axisValueMaps.length; i++) {
        const valueMap = makeAvarAxisValueMap(`${n}_${i}`, axis.axisValueMaps[i]);
        axisValueMaps = axisValueMaps.concat(valueMap.fields);
    }

    returnTable.fields = returnTable.fields.concat(axisValueMaps);

    return returnTable;
}

/**
 * Whether an avar table carries version 2 data: a cross-axis ItemVariationStore
 * (with an optional DeltaSetIndexMap), applied after the segment maps.
 * @param {{itemVariationStore?: unknown, axisIndexMap?: unknown}} avar
 */
function isAvar2(avar) {
    return !!(avar.itemVariationStore || avar.axisIndexMap);
}

function makeAvarTable(avar, fvar) {
    check.argument(avar.axisSegmentMaps.length === fvar.axes.length, 'avar axis count must correspond to fvar axis count');

    const version2 = isAvar2(avar);
    const result = new table.Table('avar', [
        {name: 'majorVersion', type: 'USHORT', value: version2 ? 2 : 1},
        {name: 'minorVersion', type: 'USHORT', value: 0},
        {name: 'reserved', type: 'USHORT', value: 0},
        {name: 'axisCount', type: 'USHORT', value: avar.axisSegmentMaps.length},
    ]);

    let size = 8;
    for (let i = 0; i < avar.axisSegmentMaps.length; i++) {
        const axisRecord = makeAvarSegmentMap(i, avar.axisSegmentMaps[i]);
        result.fields = result.fields.concat(axisRecord.fields);
        size += 2 + 4 * avar.axisSegmentMaps[i].axisValueMaps.length;
    }

    if (version2) {
        // Version 2 header tail: Offset32 axisIndexMapOffset, Offset32 varStoreOffset,
        // both from the start of the table; the subtables follow in that order.
        const indexMapBytes = encodeDeltaSetIndexMap(avar.axisIndexMap);
        const storeBytes = encodeItemVariationStore(avar.itemVariationStore);
        const subtablesStart = size + 8;
        const indexMapOffset = indexMapBytes.length ? subtablesStart : 0;
        const storeOffset = storeBytes.length ? subtablesStart + indexMapBytes.length : 0;
        result.fields.push({name: 'axisIndexMapOffset', type: 'ULONG', value: indexMapOffset});
        result.fields.push({name: 'varStoreOffset', type: 'ULONG', value: storeOffset});
        if (indexMapBytes.length) result.fields.push({name: 'axisIndexMap', type: 'LITERAL', value: indexMapBytes});
        if (storeBytes.length) result.fields.push({name: 'itemVariationStore', type: 'LITERAL', value: storeBytes});
    }

    return result;
}

function parseAvarTable(data, start, fvar) {
    if (!start) {
        start = 0;
    }

    const p = new Parser(data, start);
    const tableVersionMajor = p.parseUShort();
    const tableVersionMinor = p.parseUShort();

    if (tableVersionMajor !== 1 && tableVersionMajor !== 2) {
        console.warn(`Unsupported avar table version ${tableVersionMajor}.${tableVersionMinor}`);
    }

    p.skip('uShort', 1); // reserved
    const axisCount = p.parseUShort();

    check.argument(axisCount === fvar.axes.length, 'avar axis count must correspond to fvar axis count');

    const axisSegmentMaps = [];
    for (let i = 0; i < axisCount; i++) {
        const axisValueMaps = [];
        const positionMapCount = p.parseUShort();
        for (let j = 0; j < positionMapCount; j++) {
            const fromCoordinate = p.parseF2Dot14();
            const toCoordinate = p.parseF2Dot14();
            axisValueMaps.push({
                fromCoordinate,
                toCoordinate
            });
        }
        axisSegmentMaps.push({
            axisValueMaps
        });
    }

    const result = {
        version: [tableVersionMajor, tableVersionMinor],
        axisSegmentMaps
    };
    if (tableVersionMajor === 2) {
        // avar2: axis index map and ItemVariationStore, offsets from the table start.
        const axisIndexMap = p.parsePointer32(function() {
            return this.parseDeltaSetIndexMap();
        });
        const itemVariationStore = p.parsePointer32(function() {
            return this.parseItemVariationStore();
        });
        if (axisIndexMap) result.axisIndexMap = axisIndexMap;
        if (itemVariationStore) result.itemVariationStore = itemVariationStore;
    }
    return result;
}

export default { make: makeAvarTable, parse: parseAvarTable };
