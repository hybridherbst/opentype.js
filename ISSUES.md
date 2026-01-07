# font-editor.html
- [ ] font-editor with multiple axes doesn't really work yet; when we add a second axis, we don't get proper previews anymore, and it's not easy to grasp how to actually work with multiple axes in the current UI (e.g. when we have all masters for "axe2" at the same "axe1" value, how does interpolation work?). maybe axes need to be delta-edited, closer to how they work in the actual font data
- [ ] extrapolation of auto-widths doesn't work yet; when we have 1 axis ("test") with masters at 100 and 400, we can see a correct preview for 900 (extrapolated), but the exported font has wrong width deltas for the 900 instance
- [ ] no support for composite glyphs yet (glyphs made of references to other glyphs)
- [ ] no support for Bezier curves yet (only straight lines)

# reading-writing.html
- [ ] adding an extra axis to an existing variable font doesn't work yet; we always just emit ONE axis, even if the loaded font already has variable font data. We need to merge the existing axes with the new one(s) instead of replacing them, and might also have to produce multiple new "snap masters" so that specific existing variable font features keep working as expected.