import { getPath, transformPoints } from './tables/glyf.js';
import { copyPoint, copyComponent } from './util.js';
import Glyph from './glyph.js';

function otRound(value) {
    return Math.floor(value + 0.5);
}

/**
 * Part of the code of this class was based on
 * https://github.com/foliojs/fontkit/blob/a5fe0a1834241dbc6eb02beea3b7414c118c5ac9/src/glyph/GlyphVariationProcessor.js
 * Copyright (c) 2014 Devon Govett
 * MIT License
 */

export class VariationProcessor {
    constructor(font) {
        this.font = font;
    }

    /**
     * Modifies a coords object to make sure that tags have a length of 4
     * @param {Record<string, number>} coords - variation coordinates
     */
    normalizeCoordTags(coords) {
        for (const tag in coords) {
            if(tag.length < 4) {
                const padded = tag.padEnd(4, ' ');
                coords[padded] === undefined && (coords[padded] = coords[tag]);
                delete coords[tag];
            }
        }
    }

    /**
     * Normalizes the coordinates from the axis ranges to a range of -1 to 1.
     * @param {Record<string, number>} coords - The coordinates object to normalize.
     * @returns {Array<number>} The normalized coordinates as an array
     */
    getNormalizedCoords(coords) {
        if(!coords) {
            coords = this.font.variation.get();
        }
        // 1-entry cache keyed by coords reference.  Within a single import pass
        // every glyph of the same axis extreme shares the same coords object, so
        // this eliminates 2 of the 3 getNormalizedCoords calls that getTransform
        // triggers (applyTupleVariationStore + 2× getBlendVector for HVAR).
        if (this._normCacheCoords === coords) {
            return this._normCacheResult;
        }
        let normalized = [];
        this.normalizeCoordTags(coords);
        for (let i = 0; i < this.fvar().axes.length; i++) {
            const axis = this.fvar().axes[i];
            let tagValue = coords[axis.tag];
            if(tagValue === undefined) {
                tagValue = axis.defaultValue;
            }
            if (tagValue === axis.defaultValue) {
                normalized.push(0);
            } else if (tagValue < axis.defaultValue) {
                const denom = axis.defaultValue - axis.minValue;
                normalized.push(denom === 0 ? 0 : (tagValue - axis.defaultValue) / denom);
            } else {
                const denom = axis.maxValue - axis.defaultValue;
                normalized.push(denom === 0 ? 0 : (tagValue - axis.defaultValue) / denom);
            }
        }

        // if there is an avar table, the normalized value is calculated
        // by interpolating between the two nearest mapped values.
        if (this.avar()) {
            for (let i = 0; i < this.avar().axisSegmentMaps.length; i++) {
                let segment = this.avar().axisSegmentMaps[i];
                for (let j = 0; j < segment.axisValueMaps.length; j++) {
                    let pair = segment.axisValueMaps[j];
                    if (j >= 1 && normalized[i] < pair.fromCoordinate) {
                        let prev = segment.axisValueMaps[j - 1];
                        const denom = pair.fromCoordinate - prev.fromCoordinate;
                        normalized[i] = ((normalized[i] - prev.fromCoordinate) * (pair.toCoordinate - prev.toCoordinate)) /
                            (denom === 0 ? 1 : denom) +
                            prev.toCoordinate;
            
                        break;
                    }
                }
            }
        }

        this._normCacheCoords = coords;
        this._normCacheResult = normalized;
        return normalized;
    }

    /**
     * Interpolates points within a glyph if deltas are not provided for all points.
     * @param {Array<{x: number, y: number, onCurve?: boolean, lastPointOfContour?: boolean}>} points - The points to be interpolated.
     * @param {Array<{x: number, y: number, onCurve?: boolean, lastPointOfContour?: boolean}>} glyphPoints - Reference points from the glyph.
     * @param {Array<boolean>} deltaMap - A map indicating which points have deltas.
     */
    interpolatePoints(points, glyphPoints, deltaMap) {
        if (points.length === 0) {
            return;
        }
    
        let pointIndex = 0;
        while (pointIndex < points.length) {
            let firstPoint = pointIndex;
    
            // find the end point of the contour
            let endPoint = pointIndex;
            let point = points[endPoint];
            while (!point.lastPointOfContour) {
                point = points[++endPoint];
            }
    
            // find the first point that has a delta
            while (pointIndex <= endPoint && !deltaMap[pointIndex]) {
                pointIndex++;
            }
    
            if (pointIndex > endPoint) {
                continue;
            }
    
            let firstDelta = pointIndex;
            let curDelta = pointIndex;
            pointIndex++;
    
            while (pointIndex <= endPoint) {
                // find the next point with a delta, and interpolate intermediate points
                if (deltaMap[pointIndex]) {
                    this.deltaInterpolate(curDelta + 1, pointIndex - 1, curDelta, pointIndex, glyphPoints, points);
                    curDelta = pointIndex;
                }
        
                pointIndex++;
            }
    
            // shift contour if we only have a single delta
            if (curDelta === firstDelta) {
                this.deltaShift(firstPoint, endPoint, curDelta, glyphPoints, points);
            } else {
                // otherwise, handle the remaining points at the end and beginning of the contour
                this.deltaInterpolate(curDelta + 1, endPoint, curDelta, firstDelta, glyphPoints, points);
        
                if (firstDelta > 0) {
                    this.deltaInterpolate(firstPoint, firstDelta - 1, curDelta, firstDelta, glyphPoints, points);
                }
            }
    
            pointIndex = endPoint + 1;
        }
    }

    /**
     * Interpolates delta values between two points.
     * @param {number} p1 - Start point index for interpolation.
     * @param {number} p2 - End point index for interpolation.
     * @param {number} ref1 - Reference point index for the start delta.
     * @param {number} ref2 - Reference point index for the end delta.
     * @param {Array<{x: number, y: number, onCurve?: boolean, lastPointOfContour?: boolean}>} glyphPoints - Reference points from the glyph.
     * @param {Array<{x: number, y: number, onCurve?: boolean, lastPointOfContour?: boolean}>} points - The points to be adjusted.
     */
    deltaInterpolate(p1, p2, ref1, ref2, glyphPoints, points) {
        if (p1 > p2) {
            return;
        }

        let iterable = ['x', 'y'];
        for (let i = 0; i < iterable.length; i++) {
            let k = iterable[i];
            if (glyphPoints[ref1][k] > glyphPoints[ref2][k]) {
                var p = ref1;
                ref1 = ref2;
                ref2 = p;
            }

            let in1 = glyphPoints[ref1][k];
            let in2 = glyphPoints[ref2][k];
            let out1 = points[ref1][k];
            let out2 = points[ref2][k];

            // If the reference points have the same coordinate but different
            // delta, inferred delta is zero.  Otherwise interpolate.
            if (in1 !== in2 || out1 === out2) {
                let scale = in1 === in2 ? 0 : (out2 - out1) / (in2 - in1);

                for (let p = p1; p <= p2; p++) {
                    let out = glyphPoints[p][k];

                    if (out <= in1) {
                        out += out1 - in1;
                    } else if (out >= in2) {
                        out += out2 - in2;
                    } else {
                        out = out1 + (out - in1) * scale;
                    }

                    points[p][k] = out;
                }
            }
        }
    }

    /**
     * Applies a delta shift to a range of points based on a reference point.
     * @param {number} p1 - Start point index for shifting.
     * @param {number} p2 - End point index for shifting.
     * @param {number} ref - Reference point index.
     * @param {Array<{x: number, y: number, onCurve?: boolean, lastPointOfContour?: boolean}>} glyphPoints - Reference points from the glyph.
     * @param {Array<{x: number, y: number, onCurve?: boolean, lastPointOfContour?: boolean}>} points - The points to be shifted.
     */
    deltaShift(p1, p2, ref, glyphPoints, points) {
        let deltaX = points[ref].x - glyphPoints[ref].x;
        let deltaY = points[ref].y - glyphPoints[ref].y;

        if (deltaX === 0 && deltaY === 0) {
            return;
        }

        for (let p = p1; p <= p2; p++) {
            if (p !== ref) {
                points[p].x += deltaX;
                points[p].y += deltaY;
            }
        }
    }

    /**
     * Transforms glyph components based on variation data.
     * @param {Glyph} glyph - The composite glyph to transform.
     * @param {Array<{x: number, y: number, onCurve?: boolean, lastPointOfContour?: boolean}>} transformedPoints - Points that are already transformed.
     * @param {Record<string, number>} coords - Variation coordinates.
     * @param {Array<number>} tuplePoints - Points that are part of the tuple.
     * @param {{deltas: number[], deltasY: number[], peakTuple?: number[], privatePoints: number[], sharedTupleRecordsIndex?: number, intermediateStartTuple?: number[], intermediateEndTuple?: number[]}} header - Header information from the variation data.
     * @param {number} factor - The scaling factor for the transformation.
     */
    transformComponents(glyph, transformedPoints, coords, tuplePoints, header, factor) {
        let pointsIndex = 0;
        for(let c = 0; c < /** @type {{ components: Array<{glyphIndex: number, dx: number, dy: number}> }} */ (/** @type {unknown} */ (glyph)).components.length; c++) {
            const component = /** @type {{ components: Array<{glyphIndex: number, dx: number, dy: number}> }} */ (/** @type {unknown} */ (glyph)).components[c];
            const componentGlyph = this.font.glyphs.get(component.glyphIndex);
            const componentTransform = copyComponent(component);
            // When tuplePoints is empty, it means "all points" — delta[c] maps to component c.
            // When tuplePoints lists specific points, look up component index c in that list.
            const deltaIndex = tuplePoints.length === 0 ? c : tuplePoints.indexOf(c);
            if(deltaIndex > -1 && deltaIndex < header.deltas.length) {
                componentTransform.dx += otRound(header.deltas[deltaIndex] * factor);
                componentTransform.dy += otRound(header.deltasY[deltaIndex] * factor);
            }
            const transformedComponentPoints = transformPoints(this.getTransform(componentGlyph, coords).points, componentTransform);
            transformedPoints.splice(pointsIndex, transformedComponentPoints.length, ...transformedComponentPoints);
            pointsIndex += componentGlyph.points.length;
        }
    }

    /**
     * Accumulate composite-component deltas across all active tuples.
     * @param {Array<{glyphIndex: number, dx: number, dy: number, xScale?: number, yScale?: number, scale01?: number, scale10?: number}>} componentTransforms
     * @param {Array<number>} tuplePoints
     * @param {{deltas: number[], deltasY: number[]}} header
     * @param {number} factor
     */
    accumulateComponentDeltas(componentTransforms, tuplePoints, header, factor) {
        for (let c = 0; c < componentTransforms.length; c++) {
            const deltaIndex = tuplePoints.length === 0 ? c : tuplePoints.indexOf(c);
            if (deltaIndex > -1 && deltaIndex < header.deltas.length) {
                componentTransforms[c].dx += header.deltas[deltaIndex] * factor;
                componentTransforms[c].dy += header.deltasY[deltaIndex] * factor;
            }
        }
    }

    /**
     * Render a composite glyph from already-accumulated component transforms.
     * @param {Glyph} glyph
     * @param {Array<{x: number, y: number, onCurve?: boolean, lastPointOfContour?: boolean}>} transformedPoints
     * @param {Record<string, number>} coords
     * @param {Array<{glyphIndex: number, dx: number, dy: number, xScale?: number, yScale?: number, scale01?: number, scale10?: number}>} componentTransforms
     */
    renderCompositeComponents(glyph, transformedPoints, coords, componentTransforms) {
        let pointsIndex = 0;
        for (let c = 0; c < /** @type {{ components: Array<{glyphIndex: number}> }} */ (/** @type {unknown} */ (glyph)).components.length; c++) {
            const componentGlyph = this.font.glyphs.get(componentTransforms[c].glyphIndex);
            const transformedComponentPoints = transformPoints(this.getTransform(componentGlyph, coords).points, componentTransforms[c]);
            transformedPoints.splice(pointsIndex, transformedComponentPoints.length, ...transformedComponentPoints);
            pointsIndex += componentGlyph.points.length;
        }
    }

    /**
     * Transforms composite glyph components without gvar deltas.
     * Used for composite glyphs that are not explicitly targeted in gvar
     * but still need their components to get variation applied.
     * @param {Glyph} glyph - The composite glyph to transform.
     * @param {Array<{x: number, y: number, onCurve?: boolean, lastPointOfContour?: boolean}>} transformedPoints - Points to be transformed in place.
     * @param {Record<string, number>} coords - Variation coordinates.
     */
    transformComponentsSimple(glyph, transformedPoints, coords) {
        let pointsIndex = 0;
        for(let c = 0; c < /** @type {{ components: Array<{glyphIndex: number, dx: number, dy: number}> }} */ (/** @type {unknown} */ (glyph)).components.length; c++) {
            const component = /** @type {{ components: Array<{glyphIndex: number, dx: number, dy: number}> }} */ (/** @type {unknown} */ (glyph)).components[c];
            const componentGlyph = this.font.glyphs.get(component.glyphIndex);
            const componentTransform = copyComponent(component);
            // No gvar deltas to apply - just use the base component transform (dx, dy)
            const transformedComponentPoints = transformPoints(this.getTransform(componentGlyph, coords).points, componentTransform);
            transformedPoints.splice(pointsIndex, transformedComponentPoints.length, ...transformedComponentPoints);
            pointsIndex += componentGlyph.points.length;
        }
    }

    applyTupleVariationStore(variationData, points, coords, flavor = 'gvar', args = {}) {
        if(!coords) {
            coords = this.font.variation.get();
        }
        const normalizedCoords = this.getNormalizedCoords(coords);
        const { headers, sharedPoints } = variationData;

        const axisCount = this.fvar().axes.length;

        let transformedPoints;

        if (flavor === 'gvar') {
            transformedPoints = points.map(copyPoint);
        } else if (flavor === 'cvar') {
            transformedPoints = [...points];
        }
        const compositeComponentTransforms = flavor === 'gvar' && args.glyph && args.glyph.isComposite
            ? /** @type {{ components: Array<{glyphIndex: number, dx: number, dy: number, xScale?: number, yScale?: number, scale01?: number, scale10?: number}> }} */ (/** @type {unknown} */ (args.glyph)).components.map(copyComponent)
            : null;

        const gvarSharedTuples = flavor === 'gvar' ? this.gvar().sharedTuples : null;

        for(let h = 0; h < headers.length; h++) {
            const header = headers[h];
            // Resolve tupleCoords once per header (not once per axis as before).
            const tupleCoords = flavor === 'gvar'
                ? (header.peakTuple || gvarSharedTuples[header.sharedTupleRecordsIndex])
                : header.peakTuple;
            let factor = 1;
            for (let a = 0; a < axisCount; a++) {
                if (tupleCoords[a] === 0) {
                    continue;
                }

                if (normalizedCoords[a] === 0) {
                    factor = 0;
                    break;
                }

                if (!header.intermediateStartTuple) {
                    if ((normalizedCoords[a] < Math.min(0, tupleCoords[a])) ||
                        (normalizedCoords[a] > Math.max(0, tupleCoords[a]))) {
                        factor = 0;
                        break;
                    }

                    factor = factor * (normalizedCoords[a] / tupleCoords[a]);
                } else {
                    if ((normalizedCoords[a] < header.intermediateStartTuple[a]) || (normalizedCoords[a] > header.intermediateEndTuple[a])) {
                        factor = 0;
                        break;
                    } else if (normalizedCoords[a] === tupleCoords[a]) {
                        continue;
                    } else if (normalizedCoords[a] < tupleCoords[a]) {
                        const denom = tupleCoords[a] - header.intermediateStartTuple[a];
                        factor = factor * ((normalizedCoords[a] - header.intermediateStartTuple[a]) / (denom === 0 ? 1 : denom));
                    } else {
                        const denom = header.intermediateEndTuple[a] - tupleCoords[a];
                        factor = factor * ((header.intermediateEndTuple[a] - normalizedCoords[a]) / (denom === 0 ? 1 : denom));
                    }
                }
            }

            if (factor === 0) {
                continue;
            }

            const usesPrivatePoints = !!header.privatePointNumbers;
            const tuplePoints = usesPrivatePoints ? header.privatePoints : sharedPoints;

            if(compositeComponentTransforms) {
                this.accumulateComponentDeltas(compositeComponentTransforms, tuplePoints, header, factor);
            } else if (tuplePoints.length === 0) {
                for (let i = 0; i < transformedPoints.length; i++) {
                    const point = transformedPoints[i];
                    if(flavor === 'gvar') {
                        // Mutate in place — no new object allocation needed.
                        // transformedPoints is already a fresh copy from points.map(copyPoint)
                        // so mutating is safe and avoids N object allocations per active header.
                        // Round per-header to match the spec's implicit rounding model and
                        // avoid floating-point drift when many headers accumulate.
                        point.x = Math.round(point.x + header.deltas[i] * factor);
                        point.y = Math.round(point.y + header.deltasY[i] * factor);
                    } else if (flavor === 'cvar') {
                        transformedPoints[i] = point + header.deltas[i] * factor;
                    }
                }
            } else {
                let interpolatedPoints;
                if(flavor === 'gvar') {
                    interpolatedPoints = points.map(copyPoint);
                } else if (flavor === 'cvar') {
                    interpolatedPoints = transformedPoints;
                }
                const deltaMap = Array(points.length).fill(false);
                for (let i = 0; i < tuplePoints.length; i++) {
                    let pointIndex = tuplePoints[i];
                    if (pointIndex < points.length) {
                        let point = interpolatedPoints[pointIndex];
                        if(flavor === 'gvar') {
                            deltaMap[pointIndex] = true;
                            point.x += header.deltas[i] * factor;
                            point.y += header.deltasY[i] * factor;
                        } else if (flavor === 'cvar') {
                            transformedPoints[pointIndex] = otRound(point + header.deltas[i] * factor);
                        }
                    }
                }

                if(flavor === 'gvar') {
                    this.interpolatePoints(interpolatedPoints, points, deltaMap);
    
                    for (let i = 0; i < points.length; i++) {
                        let deltaX = interpolatedPoints[i].x - points[i].x;
                        let deltaY = interpolatedPoints[i].y - points[i].y;
    
                        transformedPoints[i].x = transformedPoints[i].x + deltaX;
                        transformedPoints[i].y = transformedPoints[i].y + deltaY;
                    }
                }
            }
        }

        if (compositeComponentTransforms && args.glyph) {
            this.renderCompositeComponents(args.glyph, transformedPoints, coords, compositeComponentTransforms);
        }

        if (flavor === 'gvar') {
            for (let i = 0; i < transformedPoints.length; i++) {
                transformedPoints[i].x = otRound(transformedPoints[i].x);
                transformedPoints[i].y = otRound(transformedPoints[i].y);
            }
        } else if (flavor === 'cvar') {
            for (let i = 0; i < transformedPoints.length; i++) {
                transformedPoints[i] = otRound(transformedPoints[i]);
            }
        }

        return transformedPoints;
    }

    
    /**
     * Retrieves a transformed copy of a glyph based on the provided variation coordinates, or the glyph itself if no variation was applied
     * @param {Glyph} glyph - Glyph or index of glyph to transform.
     * @param {Record<string, number>} [coords] - Variation coords object (will fall back to variation coords in the defaultRenderOptions)
     * @returns {Glyph} - The transformed glyph.
     */
    getTransform(glyph, coords) {
        if(Number.isInteger(glyph)) {
            glyph = this.font.glyphs.get(glyph);
        }
        const hasBlend = glyph.getBlendPath;
        const hasPoints = !!(glyph.points && glyph.points.length);
        let transformedGlyph = glyph;
        if (hasBlend || hasPoints) {
            if(!coords) {
                coords = this.font.variation.get();
            }
            if(hasPoints) {
                // Some glyphs lazily expose composite metadata only after path
                // realization. gvar tuples for those glyphs use component-style
                // deltas, so we must realize that metadata before deciding how
                // to apply variation data.
                if (glyph.isComposite === undefined && this.gvar()) {
                    glyph.path;
                }
                const variationData = this.gvar() && this.gvar().glyphVariations[glyph.index];

                if(variationData) {
                    const glyphPoints = glyph.points;
                    let transformedPoints = this.applyTupleVariationStore(variationData, glyphPoints, coords, 'gvar', { glyph });
                    const transformedPath = getPath(transformedPoints);
                    // Preserve unitsPerEm from the original glyph's path for correct scaling
                    /** @type {{ unitsPerEm?: number }} */ (transformedPath).unitsPerEm = glyph.path && /** @type {{ unitsPerEm?: number }} */ (glyph.path).unitsPerEm ? /** @type {{ unitsPerEm?: number }} */ (glyph.path).unitsPerEm : this.font.unitsPerEm;
                    transformedGlyph = new Glyph(Object.assign({}, glyph, {points: transformedPoints, path: transformedPath}));
                }

                // Handle composite glyphs that are not explicitly in gvar but have components that need transforming
                // This ensures component glyphs get their variation applied even when the composite itself has no gvar deltas
                if (glyph.isComposite && (!variationData || !variationData.headers || !variationData.headers.length)) {
                    const transformedPoints = glyph.points.map(copyPoint);
                    this.transformComponentsSimple(glyph, transformedPoints, coords);
                    const transformedPath = getPath(transformedPoints);
                    /** @type {{ unitsPerEm?: number }} */ (transformedPath).unitsPerEm = glyph.path && /** @type {{ unitsPerEm?: number }} */ (glyph.path).unitsPerEm ? /** @type {{ unitsPerEm?: number }} */ (glyph.path).unitsPerEm : this.font.unitsPerEm;
                    transformedGlyph = new Glyph(Object.assign({}, glyph, {points: transformedPoints, path: transformedPath}));
                }
            } else if (hasBlend) {
                const blendPath = glyph.getBlendPath(this.font, coords);
                transformedGlyph = new Glyph(Object.assign({}, glyph, {path: blendPath}));
            }
        }

        if(this.font.tables.hvar) {
            glyph._advanceWidth = typeof glyph._advanceWidth !== 'undefined' ? glyph._advanceWidth: glyph.advanceWidth;
            glyph.advanceWidth = transformedGlyph.advanceWidth = otRound(glyph._advanceWidth + this.getVariableAdjustment(transformedGlyph.index, 'hvar', 'advanceWidth', coords));
            
            glyph._leftSideBearing = typeof glyph._leftSideBearing !== 'undefined' ? glyph._leftSideBearing: glyph.leftSideBearing;
            glyph.leftSideBearing = transformedGlyph.leftSideBearing = otRound(glyph._leftSideBearing + this.getVariableAdjustment(transformedGlyph.index, 'hvar', 'lsb', coords));
        }

        return transformedGlyph;
    }

    getCvarTransform(coords) {
        const cvt = this.font.tables.cvt;
        const variationData = this.cvar();
        if(!cvt || !cvt.length || !variationData || !variationData.headers.length) return cvt;
        return this.applyTupleVariationStore(variationData, cvt, coords, 'cvar');
    }

    /**
     * Calculates the variable adjustment for a glyph property from variation data.
     * @param {number} gid - Glyph ID.
     * @param {string} tableName - The name of the variation data table.
     * @param {string} parameter - The property to adjust.
     * @param {Record<string, number>} coords - Variation coordinates.
     * @returns {number} - The calculated adjustment.
     */
    getVariableAdjustment(gid, tableName, parameter, coords) {
        coords = coords || this.font.variation.get();

        let outerIndex, innerIndex;
        
        const table = this.font.tables[tableName];
        if(!table) {
            throw Error(`trying to get variation adjustment from non-existent table "${table}"`);
        }
        if(!table.itemVariationStore) {
            throw Error(`trying to get variation adjustment from table "${table}" which does not have an itemVariationStore`);
        }
        const mapSize = table[parameter] && table[parameter].map.length;
        if (mapSize) {
            let i = gid;
            if (i >= mapSize) {
                i = mapSize - 1;
            }
            
            ({outerIndex, innerIndex} = table[parameter].map[i]);
        } else {
            outerIndex = 0;
            innerIndex = gid;
        }
    
        return this.getDelta(table.itemVariationStore, outerIndex, innerIndex, coords);

    }

    /**
     * Retrieves the delta value from a variation store.
     * @param {{itemVariationSubtables: Array<{deltaSets: Array<number[]>, regionIndexes: number[]}>, variationRegions: Array<{regionAxes: Array<{startCoord: number, peakCoord: number, endCoord: number}>}>}} itemStore - The item variation store.
     * @param {number} outerIndex - The outer index in the variation subtables.
     * @param {number} innerIndex - The inner index in the delta sets.
     * @param {Record<string, number>} coords - Variation coordinates.
     * @returns {number} - The delta value.
     */
    getDelta(itemStore, outerIndex, innerIndex, coords) {
        if (outerIndex >= itemStore.itemVariationSubtables.length) {
            return 0;
        }
        
        let varData = itemStore.itemVariationSubtables[outerIndex];
        if (innerIndex >= varData.deltaSets.length) {
            return 0;
        }
        
        let deltaSet = varData.deltaSets[innerIndex];
        let blendVector = this.getBlendVector(itemStore, outerIndex, coords);
        let netAdjustment = 0;
    
        for (let master = 0; master < varData.regionIndexes.length; master++) {
            netAdjustment += deltaSet[master] * blendVector[master];
        }
    
        return netAdjustment;
    }

    /**
     * Calculates the blend vector for a set of variation coordinates.
     * @param {{itemVariationSubtables: Array<{regionIndexes: number[]}>, variationRegions: Array<{regionAxes: Array<{startCoord: number, peakCoord: number, endCoord: number}>}>}} itemStore - The item variation store.
     * @param {number} itemIndex - Index of the current item in the variation subtables.
     * @param {Record<string, number>} coords - Variation coordinates.
     * @returns {Array<number>} - The blend vector for the given coordinates.
     */
    getBlendVector(itemStore, itemIndex, coords) {
        if(!coords) {
            coords = this.font.variation.get();
        }
        let varData = itemStore.itemVariationSubtables[itemIndex];

        const normalizedCoords = this.getNormalizedCoords(coords);
        let blendVector = [];
    
        // outer loop steps through master designs to be blended
        for (let master = 0; master < varData.regionIndexes.length; master++) {
            let scalar = 1;
            let regionIndex = varData.regionIndexes[master];
            let axes = itemStore.variationRegions[regionIndex].regionAxes;
    
            // inner loop steps through axes in this region
            for (let j = 0; j < axes.length; j++) {
                let axis = axes[j];
                let axisScalar;
    
                // compute the scalar contribution of this axis
                // ignore invalid ranges
                if (axis.startCoord > axis.peakCoord || axis.peakCoord > axis.endCoord) {
                    axisScalar = 1;
    
                } else if (axis.startCoord < 0 && axis.endCoord > 0 && axis.peakCoord !== 0) {
                    axisScalar = 1;
    
                    // peak of 0 means ignore this axis
                } else if (axis.peakCoord === 0) {
                    axisScalar = 1;
    
                    // ignore this region if coords are out of range
                } else if (normalizedCoords[j] < axis.startCoord || normalizedCoords[j] > axis.endCoord) {
                    axisScalar = 0;
    
                    // calculate a proportional factor
                } else {
                    if (normalizedCoords[j] === axis.peakCoord) {
                        axisScalar = 1;
                    } else if (normalizedCoords[j] < axis.peakCoord) {
                        const denom = axis.peakCoord - axis.startCoord;
                        axisScalar = (normalizedCoords[j] - axis.startCoord) / (denom === 0 ? 1 : denom);
                    } else {
                        const denom = axis.endCoord - axis.peakCoord;
                        axisScalar = (axis.endCoord - normalizedCoords[j]) / (denom === 0 ? 1 : denom);
                    }
                }
    
                // take product of all the axis scalars
                scalar *= axisScalar;
            }
    
            blendVector[master] = scalar;
        }
    
        return blendVector;
    }

    /** Helper method that returns the font's avar table if present */
    avar() {
        return this.font.tables.avar;
    }

    /** Helper method that returns the font's cvar table if present */
    cvar() {
        return this.font.tables.cvar;
    }

    /** Helper method that returns the font's fvar table if present */
    fvar() {
        return this.font.tables.fvar;
    }

    /** Helper method that returns the font's gvar table if present */
    gvar() {
        return this.font.tables.gvar;
    }

    /** Helper method that returns the font's hvar table if present */
    hvar() {
        return this.font.tables.hvar;
    }
}
