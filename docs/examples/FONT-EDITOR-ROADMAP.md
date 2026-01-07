# Font Editor Roadmap

This document outlines the plan for improving the font-editor to support more advanced features like composite glyphs, curve editing, and better overall editing experience.

## Current State

The font-editor currently supports:
- ✅ Basic glyph creation with polygon points
- ✅ Point editing (add, move, delete)
- ✅ Multiple shapes per glyph
- ✅ Variable font creation (axes, masters, instances)
- ✅ Font export (TTF/OTF)
- ✅ JSON save/load
- ✅ Importing existing fonts
- ✅ Preview text rendering

## Missing Features (Priority Order)

### Phase 1: Core Editing Improvements

#### 1.1 Curve Support (Bezier Editing)
**Priority: HIGH**

Currently, glyphs are defined as simple polygons (straight lines only). We need:

- [ ] **Point types**: on-curve, off-curve (quadratic control), cubic control
- [ ] **Point representation**: Change from `[x, y]` to `{x, y, type: 'line'|'curve'|'qcurve'|'cubic1'|'cubic2'}`
- [ ] **UI indicators**: Different visual for control points vs on-curve points
- [ ] **Conversion tools**: Convert line segments to curves (insert control points)
- [ ] **Curve handles**: Draw and drag Bezier handles
- [ ] **Path commands**: Use opentype.js Path commands internally

**Implementation approach:**
```javascript
// New point structure
{ x: 100, y: 200, type: 'line' }      // On-curve point (line-to)
{ x: 150, y: 250, type: 'qcurve' }    // Quadratic control point
{ x: 100, y: 200, type: 'cubic1' }    // First cubic control point
{ x: 130, y: 220, type: 'cubic2' }    // Second cubic control point

// Or simpler: use opentype.js Path commands directly
{ type: 'M', x: 0, y: 0 }
{ type: 'L', x: 100, y: 0 }
{ type: 'Q', x: 50, y: 50, x1: 75, y1: 25 }
{ type: 'C', x: 100, y: 100, x1: 25, y1: 25, x2: 75, y2: 75 }
{ type: 'Z' }
```

#### 1.2 Composite Glyph Support
**Priority: HIGH**

Composite glyphs (glyphs made of references to other glyphs) are essential for:
- Accented characters (é = e + combining acute)
- Ligatures (fi, fl, ffi)
- Efficient font file size

- [ ] **Component references**: Store glyph as list of component refs + transforms
- [ ] **Component data structure**:
  ```javascript
  {
    type: 'composite',
    components: [
      { glyph: 'e', xOffset: 0, yOffset: 0, xScale: 1, yScale: 1 },
      { glyph: 'acutecomb', xOffset: 150, yOffset: 0 }
    ]
  }
  ```
- [ ] **UI for adding components**: "Add Component" button, glyph picker
- [ ] **Visual editing**: Drag components, adjust offsets
- [ ] **Decompose**: Convert composite to simple outlines
- [ ] **Export handling**: Proper TrueType composite glyph encoding

#### 1.3 Undo/Redo System
**Priority: HIGH**

Essential for any editor:

- [ ] **Command pattern**: Store state diffs or full snapshots
- [ ] **Operations tracked**:
  - Point add/delete/move
  - Shape add/delete
  - Glyph add/delete
  - Master changes
  - Width changes
- [ ] **Keyboard shortcuts**: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z
- [ ] **History limit**: Keep last 50-100 operations

```javascript
class HistoryManager {
  constructor(maxHistory = 100) {
    this.undoStack = [];
    this.redoStack = [];
    this.maxHistory = maxHistory;
  }
  
  push(snapshot) { /* save state */ }
  undo() { /* restore previous */ }
  redo() { /* restore next */ }
}
```

### Phase 2: Enhanced Editing Features

#### 2.1 Selection Improvements
**Priority: MEDIUM**

- [ ] **Multi-point selection**: Shift+click, drag rectangle
- [ ] **Multi-shape selection**: Select multiple shapes at once
- [ ] **Group operations**: Move, scale, rotate selected points together
- [ ] **Selection persistence**: Keep selection across operations

#### 2.2 Transform Tools
**Priority: MEDIUM**

- [ ] **Scale tool**: Uniform and non-uniform scaling
- [ ] **Rotate tool**: Rotate around center or custom pivot
- [ ] **Flip horizontal/vertical**: Mirror shapes
- [ ] **Align tools**: Align points to grid, to each other, to glyph bounds
- [ ] **Distribute tools**: Evenly space selected points/shapes

#### 2.3 Pen Tool (Proper Path Drawing)
**Priority: MEDIUM**

Replace current "add point" with proper pen tool:

- [ ] **Click**: Add corner point
- [ ] **Click-drag**: Add smooth point with bezier handles
- [ ] **Alt+click**: Convert point type
- [ ] **Path preview**: Show path as it's being drawn
- [ ] **Close path**: Auto-connect to start point

### Phase 3: Advanced Features

#### 3.1 Metrics and Kerning
**Priority: MEDIUM**

- [ ] **Sidebearings**: Visual editing of left/right sidebearings
- [ ] **Kerning pairs**: UI to define kerning between glyph pairs
- [ ] **Kerning classes**: Group similar glyphs for efficient kerning
- [ ] **Metrics preview**: Show metrics lines in glyph view

#### 3.2 Unicode and Naming
**Priority: MEDIUM**

- [ ] **Glyph naming**: Proper glyph names (not just unicode char)
- [ ] **Multiple unicodes**: Map multiple codepoints to one glyph
- [ ] **Unicode browser**: Search/browse unicode characters
- [ ] **Name from unicode**: Auto-generate glyph names

#### 3.3 OpenType Features
**Priority: LOW**

- [ ] **Feature editor**: Define GSUB/GPOS features
- [ ] **Ligature builder**: Visual ligature creation
- [ ] **Alternates**: Define stylistic alternates
- [ ] **Contextual rules**: Simple contextual substitution UI

#### 3.4 Hints and Instructions
**Priority: LOW**

- [ ] **Auto-hinting**: Apply basic hints on export
- [ ] **Manual hints**: UI for defining hints (very complex)

### Phase 4: Quality of Life

#### 4.1 Better Import
**Priority: HIGH**

- [ ] **Full font import**: Import all glyphs, not just selected
- [ ] **Preserve curves**: Import bezier curves properly (currently flattened?)
- [ ] **Preserve composites**: Import composite glyph structure
- [ ] **Preserve metrics**: Import sidebearings, kerning

#### 4.2 Export Options
**Priority: MEDIUM**

- [ ] **Format selection**: TTF, OTF (CFF), WOFF, WOFF2
- [ ] **Subset**: Export only specific glyphs
- [ ] **Compression options**: WOFF2 compression level
- [ ] **Validation**: Pre-export validation and warnings

#### 4.3 UI/UX Improvements
**Priority: MEDIUM**

- [ ] **Zoom to fit**: Auto-zoom to show entire glyph
- [ ] **Ruler/guides**: Draggable guides, baseline/cap height markers
- [ ] **Dark/light theme**: Theme toggle
- [ ] **Keyboard shortcuts**: Complete shortcut system
- [ ] **Touch support**: Mobile/tablet editing

## Implementation Strategy

### Recommended Order

1. **Curve Support** (1.1) - Foundation for proper font editing
2. **Undo/Redo** (1.3) - Essential before users do serious work
3. **Better Import** (4.1) - Leverage existing fonts
4. **Composite Glyphs** (1.2) - Complete glyph type support
5. **Selection Improvements** (2.1) - Better editing workflow
6. **Transform Tools** (2.2) - Scale, rotate, flip
7. **Pen Tool** (2.3) - Professional path drawing
8. **Metrics/Kerning** (3.1) - Complete font metrics

### Data Model Changes

Current model:
```javascript
state.glyphs = {
  'A': [[[x, y], [x, y], ...]], // shapes -> points
}
```

Proposed model:
```javascript
state.glyphs = {
  'A': {
    type: 'simple', // or 'composite'
    unicode: 65,
    name: 'A',
    width: 700,
    lsb: 50,       // left side bearing
    shapes: [{
      points: [
        { x: 0, y: 0, type: 'line' },
        { x: 350, y: 700, type: 'cubic1' },
        { x: 350, y: 700, type: 'cubic2' },
        { x: 700, y: 0, type: 'line' },
        // ...
      ]
    }]
  },
  'Aacute': {
    type: 'composite',
    unicode: 193,
    name: 'Aacute',
    width: 700,
    components: [
      { base: 'A', xOffset: 0, yOffset: 0 },
      { base: 'acutecomb', xOffset: 350, yOffset: 700 }
    ]
  }
}
```

### API Changes to font-editor-api.js

1. **Add `CommandPath` class**: Wrapper around opentype.js Path for editing
2. **Add `CompositeGlyph` handling**: Build composite glyphs on export
3. **Add curve utilities**: Bezier subdivision, point insertion on curves
4. **Add transform utilities**: Matrix transforms for shapes

## Migration Path

For backwards compatibility:

1. **Version the save format**: Add `version` field to JSON saves
2. **Auto-migrate on load**: Convert old format to new on import
3. **Keep flat point arrays working**: Treat `[x, y]` as `{x, y, type: 'line'}`

## Dependencies

- opentype.js core functionality (already present)
- Canvas 2D API (already used)
- No external dependencies required

## Testing

Each phase should include:
- Unit tests for new API functions
- Integration tests for import/export roundtrip
- Manual testing with real fonts

## Timeline Estimate

- Phase 1: 2-3 weeks (core editing improvements)
- Phase 2: 2-3 weeks (enhanced editing)
- Phase 3: 3-4 weeks (advanced features)
- Phase 4: 2-3 weeks (quality of life)

Total: ~10-14 weeks for full implementation

## Getting Started

To begin implementing, start with:

1. **Create `curve-editing.js`**: Bezier math utilities
2. **Update point data model**: Add type field
3. **Modify `drawGlyph()`**: Render curves properly
4. **Add point type toggle**: UI for changing point type
5. **Update export**: Generate proper path commands

This provides the foundation for all subsequent work.
