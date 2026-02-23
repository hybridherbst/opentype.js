import assert from 'assert';
import { unhex, unhexArray } from '../testutil.js';
import gpos from '../../src/tables/gpos.js';

// Helper that builds a minimal GPOS table to test a lookup subtable.
function parseLookup(lookupType, subTableData) {
    const data = unhex('00010000 000A 000C 000E' +   // header
        '0000' +                                        // ScriptTable - 0 scripts
        '0000' +                                        // FeatureListTable - 0 features
        '0001 0004' +                                   // LookupListTable - 1 lookup table
        '000' + lookupType + '0000 0001 0008' +         // Lookup table - 1 subtable
        subTableData);                                  // sub table start offset: 0x1a
    return gpos.parse(data).lookups[0].subtables[0];
}

// Helper that builds a GPOS table from a lookup subtable and returns encoded subtable bytes.
function makeLookup(lookupType, data) {
    return gpos.make({
        version: 1,
        scripts: [],
        features: [],
        lookups: [{
            lookupType: lookupType,
            lookupFlag: 0,
            subtables: [data]
        }]
    }).encode().slice(0x1a);                             // sub table start offset: 0x1a
}

describe('tables/gpos.js', function() {
    //// Header ///////////////////////////////////////////////////////////////
    it('can parse a GPOS header', function() {
        const data = unhex(
            '00010000 000A 000C 000E' +     // header
            '0000' +                        // ScriptTable - 0 scripts
            '0000' +                        // FeatureListTable - 0 features
            '0000'                          // LookupListTable - 0 lookups
        );
        assert.deepEqual(gpos.parse(data), { version: 1, scripts: [], features: [], lookups: [] });
    });

    it('can parse a GPOS header with null pointers', function() {
        const data = unhex(
            '00010000 0000 0000 0000'
        );
        assert.deepEqual(gpos.parse(data), { version: 1, scripts: [], features: [], lookups: [] });
    });

    //// Lookup type 1 ////////////////////////////////////////////////////////
    it('can parse lookup1 SinglePosFormat1', function() {
        // https://docs.microsoft.com/en-us/typography/opentype/spec/gpos#example-2-singleposformat1-subtable
        const data = '0001 0008 0002   FFB0 0002 0001   01B3 01BC 0000';
        assert.deepEqual(parseLookup(1, data), {
            posFormat: 1,
            coverage: {
                format: 2,
                ranges: [{ start: 0x1b3, end: 0x1bc, index: 0 }]
            },
            value: { yPlacement: -80 }
        });
    });

    it('can parse lookup1 SinglePosFormat1 with ValueFormat Table and ValueRecord', function() {
        // https://docs.microsoft.com/fr-fr/typography/opentype/spec/gpos#example-14-valueformat-table-and-valuerecord
        const data = '0001 000E 0099   0050 00D2 0018 0020   0002 0001 00C8 00D1 0000   000B 000F 0001 5540   000B 000F 0001 5540';
        assert.deepEqual(parseLookup(1, data), {
            posFormat: 1,
            coverage: {
                format: 2,
                ranges: [{ start: 0xc8, end: 0xd1, index: 0 }]
            },
            value: {
                xPlacement: 80,             // 0x50
                yAdvance: 210,              // 0xd2
                xPlaDeviceOffset: 24,       // 0x18
                xPlaDevice: {
                    type: 'device',
                    startSize: 11,          // 0x0B
                    endSize: 15,            // 0x0F
                    deltaFormat: 1,         // 0x0001 - PPEM sizes only
                    deltaValues: [1, 1, 1, 1, 1]  // 5 values for sizes 11-15
                },
                yAdvDeviceOffset: 32,       // 0x20
                yAdvDevice: {
                    type: 'device',
                    startSize: 11,          // 0x0B
                    endSize: 15,            // 0x0F
                    deltaFormat: 1,         // 0x0001 - PPEM sizes only
                    deltaValues: [1, 1, 1, 1, 1]  // 5 values for sizes 11-15
                }
            }
        });
    });

    it('can parse lookup1 SinglePosFormat2', function() {
        // https://docs.microsoft.com/en-us/typography/opentype/spec/gpos#example-3-singleposformat2-subtable
        const data = '0002 0014 0005 0003   0032 0032   0019 0019  000A 000A   0001 0003 004F 0125 0129';
        assert.deepEqual(parseLookup(1, data), {
            posFormat: 2,
            coverage: {
                format: 1,
                glyphs: [0x4f, 0x125, 0x129]
            },
            values: [
                { xPlacement: 50, xAdvance: 50 },
                { xPlacement: 25, xAdvance: 25 },
                { xPlacement: 10, xAdvance: 10 }
            ]
        });
    });

    //// Lookup type 2 ////////////////////////////////////////////////////////
    it('can parse lookup2 PairPosFormat1', function() {
        // https://docs.microsoft.com/en-us/typography/opentype/spec/gpos#example-4-pairposformat1-subtable
        const data = '0001 001E 0004 0001 0002 000E 0016   0001 0059 FFE2 FFEC 0001 0059 FFD8 FFE7   0001 0002 002D 0031';
        assert.deepEqual(parseLookup(2, data), {
            posFormat: 1,
            coverage: {
                format: 1,
                glyphs: [0x2d, 0x31]
            },
            valueFormat1: 4,
            valueFormat2: 1,
            pairSets: [
                [{ secondGlyph: 0x59, value1: { xAdvance: -30 }, value2: { xPlacement: -20 } }],
                [{ secondGlyph: 0x59, value1: { xAdvance: -40 }, value2: { xPlacement: -25 } }]
            ]
        });
    });

    it('can parse lookup2 PairPosFormat2', function() {
        // https://docs.microsoft.com/en-us/typography/opentype/spec/gpos#example-5-pairposformat2-subtable
        const data = '0002 0018 0004 0000 0022 0032 0002 0002 0000 0000 0000 FFCE   0001 0003 0046 0047 0049   0002 0002 0046 0047 0001 0049 0049 0001   0002 0001 006A 006B 0001';
        assert.deepEqual(parseLookup(2, data), {
            posFormat: 2,
            coverage: {
                format: 1,
                glyphs: [0x46, 0x47, 0x49]
            },
            valueFormat1: 4,
            valueFormat2: 0,
            classDef1: {
                format: 2,
                ranges: [
                    { start: 0x46, end: 0x47, classId: 1 },
                    { start: 0x49, end: 0x49, classId: 1 }
                ]
            },
            classDef2: {
                format: 2,
                ranges: [
                    { start: 0x6a, end: 0x6b, classId: 1 }
                ]
            },
            class1Count: 2,
            class2Count: 2,
            classRecords: [
                [
                    { value1: { xAdvance: 0 }, value2: undefined },
                    { value1: { xAdvance: 0 }, value2: undefined }
                ],
                [
                    { value1: { xAdvance: 0 }, value2: undefined },
                    { value1: { xAdvance: -50 }, value2: undefined }
                ]
            ]
        });
    });

    //// Write: Lookup type 1 /////////////////////////////////////////////////
    // https://docs.microsoft.com/en-us/typography/opentype/spec/gpos#lookup-type-1-single-adjustment-positioning-subtable

    it('can write lookup1 SinglePosFormat1', function() {
        // Format 1: single value record applied to all glyphs in coverage
        // Example: yPlacement = -80 for glyphs 0x1b3..0x1bc (coverage format 2 range)
        // Expected binary layout:
        //   posFormat(1) coverageOffset(8+2=0x000A) valueFormat(0x0002=yPlacement)
        //   yPlacement(-80=0xFFB0)
        //   CoverageFormat2: format(2) rangeCount(1) start(0x1B3) end(0x1BC) startCoverageIndex(0)
        const subtable = {
            posFormat: 1,
            coverage: {
                format: 2,
                ranges: [{ start: 0x1b3, end: 0x1bc, index: 0 }]
            },
            value: { yPlacement: -80 }
        };
        const expectedData = unhexArray(
            '0001' +       // posFormat = 1
            '0008' +       // coverageOffset (relative to subtable start)
            '0002' +       // valueFormat = 0x0002 (yPlacement)
            'FFB0' +       // yPlacement = -80 (signed)
            '0002 0001' +  // Coverage: format=2, rangeCount=1
            '01B3 01BC 0000'  // range: start=0x1B3, end=0x1BC, index=0
        );
        assert.deepEqual(makeLookup(1, subtable), expectedData);
    });

    it('can write lookup1 SinglePosFormat1 with xPlacement and xAdvance', function() {
        // Format 1 with both xPlacement and xAdvance
        const subtable = {
            posFormat: 1,
            coverage: {
                format: 1,
                glyphs: [0x4f, 0x125]
            },
            value: { xPlacement: 50, xAdvance: -20 }
        };
        const expectedData = unhexArray(
            '0001' +       // posFormat = 1
            '000A' +       // coverageOffset
            '0005' +       // valueFormat = 0x0005 (xPlacement|xAdvance)
            '0032' +       // xPlacement = 50
            'FFEC' +       // xAdvance = -20
            '0001 0002' +  // Coverage: format=1, glyphCount=2
            '004F 0125'    // glyphs
        );
        assert.deepEqual(makeLookup(1, subtable), expectedData);
    });

    it('can write lookup1 SinglePosFormat2', function() {
        // https://docs.microsoft.com/en-us/typography/opentype/spec/gpos#example-3-singleposformat2-subtable
        // Format 2: per-glyph value records
        // 3 glyphs with xPlacement+xAdvance values
        const subtable = {
            posFormat: 2,
            coverage: {
                format: 1,
                glyphs: [0x4f, 0x125, 0x129]
            },
            values: [
                { xPlacement: 50, xAdvance: 50 },
                { xPlacement: 25, xAdvance: 25 },
                { xPlacement: 10, xAdvance: 10 }
            ]
        };
        const expectedData = unhexArray(
            '0002' +       // posFormat = 2
            '0014' +       // coverageOffset
            '0005' +       // valueFormat = 0x0005 (xPlacement|xAdvance)
            '0003' +       // valueCount = 3
            '0032 0032' +  // value[0]: xPlacement=50, xAdvance=50
            '0019 0019' +  // value[1]: xPlacement=25, xAdvance=25
            '000A 000A' +  // value[2]: xPlacement=10, xAdvance=10
            '0001 0003' +  // Coverage: format=1, glyphCount=3
            '004F 0125 0129' // glyphs
        );
        assert.deepEqual(makeLookup(1, subtable), expectedData);
    });

    it('can roundtrip lookup1 SinglePosFormat1', function() {
        // Parse → make → compare
        const hexData = '0001 0008 0002   FFB0 0002 0001   01B3 01BC 0000';
        const parsed = parseLookup(1, hexData);
        const encoded = makeLookup(1, parsed);
        const reparsed = parseLookup(1, Array.from(encoded).map(b => b.toString(16).padStart(2, '0')).join(' '));
        assert.deepEqual(reparsed, parsed);
    });

    it('can roundtrip lookup1 SinglePosFormat2', function() {
        const hexData = '0002 0014 0005 0003   0032 0032   0019 0019  000A 000A   0001 0003 004F 0125 0129';
        const parsed = parseLookup(1, hexData);
        const encoded = makeLookup(1, parsed);
        const reparsed = parseLookup(1, Array.from(encoded).map(b => b.toString(16).padStart(2, '0')).join(' '));
        assert.deepEqual(reparsed, parsed);
    });

    //// Write: Lookup type 2 /////////////////////////////////////////////////
    // https://docs.microsoft.com/en-us/typography/opentype/spec/gpos#lookup-type-2-pair-adjustment-positioning-subtable

    it('can write lookup2 PairPosFormat1', function() {
        // https://docs.microsoft.com/en-us/typography/opentype/spec/gpos#example-4-pairposformat1-subtable
        // 2 first glyphs (0x2d, 0x31), each paired with glyph 0x59
        // value1=xAdvance, value2=xPlacement
        // TABLE encoder places subtables in field order: coverage first, then pairSets
        const subtable = {
            posFormat: 1,
            coverage: {
                format: 1,
                glyphs: [0x2d, 0x31]
            },
            valueFormat1: 4,   // xAdvance
            valueFormat2: 1,   // xPlacement
            pairSets: [
                [{ secondGlyph: 0x59, value1: { xAdvance: -30 }, value2: { xPlacement: -20 } }],
                [{ secondGlyph: 0x59, value1: { xAdvance: -40 }, value2: { xPlacement: -25 } }]
            ]
        };
        const expectedData = unhexArray(
            '0001' +           // posFormat = 1
            '000E' +           // coverageOffset = 14 (header = 7 USHORTs = 14 bytes)
            '0004' +           // valueFormat1 = 4 (xAdvance)
            '0001' +           // valueFormat2 = 1 (xPlacement)
            '0002' +           // pairSetCount = 2
            '0016' +           // pairSetOffset[0] = 22 (14 + 8 bytes of coverage)
            '001E' +           // pairSetOffset[1] = 30
            // Coverage (Format 1) — placed first by TABLE encoder
            '0001 0002' +      // format=1, glyphCount=2
            '002D 0031' +      // glyphs 0x2d, 0x31
            // PairSet[0]: 1 pair
            '0001' +           // pairValueCount = 1
            '0059' +           // secondGlyph = 0x59
            'FFE2' +           // value1.xAdvance = -30
            'FFEC' +           // value2.xPlacement = -20
            // PairSet[1]: 1 pair
            '0001' +           // pairValueCount = 1
            '0059' +           // secondGlyph = 0x59
            'FFD8' +           // value1.xAdvance = -40
            'FFE7'             // value2.xPlacement = -25
        );
        assert.deepEqual(makeLookup(2, subtable), expectedData);
    });

    it('can write lookup2 PairPosFormat2', function() {
        // https://docs.microsoft.com/en-us/typography/opentype/spec/gpos#example-5-pairposformat2-subtable
        // Class-based pair adjustments: 2 classes x 2 classes, valueFormat1=xAdvance only
        const subtable = {
            posFormat: 2,
            coverage: {
                format: 1,
                glyphs: [0x46, 0x47, 0x49]
            },
            valueFormat1: 4,   // xAdvance
            valueFormat2: 0,
            classDef1: {
                format: 2,
                ranges: [
                    { start: 0x46, end: 0x47, classId: 1 },
                    { start: 0x49, end: 0x49, classId: 1 }
                ]
            },
            classDef2: {
                format: 2,
                ranges: [
                    { start: 0x6a, end: 0x6b, classId: 1 }
                ]
            },
            class1Count: 2,
            class2Count: 2,
            classRecords: [
                [
                    { value1: { xAdvance: 0 } },
                    { value1: { xAdvance: 0 } }
                ],
                [
                    { value1: { xAdvance: 0 } },
                    { value1: { xAdvance: -50 } }
                ]
            ]
        };
        const expectedData = unhexArray(
            '0002' +           // posFormat = 2
            '0018' +           // coverageOffset
            '0004' +           // valueFormat1 = 4 (xAdvance)
            '0000' +           // valueFormat2 = 0
            '0022' +           // classDef1Offset
            '0032' +           // classDef2Offset
            '0002' +           // class1Count = 2
            '0002' +           // class2Count = 2
            // Class1Record[0]: class1=0 (default)
            '0000' +           // class2=0: xAdvance=0
            '0000' +           // class2=1: xAdvance=0
            // Class1Record[1]: class1=1
            '0000' +           // class2=0: xAdvance=0
            'FFCE' +           // class2=1: xAdvance=-50
            // Coverage (Format 1)
            '0001 0003' +      // format=1, glyphCount=3
            '0046 0047 0049' + // glyphs
            // ClassDef1 (Format 2)
            '0002 0002' +      // format=2, classRangeCount=2
            '0046 0047 0001' + // range: 0x46-0x47 → class 1
            '0049 0049 0001' + // range: 0x49-0x49 → class 1
            // ClassDef2 (Format 2)
            '0002 0001' +      // format=2, classRangeCount=1
            '006A 006B 0001'   // range: 0x6a-0x6b → class 1
        );
        assert.deepEqual(makeLookup(2, subtable), expectedData);
    });

    it('can roundtrip lookup2 PairPosFormat1', function() {
        const hexData = '0001 001E 0004 0001 0002 000E 0016   0001 0059 FFE2 FFEC 0001 0059 FFD8 FFE7   0001 0002 002D 0031';
        const parsed = parseLookup(2, hexData);
        const encoded = makeLookup(2, parsed);
        const reparsed = parseLookup(2, Array.from(encoded).map(b => b.toString(16).padStart(2, '0')).join(' '));
        assert.deepEqual(reparsed, parsed);
    });

    it('can roundtrip lookup2 PairPosFormat2', function() {
        const hexData = '0002 0018 0004 0000 0022 0032 0002 0002 0000 0000 0000 FFCE   0001 0003 0046 0047 0049   0002 0002 0046 0047 0001 0049 0049 0001   0002 0001 006A 006B 0001';
        const parsed = parseLookup(2, hexData);
        const encoded = makeLookup(2, parsed);
        const reparsed = parseLookup(2, Array.from(encoded).map(b => b.toString(16).padStart(2, '0')).join(' '));
        assert.deepEqual(reparsed, parsed);
    });

    //// Write: Lookup type 4 /////////////////////////////////////////////////
    // https://docs.microsoft.com/en-us/typography/opentype/spec/gpos#lookup-type-4-mark-to-base-attachment-positioning-subtable

    it('can write lookup4 MarkToBase', function() {
        // Simple mark-to-base: 1 mark class, 1 mark glyph (0x300), 1 base glyph (0x41)
        // Mark anchor at (200, 700), base anchor at (250, 600)
        const subtable = {
            posFormat: 1,
            markCoverage: { format: 1, glyphs: [0x300] },
            baseCoverage: { format: 1, glyphs: [0x41] },
            markClassCount: 1,
            markArray: [
                { markClass: 0, markAnchor: { format: 1, xCoordinate: 200, yCoordinate: 700 } }
            ],
            baseArray: [
                [{ format: 1, xCoordinate: 250, yCoordinate: 600 }]
            ]
        };
        const encoded = makeLookup(4, subtable);

        // Verify by re-parsing the encoded bytes
        const reparsed = parseLookup(4, Array.from(encoded).map(b => b.toString(16).padStart(2, '0')).join(' '));
        assert.equal(reparsed.posFormat, 1);
        assert.equal(reparsed.markClassCount, 1);
        assert.deepEqual(reparsed.markCoverage, { format: 1, glyphs: [0x300] });
        assert.deepEqual(reparsed.baseCoverage, { format: 1, glyphs: [0x41] });
        assert.equal(reparsed.markArray.length, 1);
        assert.equal(reparsed.markArray[0].markClass, 0);
        assert.equal(reparsed.markArray[0].markAnchor.xCoordinate, 200);
        assert.equal(reparsed.markArray[0].markAnchor.yCoordinate, 700);
        assert.equal(reparsed.baseArray.length, 1);
        assert.equal(reparsed.baseArray[0][0].xCoordinate, 250);
        assert.equal(reparsed.baseArray[0][0].yCoordinate, 600);
    });

    it('can write lookup4 MarkToBase with multiple classes', function() {
        // 2 mark classes, 2 marks, 2 bases
        // Simulates typical accented Latin: class 0 = above marks, class 1 = below marks
        const subtable = {
            posFormat: 1,
            markCoverage: { format: 1, glyphs: [0x300, 0x327] },  // combining grave, combining cedilla
            baseCoverage: { format: 1, glyphs: [0x41, 0x45] },     // A, E
            markClassCount: 2,
            markArray: [
                { markClass: 0, markAnchor: { format: 1, xCoordinate: 0, yCoordinate: 700 } },   // grave → class 0 (above)
                { markClass: 1, markAnchor: { format: 1, xCoordinate: 0, yCoordinate: 0 } }      // cedilla → class 1 (below)
            ],
            baseArray: [
                // Base A: anchor for class 0 (above) and class 1 (below)
                [
                    { format: 1, xCoordinate: 250, yCoordinate: 700 },  // above
                    { format: 1, xCoordinate: 250, yCoordinate: -100 }  // below
                ],
                // Base E: anchor for class 0 (above) and class 1 (below)
                [
                    { format: 1, xCoordinate: 220, yCoordinate: 680 },  // above
                    { format: 1, xCoordinate: 220, yCoordinate: -90 }   // below
                ]
            ]
        };
        const encoded = makeLookup(4, subtable);

        const reparsed = parseLookup(4, Array.from(encoded).map(b => b.toString(16).padStart(2, '0')).join(' '));
        assert.equal(reparsed.markClassCount, 2);
        assert.equal(reparsed.markArray.length, 2);
        assert.equal(reparsed.markArray[0].markClass, 0);
        assert.equal(reparsed.markArray[1].markClass, 1);
        assert.equal(reparsed.baseArray.length, 2);
        // Base[0], class 0 anchor (above A)
        assert.equal(reparsed.baseArray[0][0].xCoordinate, 250);
        assert.equal(reparsed.baseArray[0][0].yCoordinate, 700);
        // Base[0], class 1 anchor (below A)
        assert.equal(reparsed.baseArray[0][1].xCoordinate, 250);
        assert.equal(reparsed.baseArray[0][1].yCoordinate, -100);
        // Base[1], class 0 anchor (above E)
        assert.equal(reparsed.baseArray[1][0].xCoordinate, 220);
        assert.equal(reparsed.baseArray[1][0].yCoordinate, 680);
    });

    it('can write lookup4 MarkToBase with null base anchors', function() {
        // Some base glyphs may not have anchors for all mark classes (null anchor)
        const subtable = {
            posFormat: 1,
            markCoverage: { format: 1, glyphs: [0x300] },
            baseCoverage: { format: 1, glyphs: [0x41, 0x42] },
            markClassCount: 1,
            markArray: [
                { markClass: 0, markAnchor: { format: 1, xCoordinate: 100, yCoordinate: 500 } }
            ],
            baseArray: [
                [{ format: 1, xCoordinate: 200, yCoordinate: 600 }],   // A has anchor
                [null]                                                    // B has null anchor for class 0
            ]
        };
        const encoded = makeLookup(4, subtable);

        const reparsed = parseLookup(4, Array.from(encoded).map(b => b.toString(16).padStart(2, '0')).join(' '));
        assert.equal(reparsed.baseArray.length, 2);
        // Base[0] has valid anchor
        assert.equal(reparsed.baseArray[0][0].xCoordinate, 200);
        // Base[1] has null anchor (offset 0 → no anchor)
        assert.equal(reparsed.baseArray[1][0], null);
    });

    //// Write: Lookup type 6 /////////////////////////////////////////////////
    // https://docs.microsoft.com/en-us/typography/opentype/spec/gpos#lookup-type-6-mark-to-mark-attachment-positioning-subtable

    it('can write lookup6 MarkToMark', function() {
        // Simple mark-to-mark: a combining diaeresis (0x308) stacked above a combining acute (0x301)
        // Mark1 = 0x308, Mark2 = 0x301
        const subtable = {
            posFormat: 1,
            mark1Coverage: { format: 1, glyphs: [0x308] },
            mark2Coverage: { format: 1, glyphs: [0x301] },
            markClassCount: 1,
            mark1Array: [
                { markClass: 0, markAnchor: { format: 1, xCoordinate: 0, yCoordinate: 0 } }
            ],
            mark2Array: [
                [{ format: 1, xCoordinate: 0, yCoordinate: 400 }]  // attach above the acute
            ]
        };
        const encoded = makeLookup(6, subtable);

        const reparsed = parseLookup(6, Array.from(encoded).map(b => b.toString(16).padStart(2, '0')).join(' '));
        assert.equal(reparsed.posFormat, 1);
        assert.equal(reparsed.markClassCount, 1);
        assert.deepEqual(reparsed.mark1Coverage, { format: 1, glyphs: [0x308] });
        assert.deepEqual(reparsed.mark2Coverage, { format: 1, glyphs: [0x301] });
        assert.equal(reparsed.mark1Array.length, 1);
        assert.equal(reparsed.mark1Array[0].markClass, 0);
        assert.equal(reparsed.mark1Array[0].markAnchor.xCoordinate, 0);
        assert.equal(reparsed.mark1Array[0].markAnchor.yCoordinate, 0);
        assert.equal(reparsed.mark2Array.length, 1);
        assert.equal(reparsed.mark2Array[0][0].xCoordinate, 0);
        assert.equal(reparsed.mark2Array[0][0].yCoordinate, 400);
    });

    it('can write lookup6 MarkToMark with multiple classes', function() {
        // 2 mark classes on mark1, 2 mark2 glyphs, each with 2 class anchors
        const subtable = {
            posFormat: 1,
            mark1Coverage: { format: 1, glyphs: [0x308, 0x323] },  // diaeresis (above), dot below
            mark2Coverage: { format: 1, glyphs: [0x301, 0x302] },  // acute, circumflex
            markClassCount: 2,
            mark1Array: [
                { markClass: 0, markAnchor: { format: 1, xCoordinate: 0, yCoordinate: 0 } },     // diaeresis → class 0
                { markClass: 1, markAnchor: { format: 1, xCoordinate: 0, yCoordinate: -200 } }   // dot below → class 1
            ],
            mark2Array: [
                // mark2[0] = acute: anchor for class 0 (above), class 1 (below)
                [
                    { format: 1, xCoordinate: 0, yCoordinate: 350 },
                    { format: 1, xCoordinate: 0, yCoordinate: -150 }
                ],
                // mark2[1] = circumflex: anchor for class 0 (above), class 1 (below)
                [
                    { format: 1, xCoordinate: 0, yCoordinate: 380 },
                    { format: 1, xCoordinate: 0, yCoordinate: -120 }
                ]
            ]
        };
        const encoded = makeLookup(6, subtable);

        const reparsed = parseLookup(6, Array.from(encoded).map(b => b.toString(16).padStart(2, '0')).join(' '));
        assert.equal(reparsed.markClassCount, 2);
        assert.equal(reparsed.mark1Array.length, 2);
        assert.equal(reparsed.mark1Array[0].markClass, 0);
        assert.equal(reparsed.mark1Array[1].markClass, 1);
        assert.equal(reparsed.mark1Array[1].markAnchor.yCoordinate, -200);
        assert.equal(reparsed.mark2Array.length, 2);
        assert.equal(reparsed.mark2Array[0][0].yCoordinate, 350);
        assert.equal(reparsed.mark2Array[0][1].yCoordinate, -150);
        assert.equal(reparsed.mark2Array[1][0].yCoordinate, 380);
        assert.equal(reparsed.mark2Array[1][1].yCoordinate, -120);
    });

    //// Write: Lookup type 9 /////////////////////////////////////////////////
    // https://docs.microsoft.com/en-us/typography/opentype/spec/gpos#lookup-type-9-extension-positioning-subtable

    it('can write lookup9 Extension wrapping type 1', function() {
        // Extension around a SinglePosFormat1
        const subtable = {
            posFormat: 1,
            extensionLookupType: 1,
            extensionSubtable: {
                posFormat: 1,
                coverage: { format: 1, glyphs: [0x4f] },
                value: { xAdvance: 100 }
            }
        };
        const encoded = makeLookup(9, subtable);

        // Extension header: posFormat(2) + extensionLookupType(2) + extensionOffset(4) = 8 bytes
        // Byte 0-1: posFormat = 1
        assert.equal((encoded[0] << 8) | encoded[1], 1);
        // Byte 2-3: extensionLookupType = 1
        assert.equal((encoded[2] << 8) | encoded[3], 1);
        // Byte 4-7: extensionOffset = 8 (ULONG, inner subtable follows immediately)
        assert.equal((encoded[4] << 24) | (encoded[5] << 16) | (encoded[6] << 8) | encoded[7], 8);
        // Byte 8 onward: inner type 1 subtable
        // posFormat = 1 at offset 8
        assert.equal((encoded[8] << 8) | encoded[9], 1);
    });

    it('can write lookup9 Extension wrapping type 2', function() {
        // Extension around PairPosFormat1
        const subtable = {
            posFormat: 1,
            extensionLookupType: 2,
            extensionSubtable: {
                posFormat: 1,
                coverage: { format: 1, glyphs: [0x2d] },
                valueFormat1: 4,   // xAdvance
                valueFormat2: 0,
                pairSets: [
                    [{ secondGlyph: 0x59, value1: { xAdvance: -30 } }]
                ]
            }
        };
        const encoded = makeLookup(9, subtable);

        // Verify extension header
        assert.equal((encoded[0] << 8) | encoded[1], 1);   // posFormat
        assert.equal((encoded[2] << 8) | encoded[3], 2);   // extensionLookupType = 2
        assert.equal((encoded[4] << 24) | (encoded[5] << 16) | (encoded[6] << 8) | encoded[7], 8);

        // Verify inner subtable parses correctly by re-parsing the raw extension bytes
        // The inner subtable starts at offset 8 within the extension
        const innerBytes = encoded.slice(8);
        assert.equal((innerBytes[0] << 8) | innerBytes[1], 1);  // posFormat = 1 (PairPosFormat1)
    });

    it('can roundtrip lookup9 Extension wrapping type 4 MarkToBase', function() {
        // This is the critical case: Extension positioning wrapping mark-to-base
        // which can exceed 64KB without extension
        const inner = {
            posFormat: 1,
            markCoverage: { format: 1, glyphs: [0x300, 0x301] },
            baseCoverage: { format: 1, glyphs: [0x41, 0x42, 0x43] },
            markClassCount: 1,
            markArray: [
                { markClass: 0, markAnchor: { format: 1, xCoordinate: 100, yCoordinate: 500 } },
                { markClass: 0, markAnchor: { format: 1, xCoordinate: 120, yCoordinate: 520 } }
            ],
            baseArray: [
                [{ format: 1, xCoordinate: 250, yCoordinate: 600 }],
                [{ format: 1, xCoordinate: 230, yCoordinate: 580 }],
                [{ format: 1, xCoordinate: 210, yCoordinate: 560 }]
            ]
        };
        const subtable = {
            posFormat: 1,
            extensionLookupType: 4,
            extensionSubtable: inner
        };
        const encoded = makeLookup(9, subtable);

        // Verify extension header
        assert.equal((encoded[0] << 8) | encoded[1], 1);     // posFormat
        assert.equal((encoded[2] << 8) | encoded[3], 4);     // extensionLookupType = 4
        assert.equal((encoded[4] << 24) | (encoded[5] << 16) | (encoded[6] << 8) | encoded[7], 8);

        // Inner subtable starts at offset 8 — verify mark-to-base posFormat
        assert.equal((encoded[8] << 8) | encoded[9], 1);     // posFormat = 1
    });

    //// Full table roundtrip //////////////////////////////////////////////////

    it('can make a complete GPOS table and re-parse it', function() {
        const gposData = {
            version: 1,
            scripts: [],
            features: [],
            lookups: [{
                lookupType: 2,
                lookupFlag: 0,
                subtables: [{
                    posFormat: 1,
                    coverage: { format: 1, glyphs: [0x2d] },
                    valueFormat1: 4,
                    valueFormat2: 0,
                    pairSets: [
                        [{ secondGlyph: 0x59, value1: { xAdvance: -30 } }]
                    ]
                }]
            }]
        };
        const encoded = gpos.make(gposData).encode();
        const data = new DataView(new Uint8Array(encoded).buffer);
        const reparsed = gpos.parse(data);

        assert.equal(reparsed.version, 1);
        assert.equal(reparsed.lookups.length, 1);
        assert.equal(reparsed.lookups[0].lookupType, 2);
        const st = reparsed.lookups[0].subtables[0];
        assert.equal(st.posFormat, 1);
        assert.equal(st.pairSets[0][0].secondGlyph, 0x59);
        assert.equal(st.pairSets[0][0].value1.xAdvance, -30);
    });

    it('can make a GPOS table with multiple lookup types', function() {
        const gposData = {
            version: 1,
            scripts: [],
            features: [],
            lookups: [
                {
                    lookupType: 1,
                    lookupFlag: 0,
                    subtables: [{
                        posFormat: 1,
                        coverage: { format: 1, glyphs: [0x41] },
                        value: { yPlacement: -50 }
                    }]
                },
                {
                    lookupType: 2,
                    lookupFlag: 0,
                    subtables: [{
                        posFormat: 1,
                        coverage: { format: 1, glyphs: [0x42] },
                        valueFormat1: 4,
                        valueFormat2: 0,
                        pairSets: [
                            [{ secondGlyph: 0x43, value1: { xAdvance: -25 } }]
                        ]
                    }]
                }
            ]
        };
        const encoded = gpos.make(gposData).encode();
        const data = new DataView(new Uint8Array(encoded).buffer);
        const reparsed = gpos.parse(data);

        assert.equal(reparsed.lookups.length, 2);
        assert.equal(reparsed.lookups[0].lookupType, 1);
        assert.equal(reparsed.lookups[0].subtables[0].value.yPlacement, -50);
        assert.equal(reparsed.lookups[1].lookupType, 2);
        assert.equal(reparsed.lookups[1].subtables[0].pairSets[0][0].value1.xAdvance, -25);
    });
});
