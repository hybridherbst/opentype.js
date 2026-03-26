// The `glyf` table describes the glyphs in TrueType outline format.
// http://www.microsoft.com/typography/otspec/glyf.htm

import check from '../check.js';
import glyphset from '../glyphset.js';
import parse from '../parse.js';
import Path from '../path.js';

// Parse the coordinate data for a glyph.
function parseGlyphCoordinate(p, flag, previousValue, shortVectorBitMask, sameBitMask) {
    let v;
    if ((flag & shortVectorBitMask) > 0) {
        // The coordinate is 1 byte long.
        v = p.parseByte();
        // The `same` bit is re-used for short values to signify the sign of the value.
        if ((flag & sameBitMask) === 0) {
            v = -v;
        }

        v = previousValue + v;
    } else {
        //  The coordinate is 2 bytes long.
        // If the `same` bit is set, the coordinate is the same as the previous coordinate.
        if ((flag & sameBitMask) > 0) {
            v = previousValue;
        } else {
            // Parse the coordinate as a signed 16-bit delta value.
            v = previousValue + p.parseShort();
        }
    }

    return v;
}

// Parse a TrueType glyph.
function parseGlyph(glyph, data, start) {
    const p = new parse.Parser(data, start);
    glyph.numberOfContours = p.parseShort();
    glyph._xMin = p.parseShort();
    glyph._yMin = p.parseShort();
    glyph._xMax = p.parseShort();
    glyph._yMax = p.parseShort();
    let flags;
    let flag;

    if (glyph.numberOfContours > 0) {
        // This glyph is not a composite.
        const endPointIndices = glyph.endPointIndices = [];
        for (let i = 0; i < glyph.numberOfContours; i += 1) {
            endPointIndices.push(p.parseUShort());
        }

        glyph.instructionLength = p.parseUShort();
        glyph.instructions = [];
        for (let i = 0; i < glyph.instructionLength; i += 1) {
            glyph.instructions.push(p.parseByte());
        }

        const numberOfCoordinates = endPointIndices[endPointIndices.length - 1] + 1;
        flags = [];
        for (let i = 0; i < numberOfCoordinates; i += 1) {
            flag = p.parseByte();
            flags.push(flag);
            // If bit 3 is set, we repeat this flag n times, where n is the next byte.
            if ((flag & 8) > 0) {
                const repeatCount = p.parseByte();
                for (let j = 0; j < repeatCount; j += 1) {
                    flags.push(flag);
                    i += 1;
                }
            }
        }

        check.argument(flags.length === numberOfCoordinates, 'Bad flags.');

        if (endPointIndices.length > 0) {
            const points = [];
            let point;
            // X/Y coordinates are relative to the previous point, except for the first point which is relative to 0,0.
            if (numberOfCoordinates > 0) {
                for (let i = 0; i < numberOfCoordinates; i += 1) {
                    flag = flags[i];
                    point = /** @type {any} */ ({});
                    point.onCurve = !!(flag & 1);
                    point.lastPointOfContour = endPointIndices.indexOf(i) >= 0;
                    points.push(point);
                }

                let px = 0;
                for (let i = 0; i < numberOfCoordinates; i += 1) {
                    flag = flags[i];
                    point = points[i];
                    point.x = parseGlyphCoordinate(p, flag, px, 2, 16);
                    px = point.x;
                }

                let py = 0;
                for (let i = 0; i < numberOfCoordinates; i += 1) {
                    flag = flags[i];
                    point = points[i];
                    point.y = parseGlyphCoordinate(p, flag, py, 4, 32);
                    py = point.y;
                }
            }

            glyph.points = points;
        } else {
            glyph.points = [];
        }
    } else if (glyph.numberOfContours === 0) {
        glyph.points = [];
    } else {
        glyph.isComposite = true;
        glyph.points = [];
        glyph.components = [];
        let moreComponents = true;
        while (moreComponents) {
            flags = p.parseUShort();
            const component = {
                glyphIndex: p.parseUShort(),
                xScale: 1,
                scale01: 0,
                scale10: 0,
                yScale: 1,
                dx: 0,
                dy: 0
            };
            if ((flags & 1) > 0) {
                // The arguments are words
                if ((flags & 2) > 0) {
                    // values are offset
                    component.dx = p.parseShort();
                    component.dy = p.parseShort();
                } else {
                    // values are matched points
                    component.matchedPoints = [p.parseUShort(), p.parseUShort()];
                }

            } else {
                // The arguments are bytes
                if ((flags & 2) > 0) {
                    // values are offset
                    component.dx = p.parseChar();
                    component.dy = p.parseChar();
                } else {
                    // values are matched points
                    component.matchedPoints = [p.parseByte(), p.parseByte()];
                }
            }

            if ((flags & 8) > 0) {
                // We have a scale
                component.xScale = component.yScale = p.parseF2Dot14();
            } else if ((flags & 64) > 0) {
                // We have an X / Y scale
                component.xScale = p.parseF2Dot14();
                component.yScale = p.parseF2Dot14();
            } else if ((flags & 128) > 0) {
                // We have a 2x2 transformation
                component.xScale = p.parseF2Dot14();
                component.scale01 = p.parseF2Dot14();
                component.scale10 = p.parseF2Dot14();
                component.yScale = p.parseF2Dot14();
            }

            glyph.components.push(component);
            moreComponents = !!(flags & 32);
        }
        if (flags & 0x100) {
            // We have instructions
            glyph.instructionLength = p.parseUShort();
            glyph.instructions = [];
            for (let i = 0; i < glyph.instructionLength; i += 1) {
                glyph.instructions.push(p.parseByte());
            }
        }
    }
}

// Transform an array of points and return a new array.
function transformPoints(points, transform) {
    const newPoints = [];
    for (let i = 0; i < points.length; i += 1) {
        const pt = points[i];
        const newPt = {
            x: transform.xScale * pt.x + transform.scale10 * pt.y + transform.dx,
            y: transform.scale01 * pt.x + transform.yScale * pt.y + transform.dy,
            onCurve: pt.onCurve,
            lastPointOfContour: pt.lastPointOfContour
        };
        newPoints.push(newPt);
    }

    return newPoints;
}

function getContours(points) {
    const contours = [];
    let currentContour = [];
    for (let i = 0; i < points.length; i += 1) {
        const pt = points[i];
        currentContour.push(pt);
        if (pt.lastPointOfContour) {
            contours.push(currentContour);
            currentContour = [];
        }
    }

    check.argument(currentContour.length === 0, 'There are still points left in the current contour.');
    return contours;
}

// Convert the TrueType glyph outline to a Path.
function getPath(points) {
    const p = new Path();
    if (!points) {
        return p;
    }

    const contours = getContours(points);

    for (let contourIndex = 0; contourIndex < contours.length; ++contourIndex) {
        const contour = contours[contourIndex];

        let curr = contour[contour.length - 1];
        let next = contour[0];

        if (curr.onCurve) {
            p.moveTo(curr.x, curr.y);
        } else {
            if (next.onCurve) {
                p.moveTo(next.x, next.y);
            } else {
                // If both first and last points are off-curve, start at their middle.
                const start = {x: (curr.x + next.x) * 0.5, y: (curr.y + next.y) * 0.5};
                p.moveTo(start.x, start.y);
            }
        }

        for (let i = 0; i < contour.length; ++i) {
            curr = next;
            next = contour[(i + 1) % contour.length];

            if (curr.onCurve) {
                // This is a straight line.
                p.lineTo(curr.x, curr.y);
            } else {
                let next2 = next;

                if (!next.onCurve) {
                    next2 = { x: (curr.x + next.x) * 0.5, y: (curr.y + next.y) * 0.5 };
                }

                p.quadraticCurveTo(curr.x, curr.y, next2.x, next2.y);
            }
        }

        p.closePath();
    }
    return p;
}

function buildPath(glyphs, glyph) {
    if (glyph.isComposite) {
        for (let j = 0; j < glyph.components.length; j += 1) {
            const component = glyph.components[j];
            const componentGlyph = glyphs.get(component.glyphIndex);
            // Force the ttfGlyphLoader to parse the glyph.
            componentGlyph.getPath();
            if (componentGlyph.points) {
                let transformedPoints;
                if (component.matchedPoints === undefined) {
                    // component positioned by offset
                    transformedPoints = transformPoints(componentGlyph.points, component);
                } else {
                    // component positioned by matched points
                    if ((component.matchedPoints[0] > glyph.points.length - 1) ||
                        (component.matchedPoints[1] > componentGlyph.points.length - 1)) {
                        throw Error('Matched points out of range in ' + glyph.name);
                    }
                    const firstPt = glyph.points[component.matchedPoints[0]];
                    let secondPt = componentGlyph.points[component.matchedPoints[1]];
                    const transform = {
                        xScale: component.xScale, scale01: component.scale01,
                        scale10: component.scale10, yScale: component.yScale,
                        dx: 0, dy: 0
                    };
                    secondPt = transformPoints([secondPt], transform)[0];
                    transform.dx = firstPt.x - secondPt.x;
                    transform.dy = firstPt.y - secondPt.y;
                    transformedPoints = transformPoints(componentGlyph.points, transform);
                }
                glyph.points = glyph.points.concat(transformedPoints);
            }
        }
    }

    return getPath(glyph.points);
}

function parseGlyfTableAll(data, start, loca, font) {
    const glyphs = new glyphset.GlyphSet(font);

    // The last element of the loca table is invalid.
    for (let i = 0; i < loca.length - 1; i += 1) {
        const offset = loca[i];
        const nextOffset = loca[i + 1];
        if (offset !== nextOffset) {
            glyphs.push(i, glyphset.ttfGlyphLoader(font, i, parseGlyph, data, start + offset, buildPath));
        } else {
            glyphs.push(i, glyphset.glyphLoader(font, i));
        }
    }

    return glyphs;
}

function parseGlyfTableOnLowMemory(data, start, loca, font) {
    const glyphs = new glyphset.GlyphSet(font);

    font._push = function(i) {
        const offset = loca[i];
        const nextOffset = loca[i + 1];
        if (offset !== nextOffset) {
            glyphs.push(i, glyphset.ttfGlyphLoader(font, i, parseGlyph, data, start + offset, buildPath));
        } else {
            glyphs.push(i, glyphset.glyphLoader(font, i));
        }
    };

    return glyphs;
}

// Parse all the glyphs according to the offsets from the `loca` table.
function parseGlyfTable(data, start, loca, font, opt) {
    if (opt.lowMemory)
        return parseGlyfTableOnLowMemory(data, start, loca, font);
    else
        return parseGlyfTableAll(data, start, loca, font);
}

/**
 * Encode a coordinate delta using the TrueType glyf coordinate encoding.
 * Returns { bytes: number[], flag: number }
 */
function encodeCoordinate(delta, shortBit, sameBit) {
    if (delta === 0) {
        // Same as previous value
        return { bytes: [], flag: sameBit };
    } else if (delta >= -255 && delta <= 255 && delta !== 0) {
        // Can be encoded as short (1 byte)
        if (delta > 0 && delta <= 255) {
            return { bytes: [delta], flag: shortBit | sameBit };
        } else if (delta >= -255 && delta < 0) {
            return { bytes: [-delta], flag: shortBit };
        }
    }
    // Encode as signed short (2 bytes)
    const low = delta & 0xFF;
    const high = (delta >> 8) & 0xFF;
    return { bytes: [high, low], flag: 0 };
}

/**
 * Convert a cubic bezier curve to a sequence of quadratic bezier curves.
 * Uses recursive subdivision to achieve accurate approximation.
 * 
 * @param {number} x0 - Start point x
 * @param {number} y0 - Start point y
 * @param {number} x1 - First control point x
 * @param {number} y1 - First control point y
 * @param {number} x2 - Second control point x
 * @param {number} y2 - Second control point y
 * @param {number} x3 - End point x
 * @param {number} y3 - End point y
 * @param {number} [tolerance=1] - Maximum allowed error in font units
 * @param {number} [_depth=0] - Internal: recursion depth for safety limit
 * @returns {Array} Array of quadratic segments: { cx, cy, x, y }
 */
function cubicToQuadratics(x0, y0, x1, y1, x2, y2, x3, y3, tolerance = 1, _depth = 0) {
    // Safety limit to prevent infinite recursion
    const MAX_DEPTH = 10;
    
    // Calculate the ideal single quadratic control point
    // For a cubic (p0, p1, p2, p3), the best quadratic approximation uses:
    // q = (3*(p1 + p2) - (p0 + p3)) / 4
    const qx = (3 * (x1 + x2) - (x0 + x3)) / 4;
    const qy = (3 * (y1 + y2) - (y0 + y3)) / 4;
    
    // Check error at multiple t values to catch symmetric curves
    // where error at t=0.5 might be zero but errors at t=0.25, 0.75 are large
    const tolSq = tolerance * tolerance;
    let maxErrorSq = 0;
    
    for (const t of [0.25, 0.5, 0.75]) {
        const mt = 1 - t;
        const mt2 = mt * mt;
        const mt3 = mt2 * mt;
        const t2 = t * t;
        const t3 = t2 * t;
        
        // Cubic point at t
        const cubicX = mt3 * x0 + 3 * mt2 * t * x1 + 3 * mt * t2 * x2 + t3 * x3;
        const cubicY = mt3 * y0 + 3 * mt2 * t * y1 + 3 * mt * t2 * y2 + t3 * y3;
        
        // Quadratic point at t
        const quadX = mt2 * x0 + 2 * mt * t * qx + t2 * x3;
        const quadY = mt2 * y0 + 2 * mt * t * qy + t2 * y3;
        
        const errorX = cubicX - quadX;
        const errorY = cubicY - quadY;
        const errorSq = errorX * errorX + errorY * errorY;
        maxErrorSq = Math.max(maxErrorSq, errorSq);
    }
    
    if (maxErrorSq <= tolSq || _depth >= MAX_DEPTH) {
        // Single quadratic is accurate enough, or max depth reached
        return [{ cx: qx, cy: qy, x: x3, y: y3 }];
    }
    
    // Subdivide the cubic at t=0.5 using de Casteljau's algorithm
    const mx01 = (x0 + x1) / 2, my01 = (y0 + y1) / 2;
    const mx12 = (x1 + x2) / 2, my12 = (y1 + y2) / 2;
    const mx23 = (x2 + x3) / 2, my23 = (y2 + y3) / 2;
    
    const mx012 = (mx01 + mx12) / 2, my012 = (my01 + my12) / 2;
    const mx123 = (mx12 + mx23) / 2, my123 = (my12 + my23) / 2;
    
    const mx0123 = (mx012 + mx123) / 2, my0123 = (my012 + my123) / 2;
    
    // Recursively convert both halves
    const left = cubicToQuadratics(x0, y0, mx01, my01, mx012, my012, mx0123, my0123, tolerance, _depth + 1);
    const right = cubicToQuadratics(mx0123, my0123, mx123, my123, mx23, my23, x3, y3, tolerance, _depth + 1);
    
    return left.concat(right);
}

/**
 * Convert a Path to TrueType glyph points.
 * Uses proper cubic-to-quadratic conversion for CFF fonts.
 * 
 * @param {Path} path - The path to convert
 * @param {number} [tolerance=1] - Maximum error for cubic-to-quadratic conversion
 * @returns {Object} { points: Array, contourEnds: Array }
 */
function pathToPoints(path, tolerance = 1) {
    const points = [];
    const contourEnds = [];
    let contourStart = 0;
    let contourStartPoint = null;
    let currentX = 0, currentY = 0;
    
    for (const cmd of path.commands) {
        switch (cmd.type) {
            case 'M':
                // If we already have points, end the previous contour
                if (points.length > 0 && points.length > contourStart) {
                    contourEnds.push(points.length - 1);
                    contourStart = points.length;
                }
                currentX = cmd.x;
                currentY = cmd.y;
                contourStartPoint = { x: Math.round(cmd.x), y: Math.round(cmd.y), onCurve: true };
                points.push(contourStartPoint);
                break;
            case 'L':
                currentX = cmd.x;
                currentY = cmd.y;
                points.push({ x: Math.round(cmd.x), y: Math.round(cmd.y), onCurve: true });
                break;
            case 'Q':
                // Quadratic curve: off-curve control point then on-curve end
                points.push({ x: Math.round(cmd.x1), y: Math.round(cmd.y1), onCurve: false });
                points.push({ x: Math.round(cmd.x), y: Math.round(cmd.y), onCurve: true });
                currentX = cmd.x;
                currentY = cmd.y;
                break;
            case 'C': {
                // Convert cubic to quadratic(s) using proper algorithm
                const quads = cubicToQuadratics(
                    currentX, currentY, 
                    cmd.x1, cmd.y1, 
                    cmd.x2, cmd.y2, 
                    cmd.x, cmd.y,
                    tolerance
                );
                for (const q of quads) {
                    points.push({ x: Math.round(q.cx), y: Math.round(q.cy), onCurve: false });
                    points.push({ x: Math.round(q.x), y: Math.round(q.y), onCurve: true });
                }
                currentX = cmd.x;
                currentY = cmd.y;
                break;
            }
            case 'Z':
                // End contour - TrueType contours are implicitly closed, so remove
                // the last point if it duplicates the first point of the contour
                if (points.length > contourStart && contourStartPoint) {
                    const lastPoint = points[points.length - 1];
                    if (lastPoint.x === contourStartPoint.x && 
                        lastPoint.y === contourStartPoint.y &&
                        lastPoint.onCurve === contourStartPoint.onCurve) {
                        // Remove duplicate closing point
                        points.pop();
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
    
    return { points, contourEnds };
}

/**
 * Encode a single simple glyph to TrueType glyf format.
 * @param {any} glyph - The glyph to encode
 * @returns {Uint8Array} The encoded glyph data
 */
function encodeSimpleGlyph(glyph) {
    // If the glyph has original TrueType points, use them directly for better fidelity
    if (glyph.points && glyph.points.length > 0 && glyph.numberOfContours > 0) {
        return encodeSimpleGlyphFromPoints(glyph);
    }
    
    // Otherwise, convert from path
    const path = glyph.path;
    if (!path || !path.commands || path.commands.length === 0) {
        // Empty glyph
        return new Uint8Array(0);
    }
    
    const { points, contourEnds } = pathToPoints(path);
    
    if (points.length === 0 || contourEnds.length === 0) {
        return new Uint8Array(0);
    }
    
    return encodePointsToGlyf(points, contourEnds);
}

/**
 * Encode a glyph from its original TrueType points.
 * @param {any} glyph - The glyph with original points data
 * @returns {Uint8Array} The encoded glyph data
 */
function encodeSimpleGlyphFromPoints(glyph) {
    const points = glyph.points;
    
    // Get contour ends - either from the glyph or build from point flags
    let contourEnds;
    if (glyph.contourEnds && glyph.contourEnds.length > 0) {
        // Use stored contour ends (from CFF conversion or similar)
        contourEnds = glyph.contourEnds;
    } else {
        // Build contour ends from the points' lastPointOfContour flags
        contourEnds = [];
        for (let i = 0; i < points.length; i++) {
            if (points[i].lastPointOfContour) {
                contourEnds.push(i);
            }
        }
    }
    
    // Convert points to the format expected by encodePointsToGlyf
    const encodingPoints = points.map(pt => ({
        x: pt.x,
        y: pt.y,
        onCurve: pt.onCurve
    }));
    
    return encodePointsToGlyf(encodingPoints, contourEnds, glyph.instructions);
}

/**
 * Encode points and contour ends to TrueType glyf format.
 * @param {Array} points - Array of {x, y, onCurve} objects
 * @param {Array} contourEnds - Array of contour end indices
 * @param {Array} [instructions] - Optional array of instruction bytes to include
 * @returns {Uint8Array} The encoded glyph data
 */
function encodePointsToGlyf(points, contourEnds, instructions) {
    if (points.length === 0 || contourEnds.length === 0) {
        return new Uint8Array(0);
    }
    
    const numberOfContours = contourEnds.length;
    
    // Calculate bounding box
    let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
    for (const pt of points) {
        xMin = Math.min(xMin, pt.x);
        yMin = Math.min(yMin, pt.y);
        xMax = Math.max(xMax, pt.x);
        yMax = Math.max(yMax, pt.y);
    }
    
    if (!isFinite(xMin)) {
        xMin = yMin = xMax = yMax = 0;
    }
    
    // Encode flags and coordinates
    const flags = [];
    const xCoords = [];
    const yCoords = [];
    
    let prevX = 0;
    let prevY = 0;
    
    for (let i = 0; i < points.length; i++) {
        const pt = points[i];
        const dx = pt.x - prevX;
        const dy = pt.y - prevY;
        
        let flag = pt.onCurve ? 1 : 0;
        
        // Encode X coordinate
        const xEnc = encodeCoordinate(dx, 0x02, 0x10);
        flag |= xEnc.flag;
        xCoords.push(...xEnc.bytes);
        
        // Encode Y coordinate
        const yEnc = encodeCoordinate(dy, 0x04, 0x20);
        flag |= yEnc.flag;
        yCoords.push(...yEnc.bytes);
        
        flags.push(flag);
        
        prevX = pt.x;
        prevY = pt.y;
    }
    
    // Calculate total size
    const instrBytes = instructions || [];
    const headerSize = 10;
    const endPtsSize = 2 * numberOfContours;
    const instructionSize = 2 + instrBytes.length;
    const flagsSize = flags.length;
    const totalSize = headerSize + endPtsSize + instructionSize + flagsSize + xCoords.length + yCoords.length;
    
    const data = new Uint8Array(totalSize);
    const view = new DataView(data.buffer);
    let offset = 0;
    
    // Header
    view.setInt16(offset, numberOfContours); offset += 2;
    view.setInt16(offset, xMin); offset += 2;
    view.setInt16(offset, yMin); offset += 2;
    view.setInt16(offset, xMax); offset += 2;
    view.setInt16(offset, yMax); offset += 2;
    
    // endPtsOfContours
    for (const end of contourEnds) {
        view.setUint16(offset, end); offset += 2;
    }
    
    // instructionLength and instructions
    view.setUint16(offset, instrBytes.length); offset += 2;
    for (const b of instrBytes) {
        data[offset++] = b;
    }
    
    // Flags
    for (const f of flags) {
        data[offset++] = f;
    }
    
    // X coordinates
    for (const x of xCoords) {
        data[offset++] = x;
    }
    
    // Y coordinates
    for (const y of yCoords) {
        data[offset++] = y;
    }
    
    return data;
}

/**
 * Encode a composite glyph
 * @param {any} glyph - The composite glyph to encode
 * @returns {Uint8Array} The encoded glyph data
 */
function encodeCompositeGlyph(glyph) {
    if (!glyph.components || glyph.components.length === 0) {
        return new Uint8Array(0);
    }
    
    // Calculate bounding box from components (use stored bounds if available)
    let xMin = glyph._xMin !== undefined ? glyph._xMin : 0;
    let yMin = glyph._yMin !== undefined ? glyph._yMin : 0;
    let xMax = glyph._xMax !== undefined ? glyph._xMax : 0;
    let yMax = glyph._yMax !== undefined ? glyph._yMax : 0;
    
    // Calculate the size needed
    // Header: 10 bytes (numberOfContours=-1, xMin, yMin, xMax, yMax)
    let componentDataSize = 0;
    
    for (let i = 0; i < glyph.components.length; i++) {
        const component = glyph.components[i];
        
        // flags (2 bytes) + glyphIndex (2 bytes) = 4 bytes minimum
        componentDataSize += 4;
        
        // Determine argument size (dx, dy)
        const dx = component.dx || 0;
        const dy = component.dy || 0;
        const needsWordArgs = dx < -128 || dx > 127 || dy < -128 || dy > 127;
        componentDataSize += needsWordArgs ? 4 : 2;
        
        // Determine scale format
        const xScale = component.xScale !== undefined ? component.xScale : 1;
        const yScale = component.yScale !== undefined ? component.yScale : 1;
        const scale01 = component.scale01 || 0;
        const scale10 = component.scale10 || 0;
        
        const hasMatrix = scale01 !== 0 || scale10 !== 0;
        const hasXYScale = !hasMatrix && (xScale !== 1 || yScale !== 1) && xScale !== yScale;
        const hasSimpleScale = !hasMatrix && !hasXYScale && xScale !== 1;
        
        if (hasMatrix) {
            componentDataSize += 8; // 4 x F2Dot14
        } else if (hasXYScale) {
            componentDataSize += 4; // 2 x F2Dot14
        } else if (hasSimpleScale) {
            componentDataSize += 2; // 1 x F2Dot14
        }
    }
    
    const totalSize = 10 + componentDataSize;
    const data = new Uint8Array(totalSize);
    const view = new DataView(data.buffer);
    let offset = 0;
    
    // Header
    view.setInt16(offset, -1); offset += 2; // numberOfContours = -1 for composite
    view.setInt16(offset, xMin); offset += 2;
    view.setInt16(offset, yMin); offset += 2;
    view.setInt16(offset, xMax); offset += 2;
    view.setInt16(offset, yMax); offset += 2;
    
    // Components
    for (let i = 0; i < glyph.components.length; i++) {
        const component = glyph.components[i];
        const isLast = i === glyph.components.length - 1;
        
        const dx = component.dx || 0;
        const dy = component.dy || 0;
        const needsWordArgs = dx < -128 || dx > 127 || dy < -128 || dy > 127;
        
        const xScale = component.xScale !== undefined ? component.xScale : 1;
        const yScale = component.yScale !== undefined ? component.yScale : 1;
        const scale01 = component.scale01 || 0;
        const scale10 = component.scale10 || 0;
        
        const hasMatrix = scale01 !== 0 || scale10 !== 0;
        const hasXYScale = !hasMatrix && (xScale !== 1 || yScale !== 1) && xScale !== yScale;
        const hasSimpleScale = !hasMatrix && !hasXYScale && xScale !== 1;
        
        // Build flags
        let flags = 0;
        if (needsWordArgs) flags |= 0x0001; // ARG_1_AND_2_ARE_WORDS
        flags |= 0x0002; // ARGS_ARE_XY_VALUES (always use offsets, not matched points)
        if (!isLast) flags |= 0x0020; // MORE_COMPONENTS
        if (hasSimpleScale) flags |= 0x0008; // WE_HAVE_A_SCALE
        if (hasXYScale) flags |= 0x0040; // WE_HAVE_AN_X_AND_Y_SCALE
        if (hasMatrix) flags |= 0x0080; // WE_HAVE_A_TWO_BY_TWO
        
        view.setUint16(offset, flags); offset += 2;
        view.setUint16(offset, component.glyphIndex); offset += 2;
        
        // Write dx, dy
        if (needsWordArgs) {
            view.setInt16(offset, dx); offset += 2;
            view.setInt16(offset, dy); offset += 2;
        } else {
            view.setInt8(offset, dx); offset += 1;
            view.setInt8(offset, dy); offset += 1;
        }
        
        // Write scale values
        if (hasMatrix) {
            // F2Dot14: multiply by 16384 (2^14)
            view.setInt16(offset, Math.round(xScale * 16384)); offset += 2;
            view.setInt16(offset, Math.round(scale01 * 16384)); offset += 2;
            view.setInt16(offset, Math.round(scale10 * 16384)); offset += 2;
            view.setInt16(offset, Math.round(yScale * 16384)); offset += 2;
        } else if (hasXYScale) {
            view.setInt16(offset, Math.round(xScale * 16384)); offset += 2;
            view.setInt16(offset, Math.round(yScale * 16384)); offset += 2;
        } else if (hasSimpleScale) {
            view.setInt16(offset, Math.round(xScale * 16384)); offset += 2;
        }
    }
    
    return data;
}

/**
 * Make a glyf table from a GlyphSet.
 * @param {any} glyphs - The glyphs to encode
 * @returns {Object} { glyfTable: Table, locaTable: Array }
 */
function makeGlyfTable(glyphs) {
    const glyphDataList = [];
    const offsets = [0];
    let currentOffset = 0;
    
    for (let i = 0; i < glyphs.length; i++) {
        const glyph = glyphs.get(i);
        // Force glyph loading to ensure isComposite is set (for lazy-loaded glyphs)
        if (glyph.path === undefined && typeof glyph.getPath === 'function') {
            try {
                glyph.getPath();
            } catch (e) {
                // Glyph may fail to load, but that's ok - we'll use simple encoding
            }
        }
        // Use composite encoder for composite glyphs, simple encoder otherwise
        const glyphData = glyph.isComposite 
            ? encodeCompositeGlyph(glyph) 
            : encodeSimpleGlyph(glyph);
        glyphDataList.push(glyphData);
        currentOffset += glyphData.length;
        // Pad to word boundary (2 bytes)
        if (currentOffset % 2 !== 0) {
            currentOffset += 1;
        }
        offsets.push(currentOffset);
    }
    
    // Combine all glyph data
    const totalSize = currentOffset;
    const glyfData = new Uint8Array(totalSize);
    let pos = 0;
    for (const data of glyphDataList) {
        glyfData.set(data, pos);
        pos += data.length;
        // Pad to word boundary
        if (pos % 2 !== 0) {
            pos += 1;
        }
    }
    
    return {
        glyfData,
        offsets
    };
}

export default { getPath, parse: parseGlyfTable, make: makeGlyfTable };
export { getPath, transformPoints, pathToPoints, cubicToQuadratics };
