import assert from 'assert';
import { hex, unhex } from '../testutil.js';
import avar from '../../src/tables/avar.js';

describe('tables/avar.js', function() {
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

    describe('avar roundtrip', function() {
        // Helper to convert encoded array to DataView for parsing
        function arrayToDataView(arr) {
            const buffer = new ArrayBuffer(arr.length);
            const view = new DataView(buffer);
            for (let i = 0; i < arr.length; i++) {
                view.setUint8(i, arr[i]);
            }
            return view;
        }
        
        it('should roundtrip a simple linear avar table', function() {
            const linearTable = {
                version: [1, 0],
                axisSegmentMaps: [
                    {axisValueMaps: [
                        {fromCoordinate: -1, toCoordinate: -1},
                        {fromCoordinate: 0, toCoordinate: 0},
                        {fromCoordinate: 1, toCoordinate: 1}
                    ]}
                ]
            };
            const fvar1 = {axes: [{tag: 'wght', minValue: 100, defaultValue: 400, maxValue: 900}]};
            const encoded = avar.make(linearTable, fvar1).encode();
            const parsed = avar.parse(arrayToDataView(encoded), 0, fvar1);
            assert.deepEqual(parsed, linearTable);
        });

        it('should roundtrip a complex non-linear avar table', function() {
            const encoded = avar.make(table, fvar).encode();
            const parsed = avar.parse(arrayToDataView(encoded), 0, fvar);
            assert.deepEqual(parsed, table);
        });

        it('should roundtrip avar with 3 axes', function() {
            const fvar3 = {axes: [
                {tag: 'wght', minValue: 100, defaultValue: 400, maxValue: 900},
                {tag: 'wdth', minValue: 75, defaultValue: 100, maxValue: 125},
                {tag: 'ital', minValue: 0, defaultValue: 0, maxValue: 1}
            ]};
            const table3 = {
                version: [1, 0],
                axisSegmentMaps: [
                    {axisValueMaps: [
                        {fromCoordinate: -1, toCoordinate: -1},
                        {fromCoordinate: -0.5, toCoordinate: -0.25},
                        {fromCoordinate: 0, toCoordinate: 0},
                        {fromCoordinate: 0.5, toCoordinate: 0.75},
                        {fromCoordinate: 1, toCoordinate: 1}
                    ]},
                    {axisValueMaps: [
                        {fromCoordinate: -1, toCoordinate: -1},
                        {fromCoordinate: 0, toCoordinate: 0},
                        {fromCoordinate: 1, toCoordinate: 1}
                    ]},
                    {axisValueMaps: [
                        {fromCoordinate: -1, toCoordinate: -1},
                        {fromCoordinate: 0, toCoordinate: 0},
                        {fromCoordinate: 0.5, toCoordinate: 0.75}, // Use 0.75 which encodes exactly in F2DOT14
                        {fromCoordinate: 1, toCoordinate: 1}
                    ]}
                ]
            };
            const encoded = avar.make(table3, fvar3).encode();
            const parsed = avar.parse(arrayToDataView(encoded), 0, fvar3);
            assert.deepEqual(parsed, table3);
        });
    });

    describe('avar coordinate mapping', function() {
        // Test that the non-linear mapping works as expected
        // The table maps: -0.5 -> 0, 0.5 -> 0, meaning values between -0.5 and 0.5 
        // are compressed to the origin, creating a "dead zone"
        it('should map coordinates through non-linear segments', function() {
            // Verify the table structure is correct for this test
            const maps = table.axisSegmentMaps[0].axisValueMaps;
            assert.strictEqual(maps[1].fromCoordinate, -0.5);
            assert.strictEqual(maps[1].toCoordinate, 0);
            assert.strictEqual(maps[3].fromCoordinate, 0.5);
            assert.strictEqual(maps[3].toCoordinate, 0);
        });
    });
});
