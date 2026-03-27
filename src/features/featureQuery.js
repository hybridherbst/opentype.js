/**
 * Query a feature by some of it's properties to lookup a glyph substitution.
 */

// @ts-ignore
import { ContextParams } from '../tokenizer.js';
import { isTashkeelArabicChar } from '../char.js';

/**
 * @typedef {Record<string, unknown>} GsubSubtable
 */

/**
 * @typedef {Record<string, unknown>} GsubLookupTable
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
    return glyphIndex + /** @type {number} */ (subtable.deltaGlyphId);
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
function chainingSubstitutionFormat2(contextParams, subtable) {
    // First check if current glyph is in coverage
    let glyphIndex = contextParams.current;
    glyphIndex = Array.isArray(glyphIndex) ? glyphIndex[0] : glyphIndex;
    
    const coverageIndex = lookupCoverage(glyphIndex, /** @type {Record<string, unknown>} */ (subtable.coverage));
    if (coverageIndex === -1) return [];

    // Get the class of the current glyph using the input class definition
    const inputClass = getGlyphClass(subtable.inputClassDef, glyphIndex);
    
    // Get the chain class set for this input class
    const chainClassSet = subtable.chainClassSet && subtable.chainClassSet[inputClass];
    if (!chainClassSet) return [];
    
    // Try each chain class rule
    for (let ruleIndex = 0; ruleIndex < chainClassSet.length; ruleIndex++) {
        const rule = chainClassSet[ruleIndex];
        if (!rule) continue;
        
        // Check backtrack context
        let backtrackContext = [].concat(contextParams.backtrack);
        backtrackContext.reverse();
        while (backtrackContext.length && isTashkeelArabicChar(backtrackContext[0].char)) {
            backtrackContext.shift();
        }
        
        if (backtrackContext.length < rule.backtrack.length) continue;
        
        let backtrackMatch = true;
        for (let i = 0; i < rule.backtrack.length; i++) {
            const backGlyph = backtrackContext[i];
            const backGlyphIndex = Array.isArray(backGlyph) ? backGlyph[0] : backGlyph;
            const backClass = getGlyphClass(subtable.backtrackClassDef, backGlyphIndex);
            if (backClass !== rule.backtrack[i]) {
                backtrackMatch = false;
                break;
            }
        }
        if (!backtrackMatch) continue;
        
        // Check input context (remaining input glyphs after the first one)
        let inputMatch = true;
        for (let i = 0; i < rule.input.length; i++) {
            const inputGlyph = contextParams.get(i + 1);
            if (!inputGlyph) {
                inputMatch = false;
                break;
            }
            const inputGlyphIndex = Array.isArray(inputGlyph) ? inputGlyph[0] : inputGlyph;
            const inputGlyphClass = getGlyphClass(subtable.inputClassDef, inputGlyphIndex);
            if (inputGlyphClass !== rule.input[i]) {
                inputMatch = false;
                break;
            }
        }
        if (!inputMatch) continue;
        
        // Check lookahead context
        const lookaheadOffset = rule.input.length;
        let lookaheadContext = contextParams.lookahead.slice(lookaheadOffset);
        while (lookaheadContext.length && isTashkeelArabicChar(lookaheadContext[0].char)) {
            lookaheadContext.shift();
        }
        
        if (lookaheadContext.length < rule.lookahead.length) continue;
        
        let lookaheadMatch = true;
        for (let i = 0; i < rule.lookahead.length; i++) {
            const lookGlyph = lookaheadContext[i];
            const lookGlyphIndex = Array.isArray(lookGlyph) ? lookGlyph[0] : lookGlyph;
            const lookClass = getGlyphClass(subtable.lookaheadClassDef, lookGlyphIndex);
            if (lookClass !== rule.lookahead[i]) {
                lookaheadMatch = false;
                break;
            }
        }
        if (!lookaheadMatch) continue;
        
        // All contexts match - apply substitutions
        let substitutions = [];
        for (let i = 0; i < rule.lookupRecords.length; i++) {
            const lookupRecord = rule.lookupRecords[i];
            const lookupListIndex = lookupRecord.lookupListIndex;
            const lookupTable = this.getLookupByIndex(lookupListIndex);
            
            for (let s = 0; s < lookupTable.subtables.length; s++) {
                let lookupSubtable = lookupTable.subtables[s];
                let lookup;
                let substitutionType = this.getSubstitutionType(lookupTable, lookupSubtable);
                
                if (substitutionType === '71') {
                    // This is an extension subtable, so lookup the target subtable
                    substitutionType = this.getSubstitutionType(lookupSubtable, lookupSubtable.extension);
                    lookup = this.getLookupMethod(lookupSubtable, lookupSubtable.extension);
                    lookupSubtable = lookupSubtable.extension;
                } else {
                    lookup = this.getLookupMethod(lookupTable, lookupSubtable);
                }
                
                // Get the glyph at the sequence index specified by the lookup record
                const sequenceIndex = lookupRecord.sequenceIndex;
                const targetGlyph = contextParams.get(sequenceIndex);
                const targetGlyphIndex = Array.isArray(targetGlyph) ? targetGlyph[0] : targetGlyph;
                
                if (substitutionType === '11' || substitutionType === '12') {
                    const substitution = lookup(targetGlyphIndex);
                    if (substitution) substitutions.push(substitution);
                } else if (substitutionType === '21') {
                    // Multiple substitution (decomposition)
                    const decomposed = lookup(targetGlyphIndex);
                    if (decomposed && Array.isArray(decomposed)) {
                        substitutions.push(...decomposed);
                    } else if (decomposed) {
                        substitutions.push(decomposed);
                    }
                }
            }
        }
        
        return substitutions;
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

                if (substitutionType === '12') {
                    for (let n = 0; n < inputLookups.length; n++) {
                        const glyphIndex = contextParams.get(n);
                        const substitution = lookup(glyphIndex);
                        if (substitution) substitutions.push(substitution);
                    }
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
    let substitutions = [];

    for (let i = 0; i < subtable.coverages.length; i++){
        const lookupRecord = subtable.lookupRecords[i];
        const coverage = subtable.coverages[i];

        let glyphIndex = contextParams.context[contextParams.index + lookupRecord.sequenceIndex];
        let ligSetIndex = lookupCoverage(glyphIndex, coverage);
        if (ligSetIndex === -1){
            return null;
        }
        let lookUp = this.font.tables.gsub.lookups[lookupRecord.lookupListIndex];
        for (let i = 0; i < lookUp.subtables.length; i++){
            let subtable = lookUp.subtables[i];
            let ligSetIndex = lookupCoverage(glyphIndex, subtable.coverage);
            if (ligSetIndex === -1)
                return null;
            switch (lookUp.lookupType) {
                case 1:{
                    let ligature = subtable.substitute[ligSetIndex];
                    substitutions.push(ligature);
                    break;
                }
                case 2:{
                    let ligatureSet = subtable.sequences[ligSetIndex];
                    substitutions.push(ligatureSet);
                    break;
                } 
                default:
                    break;
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
    const lookups = this.getFeatureLookups(feature);
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
                substType = this.getSubstitutionType(subtable, extension);
                lookup = this.getLookupMethod(subtable, extension);
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
