// The `cmap` table stores the mappings from characters to glyphs.
// https://www.microsoft.com/typography/OTSPEC/cmap.htm

import check from '../check.js';
import parse from '../parse.js';
import table from '../table.js';
import { eightBitMacEncodings } from '../types.js';
import { getEncoding } from '../tables/name.js';

/**
 * @typedef {object} CmapFormat4
 * Format 4 cmap subtable (segment mapping to delta values, BMP only)
 * @property {number} length - Length in bytes of the subtable
 * @property {number} language - Language code (0 for Unicode)
 * @property {number} segCount - Number of segments
 * @property {Record<number, number>} glyphIndexMap - Map of Unicode code point to glyph index
 */

/**
 * @typedef {object} CmapFormat12
 * Format 12 cmap subtable (segmented coverage, full Unicode range)
 * @property {number} length - Length in bytes of the subtable
 * @property {number} language - Language code (0 for Unicode)
 * @property {number} groupCount - Number of sequential map groups
 * @property {Record<number, number>} glyphIndexMap - Map of Unicode code point to glyph index
 */

/**
 * @typedef {object} CmapTable
 * Parsed representation of the 'cmap' table, containing the selected subtable.
 * @property {number} version - Table version (always 0)
 * @property {number} numTables - Number of subtables in the cmap
 * @property {number} format - Format of the selected subtable (0, 4, 12, or 13)
 * @property {number} [length] - Length in bytes of the selected subtable
 * @property {number} [language] - Language code of the selected subtable
 * @property {number} [segCount] - Segment count (format 4 only)
 * @property {number} [groupCount] - Group count (format 12/13 only)
 * @property {Record<number, number>} [glyphIndexMap] - Map of Unicode code point to glyph index
 * @property {Record<number, {varSelector: number, defaultUVS?: {ranges: Array<{startUnicodeValue: number, additionalCount: number}>}, nonDefaultUVS?: {uvsMappings: Record<number, {unicodeValue: number, glyphID: number}>}}>} [varSelectorList] - Format 14 variation selector records
 */

function parseCmapTableFormat0(cmap, p, platformID, encodingID) {
    // Length in bytes of the index map
    cmap.length = p.parseUShort();
    // see https://developer.apple.com/fonts/TrueType-Reference-Manual/RM06/Chap6name.html
    // section "Macintosh Language Codes"
    cmap.language = p.parseUShort() - 1;

    const indexMap = p.parseByteList(cmap.length);
    const glyphIndexMap = Object.assign({}, indexMap);
    const encoding = getEncoding(platformID, encodingID, cmap.language);
    const decodingTable = eightBitMacEncodings[encoding];
    for (let i = 0; i < decodingTable.length; i++) {
        glyphIndexMap[decodingTable.charCodeAt(i)] = indexMap[0x80 + i];
    }
    cmap.glyphIndexMap = glyphIndexMap;
}

function parseCmapTableFormat12or13(cmap, p, format) {
    //Skip reserved.
    p.parseUShort();

    // Length in bytes of the sub-tables.
    cmap.length = p.parseULong();
    cmap.language = p.parseULong();

    let groupCount;
    cmap.groupCount = groupCount = p.parseULong();
    cmap.glyphIndexMap = {};

    for (let i = 0; i < groupCount; i += 1) {
        const startCharCode = p.parseULong();
        const endCharCode = p.parseULong();
        let startGlyphId = p.parseULong();

        for (let c = startCharCode; c <= endCharCode; c += 1) {
            cmap.glyphIndexMap[c] = startGlyphId;
            if (format === 12) {
                startGlyphId++;
            }
        }
    }
}

function parseCmapTableFormat4(cmap, p, data, start, offset) {
    // Length in bytes of the sub-tables.
    cmap.length = p.parseUShort();
    cmap.language = p.parseUShort();

    // segCount is stored x 2.
    let segCount;
    cmap.segCount = segCount = p.parseUShort() >> 1;

    // Skip searchRange, entrySelector, rangeShift.
    p.skip('uShort', 3);

    // The "unrolled" mapping from character codes to glyph indices.
    cmap.glyphIndexMap = {};
    const endCountParser = new parse.Parser(data, start + offset + 14);
    const startCountParser = new parse.Parser(data, start + offset + 16 + segCount * 2);
    const idDeltaParser = new parse.Parser(data, start + offset + 16 + segCount * 4);
    const idRangeOffsetParser = new parse.Parser(data, start + offset + 16 + segCount * 6);
    let glyphIndexOffset = start + offset + 16 + segCount * 8;
    for (let i = 0; i < segCount - 1; i += 1) {
        let glyphIndex;
        const endCount = endCountParser.parseUShort();
        const startCount = startCountParser.parseUShort();
        const idDelta = idDeltaParser.parseShort();
        const idRangeOffset = idRangeOffsetParser.parseUShort();
        for (let c = startCount; c <= endCount; c += 1) {
            if (idRangeOffset !== 0) {
                // The idRangeOffset is relative to the current position in the idRangeOffset array.
                // Take the current offset in the idRangeOffset array.
                glyphIndexOffset = (idRangeOffsetParser.offset + idRangeOffsetParser.relativeOffset - 2);

                // Add the value of the idRangeOffset, which will move us into the glyphIndex array.
                glyphIndexOffset += idRangeOffset;

                // Then add the character index of the current segment, multiplied by 2 for USHORTs.
                glyphIndexOffset += (c - startCount) * 2;
                glyphIndex = parse.getUShort(data, glyphIndexOffset);
                if (glyphIndex !== 0) {
                    glyphIndex = (glyphIndex + idDelta) & 0xFFFF;
                }
            } else {
                glyphIndex = (c + idDelta) & 0xFFFF;
            }

            cmap.glyphIndexMap[c] = glyphIndex;
        }
    }
}

function parseCmapTableFormat14(cmap, p) {
    const varSelectorList = {};

    p.skip('uLong'); // skip length

    const numVarSelectorRecords = p.parseULong();

    for(let i = 0; i < numVarSelectorRecords; i += 1) {
        const varSelector = p.parseUInt24();
        const varSelectorRecord = {
            varSelector
        };

        const defaultUVSOffset = p.parseOffset32();
        const nonDefaultUVSOffset = p.parseOffset32();
        
        const currentOffset = p.relativeOffset;

        if ( defaultUVSOffset ) {
            p.relativeOffset = defaultUVSOffset;
            varSelectorRecord.defaultUVS = p.parseStruct({
                ranges: function() {
                    return p.parseRecordList32({
                        startUnicodeValue: p.parseUInt24,
                        additionalCount: p.parseByte
                    });
                }
            });
        }

        if ( nonDefaultUVSOffset ) {
            p.relativeOffset = nonDefaultUVSOffset;
            varSelectorRecord.nonDefaultUVS = p.parseStruct({
                uvsMappings: function() {
                    const map = {};
                    const list = p.parseRecordList32({
                        unicodeValue: p.parseUInt24,
                        glyphID: p.parseUShort
                    });
                    
                    for(let i = 0; i < list.length; i += 1) {
                        map[list[i].unicodeValue] = list[i];
                    }

                    return map;
                }
            });
        }

        varSelectorList[varSelector] = varSelectorRecord;

        p.relativeOffset = currentOffset;
    }

    cmap.varSelectorList = varSelectorList;
}

function getSupportedCmapSubtableScore(platformId, encodingId, format) {
    if (format === 14) return -1;

    const isUnicodePlatform = platformId === 0 && [0, 1, 2, 3, 4, 6].includes(encodingId);
    const isWindowsUnicode = platformId === 3 && [0, 1, 10].includes(encodingId);
    const isLegacyMacRoman = platformId === 1 && encodingId === 0;
    if (!isUnicodePlatform && !isWindowsUnicode && !isLegacyMacRoman) return -1;

    let formatScore = -1;
    if (format === 13) {
        formatScore = 500;
    } else if (format === 12) {
        formatScore = 450;
    } else if (format === 4) {
        formatScore = 300;
    } else if (format === 0 && isLegacyMacRoman) {
        formatScore = 100;
    } else {
        return -1;
    }

    const platformScore = isUnicodePlatform ? 30 : isWindowsUnicode ? 20 : 10;
    const encodingScore = platformId === 3 && encodingId === 10 ? 6 :
        platformId === 0 && encodingId === 6 ? 5 :
        platformId === 0 && encodingId === 4 ? 4 :
        platformId === 3 && encodingId === 1 ? 3 :
        platformId === 0 && encodingId === 3 ? 2 :
        1;
    return formatScore + platformScore + encodingScore;
}

// Parse the `cmap` table. This table stores the mappings from characters to glyphs.
// There are many available formats, but we only support the Windows format 4 and 12, and format 14 as a supplement if available.
// This function returns a `CmapEncoding` object or null if no supported format could be found.
function parseCmapTable(data, start) {
    const cmap = {};
    cmap.version = parse.getUShort(data, start);
    check.argument(cmap.version === 0, 'cmap table version should be 0.');

    // The cmap table can contain many sub-tables, each with their own format.
    // We're only interested in a "platform 0" (Unicode format) and "platform 3" (Windows format) table,
    // 
    cmap.numTables = parse.getUShort(data, start + 2);
    let format14Parser = null;
    let format14offset = -1;
    let offset = -1;
    let platformId = null;
    let encodingId = null;
    let bestScore = -1;
    for (let i = 0; i < cmap.numTables; i += 1) {
        const candidatePlatformId = parse.getUShort(data, start + 4 + (i * 8));
        const candidateEncodingId = parse.getUShort(data, start + 4 + (i * 8) + 2);
        const candidateOffset = parse.getULong(data, start + 4 + (i * 8) + 4);
        const candidateFormat = parse.getUShort(data, start + candidateOffset);

        if (candidatePlatformId === 0 && candidateEncodingId === 5) {
            format14offset = candidateOffset;
            format14Parser = new parse.Parser(data, start + format14offset);
            if (format14Parser.parseUShort() !== 14) {
                format14offset = -1;
                format14Parser = null;
            }
            continue;
        }

        const candidateScore = getSupportedCmapSubtableScore(candidatePlatformId, candidateEncodingId, candidateFormat);
        if (candidateScore > bestScore) {
            bestScore = candidateScore;
            offset = candidateOffset;
            platformId = candidatePlatformId;
            encodingId = candidateEncodingId;
        }
    }

    if (offset === -1) {
        // There is no cmap table in the font that we support.
        throw new Error('No valid cmap sub-tables found.');
    }

    const p = new parse.Parser(data, start + offset);
    cmap.format = p.parseUShort();

    if (cmap.format === 0) {
        parseCmapTableFormat0(cmap, p, platformId, encodingId);
    } else if (cmap.format === 12 || cmap.format === 13) {
        parseCmapTableFormat12or13(cmap, p, cmap.format);
    } else if (cmap.format === 4) {
        parseCmapTableFormat4(cmap, p, data, start, offset);
    } else {
        throw new Error(
            'Only format 0 (platformId 1, encodingId 0), 4, 12 and 14 cmap tables are supported ' +
            '(found format ' + cmap.format + ', platformId ' + platformId + ', encodingId ' + encodingId + ').'
        );
    }

    // format 14 is the only one that's not exclusive but can be used as a supplement.
    if (format14Parser) {
        parseCmapTableFormat14(cmap, format14Parser);
    }

    return cmap;
}

function collectUnicodeMappings(glyphs) {
    const byCodePoint = new Map();
    for (let i = 0; i < glyphs.length; i += 1) {
        const glyph = glyphs.get(i);
        const unicodes = Array.isArray(glyph.unicodes) ? glyph.unicodes : [];
        for (let j = 0; j < unicodes.length; j += 1) {
            const codePoint = unicodes[j];
            if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10FFFF) continue;
            if (!byCodePoint.has(codePoint)) {
                byCodePoint.set(codePoint, i);
            }
        }
    }
    return Array.from(byCodePoint, ([codePoint, glyphIndex]) => ({ codePoint, glyphIndex }))
        .sort((a, b) => a.codePoint - b.codePoint);
}

function buildFormat12Groups(mappings) {
    const groups = [];
    for (const mapping of mappings) {
        const previous = groups[groups.length - 1];
        const expectedGlyphIndex = previous ? previous.startGlyphID + (mapping.codePoint - previous.startCharCode) : -1;
        if (previous && mapping.codePoint === previous.endCharCode + 1 && mapping.glyphIndex === expectedGlyphIndex) {
            previous.endCharCode = mapping.codePoint;
        } else {
            groups.push({
                startCharCode: mapping.codePoint,
                endCharCode: mapping.codePoint,
                startGlyphID: mapping.glyphIndex
            });
        }
    }
    return groups;
}

function buildFormat13Groups(mappings) {
    const groups = [];
    for (const mapping of mappings) {
        const previous = groups[groups.length - 1];
        if (previous && mapping.codePoint === previous.endCharCode + 1 && mapping.glyphIndex === previous.glyphID) {
            previous.endCharCode = mapping.codePoint;
        } else {
            groups.push({
                startCharCode: mapping.codePoint,
                endCharCode: mapping.codePoint,
                glyphID: mapping.glyphIndex
            });
        }
    }
    return groups;
}

function buildFormat4Segments(mappings) {
    const segments = [];
    for (const mapping of mappings) {
        if (mapping.codePoint > 0xFFFF || mapping.codePoint === 0xFFFF) continue;
        const delta = (mapping.glyphIndex - mapping.codePoint) & 0xFFFF;
        const signedDelta = delta > 0x7FFF ? delta - 0x10000 : delta;
        const previous = segments[segments.length - 1];
        if (previous && mapping.codePoint === previous.end + 1 && signedDelta === previous.delta) {
            previous.end = mapping.codePoint;
        } else {
            segments.push({
                start: mapping.codePoint,
                end: mapping.codePoint,
                delta: signedDelta
            });
        }
    }
    segments.push({
        start: 0xFFFF,
        end: 0xFFFF,
        delta: 1
    });
    return segments;
}

function format4LengthForSegments(segments) {
    return 14 + segments.length * 8 + 2;
}

function makeFormat4Fields(segments) {
    const segCount = segments.length;
    const segCountX2 = segCount * 2;
    const searchRange = Math.pow(2, Math.floor(Math.log(segCount) / Math.log(2))) * 2;
    const entrySelector = Math.log(searchRange / 2) / Math.log(2);
    const fields = [
        {name: 'format', type: 'USHORT', value: 4},
        {name: 'cmap4Length', type: 'USHORT', value: format4LengthForSegments(segments)},
        {name: 'language', type: 'USHORT', value: 0},
        {name: 'segCountX2', type: 'USHORT', value: segCountX2},
        {name: 'searchRange', type: 'USHORT', value: searchRange},
        {name: 'entrySelector', type: 'USHORT', value: entrySelector},
        {name: 'rangeShift', type: 'USHORT', value: segCountX2 - searchRange}
    ];
    for (let i = 0; i < segments.length; i++) {
        fields.push({name: 'end_' + i, type: 'USHORT', value: segments[i].end});
    }
    fields.push({name: 'reservedPad', type: 'USHORT', value: 0});
    for (let i = 0; i < segments.length; i++) {
        fields.push({name: 'start_' + i, type: 'USHORT', value: segments[i].start});
    }
    for (let i = 0; i < segments.length; i++) {
        fields.push({name: 'idDelta_' + i, type: 'SHORT', value: segments[i].delta});
    }
    for (let i = 0; i < segments.length; i++) {
        fields.push({name: 'idRangeOffset_' + i, type: 'USHORT', value: 0});
    }
    return fields;
}

function makeFormat12or13Fields(format, groups) {
    const fields = [
        {name: 'cmap' + format + 'Format', type: 'USHORT', value: format},
        {name: 'cmap' + format + 'Reserved', type: 'USHORT', value: 0},
        {name: 'cmap' + format + 'Length', type: 'ULONG', value: 16 + groups.length * 12},
        {name: 'cmap' + format + 'Language', type: 'ULONG', value: 0},
        {name: 'cmap' + format + 'nGroups', type: 'ULONG', value: groups.length}
    ];
    for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        fields.push({name: 'cmap' + format + 'Start_' + i, type: 'ULONG', value: group.startCharCode});
        fields.push({name: 'cmap' + format + 'End_' + i, type: 'ULONG', value: group.endCharCode});
        fields.push({
            name: 'cmap' + format + 'Glyph_' + i,
            type: 'ULONG',
            value: format === 13 ? group.glyphID : group.startGlyphID
        });
    }
    return fields;
}

function appendFields(target, fields) {
    for (let i = 0; i < fields.length; i++) {
        target.push(fields[i]);
    }
}

// Make a Unicode cmap table. Format 4 is emitted for BMP compatibility when it
// fits; format 12 is used for sequential full-Unicode runs, and format 13 is
// used for many-to-one ranges such as LastResort-style fonts.
function makeCmapTable(glyphs) {
    const mappings = collectUnicodeMappings(glyphs);
    const hasNonBmpMapping = mappings.some((mapping) => mapping.codePoint > 0xFFFF);
    const hasFFFFMapping = mappings.some((mapping) => mapping.codePoint === 0xFFFF);
    const format12Groups = buildFormat12Groups(mappings);
    const format13Groups = buildFormat13Groups(mappings);
    const format12Length = 16 + format12Groups.length * 12;
    const format13Length = 16 + format13Groups.length * 12;
    const fullFormat = format13Length < format12Length ? 13 : 12;
    const fullGroups = fullFormat === 13 ? format13Groups : format12Groups;

    let format4Segments = buildFormat4Segments(mappings);
    let format4Length = format4LengthForSegments(format4Segments);
    const needsFullSubtable = hasNonBmpMapping || hasFFFFMapping || format4Length > 0xFFFF;
    if (needsFullSubtable && format4Length > 0xFFFF) {
        format4Segments = [{ start: 0xFFFF, end: 0xFFFF, delta: 1 }];
        format4Length = format4LengthForSegments(format4Segments);
    }

    const numTables = needsFullSubtable ? 2 : 1;
    const format4Offset = 4 + numTables * 8;
    const fullOffset = format4Offset + format4Length;
    const cmapTable = [
        {name: 'version', type: 'USHORT', value: 0},
        {name: 'numTables', type: 'USHORT', value: numTables},
        {name: 'platformID', type: 'USHORT', value: 3},
        {name: 'encodingID', type: 'USHORT', value: 1},
        {name: 'offset', type: 'ULONG', value: format4Offset}
    ];

    if (needsFullSubtable) {
        cmapTable.push(
            {name: 'fullPlatformID', type: 'USHORT', value: fullFormat === 13 ? 0 : 3},
            {name: 'fullEncodingID', type: 'USHORT', value: fullFormat === 13 ? 6 : 10},
            {name: 'fullOffset', type: 'ULONG', value: fullOffset}
        );
    }

    appendFields(cmapTable, makeFormat4Fields(format4Segments));

    if (needsFullSubtable) {
        appendFields(cmapTable, makeFormat12or13Fields(fullFormat, fullGroups));
    }

    return new table.Table('cmap', cmapTable);
}

export default { parse: parseCmapTable, make: makeCmapTable };

export { parseCmapTableFormat0, parseCmapTableFormat14 };
