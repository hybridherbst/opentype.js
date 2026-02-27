import { binarySearch, binarySearchIndex, binarySearchInsert } from './util.js';

/**
 * Multiply two 2x3 affine transform matrices: result = a × b
 * Each is { xx, yx, xy, yy, dx, dy }
 */
function multiplyTransforms(a, b) {
    return {
        xx: a.xx * b.xx + a.xy * b.yx,
        yx: a.yx * b.xx + a.yy * b.yx,
        xy: a.xx * b.xy + a.xy * b.yy,
        yy: a.yx * b.xy + a.yy * b.yy,
        dx: a.xx * b.dx + a.xy * b.dy + a.dx,
        dy: a.yx * b.dx + a.yy * b.dy + a.dy,
    };
}

/**
 * Compose a transform applied around a center point:
 * translate(cx, cy) × transform × translate(-cx, -cy)
 */
function composeTransformAroundCenter(m, cx, cy) {
    return multiplyTransforms(
        multiplyTransforms(
            { xx: 1, yx: 0, xy: 0, yy: 1, dx: cx, dy: cy },
            m
        ),
        { xx: 1, yx: 0, xy: 0, yy: 1, dx: -cx, dy: -cy }
    );
}

/**
 * COLRv1 Angle values are encoded as F2Dot14 where 1.0 = 180 degrees.
 * Convert to radians for JS Math trig functions.
 */
function colrAngleToRadians(angle) {
    return (angle || 0) * Math.PI;
}

export class LayerManager {
    // private properties don't work with reify
    // @TODO: refactor once we migrated to ES6 modules, see https://github.com/opentypejs/opentype.js/pull/579
    // #font = null;

    constructor(font) {
        this.font = font;
    }

    /**
     * Mainly used internally. Ensures that the COLR table exists and is populated with default values
     * @returns the LayerManager's font instance for chaining
     */
    ensureCOLR() {
        if (!this.font.tables.colr) {
            this.font.tables.colr = {
                version: 0,
                baseGlyphRecords: [],
                layerRecords: [],
            };
        }

        return this.font;
    }

    /**
     * Gets the layers for a specific glyph
     * @param {integer} glyphIndex
     * @returns {Array<Object>} array of layer objects {glyph, paletteIndex}
     */
    get(glyphIndex) {
        const font = this.font;
        const layers = [];
        const colr = font.tables.colr;
        const cpal = font.tables.cpal;
        /** ignore colr table if no cpal table is present
         * @see https://learn.microsoft.com/en-us/typography/opentype/spec/colr#:~:text=If%20the%20COLR%20table%20is%20present%20in%20a%20font%20but%20no%20CPAL%20table%20exists,%20then%20the%20COLR%20table%20is%20ignored.
         */
        if ( ! colr || ! cpal ) {
            return layers;
        }

        // ── Try v0 first ──
        const baseGlyph = binarySearch(colr.baseGlyphRecords, 'glyphID', glyphIndex);
        
        if ( baseGlyph ) {
            const firstIndex = baseGlyph.firstLayerIndex;
            const numLayers = baseGlyph.numLayers;
        
            for( let l = 0; l < numLayers; l++ ) {
                const layer = colr.layerRecords[firstIndex + l];
                layers.push({
                    glyph: font.glyphs.get(layer.glyphID),
                    paletteIndex: layer.paletteIndex,
                });
            }
        
            return layers;
        }

        // ── Try v1 baseGlyphPaintRecords ──
        if (colr.baseGlyphPaintRecords) {
            const v1Layers = this._getV1Layers(glyphIndex);
            if (v1Layers.length > 0) return v1Layers;
        }

        return layers;
    }

    /**
     * Gets the COLRv1 paint tree for a specific glyph.
     * Returns the raw paint DAG or null if not found.
     * @param {integer} glyphIndex
     * @returns {Object|null} paint tree node
     */
    getPaintTree(glyphIndex) {
        const colr = this.font.tables.colr;
        if (!colr || !colr.baseGlyphPaintRecords) return null;

        const record = binarySearch(colr.baseGlyphPaintRecords, 'glyphID', glyphIndex);
        return record ? record.paint : null;
    }

    /**
     * Flatten COLRv1 paint graph into v0-compatible layers for rendering.
     * This recursively walks the paint tree and extracts PaintGlyph+PaintSolid
     * combinations as simple { glyph, paletteIndex } layers.
     * For gradient fills, it creates a layer with a paint subtree.
     * @param {integer} glyphIndex
     * @returns {Array} array of layer objects
     * @private
     */
    _getV1Layers(glyphIndex) {
        const font = this.font;
        const colr = font.tables.colr;
        if (!colr.baseGlyphPaintRecords) return [];

        const record = binarySearch(colr.baseGlyphPaintRecords, 'glyphID', glyphIndex);
        if (!record) return [];

        const layers = [];
        this._flattenPaint(record.paint, layers, null);
        return layers;
    }

    /**
     * Recursively flatten a paint node into layers.
     * @param {Object} paint - paint node
     * @param {Array} layers - output array
     * @param {Object|null} transform - accumulated transform matrix
     * @private
     */
    _flattenPaint(paint, layers, transform) {
        const font = this.font;
        if (!paint) return;

        switch (paint.format) {
            case 1: { // PaintColrLayers
                for (const child of paint.layers) {
                    this._flattenPaint(child, layers, transform);
                }
                break;
            }

            case 10: { // PaintGlyph - clips to glyph outline, fills with inner paint
                const glyph = font.glyphs.get(paint.glyphID);
                if (!glyph) break;
                
                const innerPaint = paint.paint;
                if (innerPaint.format === 2 || innerPaint.format === 3) {
                    // PaintSolid / PaintVarSolid → simple v0-compatible layer
                    layers.push({
                        glyph,
                        paletteIndex: innerPaint.paletteIndex,
                        alpha: innerPaint.alpha,
                        transform,
                    });
                } else {
                    // Gradient or other complex fill
                    layers.push({
                        glyph,
                        paint: innerPaint,
                        transform,
                    });
                }
                break;
            }

            case 11: { // PaintColrGlyph - reference another color glyph's paint
                const colr = font.tables.colr;
                if (colr.baseGlyphPaintRecords) {
                    const refRecord = binarySearch(colr.baseGlyphPaintRecords, 'glyphID', paint.glyphID);
                    if (refRecord) {
                        this._flattenPaint(refRecord.paint, layers, transform);
                    }
                }
                break;
            }

            case 12: case 13: { // PaintTransform / PaintVarTransform
                const m = paint.transform;
                const newTransform = transform ? multiplyTransforms(transform, m) : m;
                this._flattenPaint(paint.paint, layers, newTransform);
                break;
            }

            case 14: case 15: { // PaintTranslate / PaintVarTranslate
                const m = { xx: 1, yx: 0, xy: 0, yy: 1, dx: paint.dx, dy: paint.dy };
                const newTransform = transform ? multiplyTransforms(transform, m) : m;
                this._flattenPaint(paint.paint, layers, newTransform);
                break;
            }

            case 16: case 17: { // PaintScale / PaintVarScale
                const m = { xx: paint.scaleX, yx: 0, xy: 0, yy: paint.scaleY, dx: 0, dy: 0 };
                const newTransform = transform ? multiplyTransforms(transform, m) : m;
                this._flattenPaint(paint.paint, layers, newTransform);
                break;
            }

            case 18: case 19: { // PaintScaleAroundCenter
                const { scaleX, scaleY, centerX, centerY } = paint;
                const m = composeTransformAroundCenter(
                    { xx: scaleX, yx: 0, xy: 0, yy: scaleY, dx: 0, dy: 0 },
                    centerX, centerY
                );
                const newTransform = transform ? multiplyTransforms(transform, m) : m;
                this._flattenPaint(paint.paint, layers, newTransform);
                break;
            }

            case 20: case 21: { // PaintScaleUniform
                const s = paint.scale;
                const m = { xx: s, yx: 0, xy: 0, yy: s, dx: 0, dy: 0 };
                const newTransform = transform ? multiplyTransforms(transform, m) : m;
                this._flattenPaint(paint.paint, layers, newTransform);
                break;
            }

            case 22: case 23: { // PaintScaleUniformAroundCenter
                const s = paint.scale;
                const m = composeTransformAroundCenter(
                    { xx: s, yx: 0, xy: 0, yy: s, dx: 0, dy: 0 },
                    paint.centerX, paint.centerY
                );
                const newTransform = transform ? multiplyTransforms(transform, m) : m;
                this._flattenPaint(paint.paint, layers, newTransform);
                break;
            }

            case 24: case 25: { // PaintRotate
                const radians = colrAngleToRadians(paint.angle);
                const cos = Math.cos(radians);
                const sin = Math.sin(radians);
                const m = { xx: cos, yx: sin, xy: -sin, yy: cos, dx: 0, dy: 0 };
                const newTransform = transform ? multiplyTransforms(transform, m) : m;
                this._flattenPaint(paint.paint, layers, newTransform);
                break;
            }

            case 26: case 27: { // PaintRotateAroundCenter
                const radians = colrAngleToRadians(paint.angle);
                const cos = Math.cos(radians);
                const sin = Math.sin(radians);
                const m = composeTransformAroundCenter(
                    { xx: cos, yx: sin, xy: -sin, yy: cos, dx: 0, dy: 0 },
                    paint.centerX, paint.centerY
                );
                const newTransform = transform ? multiplyTransforms(transform, m) : m;
                this._flattenPaint(paint.paint, layers, newTransform);
                break;
            }

            case 28: case 29: { // PaintSkew
                const tanX = Math.tan(colrAngleToRadians(paint.xSkewAngle));
                const tanY = Math.tan(colrAngleToRadians(paint.ySkewAngle));
                const m = { xx: 1, yx: tanY, xy: tanX, yy: 1, dx: 0, dy: 0 };
                const newTransform = transform ? multiplyTransforms(transform, m) : m;
                this._flattenPaint(paint.paint, layers, newTransform);
                break;
            }

            case 30: case 31: { // PaintSkewAroundCenter
                const tanX = Math.tan(colrAngleToRadians(paint.xSkewAngle));
                const tanY = Math.tan(colrAngleToRadians(paint.ySkewAngle));
                const m = composeTransformAroundCenter(
                    { xx: 1, yx: tanY, xy: tanX, yy: 1, dx: 0, dy: 0 },
                    paint.centerX, paint.centerY
                );
                const newTransform = transform ? multiplyTransforms(transform, m) : m;
                this._flattenPaint(paint.paint, layers, newTransform);
                break;
            }

            case 32: { // PaintComposite
                // Flatten backdrop first, then source. Tag each source layer
                // with the composite mode so the renderer can apply blending.
                this._flattenPaint(paint.backdrop, layers, transform);
                const sourceStart = layers.length;
                this._flattenPaint(paint.source, layers, transform);
                // Apply composite mode to every source layer
                for (let i = sourceStart; i < layers.length; i++) {
                    layers[i].compositeMode = paint.compositeMode;
                }
                break;
            }

            case 2: case 3: // PaintSolid - standalone (unusual)
            case 4: case 5: case 6: case 7: case 8: case 9: // Gradients standalone
                // These shouldn't appear without a PaintGlyph parent
                // but include them for robustness
                layers.push({ paint, transform });
                break;
        }
    }

    /**
     * Adds one or more layers to a glyph, at the end or at a specific position.
     * @param {integer} glyphIndex glyph index to add the layer(s) to.
     * @param {Array|Object} layers layer object {glyph, paletteIndex}/{glyphID, paletteIndex} or array of layer objects.
     * @param {integer?} position position to insert the layers at (will default to adding at the end).
     */
    add(glyphIndex, layers, position) {
        // Get the current layers for the glyph.
        const currentLayers = this.get(glyphIndex);

        // Normalize layers to an array.
        layers = Array.isArray(layers) ? layers : [layers];

        // Determine the insertion position. If not specified, append to the end.
        if (position === undefined || position === Infinity || position > currentLayers.length) {
            position = currentLayers.length;
        } else if (position < 0) {
            position = (currentLayers.length + 1) + (position % (currentLayers.length + 1));
            if (position >= currentLayers.length + 1) {
                position -= (currentLayers.length + 1);
            }
        }

        // Build a new layers array with the additional layer(s) inserted.
        const newLayers = [];
        for (let i = 0; i < position; i++) {
            const glyphID = Number.isInteger(currentLayers[i].glyph) ? currentLayers[i].glyph : currentLayers[i].glyph.index;
            newLayers.push({
                glyphID,
                paletteIndex: currentLayers[i].paletteIndex,
            });
        }
        for (const layer of layers) {
            const glyphID = Number.isInteger(layer.glyph) ? layer.glyph : layer.glyph.index;
            newLayers.push({
                glyphID,
                paletteIndex: layer.paletteIndex,
            });
        }
        for (let i = position; i < currentLayers.length; i++) {
            const glyphID = Number.isInteger(currentLayers[i].glyph) ? currentLayers[i].glyph : currentLayers[i].glyph.index;
            newLayers.push({
                glyphID,
                paletteIndex: currentLayers[i].paletteIndex,
            });
        }
        
        // Update the COLR table with the new layers array.
        this.updateColrTable(glyphIndex, newLayers);
    }

    /**
     * Sets a color glyph layer's paletteIndex property to a new index
     * @param {integer} glyphIndex glyph in the font by zero-based glyph index
     * @param {integer} layerIndex layer in the glyph by zero-based layer index
     * @param {integer} paletteIndex new color to set for the layer by zero-based index in any palette
     */
    setPaletteIndex(glyphIndex, layerIndex, paletteIndex) {
        let layers = this.get(glyphIndex);
        if (layers[layerIndex]) {
            layers = layers.map((layer, index) => ({
                glyphID: layer.glyph.index,
                paletteIndex: index === layerIndex ? paletteIndex : layer.paletteIndex,
            }));

            this.updateColrTable(glyphIndex, layers);
        } else {
            console.error('Invalid layer index');
        }
    }

    /**
     * Removes one or more layers from a glyph.
     * @param {integer} glyphIndex glyph index to remove the layer(s) from
     * @param {integer} start index to remove the layer at
     * @param {integer?} end (optional) if provided, removes all layers from start index to (and including) end index
     */
    remove(glyphIndex, start, end = start) {
        // Get the current layers for the glyph.
        let currentLayers = this.get(glyphIndex);
    
        // Convert to the expected format for updateColrTable if necessary.
        currentLayers = currentLayers.map(layer => ({
            glyphID: layer.glyph.index,
            paletteIndex: layer.paletteIndex,
        }));
    
        // Directly remove the specified range from the currentLayers array.
        // Splice modifies the array in place and removes elements between start and end indices.
        currentLayers.splice(start, end - start + 1);
    
        // Update the COLR table with the modified layers array.
        this.updateColrTable(glyphIndex, currentLayers);
    }

    /**
     * Mainly used internally. Mainly used internally. Updates the colr table, adding a baseGlyphRecord if needed,
     * ensuring that it's inserted at the correct position, updating numLayers, and adjusting firstLayerIndex values
     * for all baseGlyphRecords according to any deletions or insertions.
     * @param {integer} glyphIndex 
     * @param {Array<Object>} layers array of layer objects {glyphID, paletteIndex}
     */
    updateColrTable(glyphIndex, layers) {
        // Ensure the COLR table exists with the correct structure
        this.ensureCOLR();

        const font = this.font;
        const colr = font.tables.colr;
    
        // Use binarySearchIndex to find the index of the baseGlyphRecord
        let index = binarySearchIndex(colr.baseGlyphRecords, 'glyphID', glyphIndex);
        const addBaseGlyph = index === -1;
    
        // If baseGlyphRecord doesn't exist, create and insert one at the correct position
        if (addBaseGlyph) {
            const newBaseGlyphRecord = { glyphID: glyphIndex, firstLayerIndex: colr.layerRecords.length, numLayers: 0 };
            index = binarySearchInsert(colr.baseGlyphRecords, 'glyphID', newBaseGlyphRecord);
        }

        const baseGlyphRecord = colr.baseGlyphRecords[index];
    
        const originalNumLayers = baseGlyphRecord.numLayers;
        const newNumLayers = layers.length;
        const layerDiff = newNumLayers - originalNumLayers;
    
        // Adjust the layer records accordingly
        if (layerDiff > 0) {
            // Add new layers
            const newLayers = layers.slice(originalNumLayers).map(layer => ({
                glyphID: layer.glyphID,
                paletteIndex: layer.paletteIndex,
            }));
            colr.layerRecords.splice(baseGlyphRecord.firstLayerIndex + originalNumLayers, 0, ...newLayers);
        } else if (layerDiff < 0) {
            // Remove excess layers
            colr.layerRecords.splice(baseGlyphRecord.firstLayerIndex + newNumLayers, -layerDiff);
        }
    
        // Update existing layers
        for (let i = 0; i < Math.min(originalNumLayers, newNumLayers); i++) {
            colr.layerRecords[baseGlyphRecord.firstLayerIndex + i] = {
                glyphID: layers[i].glyphID,
                paletteIndex: layers[i].paletteIndex,
            };
        }
    
        // Update the numLayers for the baseGlyphRecord
        baseGlyphRecord.numLayers = newNumLayers;

        // Adjust firstLayerIndex for baseGlyphRecords
        if (layerDiff !== 0) {
            for (let i = 0; i < colr.baseGlyphRecords.length; i++) {
                const sibling = colr.baseGlyphRecords[i];
                if (i === index || sibling.firstLayerIndex < baseGlyphRecord.firstLayerIndex) continue;
                colr.baseGlyphRecords[i].firstLayerIndex += layerDiff;
            }
        }
    }
}
