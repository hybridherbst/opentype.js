export default Bidi;
/**
 * Create Bidi. features
 * @param {string} [baseDir] text base direction. value either 'ltr' or 'rtl'
 */
declare function Bidi(baseDir?: string): void;
declare class Bidi {
    /**
     * Create Bidi. features
     * @param {string} [baseDir] text base direction. value either 'ltr' or 'rtl'
     */
    constructor(baseDir?: string);
    baseDir: string;
    tokenizer: Tokenizer;
    featuresTags: {};
    /**
     * Sets Bidi text
     * @param {string} text a text input
     */
    setText(text: string): void;
    text: string;
    /**
     * Store essential context checks:
     * arabic word check for applying gsub features
     * arabic sentence check for adjusting arabic layout
     */
    contextChecks: {
        ccmpReplacementCheck: {
            startCheck: (contextParams: any) => boolean;
            endCheck: (contextParams: any) => boolean;
        };
        latinWordCheck: {
            startCheck: (contextParams: any) => boolean;
            endCheck: (contextParams: any) => boolean;
        };
        arabicWordCheck: {
            startCheck: (contextParams: any) => boolean;
            endCheck: (contextParams: any) => boolean;
        };
        arabicSentenceCheck: {
            startCheck: (contextParams: any) => boolean;
            endCheck: (contextParams: any) => boolean;
        };
        thaiWordCheck: {
            startCheck: (contextParams: any) => boolean;
            endCheck: (contextParams: any) => boolean;
        };
        unicodeVariationSequenceCheck: {
            startCheck: (contextParams: any) => boolean;
            endCheck: (contextParams: any) => boolean;
        };
    };
    /**
     * Register supported features tags
     * @param {string} script script tag
     * @param {Array} tags features tags list
     */
    registerFeatures(script: string, tags: any[]): void;
    /**
     * Apply GSUB features
     * @param {unknown} font opentype font instance
     * @param {Array} features a list of features
     */
    applyFeatures(font: unknown, features: any[]): void;
    query: FeatureQuery;
    /**
     * Register a state modifier
     * @param {string} modifierId state modifier id
     * @param {function} condition a predicate function that returns true or false
     * @param {function} modifier a modifier function to set token state
     */
    registerModifier(modifierId: string, condition: Function, modifier: Function): void;
    /**
     * Check if a context is registered
     * @param {string} contextId context id
     */
    checkContextReady(contextId: string): boolean;
    /**
     * Apply features to registered contexts
     *
     * - A Glyph Composition (ccmp) feature should be always applied
     * https://learn.microsoft.com/en-us/typography/opentype/spec/features_ae#tag-ccmp
     */
    applyFeaturesToContexts(): void;
    /**
     * Check whatever feature is successfully enabled for a script
     * @param {string} script
     * @param {string} tag feature name
     * @returns {boolean}
     */
    hasFeatureEnabled(script: string, tag: string): boolean;
    /**
     * process text input
     * @param {string} text an input text
     */
    processText(text: string): void;
    /**
     * Process a string of text to identify and adjust
     * bidirectional text entities.
     * @param {string} text input text
     */
    getBidiText(text: string): string;
    /**
     * Get the current state index of each token
     * @param {string} text an input text
     */
    getTextGlyphs(text: string): any[];
}
import Tokenizer from './tokenizer.js';
import FeatureQuery from './features/featureQuery.js';
//# sourceMappingURL=bidi.d.ts.map