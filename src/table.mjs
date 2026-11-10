// Table metadata

import check from './check.mjs';
import { encode, sizeOf } from './types.mjs';

/**
 * @exports opentype.Table
 * @class
 * @param {string} tableName
 * @param {Array} fields
 * @param {Record<string, unknown>} [options]
 * @constructor
 */
function Table(tableName, fields, options) {
    if (fields && fields.length) {
        for (let i = 0; i < fields.length; i += 1) {
            const field = fields[i];
            this[field.name] = field.value;
        }
    }

    this.tableName = tableName;
    this.fields = fields;
    if (options) {
        const optionKeys = Object.keys(options);
        for (let i = 0; i < optionKeys.length; i += 1) {
            const k = optionKeys[i];
            const v = options[k];
            if (this[k] !== undefined) {
                this[k] = v;
            }
        }
    }
}

/**
 * Encodes the table and returns an array of bytes
 * @return {Array}
 */
Table.prototype.encode = function() {
    return encode.TABLE(/** @type {Record<string, unknown> & { fields?: Array<{name: string, type: string, value?: unknown}>, tableName?: string }} */ (/** @type {unknown} */ (this)));
};

/**
 * Get the size of the table.
 * @return {number}
 */
Table.prototype.sizeOf = function() {
    return sizeOf.TABLE(/** @type {Record<string, unknown> & { fields?: Array<{name: string, type: string, value?: unknown}> }} */ (/** @type {unknown} */ (this)));
};

/**
 * @private
 */
function ushortList(itemName, list, count) {
    if (count === undefined) {
        count = list.length;
    }
    const fields = new Array(list.length + 1);
    fields[0] = {name: itemName + 'Count', type: 'USHORT', value: count};
    for (let i = 0; i < list.length; i++) {
        fields[i + 1] = {name: itemName + i, type: 'USHORT', value: list[i]};
    }
    return fields;
}

/**
 * @private
 */
function tableList(itemName, records, itemCallback) {
    const count = records.length;
    const fields = new Array(count + 1);
    fields[0] = {name: itemName + 'Count', type: 'USHORT', value: count};
    for (let i = 0; i < count; i++) {
        fields[i + 1] = {name: itemName + i, type: 'TABLE', value: itemCallback(records[i], i)};
    }
    return fields;
}

/**
 * @private
 */
function recordList(itemName, records, itemCallback) {
    const count = records.length;
    let fields = [];
    fields[0] = {name: itemName + 'Count', type: 'USHORT', value: count};
    for (let i = 0; i < count; i++) {
        fields = fields.concat(itemCallback(records[i], i));
    }
    return fields;
}

// Common Layout Tables

/**
 * The glyphs of a coverage table in coverage-index order, or null when they are not
 * strictly increasing (then the given format and order are written as they are).
 * @param {Record<string, unknown>} coverageTable
 * @returns {number[] | null}
 */
function coverageGlyphs(coverageTable) {
    /** @type {number[]} */
    let glyphs;
    if (coverageTable.format === 1) {
        glyphs = /** @type {number[]} */ (coverageTable.glyphs || []);
    } else if (coverageTable.format === 2) {
        glyphs = [];
        for (const range of /** @type {Array<{start: number, end: number, index?: number, startCoverageIndex?: number}>} */ (coverageTable.ranges || [])) {
            const index = range.index ?? range.startCoverageIndex ?? glyphs.length;
            if (index !== glyphs.length || range.end < range.start) return null;
            for (let glyph = range.start; glyph <= range.end; glyph++) glyphs.push(glyph);
        }
    } else {
        return null;
    }
    for (let i = 0; i < glyphs.length; i++) {
        if (!Number.isInteger(glyphs[i]) || (i > 0 && glyphs[i] <= glyphs[i - 1])) return null;
    }
    return glyphs;
}

/**
 * Consecutive glyph runs of a sorted glyph list as coverage RangeRecords.
 * @param {number[]} glyphs
 * @returns {Array<{start: number, end: number, index: number}>}
 */
function coverageRanges(glyphs) {
    const ranges = [];
    for (let i = 0; i < glyphs.length; i++) {
        const last = ranges[ranges.length - 1];
        if (last && glyphs[i] === last.end + 1) last.end = glyphs[i];
        else ranges.push({ start: glyphs[i], end: glyphs[i], index: i });
    }
    return ranges;
}

/**
 * A Coverage table in the smaller of its two formats (format 2 when its range records
 * take fewer bytes than the glyph array, as fontTools chooses). The given format only
 * describes the glyphs; a coverage whose glyphs are not in increasing order is written
 * as given.
 * @exports opentype.Coverage
 * @class
 * @param {Record<string, unknown>} coverageTable
 * @constructor
 */
function Coverage(coverageTable) {
    check.assert(coverageTable.format === 1 || coverageTable.format === 2, 'Coverage format must be 1 or 2.');
    const glyphs = coverageGlyphs(coverageTable);
    let format = coverageTable.format;
    let list = /** @type {number[]} */ (coverageTable.glyphs);
    let ranges = /** @type {Array<{start: number, end: number, index?: number, startCoverageIndex?: number}>} */ (coverageTable.ranges);
    if (glyphs) {
        ranges = coverageRanges(glyphs);
        list = glyphs;
        format = ranges.length * 3 < glyphs.length ? 2 : 1;
    }
    if (format === 1) {
        Table.call(this, 'coverageTable',
            [{name: 'coverageFormat', type: 'USHORT', value: 1}]
                .concat(ushortList('glyph', list))
        );
    } else {
        Table.call(this, 'coverageTable',
            [{name: 'coverageFormat', type: 'USHORT', value: 2}]
                .concat(recordList('rangeRecord', ranges, function(RangeRecord, i) {
                    return [
                        {name: 'startGlyphID' + i, type: 'USHORT', value: RangeRecord.start},
                        {name: 'endGlyphID' + i, type: 'USHORT', value: RangeRecord.end},
                        {name: 'startCoverageIndex' + i, type: 'USHORT', value: RangeRecord.index ?? RangeRecord.startCoverageIndex},
                    ];
                }))
        );
    }
}
Coverage.prototype = Object.create(Table.prototype);
Coverage.prototype.constructor = Coverage;

function ScriptList(scriptListTable) {
    Table.call(this, 'scriptListTable',
        recordList('scriptRecord', scriptListTable, function(scriptRecord, i) {
            const script = scriptRecord.script;
            let defaultLangSys = script.defaultLangSys;
            check.assert(!!defaultLangSys, 'Unable to write GSUB: script ' + scriptRecord.tag + ' has no default language system.');
            return [
                {name: 'scriptTag' + i, type: 'TAG', value: scriptRecord.tag},
                {name: 'script' + i, type: 'TABLE', value: new Table('scriptTable', [
                    {name: 'defaultLangSys', type: 'TABLE', value: new Table('defaultLangSys', [
                        {name: 'lookupOrder', type: 'USHORT', value: 0},
                        {name: 'reqFeatureIndex', type: 'USHORT', value: defaultLangSys.reqFeatureIndex}]
                        .concat(ushortList('featureIndex', defaultLangSys.featureIndexes)))}
                ].concat(recordList('langSys', script.langSysRecords, function(langSysRecord, i) {
                    const langSys = langSysRecord.langSys;
                    return [
                        {name: 'langSysTag' + i, type: 'TAG', value: langSysRecord.tag},
                        {name: 'langSys' + i, type: 'TABLE', value: new Table('langSys', [
                            {name: 'lookupOrder', type: 'USHORT', value: 0},
                            {name: 'reqFeatureIndex', type: 'USHORT', value: langSys.reqFeatureIndex}
                        ].concat(ushortList('featureIndex', langSys.featureIndexes)))}
                    ];
                })))}
            ];
        })
    );
}
ScriptList.prototype = Object.create(Table.prototype);
ScriptList.prototype.constructor = ScriptList;

/**
 * A FeatureParams table, written at an offset from its Feature table.
 * @param {import('./parse.mjs').FeatureParams} params
 * @returns {Table}
 */
function makeFeatureParams(params) {
    if (params.kind === 'stylisticSet') {
        return new Table('featureParams', [
            {name: 'version', type: 'USHORT', value: params.version || 0},
            {name: 'uiNameID', type: 'USHORT', value: params.uiNameID},
        ]);
    }
    if (params.kind === 'characterVariant') {
        const characters = params.characters || [];
        return new Table('featureParams', [
            {name: 'format', type: 'USHORT', value: params.format || 0},
            {name: 'featUiLabelNameId', type: 'USHORT', value: params.featUiLabelNameId || 0},
            {name: 'featUiTooltipTextNameId', type: 'USHORT', value: params.featUiTooltipTextNameId || 0},
            {name: 'sampleTextNameId', type: 'USHORT', value: params.sampleTextNameId || 0},
            {name: 'numNamedParameters', type: 'USHORT', value: params.numNamedParameters || 0},
            {name: 'firstParamUiLabelNameId', type: 'USHORT', value: params.firstParamUiLabelNameId || 0},
            {name: 'charCount', type: 'USHORT', value: characters.length},
            ...characters.map((character, i) => ({name: 'character' + i, type: 'UINT24', value: character})),
        ]);
    }
    if (params.kind === 'size') {
        return new Table('featureParams', [
            {name: 'designSize', type: 'USHORT', value: params.designSize},
            {name: 'subfamilyIdentifier', type: 'USHORT', value: params.subfamilyIdentifier},
            {name: 'subfamilyNameID', type: 'USHORT', value: params.subfamilyNameID},
            {name: 'rangeStart', type: 'USHORT', value: params.rangeStart},
            {name: 'rangeEnd', type: 'USHORT', value: params.rangeEnd},
        ]);
    }
    throw new Error('Unknown FeatureParams kind ' + /** @type {{kind?: unknown}} */ (params).kind);
}

/**
 * @exports opentype.FeatureList
 * @class
 * @param {Array<{tag: string, feature: {featureParams?: import('./parse.mjs').FeatureParams | 0, lookupListIndexes: number[]}}>} featureListTable
 * @constructor
 */
function FeatureList(featureListTable) {
    Table.call(this, 'featureListTable',
        recordList('featureRecord', featureListTable, function(featureRecord, i) {
            const feature = featureRecord.feature;
            // FeatureParams is an offset from the Feature table; a bare number (a parsed
            // offset into another font) has no meaning here and is written as none.
            const params = feature.featureParams && typeof feature.featureParams === 'object' ? feature.featureParams : null;
            return [
                {name: 'featureTag' + i, type: 'TAG', value: featureRecord.tag},
                {name: 'feature' + i, type: 'TABLE', value: new Table('featureTable', [
                    params
                        ? {name: 'featureParams', type: 'TABLE', value: makeFeatureParams(params)}
                        : {name: 'featureParams', type: 'USHORT', value: 0},
                ].concat(ushortList('lookupListIndex', feature.lookupListIndexes)))}
            ];
        })
    );
}
FeatureList.prototype = Object.create(Table.prototype);
FeatureList.prototype.constructor = FeatureList;

/**
 * @exports opentype.LookupList
 * @class
 * @param {Array<{lookupType: number, lookupFlag: number, subtables: unknown[], markFilteringSet?: number}>} lookupListTable
 * @param {Record<number, Function>} subtableMakers
 * @constructor
 */
function LookupList(lookupListTable, subtableMakers) {
    Table.call(this, 'lookupListTable', tableList('lookup', lookupListTable, function(lookupTable) {
        let subtableCallback = subtableMakers[lookupTable.lookupType];
        check.assert(!!subtableCallback, 'Unable to write GSUB lookup type ' + lookupTable.lookupType + ' tables.');
        let subtableFields = tableList('subtable', lookupTable.subtables, subtableCallback);
        // Extension subtables (GSUB 7, GPOS 9) are laid out after every Lookup table, as
        // fontTools does: the LookupList's 16-bit offsets then only span the compact
        // Lookup tables, so thousands of lookups stay addressable.
        if (lookupTable.lookupType === 7 || lookupTable.lookupType === 9) {
            subtableFields = subtableFields.map((field) => Object.assign({}, field, {targetScope: 'parent'}));
        }
        const fields = [
            {name: 'lookupType', type: 'USHORT', value: lookupTable.lookupType},
            {name: 'lookupFlag', type: 'USHORT', value: lookupTable.lookupFlag}
        ].concat(subtableFields);
        // UseMarkFilteringSet (0x0010): the MarkGlyphSets index follows the subtable offsets.
        if (lookupTable.lookupFlag & 0x0010) {
            check.argument(Number.isInteger(lookupTable.markFilteringSet) && lookupTable.markFilteringSet >= 0,
                'A lookup with UseMarkFilteringSet needs a markFilteringSet index.');
            fields.push({name: 'markFilteringSet', type: 'USHORT', value: lookupTable.markFilteringSet});
        }
        return new Table('lookupTable', fields);
    }));
}
LookupList.prototype = Object.create(Table.prototype);
LookupList.prototype.constructor = LookupList;

/**
 * Glyph → class (non-zero classes only) of a class definition, or null when its ranges
 * are unsorted or overlap (then it is written as given).
 * @param {Record<string, unknown>} classDefTable
 * @returns {Array<[number, number]> | null} sorted [glyph, class] pairs
 */
function classDefAssignments(classDefTable) {
    /** @type {Array<[number, number]>} */
    const pairs = [];
    if (classDefTable.format === 1) {
        const start = Number(classDefTable.startGlyph) || 0;
        const classes = /** @type {number[]} */ (classDefTable.classes || []);
        for (let i = 0; i < classes.length; i++) if (classes[i]) pairs.push([start + i, classes[i]]);
        return pairs;
    }
    if (classDefTable.format !== 2) return null;
    let previousEnd = -1;
    for (const range of /** @type {Array<{start: number, end: number, classId: number}>} */ (classDefTable.ranges || [])) {
        if (!(range.start > previousEnd) || range.end < range.start) return null;
        previousEnd = range.end;
        if (!range.classId) continue;
        for (let glyph = range.start; glyph <= range.end; glyph++) pairs.push([glyph, range.classId]);
    }
    return pairs;
}

/**
 * A ClassDef table in the smaller of its two formats: format 1 (a class array from the
 * first to the last classified glyph) or format 2 (ranges of one class). Class 0 is the
 * default and is not written. The given format only describes the classes.
 * @exports opentype.ClassDef
 * @class
 * @param {Record<string, unknown>} classDefTable
 * @constructor
 *
 * @see https://learn.microsoft.com/en-us/typography/opentype/spec/chapter2#class-definition-table
 */
function ClassDef(classDefTable) {
    check.assert(classDefTable.format === 1 || classDefTable.format === 2, 'Class format must be 1 or 2.');
    const pairs = classDefAssignments(classDefTable);
    let format = classDefTable.format;
    let startGlyph = /** @type {number} */ (classDefTable.startGlyph);
    let classes = /** @type {number[]} */ (classDefTable.classes);
    let ranges = /** @type {Array<{start: number, end: number, classId: number}>} */ (classDefTable.ranges);
    if (pairs) {
        ranges = [];
        for (const [glyph, classId] of pairs) {
            const last = ranges[ranges.length - 1];
            if (last && last.end === glyph - 1 && last.classId === classId) last.end = glyph;
            else ranges.push({ start: glyph, end: glyph, classId });
        }
        startGlyph = pairs.length ? pairs[0][0] : 0;
        const span = pairs.length ? pairs[pairs.length - 1][0] - startGlyph + 1 : 0;
        classes = new Array(span).fill(0);
        for (const [glyph, classId] of pairs) classes[glyph - startGlyph] = classId;
        format = 6 + 2 * span < 4 + 6 * ranges.length ? 1 : 2;
    }
    if (format === 1) {
        Table.call(this, 'classDefTable',
            [
                {name: 'classFormat', type: 'USHORT', value: 1},
                {name: 'startGlyphID', type: 'USHORT', value: startGlyph}
            ]
                .concat(ushortList('glyph', classes))
        );
    } else {
        Table.call(this, 'classDefTable',
            [{name: 'classFormat', type: 'USHORT', value: 2}]
                .concat(recordList('rangeRecord', ranges, function(RangeRecord, i) {
                    return [
                        {name: 'startGlyphID' + i, type: 'USHORT', value: RangeRecord.start},
                        {name: 'endGlyphID' + i, type: 'USHORT', value: RangeRecord.end},
                        {name: 'class' + i, type: 'USHORT', value: RangeRecord.classId},
                    ];
                }))
        );
    }
}
ClassDef.prototype = Object.create(Table.prototype);
ClassDef.prototype.constructor = ClassDef;

/**
 * @typedef {{lookupType: number, lookupFlag: number, subtables: Array<Record<string, unknown>>, markFilteringSet?: number}} LayoutLookup
 */

/**
 * Every lookup wrapped as an Extension lookup.
 * @param {LayoutLookup[]} lookups
 * @param {number} extensionType - 7 (GSUB) or 9 (GPOS)
 * @returns {LayoutLookup[]}
 */
function wrapExtensionLookups(lookups, extensionType) {
    return lookups.map((lookup) => {
        if (!lookup || lookup.lookupType === extensionType) return lookup;
        const subtables = (lookup.subtables || []).map((extension) => extensionType === 9
            ? { posFormat: 1, extensionLookupType: lookup.lookupType, extension }
            : { substFormat: 1, lookupType: lookup.lookupType, extension });
        return { ...lookup, lookupType: extensionType, subtables };
    });
}

/**
 * Build a GSUB or GPOS table, promoting its lookups to Extension lookups when they are
 * needed, as fontTools does: if an offset of the table as given does not fit, every
 * lookup is written as an Extension lookup (their subtables then sit after all of the
 * table and are reached through 32-bit offsets). Lookups given as Extension lookups
 * stay so. Wrapping changes the encoding only.
 * @param {(lookups: LayoutLookup[]) => Table} build
 * @param {LayoutLookup[]} lookups
 * @param {number} extensionType - 7 (GSUB) or 9 (GPOS)
 * @returns {Table}
 */
function makeLayoutTableWithinReach(build, lookups, extensionType) {
    const given = build(lookups || []);
    if (!(lookups || []).some((lookup) => lookup && lookup.lookupType !== extensionType)) return given;
    try {
        given.encode();
        return given;
    } catch (error) {
        if (!/offset .* exceeds/.test(String(/** @type {Error} */ (error)?.message))) throw error;
    }
    return build(wrapExtensionLookups(lookups, extensionType));
}

// Record = same as Table, but inlined (a Table has an offset and its data is further in the stream)
// Don't use offsets inside Records (probable bug), only in Tables.
export { Table };
// Also export Record as an alias for Table
export const Record = Table;
export default {
    Table,
    Record: Table,
    Coverage,
    ClassDef,
    ScriptList,
    FeatureList,
    LookupList,
    ushortList,
    tableList,
    recordList,
    coverageGlyphs,
    coverageRanges,
    makeLayoutTableWithinReach,
};
