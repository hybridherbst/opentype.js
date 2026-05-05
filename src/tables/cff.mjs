// The `CFF` table contains the glyph outlines in PostScript format.
// https://www.microsoft.com/typography/OTSPEC/cff.htm
// http://download.microsoft.com/download/8/0/1/801a191c-029d-4af3-9642-555f6fe514ee/cff.pdf
// http://download.microsoft.com/download/8/0/1/801a191c-029d-4af3-9642-555f6fe514ee/type2.pdf

// @TODO: refactor parsing using stateful parser?

import {
    CffEncoding,
    cffStandardEncoding,
    cffExpertEncoding,
    cffStandardStrings,
    cffISOAdobeStrings,
    cffIExpertStrings,
    cffExpertSubsetStrings
} from '../encoding.mjs';
import glyphset from '../glyphset.mjs';
import parse from '../parse.mjs';
import * as make from '../make.mjs';
import Path from '../path.mjs';
import table from '../table.mjs';
import { chunkArray } from '../util.mjs';

/**
 * @typedef {{name: string, type: string, value: Uint8Array | number[]}} CffLiteralEntry
 * @typedef {{name: string, type: string, value: import('../table.mjs').Table}} CffTableEntry
 * @typedef {import('../table.mjs').Table & {
 *   subrs?: CffLiteralEntry[],
 *   topDictLength?: number,
 *   fields: Array<{name: string, type: string, value?: number}>,
 *   fontDicts?: CffTableEntry[]
 * }} CffDynamicTable
 * @typedef {import('../table.mjs').Table & Record<string, CffDynamicTable>} CffRuntimeTable
 */

/**
 * @typedef {object} CffPrivateDict
 * @property {number} subrs - Offset to local subroutines
 * @property {number} defaultWidthX - Default width for glyphs not in hmtx
 * @property {number} nominalWidthX - Bias added to widths stored in charstrings
 * @property {number[]} [blueValues] - PostScript alignment zones (CFF2)
 * @property {number[]} [otherBlues] - Additional alignment zones (CFF2)
 * @property {number[]} [familyBlues] - Family alignment zones (CFF2)
 * @property {number[]} [familyOtherBlues] - Additional family alignment zones (CFF2)
 * @property {number} [blueScale] - Point size at which overshoot suppression stops (CFF2)
 * @property {number} [blueShift] - Value of the overshoot (CFF2)
 * @property {number} [blueFuzz] - Extension of alignment zones (CFF2)
 * @property {number} [stdHW] - Dominant width of horizontal stems (CFF2)
 * @property {number} [stdVW] - Dominant width of vertical stems (CFF2)
 * @property {number} [languageGroup] - Language group code (CFF2)
 * @property {number} [expansionFactor] - Limit for global coloring algorithm (CFF2)
 * @property {number} [vsindex] - Variation store index (CFF2)
 * @property {number[]} [stemSnapH] - Horizontal stem snap values (CFF2)
 * @property {number[]} [stemSnapV] - Vertical stem snap values (CFF2)
 */

/**
 * @typedef {object} CffTopDict
 * @property {string|null} version - Version of the font (SID)
 * @property {string|null} notice - Copyright notice (SID)
 * @property {string|null} copyright - Copyright string (SID)
 * @property {string|null} fullName - Full name of the font (SID)
 * @property {string|null} familyName - Family name of the font (SID)
 * @property {string|null} weight - Weight of the font, e.g. 'Bold' (SID)
 * @property {number} isFixedPitch - 1 if fixed-pitch (monospaced), 0 otherwise
 * @property {number} italicAngle - Angle of italic in degrees counter-clockwise from vertical
 * @property {number} underlinePosition - Underline position
 * @property {number} underlineThickness - Underline thickness
 * @property {number} paintType - 0 for fill, 2 for stroke
 * @property {number} charstringType - Charstring type (always 2 for Type 2)
 * @property {number[]} fontMatrix - Six-element transformation matrix
 * @property {number|null} uniqueId - Unique identifier for the font
 * @property {number[]} fontBBox - Font bounding box [xMin, yMin, xMax, yMax]
 * @property {number} strokeWidth - Dominant width of strokes for paintType 2
 * @property {Array|null} xuid - Extended unique id
 * @property {number} charset - Offset to charset data (0=ISOAdobe, 1=Expert, 2=ExpertSubset)
 * @property {number} encoding - Offset to encoding data (0=standard, 1=expert)
 * @property {number} charStrings - Offset to charstrings INDEX
 * @property {number[]} private - Two-element array [size, offset] of Private DICT
 * @property {Array|null} [ros] - Registry-Ordering-Supplement for CID-keyed fonts
 * @property {number} [cidFontVersion] - CID font version
 * @property {number} [cidFontRevision] - CID font revision
 * @property {number} [cidFontType] - CID font type
 * @property {number} [cidCount] - Count of CIDs in the font
 * @property {number} [uidBase] - UID base value for CID fonts
 * @property {number} [fdArray] - Offset to Font DICT INDEX for CID fonts
 * @property {number} [fdSelect] - Offset to FDSelect table for CID fonts
 * @property {number} [vstore] - Offset to variation store (CFF2 only)
 * @property {string|null} [fontName] - PostScript font name for CID fonts (SID)
 * @property {Array} [_subrs] - Parsed local subroutines (added during parsing)
 * @property {number} [_subrsBias] - Subroutine bias (added during parsing)
 * @property {number} [_defaultWidthX] - Default glyph width (added during parsing)
 * @property {number} [_nominalWidthX] - Nominal glyph width (added during parsing)
 * @property {CffPrivateDict} [_privateDict] - Parsed Private DICT (added during parsing)
 * @property {Array} [_fdArray] - Parsed Font DICT array for CID fonts (added during parsing)
 * @property {Array} [_fdSelect] - Parsed FDSelect data for CID fonts (added during parsing)
 * @property {object} [_vstore] - Parsed variation store for CFF2 fonts (added during parsing)
 */

/**
 * @typedef {object} CffTable
 * @property {CffTopDict} topDict - The parsed top-level CFF dictionary
 */

// Custom equals function that can also check lists.
function equals(a, b) {
    if (a === b) {
        return true;
    } else if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) {
            return false;
        }

        for (let i = 0; i < a.length; i += 1) {
            if (!equals(a[i], b[i])) {
                return false;
            }
        }

        return true;
    } else {
        return false;
    }
}

// Maximum subroutine call depth as defined by the CFF/Type 2 specification (section 4.7).
// FreeType and other conforming implementations also enforce this limit.
const MAX_CALL_DEPTH = 10;

// Subroutines are encoded using the negative half of the number space.
// See type 2 chapter 4.7 "Subroutine operators".
function calcCFFSubroutineBias(subrs) {
    let bias;
    if (subrs.length < 1240) {
        bias = 107;
    } else if (subrs.length < 33900) {
        bias = 1131;
    } else {
        bias = 32768;
    }

    return bias;
}

// @TODO: reduce code duplication between parseCFFIndex(), parseCFFIndexLowMemory() and getCffIndexObject()

// Parse a `CFF` INDEX array.
// An index array consists of a list of offsets, then a list of objects at those offsets.
function parseCFFIndex(data, start, conversionFn, version) {
    const offsets = [];
    const objects = [];
    const count = version > 1 ? parse.getULong(data, start) : parse.getCard16(data, start);
    const countLength = version > 1 ? 4 : 2;
    let objectOffset;
    let endOffset;
    if (count !== 0) {
        const offsetSize = parse.getByte(data, start + countLength);
        objectOffset = start + ((count + 1) * offsetSize) + countLength;
        let pos = start + countLength + 1;
        for (let i = 0; i < count + 1; i += 1) {
            offsets.push(parse.getOffset(data, pos, offsetSize));
            pos += offsetSize;
        }

        // The total size of the index array is 4 header bytes + the value of the last offset.
        endOffset = objectOffset + offsets[count];
    } else {
        endOffset = start + countLength;
    }

    for (let i = 0; i < offsets.length - 1; i += 1) {
        let value = parse.getBytes(data, objectOffset + offsets[i], objectOffset + offsets[i + 1]);
        if (conversionFn) {
            value = conversionFn(value, data, start, version);
        }

        objects.push(value);
    }

    return { objects: objects, startOffset: start, endOffset: endOffset };
}

function parseCFFIndexLowMemory(data, start, version) {
    const offsets = [];
    const count = version > 1 ? parse.getULong(data, start) : parse.getCard16(data, start);
    const countLength = version > 1 ? 4 : 2;
    let objectOffset;
    let endOffset;
    if (count !== 0) {
        const offsetSize = parse.getByte(data, start + countLength);
        objectOffset = start + ((count + 1) * offsetSize) + countLength;
        let pos = start + countLength + 1;
        for (let i = 0; i < count + 1; i += 1) {
            offsets.push(parse.getOffset(data, pos, offsetSize));
            pos += offsetSize;
        }

        // The total size of the index array is 4 header bytes + the value of the last offset.
        endOffset = objectOffset + offsets[count];
    } else {
        endOffset = start + countLength;
    }

    return { offsets: offsets, startOffset: start, endOffset: endOffset };
}
function getCffIndexObject(i, offsets, data, start, conversionFn, version) {
    const count = version > 1 ? parse.getULong(data, start) : parse.getCard16(data, start);
    const countLength = version > 1 ? 4 : 2;
    let objectOffset = 0;
    if (count !== 0) {
        const offsetSize = parse.getByte(data, start + countLength);
        objectOffset = start + ((count + 1) * offsetSize) + countLength;
    }

    let value = parse.getBytes(data, objectOffset + offsets[i], objectOffset + offsets[i + 1]);
    if (conversionFn) {
        value = conversionFn(value);
    }
    return value;
}

// Parse a `CFF` DICT real value.
function parseFloatOperand(parser) {
    let s = '';
    const eof = 15;
    const lookup = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.', 'E', 'E-', null, '-'];
    for (; ;) {
        const b = parser.parseByte();
        const n1 = b >> 4;
        const n2 = b & 15;

        if (n1 === eof) {
            break;
        }

        s += lookup[n1];

        if (n2 === eof) {
            break;
        }

        s += lookup[n2];
    }

    return parseFloat(s);
}

// Parse a `CFF` DICT operand.
function parseOperand(parser, b0) {
    let b1;
    let b2;
    let b3;
    let b4;
    if (b0 === 28) {
        b1 = parser.parseByte();
        b2 = parser.parseByte();
        return b1 << 8 | b2;
    }

    if (b0 === 29) {
        b1 = parser.parseByte();
        b2 = parser.parseByte();
        b3 = parser.parseByte();
        b4 = parser.parseByte();
        return b1 << 24 | b2 << 16 | b3 << 8 | b4;
    }

    if (b0 === 30) {
        return parseFloatOperand(parser);
    }

    if (b0 >= 32 && b0 <= 246) {
        return b0 - 139;
    }

    if (b0 >= 247 && b0 <= 250) {
        b1 = parser.parseByte();
        return (b0 - 247) * 256 + b1 + 108;
    }

    if (b0 >= 251 && b0 <= 254) {
        b1 = parser.parseByte();
        return -(b0 - 251) * 256 - b1 - 108;
    }

    throw new Error('Invalid b0 ' + b0);
}

// Convert the entries returned by `parseDict` to a proper dictionary.
// If a value is a list of one, it is unpacked.
function entriesToObject(entries) {
    const o = {};
    for (let i = 0; i < entries.length; i += 1) {
        const key = entries[i][0];
        const values = entries[i][1];
        let value;
        if (values.length === 1) {
            value = values[0];
        } else {
            value = values;
        }

        if (Object.prototype.hasOwnProperty.call(o, key) && !isNaN(o[key])) {
            throw new Error('Object ' + o + ' already has key ' + key);
        }

        o[key] = value;
    }

    return o;
}

// Parse a `CFF` DICT object.
// A dictionary contains key-value pairs in a compact tokenized format.
function parseCFFDict(data, start, size, version) {
    start = start !== undefined ? start : 0;
    const parser = new parse.Parser(data, start);
    const entries = [];
    const blends = [];
    let blendStack = [];
    let operands = [];
    size = size !== undefined ? size : data.byteLength;

    while (parser.relativeOffset < size) {
        let op = parser.parseByte();

        // Special-case: CFF2 'blend' operator (0x17) precedes the target operator
        if (version > 1 && op === 23) {
            const opBlends = parseBlend(operands);
            blendStack.unshift(opBlends);
            // don't clear operands; continue to next byte which should be an operator
            continue;
        }

        const isOneByteOperator = (op <= 21) || (version > 1 && (op === 22 || op === 24));

        if (op === 12 || isOneByteOperator) {
            // Two-byte operators have an initial escape byte of 12.
            if (op === 12) {
                op = 1200 + parser.parseByte();
            }
            if (blendStack.length) {
                let blendValues = blendStack.pop();
                if (operands.length > 1) {
                    blendValues = chunkArray(blendValues, operands.length);
                }
                blends.push([op, blendValues]);
            }
            entries.push([op, operands]);
            operands = [];
        } else {
            // Operand: accumulate until we encounter an operator
            operands.push(parseOperand(parser, op));
        }
    }

    const dict = entriesToObject(entries);
    if (blends.length) {
        dict._blends = entriesToObject(blends);
    }

    return dict;
}

// Given a String Index (SID), return the value of the string.
// Strings below index 392 are standard CFF strings and are not encoded in the font.
function getCFFString(strings, index) {
    if (index <= 390) {
        index = cffStandardStrings[index];
    } else if (strings) {
        index = strings[index - 391];
    } else {
        index = undefined;
    }

    return index;
}

// Interpret a dictionary and return a new dictionary with readable keys and values for missing entries.
// This function takes `meta` which is a list of objects containing `operand`, `name` and `default`.
function interpretDict(dict, meta, strings) {
    const newDict = {};
    const blends = {};
    let value;

    // Because we also want to include missing values, we start out from the meta list
    // and lookup values in the dict.
    for (let i = 0; i < meta.length; i += 1) {
        const m = meta[i];

        if (Array.isArray(m.type)) {
            const values = [];
            values.length = m.type.length;
            for (let j = 0; j < m.type.length; j++) {
                value = dict[m.op] !== undefined ? dict[m.op][j] : undefined;
                if (value === undefined) {
                    value = m.value !== undefined && m.value[j] !== undefined ? m.value[j] : null;
                }
                if (m.type[j] === 'SID') {
                    value = getCFFString(strings, value);
                }
                values[j] = value;
            }
            if (dict._blends && dict._blends[m.op]) {
                blends[m.name] = dict._blends[m.op];
            }
            newDict[m.name] = values;
        } else {
            value = dict[m.op];
            if (value === undefined) {
                value = m.value !== undefined ? m.value : null;
            } else if (dict._blends && dict._blends[m.op]) {
                blends[m.name] = dict._blends[m.op];
            }

            if (m.type === 'SID') {
                value = getCFFString(strings, value);
            }
            newDict[m.name] = value;
        }

    }

    if (Object.keys(blends).length) {
        newDict._blends = blends;
    }

    return newDict;
}

// Parse the CFF header.
function parseCFFHeader(data, start) {
    const header = {};
    header.formatMajor = parse.getCard8(data, start);
    header.formatMinor = parse.getCard8(data, start + 1);

    if (header.formatMajor > 2) {
        throw new Error(`Unsupported CFF table version ${header.formatMajor}.${header.formatMinor}`);
    }

    header.size = parse.getCard8(data, start + 2);

    if (header.formatMajor < 2) {
        header.offsetSize = parse.getCard8(data, start + 3);
        header.startOffset = start;
        header.endOffset = start + 4;
    } else {
        header.topDictLength = parse.getCard16(data, start + 3);
        header.endOffset = start + 8;
    }
    return header;
}

const TOP_DICT_META = [
    { name: 'version', op: 0, type: 'SID' },
    { name: 'notice', op: 1, type: 'SID' },
    { name: 'copyright', op: 1200, type: 'SID' },
    { name: 'fullName', op: 2, type: 'SID' },
    { name: 'familyName', op: 3, type: 'SID' },
    { name: 'weight', op: 4, type: 'SID' },
    { name: 'isFixedPitch', op: 1201, type: 'number', value: 0 },
    { name: 'italicAngle', op: 1202, type: 'number', value: 0 },
    { name: 'underlinePosition', op: 1203, type: 'number', value: -100 },
    { name: 'underlineThickness', op: 1204, type: 'number', value: 50 },
    { name: 'paintType', op: 1205, type: 'number', value: 0 },
    { name: 'charstringType', op: 1206, type: 'number', value: 2 },
    {
        name: 'fontMatrix',
        op: 1207,
        type: ['real', 'real', 'real', 'real', 'real', 'real'],
        value: [0.001, 0, 0, 0.001, 0, 0]
    },
    { name: 'uniqueId', op: 13, type: 'number' },
    { name: 'fontBBox', op: 5, type: ['number', 'number', 'number', 'number'], value: [0, 0, 0, 0] },
    { name: 'strokeWidth', op: 1208, type: 'number', value: 0 },
    { name: 'xuid', op: 14, type: [], value: null },
    { name: 'charset', op: 15, type: 'offset', value: 0 },
    { name: 'encoding', op: 16, type: 'offset', value: 0 },
    { name: 'charStrings', op: 17, type: 'offset', value: 0 },
    { name: 'private', op: 18, type: ['number', 'offset'], value: [0, 0] },
    { name: 'ros', op: 1230, type: ['SID', 'SID', 'number'] },
    { name: 'cidFontVersion', op: 1231, type: 'number', value: 0 },
    { name: 'cidFontRevision', op: 1232, type: 'number', value: 0 },
    { name: 'cidFontType', op: 1233, type: 'number', value: 0 },
    { name: 'cidCount', op: 1234, type: 'number', value: 8720 },
    { name: 'uidBase', op: 1235, type: 'number' },
    { name: 'fdArray', op: 1236, type: 'offset' },
    { name: 'fdSelect', op: 1237, type: 'offset' },
    { name: 'fontName', op: 1238, type: 'SID' }
];

const TOP_DICT_META_CFF2 = [
    // Expected order for stable encoding in tests:
    { name: 'charStrings', op: 17, type: 'varoffset', variable: true },
    // only if variation data is needed:
    { name: 'vstore', op: 24, type: 'varoffset', variable: true },
    { name: 'fdArray', op: 1236, type: 'varoffset', variable: true },
    // only if there is more than one Font Dict
    { name: 'fdSelect', op: 1237, type: 'varoffset', variable: true },
    // only if unitsPerEm in head table !== 1000
    {
        name: 'fontMatrix',
        op: 1207,
        type: ['real', 'real', 'real', 'real', 'real', 'real'],
        // 1/unitsPerEm 0 0 1/unitsPerEm 0 0
        value: [0.001, 0, 0, 0.001, 0, 0]
    },
];

const PRIVATE_DICT_META = [
    { name: 'subrs', op: 19, type: 'offset', value: 0 },
    { name: 'defaultWidthX', op: 20, type: 'number', value: 0 },
    { name: 'nominalWidthX', op: 21, type: 'number', value: 0 }
];

// https://learn.microsoft.com/en-us/typography/opentype/spec/cff2#table-16-private-dict-operators
const PRIVATE_DICT_META_CFF2 = [
    { name: 'blueValues', op: 6, type: 'delta' },
    { name: 'otherBlues', op: 7, type: 'delta' },
    { name: 'familyBlues', op: 8, type: 'delta' },
    { name: 'familyOtherBlues', op: 9, type: 'delta' },
    { name: 'blueScale', op: 1209, type: 'number', value: 0.039625 },
    { name: 'blueShift', op: 1210, type: 'number', value: 7 },
    { name: 'blueFuzz', op: 1211, type: 'number', value: 1 },
    { name: 'stdHW', op: 10, type: 'number' },
    { name: 'stdVW', op: 11, type: 'number' },
    { name: 'stemSnapH', op: 1212, type: 'number' },
    { name: 'stemSnapV', op: 1213, type: 'number' },
    { name: 'languageGroup', op: 1217, type: 'number', value: 0 },
    { name: 'expansionFactor', op: 1218, type: 'number', value: 0.06 },
    { name: 'vsindex', op: 22, type: 'number', value: 0 },
    // CFF2 uses varoffset encoding for offsets within DICTs
    { name: 'subrs', op: 19, type: 'varoffset' },
];

// https://learn.microsoft.com/en-us/typography/opentype/spec/cff2#table-10-font-dict-operator-entries
const FONT_DICT_META = [
    { name: 'private', op: 18, type: ['number', 'varoffset'], value: [0, 0] }
];

// Parse the CFF top dictionary. A CFF table can contain multiple fonts, each with their own top dictionary.
// The top dictionary contains the essential metadata for the font, together with the private dictionary.
function parseCFFTopDict(data, start, strings, version) {
    const dict = parseCFFDict(data, start, data.byteLength, version);
    return interpretDict(dict, version > 1 ? TOP_DICT_META_CFF2 : TOP_DICT_META, strings);
}

// Parse the CFF private dictionary. We don't fully parse out all the values, only the ones we need.
function parseCFFPrivateDict(data, start, size, strings, version) {
    const dict = parseCFFDict(data, start, size, version);
    const result = interpretDict(dict, version > 1 ? PRIVATE_DICT_META_CFF2 : PRIVATE_DICT_META, strings);
    // Preserve explicit presence of default-valued operators when re-encoding
    if (version > 1) {
        Object.defineProperty(result, '__keepDefaults', { value: true, enumerable: false });
    }
    return result;
}

function parseFontDict(data, start, version) {
    const dict = parseCFFDict(data, start, undefined, version);
    return interpretDict(dict, FONT_DICT_META);
}

function gatherCFF2FontDicts(data, start, fdArray) {
    const fontDictArray = [];
    for (let i = 0; i < fdArray.length; i++) {
        const fontDictData = new DataView(new Uint8Array(fdArray[i]).buffer);
        const fontDict = parseFontDict(fontDictData, 0, 2);
        const privateSize = fontDict.private[0];
        const privateOffset = fontDict.private[1];
        if (privateSize !== 0 && privateOffset !== 0) {
            const privateDict = parseCFFPrivateDict(data, privateOffset + start, privateSize, [], 2);
            if (privateDict.subrs) {
                const subrOffset = privateOffset + privateDict.subrs;
                try {
                    const dumpStart = start + subrOffset;
                    // quick sanity read to avoid out-of-bounds without logging
                    parse.getULong(data, dumpStart);
                } catch { /* ignore */ }
                const subrIndex = parseCFFIndex(data, subrOffset + start, undefined, 2);
                fontDict._subrs = subrIndex.objects;
                fontDict._subrsBias = calcCFFSubroutineBias(fontDict._subrs);
            }
            fontDict._privateDict = privateDict;
        }
        fontDictArray.push(fontDict);
    }
    return fontDictArray;
}

// Returns a list of "Top DICT"s found using an INDEX list.
// Used to read both the usual high-level Top DICTs and also the FDArray
// discovered inside CID-keyed fonts.  When a Top DICT has a reference to
// a Private DICT that is read and saved into the Top DICT.
//
// In addition to the expected/optional values as outlined in TOP_DICT_META
// the following values might be saved into the Top DICT.
//
//    _subrs []        array of local CFF subroutines from Private DICT
//    _subrsBias       bias value computed from number of subroutines
//                      (see calcCFFSubroutineBias() and parseCFFCharstring())
//    _defaultWidthX   default widths for CFF characters
//    _nominalWidthX   bias added to width embedded within glyph description
//
//    _privateDict     saved copy of parsed Private DICT from Top DICT
/** @returns {Array<Record<string, unknown>>} */
function gatherCFFTopDicts(data, start, cffIndex, strings, version) {
    const topDictArray = /** @type {Array<Record<string, unknown>>} */ ([]);
    for (let iTopDict = 0; iTopDict < cffIndex.length; iTopDict += 1) {
        const topDictData = new DataView(new Uint8Array(cffIndex[iTopDict]).buffer);
        const topDict = parseCFFTopDict(topDictData, 0, strings, version);
        topDict._subrs = [];
        topDict._subrsBias = 0;
        topDict._defaultWidthX = 0;
        topDict._nominalWidthX = 0;
        const privateSize = version < 2 ? topDict.private[0] : 0;
        const privateOffset = version < 2 ? topDict.private[1] : 0;
        if (privateSize !== 0 && privateOffset !== 0) {
            const privateDict = parseCFFPrivateDict(data, privateOffset + start, privateSize, strings, version);
            topDict._defaultWidthX = privateDict.defaultWidthX;
            topDict._nominalWidthX = privateDict.nominalWidthX;
            if (privateDict.subrs !== 0) {
                const subrOffset = privateOffset + privateDict.subrs;
                const subrIndex = parseCFFIndex(data, subrOffset + start, undefined, version);
                topDict._subrs = subrIndex.objects;
                topDict._subrsBias = calcCFFSubroutineBias(topDict._subrs);
            }
            topDict._privateDict = privateDict;
        }
        topDictArray.push(/** @type {Record<string, unknown>} */ (/** @type {unknown} */ (topDict)));
    }
    return topDictArray;
}

// Parse the CFF charset table, which contains internal names for all the glyphs.
// This function will return a list of glyph names.
// See Adobe TN #5176 chapter 13, "Charsets".
function parseCFFCharset(data, start, nGlyphs, strings, isCIDFont) {
    let sid;
    let count;
    const parser = new parse.Parser(data, start);

    // The .notdef glyph is not included, so subtract 1.
    nGlyphs -= 1;
    const charset = ['.notdef'];

    const format = parser.parseCard8();
    if (format === 0) {
        for (let i = 0; i < nGlyphs; i += 1) {
            sid = parser.parseSID();

            if (isCIDFont) {
                charset.push(sid);
            } else {
                charset.push(getCFFString(strings, sid) || sid);
            }

        }
    } else if (format === 1) {
        while (charset.length <= nGlyphs) {
            sid = parser.parseSID();
            count = parser.parseCard8();
            for (let i = 0; i <= count; i += 1) {
                if (isCIDFont) {
                    charset.push('cid' + ('00000' + sid).slice(-5));
                } else {
                    charset.push(getCFFString(strings, sid) || sid);
                }
                sid += 1;
            }
        }
    } else if (format === 2) {
        while (charset.length <= nGlyphs) {
            sid = parser.parseSID();
            count = parser.parseCard16();
            for (let i = 0; i <= count; i += 1) {
                if (isCIDFont) {
                    charset.push('cid' + ('00000' + sid).slice(-5));
                } else {
                    charset.push(getCFFString(strings, sid) || sid);
                }
                sid += 1;
            }
        }
    } else {
        throw new Error('Unknown charset format ' + format);
    }

    return charset;
}

// Parse the CFF encoding data. Only one encoding can be specified per font.
// See Adobe TN #5176 chapter 12, "Encodings".
function parseCFFEncoding(data, start) {
    let code;
    const encoding = {};
    const parser = new parse.Parser(data, start);
    const format = parser.parseCard8();
    if (format === 0) {
        const nCodes = parser.parseCard8();
        for (let i = 0; i < nCodes; i += 1) {
            code = parser.parseCard8();
            encoding[code] = i;
        }
    } else if (format === 1) {
        const nRanges = parser.parseCard8();
        code = 1;
        for (let i = 0; i < nRanges; i += 1) {
            const first = parser.parseCard8();
            const nLeft = parser.parseCard8();
            for (let j = first; j <= first + nLeft; j += 1) {
                encoding[j] = code;
                code += 1;
            }
        }
    } else {
        throw new Error('Unknown encoding format ' + format);
    }

    return encoding;
}

function parseBlend(operands) {
    const numberOfBlends = operands.pop();
    const blends = [];
    while (operands.length > numberOfBlends) {
        blends.unshift(operands.pop());
    }
    return blends;
}

/**
 * Applies path styles according to a CFF font's PaintType
 * @param {Record<string, unknown>} font
 * @param {import('../path.mjs').default} path
 * @returns {number} paintType
 */
function applyPaintType(font, path) {
    const tables = /** @type {Record<string, unknown>} */ (font.tables || {});
    const cff = /** @type {Record<string, unknown>} */ (tables.cff || {});
    const topDict = /** @type {Record<string, unknown>} */ (cff.topDict || {});
    const paintType = /** @type {number} */ (topDict.paintType) || 0;
    if (paintType === 2) {
        path.fill = null;
        path.stroke = 'black';
        path.strokeWidth = /** @type {number} */ (topDict.strokeWidth) || 0;
    }
    return paintType;
}

// Take in charstring code and return a Glyph object.
// The encoding is described in the Type 2 Charstring Format
// https://www.microsoft.com/typography/OTSPEC/charstr2.htm
function parseCFFCharstring(font, glyph, code, version, coords) {
    let c1x;
    let c1y;
    let c2x;
    let c2y;
    const p = new Path();
    const stack = [];
    const blendStack = [];
    let nStems = 0;
    let haveWidth = false;
    let open = false;
    let x = 0;
    let y = 0;
    let blendX;
    let blendY;
    let subrs;
    let subrsBias;
    let defaultWidthX;
    let nominalWidthX;
    let vsindex = 0;
    let vstore = [];
    let blendVector;
    const usedOps = [];
    const glyphSubrs = [];
    const glyphGSubrs = [];
    let blendingActive = false;
    let callDepth = 0;
    const cffTable = font.tables.cff2 || font.tables.cff;
    defaultWidthX = cffTable.topDict._defaultWidthX;
    nominalWidthX = cffTable.topDict._nominalWidthX;
    coords = coords || font.variation && font.variation.get();

    if (!glyph.getBlendPath) {
        glyph.getBlendPath = function (font, variationCoords) {
            // Apply stored deltas instead of re-parsing the CharString when possible
            if (glyph.vsindex === undefined || !font || !font.tables) {
                return parseCFFCharstring(font, glyph, code, version, variationCoords);
            }
            const cffTable = font.tables.cff2 || font.tables.cff;
            const store = cffTable && cffTable.topDict && cffTable.topDict._vstore;
            const ivs = store && store.itemVariationStore;
            const blendVector = font.variation && variationCoords && ivs && font.variation.process.getBlendVector(ivs, glyph.vsindex, variationCoords);
            if (!blendVector) {
                return glyph.path;
            }
            const path = glyph.path;
            const commands = path.commands || [];
            const newCommands = [];
            let x = 0, y = 0;
            for (let i = 0; i < commands.length; i++) {
                const src = commands[i];
                const isCurve = src.type === 'C';
                const out = Object.assign({}, src);
                const deltas = src.deltas;
                if (deltas) {
                    const sum = {};
                    if (isCurve) {
                        sum.c1x = deltas.c1x ? deltas.c1x[0] : x;
                        sum.c1y = deltas.c1y ? deltas.c1y[0] : y;
                        sum.c2x = deltas.c2x ? deltas.c2x[0] : sum.c1x;
                        sum.c2y = deltas.c2y ? deltas.c2y[0] : sum.c1y;
                        sum.x = deltas.x ? deltas.x[0] : sum.c2x;
                        sum.y = deltas.y ? deltas.y[0] : sum.c2y;
                    } else {
                        sum.x = deltas.x ? deltas.x[0] : x;
                        sum.y = deltas.y ? deltas.y[0] : y;
                    }
                    for (let j = 0; j < blendVector.length; j++) {
                        if (deltas.x) sum.x += blendVector[j] * deltas.x[1][j];
                        if (deltas.y) sum.y += blendVector[j] * deltas.y[1][j];
                        if (isCurve) {
                            if (deltas.c1x) sum.c1x += blendVector[j] * deltas.c1x[1][j];
                            if (deltas.c1y) sum.c1y += blendVector[j] * deltas.c1y[1][j];
                            if (deltas.c2x) sum.c2x += blendVector[j] * deltas.c2x[1][j];
                            if (deltas.c2y) sum.c2y += blendVector[j] * deltas.c2y[1][j];
                        }
                    }
                    out.x = Math.round(sum.x);
                    out.y = Math.round(sum.y);
                    if (isCurve) {
                        out.c1x = Math.round(sum.c1x);
                        out.c1y = Math.round(sum.c1y);
                        out.c2x = Math.round(sum.c2x);
                        out.c2y = Math.round(sum.c2y);
                    }
                    x = out.x; y = out.y;
                } else {
                    if (out.x !== undefined) x = out.x;
                    if (out.y !== undefined) y = out.y;
                }
                newCommands.push(out);
            }
            const newPath = new Path();
            newPath.commands = newCommands;
            newPath.fill = path.fill;
            newPath.stroke = path.stroke;
            newPath.strokeWidth = path.strokeWidth;
            if (path._layers) newPath._layers = path._layers;
            return newPath;
        };
    }

    if (font.isCIDFont || version > 1) {
        const fdIndex = cffTable.topDict._fdSelect ? cffTable.topDict._fdSelect[glyph.index] : 0;
        const fdDict = cffTable.topDict._fdArray[fdIndex];
        subrs = fdDict._subrs;
        subrsBias = fdDict._subrsBias;
        if (version > 1) {
            vstore = (cffTable.topDict && cffTable.topDict._vstore) ? cffTable.topDict._vstore.itemVariationStore : null;
            vsindex = fdDict._privateDict.vsindex;
        } else {
            defaultWidthX = fdDict._defaultWidthX;
            nominalWidthX = fdDict._nominalWidthX;
        }
    } else {
        subrs = cffTable.topDict._subrs;
        subrsBias = cffTable.topDict._subrsBias;
    }

    const paintType = applyPaintType(font, p);
    let width = defaultWidthX;

    function newContour(x, y) {
        if (open && paintType !== 2) {
            p.closePath();
        }

        p.moveTo(x, y);
        open = true;
    }

    function parseStems() {
        let hasWidthArg;

        // The number of stem operators on the stack is always even.
        // If the value is uneven, that means a width is specified.
        hasWidthArg = (stack.length & 1) !== 0;
        if (hasWidthArg && !haveWidth) {
            width = stack.shift() + nominalWidthX;
        }

        nStems += stack.length >> 1;
        stack.length = 0;
        haveWidth = true;
    }

    function parse(code, fromSubr = false) {
        let b1;
        let b2;
        let b3;
        let b4;
        let codeIndex;
        let subrCode;
        let jpx;
        let jpy;
        let c3x;
        let c3y;
        let c4x;
        let c4y;

        let i = 0;
        while (i < code.length) {
            let v = code[i];
            !fromSubr && v < 32 && usedOps.push(v);
            i += 1;
            switch (v) {
                case 1: // hstem
                    parseStems();
                    break;
                case 3: // vstem
                    parseStems();
                    break;
                case 4: // vmoveto
                    // vmoveto
                    if (stack.length > 1 && !haveWidth) {
                        width = stack.shift() + nominalWidthX;
                        haveWidth = true;
                    }

                    y += stack.pop();
                    newContour(x, y);
                    if (blendingActive && blendStack.length) {
                        p.commands[p.commands.length - 1].deltas = {
                            x: blendX,
                            y: blendStack.pop(),
                        };
                    }
                    break;
                case 5: // rlineto
                    // rlineto
                    while (stack.length > 0) {
                        x += stack.shift();
                        y += stack.shift();
                        p.lineTo(x, y);

                        if (blendingActive && blendStack.length) {
                            p.commands[p.commands.length - 1].deltas = {
                                x: blendStack.shift(),
                                y: blendStack.shift(),
                            };
                        }
                    }
                    break;
                case 6: // hlineto
                    // hlineto
                    while (stack.length > 0) {
                        x += stack.shift();
                        p.lineTo(x, y);
                        if (blendingActive && blendStack.length) {
                            p.commands[p.commands.length - 1].deltas = {
                                x: blendStack.shift(),
                                y: blendY,
                            };
                        }
                        if (stack.length === 0) {
                            break;
                        }

                        y += stack.shift();
                        p.lineTo(x, y);
                        if (blendingActive && blendStack.length) {
                            p.commands[p.commands.length - 1].deltas = {
                                x: blendX,
                                y: blendStack.shift(),
                            };
                        }
                    }

                    break;
                case 7: // vlineto
                    // vlineto
                    while (stack.length > 0) {
                        y += stack.shift();
                        p.lineTo(x, y);
                        if (blendingActive && blendStack.length) {
                            p.commands[p.commands.length - 1].deltas = {
                                y: blendStack.shift(),
                                x: blendX,
                            };
                        }
                        if (stack.length === 0) {
                            break;
                        }

                        x += stack.shift();
                        p.lineTo(x, y);
                        if (blendingActive && blendStack.length) {
                            p.commands[p.commands.length - 1].deltas = {
                                x: blendStack.shift(),
                                y: blendY
                            };
                        }

                    }

                    break;
                case 8: // rrcurveto
                    // rrcurveto
                    while (stack.length > 0) {
                        c1x = x + stack.shift();
                        c1y = y + stack.shift();
                        c2x = c1x + stack.shift();
                        c2y = c1y + stack.shift();
                        x = c2x + stack.shift();
                        y = c2y + stack.shift();
                        p.curveTo(c1x, c1y, c2x, c2y, x, y);
                        if (blendingActive && blendStack.length) {
                            p.commands[p.commands.length - 1].deltas = {
                                c1x: blendStack.shift(),
                                c1y: blendStack.shift(),
                                c2x: blendStack.shift(),
                                c2y: blendStack.shift(),
                                x: blendStack.shift(),
                                y: blendStack.shift(),
                            };
                        }
                    }
                    break;
                case 10: // callsubr
                    // callsubr
                    codeIndex = stack.pop() + subrsBias;
                    glyphSubrs.push(codeIndex);
                    glyphGSubrs.push(null);
                    subrCode = subrs[codeIndex];

                    if (subrCode) {
                        if (callDepth >= MAX_CALL_DEPTH) {
                            console.warn('CFF charstring subroutine call depth exceeded, skipping callsubr');
                            break;
                        }
                        callDepth++;
                        parse(subrCode, true);
                        callDepth--;
                    }

                    break;
                case 11: // return
                    if (version > 1) {
                        console.error('CFF CharString operator return (11) is not supported in CFF2');
                        break;
                    }
                    return;
                case 12: // flex operators
                    // flex ops
                    v = code[i];
                    i += 1;
                    switch (v) {
                        case 35: // flex
                            // |- dx1 dy1 dx2 dy2 dx3 dy3 dx4 dy4 dx5 dy5 dx6 dy6 fd flex (12 35) |-
                            c1x = x + stack.shift();    // dx1
                            c1y = y + stack.shift();    // dy1
                            c2x = c1x + stack.shift();    // dx2
                            c2y = c1y + stack.shift();    // dy2
                            jpx = c2x + stack.shift();    // dx3
                            jpy = c2y + stack.shift();    // dy3
                            c3x = jpx + stack.shift();    // dx4
                            c3y = jpy + stack.shift();    // dy4
                            c4x = c3x + stack.shift();    // dx5
                            c4y = c3y + stack.shift();    // dy5
                            x = c4x + stack.shift();    // dx6
                            y = c4y + stack.shift();    // dy6
                            stack.shift();                // flex depth
                            p.curveTo(c1x, c1y, c2x, c2y, jpx, jpy);
                            if (blendingActive && blendStack.length) {
                                p.commands[p.commands.length - 1].deltas = {
                                    c1x: blendStack.pop(),
                                    c1y: blendStack.pop(),
                                    c2x: blendStack.pop(),
                                    c2y: blendStack.pop(),
                                    jpx: blendStack.pop(),
                                    jpy: blendStack.pop(),
                                };
                            }
                            p.curveTo(c3x, c3y, c4x, c4y, x, y);
                            if (blendingActive && blendStack.length) {
                                p.commands[p.commands.length - 1].deltas = {
                                    c3x: blendStack.pop(),
                                    c3y: blendStack.pop(),
                                    c4x: blendStack.pop(),
                                    c4y: blendStack.pop(),
                                    x: blendStack.pop(),
                                    y: blendStack.pop(),
                                };
                            }
                            break;
                        case 34: // hflex
                            // |- dx1 dx2 dy2 dx3 dx4 dx5 dx6 hflex (12 34) |-
                            c1x = x + stack.shift();    // dx1
                            c1y = y;                      // dy1
                            c2x = c1x + stack.shift();    // dx2
                            c2y = c1y + stack.shift();    // dy2
                            jpx = c2x + stack.shift();    // dx3
                            jpy = c2y;                    // dy3
                            c3x = jpx + stack.shift();    // dx4
                            c3y = c2y;                    // dy4
                            c4x = c3x + stack.shift();    // dx5
                            c4y = y;                      // dy5
                            x = c4x + stack.shift();      // dx6
                            p.curveTo(c1x, c1y, c2x, c2y, jpx, jpy);
                            if (blendingActive && blendStack.length) {
                                p.commands[p.commands.length - 1].deltas = {
                                    c1x: blendStack.pop(),
                                    c1y: 0,
                                    c2x: blendStack.pop(),
                                    c2y: blendStack.pop(),
                                    jpx: blendStack.pop(),
                                    jpy: 0,
                                };
                            }
                            p.curveTo(c3x, c3y, c4x, c4y, x, y);
                            if (blendingActive && blendStack.length) {
                                p.commands[p.commands.length - 1].deltas = {
                                    c3x: blendStack.pop(),
                                    c3y: 0,
                                    c4x: blendStack.pop(),
                                    c4y: 0,
                                    x: blendStack.pop(),
                                    y: 0,
                                };
                            }
                            break;
                        case 36: // hflex1
                            // |- dx1 dy1 dx2 dy2 dx3 dx4 dx5 dy5 dx6 hflex1 (12 36) |-
                            c1x = x + stack.shift();    // dx1
                            c1y = y + stack.shift();    // dy1
                            c2x = c1x + stack.shift();    // dx2
                            c2y = c1y + stack.shift();    // dy2
                            jpx = c2x + stack.shift();    // dx3
                            jpy = c2y;                    // dy3
                            c3x = jpx + stack.shift();    // dx4
                            c3y = c2y;                    // dy4
                            c4x = c3x + stack.shift();    // dx5
                            c4y = c3y + stack.shift();    // dy5
                            x = c4x + stack.shift();      // dx6
                            p.curveTo(c1x, c1y, c2x, c2y, jpx, jpy);
                            if (blendingActive && blendStack.length) {
                                p.commands[p.commands.length - 1].deltas = {
                                    c1x: blendStack.pop(),
                                    c1y: blendStack.pop(),
                                    c2x: blendStack.pop(),
                                    c2y: blendStack.pop(),
                                    jpx: blendStack.pop(),
                                    jpy: 0,
                                };
                            }
                            p.curveTo(c3x, c3y, c4x, c4y, x, y);
                            if (blendingActive && blendStack.length) {
                                p.commands[p.commands.length - 1].deltas = {
                                    c3x: blendStack.pop(),
                                    c3y: 0,
                                    c4x: blendStack.pop(),
                                    c4y: blendStack.pop(),
                                    x: blendStack.pop(),
                                    y: 0,
                                };
                            }
                            break;
                        case 37: // flex1
                            // |- dx1 dy1 dx2 dy2 dx3 dy3 dx4 dy4 dx5 dy5 d6 flex1 (12 37) |-
                            c1x = x + stack.shift();    // dx1
                            c1y = y + stack.shift();    // dy1
                            c2x = c1x + stack.shift();    // dx2
                            c2y = c1y + stack.shift();    // dy2
                            jpx = c2x + stack.shift();    // dx3
                            jpy = c2y + stack.shift();    // dy3
                            c3x = jpx + stack.shift();    // dx4
                            c3y = jpy + stack.shift();    // dy4
                            c4x = c3x + stack.shift();    // dx5
                            c4y = c3y + stack.shift();    // dy5
                            if (Math.abs(c4x - x) > Math.abs(c4y - y)) {
                                x = c4x + stack.shift();
                            } else {
                                y = c4y + stack.shift();
                            }

                            p.curveTo(c1x, c1y, c2x, c2y, jpx, jpy);
                            if (blendingActive && blendStack.length) {
                                p.commands[p.commands.length - 1].deltas = {
                                    c1x: blendStack.pop(),
                                    c1y: blendStack.pop(),
                                    c2x: blendStack.pop(),
                                    c2y: blendStack.pop(),
                                    jpx: blendStack.pop(),
                                    jpy: blendStack.pop(),
                                };
                            }
                            p.curveTo(c3x, c3y, c4x, c4y, x, y);
                            if (blendingActive && blendStack.length) {
                                p.commands[p.commands.length - 1].deltas = {
                                    c3x: blendStack.pop(),
                                    c3y: blendStack.pop(),
                                    c4x: blendStack.pop(),
                                    c4y: blendStack.pop(),
                                    x: blendStack.pop(),
                                    y: blendStack.pop(),
                                };
                            }
                            break;
                        default:
                            // unsupported flex sub-op
                            stack.length = 0;
                    }
                    break;
                case 14: // endchar
                    if (version > 1) {
                        console.error('CFF CharString operator endchar (14) is not supported in CFF2');
                        break;
                    }

                    if (stack.length >= 4) {
                        // Type 2 Charstring Format Appendix C
                        // treat like Type 1 seac command (standard encoding accented character)
                        const acharName = cffStandardEncoding[stack.pop()];
                        const bcharName = cffStandardEncoding[stack.pop()];
                        const ady = stack.pop();
                        const adx = stack.pop();
                        // const asb = stack.pop(); // ignored for Type 2
                        if (acharName && bcharName) {
                            glyph.isComposite = true;
                            glyph.components = [];

                            const acharGlyphIndex = font.cffEncoding.charset.indexOf(acharName);
                            const bcharGlyphIndex = font.cffEncoding.charset.indexOf(bcharName);

                            glyph.components.push({
                                glyphIndex: bcharGlyphIndex,
                                dx: 0,
                                dy: 0
                            });
                            glyph.components.push({
                                glyphIndex: acharGlyphIndex,
                                dx: adx,
                                dy: ady
                            });
                            p.extend(font.glyphs.get(bcharGlyphIndex).path);
                            const acharGlyph = font.glyphs.get(acharGlyphIndex);
                            const shiftedCommands = JSON.parse(JSON.stringify(acharGlyph.path.commands)); // make a deep clone
                            for (let i = 0; i < shiftedCommands.length; i += 1) {
                                const cmd = shiftedCommands[i];
                                if (cmd.type !== 'Z') {
                                    cmd.x += adx;
                                    cmd.y += ady;
                                }
                                if (cmd.type === 'Q' || cmd.type === 'C') {
                                    cmd.x1 += adx;
                                    cmd.y1 += ady;
                                }
                                if (cmd.type === 'C') {
                                    cmd.x2 += adx;
                                    cmd.y2 += ady;
                                }
                            }
                            p.extend(shiftedCommands);
                        }
                    } else if (stack.length > 0 && !haveWidth) {
                        width = stack.shift() + nominalWidthX;
                        haveWidth = true;
                    }

                    if (open && paintType !== 2) {
                        p.closePath();
                        open = false;
                    }

                    break;
                case 15: // vsindex
                    // vsindex
                    if (version < 2) {
                        console.error('CFF2 CharString operator vsindex (15) is not supported in CFF');
                        break;
                    }
                    vsindex = stack.pop();
                    break;
                case 16: // blend
                    // blend
                    if (version < 2) {
                        console.error('CFF2 CharString operator blend (16) is not supported in CFF');
                        break;
                    }

                    // https://learn.microsoft.com/en-us/typography/opentype/spec/cff2charstr#syntax-for-font-variations-support-operators

                    if (!blendVector) {
                        blendVector = font.variation && coords && font.variation.process.getBlendVector(vstore, vsindex, coords);
                    }

                    var n = stack.pop();
                    var vstoreRec = /** @type {{ itemVariationSubtables: Array<{ regionIndexes: unknown[] }> }} */ (/** @type {unknown} */ (vstore));
                    var axisCount = blendVector ? blendVector.length : vstoreRec.itemVariationSubtables[vsindex].regionIndexes.length;
                    var deltaSetCount = n * axisCount;
                    var delta = stack.length - deltaSetCount;
                    var deltaSetIndex = delta - n;

                    glyph.vsindex = vsindex;

                    if (blendVector) {
                        glyph.vsindex = vsindex;
                        blendingActive = true;
                        for (let i = 0; i < n; i++) {
                            var defaultValue = stack[deltaSetIndex + i]; // Base value before blending
                            var deltaValues = stack.slice(delta, delta + axisCount); // Capture the raw deltas directly from the stack
                            var sum = defaultValue;

                            blendStack[deltaSetIndex + i] = [defaultValue, deltaValues];

                            for (let j = 0; j < axisCount; j++) {
                                sum += blendVector[j] * deltaValues[j]; // Apply blending using the blend vector
                            }

                            stack[deltaSetIndex + i] = sum; // Update stack with blended value
                            // console.log(`modified at index ${deltaSetIndex + i}`);
                            delta += axisCount; // Move the delta index forward by the axisCount
                        }
                    }

                    // fill blend stack with null for unmodified values
                    if (blendStack.length < (stack.length - deltaSetCount)) {
                        blendStack.length = stack.length - deltaSetCount;
                    }


                    while (deltaSetCount--) {
                        stack.pop();
                        blendStack.pop();
                    }
                    break;
                case 18: // hstemhm
                    parseStems();
                    break;
                case 19: // hintmask
                case 20: // cntrmask
                    parseStems();
                    i += (nStems + 7) >> 3;
                    break;
                case 21: // rmoveto
                    // rmoveto
                    if (stack.length > 2 && !haveWidth) {
                        width = stack.shift() + nominalWidthX;
                        haveWidth = true;
                    }

                    y += stack.pop();
                    x += stack.pop();
                    newContour(x, y);
                    if (blendingActive && blendStack.length) {
                        p.commands[p.commands.length - 1].deltas = {
                            y: blendStack.pop(),
                            x: blendStack.pop(),
                        };
                    }
                    break;
                case 22: // hmoveto
                    // hmoveto
                    if (stack.length > 1 && !haveWidth) {
                        width = stack.shift() + nominalWidthX;
                        haveWidth = true;
                    }

                    x += stack.pop();
                    newContour(x, y);
                    if (blendingActive && blendStack.length) {
                        p.commands[p.commands.length - 1].deltas = {
                            x: blendStack.pop(),
                            y: blendY,
                        };
                    }
                    break;
                case 23: // vstemhm
                    parseStems();
                    break;
                case 24: // rcurveline
                    // rcurveline
                    while (stack.length > 2) {
                        c1x = x + stack.shift();
                        c1y = y + stack.shift();
                        c2x = c1x + stack.shift();
                        c2y = c1y + stack.shift();
                        x = c2x + stack.shift();
                        y = c2y + stack.shift();
                        p.curveTo(c1x, c1y, c2x, c2y, x, y);
                        if (blendingActive && blendStack.length) {
                            p.commands[p.commands.length - 1].deltas = {
                                c1x: blendStack.shift(),
                                c1y: blendStack.shift(),
                                c2x: blendStack.shift(),
                                c2y: blendStack.shift(),
                                x: blendStack.shift(),
                                y: blendStack.shift(),
                            };
                        }
                    }

                    x += stack.shift();
                    y += stack.shift();
                    p.lineTo(x, y);
                    if (blendingActive && blendStack.length) {
                        p.commands[p.commands.length - 1].deltas = {
                            x: blendStack.shift(),
                            y: blendStack.shift(),
                        };
                    }
                    break;
                case 25: // rlinecurve
                    // rlinecurve
                    while (stack.length > 6) {
                        x += stack.shift();
                        y += stack.shift();
                        p.lineTo(x, y);
                        if (blendingActive && blendStack.length) {
                            p.commands[p.commands.length - 1].deltas = {
                                x: blendStack.shift(),
                                y: blendStack.shift(),
                            };
                        }
                    }

                    c1x = x + stack.shift();
                    c1y = y + stack.shift();
                    c2x = c1x + stack.shift();
                    c2y = c1y + stack.shift();
                    x = c2x + stack.shift();
                    y = c2y + stack.shift();
                    p.curveTo(c1x, c1y, c2x, c2y, x, y);
                    if (blendingActive && blendStack.length) {
                        p.commands[p.commands.length - 1].deltas = {
                            c1x: blendStack.shift(),
                            c1y: blendStack.shift(),
                            c2x: blendStack.shift(),
                            c2y: blendStack.shift(),
                            x: blendStack.shift(),
                            y: blendStack.shift(),
                        };
                    }
                    break;
                case 26: // vvcurveto
                    if (stack.length & 1) {
                        x += stack.shift();
                        if (blendingActive && blendStack.length) {
                            blendX = blendStack.shift();
                        }
                    }

                    while (stack.length > 0) {
                        c1x = x;
                        c1y = y + stack.shift();
                        c2x = c1x + stack.shift();
                        c2y = c1y + stack.shift();
                        x = c2x;
                        y = c2y + stack.shift();
                        p.curveTo(c1x, c1y, c2x, c2y, x, y);
                        if (blendingActive && blendStack.length) {
                            p.commands[p.commands.length - 1].deltas = {
                                c1x: blendX,
                                c1y: blendStack.shift(),
                                c2x: blendStack.shift(),
                                c2y: blendStack.shift(),
                                x: blendX,
                                y: blendStack.shift(),
                            };
                        }
                    }

                    break;
                case 27: // hhcurveto
                    if (stack.length & 1) {
                        y += stack.shift();
                        if (blendingActive && blendStack.length) {
                            blendY = blendStack.shift();
                        }
                    }

                    while (stack.length > 0) {
                        c1x = x + stack.shift();
                        c1y = y;
                        c2x = c1x + stack.shift();
                        c2y = c1y + stack.shift();
                        x = c2x + stack.shift();
                        y = c2y;
                        p.curveTo(c1x, c1y, c2x, c2y, x, y);
                        if (blendingActive && blendStack.length) {
                            p.commands[p.commands.length - 1].deltas = {
                                c1x: blendStack.shift(),
                                c1y: blendY,
                                c2x: blendStack.shift(),
                                c2y: blendStack.shift(),
                                x: blendStack.shift(),
                                y: blendY,
                            };
                        }
                    }

                    break;
                case 28: // shortint
                    // shortint
                    b1 = code[i];
                    b2 = code[i + 1];
                    stack.push(((b1 << 24) | (b2 << 16)) >> 16);
                    i += 2;
                    break;
                case 29: // callgsubr
                    // callgsubr
                    codeIndex = stack.pop() + font.gsubrsBias;
                    glyphSubrs.push(null);
                    glyphGSubrs.push(codeIndex);
                    subrCode = font.gsubrs[codeIndex];

                    if (subrCode) {
                        if (callDepth >= MAX_CALL_DEPTH) {
                            console.warn('CFF charstring subroutine call depth exceeded, skipping callgsubr');
                            break;
                        }
                        callDepth++;
                        parse(subrCode, true);
                        callDepth--;
                    }

                    break;
                case 30: // vhcurveto
                    while (stack.length > 0) {
                        c1x = x;
                        c1y = y + stack.shift();
                        c2x = c1x + stack.shift();
                        c2y = c1y + stack.shift();
                        x = c2x + stack.shift();
                        y = c2y + (stack.length === 1 ? stack.shift() : 0);
                        p.curveTo(c1x, c1y, c2x, c2y, x, y);
                        if (blendingActive && blendStack.length) {
                            p.commands[p.commands.length - 1].deltas = {
                                c1x: blendX,
                                c1y: blendStack.shift(),
                                c2x: blendStack.shift(),
                                c2y: blendStack.shift(),
                                x: blendX,
                                y: (blendStack.length === 1 ? blendStack.shift() : 0),
                            };
                        }
                        if (stack.length === 0) {
                            break;
                        }

                        c1x = x + stack.shift();
                        c1y = y;
                        c2x = c1x + stack.shift();
                        c2y = c1y + stack.shift();
                        y = c2y + stack.shift();
                        x = c2x + (stack.length === 1 ? stack.shift() : 0);
                        p.curveTo(c1x, c1y, c2x, c2y, x, y);
                        if (blendingActive && blendStack.length) {
                            p.commands[p.commands.length - 1].deltas = {
                                c1x: blendStack.shift(),
                                c1y: blendY,
                                c2x: blendStack.shift(),
                                c2y: blendStack.shift(),
                                y: blendStack.shift(),
                                x: (blendStack.length === 1 ? blendStack.shift() : 0),
                            };
                        }
                    }

                    break;
                case 31: // hvcurveto
                    while (stack.length > 0) {
                        c1x = x + stack.shift();
                        c1y = y;
                        c2x = c1x + stack.shift();
                        c2y = c1y + stack.shift();
                        y = c2y + stack.shift();
                        x = c2x + (stack.length === 1 ? stack.shift() : 0);
                        p.curveTo(c1x, c1y, c2x, c2y, x, y);
                        if (blendingActive && blendStack.length) {
                            p.commands[p.commands.length - 1].deltas = {
                                c1x: blendStack.shift(),
                                c1y: blendY,
                                c2x: blendStack.shift(),
                                c2y: blendStack.shift(),
                                y: blendStack.shift(),
                                x: blendStack.shift(),
                            };
                        }
                        if (stack.length === 0) {
                            break;
                        }

                        c1x = x;
                        c1y = y + stack.shift();
                        c2x = c1x + stack.shift();
                        c2y = c1y + stack.shift();
                        x = c2x + stack.shift();
                        y = c2y + (stack.length === 1 ? stack.shift() : 0);
                        p.curveTo(c1x, c1y, c2x, c2y, x, y);
                        if (blendingActive && blendStack.length) {
                            p.commands[p.commands.length - 1].deltas = {
                                c1x: blendX,
                                c1y: blendStack.shift(),
                                c2x: blendStack.shift(),
                                c2y: blendStack.shift(),
                                x: blendStack.shift(),
                                y: blendStack.shift(),
                            };
                        }
                    }

                    break;
                default:
                    if (v < 32) {
                        // unknown operator
                        break;
                    } else if (v < 247) {
                        stack.push(v - 139);
                    } else if (v < 251) {
                        b1 = code[i];
                        i += 1;
                        stack.push((v - 247) * 256 + b1 + 108);
                    } else if (v < 255) {
                        b1 = code[i];
                        i += 1;
                        stack.push(-(v - 251) * 256 - b1 - 108);
                    } else {
                        b1 = code[i];
                        b2 = code[i + 1];
                        b3 = code[i + 2];
                        b4 = code[i + 3];
                        i += 4;
                        stack.push(((b1 << 24) | (b2 << 16) | (b3 << 8) | b4) / 65536);
                    }
                // default number push
            }
            if (blendingActive) {
                // Keep blendStack aligned with operand stack only while blending is active
                blendStack.length = stack.length;
            }
        }
    }

    parse(code);

    if (font.variation && coords) {
        // round the point values: we can't do that directly in the blend operator,
        // because that might run multiple times and rounding errors might accumulate
        p.commands = p.commands.map(c => {
            const keys = Object.keys(c);
            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                if (key[0] !== 'x' && key[0] !== 'y') continue;
                c[key] = Math.round(c[key]);
            }
            // clean up empty delta sets
            if (c.deltas && !Object.values(c.deltas).some(v => v !== null && v !== undefined)) {
                delete c.deltas;
            }
            return c;
        });
    }

    if (haveWidth) {
        glyph.advanceWidth = width;
    }


    // glyph only consists of (global) subroutines
    if (usedOps.filter(o => o === 10 || o === 29).length === glyphSubrs.filter(s => s !== null).length + glyphGSubrs.filter(s => s !== null).length) {
        glyph.subrs = glyphSubrs;
        glyph.gsubrs = glyphGSubrs;
    }

    return p;
}

function parseCFFFDSelect(data, start, nGlyphs, fdArrayCount, version) {
    const fdSelect = [];
    let fdIndex;
    const parser = new parse.Parser(data, start);
    const format = parser.parseCard8();
    if (format === 0) {
        // Simple list of nGlyphs elements
        for (let iGid = 0; iGid < nGlyphs; iGid++) {
            fdIndex = parser.parseCard8();
            if (fdIndex >= fdArrayCount) {
                throw new Error('CFF table CID Font FDSelect has bad FD index value ' + fdIndex + ' (FD count ' + fdArrayCount + ')');
            }
            fdSelect.push(fdIndex);
        }
    } else if (format === 3 || (version > 1 && format === 4)) {
        // Ranges
        const nRanges = format === 4 ? parser.parseULong() : parser.parseCard16();
        let first = format === 4 ? parser.parseULong() : parser.parseCard16();
        if (first !== 0) {
            throw new Error(`CFF Table CID Font FDSelect format ${format} range has bad initial GID ${first}`);
        }
        let next;
        for (let iRange = 0; iRange < nRanges; iRange++) {
            fdIndex = format === 4 ? parser.parseUShort() : parser.parseCard8();
            next = format === 4 ? parser.parseULong() : parser.parseCard16();
            if (fdIndex >= fdArrayCount) {
                throw new Error('CFF table CID Font FDSelect has bad FD index value ' + fdIndex + ' (FD count ' + fdArrayCount + ')');
            }
            if (next > nGlyphs) {
                throw new Error(`CFF Table CID Font FDSelect format ${version} range has bad GID ${next}`);
            }
            for (; first < next; first++) {
                fdSelect.push(fdIndex);
            }
            first = next;
        }
        if (next !== nGlyphs) {
            throw new Error('CFF Table CID Font FDSelect format 3 range has bad final (Sentinal) GID ' + next);
        }
    } else {
        throw new Error('CFF Table CID Font FDSelect table has unsupported format ' + format);
    }
    return fdSelect;
}

// Parse the `CFF` table, which contains the glyph outlines in PostScript format.
function parseCFFTable(data, start, font, opt) {
    /** @type {Record<string, unknown>} */
    let resultTable;
    const header = parseCFFHeader(data, start);
    if (header.formatMajor === 2) {
        resultTable = font.tables.cff2 = {};
    } else {
        resultTable = font.tables.cff = {};
    }
    const nameIndex = header.formatMajor > 1 ? null : parseCFFIndex(data, header.endOffset, parse.bytesToString);
    const topDictIndex = header.formatMajor > 1 ? null : parseCFFIndex(data, nameIndex.endOffset);
    const stringIndex = header.formatMajor > 1 ? null : parseCFFIndex(data, topDictIndex.endOffset, parse.bytesToString);
    const globalSubrIndex = parseCFFIndex(data, header.formatMajor > 1 ? start + header.size + header.topDictLength : stringIndex.endOffset, undefined, header.formatMajor);
    font.gsubrs = globalSubrIndex.objects;
    font.gsubrsBias = calcCFFSubroutineBias(font.gsubrs);

    let topDict;
    if (header.formatMajor > 1) {
        const topDictOffset = start + header.size;
        const topDictData = parse.getBytes(data, topDictOffset, topDictOffset + header.topDictLength);
        topDict = gatherCFFTopDicts(data, 0, [topDictData], undefined, header.formatMajor)[0];
    } else {
        const topDictArray = gatherCFFTopDicts(data, start, topDictIndex.objects, stringIndex.objects, header.formatMajor);
        if (topDictArray.length !== 1) {
            throw new Error('CFF table has too many fonts in \'FontSet\' - count of fonts NameIndex.length = ' + topDictArray.length);
        }

        topDict = topDictArray[0];
    }

    resultTable.topDict = topDict;

    if (topDict._privateDict) {
        const privateDict = /** @type {Record<string, unknown>} */ (topDict._privateDict);
        font.defaultWidthX = privateDict.defaultWidthX;
        font.nominalWidthX = privateDict.nominalWidthX;
    }

    if ((header.formatMajor < 2) && topDict.ros[0] !== undefined && topDict.ros[1] !== undefined) {
        font.isCIDFont = true;
    }

    if (header.formatMajor > 1) {
        let fdArrayIndexOffset = topDict.fdArray;
        let fdSelectOffset = topDict.fdSelect;
        if (!fdArrayIndexOffset) {
            throw new Error('This is a CFF2 font, but FDArray information is missing');
        }
        // Validate FDArray INDEX header bytes without logging
        try {
            const dumpStart = start + fdArrayIndexOffset;
            parse.getULong(data, dumpStart);
            parse.getByte(data, dumpStart + 4);
        } catch { /* ignore */ }
        const fdArrayIndex = parseCFFIndex(data, start + fdArrayIndexOffset, null, header.formatMajor);

        // @TODO: check if fdSelect is required (= there are multiple Font DICTs), otherwise ignore/skip
        const fdArray = gatherCFF2FontDicts(data, start, fdArrayIndex.objects);
        topDict._fdArray = fdArray;
        topDict.fdArray = fdArray;
        if (fdSelectOffset) {
            const sel = parseCFFFDSelect(data, start + fdSelectOffset, font.numGlyphs, fdArray.length, header.formatMajor);
            topDict._fdSelect = sel;
            topDict.fdSelect = sel;
        }

    } else if (font.isCIDFont) {
        let fdArrayOffset = topDict.fdArray;
        let fdSelectOffset = topDict.fdSelect;
        if (fdArrayOffset === 0 || fdSelectOffset === 0) {
            throw new Error('Font is marked as a CID font, but FDArray and/or FDSelect information is missing');
        }
        fdArrayOffset += start;
        const fdArrayIndex = parseCFFIndex(data, fdArrayOffset);
        const fdArray = gatherCFFTopDicts(data, start, fdArrayIndex.objects, stringIndex.objects, header.formatMajor);
        topDict._fdArray = fdArray;
        fdSelectOffset += start;
        topDict._fdSelect = parseCFFFDSelect(data, fdSelectOffset, font.numGlyphs, fdArray.length, header.formatMajor);
    }

    if (header.formatMajor < 2) {
        const privateDictOffset = start + topDict.private[1];
        const privateDict = parseCFFPrivateDict(data, privateDictOffset, topDict.private[0], stringIndex.objects, header.formatMajor);
        font.defaultWidthX = privateDict.defaultWidthX;
        font.nominalWidthX = privateDict.nominalWidthX;

        if (privateDict.subrs !== 0) {
            const subrOffset = privateDictOffset + privateDict.subrs;
            const subrIndex = parseCFFIndex(data, subrOffset);
            font.subrs = subrIndex.objects;
            font.subrsBias = calcCFFSubroutineBias(font.subrs);
        } else {
            font.subrs = [];
            font.subrsBias = 0;
        }
    }

    // Offsets in the top dict are relative to the beginning of the CFF data, so add the CFF start offset.
    let charStringsIndex;
    if (opt.lowMemory) {
        charStringsIndex = parseCFFIndexLowMemory(data, start + topDict.charStrings, header.formatMajor);
        font.nGlyphs = charStringsIndex.offsets.length - (header.formatMajor > 1 ? 1 : 0); // number of elements is count + 1
    } else {
        charStringsIndex = parseCFFIndex(data, start + topDict.charStrings, null, header.formatMajor);
        font.nGlyphs = charStringsIndex.objects.length;
    }

    if (header.formatMajor > 1 && font.tables.maxp && font.nGlyphs !== font.tables.maxp.numGlyphs) {
        console.error(`Glyph count in the CFF2 table (${font.nGlyphs}) must correspond to the glyph count in the maxp table (${font.tables.maxp.numGlyphs})`);
    }

    if (header.formatMajor < 2) {
        /** @type {unknown} */
        let charset = [];
        /** @type {unknown} */
        let encoding = [];

        if (topDict.charset === 0) {
            charset = cffISOAdobeStrings;
        } else if (topDict.charset === 1) {
            charset = cffIExpertStrings;
        } else if (topDict.charset === 2) {
            charset = cffExpertSubsetStrings;
        } else {
            charset = parseCFFCharset(data, start + topDict.charset, font.nGlyphs, stringIndex.objects, font.isCIDFont);
        }

        if (topDict.encoding === 0) {
            // Standard encoding
            encoding = cffStandardEncoding;
        } else if (topDict.encoding === 1) {
            // Expert encoding
            encoding = cffExpertEncoding;
        } else {
            encoding = parseCFFEncoding(data, start + /** @type {number} */ (topDict.encoding));
        }

        font.cffEncoding = new CffEncoding(/** @type {string} */ (/** @type {unknown} */ (encoding)), /** @type {Array} */ (/** @type {unknown} */ (charset)));

        // Prefer the CMAP encoding to the CFF encoding.
        font.encoding = font.encoding || font.cffEncoding;
    }

    font.glyphs = new glyphset.GlyphSet(font);
    if (opt.lowMemory) {
        font._push = function (i) {
            const charString = getCffIndexObject(i, charStringsIndex.offsets, data, start + /** @type {number} */ (topDict.charStrings), undefined, header.formatMajor);
            font.glyphs.push(i, glyphset.cffGlyphLoader(font, i, parseCFFCharstring, /** @type {string} */ (/** @type {unknown} */ (charString)), header.formatMajor));
        };
    } else {
        for (let i = 0; i < font.nGlyphs; i += 1) {
            const charString = charStringsIndex.objects[i];
            font.glyphs.push(i, glyphset.cffGlyphLoader(font, i, parseCFFCharstring, /** @type {string} */ (/** @type {unknown} */ (charString)), header.formatMajor));
        }
    }

    if (topDict.vstore) {
        const p = new parse.Parser(data, start + topDict.vstore);
        const vstore = p.parseVariationStore();
        // Keep the numeric varoffset in topDict.vstore; store parsed object in underscored key
        topDict._vstore = vstore;
    }
}

// Convert a string to a String ID (SID).
// The list of strings is modified in place.
function encodeString(s, strings) {
    let sid;

    // Is the string in the CFF standard strings?
    let i = cffStandardStrings.indexOf(s);
    if (i >= 0) {
        sid = i;
    }

    // Is the string already in the string index?
    i = strings.indexOf(s);
    if (i >= 0) {
        sid = i + cffStandardStrings.length;
    } else {
        sid = cffStandardStrings.length + strings.length;
        strings.push(s);
    }

    return sid;
}

/** @returns {import('../table.mjs').Table} */
function makeHeader(versionMajor) {
    // @TODO: if we have gvar data, we'll need to use the CFF2 format
    return new table.Record('Header', [
        { name: 'major', type: 'Card8', value: versionMajor },
        { name: 'minor', type: 'Card8', value: 0 },
        { name: 'hdrSize', type: 'Card8', value: versionMajor > 1 ? 5 : 4 },
        versionMajor > 1 ?
            { name: 'topDictLength', type: 'USHORT', value: 1 }
            :
            { name: 'offSize', type: 'Card8', value: 1 }
    ]);
}

function makeNameIndex(fontNames) {
    const t = new table.Record('Name INDEX', [
        { name: 'names', type: 'INDEX', value: [] }
    ]);
    const tRec = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (t));
    tRec.names = [];
    for (let i = 0; i < fontNames.length; i += 1) {
        /** @type {Array<{name: string, type: string, value: unknown}>} */ (tRec.names).push({ name: 'name_' + i, type: 'NAME', value: fontNames[i] });
    }

    return t;
}

// Given a dictionary's metadata, create a DICT structure.
function makeDict(meta, attrs, strings) {
    const m = {};
    for (let i = 0; i < meta.length; i += 1) {
        const entry = meta[i];
        let value = attrs[entry.name];
        const keepDefaults = attrs && attrs.__keepDefaults;
        const hasOwn = attrs && Object.prototype.hasOwnProperty.call(attrs, entry.name);
        // Skip undefined and null values - they can't be encoded in CFF DICTs
        if (value === undefined || value === null) continue;
        // For delta types, skip empty arrays or arrays with null values
        if (entry.type === 'delta') {
            if (!Array.isArray(value) || value.length === 0 || value.some(v => v === undefined || v === null)) {
                continue;
            }
        }
        // For array types (like fontBBox), check for invalid values and replace with defaults
        if (Array.isArray(value) && Array.isArray(entry.type)) {
            // Check if any value is undefined, null, NaN, or Infinity
            const hasInvalid = value.some(v => v === undefined || v === null || !Number.isFinite(v));
            if (hasInvalid) {
                // Replace with default value or skip
                if (entry.value !== undefined && entry.value !== null) {
                    value = entry.value;
                } else {
                    continue;
                }
            }
        }
        if (!equals(value, entry.value) || (keepDefaults && hasOwn)) {
            if (entry.type === 'SID') {
                value = encodeString(value, strings);
            }

            const blend = attrs._blends && attrs._blends[entry.name];

            if (blend && Array.isArray(blend)) {

                // Work on a copy to avoid mutating the source attrs object across passes
                if (!Array.isArray(value)) {
                    value = [value];
                } else {
                    value = value.slice();
                }
                const flat = blend.flat();
                for (let i = 0; i < flat.length; i++) {
                    value.push(flat[i]);
                }
            }

            m[entry.op] = { name: entry.name, type: entry.type, value: value };
            if (blend && Array.isArray(blend)) {
                m[entry.op].blend = blend.length;
            }
        }
    }

    return m;
}

// The Top DICT houses the global font attributes.
function makeTopDict(attrs, strings, version) {
    const t = new table.Record('Top DICT', [
        { name: 'dict', type: 'DICT', value: {} }
    ]);
    /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (t)).dict = makeDict(version > 1 ? TOP_DICT_META_CFF2 : TOP_DICT_META, attrs, strings);
    return t;
}

function makeTopDictIndex(topDict) {
    const t = new table.Record('Top DICT INDEX', [
        { name: 'topDicts', type: 'INDEX', value: [] }
    ]);
    /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (t)).topDicts = [{ name: 'topDict_0', type: 'TABLE', value: topDict }];
    return t;
}

function makeStringIndex(strings) {
    const t = new table.Record('String INDEX', [
        { name: 'strings', type: 'INDEX', value: [] }
    ]);
    const tRec = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (t));
    tRec.strings = [];
    for (let i = 0; i < strings.length; i += 1) {
        /** @type {Array<unknown>} */ (tRec.strings).push({ name: 'string_' + i, type: 'STRING', value: strings[i] });
    }

    return t;
}

/** @returns {import('../table.mjs').Table} */
function makeGlobalSubrIndex(version) {
    return new table.Record('Global Subr INDEX', [
        { name: 'subrs', type: version > 1 ? 'INDEX32' : 'INDEX', value: [] }
    ]);
}

function makeCharsets(glyphNames, strings) {
    const t = new table.Record('Charsets', [
        { name: 'format', type: 'Card8', value: 0 }
    ]);
    for (let i = 0; i < glyphNames.length; i += 1) {
        const glyphName = glyphNames[i];
        const glyphSID = encodeString(glyphName, strings);
        t.fields.push({ name: 'glyph_' + i, type: 'SID', value: glyphSID });
    }

    return t;
}

function glyphToOps(glyph, version, font) {
    // @TODO: write existing blend data if we already have a CFF2 font
    // @TODO: if we have a gvar table, we'll need to convert its data to CFF2 blend data
    const ops = [];
    const path = glyph.path;

    // @TODO: Right now we only make use of (global) sub routines if the whole glyph is made up of them
    // and they are already defined on the glyph. In the future we'll need an algorithm that finds
    // candidates for sub routines and extracts them from the glyphs, replacing the actual commands
    // 
    // IMPORTANT: Only use subroutine-based export if:
    // 1. The glyph has subrs AND gsubrs arrays of matching length
    // 2. The arrays have content (length > 0)
    // 3. The glyph has NO decoded path commands - if it does, prefer using those directly
    //    because the subroutines may not be preserved correctly during export
    const hasSubrs = glyph.subrs && glyph.gsubrs && 
                     glyph.subrs.length > 0 && 
                     glyph.subrs.length === glyph.gsubrs.length;
    const hasPathCommands = path && path.commands && path.commands.length > 0;
    
    // Prefer path commands over subroutine calls - subroutines may not survive roundtrip
    if (hasSubrs && !hasPathCommands) {
        const cffTable = font && font.tables && font.tables[version < 2 ? 'cff' : 'cff2'];
        if (!cffTable || !cffTable.topDict) return ops;
        const sel = cffTable.topDict._fdSelect || cffTable.topDict.fdSelect;
        const arr = cffTable.topDict._fdArray || cffTable.topDict.fdArray;
        const fdIndex = sel && sel[glyph.index] !== undefined ? sel[glyph.index] : 0;
        const fdDict = Array.isArray(arr) ? arr[fdIndex] : undefined;
        for (let i = 0; i < glyph.subrs.length; i++) {
            let v = glyph.subrs[i];
            let name = 'subr';
            let op = 10;
            if (v === null) {
                v = glyph.gsubrs[i];
                name = 'gsubr';
                op = 29;
                if (v === null) {
                    throw Error(`Inconsistend subr/gsubr values on glyph ${glyph.index}`);
                }
                v -= font.gsubrsBias;
            } else {
                const bias = fdDict && typeof fdDict._subrsBias === 'number' ? fdDict._subrsBias : 0;
                v -= bias;
            }
            ops.push({ name: `${name}Index`, type: 'NUMBER', value: v });
            ops.push({ name, type: 'OP', value: op });
        }
        return ops;
    }

    if (version < 2) {
        ops.push({ name: 'width', type: 'NUMBER', value: glyph.advanceWidth });
    }
    let x = 0;
    let y = 0;

    for (let i = 0; i < path.commands.length; i += 1) {
        let dx;
        let dy;
        let cmd = path.commands[i];
        if (cmd.type === 'Q') {
            // CFF only supports bézier curves, so convert the quad to a bézier.
            const _13 = 1 / 3;
            const _23 = 2 / 3;

            // We're going to create a new command so we don't change the original path.
            // Since all coordinates are relative, we round() them ASAP to avoid propagating errors.
            cmd = {
                type: 'C',
                x: cmd.x,
                y: cmd.y,
                x1: Math.round(_13 * x + _23 * cmd.x1),
                y1: Math.round(_13 * y + _23 * cmd.y1),
                x2: Math.round(_13 * cmd.x + _23 * cmd.x1),
                y2: Math.round(_13 * cmd.y + _23 * cmd.y1)
            };
        }

        if (cmd.type === 'M') {
            dx = Math.round(cmd.x - x);
            dy = Math.round(cmd.y - y);

            ops.push({ name: 'dx', type: 'NUMBER', value: dx });
            ops.push({ name: 'dy', type: 'NUMBER', value: dy });
            if (version > 1 && cmd.deltas) {
                const deltas = cmd.deltas;
                let setCount = 0;
                if (deltas.x) {
                    setCount++;
                    // @TODO: check that delta count equals axis count in fvar
                    for (let n = 0; n < deltas.x[1].length; n++) {
                        ops.push({ name: 'blendX', type: 'NUMBER', value: deltas.x[1][n] });
                    }
                }
                if (deltas.y) {
                    setCount++;
                    // ops.push({name: 'blendY', type: 'NUMBER', value: deltas.y[0]});
                    for (let n = 0; n < deltas.y[1].length; n++) {
                        ops.push({ name: 'blendX', type: 'NUMBER', value: deltas.y[1][n] });
                    }
                }
                ops.push({ name: 'blendX', type: 'NUMBER', value: setCount });
                ops.push({ name: 'blend', type: 'OP', value: 16 });
            }
            ops.push({ name: 'rmoveto', type: 'OP', value: 21 });
            x = Math.round(cmd.x);
            y = Math.round(cmd.y);
        } else if (cmd.type === 'L') {
            dx = Math.round(cmd.x - x);
            dy = Math.round(cmd.y - y);
            ops.push({ name: 'dx', type: 'NUMBER', value: dx });
            ops.push({ name: 'dy', type: 'NUMBER', value: dy });
            if (version > 1 && cmd.deltas) {
                const deltas = cmd.deltas;
                let setCount = 0;
                if (deltas.x) {
                    setCount++;
                    for (let n = 0; n < deltas.x[1].length; n++) {
                        ops.push({ name: 'blendX', type: 'NUMBER', value: deltas.x[1][n] });
                    }
                }
                if (deltas.y) {
                    setCount++;
                    for (let n = 0; n < deltas.y[1].length; n++) {
                        ops.push({ name: 'blendY', type: 'NUMBER', value: deltas.y[1][n] });
                    }
                }
                ops.push({ name: 'blendCount', type: 'NUMBER', value: setCount });
                ops.push({ name: 'blend', type: 'OP', value: 16 });
            }
            ops.push({ name: 'rlineto', type: 'OP', value: 5 });
            x = Math.round(cmd.x);
            y = Math.round(cmd.y);
        } else if (cmd.type === 'C') {
            const dx1 = Math.round(cmd.x1 - x);
            const dy1 = Math.round(cmd.y1 - y);
            const dx2 = Math.round(cmd.x2 - cmd.x1);
            const dy2 = Math.round(cmd.y2 - cmd.y1);
            dx = Math.round(cmd.x - cmd.x2);
            dy = Math.round(cmd.y - cmd.y2);
            ops.push({ name: 'dx1', type: 'NUMBER', value: dx1 });
            ops.push({ name: 'dy1', type: 'NUMBER', value: dy1 });
            ops.push({ name: 'dx2', type: 'NUMBER', value: dx2 });
            ops.push({ name: 'dy2', type: 'NUMBER', value: dy2 });
            ops.push({ name: 'dx', type: 'NUMBER', value: dx });
            ops.push({ name: 'dy', type: 'NUMBER', value: dy });
            if (version > 1 && cmd.deltas) {
                const deltas = cmd.deltas;
                let setCount = 0;
                // Curve commands have 6 values: dx1, dy1, dx2, dy2, dx, dy
                // We need to write deltas for all of them
                if (deltas.c1x) {
                    setCount++;
                    for (let n = 0; n < deltas.c1x[1].length; n++) {
                        ops.push({ name: 'blendC1x', type: 'NUMBER', value: deltas.c1x[1][n] });
                    }
                }
                if (deltas.c1y) {
                    setCount++;
                    for (let n = 0; n < deltas.c1y[1].length; n++) {
                        ops.push({ name: 'blendC1y', type: 'NUMBER', value: deltas.c1y[1][n] });
                    }
                }
                if (deltas.c2x) {
                    setCount++;
                    for (let n = 0; n < deltas.c2x[1].length; n++) {
                        ops.push({ name: 'blendC2x', type: 'NUMBER', value: deltas.c2x[1][n] });
                    }
                }
                if (deltas.c2y) {
                    setCount++;
                    for (let n = 0; n < deltas.c2y[1].length; n++) {
                        ops.push({ name: 'blendC2y', type: 'NUMBER', value: deltas.c2y[1][n] });
                    }
                }
                if (deltas.x) {
                    setCount++;
                    for (let n = 0; n < deltas.x[1].length; n++) {
                        ops.push({ name: 'blendX', type: 'NUMBER', value: deltas.x[1][n] });
                    }
                }
                if (deltas.y) {
                    setCount++;
                    for (let n = 0; n < deltas.y[1].length; n++) {
                        ops.push({ name: 'blendY', type: 'NUMBER', value: deltas.y[1][n] });
                    }
                }
                ops.push({ name: 'blendCount', type: 'NUMBER', value: setCount });
                ops.push({ name: 'blend', type: 'OP', value: 16 });
            }
            ops.push({ name: 'rrcurveto', type: 'OP', value: 8 });
            x = Math.round(cmd.x);
            y = Math.round(cmd.y);
        }

        // Contours are closed automatically.
    }

    if (version < 2) {
        ops.push({ name: 'endchar', type: 'OP', value: 14 });
    }
    return ops;
}

function makeCharStringsIndex(glyphs, version) {
    const t = new table.Record('CharStrings INDEX', [
        { name: 'charStrings', type: version > 1 ? 'INDEX32' : 'INDEX', value: [] }
    ]);
    const tRec = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (t));

    for (let i = 0; i < glyphs.length; i += 1) {
        const glyph = glyphs.get(i);
        if (!glyph) continue;
        const ops = glyphToOps(glyph, version, glyphs.font) || [];
        /** @type {Array<unknown>} */ (tRec.charStrings).push({ name: glyph.name || ('glyph_' + i), type: 'CHARSTRING', value: ops });
    }

    return t;
}

function makeFontDictIndex(fontDicts) {
    const t = new table.Record('Font DICT INDEX', [
        { name: 'fontDicts', type: 'INDEX32', value: [] }
    ]);
    const tRec = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (t));
    tRec.fontDicts = [];
    for (let i = 0; i < fontDicts.length; i++) {
        /** @type {Array<unknown>} */ (tRec.fontDicts).push({ name: `fontDict_${i}`, type: 'TABLE', value: fontDicts[i] });
    }
    return t;
}

function makeFontDict(attrs, strings) {
    const t = new table.Record('Font DICT', [
        { name: 'dict', type: 'DICT', value: {} }
    ]);
    /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (t)).dict = makeDict(FONT_DICT_META, attrs, strings);
    return t;
}

function makePrivateDict(attrs, strings, version) {
    const t = new table.Record('Private DICT', [
        { name: 'dict', type: 'DICT', value: {} }
    ]);
    /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (t)).dict = makeDict(version > 1 ? PRIVATE_DICT_META_CFF2 : PRIVATE_DICT_META, attrs, strings);
    return t;
}

function makeCFFTable(glyphs, options, version) {
    const font = glyphs.font;
    const cffVersion = version || 1;
    const cffTable = font.tables[cffVersion > 1 ? 'cff2' : 'cff'];

    const tableFields = cffVersion < 2 ? [
        { name: 'header', type: 'RECORD' },
        { name: 'nameIndex', type: 'RECORD' },
        { name: 'topDictIndex', type: 'RECORD' },
        { name: 'stringIndex', type: 'RECORD' },
        { name: 'globalSubrIndex', type: 'RECORD' },
        { name: 'charsets', type: 'RECORD' },
        { name: 'charStringsIndex', type: 'RECORD' },
        { name: 'privateDict', type: 'RECORD' }
    ] : [
        { name: 'header', type: 'RECORD' },
        { name: 'topDict', type: 'RECORD' },
        { name: 'globalSubrIndex', type: 'RECORD' },
    ];


    const t = /** @type {CffRuntimeTable} */ (new table.Table(cffVersion > 1 ? 'CFF2' : 'CFF ', tableFields));

    const fontScale = 1 / options.unitsPerEm;
    // We use non-zero values for the offsets so that the DICT encodes them.
    // This is important because the size of the Top DICT plays a role in offset calculation,
    // and the size shouldn't change after we've written correct offsets.
    const attrs = cffVersion < 2 ? {
        version: options.version,
        fullName: options.fullName,
        familyName: options.familyName,
        weight: options.weightName,
        fontBBox: options.fontBBox || [0, 0, 0, 0],
        fontMatrix: [fontScale, 0, 0, fontScale, 0, 0],
        charset: 999,
        encoding: 0,
        charStrings: 999,
        private: [0, 999]
    } : {
        // CFF2: These are placeholder offsets computed during table serialization
        fdArray: 68,
        charStrings: 56,
    };

    const topDictOptions = options && options.topDict || {};

    if (cffVersion < 2 && topDictOptions.paintType) {
        attrs.paintType = topDictOptions.paintType;
        attrs.strokeWidth = topDictOptions.strokeWidth || 0;
    }

    const privateAttrs = {};

    const glyphNames = [];
    if (cffVersion < 2) {
        let glyph;

        // Skip first glyph (.notdef)
        for (let i = 1; i < glyphs.length; i += 1) {
            glyph = glyphs.get(i);
            glyphNames.push(glyph.name);
        }
    }

    const strings = [];
    const vstore = cffTable && cffTable.topDict && cffTable.topDict._vstore;
    // @TODO: If we have a gvar table, make a vstore for the output font

    t.header = makeHeader(cffVersion);
    if (cffVersion < 2) {
        t.nameIndex = makeNameIndex([options.postScriptName]);
    } else {
        if (vstore) {
            // CFF2: Placeholder offset computed during serialization
            attrs.vstore = 16;
        }
    }
    let topDict = makeTopDict(attrs, strings, cffVersion);
    if (cffVersion < 2) {
        t.topDictIndex = makeTopDictIndex(topDict);
    } else {
        t.topDict = topDict;
    }
    t.globalSubrIndex = makeGlobalSubrIndex(cffVersion);
    if (font.gsubrs && font.gsubrs.length) {
        t.globalSubrIndex.subrs = font.gsubrs.map((bytes, i) => ({ name: `gsubr_${i}`, type: 'LITERAL', value: bytes }));
    }
    t.charStringsIndex = makeCharStringsIndex(glyphs, cffVersion);
    if (cffVersion < 2) {
        t.charsets = makeCharsets(glyphNames, strings);
        t.privateDict = makePrivateDict(privateAttrs, strings);

        // Needs to come at the end, to encode all custom strings used in the font.
        t.stringIndex = makeStringIndex(strings);

        const startOffset = t.header.sizeOf() +
            (cffVersion < 2 ?
                t.nameIndex.sizeOf() +
                t.topDictIndex.sizeOf() +
                t.stringIndex.sizeOf()
                : 0) +
            t.globalSubrIndex.sizeOf();

        attrs.charset = startOffset;

        // We use the CFF standard encoding; proper encoding will be handled in cmap.
        attrs.encoding = 0;
        attrs.charStrings = attrs.charset + t.charsets.sizeOf();
        attrs.private[1] = attrs.charStrings + t.charStringsIndex.sizeOf();

        // Recreate the Top DICT INDEX with the correct offsets.
        topDict = makeTopDict(attrs, strings);
        t.topDictIndex = makeTopDictIndex(topDict);
    }

    t.header.topDictLength = t.header.fields[3].value = topDict.sizeOf();

    if (cffVersion > 1) {
        // Optional VariationStore (emit before CharStrings per expected fixture ordering)
        if (vstore) {
            t.fields.push({ name: 'VariationStore', type: 'RECORD' });
            // CFF2 VariationStore is length-prefixed; wrap the ItemVariationStore
            t.VariationStore = make.VariationStore(vstore.itemVariationStore, font.tables.fvar);
        }
        // CharStrings INDEX must be present in CFF2
        t.fields.push({ name: 'charStringsIndex', type: 'RECORD' });

        // Build FDArray from existing parsed CFF2 (preferred) or fallback to single empty dict
        t.fields.push({ name: 'fontDictIndex', type: 'RECORD' });
        const hasFDArray = cffTable && (Array.isArray(cffTable.topDict.fdArray) || Array.isArray(cffTable.topDict._fdArray));
        const fdArraySource = hasFDArray ? (cffTable.topDict.fdArray || cffTable.topDict._fdArray) : null;
        const fdCount = hasFDArray ? fdArraySource.length : 1;
        const encodeFontDicts = [];
        const privateTables = [];
        const localSubrIndexes = [];

        if (hasFDArray) {
            for (let i = 0; i < fdCount; i++) {
                const fd = fdArraySource[i];
                const privAttrs = Object.assign({}, fd._privateDict || {});
                privateTables.push(makePrivateDict(privAttrs, strings, 2));
                if (fd._subrs && fd._subrs.length) {
                    const idx = new table.Record('Local Subr INDEX', [{ name: 'subrs', type: 'INDEX32', value: [] }]);
                    /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (idx)).subrs = fd._subrs.map((bytes, j) => ({ name: `subr_${i}_${j}`, type: 'LITERAL', value: bytes }));
                    localSubrIndexes.push(idx);
                } else {
                    localSubrIndexes.push(null);
                }
                encodeFontDicts.push(makeFontDict({ private: [0, 0] }));
            }
        } else {
            privateTables.push(makePrivateDict({}, strings, 2));
            localSubrIndexes.push(null);
            encodeFontDicts.push(makeFontDict({ private: [0, 0] }));
        }

        t.fontDictIndex = makeFontDictIndex(encodeFontDicts);

        // Optionally FDSelect if more than one FD
        if (fdCount > 1) {
            t.fields.push({ name: 'fdSelect', type: 'RECORD' });
        }

        // Helper to compute FDSelect bytes
        const computeFdSelectBytes = () => {
            if (fdCount <= 1) return null;
            const nGlyphs = glyphs.length;
            const use32 = nGlyphs > 65535;
            const fdSel = cffTable.topDict._fdSelect || cffTable.topDict.fdSelect;
            let mapping = fdSel;
            if (!mapping || mapping.length !== nGlyphs) mapping = new Array(nGlyphs).fill(0);
            // Build ranges
            const ranges = [];
            let currentFd = mapping[0];
            for (let gid = 1; gid < nGlyphs; gid++) {
                if (mapping[gid] !== currentFd) { ranges.push({ fd: currentFd, last: gid }); currentFd = mapping[gid]; }
            }
            ranges.push({ fd: currentFd, last: nGlyphs });
            // Encode
            const b = [];
            b.push(use32 ? 4 : 3);
            if (use32) {
                const writeULong = (v) => { b.push((v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF); };
                const writeUShort = (v) => { b.push((v >>> 8) & 0xFF, v & 0xFF); };
                writeULong(ranges.length);
                writeULong(0);
                for (let r = 0; r < ranges.length; r++) { writeUShort(ranges[r].fd); writeULong(ranges[r].last); }
            } else {
                const writeUShort = (v) => { b.push((v >>> 8) & 0xFF, v & 0xFF); };
                b.push((ranges.length >>> 8) & 0xFF, ranges.length & 0xFF);
                writeUShort(0);
                for (let r = 0; r < ranges.length; r++) { b.push(ranges[r].fd & 0xFF); writeUShort(ranges[r].last); }
            }
            return b;
        };

        const layoutPass = () => {
            const headerSize = t.header.sizeOf();
            let current = headerSize + t.topDict.sizeOf() + t.globalSubrIndex.sizeOf();
            // VariationStore immediately after Top DICT and globals when present
            if (vstore) { attrs.vstore = current; current += t.VariationStore.sizeOf(); }
            // CharStrings after VariationStore (or directly after globals if no vstore)
            attrs.charStrings = current; current += t.charStringsIndex.sizeOf();
            attrs.fdArray = current; current += t.fontDictIndex.sizeOf();
            const fdSelectBytes = computeFdSelectBytes();
            if (fdSelectBytes) { attrs.fdSelect = current; current += fdSelectBytes.length; t.fdSelect = new table.Record('FDSelect', [{ name: 'raw', type: 'LITERAL', value: fdSelectBytes }]); }
            const privateOffsets = new Array(fdCount).fill(0);
            const privateSizes = new Array(fdCount).fill(0);
            // Compute Private DICT sizes and offsets. If Local Subrs exist, the 'subrs' value
            // must equal the FINAL Private DICT size (including the 'subrs' operator itself).
            for (let i = 0; i < fdCount; i++) {
                // Build base attributes fresh each pass, without any 'subrs'
                const baseAttrs = Object.assign({}, (hasFDArray && fdArraySource && fdArraySource[i] && fdArraySource[i]._privateDict) || {});
                // Ensure we keep defaults when writing CFF2 Private DICT
                Object.defineProperty(baseAttrs, '__keepDefaults', { value: true, enumerable: false });
                if (Object.prototype.hasOwnProperty.call(baseAttrs, 'subrs')) delete baseAttrs.subrs;
                // Do not carry parsed blend metadata into writing unless explicitly requested
                if (Object.prototype.hasOwnProperty.call(baseAttrs, '_blends')) delete baseAttrs._blends;

                let priv;
                let s;
                if (localSubrIndexes[i]) {
                    // Stabilize: iteratively compute self-referential size for 'subrs' operand
                    const basePriv = makePrivateDict(baseAttrs, strings, 2);
                    s = basePriv.sizeOf();
                    let prev;
                    let attempts = 0;
                    do {
                        prev = s;
                        const withSubrs = Object.assign({}, baseAttrs, { subrs: prev });
                        // Preserve intent to keep default-valued ops when re-encoding
                        Object.defineProperty(withSubrs, '__keepDefaults', { value: true, enumerable: false });
                        priv = makePrivateDict(withSubrs, strings, 2);
                        s = priv.sizeOf();
                        try { /* encode for size check */ table.make(priv).encode(); } catch { /* ignore */ }
                        attempts++;
                    } while (s !== prev && attempts < 10);
                    // Ensure the encoded 'subrs' equals the final size 's'
                    const finalWithSubrs = Object.assign({}, baseAttrs, { subrs: s });
                    // Preserve default-valued ops in final encoding as well
                    Object.defineProperty(finalWithSubrs, '__keepDefaults', { value: true, enumerable: false });
                    const finalPriv = makePrivateDict(finalWithSubrs, strings, 2);
                    const finalSize = finalPriv.sizeOf();
                    priv = finalPriv;
                    s = finalSize;
                } else {
                    // No Local Subrs emitted: ensure 'subrs' is omitted from Private DICT
                    priv = makePrivateDict(baseAttrs, strings, 2);
                    s = priv.sizeOf();
                }
                privateTables[i] = priv;
                privateOffsets[i] = current;
                privateSizes[i] = s;
                try { /* ensure encodable */ table.make(priv).encode(); } catch { /* ignore */ }
                current += s;
                // Account for Local Subrs INDEX bytes after the Private DICT
                if (localSubrIndexes[i]) {
                    current += localSubrIndexes[i].sizeOf();
                }
            }
            
            // Update Font DICTs with final [size, offset]
            for (let i = 0; i < fdCount; i++) {
                t.fontDictIndex.fontDicts[i].value = makeFontDict({ private: [privateSizes[i], privateOffsets[i]] });
                try { /* ensure encodable */ table.make(t.fontDictIndex.fontDicts[i].value).encode(); } catch { /* ignore */ }
            }
            // Rebuild Top DICT with updated offsets and update header length
            t.topDict = makeTopDict(attrs, strings, cffVersion);
            t.header.topDictLength = t.header.fields[3].value = t.topDict.sizeOf();
        };

        // Run layout passes until offsets/sizes stabilize (fixed point)
        {
            let prevSignature = '';
            let iter = 0;
            while (iter < 10) {
                layoutPass();
                // Build a signature of the key layout characteristics
                const privSizesSig = encodeURIComponent((t.fontDictIndex && t.fontDictIndex.fontDicts || []).map((fd, i) => {
                    const rec = t[`privateDict_${i}`] || privateTables[i];
                    return rec ? rec.sizeOf() : 0;
                }).join(','));
                const sig = [attrs.vstore, attrs.charStrings, attrs.fdArray, attrs.fdSelect || 0, t.topDict.sizeOf(), t.fontDictIndex.sizeOf(), privSizesSig].join('|');
                if (sig === prevSignature) break;
                prevSignature = sig;
                iter++;
            }
        }

        

        // Append Private DICTs and Local Subrs
        for (let i = 0; i < fdCount; i++) {
            t.fields.push({ name: `privateDict_${i}`, type: 'RECORD' });
            t[`privateDict_${i}`] = privateTables[i];
            if (localSubrIndexes[i]) {
                t.fields.push({ name: `localSubrIndex_${i}`, type: 'RECORD' });
                t[`localSubrIndex_${i}`] = localSubrIndexes[i];
            }
        }
    }

    return t;
}

export default { parse: parseCFFTable, make: makeCFFTable };
export { applyPaintType };
