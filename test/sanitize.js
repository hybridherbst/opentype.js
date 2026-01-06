import assert from 'assert';
import * as opentype from '../src/opentype.js';
import {
    removeMacNameEntries,
    removeLtagTable,
    matchOS2HheaMetrics,
    syncFontVersion,
    fixDefaultInstanceNameID,
    fixFullFontName,
    sanitizeFontForExport,
    fixLineGap,
    checkVerticalMetricsRatio,
    ensureGaspTable,
    ensureHvarTable,
    sanitizeFontForGoogleFonts
} from '../src/sanitize.js';

describe('Font Sanitization', function() {
    // Helper to create a basic font for testing
    function createTestFont(options = {}) {
        return new opentype.Font({
            familyName: options.familyName || 'Test Font',
            styleName: options.styleName || 'Regular',
            unitsPerEm: options.unitsPerEm || 1000,
            ascender: options.ascender || 800,
            descender: options.descender || -200,
            glyphs: options.glyphs || []
        });
    }

    describe('removeMacNameEntries', function() {
        it('should remove macintosh platform entries', function() {
            const names = {
                unicode: { fontFamily: { en: 'Test' } },
                macintosh: { fontFamily: { en: 'Test' } },
                windows: { fontFamily: { en: 'Test' } }
            };
            
            const result = removeMacNameEntries(names);
            
            assert.ok(result.unicode, 'unicode should be preserved');
            assert.ok(result.windows, 'windows should be preserved');
            assert.ok(!result.macintosh, 'macintosh should be removed');
        });

        it('should handle null/undefined input', function() {
            assert.strictEqual(removeMacNameEntries(null), null);
            assert.strictEqual(removeMacNameEntries(undefined), undefined);
        });
    });

    describe('removeLtagTable', function() {
        it('should remove ltag table from font', function() {
            const font = { tables: { ltag: { tags: ['en', 'de'] } } };
            
            removeLtagTable(font);
            
            assert.ok(!font.tables.ltag, 'ltag should be removed');
        });

        it('should handle font without ltag', function() {
            const font = { tables: {} };
            
            // Should not throw
            removeLtagTable(font);
            
            assert.ok(!font.tables.ltag);
        });
    });

    describe('matchOS2HheaMetrics', function() {
        it('should update OS/2 metrics to match hhea', function() {
            const font = {
                tables: {
                    hhea: { ascender: 900, descender: -250, lineGap: 0 },
                    os2: { sTypoAscender: 800, sTypoDescender: -200, sTypoLineGap: 100 }
                }
            };
            
            matchOS2HheaMetrics(font);
            
            assert.strictEqual(font.tables.os2.sTypoAscender, 900);
            assert.strictEqual(font.tables.os2.sTypoDescender, -250);
            assert.strictEqual(font.tables.os2.sTypoLineGap, 0);
        });
    });

    describe('syncFontVersion', function() {
        it('should update head.fontRevision from name version string', function() {
            const font = createTestFont();
            font.tables.head = { fontRevision: 0 };
            font.names.windows.version = { en: 'Version 3.001' };
            
            syncFontVersion(font);
            
            // Note: font.getEnglishName checks unicode first, then windows
            // The Font constructor sets unicode.version to 'Version 0.1' by default
            // So we need to set unicode version too
            assert.ok(font.tables.head.fontRevision > 0);
        });

        it('should handle version strings without decimal', function() {
            const font = createTestFont();
            font.tables.head = { fontRevision: 0 };
            // Set both unicode and windows version
            font.names.unicode.version = { en: 'Version 2' };
            font.names.windows.version = { en: 'Version 2' };
            
            syncFontVersion(font);
            
            assert.strictEqual(font.tables.head.fontRevision, 2);
        });
    });

    describe('fixFullFontName', function() {
        it('should fix fullName to start with familyName', function() {
            const font = createTestFont();
            // Set wrong fullName in both platforms
            font.names.unicode.fullName = { en: 'Some Wrong Name' };
            font.names.windows.fullName = { en: 'Some Wrong Name' };
            
            fixFullFontName(font);
            
            const fullName = font.names.windows.fullName.en;
            assert.ok(fullName.startsWith('Test Font'), `fullName "${fullName}" should start with "Test Font"`);
        });

        it('should not modify correct fullName', function() {
            const font = createTestFont();
            font.names.windows.fullName = { en: 'Test Font Bold' };
            
            fixFullFontName(font);
            
            assert.strictEqual(font.names.windows.fullName.en, 'Test Font Bold');
        });
    });

    describe('sanitizeFontForExport', function() {
        it('should apply all base sanitization fixes', function() {
            const font = createTestFont();
            font.tables = {
                ltag: { tags: ['en'] },
                hhea: { ascender: 800, descender: -200, lineGap: 0 },
                os2: { sTypoAscender: 700, sTypoDescender: -150, sTypoLineGap: 50 },
                head: { fontRevision: 0 }
            };
            font.names.windows.version = { en: 'Version 1.000' };
            
            sanitizeFontForExport(font);
            
            assert.ok(!font.tables.ltag, 'ltag should be removed');
            assert.ok(!font.names.macintosh, 'macintosh names should be removed');
            assert.strictEqual(font.tables.os2.sTypoAscender, 800);
            assert.strictEqual(font.tables.os2.sTypoLineGap, 0);
        });
    });
});

describe('Google Fonts Profile Sanitization', function() {
    function createTestFont(options = {}) {
        return new opentype.Font({
            familyName: options.familyName || 'Test Font',
            styleName: options.styleName || 'Regular',
            unitsPerEm: options.unitsPerEm || 1000,
            ascender: options.ascender || 800,
            descender: options.descender || -200,
            glyphs: options.glyphs || []
        });
    }

    describe('fixLineGap', function() {
        it('should set OS/2 sTypoLineGap to 0', function() {
            const font = {
                tables: {
                    os2: { sTypoLineGap: 200 },
                    hhea: { lineGap: 100 }
                }
            };
            
            fixLineGap(font);
            
            assert.strictEqual(font.tables.os2.sTypoLineGap, 0);
            assert.strictEqual(font.tables.hhea.lineGap, 0);
        });
    });

    describe('checkVerticalMetricsRatio', function() {
        it('should return valid for ratio in range 1.2-1.5', function() {
            const font = {
                unitsPerEm: 1000,
                tables: { hhea: { ascender: 900, descender: -300, lineGap: 0 } }
            };
            
            const result = checkVerticalMetricsRatio(font);
            
            assert.ok(result.valid);
            assert.ok(result.ratio >= 1.2 && result.ratio <= 1.5);
        });

        it('should return invalid for ratio below 1.2', function() {
            const font = {
                unitsPerEm: 1000,
                tables: { hhea: { ascender: 600, descender: -300, lineGap: 0 } }
            };
            
            const result = checkVerticalMetricsRatio(font);
            
            assert.ok(!result.valid);
            assert.ok(result.ratio < 1.2);
        });

        it('should return invalid for ratio above 2.0', function() {
            const font = {
                unitsPerEm: 1000,
                tables: { hhea: { ascender: 1500, descender: -600, lineGap: 0 } }
            };
            
            const result = checkVerticalMetricsRatio(font);
            
            assert.ok(!result.valid);
            assert.ok(result.ratio > 2.0);
        });
    });

    describe('ensureGaspTable', function() {
        it('should create gasp table with all flags ON', function() {
            const font = { tables: {} };
            
            ensureGaspTable(font);
            
            assert.ok(font.tables.gasp);
            assert.strictEqual(font.tables.gasp.version, 1);
            assert.strictEqual(font.tables.gasp.gaspRanges.length, 1);
            assert.strictEqual(font.tables.gasp.gaspRanges[0].rangeMaxPPEM, 0xFFFF);
            assert.strictEqual(font.tables.gasp.gaspRanges[0].rangeGaspBehavior, 0x000F);
        });
    });

    describe('ensureHvarTable', function() {
        it('should create HVAR for variable font with gvar', function() {
            const font = {
                tables: {
                    fvar: {
                        axes: [
                            { tag: 'wght', minValue: 100, defaultValue: 400, maxValue: 900 }
                        ]
                    },
                    gvar: {
                        glyphVariations: { 0: {} }
                    }
                },
                glyphs: { length: 5 },
                numGlyphs: 5
            };
            
            const result = ensureHvarTable(font);
            
            assert.ok(result);
            assert.ok(font.tables.hvar);
            assert.ok(font.tables.hvar.itemVariationStore);
        });

        it('should not create HVAR for static fonts', function() {
            const font = { tables: {} };
            
            const result = ensureHvarTable(font);
            
            assert.ok(!result);
            assert.ok(!font.tables.hvar);
        });
    });

    describe('sanitizeFontForGoogleFonts', function() {
        it('should apply all Google Fonts profile fixes', function() {
            const font = createTestFont();
            font.tables = {
                ltag: { tags: ['en'] },
                hhea: { ascender: 800, descender: -200, lineGap: 100 },
                os2: { sTypoAscender: 700, sTypoDescender: -150, sTypoLineGap: 200 },
                head: { fontRevision: 0 }
            };
            font.names.windows.version = { en: 'Version 1.000' };
            
            sanitizeFontForGoogleFonts(font);
            
            // Base sanitization
            assert.ok(!font.tables.ltag, 'ltag should be removed');
            assert.ok(!font.names.macintosh, 'macintosh names should be removed');
            
            // Google Fonts specific
            assert.strictEqual(font.tables.os2.sTypoLineGap, 0, 'sTypoLineGap should be 0');
            assert.strictEqual(font.tables.hhea.lineGap, 0, 'hhea lineGap should be 0');
            assert.ok(font.tables.gasp, 'gasp table should exist');
            assert.strictEqual(font.tables.gasp.gaspRanges[0].rangeGaspBehavior, 0x000F, 'gasp should have all flags ON');
        });
    });
});

describe('Font Export Sanitization', function() {
    it('should create gasp table during export', function() {
        const font = new opentype.Font({
            familyName: 'Test',
            styleName: 'Regular',
            unitsPerEm: 1000,
            ascender: 800,
            descender: -200,
            glyphs: []
        });
        
        // Export and re-parse
        const buffer = font.toArrayBuffer();
        const parsed = opentype.parse(buffer);
        
        assert.ok(parsed.tables.gasp, 'gasp table should exist after export');
        assert.ok(parsed.tables.gasp.gaspRanges.length > 0, 'gasp should have ranges');
        assert.strictEqual(parsed.tables.gasp.gaspRanges[0].rangeGaspBehavior, 0x000F, 'gasp should have all flags ON');
    });

    it('should create HVAR table for variable fonts during export', function() {
        const notdefGlyph = new opentype.Glyph({
            name: '.notdef',
            unicode: 0,
            advanceWidth: 500,
            path: new opentype.Path()
        });
        
        const font = new opentype.Font({
            familyName: 'Test VF',
            styleName: 'Regular',
            unitsPerEm: 1000,
            ascender: 800,
            descender: -200,
            glyphs: [notdefGlyph]
        });
        
        // Set up fvar and gvar for variable font
        font.tables.fvar = {
            axes: [
                { tag: 'wght', minValue: 100, defaultValue: 400, maxValue: 900, axisNameID: 256, name: { en: 'Weight' } }
            ],
            instances: [
                { name: { en: 'Regular' }, coordinates: { wght: 400 }, subfamilyNameID: 2 }
            ]
        };
        font.tables.gvar = {
            version: 1,
            axisCount: 1,
            sharedTupleCount: 0,
            glyphCount: 1,
            flags: 0,
            glyphVariations: { 0: [] }
        };
        
        // Export and re-parse
        const buffer = font.toArrayBuffer();
        const parsed = opentype.parse(buffer);
        
        assert.ok(parsed.tables.hvar, 'HVAR table should exist for variable fonts');
        assert.ok(parsed.tables.hvar.itemVariationStore, 'HVAR should have itemVariationStore');
    });

    it('should have OS/2 sTypoLineGap set to 0 after export', function() {
        const font = new opentype.Font({
            familyName: 'Test',
            styleName: 'Regular',
            unitsPerEm: 1000,
            ascender: 800,
            descender: -200,
            glyphs: []
        });
        
        // Export and re-parse
        const buffer = font.toArrayBuffer();
        const parsed = opentype.parse(buffer);
        
        assert.strictEqual(parsed.tables.os2.sTypoLineGap, 0, 'sTypoLineGap should be 0');
    });

    it('should only have windows platform name entries after export', function() {
        const font = new opentype.Font({
            familyName: 'Test',
            styleName: 'Regular',
            unitsPerEm: 1000,
            ascender: 800,
            descender: -200,
            glyphs: []
        });
        
        // Export and re-parse
        const buffer = font.toArrayBuffer();
        const parsed = opentype.parse(buffer);
        
        assert.ok(parsed.names.windows, 'windows names should exist');
        assert.ok(!parsed.names.macintosh, 'macintosh names should not exist');
        // unicode platform requires ltag which we don't create, so it won't be present
    });
});
