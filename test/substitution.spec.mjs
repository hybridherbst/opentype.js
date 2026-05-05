import assert from 'assert';
import { Font, Glyph, Path, parse } from '../src/opentype.mjs';
import Substitution from '../src/substitution.mjs';

describe('substitution.js', function() {
    let font;
    let substitution;
    const notdefGlyph = new Glyph({
        name: '.notdef',
        unicode: 0,
        advanceWidth: 500,
        path: new Path()
    });

    const glyphs = [notdefGlyph].concat('abcdefghijklmnopqrstuvwxyz'.split('').map(function (c) {
        return new Glyph({
            name: c,
            unicode: c.charCodeAt(0),
            advanceWidth: 500,
            path: new Path()
        });
    }));

    const defaultScriptList = [{
        tag: 'DFLT',
        script: {
            defaultLangSys: {reserved: 0, reqFeatureIndex: 0xffff, featureIndexes: [0]},
            langSysRecords: []
        }
    }];

    beforeEach(function() {
        font = new Font({
            familyName: 'MyFont',
            styleName: 'Medium',
            unitsPerEm: 1000,
            ascender: 800,
            descender: -200,
            glyphs: glyphs
        });
        substitution = new Substitution(font);
    });

    describe('createDefaultTable', function() {
        it('must return an empty default GSUB table', function() {
            assert.deepEqual(substitution.createDefaultTable(), {
                version: 1,
                scripts: [{
                    tag: 'DFLT',
                    script: {
                        defaultLangSys: { reserved: 0, reqFeatureIndex: 0xffff, featureIndexes: [] },
                        langSysRecords: []
                    }
                }],
                features: [],
                lookups: []
            });
        });
    });

    describe('add', function() {
        it('can add single substitutions (lookup type 1 format 2)', function() {
            substitution.add('salt', { sub: 4, by: 10 });
            substitution.add('salt', { sub: 5, by: 11 });
            assert.deepEqual(font.tables.gsub.scripts, defaultScriptList);
            assert.deepEqual(font.tables.gsub.features, [{
                tag: 'salt',
                feature: { featureParams: 0, lookupListIndexes: [0] }
            }]);
            assert.deepEqual(font.tables.gsub.lookups, [{
                lookupFlag: 0,
                lookupType: 1,
                markFilteringSet: undefined,
                subtables: [{
                    substFormat: 2,
                    coverage: { format: 1, glyphs: [4, 5] },
                    substitute: [10, 11]
                }]
            }]);
        });

        it('can add multiple substitutions (lookup type 2)', function() {
            substitution.add('ccmp', { sub: 4, by: [5, 6, 7] });
            substitution.add('ccmp', { sub: 8, by: [9, 10] });
            assert.deepEqual(font.tables.gsub.scripts, defaultScriptList);
            assert.deepEqual(font.tables.gsub.features, [{
                tag: 'ccmp',
                feature: { featureParams: 0, lookupListIndexes: [0] }
            }]);
            assert.deepEqual(font.tables.gsub.lookups, [{
                lookupFlag: 0,
                lookupType: 2,
                markFilteringSet: undefined,
                subtables: [{
                    substFormat: 1,
                    coverage: { format: 1, glyphs: [4, 8] },
                    sequences: [[5, 6, 7], [9, 10]]
                }]
            }]);
        });

        it('can add alternate substitutions (lookup type 3)', function() {
            substitution.add('aalt', { sub: 4, by: [5, 6, 7] });
            substitution.add('aalt', { sub: 8, by: [9, 10] });
            assert.deepEqual(font.tables.gsub.scripts, defaultScriptList);
            assert.deepEqual(font.tables.gsub.features, [{
                tag: 'aalt',
                feature: { featureParams: 0, lookupListIndexes: [0] }
            }]);
            assert.deepEqual(font.tables.gsub.lookups, [{
                lookupFlag: 0,
                lookupType: 3,
                markFilteringSet: undefined,
                subtables: [{
                    substFormat: 1,
                    coverage: { format: 1, glyphs: [4, 8] },
                    alternateSets: [[5, 6, 7], [9, 10]]
                }]
            }]);
        });

        it('can add ligatures (lookup type 4)', function() {
            substitution.add('liga', { sub: [4, 5], by: 17 });
            substitution.add('liga', { sub: [4, 6], by: 18 });
            substitution.add('liga', { sub: [8, 1, 2], by: 19 });
            assert.deepEqual(font.tables.gsub.scripts, defaultScriptList);
            assert.deepEqual(font.tables.gsub.features, [{
                tag: 'liga',
                feature: { featureParams: 0, lookupListIndexes: [0] }
            }]);
            assert.deepEqual(font.tables.gsub.lookups, [{
                lookupFlag: 0,
                lookupType: 4,
                markFilteringSet: undefined,
                subtables: [{
                    substFormat: 1,
                    coverage: { format: 1, glyphs: [4, 8] },
                    ligatureSets: [
                        [{ ligGlyph: 17, components: [5] }, { ligGlyph: 18, components: [6] }],
                        [{ ligGlyph: 19, components: [1, 2] }]
                    ]
                }]
            }]);
        });

        it('can add chaining context substitutions (lookup type 6)', function() {
            // Simple case: substitute 'a' (glyph 1) with glyph 27 when followed by 'b' (glyph 2)
            substitution.add('calt', {
                backtrack: [],
                input: [1],
                lookahead: [2],
                substitution: { sequenceIndex: 0, sub: 1, by: 27 }
            });
            
            assert.deepEqual(font.tables.gsub.scripts, defaultScriptList);
            assert.deepEqual(font.tables.gsub.features, [{
                tag: 'calt',
                feature: { featureParams: 0, lookupListIndexes: [1] }
            }]);
            
            // Should have 2 lookups: single sub (type 1) and chaining (type 6)
            assert.equal(font.tables.gsub.lookups.length, 2);
            
            // First lookup should be single substitution
            assert.equal(font.tables.gsub.lookups[0].lookupType, 1);
            assert.deepEqual(font.tables.gsub.lookups[0].subtables[0].coverage.glyphs, [1]);
            assert.deepEqual(font.tables.gsub.lookups[0].subtables[0].substitute, [27]);
            
            // Second lookup should be chaining context
            assert.equal(font.tables.gsub.lookups[1].lookupType, 6);
            const chainSubtable = font.tables.gsub.lookups[1].subtables[0];
            assert.equal(chainSubtable.substFormat, 3);
            assert.deepEqual(chainSubtable.backtrackCoverage, []);
            assert.equal(chainSubtable.inputCoverage.length, 1);
            assert.deepEqual(chainSubtable.inputCoverage[0].glyphs, [1]);
            assert.equal(chainSubtable.lookaheadCoverage.length, 1);
            assert.deepEqual(chainSubtable.lookaheadCoverage[0].glyphs, [2]);
        });

        it('can add chaining context with backtrack', function() {
            // Substitute 'b' (glyph 2) with glyph 28 when preceded by 'a' (glyph 1)
            substitution.add('calt', {
                backtrack: [1],
                input: [2],
                lookahead: [],
                substitution: { sequenceIndex: 0, sub: 2, by: 28 }
            });
            
            const chainSubtable = font.tables.gsub.lookups[1].subtables[0];
            assert.equal(chainSubtable.backtrackCoverage.length, 1);
            assert.deepEqual(chainSubtable.backtrackCoverage[0].glyphs, [1]);
            assert.deepEqual(chainSubtable.inputCoverage[0].glyphs, [2]);
            assert.deepEqual(chainSubtable.lookaheadCoverage, []);
        });

        it('can add chaining context with multi-glyph backtrack and lookahead', function() {
            // Complex rule: substitute 'c' with glyph 29 when 'ab' precedes and 'de' follows
            // backtrack: 'a' 'b', lookahead: 'd' 'e'
            substitution.add('calt', {
                backtrack: [1, 2],  // 'a', 'b' (in visual order)
                input: [3],         // 'c'
                lookahead: [4, 5],  // 'd', 'e'
                substitution: { sequenceIndex: 0, sub: 3, by: 29 }
            });
            
            const chainSubtable = font.tables.gsub.lookups[1].subtables[0];
            
            // Backtrack is stored in reverse order (closest to input first)
            assert.equal(chainSubtable.backtrackCoverage.length, 2);
            assert.deepEqual(chainSubtable.backtrackCoverage[0].glyphs, [2]); // 'b' (closest)
            assert.deepEqual(chainSubtable.backtrackCoverage[1].glyphs, [1]); // 'a'
            
            // Input
            assert.equal(chainSubtable.inputCoverage.length, 1);
            assert.deepEqual(chainSubtable.inputCoverage[0].glyphs, [3]);
            
            // Lookahead
            assert.equal(chainSubtable.lookaheadCoverage.length, 2);
            assert.deepEqual(chainSubtable.lookaheadCoverage[0].glyphs, [4]); // 'd'
            assert.deepEqual(chainSubtable.lookaheadCoverage[1].glyphs, [5]); // 'e'
        });

        it('can add chaining context with multi-glyph input', function() {
            // Substitute 'ab' sequence contextually: 'a' -> 30, 'b' -> 31 when followed by 'c'
            substitution.add('calt', {
                backtrack: [],
                input: [1, 2],  // 'a', 'b'
                lookahead: [3], // 'c'
                substitution: [
                    { sequenceIndex: 0, sub: 1, by: 30 },
                    { sequenceIndex: 1, sub: 2, by: 31 }
                ]
            });
            
            // Single sub lookup should have both mappings
            const singleSubtable = font.tables.gsub.lookups[0].subtables[0];
            assert.deepEqual(singleSubtable.coverage.glyphs, [1, 2]);
            assert.deepEqual(singleSubtable.substitute, [30, 31]);
            
            // Chain lookup should have 2 input coverages
            const chainSubtable = font.tables.gsub.lookups[1].subtables[0];
            assert.equal(chainSubtable.inputCoverage.length, 2);
            assert.deepEqual(chainSubtable.inputCoverage[0].glyphs, [1]);
            assert.deepEqual(chainSubtable.inputCoverage[1].glyphs, [2]);
            
            // Should have lookup records for both positions
            assert.equal(chainSubtable.lookupRecords.length, 2);
        });
    });

    describe('getChaining', function() {
        it('can retrieve chaining context rules after adding them', function() {
            // Add a calt rule
            substitution.add('calt', {
                backtrack: [1],
                input: [2],
                lookahead: [3],
                substitution: { sequenceIndex: 0, sub: 2, by: 28 }
            });
            
            // Retrieve it
            const rules = substitution.getChaining('calt');
            assert.equal(rules.length, 1);
            
            const rule = rules[0];
            // Format 3 returns arrays of arrays for coverages
            assert.equal(rule.backtrack.length, 1);
            assert.deepEqual(rule.backtrack[0], [1]);
            assert.equal(rule.input.length, 1);
            assert.deepEqual(rule.input[0], [2]);
            assert.equal(rule.lookahead.length, 1);
            assert.deepEqual(rule.lookahead[0], [3]);
            
            // Should have substitution info resolved
            assert.ok(rule.substitutions);
            assert.equal(rule.substitutions.length, 1);
            assert.equal(rule.substitutions[0].lookupType, 1);
        });
    });

    describe('chaining context roundtrip', function() {
        it('should preserve calt rules through export and reimport', function() {
            // Add calt rule: substitute 'a' (1) with 'A' (27) when preceded by space-like context
            // and followed by 'b' (2)
            substitution.add('calt', {
                backtrack: [1],      // after 'a' 
                input: [2],          // substitute 'b'
                lookahead: [3],      // before 'c'
                substitution: { sequenceIndex: 0, sub: 2, by: 28 }
            });
            
            // Export font to ArrayBuffer
            const buffer = font.toArrayBuffer();
            
            // Re-import font
            const reimported = parse(buffer);
            
            // Verify calt rules were preserved
            const rules = reimported.substitution.getChaining('calt');
            assert.equal(rules.length, 1, 'Should have one calt rule after reimport');
            
            const rule = rules[0];
            // Check context preserved (format 3 returns arrays of arrays)
            assert.deepEqual(rule.backtrack[0], [1], 'Backtrack should be preserved');
            assert.deepEqual(rule.input[0], [2], 'Input should be preserved');
            assert.deepEqual(rule.lookahead[0], [3], 'Lookahead should be preserved');
            
            // Check substitution info
            assert.ok(rule.substitutions.length > 0, 'Should have substitution info');
            const subInfo = rule.substitutions[0];
            assert.equal(subInfo.lookupType, 1, 'Should reference single substitution lookup');
            
            // Check the actual mapping
            const mapping = subInfo.substitutions.find(s => s.sub === 2);
            assert.ok(mapping, 'Should have mapping for glyph 2');
            assert.equal(mapping.by, 28, 'Should substitute to glyph 28');
        });

        it('should preserve multi-glyph input calt rules through roundtrip', function() {
            // Add a rule with multi-glyph input
            substitution.add('calt', {
                backtrack: [],
                input: [1, 2],       // 'a', 'b'
                lookahead: [3],      // followed by 'c'
                substitution: [
                    { sequenceIndex: 0, sub: 1, by: 27 },
                    { sequenceIndex: 1, sub: 2, by: 28 }
                ]
            });
            
            // Export and reimport
            const buffer = font.toArrayBuffer();
            const reimported = parse(buffer);
            
            // Verify
            const rules = reimported.substitution.getChaining('calt');
            assert.equal(rules.length, 1, 'Should have one rule');
            
            const rule = rules[0];
            assert.equal(rule.input.length, 2, 'Should have 2 input coverages');
            assert.deepEqual(rule.input[0], [1]);
            assert.deepEqual(rule.input[1], [2]);
            assert.equal(rule.lookahead.length, 1);
            assert.deepEqual(rule.lookahead[0], [3]);
        });

        it('can keep contextual ligature helper lookups detached from the feature', function() {
            const detached = substitution.createDetachedLookup(4);
            substitution.addLigatureToLookup(detached.lookupTable, {
                sub: [1, 2],
                by: 27
            });
            substitution.addChaining('ccmp', {
                backtrack: [3],
                input: [[1], [2]],
                lookahead: [],
                lookupRecords: [{
                    sequenceIndex: 0,
                    lookupListIndex: detached.lookupIndex
                }]
            });

            const buffer = font.toArrayBuffer();
            const reimported = parse(buffer);

            const directLigatures = reimported.substitution.getLigatures('ccmp');
            assert.equal(directLigatures.length, 0, 'Detached helper lookup must not appear as a direct feature ligature');

            const rules = reimported.substitution.getChaining('ccmp');
            assert.equal(rules.length, 1, 'Chaining rule should survive roundtrip');
            assert.equal(rules[0].substitutions.length, 1, 'Chaining rule should still resolve one helper lookup');
            assert.equal(rules[0].substitutions[0].lookupType, 4, 'Helper lookup should resolve as a ligature lookup');
            assert.deepEqual(rules[0].substitutions[0].substitutions[0].sub, [1, 2], 'Resolved helper lookup should preserve ligature input');
            assert.equal(rules[0].substitutions[0].substitutions[0].by, 27, 'Resolved helper lookup should preserve ligature output');
        });

        it('can add ligatures in bulk with stable coverage order and dedupe', function() {
            substitution.addLigatures('liga', [
                { sub: [2, 3], by: 27 },
                { sub: [1, 2], by: 26 },
                { sub: [1, 2, 3], by: 25 },
                { sub: [1, 2], by: 26 }
            ]);

            const ligatures = substitution.getLigatures('liga');
            assert.deepEqual(ligatures, [
                { sub: [1, 2, 3], by: 25 },
                { sub: [1, 2], by: 26 },
                { sub: [2, 3], by: 27 }
            ]);
        });

        it('can add detached ligature helper lookups in bulk', function() {
            const detached = substitution.createDetachedLookup(4);
            substitution.addLigaturesToLookup(detached.lookupTable, [
                { sub: [1, 2], by: 26 },
                { sub: [2, 3], by: 27 }
            ]);
            substitution.addChaining('ccmp', {
                input: [[1], [2]],
                lookupRecords: [{
                    sequenceIndex: 0,
                    lookupListIndex: detached.lookupIndex
                }]
            });

            const buffer = font.toArrayBuffer();
            const reimported = parse(buffer);
            assert.equal(reimported.substitution.getLigatures('ccmp').length, 0);
            assert.equal(reimported.substitution.getChaining('ccmp').length, 1);
        });

        it('partitions oversized bulk ligature lookups into valid subtables', function() {
            const records = [];
            for (let i = 0; i < 6500; i++) {
                records.push({ sub: [1 + (i % 300), 400 + i, 13000 + i], by: 26000 + i });
            }

            substitution.addLigatures('ccmp', records);

            const lookup = font.tables.gsub.lookups.find((candidate) => candidate.lookupType === 4);
            assert.ok(lookup, 'expected a ligature lookup');
            assert.ok(lookup.subtables.length > 1, 'expected oversized ligatures to be partitioned');

            const buffer = font.toArrayBuffer();
            const reimported = parse(buffer);
            const ligatures = reimported.substitution.getLigatures('ccmp');
            assert.equal(ligatures.length, records.length);
            assert.deepEqual(ligatures[0].sub, [1, 400, 13000]);
        });

        it('should preserve complex backtrack/lookahead through roundtrip', function() {
            // Complex rule with multi-glyph backtrack and lookahead
            substitution.add('calt', {
                backtrack: [1, 2],    // preceded by 'a', 'b'
                input: [3],           // substitute 'c'
                lookahead: [4, 5],    // followed by 'd', 'e'
                substitution: { sequenceIndex: 0, sub: 3, by: 29 }
            });
            
            const buffer = font.toArrayBuffer();
            const reimported = parse(buffer);
            
            const rules = reimported.substitution.getChaining('calt');
            assert.equal(rules.length, 1);
            
            const rule = rules[0];
            // Backtrack is stored reversed internally
            assert.equal(rule.backtrack.length, 2, 'Should have 2 backtrack coverages');
            assert.equal(rule.input.length, 1, 'Should have 1 input coverage');
            assert.equal(rule.lookahead.length, 2, 'Should have 2 lookahead coverages');
        });
    });
});
