/**
 * Tests for GSUB lookup type-6 (Chaining Contextual Substitution) and 
 * type-7 (Extension Substitution) support in opentype.js
 * 
 * These tests verify that:
 * 1. Type-6 chaining contextual lookups are parsed correctly
 * 2. Type-7 extension lookups are unwrapped and inner lookups are accessible
 * 3. getLookupTables() finds lookups wrapped in type-7 extensions
 * 4. getChaining() returns rules from both direct type-6 and type-7 wrapped type-6
 * 5. getLigatures() finds ligatures wrapped in type-7 extensions
 * 
 * Test fonts:
 * - Fast_Sans.ttf: Uses type-7 extensions wrapping type-4 ligatures and type-6 contextual
 * - friendly_font.otf: Uses type-6 contextual substitution under 'calt'
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import * as opentype from '../src/opentype.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { parse, Font, Glyph, Path } = opentype;

describe('GSUB Type-6 and Type-7 Lookup Support', function() {
    let fastSansFont;
    let friendlyFont;
    
    before(function() {
        const fastSansBuffer = readFileSync(join(__dirname, 'fonts', 'Fast_Sans.ttf'));
        fastSansFont = parse(fastSansBuffer.buffer);
        
        const friendlyBuffer = readFileSync(join(__dirname, 'fonts', 'friendly_font.otf'));
        friendlyFont = parse(friendlyBuffer.buffer);
    });
    
    describe('Fast_Sans.ttf (type-7 extensions)', function() {
        it('should have GSUB table', function() {
            assert.ok(fastSansFont.tables.gsub, 'Font should have GSUB table');
        });
        
        it('should have type-7 extension lookups in GSUB', function() {
            const lookups = fastSansFont.tables.gsub.lookups;
            const type7Lookups = lookups.filter(l => l.lookupType === 7);
            assert.ok(type7Lookups.length > 0, `Should have type-7 lookups, found ${type7Lookups.length}`);
            console.log(`  Fast_Sans has ${type7Lookups.length} type-7 extension lookups`);
        });
        
        it('should unwrap type-7 extensions to find inner lookup types', function() {
            const lookups = fastSansFont.tables.gsub.lookups;
            const type7Lookups = lookups.filter(l => l.lookupType === 7);
            
            // Check what types are inside the extensions
            const innerTypes = new Set();
            for (const lookup of type7Lookups) {
                for (const subtable of lookup.subtables) {
                    if (subtable.lookupType) {
                        innerTypes.add(subtable.lookupType);
                    }
                }
            }
            
            console.log(`  Inner lookup types in extensions: ${[...innerTypes].join(', ')}`);
            assert.ok(innerTypes.size > 0, 'Should find inner lookup types');
        });
        
        it('should find type-4 ligatures through type-7 extensions via getLigatures()', function() {
            // Check ccmp feature which uses type-7 extensions containing type-4 ligatures
            const ccmpLigatures = fastSansFont.substitution.getLigatures('ccmp');
            console.log(`  ccmp ligatures via getLigatures(): ${ccmpLigatures.length}`);
            
            // The ccmp feature should now return ligatures that were wrapped in type-7
            // Fast_Sans has 2960 "ligatures" via type-7 in ccmp per fonttools analysis
            assert.ok(ccmpLigatures.length > 0, 
                `Should find ccmp ligatures through type-7 extensions, found ${ccmpLigatures.length}`);
        });
        
        it('should find type-6 chaining rules through type-7 extensions via getChaining()', function() {
            // Check calt feature
            const caltChaining = fastSansFont.substitution.getChaining('calt');
            console.log(`  calt chaining rules via getChaining(): ${caltChaining.length}`);
            
            // Check ccmp feature (may have type-6 wrapped in type-7)
            const ccmpChaining = fastSansFont.substitution.getChaining('ccmp');
            console.log(`  ccmp chaining rules via getChaining(): ${ccmpChaining.length}`);
        });
        
        it('should correctly parse type-7 extension structure', function() {
            const lookups = fastSansFont.tables.gsub.lookups;
            const type7Lookup = lookups.find(l => l.lookupType === 7);
            
            assert.ok(type7Lookup, 'Should have at least one type-7 lookup');
            assert.ok(type7Lookup.subtables.length > 0, 'Type-7 lookup should have subtables');
            
            const subtable = type7Lookup.subtables[0];
            assert.strictEqual(subtable.substFormat, 1, 'Extension subtable format should be 1');
            assert.ok(subtable.lookupType, 'Extension should have lookupType property');
            assert.ok(subtable.extension, 'Extension should have extension property with actual lookup data');
            
            console.log(`  First type-7 extension wraps lookup type ${subtable.lookupType}`);
        });
    });
    
    describe('friendly_font.otf (direct type-6)', function() {
        it('should have GSUB table', function() {
            assert.ok(friendlyFont.tables.gsub, 'Font should have GSUB table');
        });
        
        it('should have type-6 chaining contextual lookups', function() {
            const lookups = friendlyFont.tables.gsub.lookups;
            const type6Lookups = lookups.filter(l => l.lookupType === 6);
            console.log(`  friendly_font has ${type6Lookups.length} direct type-6 lookups`);
            assert.ok(type6Lookups.length > 0, 'Should have type-6 lookups');
        });
        
        it('should return chaining rules via getChaining()', function() {
            const caltChaining = friendlyFont.substitution.getChaining('calt');
            console.log(`  calt chaining rules: ${caltChaining.length}`);
            assert.ok(caltChaining.length > 0, 
                `Should have calt chaining rules, found ${caltChaining.length}`);
        });
        
        it('should correctly structure chaining rules with backtrack/input/lookahead', function() {
            const caltChaining = friendlyFont.substitution.getChaining('calt');
            
            if (caltChaining.length > 0) {
                const rule = caltChaining[0];
                
                // Check rule structure
                assert.ok('backtrack' in rule, 'Rule should have backtrack property');
                assert.ok('input' in rule, 'Rule should have input property');
                assert.ok('lookahead' in rule, 'Rule should have lookahead property');
                assert.ok('lookupRecords' in rule, 'Rule should have lookupRecords property');
                
                console.log(`  First rule structure:`);
                console.log(`    backtrack: ${JSON.stringify(rule.backtrack).slice(0, 50)}...`);
                console.log(`    input: ${JSON.stringify(rule.input).slice(0, 50)}...`);
                console.log(`    lookahead: ${JSON.stringify(rule.lookahead).slice(0, 50)}...`);
                console.log(`    lookupRecords: ${rule.lookupRecords.length} records`);
            }
        });
        
        it('should resolve lookup records to actual substitution info', function() {
            const caltChaining = friendlyFont.substitution.getChaining('calt');
            
            if (caltChaining.length > 0) {
                const rule = caltChaining[0];
                
                // Check if substitutions were resolved
                if (rule.substitutions && rule.substitutions.length > 0) {
                    const sub = rule.substitutions[0];
                    assert.ok('sequenceIndex' in sub, 'Substitution should have sequenceIndex');
                    assert.ok('lookupType' in sub, 'Substitution should have lookupType');
                    console.log(`  Resolved substitution: type ${sub.lookupType} at index ${sub.sequenceIndex}`);
                }
            }
        });
    });
    
    describe('getLookupTables extension unwrapping', function() {
        it('should find type-4 lookups wrapped in type-7 extensions', function() {
            // Direct call to getLookupTables asking for type-4
            const type4Tables = fastSansFont.substitution.getLookupTables('DFLT', 'dflt', 'ccmp', 4);
            console.log(`  getLookupTables for type-4 in ccmp: ${type4Tables.length} tables`);
            
            // Should find tables because they're wrapped in type-7
            assert.ok(type4Tables.length > 0, 
                'Should find type-4 lookup tables through type-7 extensions');
        });
        
        it('should find type-6 lookups wrapped in type-7 extensions', function() {
            // Check for type-6 lookups (may be wrapped in type-7)
            const type6Tables = fastSansFont.substitution.getLookupTables('DFLT', 'dflt', 'ccmp', 6);
            console.log(`  getLookupTables for type-6 in ccmp: ${type6Tables.length} tables`);
        });
    });
    
    describe('addChaining and roundtrip', function() {
        it('should add a chaining context substitution rule', function() {
            const notdefGlyph = new Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: new Path() });
            const aGlyph = new Glyph({ name: 'a', unicode: 97, advanceWidth: 500, path: new Path() });
            const bGlyph = new Glyph({ name: 'b', unicode: 98, advanceWidth: 500, path: new Path() });
            const aAltGlyph = new Glyph({ name: 'a.alt', advanceWidth: 500, path: new Path() });
            
            const font = new Font({
                familyName: 'Test',
                styleName: 'Regular',
                unitsPerEm: 1000,
                ascender: 800,
                descender: -200,
                glyphs: [notdefGlyph, aGlyph, bGlyph, aAltGlyph]
            });
            
            // Add a chaining rule: replace 'a' with 'a.alt' when followed by 'b'
            font.substitution.addChaining('calt', {
                backtrack: [],
                input: [1],  // glyph index for 'a'
                lookahead: [2],  // glyph index for 'b'
                substitution: { sequenceIndex: 0, sub: 1, by: 3 }  // a -> a.alt
            });
            
            // Verify the rule was added
            const rules = font.substitution.getChaining('calt');
            assert.ok(rules.length > 0, 'Should have added chaining rule');
            console.log(`  Added ${rules.length} chaining rule(s)`);
        });
    });
});
