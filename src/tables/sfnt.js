// The `sfnt` wrapper provides organization for the tables in the font.
// It is the top-level data structure in a font.
// https://www.microsoft.com/typography/OTSPEC/otff.htm
// Recommendations for creating OpenType Fonts:
// http://www.microsoft.com/typography/otspec140/recom.htm

import check from '../check.js';
import table from '../table.js';

import cmap from './cmap.js';
import cff from './cff.js';
import head from './head.js';
import hhea from './hhea.js';
import hmtx from './hmtx.js';
// ltag is not imported - it's an Apple AAT table not part of OpenType spec
import maxp from './maxp.js';
import _name from './name.js';
import os2 from './os2.js';
import post from './post.js';
import gsub from './gsub.js';
import meta from './meta.js';
import colr from './colr.js';
import cpal from './cpal.js';
import cvt from './cvt.js';
import fpgm from './fpgm.js';
import prep from './prep.js';
import fvar from './fvar.js';
import stat from './stat.js';
import avar from './avar.js';
import cvar from './cvar.js';
import gvar from './gvar.js';
import hvar from './hvar.js';
import gasp from './gasp.js';
import svg from './svg.js';
import glyf from './glyf.js';
import loca from './loca.js';

function log2(v) {
    return Math.log(v) / Math.log(2) | 0;
}

function computeCheckSum(bytes) {
    while (bytes.length % 4 !== 0) {
        bytes.push(0);
    }

    let sum = 0;
    for (let i = 0; i < bytes.length; i += 4) {
        sum += (bytes[i] << 24) +
            (bytes[i + 1] << 16) +
            (bytes[i + 2] << 8) +
            (bytes[i + 3]);
    }

    sum %= Math.pow(2, 32);
    return sum;
}

function makeTableRecord(tag, checkSum, offset, length) {
    return new table.Record('Table Record', [
        {name: 'tag', type: 'TAG', value: tag !== undefined ? tag : ''},
        {name: 'checkSum', type: 'ULONG', value: checkSum !== undefined ? checkSum : 0},
        {name: 'offset', type: 'ULONG', value: offset !== undefined ? offset : 0},
        {name: 'length', type: 'ULONG', value: length !== undefined ? length : 0}
    ]);
}

function makeSfntTable(tables) {
    // Determine signature based on outline format
    // 'OTTO' = CFF outlines, 0x00010000 = TrueType outlines
    const hasGlyf = tables.some(t => t.tableName === 'glyf');
    const version = hasGlyf ? '\x00\x01\x00\x00' : 'OTTO';
    
    const sfnt = new table.Table('sfnt', [
        {name: 'version', type: 'TAG', value: version},
        {name: 'numTables', type: 'USHORT', value: 0},
        {name: 'searchRange', type: 'USHORT', value: 0},
        {name: 'entrySelector', type: 'USHORT', value: 0},
        {name: 'rangeShift', type: 'USHORT', value: 0}
    ]);
    sfnt.tables = tables;
    sfnt.numTables = tables.length;
    const highestPowerOf2 = Math.pow(2, log2(sfnt.numTables));
    sfnt.searchRange = 16 * highestPowerOf2;
    sfnt.entrySelector = log2(highestPowerOf2);
    sfnt.rangeShift = sfnt.numTables * 16 - sfnt.searchRange;

    const recordFields = [];
    const tableFields = [];

    let offset = sfnt.sizeOf() + (makeTableRecord().sizeOf() * sfnt.numTables);
    while (offset % 4 !== 0) {
        offset += 1;
        tableFields.push({name: 'padding', type: 'BYTE', value: 0});
    }

    for (let i = 0; i < tables.length; i += 1) {
        const t = tables[i];
        check.argument(t.tableName.length === 4, 'Table name' + t.tableName + ' is invalid.');
        const tableLength = t.sizeOf();
        const tableRecord = makeTableRecord(t.tableName, computeCheckSum(t.encode()), offset, tableLength);
        recordFields.push({name: tableRecord.tag + ' Table Record', type: 'RECORD', value: tableRecord});
        tableFields.push({name: t.tableName + ' table', type: 'RECORD', value: t});
        offset += tableLength;
        check.argument(!isNaN(offset), 'Something went wrong calculating the offset.');
        while (offset % 4 !== 0) {
            offset += 1;
            tableFields.push({name: 'padding', type: 'BYTE', value: 0});
        }
    }

    // Table records need to be sorted alphabetically.
    recordFields.sort(function(r1, r2) {
        if (r1.value.tag > r2.value.tag) {
            return 1;
        } else {
            return -1;
        }
    });

    sfnt.fields = sfnt.fields.concat(recordFields);
    sfnt.fields = sfnt.fields.concat(tableFields);
    return sfnt;
}

// Get the metrics for a character. If the string has more than one character
// this function returns metrics for the first available character.
// You can provide optional fallback metrics if no characters are available.
function metricsForChar(font, chars, notFoundMetrics) {
    for (let i = 0; i < chars.length; i += 1) {
        const glyphIndex = font.charToGlyphIndex(chars[i]);
        if (glyphIndex > 0) {
            const glyph = font.glyphs.get(glyphIndex);
            return glyph.getMetrics();
        }
    }

    return notFoundMetrics;
}

function average(vs) {
    let sum = 0;
    for (let i = 0; i < vs.length; i += 1) {
        sum += vs[i];
    }

    return sum / vs.length;
}

// Convert the font object to a SFNT data structure.
// This structure contains all the necessary tables and metadata to create a binary OTF file.
function fontToSfntTable(font) {
    const xMins = [];
    const yMins = [];
    const xMaxs = [];
    const yMaxs = [];
    const advanceWidths = [];
    const leftSideBearings = [];
    const rightSideBearings = [];
    let firstCharIndex;
    let lastCharIndex = 0;
    let ulUnicodeRange1 = 0;
    let ulUnicodeRange2 = 0;
    let ulUnicodeRange3 = 0;
    let ulUnicodeRange4 = 0;

    for (let i = 0; i < font.glyphs.length; i += 1) {
        const glyph = font.glyphs.get(i);
        const unicode = glyph.unicode | 0;

        if (isNaN(glyph.advanceWidth)) {
            throw new Error('Glyph ' + glyph.name + ' (' + i + '): advanceWidth is not a number.');
        }

        if (firstCharIndex > unicode || firstCharIndex === undefined) {
            // ignore .notdef char
            if (unicode > 0) {
                firstCharIndex = unicode;
            }
        }

        if (lastCharIndex < unicode) {
            lastCharIndex = unicode;
        }

        const position = os2.getUnicodeRange(unicode);
        if (position < 32) {
            ulUnicodeRange1 |= 1 << position;
        } else if (position < 64) {
            ulUnicodeRange2 |= 1 << position - 32;
        } else if (position < 96) {
            ulUnicodeRange3 |= 1 << position - 64;
        } else if (position < 123) {
            ulUnicodeRange4 |= 1 << position - 96;
        } else {
            throw new Error('Unicode ranges bits > 123 are reserved for internal usage');
        }
        // Skip non-important characters.
        if (glyph.name === '.notdef') continue;
        const metrics = glyph.getMetrics();
        xMins.push(metrics.xMin);
        yMins.push(metrics.yMin);
        xMaxs.push(metrics.xMax);
        yMaxs.push(metrics.yMax);
        leftSideBearings.push(metrics.leftSideBearing);
        rightSideBearings.push(metrics.rightSideBearing);
        advanceWidths.push(glyph.advanceWidth);
    }

    const globals = {
        xMin: xMins.length > 0 ? Math.min.apply(null, xMins) : 0,
        yMin: yMins.length > 0 ? Math.min.apply(null, yMins) : 0,
        xMax: xMaxs.length > 0 ? Math.max.apply(null, xMaxs) : 0,
        yMax: yMaxs.length > 0 ? Math.max.apply(null, yMaxs) : 0,
        advanceWidthMax: advanceWidths.length > 0 ? Math.max.apply(null, advanceWidths) : 0,
        advanceWidthAvg: advanceWidths.length > 0 ? average(advanceWidths) : 0,
        minLeftSideBearing: leftSideBearings.length > 0 ? Math.min.apply(null, leftSideBearings) : 0,
        maxLeftSideBearing: leftSideBearings.length > 0 ? Math.max.apply(null, leftSideBearings) : 0,
        minRightSideBearing: rightSideBearings.length > 0 ? Math.min.apply(null, rightSideBearings) : 0
    };
    
    // Ensure all values are finite numbers
    for (const key of Object.keys(globals)) {
        if (!Number.isFinite(globals[key])) {
            globals[key] = 0;
        }
    }
    
    globals.ascender = font.ascender;
    globals.descender = font.descender;

    // macStyle bits must agree with the fsSelection bits
    let macStyle = 0;
    if (font.weightClass >= 600) {
        macStyle |= font.macStyleValues.BOLD;
    }
    if (font.italicAngle < 0) {
        macStyle |= font.macStyleValues.ITALIC;
    }
    
    // Parse version from name table to sync with head.fontRevision
    let fontRevision = 1.0;
    const versionString = font.getEnglishName ? font.getEnglishName('version') : null;
    if (versionString) {
        // Parse version number from string like "Version 3.001" or "3.001"
        const match = versionString.match(/(\d+)\.?(\d*)/);
        if (match) {
            const major = parseInt(match[1], 10);
            const minor = match[2] ? parseInt(match[2].padEnd(3, '0').slice(0, 3), 10) : 0;
            fontRevision = major + minor / 1000;
        }
    }

    const headTable = head.make({
        flags: 3, // 00000011 (baseline for font at y=0; left sidebearing point at x=0)
        unitsPerEm: font.unitsPerEm,
        xMin: globals.xMin,
        yMin: globals.yMin,
        xMax: globals.xMax,
        yMax: globals.yMax,
        lowestRecPPEM: 3,
        macStyle: macStyle,
        createdTimestamp: font.createdTimestamp,
        fontRevision: fontRevision
    });

    const hheaTable = hhea.make({
        ascender: globals.ascender,
        descender: globals.descender,
        advanceWidthMax: globals.advanceWidthMax,
        minLeftSideBearing: globals.minLeftSideBearing,
        minRightSideBearing: globals.minRightSideBearing,
        xMaxExtent: globals.maxLeftSideBearing + (globals.xMax - globals.xMin),
        numberOfHMetrics: font.glyphs.length,
    });

    // Determine if we need TrueType outlines (glyf) instead of CFF
    // gvar table only works with TrueType outlines, so if we have gvar, we must use glyf+loca
    // Also use TrueType outlines if the font was originally TrueType (outlinesFormat === 'truetype')
    const hasGvarData = font.tables.gvar && font.tables.gvar.glyphVariations && 
                        Object.keys(font.tables.gvar.glyphVariations).length > 0;
    const isTrueTypeFont = font.outlinesFormat === 'truetype';
    const useTrueTypeOutlines = hasGvarData || isTrueTypeFont;

    const maxpTable = maxp.make(font.glyphs.length, useTrueTypeOutlines);

    // OS/2 sTypo* metrics should match hhea to produce consistent linespacing
    // across Mac, GNU+Linux and Windows
    const os2Table = os2.make(Object.assign({
        xAvgCharWidth: Math.round(globals.advanceWidthAvg),
        usFirstCharIndex: firstCharIndex,
        usLastCharIndex: lastCharIndex,
        ulUnicodeRange1: ulUnicodeRange1,
        ulUnicodeRange2: ulUnicodeRange2,
        ulUnicodeRange3: ulUnicodeRange3,
        ulUnicodeRange4: ulUnicodeRange4,
        // OS/2 sTypo* values match hhea values for consistent linespacing
        sTypoAscender: globals.ascender,
        sTypoDescender: globals.descender,
        sTypoLineGap: 0, // hhea lineGap is 0
        usWinAscent: globals.yMax,
        usWinDescent: Math.abs(globals.yMin),
        ulCodePageRange1: 1, // FIXME: hard-code Latin 1 support for now
        sxHeight: metricsForChar(font, 'xyvw', {yMax: Math.round(globals.ascender / 2)}).yMax,
        sCapHeight: metricsForChar(font, 'HIKLEFJMNTZBDPRAGOQSUVWXY', globals).yMax,
        usDefaultChar: font.hasChar(' ') ? 32 : 0, // Use space as the default character, if available.
        usBreakChar: font.hasChar(' ') ? 32 : 0, // Use space as the break character, if available.
    }, font.tables.os2));

    const hmtxTable = hmtx.make(font.glyphs);
    const cmapTable = cmap.make(font.glyphs);

    const englishFamilyName = font.getEnglishName('fontFamily');
    const englishStyleName = font.getEnglishName('fontSubfamily');
    
    // Ensure fullName starts with familyName (required by fontspector)
    let englishFullName = font.getEnglishName('fullName');
    if (!englishFullName || !englishFullName.startsWith(englishFamilyName)) {
        englishFullName = englishFamilyName + ' ' + englishStyleName;
    }
    
    let postScriptName = font.getEnglishName('postScriptName');
    if (!postScriptName) {
        postScriptName = englishFamilyName.replace(/\s/g, '') + '-' + englishStyleName;
    }

    // Deep copy names to avoid mutating the original font object
    const names = {};
    for (let platform in font.names) {
        names[platform] = {};
        for (let key in font.names[platform]) {
            // Each name value is an object like {en: 'string', ...}
            names[platform][key] = { ...font.names[platform][key] };
        }
    }

    names.unicode = names.unicode || {};
    names.macintosh = names.macintosh || {};
    names.windows = names.windows || {};

    const fontNamesUnicode = font.names.unicode || {};
    const fontNamesMacintosh = font.names.macintosh || {};
    const fontNamesWindows = font.names.windows || {};

    // Since we're only outputting windows platform entries (to avoid ltag/Mac entries),
    // ensure windows has all the best values from other platforms.
    // Priority: unicode (most likely to be user-modified) > windows > macintosh
    const namesToSync = ['fontFamily', 'fontSubfamily', 'fullName', 'postScriptName', 'version', 
        'copyright', 'trademark', 'manufacturer', 'designer', 'description',
        'manufacturerURL', 'designerURL', 'license', 'licenseURL',
        'preferredFamily', 'preferredSubfamily', 'uniqueID'];
    
    for (const nameKey of namesToSync) {
        if (!names.windows[nameKey] || 
            (fontNamesUnicode[nameKey] && JSON.stringify(fontNamesUnicode[nameKey]) !== JSON.stringify(fontNamesWindows[nameKey]))) {
            // Use unicode value if it differs from windows (meaning user modified unicode)
            names.windows[nameKey] = fontNamesUnicode[nameKey] || fontNamesWindows[nameKey] || fontNamesMacintosh[nameKey];
        }
    }

    // do this as a loop to reduce redundant code
    for (const platform in ['unicode', 'macintosh', 'windows']) {

        names[platform] = names[platform] || {};

        if (!names[platform].uniqueID) {
            names.unicode.uniqueID = {en: font.getEnglishName('manufacturer') + ':' + englishFullName};
        }

        if (!names[platform].postScriptName) {
            names.unicode.postScriptName = {en: postScriptName};
        }
        
        // Ensure fullName is set and starts with family name
        if (!names[platform].fullName) {
            names[platform].fullName = {en: englishFullName};
        }
    }

    // Ensure windows fullName is always set correctly (most important for apps)
    if (!names.windows.fullName || !Object.values(names.windows.fullName)[0]?.startsWith(englishFamilyName)) {
        names.windows.fullName = {en: englishFullName};
    }

    // this cannot be done as a loop as each one is unique.
    if (!names.unicode.preferredFamily) {
        names.unicode.preferredFamily = fontNamesUnicode.fontFamily || fontNamesMacintosh.fontFamily || fontNamesWindows.fontFamily;
    }

    if (!names.macintosh.preferredFamily) {
        names.macintosh.preferredFamily = fontNamesMacintosh.fontFamily || fontNamesUnicode.fontFamily || fontNamesWindows.fontFamily;
    }

    if (!names.windows.preferredFamily) {
        names.windows.preferredFamily = fontNamesWindows.fontFamily || fontNamesUnicode.fontFamily || fontNamesMacintosh.fontFamily;
    }

    if (!names.unicode.preferredSubfamily) {
        names.unicode.preferredSubfamily = fontNamesUnicode.fontSubfamily || fontNamesMacintosh.fontSubfamily || fontNamesWindows.fontSubfamily;
    }

    if (!names.macintosh.preferredSubfamily) {
        names.macintosh.preferredSubfamily = fontNamesMacintosh.fontSubfamily || fontNamesUnicode.fontSubfamily || fontNamesWindows.fontSubfamily;
    }

    if (!names.windows.preferredSubfamily) {
        names.windows.preferredSubfamily = fontNamesWindows.fontSubfamily || fontNamesUnicode.fontSubfamily || fontNamesMacintosh.fontSubfamily;
    }

    // No ltag table - it's an Apple AAT table not part of OpenType spec
    // Modern fonts should not include it (fontspector will flag as unwanted_aat_tables)
    const languageTags = [];
    // Skip Mac platform name entries (fontspector no_mac_entries recommendation)
    const nameTable = _name.make(names, languageTags, { skipMacPlatform: true });
    // Skip ltag table creation - not needed for modern fonts

    const postTable = post.make(font);
    
    const metaTable = (font.metas && Object.keys(font.metas).length > 0) ? meta.make(font.metas) : undefined;

    // The order does not matter because makeSfntTable() will sort them.
    const tables = [headTable, hheaTable, maxpTable, os2Table, nameTable, cmapTable, postTable, hmtxTable];
    
    if (useTrueTypeOutlines) {
        // Use TrueType outlines (glyf + loca) for variable fonts with gvar
        const glyfResult = glyf.make(font.glyphs);
        
        // Determine if we can use short loca format (all offsets fit in 16-bit when divided by 2)
        const maxOffset = glyfResult.offsets[glyfResult.offsets.length - 1];
        const useShortLoca = maxOffset < 65536 * 2;
        
        // Update head table with indexToLocFormat
        headTable.indexToLocFormat = useShortLoca ? 0 : 1;
        // Update the actual field in the table
        for (const field of headTable.fields) {
            if (field.name === 'indexToLocFormat') {
                field.value = useShortLoca ? 0 : 1;
                break;
            }
        }
        
        // Create loca table
        const locaTable = loca.make(glyfResult.offsets, useShortLoca);
        tables.push(locaTable);
        
        // Create glyf table as a raw data table
        const glyfTable = new table.Table('glyf', [
            { name: 'glyphs', type: 'LITERAL', value: Array.from(glyfResult.glyfData) }
        ]);
        tables.push(glyfTable);
    } else {
        // Use CFF outlines
        const useCFFtable = font.tables.cff || font.tables.cff2;
        // Prefer CFF2 when the font already has CFF2 table (which has proper vstore and blend operators)
        // CFF1 fonts with fvar are converted to TTF (glyf+gvar) for variable font export
        // Allow forcing CFF1 via font.options.forceCFF1
        const forceCFF1 = font.options && font.options.forceCFF1;
        const preferCFF2 = !forceCFF1 && font.tables.cff2;
        const cffVersionToWrite = preferCFF2 ? 2 : 1;
        const cffTable = cff.make(font.glyphs, {
            version: font.getEnglishName('version'),
            fullName: englishFullName,
            familyName: englishFamilyName,
            weightName: englishStyleName,
            postScriptName: postScriptName,
            unitsPerEm: font.unitsPerEm,
            fontBBox: [0, globals.yMin, globals.ascender, globals.advanceWidthMax],
            topDict: useCFFtable && useCFFtable.topDict || {},
        }, cffVersionToWrite);
        tables.push(cffTable);
    }

    // Optional tables
    const optionalTables = {
        gsub,
        cpal,
        colr,
        stat,
        avar,
        cvt,
        fpgm,
        prep,
        cvar,
        fvar, 
        gvar,
        hvar,
        gasp,
        svg,
    };

    const optionalTableArgs = {
        avar: [font.tables.fvar],
        fvar: [font.names],
        gvar: [font.tables.fvar],
    };

    for (let tableName in optionalTables) {
        const optTable = font.tables[tableName];
        if (optTable) {
            const tableData = optionalTables[tableName].make.call(font, optTable, ...(optionalTableArgs[tableName] || []));
            if (tableData) {
                tables.push(tableData);
            }
        }
    }

    if (metaTable) {
        tables.push(metaTable);
    }

    const sfntTable = makeSfntTable(tables);

    // Compute the font's checkSum and store it in head.checkSumAdjustment.
    const bytes = sfntTable.encode();
    const checkSum = computeCheckSum(bytes);
    const tableFields = sfntTable.fields;
    let checkSumAdjusted = false;
    for (let i = 0; i < tableFields.length; i += 1) {
        if (tableFields[i].name === 'head table') {
            tableFields[i].value.checkSumAdjustment = 0xB1B0AFBA - checkSum;
            checkSumAdjusted = true;
            break;
        }
    }

    if (!checkSumAdjusted) {
        throw new Error('Could not find head table with checkSum to adjust.');
    }

    return sfntTable;
}

export default { make: makeSfntTable, fontToTable: fontToSfntTable, computeCheckSum };
