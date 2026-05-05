/**
 * Conversion utilities for OpenType font format conversion.
 * Handles bidirectional conversion between CFF2 VF (blend operators) and TTF VF (gvar).
 */

import { cubicToQuadratics, pathToPoints } from './tables/glyf.mjs';
import Path from './path.mjs';

/**
 * Convert a CFF2 variable font to TrueType variable font format.
 * This extracts deltas from CFF2 blend operators and creates gvar table data.
 * 
 * @param {object} font - The font to convert (modifies in place)
 * @returns {boolean} True if conversion was successful
 */
export function convertCFF2ToTTF(font) {
    // Verify this is a CFF2 VF
    if (!font.tables.cff2) {
        console.warn('convertCFF2ToTTF: Font does not have CFF2 table');
        return false;
    }
    
    if (!font.tables.fvar) {
        console.warn('convertCFF2ToTTF: Font does not have fvar table');
        return false;
    }
    
    const cff2 = font.tables.cff2;
    const vstore = cff2.topDict && cff2.topDict._vstore;
    
    if (!vstore || !vstore.itemVariationStore) {
        console.warn('convertCFF2ToTTF: CFF2 table does not have vstore');
        return false;
    }
    
    const ivs = vstore.itemVariationStore;
    const regions = ivs.variationRegions || [];
    const axisCount = font.tables.fvar.axes.length;
    
    // Initialize gvar table
    const gvar = {
        version: [1, 0],
        sharedTuples: [],
        glyphVariations: {}
    };
    
    // Build shared tuples from variation regions
    // Convert IVS regions to gvar peak tuples
    for (const region of regions) {
        const peakTuple = [];
        for (let a = 0; a < axisCount; a++) {
            const axis = region.regionAxes[a];
            // Use peak coord as the tuple value
            peakTuple.push(axis.peakCoord);
        }
        gvar.sharedTuples.push(peakTuple);
    }
    
    // Process each glyph
    for (let i = 0; i < font.glyphs.length; i++) {
        const glyph = font.glyphs.get(i);
        
        if (!glyph || !glyph.path || !glyph.path.commands || glyph.path.commands.length === 0) {
            continue;
        }
        
        // Check if glyph has any CFF2 deltas
        const hasDeltas = glyph.path.commands.some(cmd => cmd.deltas);
        if (!hasDeltas) {
            continue;
        }
        
        // Convert path and deltas to points with gvar deltas
        const conversion = convertCFF2PathToTTFWithDeltas(glyph.path, regions, axisCount);
        
        if (!conversion || conversion.deltasPerRegion.length === 0) {
            continue;
        }
        
        // Store converted points on glyph for export
        glyph.points = conversion.points;
        glyph.contourEnds = conversion.contourEnds;
        
        // Create gvar variation headers for each region that has deltas
        const headers = [];
        for (let r = 0; r < regions.length; r++) {
            const regionDeltas = conversion.deltasPerRegion[r];
            if (!regionDeltas || regionDeltas.length === 0) {
                continue;
            }
            
            // Check if all deltas are zero
            const hasNonZero = regionDeltas.deltas.some(d => d !== 0) || 
                              regionDeltas.deltasY.some(d => d !== 0);
            if (!hasNonZero) {
                continue;
            }
            
            headers.push({
                sharedTupleRecordsIndex: r,
                peakTuple: gvar.sharedTuples[r],
                deltas: regionDeltas.deltas,
                deltasY: regionDeltas.deltasY,
                privatePoints: []
            });
        }
        
        if (headers.length > 0) {
            gvar.glyphVariations[i] = {
                headers,
                sharedPoints: []
            };
        }
    }
    
    // Set gvar table
    font.tables.gvar = gvar;
    
    // Convert outlines format
    font.outlinesFormat = 'truetype';
    
    // Remove CFF2 table (will be replaced by glyf on export)
    delete font.tables.cff2;
    delete font.tables.cff;
    
    return true;
}

/**
 * Convert a CFF2 path with deltas to TrueType points with gvar-style deltas.
 * Handles cubic-to-quadratic conversion while properly distributing deltas.
 * 
 * @param {Path} path - The CFF2 path with deltas on commands
 * @param {Array} regions - Variation regions from vstore
 * @param {number} axisCount - Number of variation axes
 * @param {number} [tolerance=1] - Cubic to quadratic conversion tolerance
 * @returns {{points: Array, contourEnds: Array, deltasPerRegion: Array}} { points, contourEnds, deltasPerRegion }
 */
function convertCFF2PathToTTFWithDeltas(path, regions, axisCount, tolerance = 1) {
    const points = [];
    const contourEnds = [];
    
    // Initialize deltas per region
    const deltasPerRegion = regions.map(() => ({ deltas: [], deltasY: [] }));
    
    let contourStart = 0;
    let contourStartPoint = null;
    let currentX = 0, currentY = 0;
    
    for (const cmd of path.commands) {
        const cmdDeltas = cmd.deltas;
        
        switch (cmd.type) {
            case 'M':
                // End previous contour if any
                if (points.length > 0 && points.length > contourStart) {
                    contourEnds.push(points.length - 1);
                    contourStart = points.length;
                }
                currentX = cmd.x;
                currentY = cmd.y;
                contourStartPoint = { x: Math.round(cmd.x), y: Math.round(cmd.y), onCurve: true };
                points.push(contourStartPoint);
                
                // Add deltas for this point
                for (let r = 0; r < regions.length; r++) {
                    let dx = 0, dy = 0;
                    if (cmdDeltas) {
                        if (cmdDeltas.x && cmdDeltas.x[1]) dx = Math.round(cmdDeltas.x[1][r] || 0);
                        if (cmdDeltas.y && cmdDeltas.y[1]) dy = Math.round(cmdDeltas.y[1][r] || 0);
                    }
                    deltasPerRegion[r].deltas.push(dx);
                    deltasPerRegion[r].deltasY.push(dy);
                }
                break;
                
            case 'L':
                currentX = cmd.x;
                currentY = cmd.y;
                points.push({ x: Math.round(cmd.x), y: Math.round(cmd.y), onCurve: true });
                
                // Add deltas for this point
                for (let r = 0; r < regions.length; r++) {
                    let dx = 0, dy = 0;
                    if (cmdDeltas) {
                        if (cmdDeltas.x && cmdDeltas.x[1]) dx = Math.round(cmdDeltas.x[1][r] || 0);
                        if (cmdDeltas.y && cmdDeltas.y[1]) dy = Math.round(cmdDeltas.y[1][r] || 0);
                    }
                    deltasPerRegion[r].deltas.push(dx);
                    deltasPerRegion[r].deltasY.push(dy);
                }
                break;
                
            case 'Q':
                // Quadratic curve: off-curve control point then on-curve end
                points.push({ x: Math.round(cmd.x1), y: Math.round(cmd.y1), onCurve: false });
                points.push({ x: Math.round(cmd.x), y: Math.round(cmd.y), onCurve: true });
                currentX = cmd.x;
                currentY = cmd.y;
                
                // Add deltas for control point and end point
                for (let r = 0; r < regions.length; r++) {
                    let dx1 = 0, dy1 = 0, dx = 0, dy = 0;
                    if (cmdDeltas) {
                        // For Q commands, we might have x1/y1 deltas
                        if (cmdDeltas.x1 && cmdDeltas.x1[1]) dx1 = Math.round(cmdDeltas.x1[1][r] || 0);
                        if (cmdDeltas.y1 && cmdDeltas.y1[1]) dy1 = Math.round(cmdDeltas.y1[1][r] || 0);
                        if (cmdDeltas.x && cmdDeltas.x[1]) dx = Math.round(cmdDeltas.x[1][r] || 0);
                        if (cmdDeltas.y && cmdDeltas.y[1]) dy = Math.round(cmdDeltas.y[1][r] || 0);
                    }
                    deltasPerRegion[r].deltas.push(dx1, dx);
                    deltasPerRegion[r].deltasY.push(dy1, dy);
                }
                break;
                
            case 'C': {
                // Convert cubic to quadratic(s)
                const quads = cubicToQuadratics(
                    currentX, currentY,
                    cmd.x1, cmd.y1,
                    cmd.x2, cmd.y2,
                    cmd.x, cmd.y,
                    tolerance
                );
                
                // For delta distribution:
                // If the cubic has deltas, we need to distribute them across the quadratics
                // This is an approximation - we linearly interpolate the deltas
                const numQuads = quads.length;
                
                for (let q = 0; q < numQuads; q++) {
                    const quad = quads[q];
                    points.push({ x: Math.round(quad.cx), y: Math.round(quad.cy), onCurve: false });
                    points.push({ x: Math.round(quad.x), y: Math.round(quad.y), onCurve: true });
                    
                    // Distribute deltas across quadratics
                    // For simplicity, we use linear interpolation
                    const t = (q + 1) / numQuads; // Progress through the curve
                    
                    for (let r = 0; r < regions.length; r++) {
                        let dcx = 0, dcy = 0, dx = 0, dy = 0;
                        
                        if (cmdDeltas) {
                            // Interpolate control point deltas
                            const dc1x = cmdDeltas.c1x && cmdDeltas.c1x[1] ? cmdDeltas.c1x[1][r] || 0 : 0;
                            const dc1y = cmdDeltas.c1y && cmdDeltas.c1y[1] ? cmdDeltas.c1y[1][r] || 0 : 0;
                            const dc2x = cmdDeltas.c2x && cmdDeltas.c2x[1] ? cmdDeltas.c2x[1][r] || 0 : 0;
                            const dc2y = cmdDeltas.c2y && cmdDeltas.c2y[1] ? cmdDeltas.c2y[1][r] || 0 : 0;
                            const dEndX = cmdDeltas.x && cmdDeltas.x[1] ? cmdDeltas.x[1][r] || 0 : 0;
                            const dEndY = cmdDeltas.y && cmdDeltas.y[1] ? cmdDeltas.y[1][r] || 0 : 0;
                            
                            // Approximate the quadratic control point delta
                            // Use weighted average of the two cubic control point deltas
                            const tLocal = (q + 0.5) / numQuads;
                            dcx = Math.round((1 - tLocal) * dc1x + tLocal * dc2x);
                            dcy = Math.round((1 - tLocal) * dc1y + tLocal * dc2y);
                            
                            // The end point delta interpolates toward the cubic end
                            if (q === numQuads - 1) {
                                // Last quad - use the actual end delta
                                dx = Math.round(dEndX);
                                dy = Math.round(dEndY);
                            } else {
                                // Intermediate quad - interpolate
                                dx = Math.round((1 - t) * dc2x + t * dEndX);
                                dy = Math.round((1 - t) * dc2y + t * dEndY);
                            }
                        }
                        
                        deltasPerRegion[r].deltas.push(dcx, dx);
                        deltasPerRegion[r].deltasY.push(dcy, dy);
                    }
                }
                
                currentX = cmd.x;
                currentY = cmd.y;
                break;
            }
            
            case 'Z':
                // End contour
                if (points.length > contourStart && contourStartPoint) {
                    const lastPoint = points[points.length - 1];
                    if (lastPoint.x === contourStartPoint.x &&
                        lastPoint.y === contourStartPoint.y &&
                        lastPoint.onCurve === contourStartPoint.onCurve) {
                        // Remove duplicate closing point and its deltas
                        points.pop();
                        for (let r = 0; r < regions.length; r++) {
                            deltasPerRegion[r].deltas.pop();
                            deltasPerRegion[r].deltasY.pop();
                        }
                    }
                }
                if (points.length > contourStart) {
                    contourEnds.push(points.length - 1);
                    contourStart = points.length;
                }
                contourStartPoint = null;
                currentX = 0;
                currentY = 0;
                break;
        }
    }
    
    // Handle case where path doesn't end with Z
    if (points.length > contourStart) {
        contourEnds.push(points.length - 1);
    }
    
    // Add phantom points (4 points: LSB, RSB, TSB, BSB) with zero deltas
    for (let i = 0; i < 4; i++) {
        for (let r = 0; r < regions.length; r++) {
            deltasPerRegion[r].deltas.push(0);
            deltasPerRegion[r].deltasY.push(0);
        }
    }
    
    return { points, contourEnds, deltasPerRegion };
}

/**
 * Force eager parsing of gvar deltas.
 * Gvar deltas are lazily parsed - accessing them forces parsing which can fail
/**
 * Convert a TrueType variable font to CFF2 variable font format.
 * This extracts deltas from gvar and creates CFF2 blend operators with vstore.
 * 
 * @param {object} font - The font to convert (modifies in place)
 * @returns {boolean} True if conversion was successful
 */
export function convertTTFToCFF2(font) {
    // Verify this is a TTF VF
    if (font.outlinesFormat !== 'truetype') {
        console.warn('convertTTFToCFF2: Font is not TrueType format');
        return false;
    }
    
    if (!font.tables.fvar) {
        console.warn('convertTTFToCFF2: Font does not have fvar table');
        return false;
    }
    
    if (!font.tables.gvar) {
        console.warn('convertTTFToCFF2: Font does not have gvar table');
        return false;
    }
    
    const gvar = font.tables.gvar;
    const axisCount = font.tables.fvar.axes.length;
    
    // Build variation regions from gvar shared tuples
    const variationRegions = [];
    const sharedTuples = gvar.sharedTuples || [];
    
    // Create regions from shared tuples (each tuple becomes a region)
    for (const tuple of sharedTuples) {
        const regionAxes = [];
        for (let a = 0; a < axisCount; a++) {
            const peak = tuple[a] || 0;
            // Simple region: goes from 0 to peak (or peak to 0 for negative)
            if (peak >= 0) {
                regionAxes.push({ startCoord: 0, peakCoord: peak, endCoord: peak });
            } else {
                regionAxes.push({ startCoord: peak, peakCoord: peak, endCoord: 0 });
            }
        }
        variationRegions.push({ regionAxes });
    }
    
    // Also collect embedded peak tuples from glyph variations
    const tupleToRegionIndex = new Map();
    for (const tuple of sharedTuples) {
        tupleToRegionIndex.set(tuple.join(','), tupleToRegionIndex.size);
    }
    
    for (const glyphId in gvar.glyphVariations) {
        const variation = gvar.glyphVariations[glyphId];
        if (!variation || !variation.headers) continue;
        
        for (const header of variation.headers) {
            const peakTuple = header.peakTuple || 
                (header.sharedTupleRecordsIndex !== undefined && sharedTuples[header.sharedTupleRecordsIndex]);
            
            if (peakTuple) {
                const key = peakTuple.join(',');
                if (!tupleToRegionIndex.has(key)) {
                    const regionAxes = [];
                    for (let a = 0; a < axisCount; a++) {
                        const peak = peakTuple[a] || 0;
                        if (peak >= 0) {
                            regionAxes.push({ startCoord: 0, peakCoord: peak, endCoord: peak });
                        } else {
                            regionAxes.push({ startCoord: peak, peakCoord: peak, endCoord: 0 });
                        }
                    }
                    variationRegions.push({ regionAxes });
                    tupleToRegionIndex.set(key, variationRegions.length - 1);
                }
            }
        }
    }
    
    // Build vstore (ItemVariationStore)
    const vstore = {
        itemVariationStore: {
            format: 1,
            variationRegions: variationRegions,
            itemVariationSubtables: []
        }
    };
    
    // Process each glyph to convert points to paths with deltas
    for (let i = 0; i < font.glyphs.length; i++) {
        const glyph = font.glyphs.get(i);
        
        if (!glyph || !glyph.path || !glyph.path.commands || glyph.path.commands.length === 0) {
            continue;
        }
        
        const glyphVariation = gvar.glyphVariations[i];
        if (!glyphVariation || !glyphVariation.headers || glyphVariation.headers.length === 0) {
            continue;
        }
        
        // Get the glyph points
        const glyphPoints = glyph.points;
        if (!glyphPoints || glyphPoints.length === 0) {
            // Try to generate points from path
            const converted = pathToPoints(glyph.path);
            if (!converted || converted.points.length === 0) {
                continue;
            }
        }
        
        // Convert gvar deltas to CFF2 command deltas
        convertGvarDeltasToCFF2Deltas(glyph, glyphVariation, sharedTuples, tupleToRegionIndex, variationRegions.length);
    }
    
    // Create CFF2 table structure
    const existingCFF = font.tables.cff || {};
    
    font.tables.cff2 = {
        version: 2,
        topDict: {
            ...existingCFF.topDict,
            _vstore: vstore
        },
        globalSubrIndex: existingCFF.globalSubrIndex || [],
        charStrings: existingCFF.charStrings || []
    };
    
    // Convert outlines format
    font.outlinesFormat = 'cff';
    
    // Remove gvar table (deltas are now in CFF2 blend operators)
    delete font.tables.gvar;
    delete font.tables.glyf;
    delete font.tables.loca;
    
    return true;
}

/**
 * Convert gvar deltas to CFF2 command deltas format.
 * Maps TrueType point deltas to CFF2 path command deltas.
 * 
 * @param {object} glyph - The glyph to process
 * @param {object} glyphVariation - The gvar variation data for this glyph
 * @param {Array} sharedTuples - Shared tuple records
 * @param {Map} tupleToRegionIndex - Map from tuple key to region index
 * @param {number} numRegions - Total number of regions
 */
function convertGvarDeltasToCFF2Deltas(glyph, glyphVariation, sharedTuples, tupleToRegionIndex, numRegions) {
    const path = glyph.path;
    if (!path || !path.commands || path.commands.length === 0) {
        return;
    }
    
    const commands = path.commands;
    
    // Get points from glyph.points or generate from path
    let points = glyph.points;
    if (!points || points.length === 0) {
        // Generate points from path for mapping
        const converted = pathToPoints(path);
        points = converted.points;
    }
    
    if (!points || points.length === 0) {
        return;
    }
    
    // Build per-point delta arrays (indexed by region)
    // Each point will have deltas from multiple variation tuples
    const pointDeltasX = points.map(() => new Array(numRegions).fill(0));
    const pointDeltasY = points.map(() => new Array(numRegions).fill(0));
    
    const { headers, sharedPoints } = glyphVariation;
    
    if (!headers) {
        return;
    }
    
    for (const header of headers) {
        // Determine which region this header corresponds to
        const peakTuple = header.peakTuple || 
            (header.sharedTupleRecordsIndex !== undefined && sharedTuples && sharedTuples[header.sharedTupleRecordsIndex]);
        
        if (!peakTuple) continue;
        
        const regionIndex = tupleToRegionIndex.get(peakTuple.join(','));
        if (regionIndex === undefined) continue;
        
        const tuplePoints = header.privatePoints && header.privatePoints.length > 0 
            ? header.privatePoints 
            : (sharedPoints || []);
        
        const deltas = header.deltas || [];
        const deltasY = header.deltasY || [];
        
        if (tuplePoints && tuplePoints.length > 0) {
            // Sparse deltas - only specific points have deltas
            for (let d = 0; d < tuplePoints.length; d++) {
                const pointIndex = tuplePoints[d];
                if (pointIndex < points.length) {
                    pointDeltasX[pointIndex][regionIndex] = deltas[d] || 0;
                    pointDeltasY[pointIndex][regionIndex] = deltasY[d] || 0;
                }
            }
        } else {
            // All points have deltas
            for (let p = 0; p < Math.min(points.length, deltas.length); p++) {
                pointDeltasX[p][regionIndex] = deltas[p] || 0;
                pointDeltasY[p][regionIndex] = deltasY[p] || 0;
            }
        }
    }
    
    // Now map point deltas to command deltas
    // This requires understanding the correspondence between commands and points
    let pointIndex = 0;
    
    // Helper function to safely get delta array
    const getDeltaX = (idx) => idx < pointDeltasX.length ? pointDeltasX[idx] : new Array(numRegions).fill(0);
    const getDeltaY = (idx) => idx < pointDeltasY.length ? pointDeltasY[idx] : new Array(numRegions).fill(0);
    
    for (let c = 0; c < commands.length; c++) {
        const cmd = commands[c];
        
        if (cmd.type === 'Z') {
            continue;
        }
        
        if (pointIndex >= points.length) {
            break;
        }
        
        // Check if any region has non-zero deltas for this command's points
        let hasDeltas = false;
        
        switch (cmd.type) {
            case 'M':
            case 'L': {
                // Single point
                const dxArr = getDeltaX(pointIndex);
                const dyArr = getDeltaY(pointIndex);
                for (let r = 0; r < numRegions; r++) {
                    if (dxArr[r] !== 0 || dyArr[r] !== 0) {
                        hasDeltas = true;
                        break;
                    }
                }
                
                if (hasDeltas) {
                    cmd.deltas = {
                        x: [cmd.x, dxArr.slice()],
                        y: [cmd.y, dyArr.slice()]
                    };
                }
                pointIndex++;
                break;
            }
                
            case 'Q': {
                // Two points: control point and end point
                const dx1Arr = getDeltaX(pointIndex);
                const dy1Arr = getDeltaY(pointIndex);
                const dx2Arr = getDeltaX(pointIndex + 1);
                const dy2Arr = getDeltaY(pointIndex + 1);
                
                for (let r = 0; r < numRegions; r++) {
                    if (dx1Arr[r] !== 0 || dy1Arr[r] !== 0 ||
                        dx2Arr[r] !== 0 || dy2Arr[r] !== 0) {
                        hasDeltas = true;
                        break;
                    }
                }
                
                if (hasDeltas) {
                    cmd.deltas = {
                        x1: [cmd.x1, dx1Arr.slice()],
                        y1: [cmd.y1, dy1Arr.slice()],
                        x: [cmd.x, dx2Arr.slice()],
                        y: [cmd.y, dy2Arr.slice()]
                    };
                }
                pointIndex += 2;
                break;
            }
                
            case 'C': {
                // CFF2 cubic curves - handle with 3 points (two controls + end)
                const dc1xArr = getDeltaX(pointIndex);
                const dc1yArr = getDeltaY(pointIndex);
                const dc2xArr = getDeltaX(pointIndex + 1);
                const dc2yArr = getDeltaY(pointIndex + 1);
                const dxArr = getDeltaX(pointIndex + 2);
                const dyArr = getDeltaY(pointIndex + 2);
                
                for (let r = 0; r < numRegions; r++) {
                    if (dc1xArr[r] !== 0 || dc1yArr[r] !== 0 ||
                        dc2xArr[r] !== 0 || dc2yArr[r] !== 0 ||
                        dxArr[r] !== 0 || dyArr[r] !== 0) {
                        hasDeltas = true;
                        break;
                    }
                }
                
                if (hasDeltas) {
                    cmd.deltas = {
                        c1x: [cmd.x1, dc1xArr.slice()],
                        c1y: [cmd.y1, dc1yArr.slice()],
                        c2x: [cmd.x2, dc2xArr.slice()],
                        c2y: [cmd.y2, dc2yArr.slice()],
                        x: [cmd.x, dxArr.slice()],
                        y: [cmd.y, dyArr.slice()]
                    };
                }
                pointIndex += 3;
                break;
            }
        }
    }
}

/**
 * Convert a static CFF font (no variation) to TrueType format.
 * This handles cubic-to-quadratic bezier conversion for all glyphs.
 * 
 * @param {object} font - The font to convert (modifies in place)
 * @returns {boolean} True if conversion was successful
 */
export function convertStaticCFFToTTF(font) {
    if (font.outlinesFormat !== 'cff') {
        console.warn('convertStaticCFFToTTF: Font is not CFF format');
        return false;
    }
    
    // Don't use this for VF - use convertCFF2ToTTF instead
    if (font.tables.cff2 && font.tables.fvar) {
        console.warn('convertStaticCFFToTTF: Font is CFF2 VF, use convertCFF2ToTTF instead');
        return false;
    }
    
    // For each glyph, convert the path from cubic to quadratic
    for (let i = 0; i < font.glyphs.length; i++) {
        const glyph = font.glyphs.get(i);
        if (!glyph || !glyph.path || !glyph.path.commands || glyph.path.commands.length === 0) {
            continue;
        }
        
        // Convert path to TrueType points (handles cubic→quadratic conversion)
        const { points, contourEnds } = pathToPoints(glyph.path);
        
        // Store on glyph for glyf table export
        glyph.points = points;
        glyph.contourEnds = contourEnds;
        glyph.numberOfContours = contourEnds.length;
    }
    
    // Switch outline format
    font.outlinesFormat = 'truetype';
    
    // Remove CFF tables, glyf/loca will be created on export
    delete font.tables.cff;
    delete font.tables.cff2;
    
    return true;
}

/**
 * Convert a static TrueType font (no variation) to CFF format.
 * This handles quadratic-to-cubic bezier conversion for all glyphs.
 * 
 * @param {object} font - The font to convert (modifies in place)
 * @returns {boolean} True if conversion was successful
 */
export function convertStaticTTFToCFF(font) {
    if (font.outlinesFormat !== 'truetype') {
        console.warn('convertStaticTTFToCFF: Font is not TrueType format');
        return false;
    }
    
    // Don't use this for VF - use convertTTFToCFF2 instead
    if (font.tables.gvar && font.tables.fvar) {
        console.warn('convertStaticTTFToCFF: Font is TTF VF, use convertTTFToCFF2 instead');
        return false;
    }
    
    const unitsPerEm = font.unitsPerEm;
    
    // For each glyph, convert the path from quadratic to cubic
    for (let i = 0; i < font.glyphs.length; i++) {
        const glyph = font.glyphs.get(i);
        if (!glyph || !glyph.path || !glyph.path.commands || glyph.path.commands.length === 0) {
            continue;
        }
        
        // Convert quadratic path to cubic
        const cubicPath = quadraticToCubic(glyph.path);
        
        // Preserve unitsPerEm on the new path (critical for getPath scaling)
        /** @type {object} */ (cubicPath).unitsPerEm = unitsPerEm;
        
        glyph.path = cubicPath;
        
        // Clear TrueType-specific data
        delete glyph.points;
        delete glyph.contourEnds;
        delete glyph.numberOfContours;
    }
    
    // Switch outline format
    font.outlinesFormat = 'cff';
    
    // Remove TrueType-specific tables
    delete font.tables.glyf;
    delete font.tables.loca;
    delete font.tables.gvar;
    
    return true;
}

/**
 * Convert a font to a specific format, handling both static and variable fonts.
 * This is the main entry point for format conversion.
 * 
 * @param {object} font - The font to convert (modifies in place)
 * @param {string} targetFormat - Target format: 'truetype' or 'cff'
 * @returns {boolean} True if conversion was successful (or already in target format)
 */
export function convertFontFormat(font, targetFormat) {
    const sourceFormat = font.outlinesFormat;
    
    // Already in target format
    if (sourceFormat === targetFormat) {
        return true;
    }
    
    // Normalize target format
    if (targetFormat === 'ttf') targetFormat = 'truetype';
    if (targetFormat === 'otf' || targetFormat === 'cff2') targetFormat = 'cff';
    
    const isVF = !!(font.tables && font.tables.fvar);
    const hasGvar = !!(font.tables && font.tables.gvar);
    const hasCFF2 = !!(font.tables && font.tables.cff2);
    
    if (targetFormat === 'truetype') {
        // Converting to TrueType
        if (sourceFormat === 'cff') {
            if (hasCFF2 && isVF) {
                // CFF2 VF → TTF VF
                return convertCFF2ToTTF(font);
            } else {
                // Static CFF → Static TTF
                return convertStaticCFFToTTF(font);
            }
        }
    } else if (targetFormat === 'cff') {
        // Converting to CFF
        if (sourceFormat === 'truetype') {
            if (hasGvar && isVF) {
                // TTF VF → CFF2 VF
                return convertTTFToCFF2(font);
            } else {
                // Static TTF → Static CFF
                return convertStaticTTFToCFF(font);
            }
        }
    }
    
    console.warn(`convertFontFormat: Unknown target format: ${targetFormat}`);
    return false;
}

/**
 * Convert quadratic paths from TTF to cubic paths for CFF.
 * This is a simpler conversion since quadratic -> cubic is exact.
 * 
 * @param {Path} path - The quadratic path to convert
 * @returns {Path} New path with cubic curves
 */
export function quadraticToCubic(path) {
    const newPath = new Path();
    
    for (const cmd of path.commands) {
        switch (cmd.type) {
            case 'M':
                newPath.moveTo(cmd.x, cmd.y);
                if (cmd.deltas) {
                    newPath.commands[newPath.commands.length - 1].deltas = cmd.deltas;
                }
                break;
            case 'L':
                newPath.lineTo(cmd.x, cmd.y);
                if (cmd.deltas) {
                    newPath.commands[newPath.commands.length - 1].deltas = cmd.deltas;
                }
                break;
            case 'Q': {
                // Convert quadratic to cubic
                // For a quadratic with control point Q and endpoints P0, P2:
                // The cubic control points are:
                // C1 = P0 + 2/3 * (Q - P0)
                // C2 = P2 + 2/3 * (Q - P2)
                const prevCmd = newPath.commands[newPath.commands.length - 1];
                const p0x = prevCmd.x;
                const p0y = prevCmd.y;
                const qx = cmd.x1;
                const qy = cmd.y1;
                const p2x = cmd.x;
                const p2y = cmd.y;
                
                const c1x = p0x + (2/3) * (qx - p0x);
                const c1y = p0y + (2/3) * (qy - p0y);
                const c2x = p2x + (2/3) * (qx - p2x);
                const c2y = p2y + (2/3) * (qy - p2y);
                
                newPath.curveTo(c1x, c1y, c2x, c2y, p2x, p2y);
                
                // Convert deltas too
                if (cmd.deltas) {
                    const newDeltas = {};
                    // The quadratic deltas need to be converted to cubic deltas
                    // Using the same 2/3 relationship
                    if (cmd.deltas.x1 && cmd.deltas.y1) {
                        // Control point deltas become two control points
                        newDeltas.c1x = [c1x, cmd.deltas.x1[1].map(d => Math.round(d * 2/3))];
                        newDeltas.c1y = [c1y, cmd.deltas.y1[1].map(d => Math.round(d * 2/3))];
                        newDeltas.c2x = [c2x, cmd.deltas.x1[1].map(d => Math.round(d * 2/3))];
                        newDeltas.c2y = [c2y, cmd.deltas.y1[1].map(d => Math.round(d * 2/3))];
                    }
                    if (cmd.deltas.x && cmd.deltas.y) {
                        newDeltas.x = cmd.deltas.x;
                        newDeltas.y = cmd.deltas.y;
                    }
                    if (Object.keys(newDeltas).length > 0) {
                        newPath.commands[newPath.commands.length - 1].deltas = newDeltas;
                    }
                }
                break;
            }
            case 'C':
                // Already cubic, just copy
                newPath.curveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
                if (cmd.deltas) {
                    newPath.commands[newPath.commands.length - 1].deltas = cmd.deltas;
                }
                break;
            case 'Z':
                newPath.close();
                break;
        }
    }
    
    return newPath;
}
