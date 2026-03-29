/**
 * https://learn.microsoft.com/en-us/typography/opentype/spec/svg#glyph-identifiers
 * @param {string} text
 * @returns {SVGTemplate}
 */
export function makeSvgTemplate(text: string): SVGTemplate;
/**
* @param {string} text
* @param {number} unitsPerEm
* @returns {SVGImage}
*/
export function makeSvgImage(text: string, unitsPerEm: number): SVGImage;
/**
 * @typedef {object} SVGDocCacheEntry
 * @prop {Promise<SVGTemplate>} template
 * @prop {Map<number, SVGImageCacheEntry>} images
 */
/**
 * @typedef {string | [string, string, string, string, string, string, string]} SVGTemplate
 */
/**
 * @typedef {object} SVGImageCacheEntry
 * @prop {Promise<SVGImage>} promise
 * @prop {SVGImage | undefined} image
 */
/**
 * @typedef {{ leftSideBearing: number, baseline: number, image: HTMLImageElement }} SVGImage
 */
export class SVGImageManager {
    /**
     * @param {import('./font.js').Font} font
     */
    constructor(font: import("./font.js").Font);
    /** @type {import('./font.js').Font} */
    font: import("./font.js").Font;
    /** @type {WeakMap<Uint8Array, SVGDocCacheEntry>} */
    cache: WeakMap<Uint8Array, SVGDocCacheEntry>;
    /**
     * @param {number} glyphIndex
     * @returns {SVGImage | undefined}
     */
    get(glyphIndex: number): SVGImage | undefined;
    /**
     * @param {number} glyphIndex
     * @returns {Promise<SVGImage> | undefined}
     */
    getAsync(glyphIndex: number): Promise<SVGImage> | undefined;
    /**
     * @param {number} glyphIndex
     * @returns {SVGImageCacheEntry | undefined}
     */
    getOrCreateSvgImageCacheEntry(glyphIndex: number): SVGImageCacheEntry | undefined;
}
/**
* @param {Uint8Array} buf
* @returns {Promise<string>}
*/
export function decodeSvgDocument(buf: Uint8Array): Promise<string>;
export type SVGDocCacheEntry = {
    template: Promise<SVGTemplate>;
    images: Map<number, SVGImageCacheEntry>;
};
export type SVGTemplate = string | [string, string, string, string, string, string, string];
export type SVGImageCacheEntry = {
    promise: Promise<SVGImage>;
    image: SVGImage | undefined;
};
export type SVGImage = {
    leftSideBearing: number;
    baseline: number;
    image: HTMLImageElement;
};
//# sourceMappingURL=svgimages.d.ts.map