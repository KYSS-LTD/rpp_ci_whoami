// Типы библиотеки gifenc (своих типов у неё нет): нужны только странице съёмки подсказок tutorialCapture.ts.
declare module "gifenc" {
	export type Palette = number[][];
	export interface GifEncoderInstance {
		writeFrame(index: Uint8Array, width: number, height: number, options?: { palette?: Palette; delay?: number; repeat?: number }): void;
		finish(): void;
		bytes(): Uint8Array;
	}
	export function GIFEncoder(): GifEncoderInstance;
	export function quantize(rgba: Uint8ClampedArray, maxColors: number, options?: { format?: string }): Palette;
	export function applyPalette(rgba: Uint8ClampedArray, palette: Palette, format?: string): Uint8Array;
}
