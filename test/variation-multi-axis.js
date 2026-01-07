/**
 * Multi-axis variation export and roundtrip tests
 */

import assert from 'assert';
import * as opentype from '../src/opentype.js';
import {
  FontEditorState,
  FontBuilder,
  FontImporter,
  getPathBounds
} from '../docs/examples/font-editor-api.js';
import { runFontspector, assertNoErrors, assertCheckNotFailed } from './fontspector-helper.mjs';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

function fonttoolsAvailable() {
  try {
    execSync('/usr/bin/python3 -c "from fontTools.ttLib import TTFont"', { encoding: 'utf8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

describe('Multi-axis variable font export', function() {
  this.timeout(20000);

  function buildSimpleState() {
    const state = new FontEditorState({ unitsPerEm: 800, ascender: 800, descender: 0 });
    // Base glyph A: triangle
    state.addGlyph('A', [[0, 0], [4, 10], [8, 0]]);
    // Add two axes
    state.addAxis({ tag: 'AXE1', name: 'Axis One', minValue: 100, defaultValue: 400, maxValue: 700 });
    state.addAxis({ tag: 'AXE2', name: 'Axis Two', minValue: 100, defaultValue: 400, maxValue: 700 });
    state.setVariableFontEnabled(true);

    // Default master
    const defCoords = { AXE1: 400, AXE2: 400 };
    state.masters = [];
    state.addMaster('Default', defCoords, { 'A': [[0, 0], [4, 10], [8, 0]] });

    // Master deviating in AXE1 (narrower apex)
    state.addMaster('Small', { AXE1: 100, AXE2: 400 }, { 'A': [[0, 0], [4, 8], [8, 0]] });
    // Master deviating in AXE2 (shifted base)
    state.addMaster('Thin', { AXE2: 100, AXE1: 400 }, { 'A': [[1, 0], [4, 10], [7, 0]] });

    // Instance Regular
    state.addInstance('Regular', defCoords);
    return state;
  }

  it('easy: two axes, three masters produce per-axis gvar headers', () => {
    const state = buildSimpleState();
    const builder = new FontBuilder(state, opentype);
    const font = builder.build({ validate: true, validateRoundTrip: true });

    assert.ok(font.tables.fvar && font.tables.fvar.axes.length === 2, 'Should have 2 axes');
    assert.ok(font.tables.gvar, 'gvar table should exist');

    const glyphA = font.charToGlyph('A');
    const gv = font.tables.gvar.glyphVariations[glyphA.index];
    assert.ok(gv && gv.headers && gv.headers.length >= 2, 'Glyph A should have variation headers');

    const hasAxis1 = gv.headers.some(h => (h.peakTuple?.[0] ?? 0) !== 0);
    const hasAxis2 = gv.headers.some(h => (h.peakTuple?.[1] ?? 0) !== 0);
    assert.ok(hasAxis1, 'Axis 1 header should exist');
    assert.ok(hasAxis2, 'Axis 2 header should exist');

    // Interpolation checks: changing AXE1 vs AXE2 affects bounds differently
    const defaultT = font.variation.process.getTransform(glyphA.index, { AXE1: 400, AXE2: 400 });
    const minAxe1T = font.variation.process.getTransform(glyphA.index, { AXE1: 100, AXE2: 400 });
    const minAxe2T = font.variation.process.getTransform(glyphA.index, { AXE1: 400, AXE2: 100 });
    const bothMinT = font.variation.process.getTransform(glyphA.index, { AXE1: 100, AXE2: 100 });

    const bDefault = getPathBounds(defaultT.path);
    const bMinAxe1 = getPathBounds(minAxe1T.path);
    const bMinAxe2 = getPathBounds(minAxe2T.path);
    const bBoth = getPathBounds(bothMinT.path);

    // AXE1 lowers apex height
    assert.ok(bMinAxe1.maxY <= bDefault.maxY, 'AXE1 min should not increase apex');
    // AXE2 shifts base inward, narrowing width
    assert.ok(bMinAxe2.maxX - bMinAxe2.minX <= bDefault.maxX - bDefault.minX, 'AXE2 min should not widen glyph');
    // Both axes combined change both height and width
    assert.ok(bBoth.maxY <= bDefault.maxY && (bBoth.maxX - bBoth.minX) <= (bDefault.maxX - bDefault.minX), 'Both axes should reduce height and width');
  });

  it('complex: multiple masters across axes export and interpolate', () => {
    const state = new FontEditorState({ unitsPerEm: 800, ascender: 800, descender: 0 });
    state.addGlyph('A', [[0, 0], [4, 10], [8, 0]]);
    state.addAxis({ tag: 'AXE1', name: 'Axis One', minValue: 100, defaultValue: 400, maxValue: 700 });
    state.addAxis({ tag: 'AXE2', name: 'Axis Two', minValue: 100, defaultValue: 400, maxValue: 700 });
    state.setVariableFontEnabled(true);

    // Default
    state.addMaster('Default', { AXE1: 400, AXE2: 400 }, { 'A': [[0, 0], [4, 10], [8, 0]] });
    // AXE1 min/max
    state.addMaster('AXE1min', { AXE1: 100, AXE2: 400 }, { 'A': [[0, 0], [4, 7], [8, 0]] });
    state.addMaster('AXE1max', { AXE1: 700, AXE2: 400 }, { 'A': [[0, 0], [4, 12], [8, 0]] });
    // AXE2 min/max
    state.addMaster('AXE2min', { AXE2: 100, AXE1: 400 }, { 'A': [[2, 0], [4, 10], [6, 0]] });
    state.addMaster('AXE2max', { AXE2: 700, AXE1: 400 }, { 'A': [[-1, 0], [4, 10], [9, 0]] });

    const builder = new FontBuilder(state, opentype);
    const font = builder.build({ validate: true, validateRoundTrip: true });

    const glyphA = font.charToGlyph('A');
    const gv = font.tables.gvar.glyphVariations[glyphA.index];
    assert.ok(gv && gv.headers && gv.headers.length >= 4, 'Should have multiple headers');

    // Interpolation combined: AXE1 max & AXE2 min
    const t = font.variation.process.getTransform(glyphA.index, { AXE1: 700, AXE2: 100 });
    const b = getPathBounds(t.path);
    const b0 = getPathBounds(font.variation.process.getTransform(glyphA.index, { AXE1: 400, AXE2: 400 }).path);
    assert.ok(b.maxY >= b0.maxY, 'AXE1 max increases height');
    assert.ok((b.maxX - b.minX) <= (b0.maxX - b0.minX), 'AXE2 min narrows width');
  });

  it('fontspector varfont checks should not fail', () => {
    const state = buildSimpleState();
    const builder = new FontBuilder(state, opentype);
    const buffer = builder.toArrayBuffer();
    const results = runFontspector(buffer, { checks: ['opentype/varfont', 'opentype/fvar'] });
    assertNoErrors(results, assert);
    assertCheckNotFailed(results, 'varfont', assert);
  });

  it('stress: ten masters with randomized per-axis deltas export cleanly', () => {
    const state = new FontEditorState({ unitsPerEm: 800, ascender: 800, descender: 0 });
    state.addGlyph('A', [[0, 0], [4, 10], [8, 0]]);
    state.addAxis({ tag: 'AXE1', name: 'Axis One', minValue: 100, defaultValue: 400, maxValue: 700 });
    state.addAxis({ tag: 'AXE2', name: 'Axis Two', minValue: 100, defaultValue: 400, maxValue: 700 });
    state.setVariableFontEnabled(true);

    // Default
    state.addMaster('Default', { AXE1: 400, AXE2: 400 }, { 'A': [[0, 0], [4, 10], [8, 0]] });

    // Create 10 masters deviating on a single axis each
    for (let i = 0; i < 10; i++) {
      const onAxis1 = (i % 2) === 0;
      const tag = onAxis1 ? 'AXE1' : 'AXE2';
      const coords = { AXE1: 400, AXE2: 400 };
      coords[tag] = i % 3 === 0 ? 100 : 700; // alternate min/max
      // Random but bounded delta of points
      const dx = ((i % 5) - 2) * 0.5; // -1 .. +1 step
      const dy = ((i % 7) - 3) * 0.5; // -1.5 .. +2.0 step
      const masterPoints = [
        [0 + (tag === 'AXE2' ? dx : 0), 0 + (tag === 'AXE1' ? dy : 0)],
        [4, 10 + (tag === 'AXE1' ? dy : 0)],
        [8 + (tag === 'AXE2' ? -dx : 0), 0 + (tag === 'AXE1' ? dy : 0)]
      ];
      state.addMaster(`M${i}`, coords, { 'A': masterPoints });
    }

    const builder = new FontBuilder(state, opentype);
    const font = builder.build({ validate: true, validateRoundTrip: true });
    const glyphA = font.charToGlyph('A');
    const gv = font.tables.gvar.glyphVariations[glyphA.index];
    assert.ok(gv && gv.headers && gv.headers.length >= 6, 'Should have many headers from masters');

    // Quick interpolation check across axes extremes
    const t1 = font.variation.process.getTransform(glyphA.index, { AXE1: 700, AXE2: 400 });
    const t2 = font.variation.process.getTransform(glyphA.index, { AXE1: 400, AXE2: 700 });
    const b1 = getPathBounds(t1.path);
    const b2 = getPathBounds(t2.path);
    const b0 = getPathBounds(font.variation.process.getTransform(glyphA.index, { AXE1: 400, AXE2: 400 }).path);
    assert.ok(b1.maxY !== b0.maxY || b1.minY !== b0.minY, 'AXE1 extremes should affect height');
    assert.ok((b2.maxX - b2.minX) !== (b0.maxX - b0.minX), 'AXE2 extremes should affect width');
  });

  it('fonttools validation (if available) should not error', function() {
    if (!fonttoolsAvailable()) {
      this.skip();
    }
    const state = buildSimpleState();
    const builder = new FontBuilder(state, opentype);
    const arrayBuffer = builder.toArrayBuffer();

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'otjs-multi-')); 
    const outPath = path.join(tempDir, 'multi-axis.ttf');
    try {
      fs.writeFileSync(outPath, Buffer.from(arrayBuffer));
      // Reuse the python validator from test/fonttools.js by embedding a minimal runner
      const py = `
import sys, json
from fontTools.ttLib import TTFont
font = TTFont(sys.argv[1])
issues = []
if 'fvar' not in font or len(font['fvar'].axes) < 2:
    issues.append({'severity':'ERROR','test':'fvar','message':'Missing or insufficient axes'})
if 'gvar' not in font:
    issues.append({'severity':'ERROR','test':'gvar','message':'Missing gvar'})
print(json.dumps(issues))
`;
      const pyPath = path.join(tempDir, 'validate.py');
      fs.writeFileSync(pyPath, py);
      const out = execSync(`/usr/bin/python3 "${pyPath}" "${outPath}"`, { encoding: 'utf8' });
      const issues = JSON.parse(out.trim());
      const errors = issues.filter(i => i.severity === 'ERROR' || i.severity === 'FATAL');
      assert.strictEqual(errors.length, 0, `Fonttools reported errors: ${errors.map(e => e.test+':'+e.message).join(', ')}`);
    } finally {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }
  });

  it('roundtrip reimport preserves axes and renders masters', () => {
    const state = buildSimpleState();
    const builder = new FontBuilder(state, opentype);
    const buffer = builder.toArrayBuffer();

    const importer = new FontImporter(opentype);
    const newState = new FontEditorState();
    importer.import(newState, buffer, { range: 'uppercase', importVF: true });

    assert.ok(newState.vfEnabled, 'VF should be enabled after import');
    assert.equal(newState.axes.length, 2, 'Two axes imported');

    // Use parsed font to evaluate at master coords
    const parsed = opentype.parse(buffer);
    const glyphA = parsed.charToGlyph('A');
    const defT = parsed.variation.process.getTransform(glyphA.index, { AXE1: 400, AXE2: 400 });
    const axe1MinT = parsed.variation.process.getTransform(glyphA.index, { AXE1: 100, AXE2: 400 });
    const axe2MinT = parsed.variation.process.getTransform(glyphA.index, { AXE1: 400, AXE2: 100 });

    const bDef = getPathBounds(defT.path);
    const bA1 = getPathBounds(axe1MinT.path);
    const bA2 = getPathBounds(axe2MinT.path);

    assert.ok(bA1.maxY <= bDef.maxY, 'AXE1 min lowers apex after roundtrip');
    assert.ok((bA2.maxX - bA2.minX) <= (bDef.maxX - bDef.minX), 'AXE2 min narrows width after roundtrip');
  });
});
