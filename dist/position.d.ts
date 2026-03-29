export default Position;
/**
 * @exports opentype.Position
 * @class
 * @param {Record<string, unknown>} font
 * @constructor
 */
declare function Position(font: Record<string, unknown>): void;
declare class Position {
    /**
     * @exports opentype.Position
     * @class
     * @param {Record<string, unknown>} font
     * @constructor
     */
    constructor(font: Record<string, unknown>);
    /**
     * Init some data for faster and easier access later.
     * @this {object}
     */
    init(this: any): void;
    defaultKerningTables: any;
    /**
     * Apply variation deltas to a value record property.
     * @this {object}
     * @param {Record<string, unknown>} deviceOrVariationIndex - Device or VariationIndex table data
     * @param {Record<string, unknown>} [coords] - Variation coordinates (optional, uses current variation if not provided)
     * @returns {number} - The delta value to add
     */
    getVariationDelta(this: any, deviceOrVariationIndex: Record<string, unknown>, coords?: Record<string, unknown>): number;
    /**
     * Apply variation deltas to a value record.
     * @this {object}
     * @param {Record<string, unknown>} valueRecord - The value record to adjust
     * @param {Record<string, unknown>} [coords] - Variation coordinates (optional)
     * @returns {Record<string, unknown>} - The adjusted value record
     */
    applyVariationDeltas(this: any, valueRecord: Record<string, unknown>, coords?: Record<string, unknown>): Record<string, unknown>;
    /**
     * Find a glyph pair in a list of lookup tables of type 2 and retrieve the xAdvance kerning value.
     *
     * @this {object}
     * @param {Array} kerningLookups
     * @param {number} leftIndex - left glyph index
     * @param {number} rightIndex - right glyph index
     * @param {Record<string, unknown>} [coords] - Variation coordinates (optional, for variable fonts)
     * @returns {number}
     */
    getKerningValue(this: any, kerningLookups: any[], leftIndex: number, rightIndex: number, coords?: Record<string, unknown>): number;
    /**
     * List all kerning lookup tables.
     *
     * @this {object}
     * @param {string} [script='DFLT'] - use font.position.getDefaultScriptName() for a better default value
     * @param {string} [language='dflt']
     * @return {object[] | undefined} The list of kerning lookup tables (may be empty), or undefined if there is no GPOS table (and we should use the kern table)
     */
    getKerningTables(this: any, script?: string, language?: string): object[] | undefined;
}
//# sourceMappingURL=position.d.ts.map