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
    fixAscenderForGlyphBounds,
    checkVerticalMetricsRatio,
    ensureGaspTable,
    ensureHvarTable,
    removeDuplicateInstances,
    ensureAvarTable,
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

describe('Google Fonts Profile - Additional Sanitization', function() {
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

    describe('fixAscenderForGlyphBounds', function() {
        it('should increase ascender if yMax exceeds it', function() {
            // Create a glyph with high yMax
            const path = new opentype.Path();
            path.moveTo(0, 0);
            path.lineTo(100, 1000);  // yMax = 1000, exceeds ascender of 800
            path.lineTo(200, 0);
            path.closePath();
            
            const glyph = new opentype.Glyph({
                name: 'tall',
                unicode: 65,
                advanceWidth: 500,
                path: path
            });
            
            const font = createTestFont({ glyphs: [glyph] });
            font.tables.hhea = { ascender: 800, descender: -200 };
            font.tables.os2 = { sTypoAscender: 800, sTypoDescender: -200 };
            
            const result = fixAscenderForGlyphBounds(font);
            
            assert.ok(result.adjusted, 'should have adjusted ascender');
            assert.ok(font.ascender > 1000, 'ascender should exceed yMax of 1000');
            assert.strictEqual(result.maxYMax, 1000);
        });

        it('should not adjust if ascender already exceeds yMax', function() {
            const path = new opentype.Path();
            path.moveTo(0, 0);
            path.lineTo(100, 500);  // yMax = 500, less than ascender of 800
            path.lineTo(200, 0);
            path.closePath();
            
            const glyph = new opentype.Glyph({
                name: 'short',
                unicode: 65,
                advanceWidth: 500,
                path: path
            });
            
            const font = createTestFont({ glyphs: [glyph] });
            
            const result = fixAscenderForGlyphBounds(font);
            
            assert.ok(!result.adjusted, 'should not adjust ascender');
            assert.strictEqual(result.oldAscender, result.newAscender);
        });
    });

    describe('removeDuplicateInstances', function() {
        it('should remove instances with duplicate coordinates', function() {
            const font = createTestFont();
            font.tables.fvar = {
                axes: [
                    { tag: 'wght', minValue: 100, defaultValue: 400, maxValue: 900 }
                ],
                instances: [
                    { name: { en: 'Regular' }, coordinates: { wght: 400 } },
                    { name: { en: 'Duplicate' }, coordinates: { wght: 400 } },  // Same coords!
                    { name: { en: 'Bold' }, coordinates: { wght: 700 } }
                ]
            };
            
            const removed = removeDuplicateInstances(font);
            
            assert.strictEqual(removed, 1, 'should have removed 1 duplicate');
            assert.strictEqual(font.tables.fvar.instances.length, 2, 'should have 2 instances left');
            assert.strictEqual(font.tables.fvar.instances[0].name.en, 'Regular');
            assert.strictEqual(font.tables.fvar.instances[1].name.en, 'Bold');
        });

        it('should keep all instances if no duplicates', function() {
            const font = createTestFont();
            font.tables.fvar = {
                axes: [
                    { tag: 'wght', minValue: 100, defaultValue: 400, maxValue: 900 }
                ],
                instances: [
                    { name: { en: 'Regular' }, coordinates: { wght: 400 } },
                    { name: { en: 'Bold' }, coordinates: { wght: 700 } }
                ]
            };
            
            const removed = removeDuplicateInstances(font);
            
            assert.strictEqual(removed, 0, 'should not remove any instances');
            assert.strictEqual(font.tables.fvar.instances.length, 2);
        });
    });

    describe('ensureAvarTable', function() {
        it('should create linear avar table for variable font', function() {
            const font = createTestFont();
            font.tables.fvar = {
                axes: [
                    { tag: 'wght', minValue: 100, defaultValue: 400, maxValue: 900 },
                    { tag: 'wdth', minValue: 75, defaultValue: 100, maxValue: 125 }
                ],
                instances: []
            };
            
            const created = ensureAvarTable(font);
            
            assert.ok(created, 'should create avar table');
            assert.ok(font.tables.avar, 'avar table should exist');
            assert.ok(font.tables.avar.axisSegmentMaps, 'axisSegmentMaps should exist');
            assert.strictEqual(font.tables.avar.axisSegmentMaps.length, 2, 'should have 2 axes');
            
            // Check linear mapping for first axis (wght)
            const wghtMap = font.tables.avar.axisSegmentMaps[0].axisValueMaps;
            assert.strictEqual(wghtMap.length, 3, 'should have 3 mapping points');
            assert.strictEqual(wghtMap[0].fromCoordinate, -1);
            assert.strictEqual(wghtMap[0].toCoordinate, -1);
            assert.strictEqual(wghtMap[1].fromCoordinate, 0);
            assert.strictEqual(wghtMap[1].toCoordinate, 0);
            assert.strictEqual(wghtMap[2].fromCoordinate, 1);
            assert.strictEqual(wghtMap[2].toCoordinate, 1);
        });

        it('should not modify existing avar table', function() {
            const font = createTestFont();
            font.tables.fvar = {
                axes: [{ tag: 'wght', minValue: 100, defaultValue: 400, maxValue: 900 }],
                instances: []
            };
            font.tables.avar = {
                axisSegmentMaps: [{
                    axisValueMaps: [
                        { fromCoordinate: -1, toCoordinate: -0.5 },
                        { fromCoordinate: 0, toCoordinate: 0 },
                        { fromCoordinate: 1, toCoordinate: 0.5 }
                    ]
                }]
            };
            
            const created = ensureAvarTable(font);
            
            assert.ok(created, 'should return true for existing avar');
            // Check the custom mapping is preserved
            assert.strictEqual(font.tables.avar.axisSegmentMaps[0].axisValueMaps[0].toCoordinate, -0.5);
        });

        it('should return false for non-variable fonts', function() {
            const font = createTestFont();
            
            const created = ensureAvarTable(font);
            
            assert.ok(!created, 'should return false');
            assert.ok(!font.tables.avar, 'avar should not be created');
        });
    });

    describe('sanitizeFontForGoogleFonts - Full Integration', function() {
        it('should apply all Google Fonts fixes including new ones', function() {
            const path = new opentype.Path();
            path.moveTo(0, 0);
            path.lineTo(100, 1000);
            path.lineTo(200, 0);
            path.closePath();
            
            const glyph = new opentype.Glyph({
                name: 'A',
                unicode: 65,
                advanceWidth: 500,
                path: path
            });
            
            const font = createTestFont({ glyphs: [glyph], ascender: 800 });
            font.tables = {
                ltag: { tags: ['en'] },
                hhea: { ascender: 800, descender: -200, lineGap: 100 },
                os2: { sTypoAscender: 700, sTypoDescender: -150, sTypoLineGap: 200 },
                head: { fontRevision: 0 },
                fvar: {
                    axes: [{ tag: 'wght', minValue: 100, defaultValue: 400, maxValue: 900 }],
                    instances: [
                        { name: { en: 'Regular' }, coordinates: { wght: 400 } },
                        { name: { en: 'Also Regular' }, coordinates: { wght: 400 } }  // Duplicate!
                    ]
                }
            };
            font.names.windows.version = { en: 'Version 1.000' };
            
            sanitizeFontForGoogleFonts(font);
            
            // Base sanitization
            assert.ok(!font.tables.ltag, 'ltag should be removed');
            assert.ok(!font.names.macintosh, 'macintosh names should be removed');
            
            // Google Fonts specific - lineGap
            assert.strictEqual(font.tables.os2.sTypoLineGap, 0, 'sTypoLineGap should be 0');
            assert.strictEqual(font.tables.hhea.lineGap, 0, 'hhea lineGap should be 0');
            
            // Google Fonts specific - gasp
            assert.ok(font.tables.gasp, 'gasp table should exist');
            
            // Google Fonts specific - duplicate instances
            assert.strictEqual(font.tables.fvar.instances.length, 1, 'duplicate instances should be removed');
            
            // Google Fonts specific - avar table
            assert.ok(font.tables.avar, 'avar table should be created for variable fonts');
            
            // Google Fonts specific - ascender should exceed yMax
            assert.ok(font.ascender > 1000, 'ascender should be adjusted to exceed glyph yMax');
        });
    });
});

describe('Font Export - Additional Fixes', function() {
    it('should set OS/2 xAvgCharWidth correctly (average of non-zero widths)', function() {
        const glyphs = [
            new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: new opentype.Path() }),
            new opentype.Glyph({ name: 'space', unicode: 32, advanceWidth: 0, path: new opentype.Path() }), // zero width
            new opentype.Glyph({ name: 'A', unicode: 65, advanceWidth: 600, path: new opentype.Path() }),
            new opentype.Glyph({ name: 'B', unicode: 66, advanceWidth: 700, path: new opentype.Path() }),
            new opentype.Glyph({ name: 'C', unicode: 67, advanceWidth: 800, path: new opentype.Path() })
        ];
        
        const font = new opentype.Font({
            familyName: 'Test',
            styleName: 'Regular',
            unitsPerEm: 1000,
            ascender: 800,
            descender: -200,
            glyphs: glyphs
        });
        
        const buffer = font.toArrayBuffer();
        const parsed = opentype.parse(buffer);
        
        // xAvgCharWidth should be average of non-zero width glyphs (excluding .notdef)
        // Non-zero widths: 600, 700, 800 = average 700
        // Note: space (0) is excluded from average
        assert.strictEqual(parsed.tables.os2.xAvgCharWidth, 700, 
            'xAvgCharWidth should be average of non-zero width glyphs');
    });

    it('should set head.fontRevision from name table version correctly', function() {
        const font = new opentype.Font({
            familyName: 'Test',
            styleName: 'Regular',
            unitsPerEm: 1000,
            ascender: 800,
            descender: -200,
            glyphs: []
        });
        
        // Set version to 3.001
        font.names.windows.version = { en: 'Version 3.001' };
        font.names.unicode.version = { en: 'Version 3.001' };
        
        const buffer = font.toArrayBuffer();
        const parsed = opentype.parse(buffer);
        
        // fontRevision should be 3.001 (with some tolerance for fixed-point conversion)
        assert.ok(Math.abs(parsed.tables.head.fontRevision - 3.001) < 0.001,
            `fontRevision should be ~3.001, got ${parsed.tables.head.fontRevision}`);
    });

    it('should default fsType to 0x0004 (Print & Preview) for new fonts', function() {
        const font = new opentype.Font({
            familyName: 'Test',
            styleName: 'Regular',
            unitsPerEm: 1000,
            ascender: 800,
            descender: -200,
            glyphs: []
        });
        
        const buffer = font.toArrayBuffer();
        const parsed = opentype.parse(buffer);
        
        // Default fsType should be 0x0004 (Print & Preview) for new fonts
        assert.strictEqual(parsed.tables.os2.fsType, 4,
            'fsType should default to Print & Preview (bit 4)');
    });

    it('should add description (nameID 10) if missing', function() {
        const font = new opentype.Font({
            familyName: 'Test Font',
            styleName: 'Regular',
            unitsPerEm: 1000,
            ascender: 800,
            descender: -200,
            glyphs: []
        });
        
        const buffer = font.toArrayBuffer();
        const parsed = opentype.parse(buffer);
        
        // description should be auto-generated
        assert.ok(parsed.names.windows.description, 'description should exist');
        assert.strictEqual(parsed.names.windows.description.en, 'Test Font font',
            'description should be based on family name');
    });

    it('should add variationsPostScriptNamePrefix (nameID 25) for variable fonts', function() {
        const font = new opentype.Font({
            familyName: 'Test VF',
            styleName: 'Regular',
            unitsPerEm: 1000,
            ascender: 800,
            descender: -200,
            glyphs: [
                new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: new opentype.Path() })
            ]
        });
        
        // Make it a variable font
        font.variation = new opentype.VariationManager(font);
        font.variation.addAxis({
            tag: 'wght',
            name: 'Weight',
            minValue: 100,
            defaultValue: 400,
            maxValue: 900,
            deltaGenerator: () => null
        });
        font.variation.addInstance({ name: 'Regular', coordinates: { wght: 400 } });
        
        const buffer = font.toArrayBuffer();
        const parsed = opentype.parse(buffer);
        
        // variationsPostScriptNamePrefix should be auto-generated for VF
        assert.ok(parsed.names.windows.variationsPostScriptNamePrefix, 
            'variationsPostScriptNamePrefix should exist for VF');
    });
});

describe('Variable Font STAT Table', function() {
    it('should add STAT axis values when adding instances', function() {
        const font = new opentype.Font({
            familyName: 'Test VF',
            styleName: 'Regular',
            unitsPerEm: 1000,
            ascender: 800,
            descender: -200,
            glyphs: [
                new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: new opentype.Path() })
            ]
        });
        
        font.variation = new opentype.VariationManager(font);
        font.variation.addAxis({
            tag: 'wght',
            name: 'Weight',
            minValue: 100,
            defaultValue: 400,
            maxValue: 900,
            deltaGenerator: () => null
        });
        
        // Add instances at different coordinates
        font.variation.addInstance({ name: 'Regular', coordinates: { wght: 400 } });
        font.variation.addInstance({ name: 'Bold', coordinates: { wght: 700 } });
        
        // Check STAT values were created
        assert.ok(font.tables.stat, 'STAT table should exist');
        assert.ok(font.tables.stat.values, 'STAT values should exist');
        
        // Should have values for wght=400 and wght=700
        const values400 = font.tables.stat.values.filter(v => v.value === 400);
        const values700 = font.tables.stat.values.filter(v => v.value === 700);
        
        assert.ok(values400.length > 0, 'Should have STAT value for wght=400');
        assert.ok(values700.length > 0, 'Should have STAT value for wght=700');
    });
});
