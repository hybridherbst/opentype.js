/**
 * Part of the code of this class was based on
 * https://github.com/foliojs/fontkit/blob/a5fe0a1834241dbc6eb02beea3b7414c118c5ac9/src/glyph/GlyphVariationProcessor.js
 * Copyright (c) 2014 Devon Govett
 * MIT License
 */
export class VariationProcessor {
    constructor(font: any);
    font: any;
    /**
     * Modifies a coords object to make sure that tags have a length of 4
     * @param {Record<string, number>} coords - variation coordinates
     */
    normalizeCoordTags(coords: Record<string, number>): void;
    /**
     * Normalizes the coordinates from the axis ranges to a range of -1 to 1.
     * @param {Record<string, number>} coords - The coordinates object to normalize.
     * @returns {Array<number>} The normalized coordinates as an array
     */
    getNormalizedCoords(coords: Record<string, number>): Array<number>;
    _normCacheCoords: any;
    _normCacheResult: any[];
    /**
     * Interpolates points within a glyph if deltas are not provided for all points.
     * @param {Array<{x: number, y: number, onCurve?: boolean, lastPointOfContour?: boolean}>} points - The points to be interpolated.
     * @param {Array<{x: number, y: number, onCurve?: boolean, lastPointOfContour?: boolean}>} glyphPoints - Reference points from the glyph.
     * @param {Array<boolean>} deltaMap - A map indicating which points have deltas.
     */
    interpolatePoints(points: Array<{
        x: number;
        y: number;
        onCurve?: boolean;
        lastPointOfContour?: boolean;
    }>, glyphPoints: Array<{
        x: number;
        y: number;
        onCurve?: boolean;
        lastPointOfContour?: boolean;
    }>, deltaMap: Array<boolean>): void;
    /**
     * Interpolates delta values between two points.
     * @param {number} p1 - Start point index for interpolation.
     * @param {number} p2 - End point index for interpolation.
     * @param {number} ref1 - Reference point index for the start delta.
     * @param {number} ref2 - Reference point index for the end delta.
     * @param {Array<{x: number, y: number, onCurve?: boolean, lastPointOfContour?: boolean}>} glyphPoints - Reference points from the glyph.
     * @param {Array<{x: number, y: number, onCurve?: boolean, lastPointOfContour?: boolean}>} points - The points to be adjusted.
     */
    deltaInterpolate(p1: number, p2: number, ref1: number, ref2: number, glyphPoints: Array<{
        x: number;
        y: number;
        onCurve?: boolean;
        lastPointOfContour?: boolean;
    }>, points: Array<{
        x: number;
        y: number;
        onCurve?: boolean;
        lastPointOfContour?: boolean;
    }>): void;
    /**
     * Applies a delta shift to a range of points based on a reference point.
     * @param {number} p1 - Start point index for shifting.
     * @param {number} p2 - End point index for shifting.
     * @param {number} ref - Reference point index.
     * @param {Array<{x: number, y: number, onCurve?: boolean, lastPointOfContour?: boolean}>} glyphPoints - Reference points from the glyph.
     * @param {Array<{x: number, y: number, onCurve?: boolean, lastPointOfContour?: boolean}>} points - The points to be shifted.
     */
    deltaShift(p1: number, p2: number, ref: number, glyphPoints: Array<{
        x: number;
        y: number;
        onCurve?: boolean;
        lastPointOfContour?: boolean;
    }>, points: Array<{
        x: number;
        y: number;
        onCurve?: boolean;
        lastPointOfContour?: boolean;
    }>): void;
    /**
     * Transforms glyph components based on variation data.
     * @param {Glyph} glyph - The composite glyph to transform.
     * @param {Array<{x: number, y: number, onCurve?: boolean, lastPointOfContour?: boolean}>} transformedPoints - Points that are already transformed.
     * @param {Record<string, number>} coords - Variation coordinates.
     * @param {Array<number>} tuplePoints - Points that are part of the tuple.
     * @param {{deltas: number[], deltasY: number[], peakTuple?: number[], privatePoints: number[], sharedTupleRecordsIndex?: number, intermediateStartTuple?: number[], intermediateEndTuple?: number[]}} header - Header information from the variation data.
     * @param {number} factor - The scaling factor for the transformation.
     */
    transformComponents(glyph: Glyph, transformedPoints: Array<{
        x: number;
        y: number;
        onCurve?: boolean;
        lastPointOfContour?: boolean;
    }>, coords: Record<string, number>, tuplePoints: Array<number>, header: {
        deltas: number[];
        deltasY: number[];
        peakTuple?: number[];
        privatePoints: number[];
        sharedTupleRecordsIndex?: number;
        intermediateStartTuple?: number[];
        intermediateEndTuple?: number[];
    }, factor: number): void;
    /**
     * Accumulate composite-component deltas across all active tuples.
     * @param {Array<{glyphIndex: number, dx: number, dy: number, xScale?: number, yScale?: number, scale01?: number, scale10?: number}>} componentTransforms
     * @param {Array<number>} tuplePoints
     * @param {{deltas: number[], deltasY: number[]}} header
     * @param {number} factor
     */
    accumulateComponentDeltas(componentTransforms: Array<{
        glyphIndex: number;
        dx: number;
        dy: number;
        xScale?: number;
        yScale?: number;
        scale01?: number;
        scale10?: number;
    }>, tuplePoints: Array<number>, header: {
        deltas: number[];
        deltasY: number[];
    }, factor: number): void;
    /**
     * Render a composite glyph from already-accumulated component transforms.
     * @param {Glyph} glyph
     * @param {Array<{x: number, y: number, onCurve?: boolean, lastPointOfContour?: boolean}>} transformedPoints
     * @param {Record<string, number>} coords
     * @param {Array<{glyphIndex: number, dx: number, dy: number, xScale?: number, yScale?: number, scale01?: number, scale10?: number}>} componentTransforms
     */
    renderCompositeComponents(glyph: Glyph, transformedPoints: Array<{
        x: number;
        y: number;
        onCurve?: boolean;
        lastPointOfContour?: boolean;
    }>, coords: Record<string, number>, componentTransforms: Array<{
        glyphIndex: number;
        dx: number;
        dy: number;
        xScale?: number;
        yScale?: number;
        scale01?: number;
        scale10?: number;
    }>): void;
    /**
     * Transforms composite glyph components without gvar deltas.
     * Used for composite glyphs that are not explicitly targeted in gvar
     * but still need their components to get variation applied.
     * @param {Glyph} glyph - The composite glyph to transform.
     * @param {Array<{x: number, y: number, onCurve?: boolean, lastPointOfContour?: boolean}>} transformedPoints - Points to be transformed in place.
     * @param {Record<string, number>} coords - Variation coordinates.
     */
    transformComponentsSimple(glyph: Glyph, transformedPoints: Array<{
        x: number;
        y: number;
        onCurve?: boolean;
        lastPointOfContour?: boolean;
    }>, coords: Record<string, number>): void;
    applyTupleVariationStore(variationData: any, points: any, coords: any, flavor?: string, args?: {}): any;
    /**
     * Retrieves a transformed copy of a glyph based on the provided variation coordinates, or the glyph itself if no variation was applied
     * @param {Glyph} glyph - Glyph or index of glyph to transform.
     * @param {Record<string, number>} [coords] - Variation coords object (will fall back to variation coords in the defaultRenderOptions)
     * @returns {Glyph} - The transformed glyph.
     */
    getTransform(glyph: Glyph, coords?: Record<string, number>): Glyph;
    getCvarTransform(coords: any): any;
    /**
     * Calculates the variable adjustment for a glyph property from variation data.
     * @param {number} gid - Glyph ID.
     * @param {string} tableName - The name of the variation data table.
     * @param {string} parameter - The property to adjust.
     * @param {Record<string, number>} coords - Variation coordinates.
     * @returns {number} - The calculated adjustment.
     */
    getVariableAdjustment(gid: number, tableName: string, parameter: string, coords: Record<string, number>): number;
    /**
     * Retrieves the delta value from a variation store.
     * @param {{itemVariationSubtables: Array<{deltaSets: Array<number[]>, regionIndexes: number[]}>, variationRegions: Array<{regionAxes: Array<{startCoord: number, peakCoord: number, endCoord: number}>}>}} itemStore - The item variation store.
     * @param {number} outerIndex - The outer index in the variation subtables.
     * @param {number} innerIndex - The inner index in the delta sets.
     * @param {Record<string, number>} coords - Variation coordinates.
     * @returns {number} - The delta value.
     */
    getDelta(itemStore: {
        itemVariationSubtables: Array<{
            deltaSets: Array<number[]>;
            regionIndexes: number[];
        }>;
        variationRegions: Array<{
            regionAxes: Array<{
                startCoord: number;
                peakCoord: number;
                endCoord: number;
            }>;
        }>;
    }, outerIndex: number, innerIndex: number, coords: Record<string, number>): number;
    /**
     * Calculates the blend vector for a set of variation coordinates.
     * @param {{itemVariationSubtables: Array<{regionIndexes: number[]}>, variationRegions: Array<{regionAxes: Array<{startCoord: number, peakCoord: number, endCoord: number}>}>}} itemStore - The item variation store.
     * @param {number} itemIndex - Index of the current item in the variation subtables.
     * @param {Record<string, number>} coords - Variation coordinates.
     * @returns {Array<number>} - The blend vector for the given coordinates.
     */
    getBlendVector(itemStore: {
        itemVariationSubtables: Array<{
            regionIndexes: number[];
        }>;
        variationRegions: Array<{
            regionAxes: Array<{
                startCoord: number;
                peakCoord: number;
                endCoord: number;
            }>;
        }>;
    }, itemIndex: number, coords: Record<string, number>): Array<number>;
    /** Helper method that returns the font's avar table if present */
    avar(): any;
    /** Helper method that returns the font's cvar table if present */
    cvar(): any;
    /** Helper method that returns the font's fvar table if present */
    fvar(): any;
    /** Helper method that returns the font's gvar table if present */
    gvar(): any;
    /** Helper method that returns the font's hvar table if present */
    hvar(): any;
}
import Glyph from './glyph.js';
//# sourceMappingURL=variationprocessor.d.ts.map