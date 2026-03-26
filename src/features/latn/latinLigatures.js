/**
 * Apply Latin ligature feature to a range of tokens
 */

import * as _tokenizer from '../../tokenizer.js';
const ContextParams = /** @type {any} */ (_tokenizer).ContextParams;
import applySubstitution from '../applySubstitution.js';

// @TODO: use commonFeatureUtils.js for reduction of code duplication
// once #564 has been merged.

/**
 * Update context params
 * @param {any} tokens a list of tokens
 * @param {number} index current item index
 */
function getContextParams(tokens, index) {
    const context = tokens.map(token => token.activeState.value);
    return new ContextParams(context, index || 0);
}

/**
 * Apply Latin ligature feature to a context range
 * @param {any} range a range of tokens
 * @param {string} [tag='liga'] the feature tag to apply (e.g., 'liga', 'dlig', 'clig')
 */
function latinLigature(range, tag = 'liga') {
    const script = 'latn';
    let tokens = this.tokenizer.getRangeTokens(range);
    let contextParams = getContextParams(tokens, 0);
    for(let index = 0; index < contextParams.context.length; index++) {
        contextParams.setCurrentIndex(index);
        let substitutions = this.query.lookupFeature({
            tag, script, contextParams
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

export default latinLigature;
