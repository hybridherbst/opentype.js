// The `COLR` table adds support for multi-colored glyphs
// https://learn.microsoft.com/en-us/typography/opentype/spec/colr

import { Parser } from '../parse.js';
import table from '../table.js';

// ── COLRv1 Paint format constants ──────────────────────────────────────────────
const PaintFormat = {
    ColrLayers:                     1,
    Solid:                          2,
    VarSolid:                       3,
    LinearGradient:                 4,
    VarLinearGradient:              5,
    RadialGradient:                 6,
    VarRadialGradient:              7,
    SweepGradient:                  8,
    VarSweepGradient:               9,
    Glyph:                          10,
    ColrGlyph:                      11,
    Transform:                      12,
    VarTransform:                   13,
    Translate:                      14,
    VarTranslate:                   15,
    Scale:                          16,
    VarScale:                       17,
    ScaleAroundCenter:              18,
    VarScaleAroundCenter:           19,
    ScaleUniform:                   20,
    VarScaleUniform:                21,
    ScaleUniformAroundCenter:       22,
    VarScaleUniformAroundCenter:    23,
    Rotate:                         24,
    VarRotate:                      25,
    RotateAroundCenter:             26,
    VarRotateAroundCenter:          27,
    Skew:                           28,
    VarSkew:                        29,
    SkewAroundCenter:               30,
    VarSkewAroundCenter:            31,
    Composite:                      32,
};

// Composite modes for PaintComposite (matches CSS/Porter-Duff)
const CompositeMode = {
    CLEAR:           0,
    SRC:             1,
    DEST:            2,
    SRC_OVER:        3,
    DEST_OVER:       4,
    SRC_IN:          5,
    DEST_IN:         6,
    SRC_OUT:         7,
    DEST_OUT:        8,
    SRC_ATOP:        9,
    DEST_ATOP:       10,
    XOR:             11,
    PLUS:            12,
    SCREEN:          13,
    OVERLAY:         14,
    DARKEN:          15,
    LIGHTEN:         16,
    COLOR_DODGE:     17,
    COLOR_BURN:      18,
    HARD_LIGHT:      19,
    SOFT_LIGHT:      20,
    DIFFERENCE:      21,
    EXCLUSION:       22,
    MULTIPLY:        23,
    HSL_HUE:         24,
    HSL_SATURATION:  25,
    HSL_COLOR:       26,
    HSL_LUMINOSITY:  27,
};

// ── Parsing helpers for COLRv1 ─────────────────────────────────────────────────

/**
 * Parse a ColorLine (gradient color stops)
 * @param {Parser} p - parser positioned at the ColorLine
 * @param {boolean} isVariable - whether this is a VarColorLine
 * @returns {{ extend: number, colorStops: Array }}
 */
function parseColorLine(p, isVariable) {
    const extend = p.parseByte(); // uint8 Extend enum: 0=pad, 1=repeat, 2=reflect
    const numStops = p.parseUShort();
    const colorStops = [];
    for (let i = 0; i < numStops; i++) {
        const stop = {
            stopOffset: p.parseF2Dot14(),
            paletteIndex: p.parseUShort(),
            alpha: p.parseF2Dot14(),
        };
        if (isVariable) {
            stop.varIndexBase = p.parseULong();
        }
        colorStops.push(stop);
    }
    return { extend, colorStops };
}

/**
 * Parse an Affine2x3 transform matrix
 * @param {Parser} p - parser positioned at the Affine2x3
 * @param {boolean} isVariable
 * @returns {{ xx: number, yx: number, xy: number, yy: number, dx: number, dy: number }}
 */
function parseAffine2x3(p, isVariable) {
    const matrix = {
        xx: p.parseFixed(),
        yx: p.parseFixed(),
        xy: p.parseFixed(),
        yy: p.parseFixed(),
        dx: p.parseFixed(),
        dy: p.parseFixed(),
    };
    if (isVariable) {
        matrix.varIndexBase = p.parseULong();
    }
    return matrix;
}

/**
 * Recursively parse a paint table at the given absolute offset.
 * @param {DataView} data - raw font data
 * @param {number} offset - absolute byte offset of the paint table
 * @param {Array<number> | null} layerList - parsed layer list (array of paint offsets) for PaintColrLayers
 * @param {number} colrTableStart - absolute offset of the COLR table start
 * @param {Set<number>} visited - cycle detection
 * @returns {Record<string, unknown>} parsed paint node
 */
function parsePaintTable(data, offset, layerList, colrTableStart, visited) {
    if (visited.has(offset)) {
        console.warn('COLRv1: cycle detected in paint graph at offset', offset);
        return { format: 0, _error: 'cycle' };
    }
    visited.add(offset);

    const p = new Parser(data, offset);
    const format = p.parseByte();

    switch (format) {
        case PaintFormat.ColrLayers: {
            const numLayers = p.parseByte();
            const firstLayerIndex = p.parseULong();
            const layers = [];
            if (layerList) {
                for (let i = 0; i < numLayers; i++) {
                    const idx = firstLayerIndex + i;
                    if (idx < layerList.length) {
                        layers.push(parsePaintTable(data, layerList[idx], layerList, colrTableStart, new Set(visited)));
                    }
                }
            }
            return { format, numLayers, firstLayerIndex, layers };
        }

        case PaintFormat.Solid: {
            const paletteIndex = p.parseUShort();
            const alpha = p.parseF2Dot14();
            return { format, paletteIndex, alpha };
        }

        case PaintFormat.VarSolid: {
            const paletteIndex = p.parseUShort();
            const alpha = p.parseF2Dot14();
            const varIndexBase = p.parseULong();
            return { format, paletteIndex, alpha, varIndexBase };
        }

        case PaintFormat.LinearGradient:
        case PaintFormat.VarLinearGradient: {
            const isVar = format === PaintFormat.VarLinearGradient;
            const colorLineOffset = p.parseUInt24();
            const x0 = p.parseShort();
            const y0 = p.parseShort();
            const x1 = p.parseShort();
            const y1 = p.parseShort();
            const x2 = p.parseShort();
            const y2 = p.parseShort();
            const result = { format, x0, y0, x1, y1, x2, y2 };
            if (isVar) result.varIndexBase = p.parseULong();
            // Parse the ColorLine at the resolved offset
            const clParser = new Parser(data, offset + colorLineOffset);
            result.colorLine = parseColorLine(clParser, isVar);
            return result;
        }

        case PaintFormat.RadialGradient:
        case PaintFormat.VarRadialGradient: {
            const isVar = format === PaintFormat.VarRadialGradient;
            const colorLineOffset = p.parseUInt24();
            const x0 = p.parseShort();
            const y0 = p.parseShort();
            const radius0 = p.parseUShort();
            const x1 = p.parseShort();
            const y1 = p.parseShort();
            const radius1 = p.parseUShort();
            const result = { format, x0, y0, radius0, x1, y1, radius1 };
            if (isVar) result.varIndexBase = p.parseULong();
            const clParser = new Parser(data, offset + colorLineOffset);
            result.colorLine = parseColorLine(clParser, isVar);
            return result;
        }

        case PaintFormat.SweepGradient:
        case PaintFormat.VarSweepGradient: {
            const isVar = format === PaintFormat.VarSweepGradient;
            const colorLineOffset = p.parseUInt24();
            const centerX = p.parseShort();
            const centerY = p.parseShort();
            const startAngle = p.parseF2Dot14();
            const endAngle = p.parseF2Dot14();
            const result = { format, centerX, centerY, startAngle, endAngle };
            if (isVar) result.varIndexBase = p.parseULong();
            const clParser = new Parser(data, offset + colorLineOffset);
            result.colorLine = parseColorLine(clParser, isVar);
            return result;
        }

        case PaintFormat.Glyph: {
            const paintOffset = p.parseUInt24();
            const glyphID = p.parseUShort();
            const paint = parsePaintTable(data, offset + paintOffset, layerList, colrTableStart, new Set(visited));
            return { format, glyphID, paint };
        }

        case PaintFormat.ColrGlyph: {
            const glyphID = p.parseUShort();
            return { format, glyphID };
        }

        case PaintFormat.Transform:
        case PaintFormat.VarTransform: {
            const isVar = format === PaintFormat.VarTransform;
            const paintOffset = p.parseUInt24();
            const transformOffset = p.parseUInt24();
            const paint = parsePaintTable(data, offset + paintOffset, layerList, colrTableStart, new Set(visited));
            const tp = new Parser(data, offset + transformOffset);
            const transform = parseAffine2x3(tp, isVar);
            return { format, paint, transform };
        }

        case PaintFormat.Translate:
        case PaintFormat.VarTranslate: {
            const isVar = format === PaintFormat.VarTranslate;
            const paintOffset = p.parseUInt24();
            const dx = p.parseShort();
            const dy = p.parseShort();
            const paint = parsePaintTable(data, offset + paintOffset, layerList, colrTableStart, new Set(visited));
            const result = { format, paint, dx, dy };
            if (isVar) result.varIndexBase = p.parseULong();
            return result;
        }

        case PaintFormat.Scale:
        case PaintFormat.VarScale: {
            const isVar = format === PaintFormat.VarScale;
            const paintOffset = p.parseUInt24();
            const scaleX = p.parseF2Dot14();
            const scaleY = p.parseF2Dot14();
            const paint = parsePaintTable(data, offset + paintOffset, layerList, colrTableStart, new Set(visited));
            const result = { format, paint, scaleX, scaleY };
            if (isVar) result.varIndexBase = p.parseULong();
            return result;
        }

        case PaintFormat.ScaleAroundCenter:
        case PaintFormat.VarScaleAroundCenter: {
            const isVar = format === PaintFormat.VarScaleAroundCenter;
            const paintOffset = p.parseUInt24();
            const scaleX = p.parseF2Dot14();
            const scaleY = p.parseF2Dot14();
            const centerX = p.parseShort();
            const centerY = p.parseShort();
            const paint = parsePaintTable(data, offset + paintOffset, layerList, colrTableStart, new Set(visited));
            const result = { format, paint, scaleX, scaleY, centerX, centerY };
            if (isVar) result.varIndexBase = p.parseULong();
            return result;
        }

        case PaintFormat.ScaleUniform:
        case PaintFormat.VarScaleUniform: {
            const isVar = format === PaintFormat.VarScaleUniform;
            const paintOffset = p.parseUInt24();
            const scale = p.parseF2Dot14();
            const paint = parsePaintTable(data, offset + paintOffset, layerList, colrTableStart, new Set(visited));
            const result = { format, paint, scale };
            if (isVar) result.varIndexBase = p.parseULong();
            return result;
        }

        case PaintFormat.ScaleUniformAroundCenter:
        case PaintFormat.VarScaleUniformAroundCenter: {
            const isVar = format === PaintFormat.VarScaleUniformAroundCenter;
            const paintOffset = p.parseUInt24();
            const scale = p.parseF2Dot14();
            const centerX = p.parseShort();
            const centerY = p.parseShort();
            const paint = parsePaintTable(data, offset + paintOffset, layerList, colrTableStart, new Set(visited));
            const result = { format, paint, scale, centerX, centerY };
            if (isVar) result.varIndexBase = p.parseULong();
            return result;
        }

        case PaintFormat.Rotate:
        case PaintFormat.VarRotate: {
            const isVar = format === PaintFormat.VarRotate;
            const paintOffset = p.parseUInt24();
            const angle = p.parseF2Dot14();
            const paint = parsePaintTable(data, offset + paintOffset, layerList, colrTableStart, new Set(visited));
            const result = { format, paint, angle };
            if (isVar) result.varIndexBase = p.parseULong();
            return result;
        }

        case PaintFormat.RotateAroundCenter:
        case PaintFormat.VarRotateAroundCenter: {
            const isVar = format === PaintFormat.VarRotateAroundCenter;
            const paintOffset = p.parseUInt24();
            const angle = p.parseF2Dot14();
            const centerX = p.parseShort();
            const centerY = p.parseShort();
            const paint = parsePaintTable(data, offset + paintOffset, layerList, colrTableStart, new Set(visited));
            const result = { format, paint, angle, centerX, centerY };
            if (isVar) result.varIndexBase = p.parseULong();
            return result;
        }

        case PaintFormat.Skew:
        case PaintFormat.VarSkew: {
            const isVar = format === PaintFormat.VarSkew;
            const paintOffset = p.parseUInt24();
            const xSkewAngle = p.parseF2Dot14();
            const ySkewAngle = p.parseF2Dot14();
            const paint = parsePaintTable(data, offset + paintOffset, layerList, colrTableStart, new Set(visited));
            const result = { format, paint, xSkewAngle, ySkewAngle };
            if (isVar) result.varIndexBase = p.parseULong();
            return result;
        }

        case PaintFormat.SkewAroundCenter:
        case PaintFormat.VarSkewAroundCenter: {
            const isVar = format === PaintFormat.VarSkewAroundCenter;
            const paintOffset = p.parseUInt24();
            const xSkewAngle = p.parseF2Dot14();
            const ySkewAngle = p.parseF2Dot14();
            const centerX = p.parseShort();
            const centerY = p.parseShort();
            const paint = parsePaintTable(data, offset + paintOffset, layerList, colrTableStart, new Set(visited));
            const result = { format, paint, xSkewAngle, ySkewAngle, centerX, centerY };
            if (isVar) result.varIndexBase = p.parseULong();
            return result;
        }

        case PaintFormat.Composite: {
            const sourcePaintOffset = p.parseUInt24();
            const compositeMode = p.parseByte();
            const backdropPaintOffset = p.parseUInt24();
            const source = parsePaintTable(data, offset + sourcePaintOffset, layerList, colrTableStart, new Set(visited));
            const backdrop = parsePaintTable(data, offset + backdropPaintOffset, layerList, colrTableStart, new Set(visited));
            return { format, source, compositeMode, backdrop };
        }

        default:
            console.warn('COLRv1: unknown paint format', format, 'at offset', offset);
            return { format, _error: 'unknown' };
    }
}

/**
 * Parse a ClipList
 * @param {DataView} data
 * @param {number} offset - absolute offset
 * @returns {Array<{ startGlyphID: number, endGlyphID: number, clipBox: Record<string, unknown> }>}
 */
/**
 * @returns {{ format: number, clips: Array<{startGlyphID: number, endGlyphID: number, clipBox: {format: number, xMin: number, yMin: number, xMax: number, yMax: number, varIndexBase?: number}}> }}
 */
function parseClipList(data, offset) {
    const p = new Parser(data, offset);
    const clipFormat = p.parseByte();
    const numClips = p.parseULong();
    const clips = [];
    for (let i = 0; i < numClips; i++) {
        const startGlyphID = p.parseUShort();
        const endGlyphID = p.parseUShort();
        const clipBoxOffset = p.parseUInt24();
        // Parse ClipBox at offset
        const cp = new Parser(data, offset + clipBoxOffset);
        const boxFormat = cp.parseByte();
        const clipBox = {
            format: boxFormat,
            xMin: cp.parseShort(),
            yMin: cp.parseShort(),
            xMax: cp.parseShort(),
            yMax: cp.parseShort(),
        };
        if (boxFormat === 2) {
            clipBox.varIndexBase = cp.parseULong();
        }
        clips.push({ startGlyphID, endGlyphID, clipBox });
    }
    return { format: clipFormat, clips };
}

// ── Main COLR parser ───────────────────────────────────────────────────────────

function parseColrTable(data, start) {
    const p = new Parser(data, start);
    const version = p.parseUShort();

    // ── v0 header fields (always present) ──
    const numBaseGlyphRecords = p.parseUShort();
    const baseGlyphRecordsOffset = p.parseOffset32();
    const layerRecordsOffset = p.parseOffset32();
    const numLayerRecords = p.parseUShort();

    // ── v0 base glyph records & layer records ──
    p.relativeOffset = baseGlyphRecordsOffset;
    const baseGlyphRecords = p.parseRecordList(numBaseGlyphRecords, {
        glyphID: Parser.uShort,
        firstLayerIndex: Parser.uShort,
        numLayers: Parser.uShort,
    });
    p.relativeOffset = layerRecordsOffset;
    const layerRecords = p.parseRecordList(numLayerRecords, {
        glyphID: Parser.uShort,
        paletteIndex: Parser.uShort,
    });

    const result = {
        version,
        baseGlyphRecords,
        layerRecords,
    };

    // ── v1 extension ───────────────────────────────────────────────────────
    if (version >= 1) {
        p.relativeOffset = 14; // right after v0 header fields
        const baseGlyphListOffset = p.parseOffset32();
        const layerListOffset = p.parseOffset32();
        const clipListOffset = p.parseOffset32();
        const varIndexMapOffset = p.parseOffset32();
        const itemVariationStoreOffset = p.parseOffset32();

        // ── Parse LayerList (flat array of paint table absolute offsets) ──
        let layerListAbsolute = null; // array of absolute offsets
        if (layerListOffset > 0) {
            const llp = new Parser(data, start + layerListOffset);
            const numPaints = llp.parseULong();
            layerListAbsolute = [];
            for (let i = 0; i < numPaints; i++) {
                const paintOffset = llp.parseOffset32();
                // Paint offsets in LayerList are relative to the start of the LayerList
                layerListAbsolute.push(start + layerListOffset + paintOffset);
            }
        }

        // ── Parse BaseGlyphList ──
        if (baseGlyphListOffset > 0) {
            const blp = new Parser(data, start + baseGlyphListOffset);
            const numBaseGlyphPaintRecords = blp.parseULong();
            const baseGlyphPaintRecords = [];
            for (let i = 0; i < numBaseGlyphPaintRecords; i++) {
                const glyphID = blp.parseUShort();
                const paintOffset = blp.parseOffset32();
                // Paint offsets are relative to the start of the BaseGlyphList
                const paintAbsolute = start + baseGlyphListOffset + paintOffset;
                const paint = parsePaintTable(data, paintAbsolute, layerListAbsolute, start, new Set());
                baseGlyphPaintRecords.push({ glyphID, paint });
            }
            result.baseGlyphPaintRecords = baseGlyphPaintRecords;
        }

        // ── Store layer list paint count for reference ──
        if (layerListAbsolute) {
            result.layerListCount = layerListAbsolute.length;
        }

        // ── Parse ClipList ──
        if (clipListOffset > 0) {
            result.clipList = parseClipList(data, start + clipListOffset);
        }

        // ── Parse ItemVariationStore and DeltaSetIndexMap ──
        // Bounds-check: offsets must point past the 34-byte COLR header and
        // within the DataView. Early COLRv1 draft fonts (e.g. samples-glyf_colr_1.ttf)
        // have garbage in these fields — their bytes are leftover v0 data.
        const headerSize = 34; // v0 (14) + v1 extension (20)
        const tableEnd = data.byteLength;
        if (itemVariationStoreOffset >= headerSize && start + itemVariationStoreOffset + 4 < tableEnd) {
            const ivsParser = new Parser(data, start + itemVariationStoreOffset);
            result.varStore = ivsParser.parseItemVariationStore();
        }
        if (varIndexMapOffset >= headerSize && start + varIndexMapOffset + 4 < tableEnd) {
            const dimParser = new Parser(data, start + varIndexMapOffset);
            result.varIndexMap = dimParser.parseDeltaSetIndexMap();
        }

        // Store raw offsets for roundtrip (writing will need them)
        result._v1Offsets = {
            baseGlyphListOffset,
            layerListOffset,
            clipListOffset,
            varIndexMapOffset,
            itemVariationStoreOffset,
        };
    }

    return result;
}

// ── COLRv1 Paint writing helpers ───────────────────────────────────────────────

/**
 * Serialize a ColorLine to bytes
 * @param {{ extend, colorStops }} colorLine
 * @param {boolean} [isVariable=false] - whether to write VarColorLine (with per-stop varIndexBase)
 * @returns {number[]} byte array
 */
function encodeColorLine(colorLine, isVariable) {
    const bytes = [];
    // extend: uint8 (Extend enum)
    bytes.push(colorLine.extend & 0xFF);
    // numStops: USHORT
    const numStops = colorLine.colorStops.length;
    bytes.push((numStops >> 8) & 0xFF, numStops & 0xFF);
    for (const stop of colorLine.colorStops) {
        // stopOffset: F2Dot14 (int16)
        const stopVal = Math.round(stop.stopOffset * 16384);
        bytes.push((stopVal >> 8) & 0xFF, stopVal & 0xFF);
        // paletteIndex: USHORT
        bytes.push((stop.paletteIndex >> 8) & 0xFF, stop.paletteIndex & 0xFF);
        // alpha: F2Dot14 (int16)
        const alphaVal = Math.round(stop.alpha * 16384);
        bytes.push((alphaVal >> 8) & 0xFF, alphaVal & 0xFF);
        // VarColorLine: per-stop varIndexBase (uint32)
        if (isVariable) {
            writeUint32(bytes, stop.varIndexBase || 0);
        }
    }
    return bytes;
}

/**
 * Serialize an Affine2x3 matrix to bytes (6 × Fixed 16.16 = 24 bytes, + optional varIndexBase)
 * @param {{ xx, yx, xy, yy, dx, dy, varIndexBase? }} m
 * @param {boolean} [isVariable=false] - whether to write varIndexBase
 * @returns {number[]}
 */
function encodeAffine2x3(m, isVariable) {
    const bytes = [];
    for (const key of ['xx', 'yx', 'xy', 'yy', 'dx', 'dy']) {
        // Convert to Fixed 16.16: multiply by 65536 and round to nearest integer.
        // Using Math.round avoids the Math.floor bug where tiny negative values
        // like -1e-16 would floor to -1, corrupting the transform.
        const fixed = Math.round(m[key] * 65536);
        bytes.push((fixed >> 24) & 0xFF, (fixed >> 16) & 0xFF, (fixed >> 8) & 0xFF, fixed & 0xFF);
    }
    if (isVariable) {
        writeUint32(bytes, m.varIndexBase || 0);
    }
    return bytes;
}

/**
 * Write a 24-bit unsigned integer (big endian, 3 bytes)
 */
function writeUint24(bytes, val) {
    bytes.push((val >> 16) & 0xFF, (val >> 8) & 0xFF, val & 0xFF);
}

/**
 * Write a 16-bit unsigned integer (big endian)
 */
function writeUint16(bytes, val) {
    bytes.push((val >> 8) & 0xFF, val & 0xFF);
}

/**
 * Write a 16-bit signed integer (big endian)
 */
function writeInt16(bytes, val) {
    if (val < 0) val = 0x10000 + val;
    bytes.push((val >> 8) & 0xFF, val & 0xFF);
}

/**
 * Write a 32-bit unsigned integer (big endian)
 */
function writeUint32(bytes, val) {
    bytes.push((val >> 24) & 0xFF, (val >> 16) & 0xFF, (val >> 8) & 0xFF, val & 0xFF);
}

/**
 * Write an F2Dot14 value
 */
function writeF2Dot14(bytes, val) {
    const v = Math.round(val * 16384);
    writeInt16(bytes, v);
}

/**
 * Serialize a paint node into a flat byte buffer.
 * Returns { paintBytes, allBuffers } where allBuffers is a list of sub-table
 * byte arrays that must be appended after the paint table data block.
 *
 * For simplicity we use a two-pass approach:
 * - First, collect all paint nodes into a flattened array
 * - Then, assign offsets and fixup references
 *
 * However, for the table.Table approach used by opentype.js, we will serialize
 * the paint tree into a flat byte array and embed it as a LITERAL.
 */

/**
 * Flatten a paint tree into an array of { node, bytes, childRefs }
 * where childRefs are indices into the array that need offset fixups.
 */
function serializePaintNode(node) {
    const bytes = [];
    
    bytes.push(node.format);

    switch (node.format) {
        case PaintFormat.ColrLayers: {
            bytes.push(node.numLayers);
            writeUint32(bytes, node.firstLayerIndex);
            break;
        }

        case PaintFormat.Solid: {
            writeUint16(bytes, node.paletteIndex);
            writeF2Dot14(bytes, node.alpha);
            break;
        }

        case PaintFormat.VarSolid: {
            writeUint16(bytes, node.paletteIndex);
            writeF2Dot14(bytes, node.alpha);
            writeUint32(bytes, node.varIndexBase || 0);
            break;
        }

        case PaintFormat.LinearGradient:
        case PaintFormat.VarLinearGradient: {
            const isVar = node.format === PaintFormat.VarLinearGradient;
            // ColorLine offset placeholder (3 bytes) — will be fixed up
            const colorLineBytes = encodeColorLine(node.colorLine, isVar);
            const colorLineOffsetPos = bytes.length;
            writeUint24(bytes, 0); // placeholder
            writeInt16(bytes, node.x0);
            writeInt16(bytes, node.y0);
            writeInt16(bytes, node.x1);
            writeInt16(bytes, node.y1);
            writeInt16(bytes, node.x2);
            writeInt16(bytes, node.y2);
            if (isVar) writeUint32(bytes, node.varIndexBase || 0);
            // Fix up: colorLine offset is relative to the start of this paint table
            const colorLineOffset = bytes.length;
            bytes[colorLineOffsetPos] = (colorLineOffset >> 16) & 0xFF;
            bytes[colorLineOffsetPos + 1] = (colorLineOffset >> 8) & 0xFF;
            bytes[colorLineOffsetPos + 2] = colorLineOffset & 0xFF;
            bytes.push(...colorLineBytes);
            break;
        }

        case PaintFormat.RadialGradient:
        case PaintFormat.VarRadialGradient: {
            const isVar = node.format === PaintFormat.VarRadialGradient;
            const colorLineBytes = encodeColorLine(node.colorLine, isVar);
            const colorLineOffsetPos = bytes.length;
            writeUint24(bytes, 0);
            writeInt16(bytes, node.x0);
            writeInt16(bytes, node.y0);
            writeUint16(bytes, node.radius0);
            writeInt16(bytes, node.x1);
            writeInt16(bytes, node.y1);
            writeUint16(bytes, node.radius1);
            if (isVar) writeUint32(bytes, node.varIndexBase || 0);
            const colorLineOffset = bytes.length;
            bytes[colorLineOffsetPos] = (colorLineOffset >> 16) & 0xFF;
            bytes[colorLineOffsetPos + 1] = (colorLineOffset >> 8) & 0xFF;
            bytes[colorLineOffsetPos + 2] = colorLineOffset & 0xFF;
            bytes.push(...colorLineBytes);
            break;
        }

        case PaintFormat.SweepGradient:
        case PaintFormat.VarSweepGradient: {
            const isVar = node.format === PaintFormat.VarSweepGradient;
            const colorLineBytes = encodeColorLine(node.colorLine, isVar);
            const colorLineOffsetPos = bytes.length;
            writeUint24(bytes, 0);
            writeInt16(bytes, node.centerX);
            writeInt16(bytes, node.centerY);
            writeF2Dot14(bytes, node.startAngle);
            writeF2Dot14(bytes, node.endAngle);
            if (isVar) writeUint32(bytes, node.varIndexBase || 0);
            const colorLineOffset = bytes.length;
            bytes[colorLineOffsetPos] = (colorLineOffset >> 16) & 0xFF;
            bytes[colorLineOffsetPos + 1] = (colorLineOffset >> 8) & 0xFF;
            bytes[colorLineOffsetPos + 2] = colorLineOffset & 0xFF;
            bytes.push(...colorLineBytes);
            break;
        }

        case PaintFormat.Glyph: {
            // This needs special handling: paint is a sub-table
            // We serialize the child paint inline after this node
            const childBytes = serializePaintNode(node.paint);
            const paintOffsetPos = bytes.length;
            writeUint24(bytes, 0); // placeholder
            writeUint16(bytes, node.glyphID);
            // Fix up paint offset (relative to start of this paint)
            const paintOffset = bytes.length;
            bytes[paintOffsetPos] = (paintOffset >> 16) & 0xFF;
            bytes[paintOffsetPos + 1] = (paintOffset >> 8) & 0xFF;
            bytes[paintOffsetPos + 2] = paintOffset & 0xFF;
            bytes.push(...childBytes);
            break;
        }

        case PaintFormat.ColrGlyph: {
            writeUint16(bytes, node.glyphID);
            break;
        }

        case PaintFormat.Transform:
        case PaintFormat.VarTransform: {
            const isVar = node.format === PaintFormat.VarTransform;
            const childBytes = serializePaintNode(node.paint);
            const transformBytes = encodeAffine2x3(node.transform, isVar);
            const paintOffsetPos = bytes.length;
            writeUint24(bytes, 0); // paint offset placeholder
            const transformOffsetPos = bytes.length;
            writeUint24(bytes, 0); // transform offset placeholder
            // Paint comes first
            const paintOffset = bytes.length;
            bytes[paintOffsetPos] = (paintOffset >> 16) & 0xFF;
            bytes[paintOffsetPos + 1] = (paintOffset >> 8) & 0xFF;
            bytes[paintOffsetPos + 2] = paintOffset & 0xFF;
            bytes.push(...childBytes);
            // Then transform
            const transformOffset = bytes.length;
            bytes[transformOffsetPos] = (transformOffset >> 16) & 0xFF;
            bytes[transformOffsetPos + 1] = (transformOffset >> 8) & 0xFF;
            bytes[transformOffsetPos + 2] = transformOffset & 0xFF;
            bytes.push(...transformBytes);
            break;
        }

        case PaintFormat.Translate:
        case PaintFormat.VarTranslate: {
            const childBytes = serializePaintNode(node.paint);
            const paintOffsetPos = bytes.length;
            writeUint24(bytes, 0);
            writeInt16(bytes, node.dx);
            writeInt16(bytes, node.dy);
            if (node.format === PaintFormat.VarTranslate) writeUint32(bytes, node.varIndexBase || 0);
            const paintOffset = bytes.length;
            bytes[paintOffsetPos] = (paintOffset >> 16) & 0xFF;
            bytes[paintOffsetPos + 1] = (paintOffset >> 8) & 0xFF;
            bytes[paintOffsetPos + 2] = paintOffset & 0xFF;
            bytes.push(...childBytes);
            break;
        }

        case PaintFormat.Scale:
        case PaintFormat.VarScale: {
            const childBytes = serializePaintNode(node.paint);
            const paintOffsetPos = bytes.length;
            writeUint24(bytes, 0);
            writeF2Dot14(bytes, node.scaleX);
            writeF2Dot14(bytes, node.scaleY);
            if (node.format === PaintFormat.VarScale) writeUint32(bytes, node.varIndexBase || 0);
            const paintOffset = bytes.length;
            bytes[paintOffsetPos] = (paintOffset >> 16) & 0xFF;
            bytes[paintOffsetPos + 1] = (paintOffset >> 8) & 0xFF;
            bytes[paintOffsetPos + 2] = paintOffset & 0xFF;
            bytes.push(...childBytes);
            break;
        }

        case PaintFormat.ScaleAroundCenter:
        case PaintFormat.VarScaleAroundCenter: {
            const childBytes = serializePaintNode(node.paint);
            const paintOffsetPos = bytes.length;
            writeUint24(bytes, 0);
            writeF2Dot14(bytes, node.scaleX);
            writeF2Dot14(bytes, node.scaleY);
            writeInt16(bytes, node.centerX);
            writeInt16(bytes, node.centerY);
            if (node.format === PaintFormat.VarScaleAroundCenter) writeUint32(bytes, node.varIndexBase || 0);
            const paintOffset = bytes.length;
            bytes[paintOffsetPos] = (paintOffset >> 16) & 0xFF;
            bytes[paintOffsetPos + 1] = (paintOffset >> 8) & 0xFF;
            bytes[paintOffsetPos + 2] = paintOffset & 0xFF;
            bytes.push(...childBytes);
            break;
        }

        case PaintFormat.ScaleUniform:
        case PaintFormat.VarScaleUniform: {
            const childBytes = serializePaintNode(node.paint);
            const paintOffsetPos = bytes.length;
            writeUint24(bytes, 0);
            writeF2Dot14(bytes, node.scale);
            if (node.format === PaintFormat.VarScaleUniform) writeUint32(bytes, node.varIndexBase || 0);
            const paintOffset = bytes.length;
            bytes[paintOffsetPos] = (paintOffset >> 16) & 0xFF;
            bytes[paintOffsetPos + 1] = (paintOffset >> 8) & 0xFF;
            bytes[paintOffsetPos + 2] = paintOffset & 0xFF;
            bytes.push(...childBytes);
            break;
        }

        case PaintFormat.ScaleUniformAroundCenter:
        case PaintFormat.VarScaleUniformAroundCenter: {
            const childBytes = serializePaintNode(node.paint);
            const paintOffsetPos = bytes.length;
            writeUint24(bytes, 0);
            writeF2Dot14(bytes, node.scale);
            writeInt16(bytes, node.centerX);
            writeInt16(bytes, node.centerY);
            if (node.format === PaintFormat.VarScaleUniformAroundCenter) writeUint32(bytes, node.varIndexBase || 0);
            const paintOffset = bytes.length;
            bytes[paintOffsetPos] = (paintOffset >> 16) & 0xFF;
            bytes[paintOffsetPos + 1] = (paintOffset >> 8) & 0xFF;
            bytes[paintOffsetPos + 2] = paintOffset & 0xFF;
            bytes.push(...childBytes);
            break;
        }

        case PaintFormat.Rotate:
        case PaintFormat.VarRotate: {
            const childBytes = serializePaintNode(node.paint);
            const paintOffsetPos = bytes.length;
            writeUint24(bytes, 0);
            writeF2Dot14(bytes, node.angle);
            if (node.format === PaintFormat.VarRotate) writeUint32(bytes, node.varIndexBase || 0);
            const paintOffset = bytes.length;
            bytes[paintOffsetPos] = (paintOffset >> 16) & 0xFF;
            bytes[paintOffsetPos + 1] = (paintOffset >> 8) & 0xFF;
            bytes[paintOffsetPos + 2] = paintOffset & 0xFF;
            bytes.push(...childBytes);
            break;
        }

        case PaintFormat.RotateAroundCenter:
        case PaintFormat.VarRotateAroundCenter: {
            const childBytes = serializePaintNode(node.paint);
            const paintOffsetPos = bytes.length;
            writeUint24(bytes, 0);
            writeF2Dot14(bytes, node.angle);
            writeInt16(bytes, node.centerX);
            writeInt16(bytes, node.centerY);
            if (node.format === PaintFormat.VarRotateAroundCenter) writeUint32(bytes, node.varIndexBase || 0);
            const paintOffset = bytes.length;
            bytes[paintOffsetPos] = (paintOffset >> 16) & 0xFF;
            bytes[paintOffsetPos + 1] = (paintOffset >> 8) & 0xFF;
            bytes[paintOffsetPos + 2] = paintOffset & 0xFF;
            bytes.push(...childBytes);
            break;
        }

        case PaintFormat.Skew:
        case PaintFormat.VarSkew: {
            const childBytes = serializePaintNode(node.paint);
            const paintOffsetPos = bytes.length;
            writeUint24(bytes, 0);
            writeF2Dot14(bytes, node.xSkewAngle);
            writeF2Dot14(bytes, node.ySkewAngle);
            if (node.format === PaintFormat.VarSkew) writeUint32(bytes, node.varIndexBase || 0);
            const paintOffset = bytes.length;
            bytes[paintOffsetPos] = (paintOffset >> 16) & 0xFF;
            bytes[paintOffsetPos + 1] = (paintOffset >> 8) & 0xFF;
            bytes[paintOffsetPos + 2] = paintOffset & 0xFF;
            bytes.push(...childBytes);
            break;
        }

        case PaintFormat.SkewAroundCenter:
        case PaintFormat.VarSkewAroundCenter: {
            const childBytes = serializePaintNode(node.paint);
            const paintOffsetPos = bytes.length;
            writeUint24(bytes, 0);
            writeF2Dot14(bytes, node.xSkewAngle);
            writeF2Dot14(bytes, node.ySkewAngle);
            writeInt16(bytes, node.centerX);
            writeInt16(bytes, node.centerY);
            if (node.format === PaintFormat.VarSkewAroundCenter) writeUint32(bytes, node.varIndexBase || 0);
            const paintOffset = bytes.length;
            bytes[paintOffsetPos] = (paintOffset >> 16) & 0xFF;
            bytes[paintOffsetPos + 1] = (paintOffset >> 8) & 0xFF;
            bytes[paintOffsetPos + 2] = paintOffset & 0xFF;
            bytes.push(...childBytes);
            break;
        }

        case PaintFormat.Composite: {
            const sourceBytes = serializePaintNode(node.source);
            const backdropBytes = serializePaintNode(node.backdrop);
            const sourceOffsetPos = bytes.length;
            writeUint24(bytes, 0); // source paint offset
            bytes.push(node.compositeMode);
            const backdropOffsetPos = bytes.length;
            writeUint24(bytes, 0); // backdrop paint offset
            // Source paint
            const sourceOffset = bytes.length;
            bytes[sourceOffsetPos] = (sourceOffset >> 16) & 0xFF;
            bytes[sourceOffsetPos + 1] = (sourceOffset >> 8) & 0xFF;
            bytes[sourceOffsetPos + 2] = sourceOffset & 0xFF;
            bytes.push(...sourceBytes);
            // Backdrop paint
            const backdropOffset = bytes.length;
            bytes[backdropOffsetPos] = (backdropOffset >> 16) & 0xFF;
            bytes[backdropOffsetPos + 1] = (backdropOffset >> 8) & 0xFF;
            bytes[backdropOffsetPos + 2] = backdropOffset & 0xFF;
            bytes.push(...backdropBytes);
            break;
        }

        default:
            // Unknown format - write just the format byte
            break;
    }

    return bytes;
}

/**
 * Build a flat LayerList and BaseGlyphList from baseGlyphPaintRecords.
 * Extracts PaintColrLayers → individual layer paints into a shared LayerList,
 * which is the structure expected by the binary format.
 *
 * Handles nested PaintColrLayers correctly: depth-first extracts sublayers
 * into the LayerList before the parent layers, rewriting firstLayerIndex at
 * every level.
 */
function buildV1Tables(baseGlyphPaintRecords) {
    // Shared flat LayerList — every PaintColrLayers' layers end up here
    const layerPaintBytes = []; // array of byte arrays, one per layer paint
    const baseGlyphEntries = []; // { glyphID, paintBytes }

    /**
     * Recursively walk a paint tree. When a PaintColrLayers node is found,
     * its child layers are (after recursive processing) appended to the
     * shared layerPaintBytes array and the node is rewritten with the
     * correct firstLayerIndex.  All other node types are shallow-cloned
     * with their child paint references recursively processed.
     */
    function extractLayers(paint) {
        if (!paint || typeof paint !== 'object') return paint;

        if (paint.format === PaintFormat.ColrLayers && paint.layers) {
            // Depth-first: process each child layer so nested PaintColrLayers
            // add their sublayers to the LayerList first.
            const processedLayers = paint.layers.map(layer => extractLayers(layer));

            // Now append the (rewritten) child layers contiguously.
            const firstIndex = layerPaintBytes.length;
            for (const pl of processedLayers) {
                layerPaintBytes.push(serializePaintNode(pl));
            }

            return {
                format: PaintFormat.ColrLayers,
                numLayers: paint.layers.length,
                firstLayerIndex: firstIndex,
            };
        }

        // For every other format, shallow-clone and recurse into child paints.
        const clone = Object.assign({}, paint);
        if (clone.paint)    clone.paint    = extractLayers(clone.paint);
        if (clone.source)   clone.source   = extractLayers(clone.source);
        if (clone.backdrop) clone.backdrop = extractLayers(clone.backdrop);
        return clone;
    }

    for (const record of baseGlyphPaintRecords) {
        const processed = extractLayers(record.paint);
        baseGlyphEntries.push({
            glyphID: record.glyphID,
            paintBytes: serializePaintNode(processed),
        });
    }

    return { baseGlyphEntries, layerPaintBytes };
}

// ── ItemVariationStore / DeltaSetIndexMap encoding (adapted from HVAR) ────────

/**
 * Encode a VariationRegionList to bytes
 * @param {Array} regions - Array of regions with regionAxes
 * @returns {number[]}
 */
function encodeVariationRegionList(regions) {
    const bytes = [];
    if (!regions || regions.length === 0) {
        writeUint16(bytes, 0); // axisCount
        writeUint16(bytes, 0); // regionCount
        return bytes;
    }
    const axisCount = regions[0].regionAxes ? regions[0].regionAxes.length : 0;
    writeUint16(bytes, axisCount);
    writeUint16(bytes, regions.length);
    for (const region of regions) {
        for (const axis of region.regionAxes) {
            writeF2Dot14(bytes, axis.startCoord);
            writeF2Dot14(bytes, axis.peakCoord);
            writeF2Dot14(bytes, axis.endCoord);
        }
    }
    return bytes;
}

/**
 * Encode an ItemVariationData subtable to bytes
 * @param {object} subtable
 * @returns {number[]}
 */
function encodeItemVariationSubtable(subtable) {
    const bytes = [];
    const itemCount = subtable.deltaSets ? subtable.deltaSets.length : 0;
    const regionIndexCount = subtable.regionIndexes ? subtable.regionIndexes.length : 0;

    // Determine delta format by analyzing values
    let maxAbsDelta = 0;
    if (subtable.deltaSets) {
        for (const deltaSet of subtable.deltaSets) {
            for (const delta of deltaSet) {
                const a = Math.abs(delta);
                if (a > maxAbsDelta) maxAbsDelta = a;
            }
        }
    }

    let wordDeltaCount = 0;
    let needsLongWords = false;
    if (maxAbsDelta > 127) {
        wordDeltaCount = regionIndexCount;
    }
    if (maxAbsDelta > 32767) {
        needsLongWords = true;
        wordDeltaCount |= 0x8000; // LONG_WORDS flag
    }

    writeUint16(bytes, itemCount);
    writeUint16(bytes, wordDeltaCount);
    writeUint16(bytes, regionIndexCount);
    for (const idx of subtable.regionIndexes || []) {
        writeUint16(bytes, idx);
    }

    // Delta sets
    if (subtable.deltaSets) {
        const wordCount = wordDeltaCount & 0x7FFF;
        for (const deltaSet of subtable.deltaSets) {
            for (let j = 0; j < regionIndexCount; j++) {
                const delta = deltaSet[j] || 0;
                if (j < wordCount) {
                    if (needsLongWords) {
                        // int32
                        const v = delta < 0 ? delta + 0x100000000 : delta;
                        writeUint32(bytes, v);
                    } else {
                        writeInt16(bytes, delta);
                    }
                } else {
                    if (needsLongWords) {
                        writeInt16(bytes, delta);
                    } else {
                        // int8
                        bytes.push(delta & 0xFF);
                    }
                }
            }
        }
    }

    return bytes;
}

/**
 * Encode an ItemVariationStore to bytes
 * @param {object} store
 * @returns {number[]}
 */
function encodeItemVariationStore(store) {
    if (!store) return [];

    const bytes = [];

    // Format (USHORT)
    writeUint16(bytes, store.format || 1);

    // Header: format(2) + regionListOffset(4) + subtableCount(2) = 8
    const headerSize = 8;
    const subtableCount = (store.itemVariationSubtables || []).length;
    const subtableOffsetArraySize = subtableCount * 4;

    // Encode region list and subtables
    const regionListBytes = encodeVariationRegionList(store.variationRegions);
    const subtableBytesArr = [];
    for (const subtable of store.itemVariationSubtables || []) {
        subtableBytesArr.push(encodeItemVariationSubtable(subtable));
    }

    // Calculate offsets (relative to start of IVS)
    const regionListOffset = headerSize + subtableOffsetArraySize;
    let currentOffset = regionListOffset + regionListBytes.length;
    const subtableOffsets = [];
    for (const sb of subtableBytesArr) {
        subtableOffsets.push(currentOffset);
        currentOffset += sb.length;
    }

    // Write header
    writeUint32(bytes, regionListOffset);
    writeUint16(bytes, subtableCount);

    // Subtable offsets
    for (const off of subtableOffsets) {
        writeUint32(bytes, off);
    }

    // Region list + subtables — use concat to avoid stack overflow from
    // spread operator on large byte arrays (IVS data can exceed 100k bytes).
    let result = bytes.concat(regionListBytes);
    for (const sb of subtableBytesArr) {
        result = result.concat(sb);
    }
    return result;
}

/**
 * Encode a DeltaSetIndexMap to bytes
 * @param {object} indexMap - { map: [{ outerIndex, innerIndex }, ...] }
 * @returns {number[]}
 */
function encodeDeltaSetIndexMap(indexMap) {
    if (!indexMap || !indexMap.map || indexMap.map.length === 0) return [];

    const bytes = [];
    const map = indexMap.map;
    const mapCount = map.length;

    // Determine required entry format
    let maxOuterIndex = 0;
    let maxInnerIndex = 0;
    for (const entry of map) {
        if (entry.outerIndex > maxOuterIndex) maxOuterIndex = entry.outerIndex;
        if (entry.innerIndex > maxInnerIndex) maxInnerIndex = entry.innerIndex;
    }

    let innerBitCount = 0;
    let temp = maxInnerIndex;
    while (temp > 0) { innerBitCount++; temp >>= 1; }
    if (innerBitCount === 0) innerBitCount = 1;

    let outerBitCount = 0;
    temp = maxOuterIndex;
    while (temp > 0) { outerBitCount++; temp >>= 1; }

    const totalBits = innerBitCount + outerBitCount;
    let entrySize;
    if (totalBits <= 8) entrySize = 1;
    else if (totalBits <= 16) entrySize = 2;
    else if (totalBits <= 24) entrySize = 3;
    else entrySize = 4;

    // Format: 0 for short map count, 1 for long
    const format = mapCount > 65535 ? 1 : 0;
    bytes.push(format);

    // Entry format: (entrySize - 1) << 4 | (innerBitCount - 1)
    bytes.push(((entrySize - 1) << 4) | (innerBitCount - 1));

    // Map count
    if (format === 0) {
        writeUint16(bytes, mapCount);
    } else {
        writeUint32(bytes, mapCount);
    }

    // Map entries
    const innerMask = (1 << innerBitCount) - 1;
    for (const entry of map) {
        const value = (entry.outerIndex << innerBitCount) | (entry.innerIndex & innerMask);
        if (entrySize === 1) {
            bytes.push(value & 0xFF);
        } else if (entrySize === 2) {
            writeUint16(bytes, value);
        } else if (entrySize === 3) {
            bytes.push((value >> 16) & 0xFF);
            writeUint16(bytes, value & 0xFFFF);
        } else {
            writeUint32(bytes, value);
        }
    }

    return bytes;
}

// ── COLR table writer ──────────────────────────────────────────────────────────

function makeColrTable(colr) {
    const { version = 0, baseGlyphRecords = [], layerRecords = [] } = colr;

    if (version === 0) {
        // ── COLRv0 only ──
        const baseGlyphRecordsOffset = 14;
        const layerRecordsOffset = baseGlyphRecordsOffset + (baseGlyphRecords.length * 6);
        return new table.Table('COLR', [
            { name: 'version', type: 'USHORT', value: 0 },
            { name: 'numBaseGlyphRecords', type: 'USHORT', value: baseGlyphRecords.length },
            { name: 'baseGlyphRecordsOffset', type: 'ULONG', value: baseGlyphRecordsOffset },
            { name: 'layerRecordsOffset', type: 'ULONG', value: layerRecordsOffset },
            { name: 'numLayerRecords', type: 'USHORT', value: layerRecords.length },
            ...baseGlyphRecords.map((glyph, i) => [
                { name: 'glyphID_' + i, type: 'USHORT', value: glyph.glyphID },
                { name: 'firstLayerIndex_' + i, type: 'USHORT', value: glyph.firstLayerIndex },
                { name: 'numLayers_' + i, type: 'USHORT', value: glyph.numLayers },
            ]).flat(),
            ...layerRecords.map((layer, i) => [
                { name: 'LayerGlyphID_' + i, type: 'USHORT', value: layer.glyphID },
                { name: 'paletteIndex_' + i, type: 'USHORT', value: layer.paletteIndex },
            ]).flat(),
        ]);
    }

    // ── COLRv1 ──
    const baseGlyphPaintRecords = colr.baseGlyphPaintRecords || [];
    const { baseGlyphEntries, layerPaintBytes } = buildV1Tables(baseGlyphPaintRecords);

    // v0 header: version(2) + numBaseGlyphRecords(2) + baseGlyphRecordsOffset(4)
    //           + layerRecordsOffset(4) + numLayerRecords(2) = 14 bytes
    // v1 extension: 5 × Offset32 = 20 bytes
    // Total header: 34 bytes
    const headerSize = 34;
    
    // v0 data (may be empty for pure v1 fonts)
    const v0BaseGlyphsSize = baseGlyphRecords.length * 6;
    const v0LayerRecordsSize = layerRecords.length * 4;
    const v0DataStart = headerSize;
    const v0BaseGlyphRecordsOffset = baseGlyphRecords.length > 0 ? v0DataStart : 0;
    const v0LayerRecordsOffset = layerRecords.length > 0 ? v0DataStart + v0BaseGlyphsSize : 0;
    
    // LayerList starts after v0 data
    const layerListStart = v0DataStart + v0BaseGlyphsSize + v0LayerRecordsSize;
    
    // Build LayerList binary: count(4) + offsets(4 × numPaints) + paint bytes
    const layerOffsetArraySize = 4 + layerPaintBytes.length * 4;
    
    // Write count
    const numLayerPaints = layerPaintBytes.length;
    
    // Calculate paint offsets (relative to LayerList start)
    const layerPaintOffsets = [];
    let currentPaintOffset = layerOffsetArraySize;
    for (const paintBytes of layerPaintBytes) {
        layerPaintOffsets.push(currentPaintOffset);
        currentPaintOffset += paintBytes.length;
    }
    
    // Total LayerList size
    const layerListSize = numLayerPaints > 0 ? currentPaintOffset : 0;
    
    // BaseGlyphList starts after LayerList
    const baseGlyphListStart = layerListStart + layerListSize;
    
    // Build BaseGlyphList binary: count(4) + records(6 × N) + paint bytes
    const numBaseGlyphPaintRecords = baseGlyphEntries.length;
    const baseGlyphRecordArraySize = 4 + numBaseGlyphPaintRecords * 6;
    
    // Calculate base glyph paint offsets (relative to BaseGlyphList start)
    const baseGlyphPaintOffsets = [];
    let currentBGPaintOffset = baseGlyphRecordArraySize;
    for (const entry of baseGlyphEntries) {
        baseGlyphPaintOffsets.push(currentBGPaintOffset);
        currentBGPaintOffset += entry.paintBytes.length;
    }
    
    const baseGlyphListSize = numBaseGlyphPaintRecords > 0 ? currentBGPaintOffset : 0;

    // ── ClipList ──
    // Build from colr.clipList if present: { format, clips: [{ startGlyphID, endGlyphID, clipBox }] }
    const clipListStart = baseGlyphListStart + baseGlyphListSize;
    let clipListBytes = null;
    if (colr.clipList && colr.clipList.clips && colr.clipList.clips.length > 0) {
        const clips = colr.clipList.clips;
        // Each clip entry: startGlyphID(2) + endGlyphID(2) + clipBoxOffset(3) = 7 bytes
        // ClipBox (format 1): format(1) + xMin(2) + yMin(2) + xMax(2) + yMax(2) = 9 bytes
        // ClipBox (format 2): + varIndexBase(4) = 13 bytes
        const headerBytes = 1 + 4; // format(1) + numClips(4)
        const entryBytes = clips.length * 7;
        const clipBoxDataStart = headerBytes + entryBytes;

        // Pre-compute clipBox sizes and deduplicate identical boxes
        const clipBoxMap = new Map(); // JSON key → offset within clipBox data region
        const clipBoxEntries = []; // { offset, bytes }
        let clipBoxOffset = 0;
        for (const clip of clips) {
            const box = clip.clipBox;
            const fmt = box.format || 1;
            const key = `${fmt},${box.xMin},${box.yMin},${box.xMax},${box.yMax}${fmt === 2 ? ',' + (box.varIndexBase || 0) : ''}`;
            if (!clipBoxMap.has(key)) {
                clipBoxMap.set(key, clipBoxOffset);
                const boxSize = fmt === 2 ? 13 : 9;
                clipBoxEntries.push({ fmt, box, offset: clipBoxOffset });
                clipBoxOffset += boxSize;
            }
        }
        const totalClipListSize = clipBoxDataStart + clipBoxOffset;
        const clipBuf = new Uint8Array(totalClipListSize);
        const clipView = new DataView(clipBuf.buffer);
        let cp = 0;

        // Header
        clipView.setUint8(cp, colr.clipList.format || 1); cp += 1;
        clipView.setUint32(cp, clips.length); cp += 4;

        // Entries
        for (const clip of clips) {
            const box = clip.clipBox;
            const fmt = box.format || 1;
            const key = `${fmt},${box.xMin},${box.yMin},${box.xMax},${box.yMax}${fmt === 2 ? ',' + (box.varIndexBase || 0) : ''}`;
            const boxOff = clipBoxDataStart + clipBoxMap.get(key);
            clipView.setUint16(cp, clip.startGlyphID); cp += 2;
            clipView.setUint16(cp, clip.endGlyphID); cp += 2;
            // UInt24 offset
            clipView.setUint8(cp, (boxOff >> 16) & 0xFF); cp += 1;
            clipView.setUint8(cp, (boxOff >> 8) & 0xFF); cp += 1;
            clipView.setUint8(cp, boxOff & 0xFF); cp += 1;
        }

        // ClipBox data
        for (const { fmt, box } of clipBoxEntries) {
            clipView.setUint8(cp, fmt); cp += 1;
            clipView.setInt16(cp, box.xMin); cp += 2;
            clipView.setInt16(cp, box.yMin); cp += 2;
            clipView.setInt16(cp, box.xMax); cp += 2;
            clipView.setInt16(cp, box.yMax); cp += 2;
            if (fmt === 2) {
                clipView.setUint32(cp, box.varIndexBase || 0); cp += 4;
            }
        }

        clipListBytes = clipBuf;
    }
    const clipListSize = clipListBytes ? clipListBytes.length : 0;

    // ── Encode ItemVariationStore and DeltaSetIndexMap if present ──
    const varStoreBytes = colr.varStore ? encodeItemVariationStore(colr.varStore) : [];
    const varIndexMapBytes = colr.varIndexMap ? encodeDeltaSetIndexMap(colr.varIndexMap) : [];

    // VarIndexMap follows ClipList, then ItemVariationStore follows VarIndexMap
    const varIndexMapStart = clipListStart + clipListSize;
    const varStoreStart = varIndexMapStart + varIndexMapBytes.length;

    // Now build the full binary
    const totalSize = headerSize + v0BaseGlyphsSize + v0LayerRecordsSize + layerListSize + baseGlyphListSize + clipListSize + varIndexMapBytes.length + varStoreBytes.length;
    const buf = new ArrayBuffer(totalSize);
    const view = new DataView(buf);
    let pos = 0;

    // ── Header ──
    view.setUint16(pos, 1); pos += 2; // version
    view.setUint16(pos, baseGlyphRecords.length); pos += 2; // numBaseGlyphRecords
    view.setUint32(pos, v0BaseGlyphRecordsOffset); pos += 4;
    view.setUint32(pos, v0LayerRecordsOffset); pos += 4;
    view.setUint16(pos, layerRecords.length); pos += 2; // numLayerRecords
    // v1 offsets
    view.setUint32(pos, numBaseGlyphPaintRecords > 0 ? baseGlyphListStart : 0); pos += 4;
    view.setUint32(pos, numLayerPaints > 0 ? layerListStart : 0); pos += 4;
    view.setUint32(pos, clipListBytes ? clipListStart : 0); pos += 4; // clipListOffset
    view.setUint32(pos, varIndexMapBytes.length > 0 ? varIndexMapStart : 0); pos += 4; // varIndexMapOffset
    view.setUint32(pos, varStoreBytes.length > 0 ? varStoreStart : 0); pos += 4; // itemVariationStoreOffset

    // ── v0 BaseGlyphRecords ──
    for (const rec of baseGlyphRecords) {
        view.setUint16(pos, rec.glyphID); pos += 2;
        view.setUint16(pos, rec.firstLayerIndex); pos += 2;
        view.setUint16(pos, rec.numLayers); pos += 2;
    }

    // ── v0 LayerRecords ──
    for (const rec of layerRecords) {
        view.setUint16(pos, rec.glyphID); pos += 2;
        view.setUint16(pos, rec.paletteIndex); pos += 2;
    }

    // ── LayerList ──
    if (numLayerPaints > 0) {
        view.setUint32(pos, numLayerPaints); pos += 4;
        for (const off of layerPaintOffsets) {
            view.setUint32(pos, off); pos += 4;
        }
        for (const paintBytes of layerPaintBytes) {
            for (const b of paintBytes) {
                view.setUint8(pos, b); pos++;
            }
        }
    }

    // ── BaseGlyphList ──
    if (numBaseGlyphPaintRecords > 0) {
        view.setUint32(pos, numBaseGlyphPaintRecords); pos += 4;
        for (let i = 0; i < baseGlyphEntries.length; i++) {
            view.setUint16(pos, baseGlyphEntries[i].glyphID); pos += 2;
            view.setUint32(pos, baseGlyphPaintOffsets[i]); pos += 4;
        }
        for (const entry of baseGlyphEntries) {
            for (const b of entry.paintBytes) {
                view.setUint8(pos, b); pos++;
            }
        }
    }

    // ── ClipList data ──
    if (clipListBytes) {
        for (const b of clipListBytes) {
            view.setUint8(pos, b); pos++;
        }
    }

    // ── DeltaSetIndexMap data ──
    for (const b of varIndexMapBytes) {
        view.setUint8(pos, b); pos++;
    }

    // ── ItemVariationStore data ──
    for (const b of varStoreBytes) {
        view.setUint8(pos, b); pos++;
    }

    // Wrap in a table.Table with LITERAL type
    return new table.Table('COLR', [
        { name: 'colrV1Data', type: 'LITERAL', value: new Uint8Array(buf) },
    ]);
}

/**
 * Compute the ClipBox for a specific glyph at given normalized variation coordinates.
 * Applies ItemVariationStore deltas if the ClipBox has a varIndexBase (format 2).
 *
 * @param {Record<string, unknown>} colr - Parsed COLR table (from parseColrTable)
 * @param {number} glyphID - Glyph index
 * @param {Record<string, unknown>} fvar - Parsed fvar table (font.tables.fvar)
 * @param {Record<string, number>} coords - Variation coordinates (e.g. {wght: 700})
 * @returns {{ xMin: number, yMin: number, xMax: number, yMax: number } | null}
 */
function getClipBoxAtCoords(colr, glyphID, fvar, coords) {
    const clipList = /** @type {Record<string, unknown>} */ (colr.clipList);
    if (!clipList || !clipList.clips) return null;

    // Find the clip entry for this glyph
    const clip = /** @type {Array<{startGlyphID: number, endGlyphID: number, clipBox: {format: number, xMin: number, yMin: number, xMax: number, yMax: number, varIndexBase?: number}}>} */ (clipList.clips).find(
        c => glyphID >= c.startGlyphID && glyphID <= c.endGlyphID
    );
    if (!clip || !clip.clipBox) return null;

    const box = clip.clipBox;
    const result = { xMin: box.xMin, yMin: box.yMin, xMax: box.xMax, yMax: box.yMax };

    // If no variation data, return static box
    if (box.format !== 2 || box.varIndexBase === undefined) return result;
    if (!colr.varStore || !fvar) return result;

    // Compute normalized coordinates
    const normalizedCoords = [];
    for (const axis of /** @type {Array<{tag: string, defaultValue: number, minValue: number, maxValue: number}>} */ (fvar.axes)) {
        const val = coords[axis.tag] ?? axis.defaultValue;
        let norm;
        if (val === axis.defaultValue) {
            norm = 0;
        } else if (val < axis.defaultValue) {
            norm = -(axis.defaultValue - val) / (axis.defaultValue - axis.minValue || 1);
        } else {
            norm = (val - axis.defaultValue) / (axis.maxValue - axis.defaultValue || 1);
        }
        normalizedCoords.push(Math.max(-1, Math.min(1, norm)));
    }

    // Apply IVS deltas for each ClipBox field (xMin, yMin, xMax, yMax)
    const fields = ['xMin', 'yMin', 'xMax', 'yMax'];
    for (let i = 0; i < fields.length; i++) {
        let varIdx = box.varIndexBase + i;
        // Apply VarIndexMap if present
        let outerIndex, innerIndex;
        const varIndexMap = /** @type {Record<string, unknown>} */ (colr.varIndexMap);
        const varIndexMapArr = varIndexMap && /** @type {Array<{outerIndex: number, innerIndex: number}>} */ (varIndexMap.map);
        if (varIndexMapArr && varIdx < varIndexMapArr.length) {
            const entry = varIndexMapArr[varIdx];
            outerIndex = entry.outerIndex;
            innerIndex = entry.innerIndex;
        } else {
            // No map — direct index: outer=0, inner=varIdx
            outerIndex = 0;
            innerIndex = varIdx;
        }
        // 0xFFFF / -1 in outerIndex means no variation for this field
        if (outerIndex < 0 || outerIndex === 0xFFFF || innerIndex === 0xFFFF) continue;

        const varStore = /** @type {Record<string, unknown>} */ (colr.varStore);
        const subtable = /** @type {Array<Record<string, unknown>>} */ (varStore.itemVariationSubtables)[outerIndex];
        if (!subtable) continue;
        const deltaSet = /** @type {Array<number[]>} */ (subtable.deltaSets)[innerIndex];
        if (!deltaSet) continue;

        // Compute scalar for each region and sum deltas
        let delta = 0;
        for (let r = 0; r < /** @type {number[]} */ (subtable.regionIndexes).length; r++) {
            const regionIdx = /** @type {number[]} */ (subtable.regionIndexes)[r];
            const region = /** @type {Array<Record<string, unknown>>} */ (varStore.variationRegions)[regionIdx];
            if (!region) continue;

            let scalar = 1;
            const regionAxes = /** @type {Array<{peakCoord: number, startCoord: number, endCoord: number}>} */ (region.regionAxes);
            for (let a = 0; a < regionAxes.length && a < normalizedCoords.length; a++) {
                const ra = regionAxes[a];
                const coord = normalizedCoords[a];
                if (coord === 0 || ra.peakCoord === 0) {
                    if (ra.peakCoord !== 0) scalar = 0;
                    continue;
                }
                if (coord < ra.startCoord || coord > ra.endCoord) { scalar = 0; break; }
                if (coord === ra.peakCoord) continue; // scalar stays 1
                if (coord < ra.peakCoord) {
                    scalar *= (coord - ra.startCoord) / (ra.peakCoord - ra.startCoord);
                } else {
                    scalar *= (ra.endCoord - coord) / (ra.endCoord - ra.peakCoord);
                }
            }
            delta += deltaSet[r] * scalar;
        }

        result[fields[i]] += Math.round(delta);
    }

    return result;
}

export { PaintFormat, CompositeMode };
export default { parse: parseColrTable, make: makeColrTable, getClipBoxAtCoords, PaintFormat, CompositeMode };
