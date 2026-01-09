// Paste this into the browser console while viewing the O glyph in the font editor
// This will show the computed positions of all reference shapes

(function() {
    console.log('=== Reference Shape Position Diagnostic ===');
    
    // Get current glyph references
    const refs = state.glyphReferences[state.currentGlyph] || [];
    console.log('Current glyph:', state.currentGlyph);
    console.log('References:', refs.length);
    
    refs.forEach((ref, i) => {
        console.log(`\n--- Reference ${i}: ${ref.name} ---`);
        console.log('  dx:', ref.dx, 'dy:', ref.dy);
        console.log('  scaleX:', ref.scaleX || 1, 'scaleY:', ref.scaleY || 1);
        console.log('  rotation:', ref.rotation || 0);
        
        // Get source glyph shapes
        const sourceShapes = state.glyphs[ref.name] || [];
        console.log('  Source shapes:', sourceShapes);
        
        // Get first shape and first point
        if (sourceShapes.length > 0) {
            const firstShape = Array.isArray(sourceShapes[0]) && Array.isArray(sourceShapes[0][0]) 
                ? sourceShapes[0] 
                : sourceShapes;
            if (firstShape.length > 0) {
                const firstPoint = firstShape[0];
                console.log('  First source point:', firstPoint);
                
                // Apply transform
                const px = (firstPoint[0] * (ref.scaleX || 1)) + (ref.dx || 0);
                const py = (firstPoint[1] * (ref.scaleY || 1)) + (ref.dy || 0);
                console.log('  First transformed point:', [px, py]);
                console.log('  Expected: source + offset =', [firstPoint[0] + ref.dx, firstPoint[1] + ref.dy]);
            }
        }
    });
    
    console.log('\n=== End Diagnostic ===');
})();
