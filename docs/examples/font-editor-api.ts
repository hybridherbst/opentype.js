/**
 * Font Editor API - TypeScript Types and Re-exports
 * 
 * This module provides TypeScript types for the font-editor-api.js
 * and re-exports its classes for use in the SvelteKit app.
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface TrueTypePoint {
	x: number;
	y: number;
	onCurve?: boolean;
	lastPointOfContour?: boolean;
}

export type Contour = TrueTypePoint[];
export type GlyphOutline = Contour[];

export interface AxisDefinition {
	tag: string;
	name: string;
	minValue: number;
	defaultValue: number;
	maxValue: number;
}

export interface MasterDefinition {
	name: string;
	coords: Record<string, number>;
	glyphs: Record<string, GlyphOutline>;
	glyphWidths: Record<string, number>;
}

export interface InstanceDefinition {
	name: string;
	coords: Record<string, number>;
}

export interface ReferenceTransform {
	name: string;
	dx?: number;
	dy?: number;
	scaleX?: number;
	scaleY?: number;
	rotation?: number;
	skewX?: number;
	skewY?: number;
}

export interface LigatureDefinition {
	sequence: string;
	result: string;
	enabled: boolean;
}

export interface ShapedGlyph {
	x: number;
	width: number;
	char: string;
	contours: GlyphOutline;
}

export interface ShapedTextToSvgOptions {
	fontSize?: number;
	x?: number;
	baseline?: number;
}

export interface FontFeatures {
	liga: boolean;
	kern: boolean;
	dlig: boolean;
	smcp: boolean;
}

export interface AvarSegmentMap {
	fromCoordinate: number;
	toCoordinate: number;
}

export interface AvarAxisMap {
	axisValueMaps: AvarSegmentMap[];
}

export interface AvarTable {
	version?: [number, number];
	axisSegmentMaps: AvarAxisMap[];
}

export interface BoundingBox {
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
}

export interface FontEditorOptions {
	familyName?: string;
	styleName?: string;
	unitsPerEm?: number;
	ascender?: number;
	descender?: number;
	sidebearing?: number;
}

export interface FontEditorJSON {
	familyName: string;
	styleName: string;
	unitsPerEm: number;
	ascender: number;
	descender: number;
	sidebearing: number;
	glyphs: Record<string, GlyphOutline>;
	glyphWidths: Record<string, number>;
	glyphReferences: Record<string, ReferenceTransform[]>;
	vfEnabled: boolean;
	axes: AxisDefinition[];
	masters: MasterDefinition[];
	instances: InstanceDefinition[];
	avarTable: AvarTable | null;
	ligatures: LigatureDefinition[];
	features: FontFeatures;
	kerning: Record<string, number>;
}

export interface FontBuilderOptions {
	validate?: boolean;
	validateRoundTrip?: boolean;
	useComposites?: boolean;
	format?: 'ttf' | 'otf';
}

export interface FontImportOptions {
	range?: 'uppercase' | 'lowercase' | 'both' | 'digits' | 'allChars' | 'all';
	overwrite?: boolean;
	importVF?: boolean;
	importKerning?: boolean;
	importLigatures?: boolean;
	verbose?: boolean;
}

export interface FontImportResult {
	importedCount: number;
	font: unknown;
}

// ============================================================================
// Re-export from JavaScript module
// ============================================================================

// Import the JavaScript implementation
import {
	FontEditorState as FontEditorStateJS,
	FontBuilder as FontBuilderJS,
	FontImporter as FontImporterJS,
	getPathBounds as getPathBoundsJS,
	extractGlyphContours as extractGlyphContoursJS,
	extractPathPoints as extractPathPointsJS,
	extractTransformContours as extractTransformContoursJS,
	transformPoint as transformPointJS,
	contoursToPoints as contoursToPointsJS,
	contoursToPath as contoursToPathJS,
	getCubicBezierExtremaX as getCubicBezierExtremaXJS,
	getQuadBezierExtremaX as getQuadBezierExtremaXJS,
	applyAvarMapping as applyAvarMappingJS,
	normalizeAxisValue as normalizeAxisValueJS,
	applyAvarToCoords as applyAvarToCoordsJS
} from './font-editor-api.js';

// Export with type annotations
export const FontEditorState = FontEditorStateJS as {
	new (options?: FontEditorOptions): FontEditorStateInstance;
};

export const FontBuilder = FontBuilderJS as {
	new (state: FontEditorStateInstance, opentypeModule?: unknown): FontBuilderInstance;
};

export const FontImporter = FontImporterJS as {
	new (opentypeModule?: unknown): FontImporterInstance;
};

// Export utility functions with types
export const getPathBounds = getPathBoundsJS as (path: { commands: unknown[] } | null) => BoundingBox;
export const extractGlyphContours = extractGlyphContoursJS as (glyph: unknown) => GlyphOutline;
export const extractPathPoints = extractPathPointsJS as (path: unknown) => Array<[number, number]>;
export const extractTransformContours = extractTransformContoursJS as (points: unknown[]) => GlyphOutline;
export const transformPoint = transformPointJS as (x: number, y: number, ref: ReferenceTransform, onCurve?: boolean) => TrueTypePoint;
export const contoursToPoints = contoursToPointsJS as (contours: GlyphOutline) => TrueTypePoint[];
export const contoursToPath = contoursToPathJS as (contours: GlyphOutline, opentypeModule?: unknown) => unknown;
export const getCubicBezierExtremaX = getCubicBezierExtremaXJS as (x0: number, x1: number, x2: number, x3: number) => number[];
export const getQuadBezierExtremaX = getQuadBezierExtremaXJS as (x0: number, x1: number, x2: number) => number[];
export const applyAvarMapping = applyAvarMappingJS as (normalized: number, segmentMaps: AvarSegmentMap[]) => number;
export const normalizeAxisValue = normalizeAxisValueJS as (userValue: number, axis: AxisDefinition) => number;
export const applyAvarToCoords = applyAvarToCoordsJS as (coords: Record<string, number>, axes: AxisDefinition[], avarTable: AvarTable | null) => Record<string, number>;

// ============================================================================
// Instance Types (for class instances)
// ============================================================================

export interface FontEditorStateInstance {
	familyName: string;
	styleName: string;
	unitsPerEm: number;
	ascender: number;
	descender: number;
	sidebearing: number;
	glyphs: Record<string, GlyphOutline>;
	glyphWidths: Record<string, number>;
	glyphReferences: Record<string, ReferenceTransform[]>;
	references: Record<string, ReferenceTransform[]>; // Alias for glyphReferences
	vfEnabled: boolean;
	axes: AxisDefinition[];
	masters: MasterDefinition[];
	currentMaster: number;
	instances: InstanceDefinition[];
	previewCoords: Record<string, number>;
	avarTable: AvarTable | null;
	ligatures: LigatureDefinition[];
	features: FontFeatures;
	kerning: Record<string, number>;
	currentGlyph: string | null;
	selectedPoint: number;
	
	// Glyph management
	addGlyph(char: string, contours: GlyphOutline): void;
	removeGlyph(char: string): boolean;
	renameGlyph(oldChar: string, newChar: string): boolean;
	getGlyph(char: string): GlyphOutline | undefined;
	setGlyph(char: string, contours: GlyphOutline): void;
	setGlyphWidth(char: string, width: number): void;
	getGlyphWidth(char: string): number | undefined;
	
	// Point manipulation
	addPoint(contourIndex: number, pointIndex: number, point: TrueTypePoint): void;
	removePoint(contourIndex: number, pointIndex: number): boolean;
	movePoint(contourIndex: number, pointIndex: number, dx: number, dy: number): void;
	setPointOnCurve(contourIndex: number, pointIndex: number, onCurve: boolean): void;
	
	// Contour manipulation
	addContour(contour: Contour): void;
	removeContour(contourIndex: number): boolean;
	
	// Reference layers
	getReferences(char: string): ReferenceTransform[];
	addReference(char: string, ref: ReferenceTransform): void;
	removeReference(char: string, index: number): boolean;
	updateReference(char: string, index: number, updates: Partial<ReferenceTransform>): boolean;
	getTransformedReferenceContours(char: string): GlyphOutline;
	
	// Variable font
	setVariableFontEnabled(enabled: boolean): void;
	addAxis(axis: AxisDefinition): void;
	removeAxis(index: number): boolean;
	addMaster(name: string, coords: Record<string, number>, glyphs?: Record<string, GlyphOutline> | null, glyphWidths?: Record<string, number> | null, glyphReferences?: Record<string, ReferenceTransform[]> | null): void;
	removeMaster(index: number): boolean;
	selectMaster(index: number): boolean;
	addInstance(name: string, coords: Record<string, number>): void;
	removeInstance(index: number): boolean;
	selectInstance(index: number): boolean;
	getInterpolatedGlyphs(coords?: Record<string, number>): { glyphs: Record<string, GlyphOutline>; widths: Record<string, number>; references: Record<string, ReferenceTransform[]> };
	
	// Ligatures
	addLigature(sequence: string, result: string, enabled?: boolean): void;
	removeLigature(index: number): boolean;
	setLigaturesEnabled(enabled: boolean): void;
	
	// Text shaping
	getDefaultSpaceWidth(): number;
	shapeText(text: string, options?: { useLigatures?: boolean; useKerning?: boolean; coords?: Record<string, number> }): ShapedGlyph[];
	shapedTextToSvgPath(shapedGlyphs: ShapedGlyph[], options?: ShapedTextToSvgOptions): string;
	getShapedTextWidth(shapedGlyphs: ShapedGlyph[]): number;
	
	// Serialization
	toJSON(): FontEditorJSON;
	fromJSON(json: FontEditorJSON): void;
}

export interface FontBuilderInstance {
	build(options?: FontBuilderOptions): unknown;
	toArrayBuffer(options?: FontBuilderOptions): ArrayBuffer;
	toBlob(options?: FontBuilderOptions): Blob;
}

export interface FontImporterInstance {
	import(state: FontEditorStateInstance, buffer: ArrayBuffer, options?: FontImportOptions): FontImportResult;
	importAsync(state: FontEditorStateInstance, buffer: ArrayBuffer, options?: FontImportOptions & {
		onProgress?: (current: number, total: number, message: string) => void;
		chunkSize?: number;
	}): Promise<FontImportResult>;
}
