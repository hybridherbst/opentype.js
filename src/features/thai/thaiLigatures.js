/**
 * Apply Thai Ligatures feature to tokens
 */

import applySubstitution from '../applySubstitution.js';
import { getContextParams } from '../commonFeatureUtils.js';

/**
  * Apply Thai required glyphs composition substitutions
  * @param {unknown} range a range of tokens
  */
function thaiLigatures(range) {
    const script = 'thai';
    let tokens = this.tokenizer.getRangeTokens(range);
    let contextParams = getContextParams(tokens, 0);
    for(let index = 0; index < contextParams.context.length; index++) {
        contextParams.setCurrentIndex(index);
        let substitutions = this.query.lookupFeature({
            tag: 'liga', script, contextParams
        });
        if (substitutions.length) {
            for(let i = 0; i < substitutions.length; i++) {
                const action = substitutions[i];
                applySubstitution(action, tokens, index);
            }
            contextParams = getContextParams(tokens, index);
        }
    }
}

export default thaiLigatures;
