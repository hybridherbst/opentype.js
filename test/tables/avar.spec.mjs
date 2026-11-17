import assert from 'assert';
import { hex, unhex } from '../testutil.mjs';
import avar from '../../src/tables/avar.mjs';
import { normalizeCoordinates } from '../../src/variation-coordinates.mjs';

describe('tables/avar.mjs', function() {
    const fvar = {axes: [
        {tag: 'TEST', minValue: 100, defaultValue: 400, maxValue: 900, name: {en: 'Test'}},
        {tag: 'TEST2', minValue: 0, defaultValue: 1, maxValue: 2, name: {en: 'Test2'}}
    ]};

    const data =
        // version
        '00 01 00 00 ' +
        // reserved, axisCount
        '00 00 00 02 ' +
        // positionMapCount
        '00 05 ' +
        // axisValueMaps
        'C0 00 C0 00 ' +
        'E0 00 00 00 ' +
        '00 00 00 00 ' +
        '20 00 00 00 ' +
        '40 00 40 00 ' +
        // positionMapCount 2
        '00 03 ' +
        // axisValueMaps 2
        'C0 00 C0 00 ' +
        '00 00 00 00 ' +
        '40 00 40 00';

    const table = {
        version: [1, 0],
        axisSegmentMaps: [
            {axisValueMaps: [
                {fromCoordinate: -1, toCoordinate: -1},
                {fromCoordinate: -0.5, toCoordinate: 0},
                {fromCoordinate: 0, toCoordinate: 0},
                {fromCoordinate: 0.5, toCoordinate: 0},
                {fromCoordinate: 1, toCoordinate: 1}
            ]},
            {axisValueMaps: [
                {fromCoordinate: -1, toCoordinate: -1},
                {fromCoordinate: 0, toCoordinate: 0},
                {fromCoordinate: 1, toCoordinate: 1}
            ]}
        ]
    };

    it('can parse an axis variation table', function() {
        assert.deepEqual(avar.parse(unhex(data), 0, fvar), table);
    });

    it('can make an axis variation table', function() {
        const encodedTable = avar.make(table, fvar).encode();
        assert.deepEqual(hex(encodedTable), data);
    });

    describe('version 2', function() {
        const fvar2 = {axes: [
            {tag: 'wght', minValue: 100, defaultValue: 400, maxValue: 900},
            {tag: 'wdth', minValue: 75, defaultValue: 100, maxValue: 125}
        ]};
        // wght at its maximum also moves wdth by +0.5 (8192 in F2DOT14 units); the
        // wght row is "no variation" (0xFFFF/0xFFFF).
        const table2 = {
            version: [2, 0],
            axisSegmentMaps: [{axisValueMaps: []}, {axisValueMaps: []}],
            axisIndexMap: {format: 0, entryFormat: 63, map: [{outerIndex: 65535, innerIndex: 65535}, {outerIndex: 0, innerIndex: 0}]},
            itemVariationStore: {
                format: 1,
                variationRegions: [{regionAxes: [{startCoord: 0, peakCoord: 1, endCoord: 1}, {startCoord: 0, peakCoord: 0, endCoord: 0}]}],
                itemVariationSubtables: [{regionIndexes: [0], deltaSets: [[8192]]}]
            }
        };

        it('writes and parses the axis index map and variation store', function() {
            const bytes = avar.make(table2, fvar2).encode();
            assert.equal(bytes[1], 2, 'major version 2');
            assert.deepEqual(avar.parse(unhex(hex(bytes)), 0, fvar2), table2);
        });

        it('writes version 1 when there is no version 2 data', function() {
            const bytes = avar.make({version: [2, 0], axisSegmentMaps: [{axisValueMaps: []}, {axisValueMaps: []}]}, fvar2).encode();
            assert.equal(bytes[1], 1);
            assert.equal(bytes.length, 12);
        });

        it('applies the cross-axis mapping after the segment maps', function() {
            assert.deepEqual(normalizeCoordinates({wght: 900}, fvar2.axes, table2), [1, 0.5]);
            assert.deepEqual(normalizeCoordinates({wght: 650}, fvar2.axes, table2), [0.5, 0.25]);
            assert.deepEqual(normalizeCoordinates({wght: 900, wdth: 125}, fvar2.axes, table2), [1, 1], 'clamped to 1');
            assert.deepEqual(normalizeCoordinates({wght: 400, wdth: 75}, fvar2.axes, table2), [0, -1]);
        });
    });
});
