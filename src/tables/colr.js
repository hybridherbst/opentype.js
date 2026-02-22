// The `COLR` table adds support for multi-colored glyphs
// https://learn.microsoft.com/en-us/typography/opentype/spec/colr

import { Parser } from '../parse.js';
import check from '../check.js';
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
 * @returns {{ extend: number, stops: Array }}
 */
function parseColorLine(p, isVariable) {
    const extend = p.parseUShort(); // 0=pad, 1=repeat, 2=reflect
    const numStops = p.parseUShort();
    const stops = [];
    for (let i = 0; i < numStops; i++) {
        const stop = {
            stopOffset: p.parseF2Dot14(),
            paletteIndex: p.parseUShort(),
            alpha: p.parseF2Dot14(),
        };
        if (isVariable) {
            stop.varIndexBase = p.parseULong();
        }
        stops.push(stop);
    }
    return { extend, stops };
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
 * @param {Object} layerList - parsed layer list (array of paint offsets) for PaintColrLayers
 * @param {number} colrTableStart - absolute offset of the COLR table start
 * @param {Set} visited - cycle detection
 * @returns {Object} parsed paint node
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
            // Parse the ColorLine at the resolved offset
            const clParser = new Parser(data, offset + colorLineOffset);
            const colorLine = parseColorLine(clParser, isVar);
            return { format, colorLine, x0, y0, x1, y1, x2, y2 };
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
            const clParser = new Parser(data, offset + colorLineOffset);
            const colorLine = parseColorLine(clParser, isVar);
            return { format, colorLine, x0, y0, radius0, x1, y1, radius1 };
        }

        case PaintFormat.SweepGradient:
        case PaintFormat.VarSweepGradient: {
            const isVar = format === PaintFormat.VarSweepGradient;
            const colorLineOffset = p.parseUInt24();
            const centerX = p.parseShort();
            const centerY = p.parseShort();
            const startAngle = p.parseF2Dot14();
            const endAngle = p.parseF2Dot14();
            const clParser = new Parser(data, offset + colorLineOffset);
            const colorLine = parseColorLine(clParser, isVar);
            return { format, colorLine, centerX, centerY, startAngle, endAngle };
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
 * @returns {Array<{ startGlyphID, endGlyphID, clipBox }>}
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
 * @param {{ extend, stops }} colorLine
 * @returns {number[]} byte array
 */
function encodeColorLine(colorLine) {
    const bytes = [];
    // extend: USHORT
    bytes.push((colorLine.extend >> 8) & 0xFF, colorLine.extend & 0xFF);
    // numStops: USHORT
    const numStops = colorLine.stops.length;
    bytes.push((numStops >> 8) & 0xFF, numStops & 0xFF);
    for (const stop of colorLine.stops) {
        // stopOffset: F2Dot14 (int16)
        const stopVal = Math.round(stop.stopOffset * 16384);
        bytes.push((stopVal >> 8) & 0xFF, stopVal & 0xFF);
        // paletteIndex: USHORT
        bytes.push((stop.paletteIndex >> 8) & 0xFF, stop.paletteIndex & 0xFF);
        // alpha: F2Dot14 (int16)
        const alphaVal = Math.round(stop.alpha * 16384);
        bytes.push((alphaVal >> 8) & 0xFF, alphaVal & 0xFF);
    }
    return bytes;
}

/**
 * Serialize an Affine2x3 matrix to bytes (6 × Fixed = 24 bytes)
 * @param {{ xx, yx, xy, yy, dx, dy }} m
 * @returns {number[]}
 */
function encodeAffine2x3(m) {
    const bytes = [];
    for (const key of ['xx', 'yx', 'xy', 'yy', 'dx', 'dy']) {
        const val = m[key];
        const intPart = Math.floor(val);
        const fracPart = Math.round((val - intPart) * 65536);
        const fixed = ((intPart & 0xFFFF) << 16) | (fracPart & 0xFFFF);
        bytes.push((fixed >> 24) & 0xFF, (fixed >> 16) & 0xFF, (fixed >> 8) & 0xFF, fixed & 0xFF);
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
    const subTables = []; // { bytes, relativeTo: 'paint' | 'self' }
    
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
            // ColorLine offset placeholder (3 bytes) — will be fixed up
            const colorLineBytes = encodeColorLine(node.colorLine);
            const colorLineOffsetPos = bytes.length;
            writeUint24(bytes, 0); // placeholder
            writeInt16(bytes, node.x0);
            writeInt16(bytes, node.y0);
            writeInt16(bytes, node.x1);
            writeInt16(bytes, node.y1);
            writeInt16(bytes, node.x2);
            writeInt16(bytes, node.y2);
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
            const colorLineBytes = encodeColorLine(node.colorLine);
            const colorLineOffsetPos = bytes.length;
            writeUint24(bytes, 0);
            writeInt16(bytes, node.x0);
            writeInt16(bytes, node.y0);
            writeUint16(bytes, node.radius0);
            writeInt16(bytes, node.x1);
            writeInt16(bytes, node.y1);
            writeUint16(bytes, node.radius1);
            const colorLineOffset = bytes.length;
            bytes[colorLineOffsetPos] = (colorLineOffset >> 16) & 0xFF;
            bytes[colorLineOffsetPos + 1] = (colorLineOffset >> 8) & 0xFF;
            bytes[colorLineOffsetPos + 2] = colorLineOffset & 0xFF;
            bytes.push(...colorLineBytes);
            break;
        }

        case PaintFormat.SweepGradient:
        case PaintFormat.VarSweepGradient: {
            const colorLineBytes = encodeColorLine(node.colorLine);
            const colorLineOffsetPos = bytes.length;
            writeUint24(bytes, 0);
            writeInt16(bytes, node.centerX);
            writeInt16(bytes, node.centerY);
            writeF2Dot14(bytes, node.startAngle);
            writeF2Dot14(bytes, node.endAngle);
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
            const transformBytes = encodeAffine2x3(node.transform);
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
 */
function buildV1Tables(baseGlyphPaintRecords) {
    // Collect all unique layer paints from PaintColrLayers nodes
    const layerPaintBytes = []; // array of byte arrays, one per layer paint
    
    // For each base glyph, serialize its root paint
    // If the root paint is PaintColrLayers, we need to extract its layers
    // into the shared LayerList and rewrite the firstLayerIndex
    const baseGlyphEntries = []; // { glyphID, paintBytes }
    
    for (const record of baseGlyphPaintRecords) {
        const paint = record.paint;
        if (paint.format === PaintFormat.ColrLayers) {
            // Extract layers into LayerList
            const firstIndex = layerPaintBytes.length;
            for (const layer of paint.layers) {
                layerPaintBytes.push(serializePaintNode(layer));
            }
            // Rewrite the PaintColrLayers with updated firstLayerIndex
            const rewritten = {
                format: PaintFormat.ColrLayers,
                numLayers: paint.layers.length,
                firstLayerIndex: firstIndex,
            };
            baseGlyphEntries.push({
                glyphID: record.glyphID,
                paintBytes: serializePaintNode(rewritten),
            });
        } else {
            // Non-ColrLayers root: serialize directly
            baseGlyphEntries.push({
                glyphID: record.glyphID,
                paintBytes: serializePaintNode(paint),
            });
        }
    }
    
    return { baseGlyphEntries, layerPaintBytes };
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
    const layerListHeader = []; // count + offset array
    const layerListPaints = []; // concatenated paint bytes
    const layerOffsetArraySize = 4 + layerPaintBytes.length * 4;
    let layerPaintDataOffset = layerOffsetArraySize;
    
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

    // Now build the full binary
    const totalSize = headerSize + v0BaseGlyphsSize + v0LayerRecordsSize + layerListSize + baseGlyphListSize;
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
    view.setUint32(pos, 0); pos += 4; // clipListOffset (TODO)
    view.setUint32(pos, 0); pos += 4; // varIndexMapOffset (not supported)
    view.setUint32(pos, 0); pos += 4; // itemVariationStoreOffset (not supported)

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

    // Wrap in a table.Table with LITERAL type
    return new table.Table('COLR', [
        { name: 'colrV1Data', type: 'LITERAL', value: new Uint8Array(buf) },
    ]);
}

export { PaintFormat, CompositeMode };
export default { parse: parseColrTable, make: makeColrTable, PaintFormat, CompositeMode };
