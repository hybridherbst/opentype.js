// The `GSUB` table contains ligatures, among other things.
// https://www.microsoft.com/typography/OTSPEC/gsub.htm

import check from '../check.js';
import { Parser } from '../parse.js';
import table from '../table.js';
import featureVariationsTable from './featurevariations.js';

/** @type {Array<(this: Parser) => unknown>} */
const subtableParsers = new Array(9);         // subtableParsers[0] is unused

// https://www.microsoft.com/typography/OTSPEC/GSUB.htm#SS
subtableParsers[1] = function parseLookup1() {
    const start = this.offset + this.relativeOffset;
    const substFormat = this.parseUShort();
    if (substFormat === 1) {
        return {
            substFormat: 1,
            coverage: this.parsePointer(Parser.coverage),
            deltaGlyphId: this.parseShort()
        };
    } else if (substFormat === 2) {
        return {
            substFormat: 2,
            coverage: this.parsePointer(Parser.coverage),
            substitute: this.parseOffset16List()
        };
    }
    check.assert(false, '0x' + start.toString(16) + ': lookup type 1 format must be 1 or 2.');
};

// https://www.microsoft.com/typography/OTSPEC/GSUB.htm#MS
subtableParsers[2] = function parseLookup2() {
    const substFormat = this.parseUShort();
    check.argument(substFormat === 1, 'GSUB Multiple Substitution Subtable identifier-format must be 1');
    return {
        substFormat: substFormat,
        coverage: this.parsePointer(Parser.coverage),
        sequences: this.parseListOfLists()
    };
};

// https://www.microsoft.com/typography/OTSPEC/GSUB.htm#AS
subtableParsers[3] = function parseLookup3() {
    const substFormat = this.parseUShort();
    check.argument(substFormat === 1, 'GSUB Alternate Substitution Subtable identifier-format must be 1');
    return {
        substFormat: substFormat,
        coverage: this.parsePointer(Parser.coverage),
        alternateSets: this.parseListOfLists()
    };
};

// https://www.microsoft.com/typography/OTSPEC/GSUB.htm#LS
subtableParsers[4] = function parseLookup4() {
    const substFormat = this.parseUShort();
    check.argument(substFormat === 1, 'GSUB ligature table identifier-format must be 1');
    return {
        substFormat: substFormat,
        coverage: this.parsePointer(Parser.coverage),
        ligatureSets: this.parseListOfLists(function() {
            return {
                ligGlyph: this.parseUShort(),
                components: this.parseUShortList(this.parseUShort() - 1)
            };
        })
    };
};

const lookupRecordDesc = {
    sequenceIndex: Parser.uShort,
    lookupListIndex: Parser.uShort
};

// https://www.microsoft.com/typography/OTSPEC/GSUB.htm#CSF
subtableParsers[5] = function parseLookup5() {
    const start = this.offset + this.relativeOffset;
    const substFormat = this.parseUShort();

    if (substFormat === 1) {
        return {
            substFormat: substFormat,
            coverage: this.parsePointer(Parser.coverage),
            ruleSets: this.parseListOfLists(function() {
                const glyphCount = this.parseUShort();
                const substCount = this.parseUShort();
                return {
                    input: this.parseUShortList(glyphCount - 1),
                    lookupRecords: this.parseRecordList(substCount, lookupRecordDesc)
                };
            })
        };
    } else if (substFormat === 2) {
        return {
            substFormat: substFormat,
            coverage: this.parsePointer(Parser.coverage),
            classDef: this.parsePointer(Parser.classDef),
            classSets: this.parseListOfLists(function() {
                const glyphCount = this.parseUShort();
                const substCount = this.parseUShort();
                return {
                    classes: this.parseUShortList(glyphCount - 1),
                    lookupRecords: this.parseRecordList(substCount, lookupRecordDesc)
                };
            })
        };
    } else if (substFormat === 3) {
        const glyphCount = this.parseUShort();
        const substCount = this.parseUShort();
        return {
            substFormat: substFormat,
            coverages: this.parseList(glyphCount, Parser.pointer(Parser.coverage)),
            lookupRecords: this.parseRecordList(substCount, lookupRecordDesc)
        };
    }
    check.assert(false, '0x' + start.toString(16) + ': lookup type 5 format must be 1, 2 or 3.');
};

// https://www.microsoft.com/typography/OTSPEC/GSUB.htm#CC
subtableParsers[6] = function parseLookup6() {
    const start = this.offset + this.relativeOffset;
    const substFormat = this.parseUShort();
    if (substFormat === 1) {
        return {
            substFormat: 1,
            coverage: this.parsePointer(Parser.coverage),
            chainRuleSets: this.parseListOfLists(function() {
                return {
                    backtrack: this.parseUShortList(),
                    input: this.parseUShortList(this.parseShort() - 1),
                    lookahead: this.parseUShortList(),
                    lookupRecords: this.parseRecordList(lookupRecordDesc)
                };
            })
        };
    } else if (substFormat === 2) {
        return {
            substFormat: 2,
            coverage: this.parsePointer(Parser.coverage),
            backtrackClassDef: this.parsePointer(Parser.classDef),
            inputClassDef: this.parsePointer(Parser.classDef),
            lookaheadClassDef: this.parsePointer(Parser.classDef),
            chainClassSet: this.parseListOfLists(function() {
                return {
                    backtrack: this.parseUShortList(),
                    input: this.parseUShortList(this.parseShort() - 1),
                    lookahead: this.parseUShortList(),
                    lookupRecords: this.parseRecordList(lookupRecordDesc)
                };
            })
        };
    } else if (substFormat === 3) {
        return {
            substFormat: 3,
            backtrackCoverage: this.parseList(Parser.pointer(Parser.coverage)),
            inputCoverage: this.parseList(Parser.pointer(Parser.coverage)),
            lookaheadCoverage: this.parseList(Parser.pointer(Parser.coverage)),
            lookupRecords: this.parseRecordList(lookupRecordDesc)
        };
    }
    check.assert(false, '0x' + start.toString(16) + ': lookup type 6 format must be 1, 2 or 3.');
};

// https://www.microsoft.com/typography/OTSPEC/GSUB.htm#ES
subtableParsers[7] = function parseLookup7() {
    // Extension Substitution subtable
    let substFormat;
    let extensionLookupType;
    let extensionOffset;
    try {
        substFormat = this.parseUShort();
        check.argument(substFormat === 1, 'GSUB Extension Substitution subtable identifier-format must be 1');
        extensionLookupType = this.parseUShort();
        extensionOffset = this.parseULong();
    } catch (err) {
        if (err instanceof RangeError) {
            return { error: 'GSUB extension subtable truncated' };
        }
        throw err;
    }

    const extensionStart = this.offset + extensionOffset;
    if (!subtableParsers[extensionLookupType]) {
        return { error: 'Unsupported GSUB extension lookup type ' + extensionLookupType };
    }
    if (extensionOffset === 0 || extensionStart < 0 || extensionStart >= this.data.byteLength) {
        return { error: 'Invalid GSUB extension offset ' + extensionOffset };
    }

    const extensionParser = new Parser(this.data, extensionStart);
    let extension;
    try {
        extension = subtableParsers[extensionLookupType].call(extensionParser);
    } catch (err) {
        if (err instanceof RangeError) {
            return { error: 'GSUB extension parse out of bounds' };
        }
        throw err;
    }
    return {
        substFormat: 1,
        lookupType: extensionLookupType,
        extension: extension
    };
};

// https://www.microsoft.com/typography/OTSPEC/GSUB.htm#RCCS
subtableParsers[8] = function parseLookup8() {
    const substFormat = this.parseUShort();
    check.argument(substFormat === 1, 'GSUB Reverse Chaining Contextual Single Substitution Subtable identifier-format must be 1');
    return {
        substFormat: substFormat,
        coverage: this.parsePointer(Parser.coverage),
        backtrackCoverage: this.parseList(Parser.pointer(Parser.coverage)),
        lookaheadCoverage: this.parseList(Parser.pointer(Parser.coverage)),
        substitutes: this.parseUShortList()
    };
};

// ---- Type definitions ----

/**
 * A lookup record referencing another lookup to apply at a sequence position.
 * @typedef {object} GsubLookupRecord
 * @property {number} sequenceIndex - index into the input sequence
 * @property {number} lookupListIndex - index into the lookup list
 */

/**
 * A single GSUB substitution subtable. Properties vary by lookup type and substFormat.
 * All subtables share `substFormat`; other properties are type-specific.
 * @typedef {object} GsubSubtable
 * @property {number} substFormat - substitution format (1 or 2 for most lookup types)
 * @property {object} [coverage] - coverage table (format 1 or 2)
 * @property {number} [deltaGlyphId] - (type 1 fmt 1) delta added to glyph index
 * @property {number[]} [substitute] - (type 1 fmt 2) list of substitute glyph ids
 * @property {number[][]} [sequences] - (type 2) per-coverage-index sequences of glyph ids
 * @property {number[][]} [alternateSets] - (type 3) per-coverage-index alternate glyph sets
 * @property {Array<Array<{ligGlyph: number, components: number[]}>>} [ligatureSets] - (type 4) ligature sets per coverage index
 * @property {Array<Array<{input: number[], lookupRecords: GsubLookupRecord[]}>>} [ruleSets] - (type 5 fmt 1) sequence rule sets
 * @property {object} [classDef] - (type 5 fmt 2) class definition table
 * @property {Array<Array<{classes: number[], lookupRecords: GsubLookupRecord[]}>>} [classSets] - (type 5 fmt 2) class sets
 * @property {object[]} [coverages] - (type 5 fmt 3 / type 6 fmt 3) list of coverage tables
 * @property {GsubLookupRecord[]} [lookupRecords] - (type 5 fmt 3 / type 6 fmt 3) lookup records
 * @property {Array<Array<{backtrack: number[], input: number[], lookahead: number[], lookupRecords: GsubLookupRecord[]}>>} [chainRuleSets] - (type 6 fmt 1)
 * @property {object} [backtrackClassDef] - (type 6 fmt 2) backtrack class definition
 * @property {object} [inputClassDef] - (type 6 fmt 2) input class definition
 * @property {object} [lookaheadClassDef] - (type 6 fmt 2) lookahead class definition
 * @property {Array<Array<{backtrack: number[], input: number[], lookahead: number[], lookupRecords: GsubLookupRecord[]}>>} [chainClassSet] - (type 6 fmt 2)
 * @property {object[]} [backtrackCoverage] - (type 6 fmt 3 / type 8) backtrack coverage tables
 * @property {object[]} [inputCoverage] - (type 6 fmt 3) input coverage tables
 * @property {object[]} [lookaheadCoverage] - (type 6 fmt 3 / type 8) lookahead coverage tables
 * @property {number[]} [substitutes] - (type 8) reverse chain single substitution glyph ids
 * @property {number} [lookupType] - (type 7) extension: actual lookup type wrapped
 * @property {GsubSubtable} [extension] - (type 7) extension: inner subtable
 * @property {string} [error] - error message if parsing failed
 */

/**
 * A single GSUB lookup table.
 * @typedef {object} GsubLookupTable
 * @property {number} lookupType - lookup type (1–8)
 * @property {number} lookupFlag - lookup flags bitmask
 * @property {GsubSubtable[]} subtables - list of subtables
 * @property {number} [markFilteringSet] - index into MarkGlyphSetsTable (when UseMarkFilteringSet flag is set)
 */

/**
 * A LangSys table entry.
 * @typedef {object} LangSysTable
 * @property {number} reserved - reserved field (always 0)
 * @property {number} reqFeatureIndex - required feature index (0xFFFF = none)
 * @property {number[]} featureIndexes - indices into the feature list
 */

/**
 * A script record containing the default LangSys and any language-specific LangSys tables.
 * @typedef {object} ScriptTable
 * @property {LangSysTable} defaultLangSys - default language system table
 * @property {Array<{tag: string, langSys: LangSysTable}>} langSysRecords - language-specific records
 */

/**
 * A feature record: tag + feature table.
 * @typedef {object} FeatureRecord
 * @property {string} tag - 4-character feature tag
 * @property {{featureParams: number, lookupListIndexes: number[]}} feature - feature table
 */

/**
 * A script list entry (tag + script table).
 * @typedef {object} ScriptRecord
 * @property {string} tag - 4-character script tag
 * @property {ScriptTable} script - script table
 */

/**
 * The top-level parsed GSUB table.
 * @typedef {object} GsubTable
 * @property {number} version - table version (1 or 1.1)
 * @property {ScriptRecord[]} scripts - script list
 * @property {FeatureRecord[]} features - feature list
 * @property {GsubLookupTable[]} lookups - lookup list
 * @property {object[]} [variations] - (version 1.1) feature variations list
 */

// https://www.microsoft.com/typography/OTSPEC/gsub.htm
/**
 * @param {DataView} data
 * @param {number} [start]
 * @returns {GsubTable}
 */
function parseGsubTable(data, start) {
    start = start || 0;
    const p = new Parser(data, start);
    const tableVersion = p.parseVersion(1);
    check.argument(tableVersion === 1 || tableVersion === 1.1, 'Unsupported GSUB table version.');
    if (tableVersion === 1) {
        return {
            version: tableVersion,
            scripts: p.parseScriptList(),
            features: p.parseFeatureList(),
            lookups: p.parseLookupList(subtableParsers)
        };
    } else {
        return {
            version: tableVersion,
            scripts: p.parseScriptList(),
            features: p.parseFeatureList(),
            lookups: p.parseLookupList(subtableParsers),
            variations: p.parseFeatureVariationsList()
        };
    }

}

// GSUB Writing //////////////////////////////////////////////
const subtableMakers = new Array(9);

subtableMakers[1] = function makeLookup1(subtable) {
    if (subtable.substFormat === 1) {
        return new table.Table('substitutionTable', [
            {name: 'substFormat', type: 'USHORT', value: 1},
            {name: 'coverage', type: 'TABLE', value: new table.Coverage(subtable.coverage)},
            {name: 'deltaGlyphID', type: 'SHORT', value: subtable.deltaGlyphId}
        ]);
    } else if (subtable.substFormat === 2) {
        return new table.Table('substitutionTable', [
            {name: 'substFormat', type: 'USHORT', value: 2},
            {name: 'coverage', type: 'TABLE', value: new table.Coverage(subtable.coverage)}
        ].concat(table.ushortList('substitute', subtable.substitute)));
    }
    check.fail('Lookup type 1 substFormat must be 1 or 2.');
};

subtableMakers[2] = function makeLookup2(subtable) {
    check.assert(subtable.substFormat === 1, 'Lookup type 2 substFormat must be 1.');
    return new table.Table('substitutionTable', [
        {name: 'substFormat', type: 'USHORT', value: 1},
        {name: 'coverage', type: 'TABLE', value: new table.Coverage(subtable.coverage)}
    ].concat(table.tableList('seqSet', subtable.sequences, function(sequenceSet) {
        return new table.Table('sequenceSetTable', table.ushortList('sequence', sequenceSet));
    })));
};

subtableMakers[3] = function makeLookup3(subtable) {
    check.assert(subtable.substFormat === 1, 'Lookup type 3 substFormat must be 1.');
    return new table.Table('substitutionTable', [
        {name: 'substFormat', type: 'USHORT', value: 1},
        {name: 'coverage', type: 'TABLE', value: new table.Coverage(subtable.coverage)}
    ].concat(table.tableList('altSet', subtable.alternateSets, function(alternateSet) {
        return new table.Table('alternateSetTable', table.ushortList('alternate', alternateSet));
    })));
};

subtableMakers[4] = function makeLookup4(subtable) {
    check.assert(subtable.substFormat === 1, 'Lookup type 4 substFormat must be 1.');
    return new table.Table('substitutionTable', [
        {name: 'substFormat', type: 'USHORT', value: 1},
        {name: 'coverage', type: 'TABLE', value: new table.Coverage(subtable.coverage)}
    ].concat(table.tableList('ligSet', subtable.ligatureSets, function(ligatureSet) {
        return new table.Table('ligatureSetTable', table.tableList('ligature', ligatureSet, function(ligature) {
            return new table.Table('ligatureTable',
                [{name: 'ligGlyph', type: 'USHORT', value: ligature.ligGlyph}]
                    .concat(table.ushortList('component', ligature.components, ligature.components.length + 1))
            );
        }));
    })));
};

subtableMakers[5] = function makeLookup5(subtable) {
    if (subtable.substFormat === 1) {
        return new table.Table('contextualSubstitutionTable', [
            {name: 'substFormat', type: 'USHORT', value: subtable.substFormat},
            {name: 'coverage', type: 'TABLE', value: new table.Coverage(subtable.coverage)}
        ].concat(table.tableList('sequenceRuleSet', subtable.ruleSets, function(sequenceRuleSet) {
            if (!sequenceRuleSet) {
                return new table.Table('NULL', null);
            }
            return new table.Table('sequenceRuleSetTable', table.tableList('sequenceRule', sequenceRuleSet, function(sequenceRule) {
                let tableData = table.ushortList('seqLookup', [], sequenceRule.lookupRecords.length)
                    .concat(table.ushortList('inputSequence', sequenceRule.input, sequenceRule.input.length + 1));

                // swap the first two elements, because inputSequenceCount
                // ("glyphCount" in the spec) comes before seqLookupCount
                [tableData[0], tableData[1]] = [tableData[1], tableData[0]];

                for(let i = 0; i < sequenceRule.lookupRecords.length; i++) {
                    const record = sequenceRule.lookupRecords[i];
                    tableData = tableData
                        .concat({name: 'sequenceIndex' + i, type: 'USHORT', value: record.sequenceIndex})
                        .concat({name: 'lookupListIndex' + i, type: 'USHORT', value: record.lookupListIndex});
                }
                return new table.Table('sequenceRuleTable', tableData);
            }));
        })));
    } else if (subtable.substFormat === 2) {
        return new table.Table('contextualSubstitutionTable', [
            {name: 'substFormat', type: 'USHORT', value: subtable.substFormat},
            {name: 'coverage', type: 'TABLE', value: new table.Coverage(subtable.coverage)},
            {name: 'classDef', type: 'TABLE', value: new table.ClassDef(subtable.classDef)}
        ].concat(table.tableList('classSeqRuleSet', subtable.classSets, function(classSeqRuleSet) {
            if (!classSeqRuleSet) {
                return new table.Table('NULL', null);
            }
            return new table.Table('classSeqRuleSetTable', table.tableList('classSeqRule', classSeqRuleSet, function(classSeqRule) {
                let tableData = table.ushortList('classes', classSeqRule.classes, classSeqRule.classes.length + 1)
                    .concat(table.ushortList('seqLookupCount', [], classSeqRule.lookupRecords.length));
                for(let i = 0; i < classSeqRule.lookupRecords.length; i++) {
                    const record = classSeqRule.lookupRecords[i];
                    tableData = tableData
                        .concat({name: 'sequenceIndex' + i, type: 'USHORT', value: record.sequenceIndex})
                        .concat({name: 'lookupListIndex' + i, type: 'USHORT', value: record.lookupListIndex});
                }
                return new table.Table('classSeqRuleTable', tableData);
            }));
        })));
    } else if (subtable.substFormat === 3) {
        let tableData = [
            {name: 'substFormat', type: 'USHORT', value: subtable.substFormat},
        ];

        tableData.push({name: 'inputGlyphCount', type: 'USHORT', value: subtable.coverages.length});
        tableData.push({name: 'substitutionCount', type: 'USHORT', value: subtable.lookupRecords.length});
        for(let i = 0; i < subtable.coverages.length; i++) {
            const coverage = subtable.coverages[i];
            tableData.push({name: 'inputCoverage' + i, type: 'TABLE', value: new table.Coverage(coverage)});
        }

        for(let i = 0; i < subtable.lookupRecords.length; i++) {
            const record = subtable.lookupRecords[i];
            tableData = tableData
                .concat({name: 'sequenceIndex' + i, type: 'USHORT', value: record.sequenceIndex})
                .concat({name: 'lookupListIndex' + i, type: 'USHORT', value: record.lookupListIndex});
        }

        let returnTable = new table.Table('contextualSubstitutionTable', tableData);

        return returnTable;
    }

    check.assert(false, 'lookup type 5 format must be 1, 2 or 3.');
};

subtableMakers[6] = function makeLookup6(subtable) {
    if (subtable.substFormat === 1) {
        let returnTable = new table.Table('chainContextTable', [
            {name: 'substFormat', type: 'USHORT', value: subtable.substFormat},
            {name: 'coverage', type: 'TABLE', value: new table.Coverage(subtable.coverage)}
        ].concat(table.tableList('chainRuleSet', subtable.chainRuleSets, function(chainRuleSet) {
            return new table.Table('chainRuleSetTable', table.tableList('chainRule', chainRuleSet, function(chainRule) {
                let tableData = table.ushortList('backtrackGlyph', chainRule.backtrack, chainRule.backtrack.length)
                    .concat(table.ushortList('inputGlyph', chainRule.input, chainRule.input.length + 1))
                    .concat(table.ushortList('lookaheadGlyph', chainRule.lookahead, chainRule.lookahead.length))
                    .concat(table.ushortList('substitution', [], chainRule.lookupRecords.length));

                for(let i = 0; i < chainRule.lookupRecords.length; i++) {
                    const record = chainRule.lookupRecords[i];
                    tableData = tableData
                        .concat({name: 'sequenceIndex' + i, type: 'USHORT', value: record.sequenceIndex})
                        .concat({name: 'lookupListIndex' + i, type: 'USHORT', value: record.lookupListIndex});
                }
                return new table.Table('chainRuleTable', tableData);
            }));
        })));
        return returnTable;
    } else if (subtable.substFormat === 2) {
        // Chaining Context Substitution Format 2: Class-based Chaining Context Glyph Substitution
        return new table.Table('chainContextTable', [
            {name: 'substFormat', type: 'USHORT', value: subtable.substFormat},
            {name: 'coverage', type: 'TABLE', value: new table.Coverage(subtable.coverage)},
            {name: 'backtrackClassDef', type: 'TABLE', value: new table.ClassDef(subtable.backtrackClassDef)},
            {name: 'inputClassDef', type: 'TABLE', value: new table.ClassDef(subtable.inputClassDef)},
            {name: 'lookaheadClassDef', type: 'TABLE', value: new table.ClassDef(subtable.lookaheadClassDef)}
        ].concat(table.tableList('chainClassSet', subtable.chainClassSet, function(chainClassSet) {
            if (!chainClassSet) {
                return new table.Table('NULL', null);
            }
            return new table.Table('chainClassSetTable', table.tableList('chainClassRule', chainClassSet, function(chainClassRule) {
                // ChainClassRule table:
                // backtrackGlyphCount, backtrackSequence[], inputGlyphCount, inputSequence[], 
                // lookaheadGlyphCount, lookaheadSequence[], substCount, substLookupRecords[]
                let tableData = table.ushortList('backtrackClass', chainClassRule.backtrack, chainClassRule.backtrack.length)
                    .concat(table.ushortList('inputClass', chainClassRule.input, chainClassRule.input.length + 1))
                    .concat(table.ushortList('lookaheadClass', chainClassRule.lookahead, chainClassRule.lookahead.length))
                    .concat(table.ushortList('substCount', [], chainClassRule.lookupRecords.length));
                
                for(let i = 0; i < chainClassRule.lookupRecords.length; i++) {
                    const record = chainClassRule.lookupRecords[i];
                    tableData = tableData
                        .concat({name: 'sequenceIndex' + i, type: 'USHORT', value: record.sequenceIndex})
                        .concat({name: 'lookupListIndex' + i, type: 'USHORT', value: record.lookupListIndex});
                }
                return new table.Table('chainClassRuleTable', tableData);
            }));
        })));
    } else if (subtable.substFormat === 3) {
        let tableData = [
            {name: 'substFormat', type: 'USHORT', value: subtable.substFormat},
        ];

        tableData.push({name: 'backtrackGlyphCount', type: 'USHORT', value: subtable.backtrackCoverage.length});
        for(let i = 0; i < subtable.backtrackCoverage.length; i++) {
            const coverage = subtable.backtrackCoverage[i];
            tableData.push({name: 'backtrackCoverage' + i, type: 'TABLE', value: new table.Coverage(coverage)});
        }
        tableData.push({name: 'inputGlyphCount', type: 'USHORT', value: subtable.inputCoverage.length});
        
        for(let i = 0; i < subtable.inputCoverage.length; i++) {
            const coverage = subtable.inputCoverage[i];
            tableData.push({name: 'inputCoverage' + i, type: 'TABLE', value: new table.Coverage(coverage)});
        }
        tableData.push({name: 'lookaheadGlyphCount', type: 'USHORT', value: subtable.lookaheadCoverage.length});
        
        for(let i = 0; i < subtable.lookaheadCoverage.length; i++) {
            const coverage = subtable.lookaheadCoverage[i];
            tableData.push({name: 'lookaheadCoverage' + i, type: 'TABLE', value: new table.Coverage(coverage)});
        }

        tableData.push({name: 'substitutionCount', type: 'USHORT', value: subtable.lookupRecords.length});
        for(let i = 0; i < subtable.lookupRecords.length; i++) {
            const record = subtable.lookupRecords[i];
            tableData = tableData
                .concat({name: 'sequenceIndex' + i, type: 'USHORT', value: record.sequenceIndex})
                .concat({name: 'lookupListIndex' + i, type: 'USHORT', value: record.lookupListIndex});
        }

        let returnTable = new table.Table('chainContextTable', tableData);

        return returnTable;
    }

    check.assert(false, 'lookup type 6 format must be 1, 2 or 3.');
};

// Extension Substitution subtable (lookup type 7)
// The inner subtable is encoded as a first-class 32-bit offset reference from
// the extension header rather than being emitted and patched in a custom pass.
subtableMakers[7] = function makeLookup7(subtable) {
    // subtable has: { substFormat: 1, lookupType: actualType, extension: actualSubtable }
    check.argument(subtable.substFormat === 1, 'Extension substitution format must be 1');
    check.argument(subtable.lookupType && subtable.lookupType !== 7, 'Extension cannot wrap another extension');
    
    // Get the maker for the actual lookup type
    const actualMaker = subtableMakers[subtable.lookupType];
    check.assert(actualMaker, 'No maker for extension lookup type ' + subtable.lookupType);
    
    const actualTable = actualMaker(subtable.extension);

    return new table.Table('extensionSubstitution', [
        {name: 'substFormat', type: 'USHORT', value: 1},
        {name: 'extensionLookupType', type: 'USHORT', value: subtable.lookupType},
        {name: 'extensionOffset', type: 'OFFSET32', value: actualTable, targetScope: 'root'}
    ]);
};

/**
 * @param {GsubTable} gsub
 * @returns {object}
 */
function makeGsubTable(gsub) {
    const hasFeatureVariations = gsub.variations && gsub.variations.length > 0;
    /** @type {Array<{name: string, type: string, value?: unknown}>} */
    const tableFields = [
        {name: 'version', type: 'ULONG', value: hasFeatureVariations ? 0x00010001 : 0x10000},
        {name: 'scripts', type: 'TABLE', value: new table.ScriptList(gsub.scripts)},
        {name: 'features', type: 'TABLE', value: new table.FeatureList(gsub.features)},
        {name: 'lookups', type: 'TABLE', value: new table.LookupList(gsub.lookups, subtableMakers)}
    ];

    if (hasFeatureVariations) {
        tableFields.push({
            name: 'featureVariations',
            type: 'OFFSET32',
            value: featureVariationsTable.make(gsub.variations)
        });
    }

    return new table.Table('GSUB', tableFields);
}

export default { parse: parseGsubTable, make: makeGsubTable };
