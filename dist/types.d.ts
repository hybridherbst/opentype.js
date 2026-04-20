/**
 * @private
 */
export const eightBitMacEncodings: {
    'x-mac-croatian': string;
    'x-mac-cyrillic': string;
    'x-mac-gaelic': string;
    'x-mac-greek': string;
    'x-mac-icelandic': string;
    'x-mac-inuit': string;
    'x-mac-ce': string;
    macintosh: string;
    'x-mac-romanian': string;
    'x-mac-turkish': string;
};
export namespace decode {
    /**
     * @param {DataView} data
     * @param {number} offset
     * @param {number} numBytes
     * @returns {string}
     */
    function UTF8(data: DataView, offset: number, numBytes: number): string;
    /**
     * @param {DataView} data
     * @param {number} offset
     * @param {number} numBytes
     * @returns {string}
     */
    function UTF16(data: DataView, offset: number, numBytes: number): string;
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
    function MACSTRING(dataView: DataView, offset: number, dataLength: number, encoding: string): string;
}
export namespace encode {
    /**
     * Convert an 8-bit unsigned integer to a list of 1 byte.
     * @param {number} v
     * @returns {Array}
     */
    export function BYTE(v: number): any[];
    /**
     * Convert a 8-bit signed integer to a list of 1 byte.
     * @param {string} v
     * @returns {Array}
     */
    export function CHAR(v: string): any[];
    /**
     * Convert an ASCII string to a list of bytes.
     * @param {string} v
     * @returns {Array}
     */
    export function CHARARRAY(v: string): any[];
    /**
     * Convert a 16-bit unsigned integer to a list of 2 bytes.
     * @param {number} v
     * @returns {Array}
     */
    export function USHORT(v: number): any[];
    /**
     * Convert a 16-bit signed integer to a list of 2 bytes.
     * @param {number} v
     * @returns {Array}
     */
    export function SHORT(v: number): any[];
    /**
     * Convert a 24-bit unsigned integer to a list of 3 bytes.
     * @param {number} v
     * @returns {Array}
     */
    export function UINT24(v: number): any[];
    /**
     * Convert a 32-bit unsigned integer to a list of 4 bytes.
     * @param {number} v
     * @returns {Array}
     */
    export function ULONG(v: number): any[];
    /**
     * Convert a 32-bit unsigned integer to a list of 4 bytes.
     * @param {number} v
     * @returns {Array}
     */
    export function LONG(v: number): any[];
    /**
     * Convert a 64-bit JavaScript float to a 32-bit signed fixed-point number (16.16)
     */
    export function FLOAT(v: any): any[];
    import FIXED = ULONG;
    export { FIXED };
    import FWORD = SHORT;
    export { FWORD };
    import UFWORD = USHORT;
    export { UFWORD };
    export function F2DOT14(v: any): any[];
    /**
     * Convert a 32-bit Apple Mac timestamp integer to a list of 8 bytes, 64-bit timestamp.
     * @param {number} v
     * @returns {Array}
     */
    export function LONGDATETIME(v: number): any[];
    /**
     * Convert a 4-char tag to a list of 4 bytes.
     * @param {string} v
     * @returns {Array}
     */
    export function TAG(v: string): any[];
    import Card8 = BYTE;
    export { Card8 };
    import Card16 = USHORT;
    export { Card16 };
    import OffSize = BYTE;
    export { OffSize };
    import SID = USHORT;
    export { SID };
    /**
     * Convert a numeric operand or charstring number to a variable-size list of bytes.
     * @param {number} v
     * @returns {Array}
     */
    export function NUMBER(v: number): any[];
    /**
     * Convert a signed number between -32768 and +32767 to a three-byte value.
     * This ensures we always use three bytes, but is not the most compact format.
     * @param {number} v
     * @returns {Array}
     */
    export function NUMBER16(v: number): any[];
    /**
     * Convert a signed number between -(2^31) and +(2^31-1) to a five-byte value.
     * This is useful if you want to be sure you always use four bytes,
     * at the expense of wasting a few bytes for smaller numbers.
     * @param {number} v
     * @returns {Array}
     */
    export function NUMBER32(v: number): any[];
    /**
     * @param {number} v
     * @returns {Array}
     */
    export function REAL(v: number): any[];
    import NAME = CHARARRAY;
    export { NAME };
    import STRING = CHARARRAY;
    export { STRING };
    /**
     * Convert a JavaScript string to UTF16-BE.
     * @param {string} v
     * @returns {Array}
     */
    export function UTF16(v: string): any[];
    /**
     * Encodes an old-style Macintosh string. Returns a byte array upon success.
     * If the requested encoding is unsupported, or if the input string contains
     * a character that cannot be expressed in the encoding, the function returns
     * 'undefined'.
     * @param {string} str
     * @param {string} encoding
     * @returns {Array}
     */
    export function MACSTRING(str: string, encoding: string): any[];
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
    export function VARDELTAS(deltas: any[]): any[];
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
    export function PACKEDPOINTS(points: Array<number>, allPoints?: boolean): Array<number>;
    /**
     * @param {Array} l
     * @param {string} [countEncoder] - encoder for the array count, defaults to 'Card16'
     * @returns {Array}
     */
    export function INDEX(l: any[], countEncoder?: string): any[];
    /**
     * @param {Array} l
     * @returns {Array}
     */
    export function INDEX32(l: any[]): any[];
    /**
     * Convert an object to a CFF DICT structure.
     * The keys should be numeric.
     * The values should be objects containing name / type / value.
     * @param {Record<number, {type: string, value: unknown, blend?: unknown}>} m
     * @returns {Array}
     */
    export function DICT(m: Record<number, {
        type: string;
        value: unknown;
        blend?: unknown;
    }>): any[];
    /**
     * @param {number} v
     * @returns {Array}
     */
    export function OPERATOR(v: number): any[];
    /**
     * @param {Array} v
     * @param {string} type
     * @returns {Array}
     */
    export function OPERAND(v: any[], type: string): any[];
    import OP = BYTE;
    export { OP };
    /**
     * Convert a list of CharString operations to bytes.
     * @param {Array} ops
     * @returns {Array}
     */
    export function CHARSTRING(ops: any[]): any[];
    /**
     * Convert an object containing name / type / value to bytes.
     * @param {{type: string, value: unknown}|Array<{type: string, value: unknown}>} v
     * @returns {Array}
     */
    export function OBJECT(v: {
        type: string;
        value: unknown;
    } | Array<{
        type: string;
        value: unknown;
    }>): any[];
    /**
     * Convert a table object to bytes.
     * @param {Record<string, unknown> & {fields?: Array<{name: string, type: string, value?: unknown, patchKey?: string}>, tableName?: string}} table
     * @returns {Array}
     */
    export function TABLE(table: Record<string, unknown> & {
        fields?: Array<{
            name: string;
            type: string;
            value?: unknown;
            patchKey?: string;
        }>;
        tableName?: string;
    }): any[];
    export { encodeTableWithMarkers as TABLE_WITH_MARKERS };
    import RECORD = TABLE;
    export { RECORD };
    export function LITERAL(v: any): any;
}
export namespace sizeOf {
    export let BYTE: () => number;
    export let CHAR: () => number;
    /**
     * @param {Array} v
     * @returns {number}
     */
    export function CHARARRAY(v: any[]): number;
    export let USHORT: () => number;
    export let SHORT: () => number;
    export let UINT24: () => number;
    export let ULONG: () => number;
    export let LONG: () => number;
    import FLOAT = ULONG;
    export { FLOAT };
    import FIXED_1 = ULONG;
    export { FIXED_1 as FIXED };
    import FWORD_1 = SHORT;
    export { FWORD_1 as FWORD };
    import UFWORD_1 = USHORT;
    export { UFWORD_1 as UFWORD };
    import F2DOT14 = USHORT;
    export { F2DOT14 };
    export let LONGDATETIME: () => number;
    export let TAG: () => number;
    import Card8_1 = BYTE;
    export { Card8_1 as Card8 };
    import Card16_1 = USHORT;
    export { Card16_1 as Card16 };
    import OffSize_1 = BYTE;
    export { OffSize_1 as OffSize };
    import SID_1 = USHORT;
    export { SID_1 as SID };
    /**
     * @param {number} v
     * @returns {number}
     */
    export function NUMBER(v: number): number;
    export let NUMBER16: () => number;
    export let NUMBER32: () => number;
    /**
     * @param {number} v
     * @returns {number}
     */
    export function REAL(v: number): number;
    import NAME_1 = CHARARRAY;
    export { NAME_1 as NAME };
    import STRING_1 = CHARARRAY;
    export { STRING_1 as STRING };
    /**
     * @param {string} v
     * @returns {number}
     */
    export function UTF16(v: string): number;
    /**
     * @param {string} str
     * @param {string} encoding
     * @returns {number}
     */
    export function MACSTRING(str: string, encoding: string): number;
    /**
     * @param {Array} v
     * @returns {number}
     */
    export function INDEX(v: any[]): number;
    /**
     * @param {Array} v
     * @returns {number}
     */
    export function INDEX32(v: any[]): number;
    /**
     * @param {Record<number, {type: string, value: unknown, blend?: unknown}>} m
     * @returns {number}
     */
    export function DICT(m: Record<number, {
        type: string;
        value: unknown;
        blend?: unknown;
    }>): number;
    import OP_1 = BYTE;
    export { OP_1 as OP };
    /**
     * @param {Array} ops
     * @returns {number}
     */
    export function CHARSTRING(ops: any[]): number;
    /**
     * @param {{type: string, value: unknown}|Array<{type: string, value: unknown}>} v
     * @returns {number}
     */
    export function OBJECT(v: {
        type: string;
        value: unknown;
    } | Array<{
        type: string;
        value: unknown;
    }>): number;
    /**
     * @param {Record<string, unknown> & {fields?: Array<{name: string, type: string, value?: unknown}>}} table
     * @returns {number}
     */
    export function TABLE(table: Record<string, unknown> & {
        fields?: Array<{
            name: string;
            type: string;
            value?: unknown;
        }>;
    }): number;
    import RECORD_1 = TABLE;
    export { RECORD_1 as RECORD };
    export function LITERAL(v: any): any;
}
/**
 * Convert a table object to bytes.
 * A table contains a list of fields containing the metadata (name, type and default value).
 * The table itself has the field values set as attributes.
 * When a field carries a `patchKey`, the encoder also records the emitted byte
 * position so callers can patch that exact field later without rescanning the
 * serialized byte stream.
 * @param {Record<string, unknown> & {fields?: Array<{name: string, type: string, value?: unknown, patchKey?: string}>, tableName?: string}} table
 * @returns {{bytes: Array<number>, trackedFields: Record<string, number[]>}}
 */
declare function encodeTableWithMarkers(table: Record<string, unknown> & {
    fields?: Array<{
        name: string;
        type: string;
        value?: unknown;
        patchKey?: string;
    }>;
    tableName?: string;
}): {
    bytes: Array<number>;
    trackedFields: Record<string, number[]>;
};
export {};
//# sourceMappingURL=types.d.ts.map