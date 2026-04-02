import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

import * as opentype from '../src/opentype.js';

const recursivePath = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    '../../opentype-editor/static/Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf'
);

const recursiveCoords = { MONO: 1, CASL: 1, wght: 1000, slnt: -15, CRSV: 1 };
const MAX_POINT_DRIFT = 2;

function getGlyphByName(font, glyphName) {
    for (let i = 0; i < font.glyphs.length; i++) {
        const glyph = font.glyphs.get(i);
        if (glyph?.name === glyphName) return glyph;
    }
    return null;
}

function getFontToolsGlyphPoints(glyphNames, coords) {
    const python = spawnSync('python3', ['-c', `
import json
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

font = TTFont(${JSON.stringify(recursivePath)})
inst = instantiateVariableFont(font, json.loads(${JSON.stringify(JSON.stringify(coords))}), inplace=False)
names = json.loads(${JSON.stringify(JSON.stringify(glyphNames))})
result = {}
for name in names:
    if name not in inst.getGlyphOrder():
        continue
    glyph = inst['glyf'][name]
    coords, endPts, flags = glyph.getCoordinates(inst['glyf'])
    points = []
    endPtSet = set(int(i) for i in endPts)
    for i, coord in enumerate(coords):
        points.append({
            'x': int(coord[0]),
            'y': int(coord[1]),
            'onCurve': bool(flags[i] & 0x01),
            'lastPointOfContour': i in endPtSet,
        })
    result[name] = points
print(json.dumps(result))
`], { encoding: 'utf8' });

    if (python.status !== 0) {
        throw new Error(`fontTools oracle failed: ${python.stderr || python.stdout}`);
    }

    return JSON.parse(python.stdout || '{}');
}

describe('variation/composite gvar regression', function() {
    this.timeout(10000);

    it('matches fontTools within tight point tolerance for Recursive problem glyphs at non-default coords', function() {
        const buffer = fs.readFileSync(recursivePath);
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        const font = opentype.parse(arrayBuffer);
        const glyphNames = ['e.italic', 'i.italic', 'j.italic', 'exclam', 'p', 'colon', 'odieresis'];
        const oraclePoints = getFontToolsGlyphPoints(glyphNames, recursiveCoords);

        for (const glyphName of glyphNames) {
            const glyph = getGlyphByName(font, glyphName);
            assert.ok(glyph, `missing glyph ${glyphName}`);
            const transformed = font.variation.getTransform(glyph, recursiveCoords);
            const oracle = oraclePoints[glyphName];
            assert.ok(oracle, `missing fontTools oracle ${glyphName}`);
            assert.equal(transformed.points.length, oracle.length, `${glyphName} point count mismatch`);
            let maxPointDrift = 0;
            for (let i = 0; i < oracle.length; i++) {
                const actual = transformed.points[i];
                const expected = oracle[i];
                assert.equal(!!actual.onCurve, !!expected.onCurve, `${glyphName} point ${i} on-curve mismatch`);
                assert.equal(!!actual.lastPointOfContour, !!expected.lastPointOfContour, `${glyphName} point ${i} contour-end mismatch`);
                const drift = Math.abs(actual.x - expected.x) + Math.abs(actual.y - expected.y);
                maxPointDrift = Math.max(maxPointDrift, drift);
            }
            assert.ok(
                maxPointDrift <= MAX_POINT_DRIFT,
                `${glyphName} point drift ${maxPointDrift} exceeds ${MAX_POINT_DRIFT}`
            );
        }
    });
});
