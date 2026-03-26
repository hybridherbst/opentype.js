// Quick verification of COLRv1 parsing on Nabla font
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

// Use src directly (not built dist)
import colr from '../../src/tables/colr.js';

const NABLA_PATH = join(import.meta.dirname, '../../../opentype-editor/static/Nabla/Nabla-Regular-VariableFont_EDPT,EHLT.ttf');

// Read the raw COLR table bytes from Nabla
function getColrTableData() {
    const buf = readFileSync(NABLA_PATH);
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const numTables = dv.getUint16(4);
    for (let i = 0; i < numTables; i++) {
        const off = 12 + i * 16;
        const tag = String.fromCharCode(dv.getUint8(off), dv.getUint8(off+1), dv.getUint8(off+2), dv.getUint8(off+3));
        if (tag === 'COLR') {
            const tableOffset = dv.getUint32(off + 8);
            return { data: dv, offset: tableOffset };
        }
    }
    throw new Error('No COLR table in Nabla');
}

describe('COLRv1 parsing', () => {
    let parsed;
    
    it('should parse Nabla\'s COLR table without crashing', () => {
        const { data, offset } = getColrTableData();
        parsed = colr.parse(data, offset);
        assert.ok(parsed, 'parsed result should exist');
        assert.equal(parsed.version, 1, 'should be version 1');
    });

    it('should have baseGlyphPaintRecords', () => {
        assert.ok(parsed.baseGlyphPaintRecords, 'should have baseGlyphPaintRecords');
        assert.equal(parsed.baseGlyphPaintRecords.length, 381, 'Nabla has 381 v1 base glyphs');
    });

    it('should parse PaintColrLayers as root', () => {
        const first = parsed.baseGlyphPaintRecords[0];
        assert.equal(first.paint.format, 1, 'root should be PaintColrLayers');
        assert.ok(first.paint.layers.length > 0, 'should have layers');
    });

    it('should parse PaintGlyph with PaintSolid', () => {
        // First base glyph's first layer should be PaintGlyph → PaintSolid
        const first = parsed.baseGlyphPaintRecords[0];
        const firstLayer = first.paint.layers[0];
        assert.equal(firstLayer.format, 10, 'layer should be PaintGlyph');
        assert.ok(firstLayer.glyphID >= 0, 'should have glyphID');
        assert.ok(firstLayer.paint, 'PaintGlyph should have inner paint');
        // First layer of glyph 0 is PaintSolid (format 2)
        assert.equal(firstLayer.paint.format, 2, 'inner paint should be PaintSolid');
        assert.ok(typeof firstLayer.paint.paletteIndex === 'number', 'should have paletteIndex');
        assert.ok(typeof firstLayer.paint.alpha === 'number', 'should have alpha');
    });

    it('should parse PaintGlyph with PaintLinearGradient', () => {
        // Find a layer with linear gradient (format 4)
        let found = false;
        for (const rec of parsed.baseGlyphPaintRecords) {
            for (const layer of rec.paint.layers) {
                if (layer.format === 10 && layer.paint && layer.paint.format === 4) {
                    found = true;
                    const grad = layer.paint;
                    assert.ok(grad.colorLine, 'gradient should have colorLine');
                    // Validate colorLine structure (property is colorStops, NOT stops)
                    assert.equal(grad.colorLine.stops, undefined,
                        'colorLine should NOT have .stops (use .colorStops)');
                    assert.ok(Array.isArray(grad.colorLine.colorStops),
                        'colorLine.colorStops should be an array');
                    assert.ok(grad.colorLine.colorStops.length > 0,
                        'should have at least one colorStop');
                    // Validate colorStop structure
                    const stop = grad.colorLine.colorStops[0];
                    assert.ok(typeof stop.stopOffset === 'number', 'stop should have stopOffset');
                    assert.ok(typeof stop.paletteIndex === 'number', 'stop should have paletteIndex');
                    assert.ok(typeof stop.alpha === 'number', 'stop should have alpha');
                    // Validate extend mode
                    assert.ok(typeof grad.colorLine.extend === 'number', 'should have extend mode');
                    // Validate gradient coordinates
                    assert.ok(typeof grad.x0 === 'number', 'should have x0');
                    assert.ok(typeof grad.y0 === 'number', 'should have y0');
                    assert.ok(typeof grad.x1 === 'number', 'should have x1');
                    assert.ok(typeof grad.y1 === 'number', 'should have y1');
                    break;
                }
            }
            if (found) break;
        }
        assert.ok(found, 'should find at least one PaintLinearGradient');
    });

    it('should have layer list count', () => {
        assert.equal(parsed.layerListCount, 3655, 'Nabla has 3655 layer paints');
    });

    it('should have v0 records empty for pure v1 font', () => {
        assert.equal(parsed.baseGlyphRecords.length, 0, 'no v0 base glyph records');
        assert.equal(parsed.layerRecords.length, 0, 'no v0 layer records');
    });
});

// ── ClipList tests using more_samples font ──

const MORE_SAMPLES_PATH = join(import.meta.dirname, '../../../opentype-editor/static/more_samples-glyf_colr_1.ttf');

function getColrTableDataFrom(fontPath) {
    const buf = readFileSync(fontPath);
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const numTables = dv.getUint16(4);
    for (let i = 0; i < numTables; i++) {
        const off = 12 + i * 16;
        const tag = String.fromCharCode(dv.getUint8(off), dv.getUint8(off+1), dv.getUint8(off+2), dv.getUint8(off+3));
        if (tag === 'COLR') {
            return { data: dv, offset: dv.getUint32(off + 8) };
        }
    }
    throw new Error('No COLR table');
}

describe('COLRv1 ClipList parsing', () => {
    let parsed;

    it('should parse ClipList from more_samples font', () => {
        const { data, offset } = getColrTableDataFrom(MORE_SAMPLES_PATH);
        parsed = colr.parse(data, offset);
        assert.ok(parsed.clipList, 'should have clipList');
        assert.ok(parsed.clipList.clips.length > 0, `should have clips, got ${parsed.clipList.clips.length}`);
    });

    it('should have correct clipBox values', () => {
        // Find a clip with the known 0,0,1000,1000 box
        const clip = parsed.clipList.clips.find(c =>
            c.clipBox.xMin === 0 && c.clipBox.yMin === 0 &&
            c.clipBox.xMax === 1000 && c.clipBox.yMax === 1000
        );
        assert.ok(clip, 'should find a clip with (0,0,1000,1000)');
    });
});

describe('COLRv1 ClipList write roundtrip', () => {
    let original, roundtripped;

    it('should write and re-parse ClipList', () => {
        const { data, offset } = getColrTableDataFrom(MORE_SAMPLES_PATH);
        original = colr.parse(data, offset);
        assert.ok(original.clipList, 'original should have clipList');

        // Write
        const madeTable = colr.make(original);
        assert.ok(madeTable, 'make should return a table');

        // encode() returns a plain Array of bytes
        const encoded = madeTable.encode();
        const u8 = new Uint8Array(encoded);
        const dv2 = new DataView(u8.buffer);
        roundtripped = colr.parse(dv2, 0);
    });

    it('should preserve clipList through roundtrip', () => {
        assert.ok(roundtripped.clipList, 'roundtripped should have clipList');
        assert.equal(roundtripped.clipList.clips.length, original.clipList.clips.length,
            'clip count should match');
    });

    it('should preserve clipBox values through roundtrip', () => {
        for (let i = 0; i < original.clipList.clips.length; i++) {
            const orig = original.clipList.clips[i];
            const rt = roundtripped.clipList.clips[i];
            assert.equal(rt.startGlyphID, orig.startGlyphID, `clip[${i}].startGlyphID`);
            assert.equal(rt.endGlyphID, orig.endGlyphID, `clip[${i}].endGlyphID`);
            assert.equal(rt.clipBox.xMin, orig.clipBox.xMin, `clip[${i}].clipBox.xMin`);
            assert.equal(rt.clipBox.yMin, orig.clipBox.yMin, `clip[${i}].clipBox.yMin`);
            assert.equal(rt.clipBox.xMax, orig.clipBox.xMax, `clip[${i}].clipBox.xMax`);
            assert.equal(rt.clipBox.yMax, orig.clipBox.yMax, `clip[${i}].clipBox.yMax`);
        }
    });

    it('should preserve baseGlyphPaintRecords count through roundtrip', () => {
        assert.equal(roundtripped.baseGlyphPaintRecords.length,
            original.baseGlyphPaintRecords.length,
            'baseGlyphPaintRecords count should match');
    });
});
