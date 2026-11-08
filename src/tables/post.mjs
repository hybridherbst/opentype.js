// The `post` table stores additional PostScript information, such as glyph names.
// https://www.microsoft.com/typography/OTSPEC/post.htm

import { standardNames } from '../encoding.mjs';
import parse from '../parse.mjs';
import table from '../table.mjs';

// Parse the PostScript `post` table
function parsePostTable(data, start) {
    const post = {};
    const p = new parse.Parser(data, start);
    post.version = p.parseVersion();
    post.italicAngle = p.parseFixed();
    post.underlinePosition = p.parseShort();
    post.underlineThickness = p.parseShort();
    post.isFixedPitch = p.parseULong();
    post.minMemType42 = p.parseULong();
    post.maxMemType42 = p.parseULong();
    post.minMemType1 = p.parseULong();
    post.maxMemType1 = p.parseULong();
    switch (post.version) {
        case 1:
            post.names = standardNames.slice();
            break;
        case 2:
            post.numberOfGlyphs = p.parseUShort();
            post.glyphNameIndex = new Array(post.numberOfGlyphs);
            for (let i = 0; i < post.numberOfGlyphs; i++) {
                post.glyphNameIndex[i] = p.parseUShort();
            }

            post.names = [];
            for (let i = 0; i < post.numberOfGlyphs; i++) {
                if (post.glyphNameIndex[i] >= standardNames.length) {
                    const nameLength = p.parseChar();
                    post.names.push(p.parseString(nameLength));
                }
            }

            break;
        case 2.5:
            post.numberOfGlyphs = p.parseUShort();
            post.offset = new Array(post.numberOfGlyphs);
            for (let i = 0; i < post.numberOfGlyphs; i++) {
                post.offset[i] = p.parseChar();
            }

            break;
    }
    return post;
}

/**
 * The glyph names a format 2 post table writes, in glyph order: empty names
 * become `glyph<index>`, characters outside printable ASCII become `_`, and
 * names are truncated to 63 characters (OTS limits).
 *
 * `mode` 'preserve' (default) writes these names even when several glyphs
 * share one. 'unique' keeps the first occurrence and renames later ones
 * `name.1`, `name.2`, ... (skipping names already in use); glyph IDs, and so
 * layout and outlines, are unaffected.
 * @param {import('../font.mjs').default} font
 * @param {'preserve'|'unique'} [mode]
 * @returns {string[]}
 */
export function postGlyphNames(font, mode = 'preserve') {
    const count = font.glyphs ? font.glyphs.length : 0;
    const names = [];
    for (let i = 0; i < count; i++) {
        let name = (font.glyphs.get(i).name || '').replace(/[^\x21-\x7E]/g, '_');
        if (!name) name = 'glyph' + i;
        names.push(name.length > 63 ? name.substring(0, 63) : name);
    }
    if (mode !== 'unique') return names;
    const used = new Set(names);
    const seen = new Set();
    return names.map(name => {
        if (!seen.has(name)) { seen.add(name); return name; }
        let n = 1;
        let candidate;
        do {
            const suffix = '.' + n++;
            candidate = name.substring(0, 63 - suffix.length) + suffix;
        } while (used.has(candidate));
        used.add(candidate);
        seen.add(candidate);
        return candidate;
    });
}

/**
 * Glyph names a format 2 post table would write for more than one glyph.
 * Duplicate names are valid input to read, but QA tools (OTS, Font Bakery's
 * unique_glyphnames) report them in output; glyph identity is the glyph ID.
 * @param {import('../font.mjs').default} font
 * @returns {Array<{name: string, glyphIndices: number[]}>}
 */
export function findDuplicateGlyphNames(font) {
    const byName = new Map();
    const names = postGlyphNames(font);
    for (let index = 0; index < names.length; index++) {
        if (!byName.has(names[index])) byName.set(names[index], []);
        byName.get(names[index]).push(index);
    }
    return [...byName].filter(([, indices]) => indices.length > 1).map(([name, glyphIndices]) => ({ name, glyphIndices }));
}

function makePostTable(font, options = {}) {
    const {
        italicAngle = Math.round((font.italicAngle || 0) * 0x10000),
        underlinePosition = 0,
        underlineThickness = 0,
        isFixedPitch = 0,
        minMemType42 = 0,
        maxMemType42 = 0,
        minMemType1 = 0,
        maxMemType1 = 0
    } = font.tables.post || {};
    
    // Determine format: 2 = with glyph names, 3 = without
    const postFormat = options.postFormat || 3;
    
    if (postFormat === 2 && font.glyphs && font.glyphs.length > 0) {
        // Format 2: include glyph names
        const numberOfGlyphs = font.glyphs.length;
        const glyphNameIndex = [];
        const extraNames = [];
        const extraNamesMap = new Map(); // Map extra name -> index
        
        const names = postGlyphNames(font, options.glyphNames);
        for (let i = 0; i < numberOfGlyphs; i++) {
            const name = names[i];

            // Check if it's a standard name
            const stdIndex = standardNames.indexOf(name);
            if (stdIndex >= 0) {
                glyphNameIndex.push(stdIndex);
            } else {
                // Not a standard name, need to add to extra names
                if (extraNamesMap.has(name)) {
                    glyphNameIndex.push(extraNamesMap.get(name));
                } else {
                    const newIndex = 258 + extraNames.length;
                    extraNamesMap.set(name, newIndex);
                    extraNames.push(name);
                    glyphNameIndex.push(newIndex);
                }
            }
        }
        
        // Build the table with format 2
        const fields = [
            { name: 'version', type: 'FIXED', value: 0x00020000 },
            { name: 'italicAngle', type: 'FIXED', value: italicAngle },
            { name: 'underlinePosition', type: 'FWORD', value: underlinePosition },
            { name: 'underlineThickness', type: 'FWORD', value: underlineThickness },
            { name: 'isFixedPitch', type: 'ULONG', value: isFixedPitch },
            { name: 'minMemType42', type: 'ULONG', value: minMemType42 },
            { name: 'maxMemType42', type: 'ULONG', value: maxMemType42 },
            { name: 'minMemType1', type: 'ULONG', value: minMemType1 },
            { name: 'maxMemType1', type: 'ULONG', value: maxMemType1 },
            { name: 'numberOfGlyphs', type: 'USHORT', value: numberOfGlyphs }
        ];
        
        // Add glyph name indices
        for (let i = 0; i < numberOfGlyphs; i++) {
            fields.push({ name: 'glyphNameIndex_' + i, type: 'USHORT', value: glyphNameIndex[i] });
        }
        
        // Add extra name strings (Pascal strings: length byte + chars)
        for (let i = 0; i < extraNames.length; i++) {
            const truncatedName = extraNames[i];
            fields.push({ name: 'extraName_' + i + '_length', type: 'BYTE', value: truncatedName.length });
            for (let j = 0; j < truncatedName.length; j++) {
                fields.push({ name: 'extraName_' + i + '_char_' + j, type: 'BYTE', value: truncatedName.charCodeAt(j) & 0xFF });
            }
        }
        
        return new table.Table('post', fields);
    }
    
    // Default: Format 3 (no glyph names)
    return new table.Table('post', [
        { name: 'version', type: 'FIXED', value: 0x00030000 },
        { name: 'italicAngle', type: 'FIXED', value: italicAngle },
        { name: 'underlinePosition', type: 'FWORD', value: underlinePosition },
        { name: 'underlineThickness', type: 'FWORD', value: underlineThickness },
        { name: 'isFixedPitch', type: 'ULONG', value: isFixedPitch },
        { name: 'minMemType42', type: 'ULONG', value: minMemType42 },
        { name: 'maxMemType42', type: 'ULONG', value: maxMemType42 },
        { name: 'minMemType1', type: 'ULONG', value: minMemType1 },
        { name: 'maxMemType1', type: 'ULONG', value: maxMemType1 }
    ]);
}

export default { parse: parsePostTable, make: makePostTable };
