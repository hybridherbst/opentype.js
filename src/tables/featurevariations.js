import table from '../table.js';

function makeConditionTable(condition) {
    return new table.Table('conditionTable', [
        { name: 'format', type: 'USHORT', value: condition.format || 1 },
        { name: 'axisIndex', type: 'USHORT', value: condition.axisIndex },
        { name: 'filterRangeMinValue', type: 'F2DOT14', value: condition.filterRangeMinValue },
        { name: 'filterRangeMaxValue', type: 'F2DOT14', value: condition.filterRangeMaxValue }
    ]);
}

function makeConditionSetTable(conditions) {
    const conditionList = Array.isArray(conditions) ? conditions : [];
    /** @type {Array<{name: string, type: string, value?: unknown}>} */
    const fields = [
        { name: 'conditionCount', type: 'USHORT', value: conditionList.length }
    ];
    for (let i = 0; i < conditionList.length; i += 1) {
        fields.push({
            name: 'condition_' + i,
            type: 'OFFSET32',
            value: makeConditionTable(conditionList[i])
        });
    }
    return new table.Table('conditionSetTable', fields);
}

function makeAlternateFeatureTable(substitution) {
    const lookupListIndices = substitution.lookupListIndices || [];
    return new table.Table('alternateFeatureTable', [
        { name: 'featureParams', type: 'USHORT', value: 0 }
    ].concat(table.ushortList('lookupListIndex', lookupListIndices)));
}

function makeFeatureTableSubstitutionTable(featureSubstitutions) {
    const substitutions = Array.isArray(featureSubstitutions) ? featureSubstitutions : [];
    /** @type {Array<{name: string, type: string, value?: unknown}>} */
    const fields = [
        { name: 'majorVersion', type: 'USHORT', value: 1 },
        { name: 'minorVersion', type: 'USHORT', value: 0 },
        { name: 'substitutionCount', type: 'USHORT', value: substitutions.length }
    ];
    for (let i = 0; i < substitutions.length; i += 1) {
        const substitution = substitutions[i];
        fields.push({
            name: 'featureIndex_' + i,
            type: 'USHORT',
            value: substitution.featureIndex
        });
        fields.push({
            name: 'alternateFeature_' + i,
            type: 'OFFSET32',
            value: makeAlternateFeatureTable(substitution)
        });
    }
    return new table.Table('featureTableSubstitutionTable', fields);
}

function makeFeatureVariationsTable(variations) {
    const featureVariations = Array.isArray(variations) ? variations : [];
    /** @type {Array<{name: string, type: string, value?: unknown}>} */
    const fields = [
        { name: 'majorVersion', type: 'USHORT', value: 1 },
        { name: 'minorVersion', type: 'USHORT', value: 0 },
        { name: 'featureVariationRecordCount', type: 'ULONG', value: featureVariations.length }
    ];
    for (let i = 0; i < featureVariations.length; i += 1) {
        const variation = featureVariations[i];
        fields.push({
            name: 'conditionSet_' + i,
            type: 'OFFSET32',
            value: makeConditionSetTable(variation.conditions)
        });
        fields.push({
            name: 'featureTableSubstitution_' + i,
            type: 'OFFSET32',
            value: makeFeatureTableSubstitutionTable(variation.featureSubstitutions)
        });
    }
    return new table.Table('featureVariationsTable', fields);
}

export default {
    make: makeFeatureVariationsTable
};
