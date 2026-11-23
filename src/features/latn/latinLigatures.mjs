/**
 * Apply Latin ligature feature to a range of tokens
 */

import applySubstitution from '../applySubstitution.mjs';
import { getContextParams } from '../commonFeatureUtils.mjs';

/**
 * Apply Latin ligature feature to a context range
 * @param {unknown} range a range of tokens
 * @param {string} [tag='liga'] the feature tag to apply (e.g., 'liga', 'dlig', 'clig')
 */
function latinLigature(range, tag = 'liga') {
    const script = 'latn';
    const feature = this.query.getFeature({ tag, script });
    if (!feature) return;
    // Lookup by lookup, each over the whole word, as OpenType applies them: a fraction's second
    // lookup sees the slash its first one turned into a fraction slash.
    const lookupCount = this.query.getFeatureLookups(feature).length;
    for (let lookupIndex = 0; lookupIndex < lookupCount; lookupIndex++) {
        let tokens = this.tokenizer.getRangeTokens(range);
        let contextParams = getContextParams(tokens, 0);
        for(let index = 0; index < contextParams.context.length; index++) {
            contextParams.setCurrentIndex(index);
            let substitutions = this.query.lookupFeature({
                tag, script, contextParams, lookupIndex
            });
            if (substitutions.length) {
                for(let i = 0; i < substitutions.length; i++) {
                    const action = substitutions[i];
                    applySubstitution(action, tokens, index);
                }
                contextParams = getContextParams(tokens, 0);
            }
        }
    }
}

export default latinLigature;
