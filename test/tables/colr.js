import assert from 'assert';
import { hex, unhex } from '../testutil.js';
import colr from '../../src/tables/colr.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Full-font roundtrip helper: parse a real font, serialize, re-parse, compare COLR table
async function fontRoundtripCOLR(fontPath) {
    // Dynamic import of opentype (ESM)
    const opentype = await import('../../src/opentype.js');
    const buf = readFileSync(fontPath);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const font1 = opentype.parse(ab);

    if (!font1.tables.colr) throw new Error('Font has no COLR table');

    const roundtripped = font1.toArrayBuffer();
    const font2 = opentype.parse(roundtripped);

    return { font1, font2 };
}

describe('tables/colr.js', function () {
    const data = '00 00 00 02 00 00 00 0E 00 00 00 1A 00 03 ' +
        '00 AA 00 00 00 01 00 BB 00 01 00 02 ' +
        '00 20 FF FF 00 21 00 40 00 23 00 41';
    const obj = {
        version: 0,
        baseGlyphRecords: [
            { glyphID: 0xAA, firstLayerIndex: 0, numLayers: 1 },
            { glyphID: 0xBB, firstLayerIndex: 1, numLayers: 2 },
        ],
        layerRecords: [
            { glyphID: 0x20, paletteIndex: 0xFFFF },
            { glyphID: 0x21, paletteIndex: 0x0040 },
            { glyphID: 0x23, paletteIndex: 0x0041 },
        ]
    };

    it('can parse colr table', function () {
        assert.deepStrictEqual(obj, colr.parse(unhex(data), 0));
    });

    it('can make colr table', function () {
        const hexString = hex(colr.make(obj).encode());
        colr.parse(unhex(hexString), 0);
        assert.deepStrictEqual(data, hexString);
    });

    //// Full font roundtrip: COLRv0 //////////////////////////////////////////

    it('can roundtrip a COLRv0 font (OpenMoji subset)', async function() {
        this.timeout(10000);  // real font parsing can take a moment
        const fontPath = join(import.meta.dirname, '../fonts/OpenMojiCOLRv0-subset.otf');
        const { font1, font2 } = await fontRoundtripCOLR(fontPath);

        const colr1 = font1.tables.colr;
        const colr2 = font2.tables.colr;

        // Version must be preserved
        assert.equal(colr2.version, colr1.version, 'COLR version should roundtrip');
        assert.equal(colr2.version, 0, 'Should be COLRv0');

        // Base glyph records count
        assert.equal(colr2.baseGlyphRecords.length, colr1.baseGlyphRecords.length,
            'Number of base glyph records should roundtrip');

        // Layer records count
        assert.equal(colr2.layerRecords.length, colr1.layerRecords.length,
            'Number of layer records should roundtrip');

        // Verify every base glyph record
        for (let i = 0; i < colr1.baseGlyphRecords.length; i++) {
            const r1 = colr1.baseGlyphRecords[i];
            const r2 = colr2.baseGlyphRecords[i];
            assert.equal(r2.glyphID, r1.glyphID, `baseGlyphRecord[${i}].glyphID`);
            assert.equal(r2.firstLayerIndex, r1.firstLayerIndex, `baseGlyphRecord[${i}].firstLayerIndex`);
            assert.equal(r2.numLayers, r1.numLayers, `baseGlyphRecord[${i}].numLayers`);
        }

        // Verify every layer record
        for (let i = 0; i < colr1.layerRecords.length; i++) {
            const l1 = colr1.layerRecords[i];
            const l2 = colr2.layerRecords[i];
            assert.equal(l2.glyphID, l1.glyphID, `layerRecord[${i}].glyphID`);
            assert.equal(l2.paletteIndex, l1.paletteIndex, `layerRecord[${i}].paletteIndex`);
        }

        // CPAL should also roundtrip
        if (font1.tables.cpal) {
            assert.ok(font2.tables.cpal, 'CPAL table should be preserved');
            assert.equal(font2.tables.cpal.numPaletteEntries, font1.tables.cpal.numPaletteEntries,
                'CPAL numPaletteEntries should roundtrip');
            assert.deepEqual(font2.tables.cpal.colorRecords, font1.tables.cpal.colorRecords,
                'CPAL colorRecords should roundtrip');
        }
    });
});
