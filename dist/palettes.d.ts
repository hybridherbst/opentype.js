/**
 * @exports opentype.PaletteManager
 * @class
 * @param {object} font
 */
export class PaletteManager {
    /**
     * @type {number} CPAL color used to (pre)fill unset colors in a palette.
     * Format 0xBBGGRRAA
     */
    /**
     *
     * @param {object} font
     */
    constructor(font: object);
    /**
    * @type {number} CPAL color used to (pre)fill unset colors in a palette.
    * Format 0xBBGGRRAA
    */
    defaultValue: number;
    font: any;
    /**
     * Returns the font's cpal table object if present
     * @returns {{ numPaletteEntries: number, colorRecords: Array<number>, colorRecordIndices: Array<number> } | false}
     */
    cpal(): {
        numPaletteEntries: number;
        colorRecords: Array<number>;
        colorRecordIndices: Array<number>;
    } | false;
    /**
     * Returns an array of arrays of color values for each palette, optionally in a specified color format
     * @param {string} [colorFormat]
     * @returns {Array<Array>}
     */
    getAll(colorFormat?: string): Array<any[]>;
    /**
     * Converts a color value string or array of color value strings to CPAL integer color value(s)
     * @param {string|Array<string|number>} color
     * @returns {number|Array<number>}
     */
    toCPALcolor(color: string | Array<string | number>): number | Array<number>;
    /**
     * Fills a set of palette colors (from palette index, or a provided array of CPAL color values) with a set of colors, falling back to the default color value, until a given count
     * @param {Array<string>|number} palette Palette index integer or Array of colors to be filled
     * @param {Array<string|number>} colors Colors to fill the palette with
     * @param {number} _colorCount Number of colors to fill the palette with, defaults to the value of the numPaletteEntries field. Used internally by extend() and shouldn't be set manually
     * @returns
     */
    fillPalette(palette: Array<string> | number, colors?: Array<string | number>, _colorCount?: number): any[] & number[];
    /**
     * Extend existing palettes and numPaletteEntries by a number of color slots
     * @param {number} num number of additional color slots to add to all palettes
     */
    extend(num: number): void;
    /**
     * Get a specific palette by its zero-based index
     * @param {number} paletteIndex
     * @param {string} [colorFormat='hexa']
     * @returns {Array}
     */
    get(paletteIndex: number, colorFormat?: string): any[];
    /**
     * Get a color from a specific palette by its zero-based index
     * @param {number} index
     * @param {number} paletteIndex
     * @param {string} [colorFormat ='hexa']
     * @returns
     */
    getColor(index: number, paletteIndex?: number, colorFormat?: string): any;
    /**
     * Set one or more colors on a specific palette by its zero-based index
     * @param {number} index zero-based color index to start filling from
     * @param {string|number|Array<string|number>} colors color value or array of color values
     * @param {number} paletteIndex
     * @returns
     */
    setColor(index: number, colors: string | number | Array<string | number>, paletteIndex?: number): void;
    /**
     * Add a new palette.
     * @param {Array} colors (optional) colors to add to the palette, differences to existing palettes will be filled with the defaultValue.
     * @returns
     */
    add(colors: any[]): void;
    /**
     * deletes a palette by its zero-based index
     * @param {number} paletteIndex
     */
    delete(paletteIndex: number): void;
    /**
     * Deletes a specific color index in all palettes and updates all layers using that color with the replacement index
     * @param {number} colorIndex index of the color that should be deleted
     * @param {number} replacementIndex index (according to the palette before deletion) of the color to replace in layers using the color to be to deleted
     */
    deleteColor(colorIndex: number, replacementIndex: number): void;
    /**
     * Makes sure that the CPAL table exists and is populated with default values.
     * @param {Array} colors (optional) colors to populate on creation
     * @returns {Boolean} true if it was created, false if it already existed.
     */
    ensureCPAL(colors: any[]): boolean;
    /**
     * Mainly used internally. Recalculates the colorRecordIndices array based on the numPaletteEntries and number of palettes
     */
    updateIndices(): void;
}
//# sourceMappingURL=palettes.d.ts.map