// The `maxp` table establishes the memory requirements for the font.
// We need it just to get the number of glyphs in the font.
// https://www.microsoft.com/typography/OTSPEC/maxp.htm

import parse from '../parse.mjs';
import table from '../table.mjs';

// Parse the maximum profile `maxp` table.
function parseMaxpTable(data, start) {
    const maxp = {};
    const p = new parse.Parser(data, start);
    maxp.version = p.parseVersion();
    maxp.numGlyphs = p.parseUShort();
    if (maxp.version === 1.0) {
        maxp.maxPoints = p.parseUShort();
        maxp.maxContours = p.parseUShort();
        maxp.maxCompositePoints = p.parseUShort();
        maxp.maxCompositeContours = p.parseUShort();
        maxp.maxZones = p.parseUShort();
        maxp.maxTwilightPoints = p.parseUShort();
        maxp.maxStorage = p.parseUShort();
        maxp.maxFunctionDefs = p.parseUShort();
        maxp.maxInstructionDefs = p.parseUShort();
        maxp.maxStackElements = p.parseUShort();
        maxp.maxSizeOfInstructions = p.parseUShort();
        maxp.maxComponentElements = p.parseUShort();
        maxp.maxComponentDepth = p.parseUShort();
    }

    return maxp;
}

/** Bytes of push data an instruction at `i` carries (TrueType NPUSHB/NPUSHW/PUSHB/PUSHW). */
function pushData(code, i) {
    const op = code[i];
    if (op === 0x40) return { count: code[i + 1] ?? 0, width: 1, start: i + 2 };
    if (op === 0x41) return { count: code[i + 1] ?? 0, width: 2, start: i + 2 };
    if (op >= 0xB0 && op <= 0xB7) return { count: op - 0xAF, width: 1, start: i + 1 };
    if (op >= 0xB8 && op <= 0xBF) return { count: op - 0xB7, width: 2, start: i + 1 };
    return null;
}

/**
 * Functions and instructions a font program defines: the highest FDEF number + 1 and
 * the IDEF count. Definitions are read by following the pushes outside function
 * bodies (the usual `PUSH ids… FDEF … ENDF` form); a number it cannot follow counts as
 * one more definition.
 * @param {ArrayLike<number> | undefined} code
 * @returns {{ functionDefs: number, instructionDefs: number }}
 */
export function countHintingDefinitions(code) {
    let functionDefs = 0;
    let instructionDefs = 0;
    if (!code || !code.length) return { functionDefs, instructionDefs };
    /** @type {Array<number> | null} values pushed outside bodies; null once untracked */
    let stack = [];
    let i = 0;
    while (i < code.length) {
        const op = code[i];
        const push = pushData(code, i);
        if (push) {
            for (let k = 0; k < push.count; k++) {
                const at = push.start + k * push.width;
                const value = push.width === 1 ? code[at] : ((code[at] << 8) | code[at + 1]) << 16 >> 16;
                if (stack) stack.push(value);
            }
            i = push.start + push.count * push.width;
            continue;
        }
        if (op === 0x2C || op === 0x89) { // FDEF, IDEF: skip the body to its ENDF
            const id = stack && stack.length ? stack.pop() : undefined;
            if (op === 0x2C) functionDefs = Math.max(functionDefs + (id === undefined ? 1 : 0), id === undefined ? 0 : id + 1);
            else instructionDefs++;
            i++;
            while (i < code.length && code[i] !== 0x2D) {
                const inner = pushData(code, i);
                i = inner ? inner.start + inner.count * inner.width : i + 1;
            }
            i++;
            continue;
        }
        stack = null; // any other instruction: pushed numbers are no longer known
        i++;
    }
    return { functionDefs, instructionDefs };
}

/**
 * TrueType hinting limits for maxp: the font's own values (`tables.maxp`, as authored or
 * imported; they cannot be derived from bytecode in general), never below what the font
 * program and glyph programs need where that can be counted.
 * @param {{ maxp?: Record<string, number>, fpgm?: ArrayLike<number>, prep?: ArrayLike<number> }} tables
 * @param {{ length: number, get: (index: number) => { instructions?: ArrayLike<number> } | undefined }} glyphs
 */
export function hintingLimits(tables, glyphs) {
    const given = tables.maxp || {};
    const value = (/** @type {string} */ name, fallback = 0) => Number.isInteger(given[name]) ? given[name] : fallback;
    const fpgm = countHintingDefinitions(tables.fpgm);
    const prep = countHintingDefinitions(tables.prep);
    let longestGlyphProgram = 0;
    for (let index = 0; index < glyphs.length; index++) {
        const instructions = glyphs.get(index)?.instructions;
        if (instructions && instructions.length > longestGlyphProgram) longestGlyphProgram = instructions.length;
    }
    return {
        maxZones: value('maxZones', 2),
        maxTwilightPoints: value('maxTwilightPoints'),
        maxStorage: value('maxStorage'),
        maxFunctionDefs: Math.max(value('maxFunctionDefs'), fpgm.functionDefs, prep.functionDefs),
        maxInstructionDefs: Math.max(value('maxInstructionDefs'), fpgm.instructionDefs + prep.instructionDefs),
        maxStackElements: value('maxStackElements'),
        maxSizeOfInstructions: Math.max(value('maxSizeOfInstructions'), longestGlyphProgram),
    };
}

/**
 * Create a maxp table.
 * @param {number} numGlyphs - Number of glyphs in the font
 * @param {boolean} isTrueType - Whether this is a TrueType (glyf) font
 * @param {{maxPoints?: number, maxContours?: number, maxCompositePoints?: number, maxCompositeContours?: number, maxComponentElements?: number, maxComponentDepth?: number, maxZones?: number, maxTwilightPoints?: number, maxStorage?: number, maxFunctionDefs?: number, maxInstructionDefs?: number, maxStackElements?: number, maxSizeOfInstructions?: number}} [options] - Optional parameters for TrueType fonts
 */
function makeMaxpTable(numGlyphs, isTrueType, options = {}) {
    if (isTrueType) {
        // Version 1.0 for TrueType fonts with glyf table
        return new table.Table('maxp', [
            {name: 'version', type: 'FIXED', value: 0x00010000},
            {name: 'numGlyphs', type: 'USHORT', value: numGlyphs},
            {name: 'maxPoints', type: 'USHORT', value: options.maxPoints || 0},
            {name: 'maxContours', type: 'USHORT', value: options.maxContours || 0},
            {name: 'maxCompositePoints', type: 'USHORT', value: options.maxCompositePoints || 0},
            {name: 'maxCompositeContours', type: 'USHORT', value: options.maxCompositeContours || 0},
            {name: 'maxZones', type: 'USHORT', value: options.maxZones ?? 2},
            {name: 'maxTwilightPoints', type: 'USHORT', value: options.maxTwilightPoints ?? 0},
            {name: 'maxStorage', type: 'USHORT', value: options.maxStorage ?? 0},
            {name: 'maxFunctionDefs', type: 'USHORT', value: options.maxFunctionDefs ?? 0},
            {name: 'maxInstructionDefs', type: 'USHORT', value: options.maxInstructionDefs ?? 0},
            {name: 'maxStackElements', type: 'USHORT', value: options.maxStackElements ?? 0},
            {name: 'maxSizeOfInstructions', type: 'USHORT', value: options.maxSizeOfInstructions ?? 0},
            {name: 'maxComponentElements', type: 'USHORT', value: options.maxComponentElements || 0},
            {name: 'maxComponentDepth', type: 'USHORT', value: options.maxComponentDepth || 0}
        ]);
    }
    // Version 0.5 for CFF fonts
    return new table.Table('maxp', [
        {name: 'version', type: 'FIXED', value: 0x00005000},
        {name: 'numGlyphs', type: 'USHORT', value: numGlyphs}
    ]);
}

export default { parse: parseMaxpTable, make: makeMaxpTable };
