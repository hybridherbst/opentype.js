import { ContextParams } from '../tokenizer.mjs';

/**
 * Creates a ContextParams from a token array at the given index.
 * @param {import('../tokenizer.mjs').Token[]} tokens
 * @param {number} [index]
 * @returns {ContextParams}
 */
function getContextParams(tokens, index) {
    const context = tokens.map(t => t.activeState.value);
    return new ContextParams(context, index || 0);
}

export { getContextParams };
