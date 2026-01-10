import assert from 'assert';
import { hex, unhex } from '../testutil.js';
import kern from '../../src/tables/kern.js';

describe('tables/kern.js', function() {
    describe('parse', function() {
        it('can parse a Windows format kern table', function() {
            // Windows kern table format 0
            // version=0, nTables=1, subtableVersion=0, subtableLength=20 (header) + 12 (2 pairs * 6 bytes)
            // coverage=0x0001 (horizontal, cross-stream=0, override=0, format=0)
            // nPairs=2, searchRange=12, entrySelector=1, rangeShift=0
            // Pair 1: left=1, right=2, value=-50
            // Pair 2: left=3, right=4, value=30
            const data = 
                '00 00 ' +       // version
                '00 01 ' +       // nTables
                '00 00 ' +       // subtableVersion
                '00 1A ' +       // subtableLength (26 bytes)
                '00 01 ' +       // subtableCoverage
                '00 02 ' +       // nPairs
                '00 0C ' +       // searchRange (2 * 6 = 12)
                '00 01 ' +       // entrySelector
                '00 00 ' +       // rangeShift
                '00 01 00 02 FF CE ' + // pair 1: left=1, right=2, value=-50
                '00 03 00 04 00 1E';   // pair 2: left=3, right=4, value=30
            
            const result = kern.parse(unhex(data), 0);
            assert.deepEqual(result, {
                '1,2': -50,
                '3,4': 30
            });
        });
    });

    describe('make', function() {
        it('can make a kern table from pairs', function() {
            const pairs = {
                '1,2': -50,
                '3,4': 30
            };
            
            const table = kern.make(pairs);
            assert.ok(table, 'make should return a table');
            assert.equal(table.tableName, 'kern');
            
            const encoded = table.encode();
            assert.ok(encoded.length > 0, 'encoded table should have data');
        });

        it('returns null for empty pairs', function() {
            const table = kern.make({});
            assert.equal(table, null);
        });

        it('returns null for null input', function() {
            const table = kern.make(null);
            assert.equal(table, null);
        });

        it('filters out zero-value pairs', function() {
            const pairs = {
                '1,2': -50,
                '3,4': 0,  // Should be filtered out
                '5,6': 30
            };
            
            const table = kern.make(pairs);
            const encoded = table.encode();
            
            // Parse it back
            const parsed = kern.parse(new DataView(new Uint8Array(encoded).buffer), 0);
            assert.equal(Object.keys(parsed).length, 2);
            assert.equal(parsed['1,2'], -50);
            assert.equal(parsed['5,6'], 30);
            assert.equal(parsed['3,4'], undefined);
        });

        it('sorts pairs correctly for binary search', function() {
            const pairs = {
                '10,20': 10,
                '1,2': 20,
                '5,10': 30,
                '1,5': 40
            };
            
            const table = kern.make(pairs);
            const encoded = table.encode();
            
            // Parse it back
            const parsed = kern.parse(new DataView(new Uint8Array(encoded).buffer), 0);
            assert.deepEqual(parsed, pairs);
        });
    });

    describe('roundtrip', function() {
        it('should roundtrip simple kerning pairs', function() {
            const original = {
                '1,2': -50,
                '3,4': 30,
                '5,6': -100
            };
            
            const table = kern.make(original);
            const encoded = table.encode();
            const parsed = kern.parse(new DataView(new Uint8Array(encoded).buffer), 0);
            
            assert.deepEqual(parsed, original);
        });

        it('should roundtrip large kerning values', function() {
            const original = {
                '0,1': -32000,
                '1,0': 32000
            };
            
            const table = kern.make(original);
            const encoded = table.encode();
            const parsed = kern.parse(new DataView(new Uint8Array(encoded).buffer), 0);
            
            assert.deepEqual(parsed, original);
        });

        it('should roundtrip many kerning pairs', function() {
            const original = {};
            for (let i = 0; i < 100; i++) {
                original[`${i},${i + 1}`] = (i % 2 === 0) ? -i : i;
            }
            // Filter out zero values
            const filtered = {};
            for (const [k, v] of Object.entries(original)) {
                if (v !== 0) filtered[k] = v;
            }
            
            const table = kern.make(original);
            const encoded = table.encode();
            const parsed = kern.parse(new DataView(new Uint8Array(encoded).buffer), 0);
            
            assert.deepEqual(parsed, filtered);
        });
    });
});
