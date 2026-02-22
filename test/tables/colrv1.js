// Quick verification of COLRv1 parsing on Nabla font
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

// Use src directly (not built dist)
import colr from '../../src/tables/colr.js';

const NABLA_PATH = join(import.meta.dirname, '../../../opentype-editor/test/fonts/Nabla/Nabla-Regular-VariableFont_EDPT,EHLT.ttf');

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
                if (layer.format === 10 && layer.paint.format === 4) {
                    found = true;
                    assert.ok(layer.paint.colorLine, 'gradient should have colorLine');
                    assert.ok(layer.paint.colorLine.stops.length > 0, 'should have gradient stops');
                    assert.ok(typeof layer.paint.colorLine.extend === 'number', 'should have extend mode');
                    assert.ok(typeof layer.paint.x0 === 'number', 'should have x0');
                    assert.ok(typeof layer.paint.y0 === 'number', 'should have y0');
                    assert.ok(typeof layer.paint.x1 === 'number', 'should have x1');
                    assert.ok(typeof layer.paint.y1 === 'number', 'should have y1');
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
