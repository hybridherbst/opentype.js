// The GlyphSet object

import Glyph from './glyph.js';

// Define a property on the glyph that depends on the path being loaded.
function defineDependentProperty(glyph, externalName, internalName) {
    Object.defineProperty(glyph, externalName, {
        get: function() {
            // Request the path property to make sure the path is loaded.
            // optimization: do it only when the internal property is undefined,
            // in order to prevent unnecessary computations, as well endless loops
            // in the case of the points property
            typeof glyph[internalName] === 'undefined' && glyph.path; // jshint ignore:line
            return glyph[internalName];
        },
        set: function(newValue) {
            glyph[internalName] = newValue;
        },
        enumerable: true,
        configurable: true
    });
}

/**
 * A GlyphSet represents all glyphs available in the font, but modelled using
 * a deferred glyph loader, for retrieving glyphs only once they are absolutely
 * necessary, to keep the memory footprint down.
 * @exports opentype.GlyphSet
 * @class
 * @param {Record<string, unknown>} font
 * @param {Array} [glyphs]
 */
function GlyphSet(font, glyphs) {
    this.font = font;
    this.glyphs = {};
    if (Array.isArray(glyphs)) {
        for (let i = 0; i < glyphs.length; i++) {
            const glyph = glyphs[i];
            glyph.path.unitsPerEm = font.unitsPerEm;
            this.glyphs[i] = glyph;
        }
    }

    this.length = (glyphs && glyphs.length) || 0;
}

if(typeof Symbol !== 'undefined' && Symbol.iterator) {
    /**
     * @return {{next: Function}}
     */
    GlyphSet.prototype[Symbol.iterator] = function() {
        let n = -1;
        return {
            next: (function() {
                n++;
                const done = n >= this.length - 1;
                return {value:this.get(n), done:done};
            }).bind(this)
        };
    };
}

/**
 * @param  {number} index
 * @return {Glyph}
 */
GlyphSet.prototype.get = function(index) {
    // this.glyphs[index] is 'undefined' when low memory mode is on. glyph is pushed on request only.
    if (this.glyphs[index] === undefined) {
        const font = /** @type {Record<string, unknown>} */ (this.font);
        if (font._push) {
            (/** @type {Function} */ (font._push))(index);
        } else {
            throw new Error(`Glyph ${index} not loaded and no _push function available`);
        }
        if (typeof this.glyphs[index] === 'function') {
            this.glyphs[index] = this.glyphs[index]();
        }

        let glyph = this.glyphs[index];
        const indexToUnicodeMap = /** @type {Record<string, unknown>} */ (font._IndexToUnicodeMap);
        let unicodeObj = /** @type {{ unicodes: number[] } | undefined} */ (indexToUnicodeMap && indexToUnicodeMap[index]);

        if (unicodeObj) {
            for (let j = 0; j < unicodeObj.unicodes.length; j++)
                glyph.addUnicode(unicodeObj.unicodes[j]);
        }

        const cffEncoding = /** @type {Record<string, unknown>} */ (font.cffEncoding);
        const glyphNames = /** @type {Record<string, unknown>} */ (font.glyphNames);
        if (cffEncoding) {
            glyph.name = /** @type {string[]} */ (cffEncoding.charset)[index];
        } else if (glyphNames && glyphNames.names) {
            glyph.name = (/** @type {{ glyphIndexToName: Function }} */ (glyphNames)).glyphIndexToName(index);
        }
        // In low-memory mode, metrics are stored in font._hmtxTableData; otherwise they were
        // already applied in parseHmtxTableAll. Only read the map when an entry exists.
        if (this.font._hmtxTableData && this.font._hmtxTableData[index] !== undefined) {
            this.glyphs[index].advanceWidth = this.font._hmtxTableData[index].advanceWidth;
            this.glyphs[index].leftSideBearing = this.font._hmtxTableData[index].leftSideBearing;
        }
    } else {
        if (typeof this.glyphs[index] === 'function') {
            this.glyphs[index] = this.glyphs[index]();
        }
    }

    return this.glyphs[index];
};

/**
 * @param  {number} index
 * @param  {Function|Glyph} loader
 */
GlyphSet.prototype.push = function(index, loader) {
    this.glyphs[index] = loader;
    this.length++;
};

/**
 * @alias opentype.glyphLoader
 * @param  {Record<string, unknown>} font
 * @param  {number} index
 * @return {Glyph}
 */
function glyphLoader(font, index) {
    return new Glyph({index: index, font: font});
}

/**
 * Generate a stub glyph that can be filled with all metadata *except*
 * the "points" and "path" properties, which must be loaded only once
 * the glyph's path is actually requested for text shaping.
 * @alias opentype.ttfGlyphLoader
 * @param  {Record<string, unknown>} font
 * @param  {number} index
 * @param  {Function} parseGlyph
 * @param  {Record<string, unknown>} data
 * @param  {number} position
 * @param  {Function} buildPath
 * @return {Function}
 */
function ttfGlyphLoader(font, index, parseGlyph, data, position, buildPath) {
    return function() {
        const glyph = new Glyph({index: index, font: font});
        let parsed = false;

        const loadRawGlyph = function() {
            if (!parsed) {
                parseGlyph(glyph, data, position);
                parsed = true;
            }
            return glyph;
        };

        (/** @type {Glyph & {loadRawGlyph?: () => Glyph}} */ (glyph)).loadRawGlyph = loadRawGlyph;

        (/** @type {Record<string, unknown>} */ (/** @type {unknown} */ (glyph))).path = function() {
            loadRawGlyph();
            const path = buildPath(font.glyphs, glyph);
            path.unitsPerEm = font.unitsPerEm;
            return path;
        };

        defineDependentProperty(glyph, 'xMin', '_xMin');
        defineDependentProperty(glyph, 'xMax', '_xMax');
        defineDependentProperty(glyph, 'yMin', '_yMin');
        defineDependentProperty(glyph, 'yMax', '_yMax');
        defineDependentProperty(glyph, 'points', '_points');

        return glyph;
    };
}
/**
 * @alias opentype.cffGlyphLoader
 * @param  {Record<string, unknown>} font
 * @param  {number} index
 * @param  {Function} parseCFFCharstring
 * @param  {string} charstring
 * @param  {*} [version]
 * @return {Function}
 */
function cffGlyphLoader(font, index, parseCFFCharstring, charstring, version) {
    return function() {
        const glyph = new Glyph({index: index, font: font});

        // Preserve original charstring bytes for exact re-emit during make()
        // This helps CFF2 round-trips match expected byte sequences.
        /** @type {Glyph & {_charString: string}} */ (glyph)._charString = charstring;

        (/** @type {Record<string, unknown>} */ (/** @type {unknown} */ (glyph))).path = function() {
            const path = parseCFFCharstring(font, glyph, charstring, version);
            path.unitsPerEm = font.unitsPerEm;
            return path;
        };

        return glyph;
    };
}

export { GlyphSet };
export default { GlyphSet, glyphLoader, ttfGlyphLoader, cffGlyphLoader };
