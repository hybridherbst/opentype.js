import assert from 'assert';
import { Font, Glyph, Path, parse } from '../src/opentype.js';
import glyphset from '../src/glyphset.js';
import { readFileSync } from 'fs';
import * as util from './testutil.js';
const loadSync = (url, opt) => parse(readFileSync(url), opt);

describe('font.js', function() {
    let font;

    const fGlyph = new Glyph({name: 'f', unicode: 102, path: new Path(), advanceWidth: 1});
    const iGlyph = new Glyph({name: 'i', unicode: 105, path: new Path(), advanceWidth: 1});
    const ffGlyph = new Glyph({name: 'f_f', unicode: 0xfb01, path: new Path(), advanceWidth: 1});
    const fiGlyph = new Glyph({name: 'f_i', unicode: 0xfb02, path: new Path(), advanceWidth: 1});
    const ffiGlyph = new Glyph({name: 'f_f_i', unicode: 0xfb03, path: new Path(), advanceWidth: 1});

    const glyphs = [
        new Glyph({name: '.notdef', unicode: 0, path: new Path(), advanceWidth: 1}),
        fGlyph, iGlyph, ffGlyph, fiGlyph, ffiGlyph
    ];

    for (let index = 0; index < glyphs.length; index++) {
        const glyph = glyphs[index];
        glyph.index = index;
    }

    beforeEach(function() {
        font = new Font({
            familyName: 'MyFont',
            styleName: 'Medium',
            unitsPerEm: 1000,
            ascender: 800,
            descender: 0,
            fsSelection: 42,
            tables: {os2: {achVendID: 'TEST'}},
            glyphs: glyphs
        });
    });

    describe('Font constructor', function() {
        it('accept 0 as descender value', function() {
            assert.equal(font.descender, 0);
        });
        it('tables definition must be supported', function() {
            assert.equal(font.tables.os2.achVendID, 'TEST');
        });
        it('tables definition must blend with default tables values', function() {
            assert.equal(font.tables.os2.usWidthClass, 5);
        });
        it('tables definition can override defaults values', function() {
            assert.equal(font.tables.os2.fsSelection, 42);
        });
        it('panose has default fallback', function() {
            assert.equal(font.tables.os2.bFamilyType, 0);
            assert.equal(font.tables.os2.bSerifStyle, 0);
            assert.equal(font.tables.os2.bWeight, 0);
            assert.equal(font.tables.os2.bProportion, 0);
            assert.equal(font.tables.os2.bContrast, 0);
            assert.equal(font.tables.os2.bStrokeVariation, 0);
            assert.equal(font.tables.os2.bArmStyle, 0);
            assert.equal(font.tables.os2.bLetterform, 0);
            assert.equal(font.tables.os2.bMidline, 0);
            assert.equal(font.tables.os2.bXHeight, 0);
        });
        it('panose values are set correctly', function () {
            let panoseFont = new Font({
                familyName: 'MyFont',
                styleName: 'Medium',
                unitsPerEm: 1000,
                ascender: 800,
                descender: 0,
                panose: [0,1,2,3,4,5,6,7,8,9],
            });
            assert.equal(panoseFont.tables.os2.bFamilyType, 0);
            assert.equal(panoseFont.tables.os2.bSerifStyle, 1);
            assert.equal(panoseFont.tables.os2.bWeight, 2);
            assert.equal(panoseFont.tables.os2.bProportion, 3);
            assert.equal(panoseFont.tables.os2.bContrast, 4);
            assert.equal(panoseFont.tables.os2.bStrokeVariation, 5);
            assert.equal(panoseFont.tables.os2.bArmStyle, 6);
            assert.equal(panoseFont.tables.os2.bLetterform, 7);
            assert.equal(panoseFont.tables.os2.bMidline, 8);
            assert.equal(panoseFont.tables.os2.bXHeight, 9);
        });
        it('fsSelection and macStyle are calcluated if no fsSelection value is provided', function() {
            let weightClassFont = new Font({
                familyName: 'MyFont',
                styleName: 'Medium',
                unitsPerEm: 1000,
                ascender: 800,
                descender: 0,
                weightClass: 600,
                fsSelection: false,
            });
            assert.equal(weightClassFont.tables.os2.fsSelection, 32);
            const weightClassHeadTable = weightClassFont.toTables().tables.find(table => table.tableName === 'head');
            assert.equal(weightClassHeadTable.macStyle, font.macStyleValues.BOLD);

            let italicAngleFont = new Font({
                familyName: 'MyFont',
                styleName: 'Medium',
                unitsPerEm: 1000,
                ascender: 800,
                descender: 0,
                italicAngle: -13,
                fsSelection: false,
            });
            assert.equal(italicAngleFont.tables.os2.fsSelection, 1);
            const italicAngleHeadTable = italicAngleFont.toTables().tables.find(table => table.tableName === 'head');
            assert.equal(italicAngleHeadTable.macStyle, font.macStyleValues.ITALIC);
        });
        it('tables definition shall be serialized', function() {
            const os2 = font.toTables().tables.find(table => table.tableName === 'OS/2');
            assert.equal(os2.achVendID, 'TEST');
        });
    });

    describe('stringToGlyphIndexes', function() {
        it('must support standard ligatures', function() {
            assert.deepEqual(font.stringToGlyphIndexes('fi'), [fGlyph.index, iGlyph.index]);
            font.substitution.add('liga', { sub: [1, 1, 2], by: 5 });
            font.substitution.add('liga', { sub: [1, 1], by: 3 });
            font.substitution.add('liga', { sub: [1, 2], by: 4 });
            assert.deepEqual(font.stringToGlyphIndexes('ff'), [ffGlyph.index]);
            assert.deepEqual(font.stringToGlyphIndexes('fi'), [fiGlyph.index]);
            assert.deepEqual(font.stringToGlyphIndexes('ffi'), [ffiGlyph.index]);
            assert.deepEqual(font.stringToGlyphIndexes('fffiffif'),
                [ffGlyph.index, fiGlyph.index, ffiGlyph.index, fGlyph.index]);
        });
    });

    describe('stringToGlyphs', function() {
        it('must support standard ligatures', function() {
            assert.deepEqual(font.stringToGlyphs('fi'), [fGlyph, iGlyph]);
            font.substitution.add('liga', { sub: [1, 1, 2], by: 5 });
            font.substitution.add('liga', { sub: [1, 1], by: 3 });
            font.substitution.add('liga', { sub: [1, 2], by: 4 });
            assert.deepEqual(font.stringToGlyphs('ff'), [ffGlyph]);
            assert.deepEqual(font.stringToGlyphs('fi'), [fiGlyph]);
            assert.deepEqual(font.stringToGlyphs('ffi'), [ffiGlyph]);
            assert.deepEqual(font.stringToGlyphs('fffiffif'), [ffGlyph, fiGlyph, ffiGlyph, fGlyph]);
        });

        it('works on fonts with coverage table format 2', function() {
            const vibur = loadSync('./test/fonts/Vibur.woff');
            const glyphs = vibur.stringToGlyphs('er');
            assert.equal(glyphs.length, 1);
            assert.equal(glyphs[0].name, 'er');
        });

        it('works on fonts with coverage table format 2 on low memory mode', function() {
            const vibur = loadSync('./test/fonts/Vibur.woff', {lowMemory: true});
            const glyphs = vibur.stringToGlyphs('er');
            assert.equal(glyphs.length, 1);
            assert.equal(glyphs[0].name, 'er');
        });

    });

    describe('hasChar', function() {
        it('returns correct results for non-CMAP fonts', function() {
            assert.equal(font.hasChar('i'), true);
            assert.equal(font.hasChar('x'), false);
        });

        it('returns correct results for CMAP fonts', function() {
            const cmapFont = loadSync('./test/fonts/TestCMAP14.otf');
            assert.equal(cmapFont.hasChar('a'), false);
            assert.equal(cmapFont.hasChar('≩'), true);
        });
    });

    describe('toTables', function() {
        it('returns an sfnt font table', function() {
            const tables = font.toTables();
            assert.ok(tables);
            assert.equal(tables.tableName, 'sfnt');
        });
    });
});

describe('glyphset.js', function() {
    let font;

    const fGlyph = new Glyph({name: 'f', unicode: 102, path: new Path(), advanceWidth: 1});
    const iGlyph = new Glyph({name: 'i', unicode: 105, path: new Path(), advanceWidth: 1});
    const ffGlyph = new Glyph({name: 'f_f', unicode: 0xfb01, path: new Path(), advanceWidth: 1});
    const fiGlyph = new Glyph({name: 'f_i', unicode: 0xfb02, path: new Path(), advanceWidth: 1});
    const ffiGlyph = new Glyph({name: 'f_f_i', unicode: 0xfb03, path: new Path(), advanceWidth: 1});

    const glyphs = [
        new Glyph({name: '.notdef', unicode: 0, path: new Path(), advanceWidth: 1}),
        fGlyph, iGlyph, ffGlyph, fiGlyph, ffiGlyph
    ];

    beforeEach(function() {
        font = new Font({
            familyName: 'MyFont',
            styleName: 'Medium',
            unitsPerEm: 1000,
            ascender: 800,
            descender: 0,
            fsSelection: 42,
            tables: {os2: {achVendID: 'TEST'}},
            glyphs: glyphs
        });
    });

    describe('GlyphSet iterable', function() {
        it('must be iterable', function() {
            assert.ok(font.glyphs instanceof glyphset.GlyphSet);
            assert.equal(typeof font.glyphs[Symbol.iterator], 'function');
        });

        it('must iterate over glyphs', function() {
            for (const glyph of font.glyphs) {
                assert.ok(glyph instanceof Glyph);
            }
        });

        it('must iterate over glyphs in order', function() {
            let i = 0;
            for (const glyph of glyphs) {
                assert.equal(glyph.name, glyphs[i].name);
                i++;
            }
        });
    });

    
    describe('drawing', function() {
        const emojiFont = loadSync('./test/fonts/OpenMojiCOLRv0-subset.otf');
        
        it('draws layers', function() {
            let contextLogs = [];
            const ctx = util.createMockObject(contextLogs);
            emojiFont.getPath('🌈🔳', 0, 0, 12).draw(ctx);
            const expectedColors = [
                'rgba(234, 90, 71, 1)',
                'rgba(244, 170, 65, 1)',
                'rgba(252, 234, 43, 1)',
                'rgba(177, 204, 51, 1)',
                'rgba(146, 211, 245, 1)',
                'rgba(179, 153, 200, 1)',
                'rgba(0, 0, 0, 1)',
                'rgba(0, 0, 0, 1)',
                'rgba(0, 0, 0, 1)',
                'rgba(0, 0, 0, 1)',
                'rgba(0, 0, 0, 1)',
                'rgba(0, 0, 0, 1)',
                'rgba(0, 0, 0, 1)',
                'rgba(255, 255, 255, 1)',
                'rgba(63, 63, 63, 1)',
                'rgba(0, 0, 0, 1)',
                'rgba(0, 0, 0, 1)'
            ];
            const fillLogs = contextLogs
                .filter(log => log.property === 'fillStyle')
                .map(log => log.value);
            assert.deepEqual(fillLogs, expectedColors);
        });
    });
    
    describe('instantiate', function() {
        const vfFont = loadSync('./test/fonts/Changa-VariableFont_wght.ttf');
        
        it('should create a static font with valid glyphs', function() {
            const staticFont = vfFont.instantiate({wght: 700});
            
            // Verify glyph count matches
            assert.equal(staticFont.glyphs.length, vfFont.glyphs.length);
            
            // Verify glyphs can be accessed
            const glyph = staticFont.glyphs.get(1);
            assert.ok(glyph, 'Glyph 1 should be accessible');
            assert.ok(glyph.path, 'Glyph 1 should have a path');
            assert.ok(glyph.path.commands.length > 0, 'Glyph 1 path should have commands');
        });
        
        it('should strip variation tables', function() {
            const staticFont = vfFont.instantiate({wght: 400});
            
            assert.ok(!staticFont.tables.fvar, 'fvar should be removed');
            assert.ok(!staticFont.tables.gvar, 'gvar should be removed');
        });
        
        it('should preserve names for export', function() {
            const staticFont = vfFont.instantiate({wght: 500});
            
            assert.ok(staticFont.names, 'names should be preserved');
        });
        
        it('should preserve outlinesFormat', function() {
            const staticFont = vfFont.instantiate({wght: 600});
            
            assert.equal(staticFont.outlinesFormat, 'truetype');
        });
        
        it('should roundtrip export and import', function() {
            const staticFont = vfFont.instantiate({wght: 700});
            
            // Export to array buffer
            const buffer = staticFont.toArrayBuffer();
            assert.ok(buffer.byteLength > 0, 'Buffer should have content');
            
            // Re-parse
            const parsed = parse(buffer);
            assert.equal(parsed.numGlyphs, staticFont.glyphs.length);
            
            // Verify glyph paths are preserved
            const origGlyph = staticFont.glyphs.get(1);
            const parsedGlyph = parsed.glyphs.get(1);
            assert.ok(parsedGlyph.path, 'Parsed glyph should have path');
            assert.equal(parsedGlyph.path.commands.length, origGlyph.path.commands.length,
                'Path command count should match');
        });
        
        it('should work with CFF fonts (non-variable)', function() {
            const cffFont = loadSync('./test/fonts/FiraSansOT-Medium.otf');
            assert.equal(cffFont.outlinesFormat, 'cff');
            
            // instantiate on a non-variable CFF font should still work
            const staticFont = cffFont.instantiate({});
            
            // Verify glyph count matches
            assert.equal(staticFont.glyphs.length, cffFont.glyphs.length);
            
            // Verify glyphs have paths (not undefined)
            const glyph = staticFont.glyphs.get(4); // 'exclam' glyph
            assert.ok(glyph, 'Glyph should exist');
            assert.ok(glyph.path, 'CFF glyph should have a path after instantiate');
            assert.ok(glyph.path.commands, 'CFF glyph path should have commands');
            assert.ok(glyph.path.commands.length > 0, 'CFF glyph path should not be empty');
        });
        
        it('should export CFF instantiated font to ArrayBuffer', function() {
            const cffFont = loadSync('./test/fonts/FiraSansOT-Medium.otf');
            const staticFont = cffFont.instantiate({});
            
            // This should not throw
            const buffer = staticFont.toArrayBuffer();
            assert.ok(buffer.byteLength > 0, 'Buffer should have content');
            
            // Re-parse and verify
            const parsed = parse(buffer);
            assert.ok(parsed.glyphs.length > 0, 'Reparsed font should have glyphs');
            
            const glyph = parsed.glyphs.get(4);
            assert.ok(glyph.path, 'Reparsed CFF glyph should have path');
            assert.ok(glyph.path.commands.length > 0, 'Reparsed CFF glyph should have commands');
        });
    });
});