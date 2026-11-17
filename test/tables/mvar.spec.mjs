import assert from 'assert';
import { hex, unhex } from '../testutil.mjs';
import mvar from '../../src/tables/mvar.mjs';

describe('tables/mvar.mjs', function() {
    const store = {
        format: 1,
        variationRegions: [{regionAxes: [{startCoord: 0, peakCoord: 1, endCoord: 1}]}],
        itemVariationSubtables: [{regionIndexes: [0], deltaSets: [[-40], [60], [40]]}]
    };
    const table = {
        version: [1, 0],
        valueRecords: [
            {valueTag: 'hasc', deltaSetOuterIndex: 0, deltaSetInnerIndex: 1},
            {valueTag: 'undo', deltaSetOuterIndex: 0, deltaSetInnerIndex: 0},
            {valueTag: 'xhgt', deltaSetOuterIndex: 0, deltaSetInnerIndex: 2}
        ],
        itemVariationStore: store
    };

    it('writes the header, tag-sorted value records and the variation store', function() {
        const shuffled = {...table, valueRecords: [table.valueRecords[2], table.valueRecords[0], table.valueRecords[1]]};
        const bytes = mvar.make(shuffled).encode();
        assert.equal(hex(bytes.slice(0, 12)), '00 01 00 00 00 00 00 08 00 03 00 24');
        assert.deepEqual(mvar.parse(unhex(hex(bytes)), 0), table);
    });

    it('writes nothing without value records', function() {
        assert.equal(mvar.make({version: [1, 0], valueRecords: [], itemVariationStore: store}), undefined);
    });
});
