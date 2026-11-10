// Data types used in the OpenType font file.
// All OpenType fonts use Motorola-style byte ordering (Big Endian)

import check from './check.mjs';

const LIMIT16 = 32768; // The limit at which a 16-bit number switches signs == 2^15
const LIMIT32 = 2147483648; // The limit at which a 32-bit number switches signs == 2 ^ 31

const MIN_16_16 = -(1 << 15); // lower limit for floats in 16.16 representation
const MAX_16_16 = (1 << 15) - 1 + (1 / (1 << 16)); // upper limit for floats in 16.16 representation

/**
 * @exports opentype.decode
 * @class
 */
const decode = {};
/**
 * @exports opentype.encode
 * @class
 */
const encode = {};
/**
 * @exports opentype.sizeOf
 * @class
 */
const sizeOf = {};

// Return a function that always returns the same value.
function constant(v) {
    return function() {
        return v;
    };
}

// OpenType data types //////////////////////////////////////////////////////
/**
 * Convert an 8-bit unsigned integer to a list of 1 byte.
 * @param {number} v
 * @returns {Array}
 */
encode.BYTE = function(v) {
    check.argument(v >= 0 && v <= 255, 'Byte value should be between 0 and 255.');
    return [v];
};
/**
 * @constant
 * @type {function(): number}
 */
sizeOf.BYTE = constant(1);

/**
 * Convert a 8-bit signed integer to a list of 1 byte.
 * @param {string} v
 * @returns {Array}
 */
encode.CHAR = function(v) {
    return [v.charCodeAt(0)];
};

/**
 * @constant
 * @type {function(): number}
 */
sizeOf.CHAR = constant(1);

/**
 * Convert an ASCII string to a list of bytes.
 * @param {string} v
 * @returns {Array}
 */
encode.CHARARRAY = function(v) {
    if (v === null || typeof v === 'undefined') {
        v = '';
        console.warn('CHARARRAY with undefined or null value encountered and treated as an empty string. This is probably caused by a missing glyph name.');
    }
    const b = [];
    for (let i = 0; i < v.length; i += 1) {
        b[i] = v.charCodeAt(i);
    }

    return b;
};

/**
 * @param {Array} v
 * @returns {number}
 */
sizeOf.CHARARRAY = function(v) {
    if (typeof v === 'undefined') {
        return 0;
    }
    return v.length;
};

/**
 * Convert a 16-bit unsigned integer to a list of 2 bytes.
 * @param {number} v
 * @returns {Array}
 */
encode.USHORT = function(v) {
    return [(v >> 8) & 0xFF, v & 0xFF];
};

/**
 * @constant
 * @type {function(): number}
 */
sizeOf.USHORT = constant(2);

/**
 * Convert a 16-bit signed integer to a list of 2 bytes.
 * @param {number} v
 * @returns {Array}
 */
encode.SHORT = function(v) {
    // Two's complement
    if (v >= LIMIT16) {
        v = -(2 * LIMIT16 - v);
    }

    return [(v >> 8) & 0xFF, v & 0xFF];
};

/**
 * @constant
 * @type {function(): number}
 */
sizeOf.SHORT = constant(2);

/**
 * Convert a 24-bit unsigned integer to a list of 3 bytes.
 * @param {number} v
 * @returns {Array}
 */
encode.UINT24 = function(v) {
    return [(v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF];
};

/**
 * @constant
 * @type {function(): number}
 */
sizeOf.UINT24 = constant(3);

/**
 * Convert a 32-bit unsigned integer to a list of 4 bytes.
 * @param {number} v
 * @returns {Array}
 */
encode.ULONG = function(v) {
    return [(v >> 24) & 0xFF, (v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF];
};

/**
 * @constant
 * @type {function(): number}
 */
sizeOf.ULONG = constant(4);

/**
 * Convert a 32-bit unsigned integer to a list of 4 bytes.
 * @param {number} v
 * @returns {Array}
 */
encode.LONG = function(v) {
    // Two's complement
    if (v >= LIMIT32) {
        v = -(2 * LIMIT32 - v);
    }

    return [(v >> 24) & 0xFF, (v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF];
};

/**
 * @constant
 * @type {function(): number}
 */
sizeOf.LONG = constant(4);

/**
 * Convert a 64-bit JavaScript float to a 32-bit signed fixed-point number (16.16)
 */
encode.FLOAT = function(v) {
    if (v > MAX_16_16 || v < MIN_16_16) {
        throw new Error(`Value ${v} is outside the range of representable values in 16.16 format`);
    }
    const fixedValue = Math.round(v * (1 << 16)) << 0; // Round to nearest multiple of 1/(1<<16)
    return encode.ULONG(fixedValue);
};
sizeOf.FLOAT = sizeOf.ULONG;

encode.FIXED = encode.ULONG;
sizeOf.FIXED = sizeOf.ULONG;

encode.FWORD = encode.SHORT;
sizeOf.FWORD = sizeOf.SHORT;

encode.UFWORD = encode.USHORT;
sizeOf.UFWORD = sizeOf.USHORT;

encode.F2DOT14 = function(v) {
    // Nearest 2.14 value; truncating moved 0.4 to 0.39996 and -0.4 to -0.39996.
    const scaled = Math.round(v * 16384);
    check.argument(scaled >= -32768 && scaled <= 32767, 'F2DOT14 value ' + v + ' is outside [-2, 2).');
    return encode.SHORT(scaled);
};
sizeOf.F2DOT14 = sizeOf.USHORT;

/**
 * Convert a 32-bit Apple Mac timestamp integer to a list of 8 bytes, 64-bit timestamp.
 * @param {number} v
 * @returns {Array}
 */
encode.LONGDATETIME = function(v) {
    // FIXME: at some point we need to support dates >2038 using the full 64bit
    return [0, 0, 0, 0, (v >> 24) & 0xFF, (v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF];
};

/**
 * @constant
 * @type {function(): number}
 */
sizeOf.LONGDATETIME = constant(8);

/**
 * Convert a 4-char tag to a list of 4 bytes.
 * @param {string} v
 * @returns {Array}
 */
encode.TAG = function(v) {
    check.argument(v.length === 4, 'Tag should be exactly 4 ASCII characters.');
    return [v.charCodeAt(0),
        v.charCodeAt(1),
        v.charCodeAt(2),
        v.charCodeAt(3)];
};

/**
 * @constant
 * @type {function(): number}
 */
sizeOf.TAG = constant(4);

// CFF data types ///////////////////////////////////////////////////////////

encode.Card8 = encode.BYTE;
sizeOf.Card8 = sizeOf.BYTE;

encode.Card16 = encode.USHORT;
sizeOf.Card16 = sizeOf.USHORT;

encode.OffSize = encode.BYTE;
sizeOf.OffSize = sizeOf.BYTE;

encode.SID = encode.USHORT;
sizeOf.SID = sizeOf.USHORT;

// Convert a numeric operand or charstring number to a variable-size list of bytes.
/**
 * Convert a numeric operand or charstring number to a variable-size list of bytes.
 * @param {number} v
 * @returns {Array}
 */
encode.NUMBER = function(v) {
    if (v >= -107 && v <= 107) {
        return [v + 139];
    } else if (v >= 108 && v <= 1131) {
        v = v - 108;
        return [(v >> 8) + 247, v & 0xFF];
    } else if (v >= -1131 && v <= -108) {
        v = -v - 108;
        return [(v >> 8) + 251, v & 0xFF];
    } else if (v >= -32768 && v <= 32767) {
        return encode.NUMBER16(v);
    } else {
        return encode.NUMBER32(v);
    }
};

/**
 * @param {number} v
 * @returns {number}
 */
sizeOf.NUMBER = function(v) {
    return encode.NUMBER(v).length;
};

/**
 * Convert a signed number between -32768 and +32767 to a three-byte value.
 * This ensures we always use three bytes, but is not the most compact format.
 * @param {number} v
 * @returns {Array}
 */
encode.NUMBER16 = function(v) {
    return [28, (v >> 8) & 0xFF, v & 0xFF];
};

/**
 * @constant
 * @type {function(): number}
 */
sizeOf.NUMBER16 = constant(3);

/**
 * Convert a signed number between -(2^31) and +(2^31-1) to a five-byte value.
 * This is useful if you want to be sure you always use four bytes,
 * at the expense of wasting a few bytes for smaller numbers.
 * @param {number} v
 * @returns {Array}
 */
encode.NUMBER32 = function(v) {
    return [29, (v >> 24) & 0xFF, (v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF];
};

/**
 * @constant
 * @type {function(): number}
 */
sizeOf.NUMBER32 = constant(5);

/**
 * @param {number} v
 * @returns {Array}
 */
encode.REAL = function(v) {
    let value = v.toString();

    // Normalize numbers with epsilon notation (e.g., 1e-7) to fixed form when possible
    const m = /\.(\d*?)(?:9{5,20}|0{5,20})\d{0,2}(?:e(.+)|$)/.exec(value);
    if (m) {
        const epsilon = parseFloat('1e' + ((m[2] ? +m[2] : 0) + m[1].length));
        value = (Math.round(v * epsilon) / epsilon).toString();
    }

    let nibbles = '';
    let hasDigit = false;
    let seenDot = false;
    for (let i = 0, ii = value.length; i < ii; i += 1) {
        const c = value[i];
        if (c === 'e' || c === 'E') {
            nibbles += (value[i + 1] === '-') ? 'c' : 'b';
            i += (value[i + 1] === '-' || value[i + 1] === '+') ? 1 : 0;
            hasDigit = true;
        } else if (c === '.') {
            // If dot appears before any digit, insert a leading zero nibble
            if (!hasDigit) nibbles += '0';
            nibbles += 'a';
            seenDot = true;
        } else if (c === '-') {
            nibbles += 'e';
        } else if (c >= '0' && c <= '9') {
            // Keep leading zeros after a decimal point; otherwise skip until a non-zero digit
            if (hasDigit || c !== '0' || seenDot) {
                nibbles += c;
                if (c !== '0' || !seenDot) hasDigit = true;
            }
        }
    }

    // If we didn't emit any digit (e.g., value was 0), emit a single zero digit.
    if (nibbles.length === 0) {
        nibbles = '0';
        hasDigit = true; // for completeness
    }

    // Terminator nibble: append 'f' if odd length, else 'ff'.
    nibbles += (nibbles.length & 1) ? 'f' : 'ff';
    const out = [30];
    for (let i = 0, ii = nibbles.length; i < ii; i += 2) {
        out.push(parseInt(nibbles.substr(i, 2), 16));
    }
    return out;
};

/**
 * @param {number} v
 * @returns {number}
 */
sizeOf.REAL = function(v) {
    return encode.REAL(v).length;
};

encode.NAME = encode.CHARARRAY;
sizeOf.NAME = sizeOf.CHARARRAY;

encode.STRING = encode.CHARARRAY;
sizeOf.STRING = sizeOf.CHARARRAY;

/**
 * @param {DataView} data
 * @param {number} offset
 * @param {number} numBytes
 * @returns {string}
 */
decode.UTF8 = function(data, offset, numBytes) {
    const codePoints = [];
    const numChars = numBytes;
    for (let j = 0; j < numChars; j++, offset += 1) {
        codePoints[j] = data.getUint8(offset);
    }

    return String.fromCharCode.apply(null, codePoints);
};

/**
 * @param {DataView} data
 * @param {number} offset
 * @param {number} numBytes
 * @returns {string}
 */
decode.UTF16 = function(data, offset, numBytes) {
    const codePoints = [];
    const numChars = numBytes / 2;
    for (let j = 0; j < numChars; j++, offset += 2) {
        codePoints[j] = data.getUint16(offset);
    }

    return String.fromCharCode.apply(null, codePoints);
};

/**
 * Convert a JavaScript string to UTF16-BE.
 * @param {string} v
 * @returns {Array}
 */
encode.UTF16 = function(v) {
    const b = [];
    for (let i = 0; i < v.length; i += 1) {
        const codepoint = v.charCodeAt(i);
        b[b.length] = (codepoint >> 8) & 0xFF;
        b[b.length] = codepoint & 0xFF;
    }

    return b;
};

/**
 * @param {string} v
 * @returns {number}
 */
sizeOf.UTF16 = function(v) {
    return v.length * 2;
};

// Data for converting old eight-bit Macintosh encodings to Unicode.
// This representation is optimized for decoding; encoding is slower
// and needs more memory. The assumption is that all opentype.js users
// want to open fonts, but saving a font will be comparatively rare
// so it can be more expensive. Keyed by IANA character set name.
//
// Python script for generating these strings:
//
//     s = u''.join([chr(c).decode('mac_greek') for c in range(128, 256)])
//     print(s.encode('utf-8'))
/**
 * @private
 */
export const eightBitMacEncodings = {
    'x-mac-croatian':  // Python: 'mac_croatian'
    'ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®Š™´¨≠ŽØ∞±≤≥∆µ∂∑∏š∫ªºΩžø' +
    '¿¡¬√ƒ≈Ć«Č… ÀÃÕŒœĐ—“”‘’÷◊©⁄€‹›Æ»–·‚„‰ÂćÁčÈÍÎÏÌÓÔđÒÚÛÙıˆ˜¯πË˚¸Êæˇ',
    'x-mac-cyrillic':  // Python: 'mac_cyrillic'
    'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ†°Ґ£§•¶І®©™Ђђ≠Ѓѓ∞±≤≥іµґЈЄєЇїЉљЊњ' +
    'јЅ¬√ƒ≈∆«»… ЋћЌќѕ–—“”‘’÷„ЎўЏџ№Ёёяабвгдежзийклмнопрстуфхцчшщъыьэю',
    'x-mac-gaelic': // http://unicode.org/Public/MAPPINGS/VENDORS/APPLE/GAELIC.TXT
    'ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØḂ±≤≥ḃĊċḊḋḞḟĠġṀæø' +
    'ṁṖṗɼƒſṠ«»… ÀÃÕŒœ–—“”‘’ṡẛÿŸṪ€‹›Ŷŷṫ·Ỳỳ⁊ÂÊÁËÈÍÎÏÌÓÔ♣ÒÚÛÙıÝýŴŵẄẅẀẁẂẃ',
    'x-mac-greek':  // Python: 'mac_greek'
    'Ä¹²É³ÖÜ΅àâä΄¨çéèêë£™îï•½‰ôö¦€ùûü†ΓΔΘΛΞΠß®©ΣΪ§≠°·Α±≤≥¥ΒΕΖΗΙΚΜΦΫΨΩ' +
    'άΝ¬ΟΡ≈Τ«»… ΥΧΆΈœ–―“”‘’÷ΉΊΌΎέήίόΏύαβψδεφγηιξκλμνοπώρστθωςχυζϊϋΐΰ\u00AD',
    'x-mac-icelandic':  // Python: 'mac_iceland'
    'ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûüÝ°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø' +
    '¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄€ÐðÞþý·‚„‰ÂÊÁËÈÍÎÏÌÓÔÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ',
    'x-mac-inuit': // http://unicode.org/Public/MAPPINGS/VENDORS/APPLE/INUIT.TXT
    'ᐃᐄᐅᐆᐊᐋᐱᐲᐳᐴᐸᐹᑉᑎᑏᑐᑑᑕᑖᑦᑭᑮᑯᑰᑲᑳᒃᒋᒌᒍᒎᒐᒑ°ᒡᒥᒦ•¶ᒧ®©™ᒨᒪᒫᒻᓂᓃᓄᓅᓇᓈᓐᓯᓰᓱᓲᓴᓵᔅᓕᓖᓗ' +
    'ᓘᓚᓛᓪᔨᔩᔪᔫᔭ… ᔮᔾᕕᕖᕗ–—“”‘’ᕘᕙᕚᕝᕆᕇᕈᕉᕋᕌᕐᕿᖀᖁᖂᖃᖄᖅᖏᖐᖑᖒᖓᖔᖕᙱᙲᙳᙴᙵᙶᖖᖠᖡᖢᖣᖤᖥᖦᕼŁł',
    'x-mac-ce':  // Python: 'mac_latin2'
    'ÄĀāÉĄÖÜáąČäčĆćéŹźĎíďĒēĖóėôöõúĚěü†°Ę£§•¶ß®©™ę¨≠ģĮįĪ≤≥īĶ∂∑łĻļĽľĹĺŅ' +
    'ņŃ¬√ńŇ∆«»… ňŐÕőŌ–—“”‘’÷◊ōŔŕŘ‹›řŖŗŠ‚„šŚśÁŤťÍŽžŪÓÔūŮÚůŰűŲųÝýķŻŁżĢˇ',
    macintosh:  // Python: 'mac_roman'
    'ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø' +
    '¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄€‹›ﬁﬂ‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ',
    'x-mac-romanian':  // Python: 'mac_romanian'
    'ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ĂȘ∞±≤≥¥µ∂∑∏π∫ªºΩăș' +
    '¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄€‹›Țț‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ',
    'x-mac-turkish':  // Python: 'mac_turkish'
    'ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø' +
    '¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸĞğİıŞş‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔÒÚÛÙˆ˜¯˘˙˚¸˝˛ˇ'
};

/**
 * Decodes an old-style Macintosh string. Returns either a Unicode JavaScript
 * string, or 'undefined' if the encoding is unsupported. For example, we do
 * not support Chinese, Japanese or Korean because these would need large
 * mapping tables.
 * @param {DataView} dataView
 * @param {number} offset
 * @param {number} dataLength
 * @param {string} encoding
 * @returns {string}
 */
decode.MACSTRING = function(dataView, offset, dataLength, encoding) {
    const table = eightBitMacEncodings[encoding];
    if (table === undefined) {
        return undefined;
    }

    let result = '';
    for (let i = 0; i < dataLength; i++) {
        const c = dataView.getUint8(offset + i);
        // In all eight-bit Mac encodings, the characters 0x00..0x7F are
        // mapped to U+0000..U+007F; we only need to look up the others.
        if (c <= 0x7F) {
            result += String.fromCharCode(c);
        } else {
            result += table[c & 0x7F];
        }
    }

    return result;
};

// Helper function for encode.MACSTRING. Returns a dictionary for mapping
// Unicode character codes to their 8-bit MacOS equivalent. This table
// is not exactly a super cheap data structure, but we do not care because
// encoding Macintosh strings is only rarely needed in typical applications.
const macEncodingTableCache = typeof WeakMap === 'function' && new WeakMap();
let macEncodingCacheKeys;
const getMacEncodingTable = function (encoding) {
    // Since we use encoding as a cache key for WeakMap, it has to be
    // a String object and not a literal. And at least on NodeJS 2.10.1,
    // WeakMap requires that the same String instance is passed for cache hits.
    if (!macEncodingCacheKeys) {
        macEncodingCacheKeys = {};
        for (let e in eightBitMacEncodings) {
            /*jshint -W053 */  // Suppress "Do not use String as a constructor."
            macEncodingCacheKeys[e] = new String(e);
        }
    }

    const cacheKey = macEncodingCacheKeys[encoding];
    if (cacheKey === undefined) {
        return undefined;
    }

    // We can't do "if (cache.has(key)) {return cache.get(key)}" here:
    // since garbage collection may run at any time, it could also kick in
    // between the calls to cache.has() and cache.get(). In that case,
    // we would return 'undefined' even though we do support the encoding.
    if (macEncodingTableCache) {
        const cachedTable = macEncodingTableCache.get(cacheKey);
        if (cachedTable !== undefined) {
            return cachedTable;
        }
    }

    const decodingTable = eightBitMacEncodings[encoding];
    if (decodingTable === undefined) {
        return undefined;
    }

    const encodingTable = {};
    for (let i = 0; i < decodingTable.length; i++) {
        encodingTable[decodingTable.charCodeAt(i)] = i + 0x80;
    }

    if (macEncodingTableCache) {
        macEncodingTableCache.set(cacheKey, encodingTable);
    }

    return encodingTable;
};

/**
 * Encodes an old-style Macintosh string. Returns a byte array upon success.
 * If the requested encoding is unsupported, or if the input string contains
 * a character that cannot be expressed in the encoding, the function returns
 * 'undefined'.
 * @param {string} str
 * @param {string} encoding
 * @returns {Array}
 */
encode.MACSTRING = function(str, encoding) {
    const table = getMacEncodingTable(encoding);
    if (table === undefined) {
        return undefined;
    }

    const result = [];
    for (let i = 0; i < str.length; i++) {
        let c = str.charCodeAt(i);

        // In all eight-bit Mac encodings, the characters 0x00..0x7F are
        // mapped to U+0000..U+007F; we only need to look up the others.
        if (c >= 0x80) {
            c = table[c];
            if (c === undefined) {
                // str contains a Unicode character that cannot be encoded
                // in the requested encoding.
                return undefined;
            }
        }
        result[i] = c;
        // result.push(c);
    }

    return result;
};

/**
 * @param {string} str
 * @param {string} encoding
 * @returns {number}
 */
sizeOf.MACSTRING = function(str, encoding) {
    const b = encode.MACSTRING(str, encoding);
    if (b !== undefined) {
        return b.length;
    } else {
        return 0;
    }
};

// Helper for encode.VARDELTAS
function isByteEncodable(value) {
    return value >= -128 && value <= 127;
}

// Helper for encode.VARDELTAS
function encodeVarDeltaRunAsZeroes(deltas, pos, result) {
    let runLength = 0;
    const numDeltas = deltas.length;
    while (pos < numDeltas && runLength < 64 && deltas[pos] === 0) {
        ++pos;
        ++runLength;
    }
    result.push(0x80 | (runLength - 1));
    return pos;
}

// Helper for encode.VARDELTAS
function encodeVarDeltaRunAsBytes(deltas, offset, result) {
    let runLength = 0;
    const numDeltas = deltas.length;
    let pos = offset;
    while (pos < numDeltas && runLength < 64) {
        const value = deltas[pos];
        if (!isByteEncodable(value)) {
            break;
        }

        // Within a byte-encoded run of deltas, a single zero is best
        // stored literally as 0x00 value. However, if we have two or
        // more zeroes in a sequence, it is better to start a new run.
        // Fore example, the sequence of deltas [15, 15, 0, 15, 15]
        // becomes 6 bytes (04 0F 0F 00 0F 0F) when storing the zero
        // within the current run, but 7 bytes (01 0F 0F 80 01 0F 0F)
        // when starting a new run.
        if (value === 0 && pos + 1 < numDeltas && deltas[pos + 1] === 0) {
            break;
        }

        ++pos;
        ++runLength;
    }
    result.push(runLength - 1);
    for (let i = offset; i < pos; ++i) {
        result.push((deltas[i] + 256) & 0xff);
    }
    return pos;
}

// Helper for encode.VARDELTAS
function encodeVarDeltaRunAsWords(deltas, offset, result) {
    let runLength = 0;
    const numDeltas = deltas.length;
    let pos = offset;
    while (pos < numDeltas && runLength < 64) {
        const value = deltas[pos];

        // Within a word-encoded run of deltas, it is easiest to start
        // a new run (with a different encoding) whenever we encounter
        // a zero value. For example, the sequence [0x6666, 0, 0x7777]
        // needs 7 bytes when storing the zero inside the current run
        // (42 66 66 00 00 77 77), and equally 7 bytes when starting a
        // new run (40 66 66 80 40 77 77).
        if (value === 0) {
            break;
        }

        // Within a word-encoded run of deltas, a single value in the
        // range (-128..127) should be encoded within the current run
        // because it is more compact. For example, the sequence
        // [0x6666, 2, 0x7777] becomes 7 bytes when storing the value
        // literally (42 66 66 00 02 77 77), but 8 bytes when starting
        // a new run (40 66 66 00 02 40 77 77).
        if (isByteEncodable(value) && pos + 1 < numDeltas && isByteEncodable(deltas[pos + 1])) {
            break;
        }

        ++pos;
        ++runLength;
    }
    result.push(0x40 | (runLength - 1));
    for (let i = offset; i < pos; ++i) {
        const val = deltas[i];
        result.push(((val + 0x10000) >> 8) & 0xff, (val + 0x100) & 0xff);
    }
    return pos;
}

/**
 * Encode a list of variation adjustment deltas.
 *
 * Variation adjustment deltas are used in ‘gvar’ and ‘cvar’ tables.
 * They indicate how points (in ‘gvar’) or values (in ‘cvar’) get adjusted
 * when generating instances of variation fonts.
 *
 * @see https://www.microsoft.com/typography/otspec/gvar.htm
 * @see https://developer.apple.com/fonts/TrueType-Reference-Manual/RM06/Chap6gvar.html
 * @param {Array} deltas
 * @return {Array}
 */
encode.VARDELTAS = function(deltas) {
    let pos = 0;
    const result = [];
    while (pos < deltas.length) {
        const value = deltas[pos];
        if (value === 0) {
            pos = encodeVarDeltaRunAsZeroes(deltas, pos, result);
        } else if (value >= -128 && value <= 127) {
            pos = encodeVarDeltaRunAsBytes(deltas, pos, result);
        } else {
            pos = encodeVarDeltaRunAsWords(deltas, pos, result);
        }
    }
    return result;
};

/**
 * Encode a list of packed point numbers for variation tables (gvar/cvar).
 *
 * Packed point numbers are used in 'gvar' and 'cvar' tables to specify
 * which points have explicit deltas. Point numbers are stored as deltas 
 * from the previous value.
 *
 * If points is an empty array or all points are included, a special encoding is used.
 *
 * @see https://learn.microsoft.com/en-us/typography/opentype/spec/otvarcommonformats#packed-point-numbers
 * @param {Array<number>} points - Array of point numbers (must be sorted in ascending order)
 * @param {boolean} [allPoints=false] - If true, encode as "all points" (count = 0)
 * @return {Array<number>} Encoded bytes
 */
encode.PACKEDPOINTS = function(points, allPoints = false) {
    const result = [];
    
    // Special case: all points - encode as count = 0
    if (allPoints || !points || points.length === 0) {
        result.push(0);
        return result;
    }
    
    const count = points.length;
    
    // Encode count: if <= 127, use 1 byte; otherwise use 2 bytes with high bit set
    if (count <= 127) {
        result.push(count);
    } else {
        // High bit set indicates 2-byte count
        result.push(0x80 | ((count >> 8) & 0x7F));
        result.push(count & 0xFF);
    }
    
    // Convert point numbers to deltas
    const deltas = [];
    let lastPoint = 0;
    for (let i = 0; i < points.length; i++) {
        deltas.push(points[i] - lastPoint);
        lastPoint = points[i];
    }
    
    // Encode deltas as runs
    let pos = 0;
    while (pos < deltas.length) {
        // Determine if this run should use words (16-bit) or bytes (8-bit)
        // A run can have at most 128 elements (0x7F + 1)
        let runLength = 0;
        let useWords = deltas[pos] > 255;
        
        // Count run length with same encoding type
        while (pos + runLength < deltas.length && runLength < 128) {
            const delta = deltas[pos + runLength];
            if (useWords) {
                // Check if we should switch to byte encoding
                if (delta <= 255 && pos + runLength + 1 < deltas.length && deltas[pos + runLength + 1] <= 255) {
                    break;
                }
            } else {
                // Check if we need to switch to word encoding
                if (delta > 255) {
                    break;
                }
            }
            runLength++;
        }
        
        if (runLength === 0) {
            runLength = 1;
        }
        
        // Write control byte: high bit = word flag, low 7 bits = count - 1
        const controlByte = (useWords ? 0x80 : 0) | (runLength - 1);
        result.push(controlByte);
        
        // Write the delta values
        for (let i = 0; i < runLength; i++) {
            const delta = deltas[pos + i];
            if (useWords) {
                result.push((delta >> 8) & 0xFF);
                result.push(delta & 0xFF);
            } else {
                result.push(delta & 0xFF);
            }
        }
        
        pos += runLength;
    }
    
    return result;
};

// Convert a list of values to a CFF INDEX structure.
// The values should be objects containing name / type / value.
/**
 * @param {Array} l
 * @param {string} [countEncoder] - encoder for the array count, defaults to 'Card16'
 * @returns {Array}
 */
encode.INDEX = function(l, countEncoder = 'Card16') {
    //var offset, offsets, offsetEncoder, encodedOffsets, encodedOffset, data,
    //    i, v;
    // Because we have to know which data type to use to encode the offsets,
    // we have to go through the values twice: once to encode the data and
    // calculate the offsets, then again to encode the offsets using the fitting data type.
    let offset = 1; // First offset is always 1.
    const offsets = [offset];
    const data = [];
    for (let i = 0; i < l.length; i += 1) {
        const v = encode.OBJECT(l[i]);
        Array.prototype.push.apply(data, v);
        offset += v.length;
        offsets.push(offset);
    }

    if (data.length === 0) {
        return Array(sizeOf[countEncoder]()).fill(0);
    }

    const encodedOffsets = [];
    const offSize = (1 + Math.floor(Math.log(offset) / Math.log(2)) / 8) | 0;
    const offsetEncoder = [undefined, encode.BYTE, encode.USHORT, encode.UINT24, encode.ULONG][offSize];
    for (let i = 0; i < offsets.length; i += 1) {
        const encodedOffset = offsetEncoder(offsets[i]);
        Array.prototype.push.apply(encodedOffsets, encodedOffset);
    }

    return Array.prototype.concat(encode[countEncoder](l.length),
        encode.OffSize(offSize),
        encodedOffsets,
        data);
};

/**
 * @param {Array} v
 * @returns {number}
 */
sizeOf.INDEX = function(v) {
    return encode.INDEX(v).length;
};

/**
 * @param {Array} l
 * @returns {Array}
 */
encode.INDEX32 = function(l) {
    return encode.INDEX(l, 'ULONG');
};

/**
 * @param {Array} v
 * @returns {number}
 */
sizeOf.INDEX32 = function(v) {
    return encode.INDEX(v, 'ULONG').length;
};

/**
 * Convert an object to a CFF DICT structure.
 * The keys should be numeric.
 * The values should be objects containing name / type / value.
 * @param {Record<number, {type: string, value: unknown, blend?: unknown}>} m
 * @returns {Array}
 */
encode.DICT = function(m) {
    let d = [];
    const keys = Object.keys(m);
    const length = keys.length;

    for (let i = 0; i < length; i += 1) {
        // Object.keys() return string keys, but our keys are always numeric.
        const k = parseInt(keys[i], 0);
        const v = m[k];
        // Build operands without mutating v.value (important when size/encode is called repeatedly)
        const operandValue = v.blend ? (Array.isArray(v.value) ? v.value.concat([v.blend]) : [v.value, v.blend]) : v.value;
        // Value comes before the key.
        const enc1 = encode.OPERAND(/** @type {Array} */ (/** @type {unknown} */ (operandValue)), v.type);
        const enc2 = encode.OPERATOR(k);
        for (let j = 0; j < enc1.length; j++) {
            d.push(enc1[j]);
        }
        if(v.blend) {
            d.push(0x17);
        }
        for (let j = 0; j < enc2.length; j++) {
            d.push(enc2[j]);
        }
        
    }


    return d;
};

/**
 * @param {Record<number, {type: string, value: unknown, blend?: unknown}>} m
 * @returns {number}
 */
sizeOf.DICT = function(m) {
    return encode.DICT(m).length;
};

/**
 * @param {number} v
 * @returns {Array}
 */
encode.OPERATOR = function(v) {
    if (v < 1200) {
        return [v];
    } else {
        return [12, v - 1200];
    }
};

/**
 * @param {Array} v
 * @param {string} type
 * @returns {Array}
 */
encode.OPERAND = function(v, type) {
    let d = [];
    if (Array.isArray(type)) {
        for (let i = 0; i < type.length; i += 1) {
            check.argument(v.length === type.length, 'Not enough arguments given for type' + type);
            const enc1 = encode.OPERAND(v[i], type[i]);
            for (let j = 0; j < enc1.length; j++) {
                d.push(enc1[j]);
            }
        }
    } else if (Array.isArray(v)) {
        for (let i = 0; i < v.length; i++) {
            const n = encode.OPERAND(v[i], type);
            for (let j = 0; j < n.length; j++) {
                d.push(n[j]);
            }
        }
    } else if (v === undefined || v === null) {
        // Skip undefined/null values - they shouldn't be in the DICT
        throw new Error('Cannot encode undefined/null value for type ' + type);
    } else {
        if (type === 'SID') {
            const enc1 = encode.NUMBER(v);
            for (let j = 0; j < enc1.length; j++) {
                d.push(enc1[j]);
            }
        } else if (type === 'offset') {
            // We make it easy for ourselves and always encode offsets as
            // 4 bytes. This makes offset calculation for the top dict easier.
            // For CFF2 an in order to save space, we use the 'varoffset' type
            const enc1 = encode.NUMBER32(v);
            for (let j = 0; j < enc1.length; j++) {
                d.push(enc1[j]);
            }
        } else if (
            type === 'varoffset' ||
            ((type === 'number' || type === 'delta') && Number.isInteger(v))
        ) {
            const enc1 = encode.NUMBER(v);
            for (let j = 0; j < enc1.length; j++) {
                d.push(enc1[j]);
            }
        } else if (type === 'real' || ((type === 'number' || type === 'delta') && typeof v === 'number' && !Number.isInteger(v))) {
            // Handle real type or number/delta with float values
            const enc1 = encode.REAL(v);
            for (let j = 0; j < enc1.length; j++) {
                d.push(enc1[j]);
            }
        } else if (typeof v === 'number' && !Number.isInteger(v)) {
            // Fallback for float values without explicit type
            const enc1 = encode.REAL(v);
            for (let j = 0; j < enc1.length; j++) {
                d.push(enc1[j]);
            }
        } else {
            throw new Error('Unknown operand type ' + type + ' for value ' + v + ' (typeof: ' + typeof v + ')');
            // FIXME Add support for booleans
        }
    }

    return d;
};

encode.OP = encode.BYTE;
sizeOf.OP = sizeOf.BYTE;

// memoize charstring encoding using WeakMap if available
const wmm = typeof WeakMap === 'function' && new WeakMap();

/**
 * Convert a list of CharString operations to bytes.
 * @param {Array} ops
 * @returns {Array}
 */
encode.CHARSTRING = function(ops) {
    // See encode.MACSTRING for why we don't do "if (wmm && wmm.has(ops))".
    if (wmm) {
        const cachedValue = wmm.get(ops);
        if (cachedValue !== undefined) {
            return cachedValue;
        }
    }

    let d = [];
    const length = ops.length;

    for (let i = 0; i < length; i += 1) {
        const op = ops[i];
        const enc1 = encode[op.type](op.value);
        for (let j = 0; j < enc1.length; j++) {
            d.push(enc1[j]);
        }
    }

    if (wmm) {
        wmm.set(ops, d);
    }

    return d;
};

/**
 * @param {Array} ops
 * @returns {number}
 */
sizeOf.CHARSTRING = function(ops) {
    return encode.CHARSTRING(ops).length;
};

// Utility functions ////////////////////////////////////////////////////////

/**
 * Convert an object containing name / type / value to bytes.
 * @param {{type: string, value: unknown}|Array<{type: string, value: unknown}>} v
 * @returns {Array}
 */
encode.OBJECT = function(v) {
    if(Array.isArray(v)) {
        const encoded = [];
        for(let o of v) {
            encoded.push(sizeOf.OBJECT(o));
        }
        return encoded;
    }
    const encodingFunction = encode[v.type];
    check.argument(encodingFunction !== undefined, 'No encoding function for type ' + v.type);
    return encodingFunction(v.value);
};

/**
 * @param {{type: string, value: unknown}|Array<{type: string, value: unknown}>} v
 * @returns {number}
 */
sizeOf.OBJECT = function(v) {
    if(Array.isArray(v)) {
        let size = 0;
        for(let o of v) {
            size += sizeOf.OBJECT(o);
        }
        return size;
    }
    const sizeOfFunction = sizeOf[v.type];
    check.argument(sizeOfFunction !== undefined, 'No sizeOf function for type ' + v.type);
    return sizeOfFunction(v.value);
};

/**
 * @param {string} fieldType
 * @returns {number}
 */
function getOffsetFieldWidth(fieldType) {
    if (fieldType === 'TABLE' || fieldType === 'OFFSET16') {
        return 2;
    }
    if (fieldType === 'OFFSET24') {
        return 3;
    }
    if (fieldType === 'OFFSET32') {
        return 4;
    }
    return 0;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isTableLike(value) {
    return !!value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'fields');
}

/**
 * @param {Array<number>} bytes
 * @param {number} position
 * @param {number} width
 * @param {number} value
 */
function writeOffset(bytes, position, width, value) {
    if (width === 2) {
        bytes[position] = (value >> 8) & 0xff;
        bytes[position + 1] = value & 0xff;
        return;
    }
    if (width === 3) {
        bytes[position] = (value >> 16) & 0xff;
        bytes[position + 1] = (value >> 8) & 0xff;
        bytes[position + 2] = value & 0xff;
        return;
    }
    if (width === 4) {
        bytes[position] = (value >> 24) & 0xff;
        bytes[position + 1] = (value >> 16) & 0xff;
        bytes[position + 2] = (value >> 8) & 0xff;
        bytes[position + 3] = value & 0xff;
        return;
    }
    check.argument(false, 'Unsupported offset width ' + width + '.');
}

/**
 * @param {{width: number}} relocation
 * @returns {number}
 */
function getMaxOffsetForRelocation(relocation) {
    return relocation.width === 2 ? 0xFFFF : relocation.width === 3 ? 0xFFFFFF : 0xFFFFFFFF;
}

/**
 * One serialized object of a table graph: its own bytes (offset fields zeroed) and its
 * offsets to other objects. Offsets always count from the start of the object holding
 * the field; `scope` and `phase` only decide where the target is laid out.
 * @typedef {{pos: number, width: number, child: number, scope: string, phase: number, fieldName: string}} GraphLink
 * @typedef {{bytes: Array<number>, links: GraphLink[], kind: string, canon: number}} GraphNode
 * @typedef {'global' | 'siblings'} ShareMode
 * @typedef {{nodes: GraphNode[], canonical: Map<string, number>, shareMode: ShareMode}} TableGraph
 * @typedef {Record<string, unknown> & {fields?: Array<{name: string, type: string, value?: unknown, targetScope?: string, appendPhase?: number}> | null, tableName?: string}} EncodableTable
 */

/**
 * Exact content key of a serialized object: its own bytes and the canonical ids of the
 * objects its offsets point to. Equal keys mean equal subgraphs; as in fontTools, the
 * kind of table does not matter (an empty ScriptList and FeatureList are one object).
 * @param {GraphNode} node
 * @param {GraphNode[]} nodes
 * @returns {string}
 */
function graphNodeKey(node, nodes) {
    let key = '\u0000';
    const bytes = node.bytes;
    for (let i = 0; i < bytes.length; i += 8192) {
        key += String.fromCharCode.apply(null, bytes.slice(i, i + 8192));
    }
    key += '\u0000';
    for (let i = 0; i < node.links.length; i += 1) {
        const link = node.links[i];
        key += link.pos + ',' + link.width + ',' + nodes[link.child].canon + ',' + link.scope + ',' + link.phase + ';';
    }
    return key;
}

/**
 * Add a node, or return the identical node already in the graph. Every node gets a
 * canonical id (the first structurally equal node). In 'global' mode identical objects
 * anywhere in the table are one node, as in fontTools' packer; 'siblings' mode keeps
 * them apart and only merges equal offsets of one parent (see buildGraphNode).
 * Empty objects are never merged.
 * @param {TableGraph} graph
 * @param {GraphNode} node
 * @returns {number}
 */
function internGraphNode(graph, node) {
    const id = graph.nodes.length;
    if (node.bytes.length === 0) {
        node.canon = id;
        graph.nodes.push(node);
        return id;
    }
    const key = graphNodeKey(node, graph.nodes);
    const existing = graph.canonical.get(key);
    if (existing !== undefined && graph.shareMode === 'global') return existing;
    node.canon = existing === undefined ? id : existing;
    if (existing === undefined) graph.canonical.set(key, id);
    graph.nodes.push(node);
    return id;
}

/**
 * @param {TableGraph} graph
 * @param {unknown} target
 * @returns {number}
 */
function buildGraphTarget(graph, target) {
    if (isTableLike(target)) return buildGraphNode(graph, /** @type {EncodableTable} */ (target));
    /** @type {Array<number>} */
    let bytes;
    if (Array.isArray(target) || target instanceof Uint8Array) {
        bytes = Array.from(target);
    } else if (typeof target === 'object' && target && 'type' in target && 'value' in target) {
        bytes = encode.OBJECT(/** @type {{type: string, value: unknown}|Array<{type: string, value: unknown}>} */ (target));
    } else {
        check.argument(false, 'Unsupported offset target type.');
        bytes = [];
    }
    return internGraphNode(graph, { bytes, links: [], kind: '', canon: -1 });
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isOffsetTargetPresent(value) {
    return value !== null && value !== undefined && !(isTableLike(value) && /** @type {{fields?: unknown}} */ (value).fields === null);
}

/**
 * @param {TableGraph} graph
 * @param {EncodableTable} table
 * @returns {number}
 */
function buildGraphNode(graph, table) {
    /** @type {Array<number>} */
    const bytes = [];
    /** @type {GraphLink[]} */
    const links = [];
    /** @type {Map<number, number> | null} */
    const siblings = graph.shareMode === 'siblings' ? new Map() : null;
    const fields = table.fields || [];
    for (let i = 0; i < fields.length; i += 1) {
        const field = fields[i];
        let value = table[field.name];
        if (value === undefined) {
            value = field.value;
        }
        const width = getOffsetFieldWidth(field.type);
        if (width > 0) {
            const pos = bytes.length;
            for (let j = 0; j < width; j += 1) bytes.push(0);
            if (isOffsetTargetPresent(value)) {
                let child = buildGraphTarget(graph, value);
                if (siblings) {
                    const canon = graph.nodes[child].canon;
                    const sibling = siblings.get(canon);
                    if (sibling !== undefined && graph.nodes[child].bytes.length > 0) child = sibling;
                    else siblings.set(canon, child);
                }
                links.push({ pos, width, child, scope: field.targetScope || 'local', phase: field.appendPhase || 0, fieldName: field.name });
            }
            continue;
        }
        const encodingFunction = encode[field.type];
        check.argument(encodingFunction !== undefined, 'No encoding function for field type ' + field.type + ' (' + field.name + ')');
        const encoded = encodingFunction(value);
        for (let j = 0; j < encoded.length; j++) bytes.push(encoded[j]);
    }
    return internGraphNode(graph, { bytes, links, kind: String(table.tableName || ''), canon: -1 });
}

/**
 * The objects a node lays out after itself, in order: its local offsets, then the
 * 'parent'-scoped offsets of each of those children (extension subtables of the
 * Lookup tables in a LookupList), ordered by append phase as they are reached.
 * @param {GraphNode[]} nodes
 * @param {number} id
 * @returns {number[]}
 */
function graphLayoutChildren(nodes, id) {
    /** @type {Map<number, GraphLink[]>} */
    const buckets = new Map();
    /** @type {Map<number, number>} */
    const cursors = new Map();
    /** @param {GraphLink} link */
    const enqueue = (link) => {
        let bucket = buckets.get(link.phase);
        if (!bucket) {
            bucket = [];
            buckets.set(link.phase, bucket);
            cursors.set(link.phase, 0);
        }
        bucket.push(link);
    };
    for (const link of nodes[id].links) if (link.scope === 'local') enqueue(link);
    const order = [];
    for (;;) {
        let phase = Infinity;
        for (const [p, bucket] of buckets) {
            if (/** @type {number} */ (cursors.get(p)) < bucket.length && p < phase) phase = p;
        }
        if (phase === Infinity) break;
        const cursor = /** @type {number} */ (cursors.get(phase));
        const link = /** @type {GraphLink[]} */ (buckets.get(phase))[cursor];
        cursors.set(phase, cursor + 1);
        order.push(link.child);
        if (link.scope === 'local') {
            for (const deferred of nodes[link.child].links) if (deferred.scope === 'parent') enqueue(deferred);
        }
    }
    return order;
}

/**
 * Lay out the graph as fontTools' packer does: a depth-first order in which every
 * object follows all objects that point to it (a shared object follows its last
 * parent), so all offsets are forward. 'root'-scoped targets (extension subtables'
 * payloads) form a region after everything that reaches them.
 * @param {GraphNode[]} nodes
 * @param {number} rootId
 * @returns {{regions: Array<Map<number, number>>, order: Array<{region: number, id: number}>, size: number}}
 */
function layoutTableGraph(nodes, rootId) {
    /** @type {Array<Map<number, number>>} */
    const regions = [];
    /** @type {Array<{region: number, id: number}>} */
    const order = [];
    let offset = 0;
    let roots = [rootId];
    while (roots.length > 0) {
        /** @type {Set<number>} */
        const visited = new Set();
        /** @type {number[]} */
        const post = [];
        /** @param {number[]} children */
        const gatherChildren = (children) => {
            /** @type {Map<number, number>} */
            const first = new Map();
            for (let i = 0; i < children.length; i += 1) if (!first.has(children[i])) first.set(children[i], i);
            for (let i = children.length - 1; i >= 0; i -= 1) {
                const child = children[i];
                if (first.get(child) === i && !visited.has(child)) gather(child);
            }
        };
        /** @param {number} id */
        const gather = (id) => {
            visited.add(id);
            gatherChildren(graphLayoutChildren(nodes, id));
            post.push(id);
        };
        gatherChildren(roots);
        const region = regions.length;
        /** @type {Map<number, number>} */
        const positions = new Map();
        /** @type {number[]} */
        const nextRoots = [];
        /** @type {Set<number>} */
        const nextSeen = new Set();
        for (let i = post.length - 1; i >= 0; i -= 1) {
            const id = post[i];
            positions.set(id, offset);
            order.push({ region, id });
            offset += nodes[id].bytes.length;
            for (const link of nodes[id].links) {
                if (link.scope === 'root' && !nextSeen.has(link.child)) {
                    nextSeen.add(link.child);
                    nextRoots.push(link.child);
                }
            }
        }
        regions.push(positions);
        roots = nextRoots;
    }
    return { regions, order, size: offset };
}

/**
 * @param {GraphLink} link
 * @param {number} region
 * @returns {number}
 */
function linkTargetRegion(link, region) {
    return link.scope === 'root' ? region + 1 : region;
}

/**
 * Lay out a table graph, giving an object that is out of 16-bit reach of one of its
 * parents a copy of its own near that parent (a shared object is only stored once
 * where every parent reaches it). Returns null when an offset cannot be resolved.
 * @param {TableGraph} graph
 * @param {number} rootId
 * @returns {{layout: ReturnType<typeof layoutTableGraph>, overflow: null} | {layout: null, overflow: {kind: string, fieldName: string, max: number}}}
 */
function resolveTableGraphLayout(graph, rootId) {
    const nodes = graph.nodes;
    for (let pass = 0; ; pass += 1) {
        const layout = layoutTableGraph(nodes, rootId);
        /** @type {Map<number, number>} */
        const references = new Map();
        for (const { id } of layout.order) {
            for (const link of nodes[id].links) references.set(link.child, (references.get(link.child) || 0) + 1);
        }
        /** @type {Array<{owner: number, link: GraphLink}>} */
        const overflowing = [];
        for (const { region, id } of layout.order) {
            const ownerPos = /** @type {number} */ (layout.regions[region].get(id));
            for (const link of nodes[id].links) {
                const targetPos = layout.regions[linkTargetRegion(link, region)].get(link.child);
                const relative = /** @type {number} */ (targetPos) - ownerPos;
                if (relative < 0 || relative > getMaxOffsetForRelocation(link)) overflowing.push({ owner: id, link });
            }
        }
        if (overflowing.length === 0) return { layout, overflow: null };
        const unsharable = overflowing.find(({ link }) => (references.get(link.child) || 0) < 2);
        if (unsharable || pass >= 32) {
            const { owner, link } = unsharable || overflowing[0];
            return { layout: null, overflow: { kind: nodes[owner].kind, fieldName: link.fieldName, max: getMaxOffsetForRelocation(link) } };
        }
        /** @type {Map<string, number>} */
        const copies = new Map();
        for (const { owner, link } of overflowing) {
            const copyKey = owner + ':' + link.child;
            let copy = copies.get(copyKey);
            if (copy === undefined) {
                const source = nodes[link.child];
                copy = nodes.length;
                nodes.push({ bytes: source.bytes, links: source.links.map((l) => Object.assign({}, l)), kind: source.kind, canon: source.canon });
                copies.set(copyKey, copy);
            }
            link.child = copy;
        }
    }
}

/**
 * @param {EncodableTable} table
 * @param {ShareMode} shareMode
 * @returns {{nodes: GraphNode[], layout: ReturnType<typeof layoutTableGraph> | null, overflow: {kind: string, fieldName: string, max: number} | null}}
 */
function packTable(table, shareMode) {
    /** @type {TableGraph} */
    const graph = { nodes: [], canonical: new Map(), shareMode };
    const rootId = buildGraphNode(graph, table);
    const resolved = resolveTableGraphLayout(graph, rootId);
    return { nodes: graph.nodes, layout: resolved.layout, overflow: resolved.overflow };
}

/**
 * Serialize a table and every object it points to.
 *
 * The table is turned into a graph of objects (offset-bearing fields `TABLE`,
 * `OFFSET16`, `OFFSET24`, `OFFSET32` are its edges) in which identical objects
 * (coverage, class definition, device, anchor, PairSet, whole subtables or lookups)
 * are stored once and pointed to from every parent, as fontTools' packer does. The
 * objects are then laid out in a depth-first order where every offset is forward;
 * an object a 16-bit offset cannot reach is copied next to that parent. If that
 * cannot resolve every offset, the table is laid out with only the offsets of one
 * parent sharing, the way it was before global sharing. `targetScope: 'parent'`
 * lays a target out after the referencing object's parent's own children, and
 * `targetScope: 'root'` after all of the table (GSUB/GPOS extension payloads);
 * `appendPhase` orders a parent's children.
 * @param {EncodableTable} table
 * @returns {Array<number>}
 */
function encodeTable(table) {
    let packed = packTable(table, 'global');
    if (!packed.layout) packed = packTable(table, 'siblings');
    if (!packed.layout) {
        const overflow = /** @type {{kind: string, fieldName: string, max: number}} */ (packed.overflow);
        check.argument(false, 'Table ' + (overflow.kind || table.tableName) + ' offset for ' + overflow.fieldName + ' exceeds ' + overflow.max + '.');
    }
    const layout = /** @type {ReturnType<typeof layoutTableGraph>} */ (packed.layout);
    const nodes = packed.nodes;
    const bytes = new Array(layout.size);
    for (const { region, id } of layout.order) {
        const node = nodes[id];
        const start = /** @type {number} */ (layout.regions[region].get(id));
        for (let i = 0; i < node.bytes.length; i += 1) bytes[start + i] = node.bytes[i];
        for (const link of node.links) {
            const targetPos = /** @type {number} */ (layout.regions[linkTargetRegion(link, region)].get(link.child));
            writeOffset(bytes, start + link.pos, link.width, targetPos - start);
        }
    }
    return bytes;
}

/**
 * Convert a table object to bytes.
 * @param {EncodableTable} table
 * @returns {Array}
 */
encode.TABLE = function(table) {
    return encodeTable(table);
};

/**
 * The size of a table as encode.TABLE writes it, shared objects counted once.
 * @param {EncodableTable} table
 * @returns {number}
 */
sizeOf.TABLE = function(table) {
    let size = 0;
    const fields = table.fields || [];
    for (let i = 0; i < fields.length; i += 1) {
        const field = fields[i];
        let value = table[field.name];
        if (value === undefined) {
            value = field.value;
        }
        const width = getOffsetFieldWidth(field.type);
        if (width > 0) {
            // Objects behind offsets may be shared: only the packed table knows its size.
            if (isOffsetTargetPresent(value)) return encodeTable(table).length;
            size += width;
            continue;
        }
        const sizeOfFunction = sizeOf[field.type];
        check.argument(sizeOfFunction !== undefined, 'No sizeOf function for field type ' + field.type + ' (' + field.name + ')');
        size += sizeOfFunction(value);
    }
    return size;
};

encode.RECORD = encode.TABLE;
sizeOf.RECORD = sizeOf.TABLE;

// Merge in a list of bytes.
encode.LITERAL = function(v) {
    return v;
};

sizeOf.LITERAL = function(v) {
    return v.length;
};

export { decode, encode, sizeOf };
