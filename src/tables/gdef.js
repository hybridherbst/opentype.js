// The `GDEF` table contains various glyph properties
// https://docs.microsoft.com/en-us/typography/opentype/spec/gdef

import check from '../check.js';
import { Parser } from '../parse.js';
import table from '../table.js';
import { encodeItemVariationStore } from './hvar.js';

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

var markGlyphSets = function() {
    this.parseUShort(); // Version
    return this.parseList(Parser.pointer(Parser.coverage));
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
    const hasMarkGlyphSets = !!gdef.markGlyphSets;
    const hasItemVariationStore = !!gdef.itemVariationStore;

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
    const fields = [
        { name: 'version', type: 'FIXED', value: encodedVersion },
        { name: 'glyphClassDefOffset', type: 'USHORT', value: 0 },
        { name: 'attachListOffset', type: 'USHORT', value: 0 },
        { name: 'ligCaretListOffset', type: 'USHORT', value: 0 },
        { name: 'markAttachClassDefOffset', type: 'USHORT', value: 0 }
    ];

    if (version >= 1.2) {
        fields.push({ name: 'markGlyphSetsDefOffset', type: 'USHORT', value: 0 });
    }
    if (version >= 1.3) {
        fields.push({ name: 'itemVariationStoreOffset', type: 'ULONG', value: 0 });
    }

    const result = new table.Table('GDEF', fields);
    if (version >= 1.3 && hasItemVariationStore) {
        if (!fvar) {
            throw new Error('GDEF ItemVariationStore requires fvar axes when writing variable positioning data.');
        }
        const itemVariationStoreBytes = encodeItemVariationStore(gdef.itemVariationStore);
        if (itemVariationStoreBytes.length > 0) {
            const headerSize = result.sizeOf();
            const rec = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (result));
            rec.itemVariationStoreOffset = headerSize;
            result.fields.push({
                name: 'itemVariationStore',
                type: 'LITERAL',
                value: itemVariationStoreBytes
            });
        }
    }

    return result;
}

export default { parse: parseGDEFTable, make: makeGDEFTable };
