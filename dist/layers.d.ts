export class LayerManager {
    constructor(font: any);
    font: any;
    /**
     * Mainly used internally. Ensures that the COLR table exists and is populated with default values
     * @returns the LayerManager's font instance for chaining
     */
    ensureCOLR(): any;
    /**
     * Gets the layers for a specific glyph
     * @param {number} glyphIndex
     * @returns {Array<{glyph: import('./glyph.js').default, paletteIndex: number}>} array of layer objects {glyph, paletteIndex}
     */
    get(glyphIndex: number): Array<{
        glyph: import("./glyph.js").default;
        paletteIndex: number;
    }>;
    /**
     * Gets the COLRv1 paint tree for a specific glyph.
     * Returns the raw paint DAG or null if not found.
     * @param {number} glyphIndex
     * @returns {Record<string, unknown>|null} paint tree node
     */
    getPaintTree(glyphIndex: number): Record<string, unknown> | null;
    /**
     * Flatten COLRv1 paint graph into v0-compatible layers for rendering.
     * This recursively walks the paint tree and extracts PaintGlyph+PaintSolid
     * combinations as simple { glyph, paletteIndex } layers.
     * For gradient fills, it creates a layer with a paint subtree.
     * @param {number} glyphIndex
     * @returns {Array} array of layer objects
     * @private
     */
    private _getV1Layers;
    /**
     * Recursively flatten a paint node into layers.
     * @param {Record<string, unknown>} paint - paint node
     * @param {Array} layers - output array
     * @param {Record<string, unknown>|null} transform - accumulated transform matrix
     * @private
     */
    private _flattenPaint;
    /**
     * Adds one or more layers to a glyph, at the end or at a specific position.
     * @param {number} glyphIndex glyph index to add the layer(s) to.
     * @param {Array|{glyph: import('./glyph.js').default|number, paletteIndex: number}} layers layer object {glyph, paletteIndex}/{glyphID, paletteIndex} or array of layer objects.
     * @param {number=} position position to insert the layers at (will default to adding at the end).
     */
    add(glyphIndex: number, layers: any[] | {
        glyph: import("./glyph.js").default | number;
        paletteIndex: number;
    }, position?: number | undefined): void;
    /**
     * Sets a color glyph layer's paletteIndex property to a new index
     * @param {number} glyphIndex glyph in the font by zero-based glyph index
     * @param {number} layerIndex layer in the glyph by zero-based layer index
     * @param {number} paletteIndex new color to set for the layer by zero-based index in any palette
     */
    setPaletteIndex(glyphIndex: number, layerIndex: number, paletteIndex: number): void;
    /**
     * Removes one or more layers from a glyph.
     * @param {number} glyphIndex glyph index to remove the layer(s) from
     * @param {number} start index to remove the layer at
     * @param {number=} end (optional) if provided, removes all layers from start index to (and including) end index
     */
    remove(glyphIndex: number, start: number, end?: number | undefined): void;
    /**
     * Mainly used internally. Mainly used internally. Updates the colr table, adding a baseGlyphRecord if needed,
     * ensuring that it's inserted at the correct position, updating numLayers, and adjusting firstLayerIndex values
     * for all baseGlyphRecords according to any deletions or insertions.
     * @param {number} glyphIndex
     * @param {Array<{glyphID: number, paletteIndex: number}>} layers array of layer objects {glyphID, paletteIndex}
     */
    updateColrTable(glyphIndex: number, layers: Array<{
        glyphID: number;
        paletteIndex: number;
    }>): void;
}
//# sourceMappingURL=layers.d.ts.map