/**
 * Query a feature by some of it's properties to lookup a glyph substitution.
 */

import { ContextParams } from '../tokenizer.mjs';
import { isTashkeelArabicChar } from '../char.mjs';

/**
 * @typedef {import('../tables/gsub.mjs').GsubSubtable} GsubSubtable
 */

/**
 * @typedef {import('../tables/gsub.mjs').GsubLookupTable} GsubLookupTable
 */

/**
 * @typedef {{ tag: string, script: string, contextParams: ContextParams }} FQueryParams
 */

/**
 * Create feature query instance
 * @param {Record<string, unknown>} font opentype font instance
 */
function FeatureQuery(font) {
    this.font = font;
    this.features = {};
}

/**
 * Create a substitution action instance
 * @param {{id: number, tag: string, substitution: unknown}} action
 */
function SubstitutionAction(action) {
    this.id = action.id;
    this.tag = action.tag;
    this.substitution = action.substitution;
}

/**
 * Lookup a coverage table
 * @param {number} glyphIndex glyph index
 * @param {Record<string, unknown>} coverage coverage table
 */
function lookupCoverage(glyphIndex, coverage) {
    if (!glyphIndex) return -1;
    switch (coverage.format) {
        case 1:
            return /** @type {number[]} */ (coverage.glyphs).indexOf(glyphIndex);

        case 2: {
            let ranges = /** @type {Array<{start: number, end: number, index: number}>} */ (coverage.ranges);
            for (let i = 0; i < ranges.length; i++) {
                const range = ranges[i];
                if (glyphIndex >= range.start && glyphIndex <= range.end) {
                    let offset = glyphIndex - range.start;
                    return range.index + offset;
                }
            }
            break;
        }
        default:
            return -1; // not found
    }
    return -1;
}

/**
 * Handle a single substitution - format 1
 * @param {number} glyphIndex glyph index to lookup
 * @param {GsubSubtable} subtable substitution subtable
 */
function singleSubstitutionFormat1(glyphIndex, subtable) {
    let substituteIndex = lookupCoverage(glyphIndex, /** @type {Record<string, unknown>} */ (subtable.coverage));
    if (substituteIndex === -1) return null;
    return (glyphIndex + /** @type {number} */ (subtable.deltaGlyphId)) & 0xffff;
}

/**
 * Handle a single substitution - format 2
 * @param {number} glyphIndex glyph index to lookup
 * @param {GsubSubtable} subtable substitution subtable
 */
function singleSubstitutionFormat2(glyphIndex, subtable) {
    let substituteIndex = lookupCoverage(glyphIndex, /** @type {Record<string, unknown>} */ (subtable.coverage));
    if (substituteIndex === -1) return null;
    return subtable.substitute[substituteIndex];
}

/**
 * Lookup a list of coverage tables
 * @param {Array<Record<string, unknown>>} coverageList a list of coverage tables
 * @param {ContextParams} contextParams context params to lookup
 * @param {number} startOffset - offset from contextParams.index to start matching (default 0)
 */
function lookupCoverageList(coverageList, contextParams, startOffset = 0) {
    let lookupList = [];
    for (let i = 0; i < coverageList.length; i++) {
        const coverage = coverageList[i];
        // Get the glyph at position (index + startOffset + i)
        // For backtrack/lookahead with their own ContextParams (index=0), this works correctly
        // For input with the main ContextParams, startOffset=0 means we start at index
        let glyphIndex = contextParams.context[contextParams.index + startOffset + i];
        glyphIndex = Array.isArray(glyphIndex) ? glyphIndex[0] : glyphIndex;
        const lookupIndex = lookupCoverage(glyphIndex, coverage);
        if (lookupIndex !== -1) {
            lookupList.push(lookupIndex);
        }
    }
    if (lookupList.length !== coverageList.length) return -1;
    return lookupList;
}

/**
 * Get the class of a glyph from a class definition table
 * @param {object} classDefTable - an OpenType Layout class definition table
 * @param {number} glyphIndex - the index of the glyph to find
 * @returns {number} class ID (0 if not found, as class 0 is the default class)
 */
function getGlyphClass(classDefTable, glyphIndex) {
    if (!classDefTable) return 0;
    switch (classDefTable.format) {
        case 1: {
            if (classDefTable.startGlyph <= glyphIndex && 
                glyphIndex < classDefTable.startGlyph + classDefTable.classes.length) {
                return classDefTable.classes[glyphIndex - classDefTable.startGlyph];
            }
            return 0;
        }
        case 2: {
            const ranges = classDefTable.ranges;
            for (let i = 0; i < ranges.length; i++) {
                const range = ranges[i];
                if (glyphIndex >= range.start && glyphIndex <= range.end) {
                    return range.classId;
                }
            }
            return 0;
        }
    }
    return 0;
}

/**
 * Handle chaining context substitution - format 2 (class-based)
 * @param {ContextParams} contextParams context params to lookup
 * @param {GsubSubtable} subtable the subtable containing class definitions and chain class sets
 */
/**
 * Apply chain context substitution format 1 (glyph sequences): the rules for the current
 * glyph are tried in order, each matched as a single-glyph format 3 rule.
 * @param {import('../tokenizer.mjs').ContextParams} contextParams context params to lookup
 * @param {GsubSubtable} subtable subtable
 * @this {FeatureQuery}
 */
function chainingSubstitutionFormat1(contextParams, subtable) {
    let glyphIndex = contextParams.current;
    glyphIndex = Array.isArray(glyphIndex) ? glyphIndex[0] : glyphIndex;
    const coverageIndex = lookupCoverage(glyphIndex, /** @type {Record<string, unknown>} */ (subtable.coverage));
    if (coverageIndex === -1) return [];
    const ruleSet = (subtable.chainRuleSets || [])[coverageIndex] || [];
    const one = (/** @type {number} */ glyph) => ({ format: 1, glyphs: [glyph] });
    for (const rule of ruleSet) {
        const result = chainingSubstitutionFormat3.apply(this, [contextParams, {
            substFormat: 3,
            backtrackCoverage: (rule.backtrack || []).map(one),
            inputCoverage: [glyphIndex].concat(rule.input || []).map(one),
            lookaheadCoverage: (rule.lookahead || []).map(one),
            lookupRecords: rule.lookupRecords || []
        }]);
        if (result === BLOCK_MARKER || (Array.isArray(result) && result.length > 0)) return result;
    }
    return [];
}

/** Glyphs of each class of a class definition (class 0: every other glyph), by table. */
const classMembersCache = new WeakMap();
/** Key for a missing class definition (every glyph in class 0). */
const NO_CLASS_DEF = {};

/**
 * The glyphs of a class (class 0: the glyphs no class lists), as a format 1 coverage.
 * @param {Record<string, unknown> | undefined} classDefTable
 * @param {number} value
 * @param {number} numGlyphs
 * @returns {{format: 1, glyphs: number[]}}
 */
function classCoverage(classDefTable, value, numGlyphs) {
    const key = classDefTable || NO_CLASS_DEF;
    let byClass = classMembersCache.get(key);
    if (!byClass) {
        byClass = new Map();
        for (let glyph = 0; glyph < numGlyphs; glyph++) {
            const glyphClass = getGlyphClass(classDefTable, glyph);
            if (!byClass.has(glyphClass)) byClass.set(glyphClass, []);
            byClass.get(glyphClass).push(glyph);
        }
        classMembersCache.set(key, byClass);
    }
    return { format: 1, glyphs: byClass.get(value) || [] };
}

/**
 * Handle chaining context substitution - format 2 (class-based): the rules of the current
 * glyph's input class are tried in order, each matched as a format 3 rule over the glyphs
 * of its classes.
 * @param {import('../tokenizer.mjs').ContextParams} contextParams context params to lookup
 * @param {GsubSubtable} subtable subtable
 * @this {FeatureQuery}
 */
function chainingSubstitutionFormat2(contextParams, subtable) {
    let glyphIndex = contextParams.current;
    glyphIndex = Array.isArray(glyphIndex) ? glyphIndex[0] : glyphIndex;
    if (lookupCoverage(glyphIndex, /** @type {Record<string, unknown>} */ (subtable.coverage)) === -1) return [];
    const ruleSet = (subtable.chainClassSet || [])[getGlyphClass(subtable.inputClassDef, glyphIndex)] || [];
    const font = /** @type {{numGlyphs?: number, glyphs?: {length?: number}}} */ (this.font);
    const numGlyphs = font.numGlyphs || (font.glyphs && font.glyphs.length) || 0;
    const coverages = (/** @type {Record<string, unknown> | undefined} */ classDef, /** @type {number[]} */ values) => values.map((value) => classCoverage(classDef, value, numGlyphs));
    for (const rule of ruleSet) {
        if (!rule) continue;
        const result = chainingSubstitutionFormat3.apply(this, [contextParams, {
            substFormat: 3,
            backtrackCoverage: coverages(subtable.backtrackClassDef, rule.backtrack || []),
            inputCoverage: [{ format: 1, glyphs: [glyphIndex] }].concat(coverages(subtable.inputClassDef, rule.input || [])),
            lookaheadCoverage: coverages(subtable.lookaheadClassDef, rule.lookahead || []),
            lookupRecords: rule.lookupRecords || []
        }]);
        if (result === BLOCK_MARKER || (Array.isArray(result) && result.length > 0)) return result;
    }
    return [];
}

// Special marker for "matched but no substitution" (blocking rule)
const BLOCK_MARKER = { blocked: true };

/**
 * Handle chaining context substitution - format 3
 * @param {ContextParams} contextParams context params to lookup
 */
function chainingSubstitutionFormat3(contextParams, subtable) {
    const lookupsCount = (
        subtable.inputCoverage.length +
        subtable.lookaheadCoverage.length +
        subtable.backtrackCoverage.length
    );
    if (contextParams.context.length < lookupsCount) return [];
    // INPUT LOOKUP //
    const inputLookupsRaw = lookupCoverageList(
        subtable.inputCoverage, contextParams
    );
    if (inputLookupsRaw === -1) return [];
    const inputLookups = /** @type {number[]} */ (inputLookupsRaw);
    // LOOKAHEAD LOOKUP //
    const lookaheadOffset = subtable.inputCoverage.length - 1;
    if (contextParams.lookahead.length < subtable.lookaheadCoverage.length) return [];
    let lookaheadContext = contextParams.lookahead.slice(lookaheadOffset);
    while (lookaheadContext.length && isTashkeelArabicChar(lookaheadContext[0].char)) {
        lookaheadContext.shift();
    }
    const lookaheadParams = new ContextParams(lookaheadContext, 0);
    const lookaheadLookupsRaw = lookupCoverageList(
        subtable.lookaheadCoverage, lookaheadParams
    );
    const lookaheadLookups = /** @type {number[]} */ (lookaheadLookupsRaw === -1 ? [] : lookaheadLookupsRaw);
    // BACKTRACK LOOKUP //
    let backtrackContext = [].concat(contextParams.backtrack);
    backtrackContext.reverse();
    while (backtrackContext.length && isTashkeelArabicChar(backtrackContext[0].char)) {
        backtrackContext.shift();
    }
    if (backtrackContext.length < subtable.backtrackCoverage.length) return [];
    const backtrackParams = new ContextParams(backtrackContext, 0);
    const backtrackLookupsRaw = lookupCoverageList(
        subtable.backtrackCoverage, backtrackParams
    );
    const backtrackLookups = /** @type {number[]} */ (backtrackLookupsRaw === -1 ? [] : backtrackLookupsRaw);
    const contextRulesMatch = (
        inputLookups.length === subtable.inputCoverage.length &&
        lookaheadLookups.length === subtable.lookaheadCoverage.length &&
        backtrackLookups.length === subtable.backtrackCoverage.length
    );
    let substitutions = [];
    if (contextRulesMatch) {
        // If the rule matches but has no lookupRecords, it's a blocking rule
        // Return the special BLOCK_MARKER to indicate "matched but no substitution"
        if (!subtable.lookupRecords || subtable.lookupRecords.length === 0) {
            return BLOCK_MARKER;
        }
        for (let i = 0; i < subtable.lookupRecords.length; i++) {
            const lookupRecord = subtable.lookupRecords[i];
            const lookupListIndex = lookupRecord.lookupListIndex;
            const lookupTable = this.getLookupByIndex(lookupListIndex);
            for (let s = 0; s < lookupTable.subtables.length; s++) {
                let subtable = lookupTable.subtables[s];
                let lookup;
                let substitutionType = this.getSubstitutionType(lookupTable, subtable);

                if (substitutionType === '71') {
                    // This is an extension subtable, so lookup the target subtable
                    substitutionType = this.getSubstitutionType(subtable, subtable.extension);
                    lookup = this.getLookupMethod(subtable, subtable.extension);
                    subtable = subtable.extension;
                } else {
                    lookup = this.getLookupMethod(lookupTable, subtable);
                }

                if (substitutionType === '11' || substitutionType === '12') {
                    const glyphIndex = contextParams.get(lookupRecord.sequenceIndex);
                    const substitution = lookup(glyphIndex);
                    if (substitution) substitutions.push(substitution);
                } else if (substitutionType === '21') {
                    const glyphIndex = contextParams.get(lookupRecord.sequenceIndex);
                    const substitution = lookup(glyphIndex);
                    if (substitution) substitutions.push(substitution);
                } else {
                    throw new Error(`Substitution type ${substitutionType} is not supported in chaining substitution`);
                }
            }
        }
    }
    return substitutions;
}

/**
 * Handle ligature substitution - format 1
 * @param {ContextParams} contextParams context params to lookup
 */
function ligatureSubstitutionFormat1(contextParams, subtable) {
    // COVERAGE LOOKUP //
    let glyphIndex = contextParams.current;
    let ligSetIndex = lookupCoverage(glyphIndex, subtable.coverage);
    if (ligSetIndex === -1) return null;
    // COMPONENTS LOOKUP
    // (!) note, components are ordered in the written direction.
    let ligature;
    let ligatureSet = subtable.ligatureSets[ligSetIndex];
    for (let s = 0; s < ligatureSet.length; s++) {
        ligature = ligatureSet[s];
        for (let l = 0; l < ligature.components.length; l++) {
            const lookaheadItem = contextParams.lookahead[l];
            const component = ligature.components[l];
            if (lookaheadItem !== component) break;
            if (l === ligature.components.length - 1) return ligature;
        }
    }
    return null;
}

/**
 * Handle context substitution - format 1
 * @param {ContextParams} contextParams context params to lookup
 */
function contextSubstitutionFormat1(contextParams, subtable) {
    let glyphId = contextParams.current;
    let ligSetIndex = lookupCoverage(glyphId, subtable.coverage);
    if (ligSetIndex === -1)
        return null;
    for (const ruleSet of subtable.ruleSets) {
        for (const rule of ruleSet) {
            let matched = true;
            for (let i = 0; i < rule.input.length; i++) {
                if (contextParams.lookahead[i] !== rule.input[i]){
                    matched = false;
                    break;
                }
            }
            if (matched) {
                let substitutions = [];
                substitutions.push(glyphId);
                for (let i = 0; i < rule.input.length; i++) {
                    substitutions.push(rule.input[i]);
                }
                const parser = (substitutions, lookupRecord)=>{
                    const {lookupListIndex,sequenceIndex} = lookupRecord;
                    const {subtables} = this.getLookupByIndex(lookupListIndex);
                    for (const subtable of subtables){
                        let ligSetIndex = lookupCoverage(substitutions[sequenceIndex], subtable.coverage);
                        if (ligSetIndex !== -1){
                            substitutions[sequenceIndex] = subtable.deltaGlyphId;
                        }
                    }
                };

                for (let i = 0; i < rule.lookupRecords.length; i++) {
                    const lookupRecord = rule.lookupRecords[i];
                    parser(substitutions, lookupRecord);
                }

                return substitutions;
            }
        }
    }
    return null;
}

/**
 * Handle context substitution - format 3
 * @param {ContextParams} contextParams context params to lookup
 */
function contextSubstitutionFormat3(contextParams, subtable) {
    if (contextParams.context.length < subtable.coverages.length) {
        return [];
    }
    // Check each coverage against the glyph at the corresponding position
    for (let i = 0; i < subtable.coverages.length; i++) {
        let glyphIndex = contextParams.get(i);
        glyphIndex = Array.isArray(glyphIndex) ? glyphIndex[0] : glyphIndex;
        if (lookupCoverage(glyphIndex, subtable.coverages[i]) === -1) {
            return [];
        }
    }
    let substitutions = [];
    for (let i = 0; i < subtable.lookupRecords.length; i++) {
        const lookupRecord = subtable.lookupRecords[i];
        const lookupListIndex = lookupRecord.lookupListIndex;
        const lookupTable = this.getLookupByIndex(lookupListIndex);
        for (let s = 0; s < lookupTable.subtables.length; s++) {
            let subtable = lookupTable.subtables[s];
            let lookup;
            let substitutionType = this.getSubstitutionType(lookupTable, subtable);

            if (substitutionType === '71') {
                // This is an extension subtable, so lookup the target subtable
                substitutionType = this.getSubstitutionType(subtable, subtable.extension);
                lookup = this.getLookupMethod(subtable, subtable.extension);
                subtable = subtable.extension;
            } else {
                lookup = this.getLookupMethod(lookupTable, subtable);
            }

            if (substitutionType === '11' || substitutionType === '12') {
                const glyphIndex = contextParams.get(lookupRecord.sequenceIndex);
                const substitution = lookup(glyphIndex);
                if (substitution) substitutions.push(substitution);
            } else if (substitutionType === '21') {
                const glyphIndex = contextParams.get(lookupRecord.sequenceIndex);
                const substitution = lookup(glyphIndex);
                if (substitution) substitutions.push(substitution);
            }
        }
    }
    return substitutions;
}

/**
 * Handle decomposition substitution - format 1
 * @param {number} glyphIndex glyph index
 * @param {GsubSubtable} subtable subtable
 */
function decompositionSubstitutionFormat1(glyphIndex, subtable) {
    let substituteIndex = lookupCoverage(glyphIndex, /** @type {Record<string, unknown>} */ (subtable.coverage));
    if (substituteIndex === -1) return null;
    return subtable.sequences[substituteIndex];
}

/**
 * Get default script features indexes
 */
FeatureQuery.prototype.getDefaultScriptFeaturesIndexes = function () {
    const scripts = /** @type {{scripts: Array<Record<string, unknown>>}} */ (/** @type {Record<string, unknown>} */ (this.font.tables).gsub).scripts;
    for (let s = 0; s < scripts.length; s++) {
        const script = scripts[s];
        if (script.tag === 'DFLT') return (
            /** @type {Record<string, unknown>} */ (/** @type {Record<string, unknown>} */ (script.script).defaultLangSys).featureIndexes
        );
    }
    return [];
};

/**
 * Get feature indexes of a specific script
 * @param {string} scriptTag script tag
 */
FeatureQuery.prototype.getScriptFeaturesIndexes = function(scriptTag) {
    const tables = /** @type {Record<string, unknown>} */ (this.font.tables);
    if (!tables.gsub) return [];
    if (!scriptTag) return this.getDefaultScriptFeaturesIndexes();
    const scripts = /** @type {{scripts: Array<Record<string, unknown>>}} */ (/** @type {Record<string, unknown>} */ (this.font.tables).gsub).scripts;
    for (let i = 0; i < scripts.length; i++) {
        const script = scripts[i];
        const scriptRecord = /** @type {Record<string, unknown>} */ (script.script);
        if (script.tag === scriptTag && scriptRecord.defaultLangSys) {
            return /** @type {Record<string, unknown>} */ (scriptRecord.defaultLangSys).featureIndexes;
        } else {
            let langSysRecords = /** @type {Array<Record<string, unknown>>|undefined} */ (script.langSysRecords);
            if (langSysRecords) {
                for (let j = 0; j < langSysRecords.length; j++) {
                    const langSysRecord = langSysRecords[j];
                    if (langSysRecord.tag === scriptTag) {
                        const langSys = /** @type {Record<string, unknown>} */ (langSysRecord.langSys);
                        return langSys.featureIndexes;
                    }
                }
            }
        }
    }
    return this.getDefaultScriptFeaturesIndexes();
};

/**
 * Map a feature tag to a gsub feature
 * @param {Array<Record<string, unknown>>} features gsub features
 * @param {string} scriptTag script tag
 */
FeatureQuery.prototype.mapTagsToFeatures = function (features, scriptTag) {
    let tags = {};
    for (let i = 0; i < features.length; i++) {
        const tag = features[i].tag;
        const feature = features[i].feature;
        tags[tag] = feature;
    }
    this.features[scriptTag].tags = tags;
};

/**
 * Get features of a specific script
 * @param {string} scriptTag script tag
 */
FeatureQuery.prototype.getScriptFeatures = function (scriptTag) {
    let features = this.features[scriptTag];
    if (Object.prototype.hasOwnProperty.call(this.features, scriptTag)) return features;
    const featuresIndexes = /** @type {Array<number>} */ (this.getScriptFeaturesIndexes(scriptTag));
    if (!featuresIndexes) return null;
    const gsub = /** @type {{features: Array<unknown>}} */ (/** @type {Record<string, unknown>} */ (this.font.tables).gsub);
    features = featuresIndexes.map(index => gsub.features[index]);
    this.features[scriptTag] = features;
    this.mapTagsToFeatures(features, scriptTag);
    return features;
};

/**
 * Get substitution type
 * @param {GsubLookupTable} lookupTable lookup table
 * @param {GsubSubtable} subtable subtable
 */
FeatureQuery.prototype.getSubstitutionType = function(lookupTable, subtable) {
    const lookupType = lookupTable.lookupType.toString();
    const substFormat = subtable.substFormat.toString();
    return lookupType + substFormat;
};

/**
 * Get lookup method
 * @param {GsubLookupTable} lookupTable lookup table
 * @param {GsubSubtable} subtable subtable
 */
FeatureQuery.prototype.getLookupMethod = function(lookupTable, subtable) {
    let substitutionType = this.getSubstitutionType(lookupTable, subtable);
    switch (substitutionType) {
        case '11':
            return glyphIndex => singleSubstitutionFormat1.apply(
                this, [glyphIndex, subtable]
            );
        case '12':
            return glyphIndex => singleSubstitutionFormat2.apply(
                this, [glyphIndex, subtable]
            );
        case '61':
            return contextParams => chainingSubstitutionFormat1.apply(
                this, [contextParams, subtable]
            );
        case '62':
            return contextParams => chainingSubstitutionFormat2.apply(
                this, [contextParams, subtable]
            );
        case '63':
            return contextParams => chainingSubstitutionFormat3.apply(
                this, [contextParams, subtable]
            );
        case '41':
            return contextParams => ligatureSubstitutionFormat1.apply(
                this, [contextParams, subtable]
            );
        case '21':
            return glyphIndex => decompositionSubstitutionFormat1.apply(
                this, [glyphIndex, subtable]
            );
        case '51':
            return contextParams => contextSubstitutionFormat1.apply(
                this, [contextParams, subtable]
            );
        case '53':
            return contextParams => contextSubstitutionFormat3.apply(
                this, [contextParams, subtable]
            );
        default:
            throw new Error(
                `substitutionType : ${substitutionType} ` +
                `lookupType: ${lookupTable.lookupType} - ` +
                `substFormat: ${subtable.substFormat} ` +
                'is not yet supported'
            );
    }
};

/**
 * [ LOOKUP TYPES ]
 * -------------------------------
 * Single                        1;
 * Multiple                      2;
 * Alternate                     3;
 * Ligature                      4;
 * Context                       5;
 * ChainingContext               6;
 * ExtensionSubstitution         7;
 * ReverseChainingContext        8;
 * -------------------------------
 *
 */

/**
 * @typedef FQuery
 * @type {object}
 * @property {string} tag feature tag
 * @property {string} script feature script
 * @property {ContextParams} contextParams context params
 * @property {number} [lookupIndex] only this lookup of the feature
 */

/**
 * Lookup a feature using a query parameters
 * @param {FQuery} query feature query
 */
FeatureQuery.prototype.lookupFeature = function (query) {
    let contextParams = query.contextParams;
    let currentIndex = contextParams.index;
    const feature = this.getFeature({
        tag: query.tag, script: query.script
    });
    if (!feature) {
        const names = /** @type {{unicode?: {fullName?: {en?: string}}, windows?: {fullName?: {en?: string}}, macintosh?: {fullName?: {en?: string}}}} */ (this.font.names);
        const nameObj = names.unicode || names.windows || names.macintosh;
        const fontFullName = nameObj && nameObj.fullName && nameObj.fullName.en;
        return new Error(
            `font '${fontFullName}' ` +
            `doesn't support feature '${query.tag}' ` +
            `for script '${query.script}'.`
        );
    }
    // `lookupIndex`: only that lookup of the feature (OpenType runs each lookup over the whole
    // run before the next; a caller applying them in that order asks for one at a time).
    const featureLookups = this.getFeatureLookups(feature);
    const lookups = query.lookupIndex === undefined ? featureLookups : featureLookups.slice(query.lookupIndex, query.lookupIndex + 1);
    const substitutions = [].concat(contextParams.context);
    lookupLoop:
    for (let l = 0; l < lookups.length; l++) {
        const lookupTable = lookups[l];
        const subtables = this.getLookupSubtables(lookupTable);
        for (let s = 0; s < subtables.length; s++) {
            let subtable = subtables[s];
            let substType = this.getSubstitutionType(lookupTable, subtable);
            let lookup;

            if (substType === '71') {
                // This is an extension subtable, so lookup the target subtable
                const extension = /** @type {GsubSubtable} */ (subtable.extension);
                substType = this.getSubstitutionType(/** @type {GsubLookupTable} */ (/** @type {unknown} */ (subtable)), extension);
                lookup = this.getLookupMethod(/** @type {GsubLookupTable} */ (/** @type {unknown} */ (subtable)), extension);
                subtable = extension;
            } else {
                lookup = this.getLookupMethod(lookupTable, subtable);
            }

            let substitution;
            switch (substType) {
                case '11':
                    substitution = lookup(contextParams.current);
                    if (substitution) {
                        substitutions.splice(currentIndex, 1, new SubstitutionAction({
                            id: 11, tag: query.tag, substitution
                        }));
                    }
                    break;
                case '12':
                    substitution = lookup(contextParams.current);
                    if (substitution) {
                        substitutions.splice(currentIndex, 1, new SubstitutionAction({
                            id: 12, tag: query.tag, substitution
                        }));
                    }
                    break;
                case '61':
                case '62':
                case '63':
                    substitution = lookup(contextParams);
                    // Check for blocking rule - matched but no substitution
                    if (substitution && substitution.blocked) {
                        // A blocking rule matched - stop processing ALL lookups for this glyph
                        break lookupLoop;
                    }
                    if (Array.isArray(substitution) && substitution.length) {
                        substitutions.splice(currentIndex, 1, new SubstitutionAction({
                            id: 63, tag: query.tag, substitution
                        }));
                    }
                    break;
                case '41':
                    substitution = lookup(contextParams);
                    if (substitution) {
                        substitutions.splice(currentIndex, 1, new SubstitutionAction({
                            id: 41, tag: query.tag, substitution
                        }));
                    }
                    break;
                case '21':
                    substitution = lookup(contextParams.current);
                    if (substitution) {
                        substitutions.splice(currentIndex, 1, new SubstitutionAction({
                            id: 21, tag: query.tag, substitution
                        }));
                    }
                    break;
                case '51':
                case '53':
                    substitution = lookup(contextParams);
                    // Check for blocking rule - matched but no substitution
                    if (substitution && substitution.blocked) {
                        // A blocking rule matched - stop processing ALL lookups for this glyph
                        break lookupLoop;
                    }
                    if (Array.isArray(substitution) && substitution.length) {
                        substitutions.splice(currentIndex, 1, new SubstitutionAction({
                            id: parseInt(substType),
                            tag: query.tag,
                            substitution
                        }));
                    }
                    break;
            }
            contextParams = new ContextParams(substitutions, currentIndex);
            if (Array.isArray(substitution) && !substitution.length) continue;
            substitution = null;
        }
    }
    return substitutions.length ? substitutions : null;
};

/**
 * Checks if a font supports a specific features
 * @param {{script?: string, tag?: string}} query feature query object
 */
FeatureQuery.prototype.supports = function (query) {
    if (!query.script) return false;
    this.getScriptFeatures(query.script);
    const supportedScript = Object.prototype.hasOwnProperty.call(this.features, query.script);
    if (!query.tag) return supportedScript;
    const supportedFeature = (
        this.features[query.script].some(feature => feature.tag === query.tag)
    );
    return supportedScript && supportedFeature;
};

/**
 * Get lookup table subtables
 * @param {GsubLookupTable} lookupTable lookup table
 * @returns {GsubSubtable[] | null}
 */
FeatureQuery.prototype.getLookupSubtables = function (lookupTable) {
    return /** @type {GsubSubtable[] | null} */ (lookupTable.subtables || null);
};

/**
 * Get lookup table by index
 * @param {number} index lookup table index
 */
FeatureQuery.prototype.getLookupByIndex = function (index) {
    const lookups = /** @type {{lookups: Array<unknown>}} */ (/** @type {Record<string, unknown>} */ (this.font.tables).gsub).lookups;
    return lookups[index] || null;
};

/**
 * Get lookup tables for a feature
 * @param {Record<string, unknown>} feature
 */
FeatureQuery.prototype.getFeatureLookups = function (feature) {
    // TODO: memoize
    return /** @type {number[]} */ (feature.lookupListIndexes).map(this.getLookupByIndex.bind(this));
};

/**
 * Query a feature by it's properties
 * @param {{script: string, tag: string}} query an object that describes the properties of a query
 */
FeatureQuery.prototype.getFeature = function getFeature(query) {
    if (!this.font) return { FAIL: 'No font was found'};
    if (!Object.prototype.hasOwnProperty.call(this.features, query.script)) {
        this.getScriptFeatures(query.script);
    }
    const scriptFeatures = this.features[query.script];
    if (!scriptFeatures) return (
        { FAIL: `No feature for script ${query.script}`}
    );
    if (!scriptFeatures.tags[query.tag]) return null;
    return this.features[query.script].tags[query.tag];
};

export default FeatureQuery;
export { FeatureQuery, SubstitutionAction };
