// The `GDEF` table contains various glyph properties
// https://docs.microsoft.com/en-us/typography/opentype/spec/gdef

import check from '../check.mjs';
import { Parser } from '../parse.mjs';
import table from '../table.mjs';
import { encodeItemVariationStore } from './hvar.mjs';

/**
 * @typedef {{ name: string, type: string, value: number | null | InstanceType<typeof table.ClassDef> | InstanceType<typeof table.Table>, appendPhase?: number }} GdefHeaderField
 */

var attachList = function() {
    return {
        coverage: this.parsePointer(Parser.coverage),
        attachPoints: this.parseList(Parser.pointer(Parser.uShortList))
    };
};

var caretValue = function() {
    var format = this.parseUShort();
    check.argument(format === 1 || format === 2 || format === 3,
        'Unsupported CaretValue table version.');
    if (format === 1) {
        return { coordinate: this.parseShort() };
    } else if (format === 2) {
        return { pointindex: this.parseShort() };
    } else if (format === 3) {
        // Device / Variation Index tables unsupported
        return { coordinate: this.parseShort() };
    }
};

var ligGlyph = function() {
    return this.parseList(Parser.pointer(caretValue));
};

var ligCaretList = function() {
    return {
        coverage: this.parsePointer(Parser.coverage),
        ligGlyphs: this.parseList(Parser.pointer(ligGlyph))
    };
};

// MarkGlyphSetsDef: format 1, then Offset32 coverage tables (one per mark glyph set).
var markGlyphSets = function() {
    this.parseUShort(); // Format
    return this.parseList(Parser.pointer32(Parser.coverage));
};

function parseGDEFTable(data, start) {
    start = start || 0;
    const p = new Parser(data, start);
    const tableVersion = p.parseVersion(1);
    check.argument(tableVersion === 1 || tableVersion === 1.2 || tableVersion === 1.3,
        'Unsupported GDEF table version.');
    var gdef = {
        version: tableVersion,
        classDef: p.parsePointer(Parser.classDef),
        attachList: p.parsePointer(attachList),
        ligCaretList: p.parsePointer(ligCaretList),
        markAttachClassDef: p.parsePointer(Parser.classDef)
    };
    if (tableVersion >= 1.2) {
        gdef.markGlyphSets = p.parsePointer(markGlyphSets);
    }
    // GDEF version 1.3 includes ItemVariationStore for GPOS/GSUB variations
    if (tableVersion >= 1.3) {
        gdef.itemVariationStore = p.parsePointer32(function() {
            return this.parseItemVariationStore();
        });
    }
    return gdef;
}

function makeGDEFTable(gdef, fvar) {
    if (!gdef) return undefined;

    const hasClassDef = !!gdef.classDef;
    const hasAttachList = !!gdef.attachList;
    const hasLigCaretList = !!gdef.ligCaretList;
    const hasMarkAttachClassDef = !!gdef.markAttachClassDef;
    const hasMarkGlyphSets = Array.isArray(gdef.markGlyphSets) && gdef.markGlyphSets.length > 0;
    const hasItemVariationStore = !!gdef.itemVariationStore && !!fvar;

    if (!hasClassDef &&
        !hasAttachList &&
        !hasLigCaretList &&
        !hasMarkAttachClassDef &&
        !hasMarkGlyphSets &&
        !hasItemVariationStore) {
        return undefined;
    }

    const version = hasItemVariationStore ? 1.3 : (hasMarkGlyphSets ? 1.2 : 1.0);
    const encodedVersion = version >= 1.3 ? 0x00010003 : version >= 1.2 ? 0x00010002 : 0x00010000;
    const glyphClassDefTable = hasClassDef ? new table.ClassDef(gdef.classDef) : null;
    const markAttachClassDefTable = hasMarkAttachClassDef ? new table.ClassDef(gdef.markAttachClassDef) : null;
    /** @type {GdefHeaderField[]} */
    const fields = [
        { name: 'version', type: 'FIXED', value: encodedVersion },
        { name: 'glyphClassDef', type: 'TABLE', value: glyphClassDefTable },
        { name: 'attachListOffset', type: 'USHORT', value: 0 },
        { name: 'ligCaretListOffset', type: 'USHORT', value: 0 },
        { name: 'markAttachClassDef', type: 'TABLE', value: markAttachClassDefTable }
    ];

    if (version >= 1.2) {
        const sets = hasMarkGlyphSets ? /** @type {Array<Record<string, unknown>>} */ (gdef.markGlyphSets) : [];
        const markGlyphSetsTable = sets.length > 0
            ? new table.Table('markGlyphSetsDef', [
                { name: 'format', type: 'USHORT', value: 1 },
                { name: 'markGlyphSetCount', type: 'USHORT', value: sets.length },
                ...sets.map((coverage, index) => ({ name: 'coverage' + index, type: 'OFFSET32', value: new table.Coverage(coverage) }))
            ])
            : null;
        fields.push({ name: 'markGlyphSetsDef', type: 'TABLE', value: markGlyphSetsTable });
    }
    if (version >= 1.3) {
        fields.push({
            name: 'itemVariationStore',
            type: 'OFFSET32',
            value: null,
            appendPhase: 100
        });
    }

    const result = new table.Table('GDEF', fields);
    if (version >= 1.3 && hasItemVariationStore) {
        const itemVariationStoreBytes = encodeItemVariationStore(gdef.itemVariationStore);
        if (itemVariationStoreBytes.length > 0) {
            const rec = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (result));
            rec.itemVariationStore = itemVariationStoreBytes;
        }
    }

    return result;
}

export default { parse: parseGDEFTable, make: makeGDEFTable };
