OpenType.js Examples
====================
Due to security issues, these examples only work when running a local web server.

Run `npm start` in the home directory to start a web server.

Then navigate to one of the examples below.

Examples
--------

### [reading-writing.html](http://localhost:8080/examples/reading-writing.html)
Basic example of loading and displaying font information.

### [creating-fonts.html](http://localhost:8080/examples/creating-fonts.html)
Create a simple font from scratch with custom glyphs.

### [font-editor.html](http://localhost:8080/examples/font-editor.html)
Interactive font editor for creating custom fonts.

### [variable-font-inspector.html](http://localhost:8080/examples/variable-font-inspector.html)
- Interactive variable font inspector. Load a variable font to:
- Explore variation axes with interactive sliders
- Switch between named instances
- View detailed variation table information (fvar, avar, gvar, cvar, HVAR, STAT)
- Preview text at different axis values
- Download modified font

Node.js Example
---------------
The `generate-font-node.js` example can be run from node.js:

    cd opentype.js/examples
    node generate-font-node.js
    # This generates a font file, called Pyramid-Regular.otf.
