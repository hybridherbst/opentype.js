import applySubstitution from '../applySubstitution.mjs';
import { getContextParams } from '../commonFeatureUtils.mjs';

/**
 * Apply ccmp replacement ligatures to a context range
 * @param {unknown} range a range of tokens
 */
function ccmpReplacementLigatures(range) {
    const script = 'delf';
    const tag = 'ccmp';
    let tokens = this.tokenizer.getRangeTokens(range);
    let contextParams = getContextParams(tokens, 0);
    for(let index = 0; index < contextParams.context.length; index++) {
        if (!this.query.getFeature({tag, script, contextParams})){
            continue;
        }
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

export default ccmpReplacementLigatures;



