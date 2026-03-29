export default applySubstitution;
/**
 * Apply substitutions to a list of tokens
 * @param {InstanceType<typeof SubstitutionAction>} action substitution action
 * @param {Array<{setState: Function}>} tokens a list of tokens
 * @param {number} index token index
 */
declare function applySubstitution(action: InstanceType<typeof SubstitutionAction>, tokens: Array<{
    setState: Function;
}>, index: number): void;
import { SubstitutionAction } from './featureQuery.js';
//# sourceMappingURL=applySubstitution.d.ts.map