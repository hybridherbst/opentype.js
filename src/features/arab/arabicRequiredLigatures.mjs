/**
 * Apply Arabic required ligatures feature to a range of tokens
 */

import applySubstitution from '../applySubstitution.mjs';
import { getContextParams } from '../commonFeatureUtils.mjs';

/**
 * Apply Arabic required ligatures to a context range
 * @param {unknown} range a range of tokens
 */
function arabicRequiredLigatures(range) {
    const script = 'arab';
    let tokens = this.tokenizer.getRangeTokens(range);
    let contextParams = getContextParams(tokens, 0);
    for (let index = 0; index < contextParams.context.length; index++) {
        contextParams.setCurrentIndex(index);
        let substitutions = this.query.lookupFeature({
            tag: 'rlig', script, contextParams
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

export default arabicRequiredLigatures;
export { arabicRequiredLigatures };
