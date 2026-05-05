// The Layout object is the prototype of Substitution objects, and provides
// utility methods to manipulate common layout tables (GPOS, GSUB, GDEF...)

import check from './check.mjs';

/**
 * @typedef {import('./tables/gsub.mjs').GsubTable} GsubTable
 * @typedef {import('./tables/gsub.mjs').GsubLookupTable} GsubLookupTable
 * @typedef {import('./tables/gsub.mjs').ScriptRecord} ScriptRecord
 * @typedef {import('./tables/gsub.mjs').ScriptTable} ScriptTable
 * @typedef {import('./tables/gsub.mjs').LangSysTable} LangSysTable
 * @typedef {import('./tables/gsub.mjs').FeatureRecord} FeatureRecord
 * @typedef {import('./tables/gpos.mjs').GposTable} GposTable
 * @typedef {import('./tables/gpos.mjs').GposLookupTable} GposLookupTable
 */

/**
 * A parsed OpenType ClassDef table.
 * @typedef {object} ClassDefTable
 * @property {number} format - 1 (array) or 2 (ranges)
 * @property {number} [startGlyph] - (format 1) first glyph covered
 * @property {number[]} [classes] - (format 1) class value per glyph
 * @property {Array<{start: number, end: number, classId: number}>} [ranges] - (format 2) class ranges
 */

function searchTag(arr, tag) {
    /* jshint bitwise: false */
    let imin = 0;
    let imax = arr.length - 1;
    while (imin <= imax) {
        const imid = (imin + imax) >>> 1;
        const val = arr[imid].tag;
        if (val === tag) {
            return imid;
        } else if (val < tag) {
            imin = imid + 1;
        } else { imax = imid - 1; }
    }
    // Not found: return -1-insertion point
    return -imin - 1;
}

function binSearch(arr, value) {
    /* jshint bitwise: false */
    let imin = 0;
    let imax = arr.length - 1;
    while (imin <= imax) {
        const imid = (imin + imax) >>> 1;
        const val = arr[imid];
        if (val === value) {
            return imid;
        } else if (val < value) {
            imin = imid + 1;
        } else { imax = imid - 1; }
    }
    // Not found: return -1-insertion point
    return -imin - 1;
}

// binary search in a list of ranges (coverage, class definition)
function searchRange(ranges, value) {
    // jshint bitwise: false
    let range;
    let imin = 0;
    let imax = ranges.length - 1;
    while (imin <= imax) {
        const imid = (imin + imax) >>> 1;
        range = ranges[imid];
        const start = range.start;
        if (start === value) {
            return range;
        } else if (start < value) {
            imin = imid + 1;
        } else { imax = imid - 1; }
    }
    if (imin > 0) {
        range = ranges[imin - 1];
        if (value > range.end) return 0;
        return range;
    }
}

/**
 * @exports opentype.Layout
 * @class
 */
function Layout(font, tableName) {
    this.font = font;
    this.tableName = tableName;
}

Layout.prototype = {

    /**
     * Binary search an object by "tag" property
     * @instance
     * @function searchTag
     * @memberof opentype.Layout
     * @param  {Array} arr
     * @param  {string} tag
     * @return {number}
     */
    searchTag: searchTag,

    /**
     * Binary search in a list of numbers
     * @instance
     * @function binSearch
     * @memberof opentype.Layout
     * @param  {Array} arr
     * @param  {number} value
     * @return {number}
     */
    binSearch: binSearch,

    /**
     * Get or create the Layout table (GSUB, GPOS etc).
     * @param  {boolean} [create] - Whether to create a new one.
     * @return {GsubTable|GposTable|undefined} The GSUB or GPOS table.
     */
    getTable: function(create) {
        let layout = this.font.tables[this.tableName];
        if (!layout && create) {
            layout = this.font.tables[this.tableName] = (/** @type {{ createDefaultTable: Function }} */ (/** @type {unknown} */ (this))).createDefaultTable();
        }
        return layout;
    },

    /**
     * Returns all scripts in the substitution table.
     * @instance
     * @return {Array}
     */
    getScriptNames: function() {
        let layout = this.getTable();
        if (!layout) { return []; }
        return /** @type {ScriptRecord[]} */ (layout.scripts).map(function(script) {
            return script.tag;
        });
    },

    /**
     * Returns the best bet for a script name.
     * Returns 'DFLT' if it exists.
     * If not, returns 'latn' if it exists.
     * If neither exist, returns undefined.
     */
    getDefaultScriptName: function() {
        let layout = this.getTable();
        if (!layout) { return; }
        let hasLatn = false;
        const scripts0 = /** @type {ScriptRecord[]} */ (layout.scripts);
        for (let i = 0; i < scripts0.length; i++) {
            const name = scripts0[i].tag;
            if (name === 'DFLT') return name;
            if (name === 'latn') hasLatn = true;
        }
        if (hasLatn) return 'latn';
    },

    /**
     * Returns all LangSysRecords in the given script.
     * @instance
     * @param {string} [script='DFLT']
     * @param {boolean} [create] - forces the creation of this script table if it doesn't exist.
     * @return {ScriptTable|undefined} The script table.
     */
    getScriptTable: function(script, create) {
        const layout = this.getTable(create);
        if (layout) {
            script = script || 'DFLT';
            const scripts = /** @type {ScriptRecord[]} */ (layout.scripts);
            const pos = searchTag(scripts, script);
            if (pos >= 0) {
                return scripts[pos].script;
            } else if (create) {
                const scr = {
                    tag: script,
                    script: {
                        defaultLangSys: {reserved: 0, reqFeatureIndex: 0xffff, featureIndexes: []},
                        langSysRecords: []
                    }
                };
                scripts.splice(-1 - pos, 0, scr);
                return scr.script;
            }
        }
    },

    /**
     * Returns a language system table
     * @instance
     * @param {string} [script='DFLT']
     * @param {string} [language='dlft']
     * @param {boolean} [create] - forces the creation of this langSysTable if it doesn't exist.
     * @return {LangSysTable|undefined}
     */
    getLangSysTable: function(script, language, create) {
        const scriptTable = this.getScriptTable(script, create);
        if (scriptTable) {
            if (!language || language === 'dflt' || language === 'DFLT') {
                return /** @type {LangSysTable} */ (scriptTable.defaultLangSys);
            }
            const langSysRecords = /** @type {Array<{tag: string, langSys: LangSysTable}>} */ (scriptTable.langSysRecords);
            const pos = searchTag(langSysRecords, language);
            if (pos >= 0) {
                return langSysRecords[pos].langSys;
            } else if (create) {
                const langSysRecord = {
                    tag: language,
                    langSys: {reserved: 0, reqFeatureIndex: 0xffff, featureIndexes: []}
                };
                langSysRecords.splice(-1 - pos, 0, langSysRecord);
                return langSysRecord.langSys;
            }
        }
    },

    /**
     * Get a specific feature table.
     * @instance
     * @param {string} [script='DFLT']
     * @param {string} [language='dlft']
     * @param {string} [feature] - One of the codes listed at https://www.microsoft.com/typography/OTSPEC/featurelist.htm
     * @param {boolean} [create] - forces the creation of the feature table if it doesn't exist.
     * @return {{featureParams: number, lookupListIndexes: number[]}|undefined}
     */
    getFeatureTable: function(script, language, feature, create) {
        const langSysTable = this.getLangSysTable(script, language, create);
        if (langSysTable) {
            let featureRecord;
            const featIndexes = /** @type {number[]} */ (langSysTable.featureIndexes);
            const allFeatures = /** @type {FeatureRecord[]} */ (this.font.tables[this.tableName].features);
            // The FeatureIndex array of indices is in arbitrary order,
            // even if allFeatures is sorted alphabetically by feature tag.
            for (let i = 0; i < featIndexes.length; i++) {
                featureRecord = allFeatures[featIndexes[i]];
                if (featureRecord.tag === feature) {
                    return featureRecord.feature;
                }
            }
            if (create) {
                const index = allFeatures.length;
                // Automatic ordering of features would require to shift feature indexes in the script list.
                check.assert(index === 0 || feature >= allFeatures[index - 1].tag, 'Features must be added in alphabetical order.');
                featureRecord = {
                    tag: feature,
                    feature: { featureParams: 0, lookupListIndexes: [] }
                };
                allFeatures.push(featureRecord);
                featIndexes.push(index);
                return featureRecord.feature;
            }
        }
    },

    /**
     * Get the lookup tables of a given type for a script/language/feature.
     * This method handles extension lookups (type 7 for GSUB, type 9 for GPOS)
     * by unwrapping them and checking the actual lookup type inside.
     * @instance
     * @param {string} [script='DFLT']
     * @param {string} [language='dlft']
     * @param {string} [feature] - 4-letter feature code
     * @param {number} [lookupType] - 1 to 8 (not 7 - extension lookups are unwrapped)
     * @param {boolean} [create] - forces the creation of the lookup table if it doesn't exist, with no subtables.
     * @return {GsubLookupTable[]|GposLookupTable[]}
     */
    getLookupTables: function(script, language, feature, lookupType, create) {
        const featureTable = this.getFeatureTable(script, language, feature, create);
        const tables = [];
        if (featureTable) {
            let lookupTable;
            const lookupListIndexes = /** @type {number[]} */ (featureTable.lookupListIndexes);
            const allLookups = /** @type {GsubLookupTable[]|GposLookupTable[]} */ (this.font.tables[this.tableName].lookups);
            // lookupListIndexes are in no particular order, so use naive search.
            for (let i = 0; i < lookupListIndexes.length; i++) {
                lookupTable = allLookups[lookupListIndexes[i]];
                if (lookupTable.lookupType === lookupType) {
                    tables.push(lookupTable);
                } else if (lookupTable.lookupType === 7 && this.tableName === 'gsub') {
                    // GSUB Extension Substitution (type 7) - unwrap and check inner type
                    // Extension lookups wrap other lookup types to allow 32-bit offsets
                    for (const subtable of /** @type {import('./tables/gsub.mjs').GsubSubtable[]} */ (lookupTable.subtables)) {
                        if (subtable.lookupType === lookupType && subtable.extension) {
                            // Create a virtual lookup table with the unwrapped subtables
                            /** @type {GsubLookupTable} */
                            const virtualLookup = {
                                lookupType: /** @type {number} */ (lookupType),
                                lookupFlag: /** @type {number} */ (lookupTable.lookupFlag),
                                subtables: [subtable.extension],
                                markFilteringSet: /** @type {number|undefined} */ (lookupTable.markFilteringSet)
                            };
                            tables.push(virtualLookup);
                        }
                    }
                } else if (lookupTable.lookupType === 9 && this.tableName === 'gpos') {
                    // GPOS Extension Positioning (type 9) - unwrap and check inner type
                    for (const subtable of /** @type {import('./tables/gpos.mjs').GposSubtable[]} */ (lookupTable.subtables)) {
                        if (subtable.lookupType === lookupType && subtable.extension) {
                            /** @type {GposLookupTable} */
                            const virtualLookup = {
                                lookupType: /** @type {number} */ (lookupType),
                                lookupFlag: /** @type {number} */ (lookupTable.lookupFlag),
                                subtables: [subtable.extension],
                                markFilteringSet: /** @type {number|undefined} */ (lookupTable.markFilteringSet)
                            };
                            tables.push(virtualLookup);
                        }
                    }
                }
            }
            if (tables.length === 0 && create) {
                lookupTable = {
                    lookupType: lookupType,
                    lookupFlag: 0,
                    subtables: [],
                    markFilteringSet: undefined
                };
                const index = allLookups.length;
                allLookups.push(lookupTable);
                lookupListIndexes.push(index);
                return [lookupTable];
            }
        }
        return /** @type {GsubLookupTable[]|GposLookupTable[]} */ (tables);
    },

    /**
     * Find a glyph in a class definition table
     * https://docs.microsoft.com/en-us/typography/opentype/spec/chapter2#class-definition-table
     * @param {ClassDefTable} classDefTable - an OpenType Layout class definition table
     * @param {number} glyphIndex - the index of the glyph to find
     * @returns {number} -1 if not found
     */
    getGlyphClass: function(classDefTable, glyphIndex) {
        switch (classDefTable.format) {
            case 1: {
                if (classDefTable.startGlyph <= glyphIndex && glyphIndex < classDefTable.startGlyph + classDefTable.classes.length) {
                    return classDefTable.classes[glyphIndex - classDefTable.startGlyph];
                }
                return 0;
            }
            case 2: {
                const range = searchRange(classDefTable.ranges, glyphIndex);
                return range ? range.classId : 0;
            }
        }
    },

    /**
     * Find a glyph in a coverage table
     * https://docs.microsoft.com/en-us/typography/opentype/spec/chapter2#coverage-table
     * @param {object} coverageTable - an OpenType Layout coverage table
     * @param {number} glyphIndex - the index of the glyph to find
     * @returns {number} -1 if not found
     */
    getCoverageIndex: function(coverageTable, glyphIndex) {
        switch (coverageTable.format) {
            case 1: {
                const index = binSearch(coverageTable.glyphs, glyphIndex);
                return index >= 0 ? index : -1;
            }
            case 2: {
                const range = searchRange(coverageTable.ranges, glyphIndex);
                return range ? range.index + glyphIndex - range.start : -1;
            }
        }
    },

    /**
     * Returns the list of glyph indexes of a coverage table.
     * Format 1: the list is stored raw
     * Format 2: compact list as range records.
     * @instance
     * @param  {{format: number, glyphs?: number[], ranges?: Array<{start: number, end: number}>}} coverageTable
     * @return {number[]}
     */
    expandCoverage: function(coverageTable) {
        if (coverageTable.format === 1) {
            return /** @type {number[]} */ (coverageTable.glyphs);
        } else {
            const glyphs = [];
            const ranges = /** @type {Array<{start: number, end: number}>} */ (coverageTable.ranges);
            for (let i = 0; i < ranges.length; i++) {
                const range = ranges[i];
                const start = range.start;
                const end = range.end;
                for (let j = start; j <= end; j++) {
                    glyphs.push(j);
                }
            }
            return glyphs;
        }
    }

};

export default Layout;
