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
 * @exports opentype.Coverage
 * @class
 * @param {Record<string, unknown>} coverageTable
 * @constructor
 */
function Coverage(coverageTable) {
    if (coverageTable.format === 1) {
        Table.call(this, 'coverageTable',
            [{name: 'coverageFormat', type: 'USHORT', value: 1}]
                .concat(ushortList('glyph', coverageTable.glyphs))
        );
    } else if (coverageTable.format === 2) {
        Table.call(this, 'coverageTable',
            [{name: 'coverageFormat', type: 'USHORT', value: 2}]
                .concat(recordList('rangeRecord', coverageTable.ranges, function(RangeRecord, i) {
                    return [
                        {name: 'startGlyphID' + i, type: 'USHORT', value: RangeRecord.start},
                        {name: 'endGlyphID' + i, type: 'USHORT', value: RangeRecord.end},
                        {name: 'startCoverageIndex' + i, type: 'USHORT', value: RangeRecord.index},
                    ];
                }))
        );
    } else {
        check.assert(false, 'Coverage format must be 1 or 2.');
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
        return new Table('lookupTable', [
            {name: 'lookupType', type: 'USHORT', value: lookupTable.lookupType},
            {name: 'lookupFlag', type: 'USHORT', value: lookupTable.lookupFlag}
        ].concat(tableList('subtable', lookupTable.subtables, subtableCallback)));
    }));
}
LookupList.prototype = Object.create(Table.prototype);
LookupList.prototype.constructor = LookupList;

/**
 * @exports opentype.ClassDef
 * @class
 * @param {Record<string, unknown>} classDefTable
 * @constructor
 *
 * @see https://learn.microsoft.com/en-us/typography/opentype/spec/chapter2#class-definition-table
 */
function ClassDef(classDefTable) {
    if (classDefTable.format === 1) {
        Table.call(this, 'classDefTable',
            [
                {name: 'classFormat', type: 'USHORT', value: 1},
                {name: 'startGlyphID', type: 'USHORT', value: classDefTable.startGlyph}
            ]
                .concat(ushortList('glyph', classDefTable.classes))
        );
    } else if (classDefTable.format === 2) {
        Table.call(this, 'classDefTable',
            [{name: 'classFormat', type: 'USHORT', value: 2}]
                .concat(recordList('rangeRecord', classDefTable.ranges, function(RangeRecord, i) {
                    return [
                        {name: 'startGlyphID' + i, type: 'USHORT', value: RangeRecord.start},
                        {name: 'endGlyphID' + i, type: 'USHORT', value: RangeRecord.end},
                        {name: 'class' + i, type: 'USHORT', value: RangeRecord.classId},
                    ];
                }))
        );
    } else {
        check.assert(false, 'Class format must be 1 or 2.');
    }
}
ClassDef.prototype = Object.create(Table.prototype);
ClassDef.prototype.constructor = ClassDef;

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
};
