import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Font, Glyph, Path, VariationManager } from '../../src/opentype.mjs';

export const VALIDATOR_OUTPUT_DIR = join(process.cwd(), 'test-output', 'validators');

export function ensureValidatorOutputDir(section) {
    const outputDir = section ? join(VALIDATOR_OUTPUT_DIR, section) : VALIDATOR_OUTPUT_DIR;
    mkdirSync(outputDir, { recursive: true });
    return outputDir;
}

function rectanglePath(xMin, yMin, xMax, yMax) {
    const path = new Path();
    path.moveTo(xMin, yMin);
    path.lineTo(xMax, yMin);
    path.lineTo(xMax, yMax);
    path.lineTo(xMin, yMax);
    path.closePath();
    return path;
}

function aPath() {
    const path = new Path();
    path.moveTo(100, 0);
    path.lineTo(250, 700);
    path.lineTo(400, 0);
    path.lineTo(320, 0);
    path.lineTo(280, 180);
    path.lineTo(180, 180);
    path.lineTo(140, 0);
    path.closePath();
    return path;
}

export function createStaticValidationFont() {
    return new Font({
        familyName: 'OpenTypeJS Validator Static',
        styleName: 'Regular',
        unitsPerEm: 1000,
        ascender: 800,
        descender: -200,
        glyphs: [
            new Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: rectanglePath(50, 0, 450, 700) }),
            new Glyph({ name: 'space', unicode: 32, advanceWidth: 250, path: new Path() }),
            new Glyph({ name: 'A', unicode: 65, advanceWidth: 500, path: aPath() })
        ]
    });
}

export function createVariableValidationFont() {
    const font = new Font({
        familyName: 'OpenTypeJS Validator VF',
        styleName: 'Regular',
        unitsPerEm: 1000,
        ascender: 800,
        descender: -200,
        glyphs: [
            new Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: rectanglePath(50, 0, 450, 700) }),
            new Glyph({ name: 'space', unicode: 32, advanceWidth: 250, path: new Path() }),
            new Glyph({ name: 'A', unicode: 65, advanceWidth: 500, path: aPath() })
        ]
    });

    font.variation = new VariationManager(font);
    font.variation.addAxis({
        tag: 'wght',
        name: 'Weight',
        minValue: 100,
        defaultValue: 400,
        maxValue: 900,
        deltaGenerator: glyph => {
            if (glyph.name !== 'A') {
                return null;
            }
            return {
                deltas: [-20, 0, 20, 0, 20, 0, -20, 0, 0, 0, 0, 0, 0],
                deltasY: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                advanceWidthDelta: 50
            };
        }
    });
    font.variation.addInstance({
        name: 'Regular',
        coordinates: { wght: 400 }
    });

    return font;
}

export function writeValidationFonts(section) {
    const outputDir = ensureValidatorOutputDir(section);
    const fonts = [
        { name: 'static', font: createStaticValidationFont() },
        { name: 'variable', font: createVariableValidationFont() }
    ];

    return fonts.map(({ name, font }) => {
        const path = join(outputDir, `${name}.ttf`);
        const buffer = font.toArrayBuffer();
        writeFileSync(path, Buffer.from(buffer));
        return { name, path, byteLength: buffer.byteLength };
    });
}
