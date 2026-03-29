export default unicodeVariationSequence;
/**
 * Apply unicode variation sequences to a range of tokens
 */
/**
 * Apply unicode variation squences to a context range
 * @param {unknown} range a range of tokens
 *
 * @TODO: We could incorporate the data from
 * https://www.unicode.org/Public/UCD/latest/ucd/StandardizedVariants.txt
 * https://www.unicode.org/Public/UCD/latest/ucd/emoji/emoji-variation-sequences.txt
 * https://www.unicode.org/ivd/data/2022-09-13/IVD_Sequences.txt
 * and ignore any sequences that are not standardized, but that would have to be
 * kept up-do-date and result in huge data overhead
 */
declare function unicodeVariationSequence(range: unknown): void;
//# sourceMappingURL=variationSequences.d.ts.map