import assert from 'assert';
import { Font, Glyph, Path, parse } from '../src/opentype.mjs';
import { countHintingDefinitions } from '../src/tables/maxp.mjs';

describe('maxp hinting limits', function() {
    const build = (tables = {}, instructions) => {
        const notdef = new Glyph({ name: '.notdef', advanceWidth: 500, path: new Path() });
        const path = new Path(); path.moveTo(0, 0); path.lineTo(0, 100); path.lineTo(100, 0); path.close();
        const a = new Glyph({ name: 'a', unicode: 97, advanceWidth: 500, path });
        if (instructions) a.instructions = instructions;
        const font = new Font({ familyName: 'Hinted', styleName: 'Regular', unitsPerEm: 1000, ascender: 800, descender: -200, glyphs: [notdef, a] });
        font.outlinesFormat = 'truetype';
        Object.assign(font.tables, tables);
        return parse(font.toArrayBuffer()).tables.maxp;
    };

    it('counts the functions a font program defines, following its pushes', function() {
        // PUSHB[2] 0 7, FDEF … ENDF, FDEF … ENDF: functions 7 and 0 → 8 slots.
        const fpgm = [0xB1, 0, 7, 0x2C, 0xB0, 5, 0x2D, 0x2C, 0x2D];
        assert.deepEqual(countHintingDefinitions(fpgm), { functionDefs: 8, instructionDefs: 0 });
        // An instruction outside a body makes the numbers unknown: each FDEF counts one.
        assert.deepEqual(countHintingDefinitions([0xB0, 3, 0x20, 0x2C, 0x2D, 0x2C, 0x2D, 0xB0, 0x91, 0x89, 0x2D]).instructionDefs, 1);
    });

    it('writes the font limits, never below what its programs need', function() {
        const maxp = build({
            fpgm: [0xB1, 0, 9, 0x2C, 0x2D, 0x2C, 0x2D],
            maxp: { maxZones: 2, maxTwilightPoints: 16, maxStorage: 47, maxFunctionDefs: 4, maxInstructionDefs: 0, maxStackElements: 512, maxSizeOfInstructions: 3 },
        }, [0xB0, 1, 0x2B, 0xB0, 1, 0x2B]);
        assert.equal(maxp.maxFunctionDefs, 10, 'function 9 needs ten slots');
        assert.equal(maxp.maxSizeOfInstructions, 6, 'the longest glyph program');
        assert.deepEqual([maxp.maxZones, maxp.maxTwilightPoints, maxp.maxStorage, maxp.maxStackElements], [2, 16, 47, 512]);
    });

    it('keeps a parsed font limits when written again', function() {
        const first = build({ maxp: { maxStackElements: 300, maxStorage: 12 } });
        assert.deepEqual([first.maxStackElements, first.maxStorage], [300, 12]);
    });
});
