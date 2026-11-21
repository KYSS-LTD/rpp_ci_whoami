// Процедурные текстуры сцены: доски пола зала, плитка тротуара, асфальт, трава, ковёр, резиновый коврик кухни, грифельная доска
// меню, картины на стенах и значки эмоций над клиентами. Рисуются на canvas один раз при создании сцены.
// Без canvas (тесты в jsdom, отключённая поддержка) каждая текстура равна null: материалы тогда берут простой цвет.
// Всё рисуется детерминированно (ГПСЧ с фиксированным seed), поэтому сцена выглядит одинаково при каждом запуске.
import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from "three";
import { createRng } from "../sim/core/rng";
import type { Rng } from "../contracts";

// Набор текстур сцены. Плиточные текстуры (пол, тротуар, асфальт, трава, коврик) повторяются: UV задаются в мировых единицах.
export interface SceneTextures {
	// Дощатый пол зала: квадрат 2 x 2 мировых единицы, доски вдоль оси x.
	readonly hallFloor: Texture | null;
	// Плитка тротуара: квадрат 2 x 2, камни 0.5 со сдвигом рядов.
	readonly paving: Texture | null;
	// Асфальт дороги: квадрат 2 x 2.
	readonly asphalt: Texture | null;
	// Трава вокруг ресторана: квадрат 3 x 3.
	readonly grass: Texture | null;
	// Ковёр под большими столами (одна картинка на весь ковёр).
	readonly rug: Texture | null;
	// Резиновый коврик кухни с отверстиями: квадрат 1 x 1.
	readonly kitchenMat: Texture | null;
	// Грифельная доска меню без текста: каракули мелом и рисунки блюд.
	readonly chalkboard: Texture | null;
	// Картины на стенах зала (несколько сюжетов).
	readonly paintings: readonly (Texture | null)[];
	// Значки эмоций: сердце (клиент ест и доволен) и знак раздражения (терпение на исходе).
	readonly emoteHeart: Texture | null;
	readonly emoteAngry: Texture | null;
	dispose(): void;
}

// Мировой размер одного повтора плиточных текстур (единицы мира): нужен геометрии, чтобы задать UV.
export const textureTileSizes = {
	hallFloor: 2,
	paving: 2,
	asphalt: 2,
	grass: 3,
	kitchenMat: 1,
} as const;

// Рисовальщик: получает контекст и ГПСЧ, рисует в canvas заданного размера.
type Painter = (context: CanvasRenderingContext2D, width: number, height: number, rng: Rng) => void;

// Цвет в CSS по HSL (оттенок в градусах, насыщенность и светлота в процентах).
function hsl(hue: number, saturation: number, lightness: number, alpha = 1): string {
	return `hsla(${hue.toFixed(1)}, ${saturation.toFixed(1)}%, ${lightness.toFixed(1)}%, ${alpha})`;
}

// Рисует прямоугольник с переносом через правый и нижний край (для бесшовных текстур).
function fillWrappedRect(context: CanvasRenderingContext2D, x: number, y: number, rectWidth: number, rectHeight: number, width: number, height: number): void {
	for (const offsetX of [0, -width, width]) {
		for (const offsetY of [0, -height, height]) {
			const left = x + offsetX;
			const top = y + offsetY;
			if (left + rectWidth < 0 || left > width || top + rectHeight < 0 || top > height) {
				continue;
			}
			context.fillRect(left, top, rectWidth, rectHeight);
		}
	}
}

// Доски пола зала: 8 рядов по 0.25 единицы, длина досок 0.8..1.6, швы рядов сдвинуты, лёгкие волокна.
const paintHallFloor: Painter = (context, width, height, rng) => {
	const rows = 8;
	const rowHeight = height / rows;
	for (let row = 0; row < rows; row += 1) {
		const top = row * rowHeight;
		let x = rng.next() * width;
		const rowEnd = x + width;
		while (x < rowEnd - 1) {
			const plankLength = Math.min(rowEnd - x, width * (0.4 + rng.next() * 0.4));
			const lightness = 58 + (rng.next() - 0.5) * 10;
			const hue = 30 + (rng.next() - 0.5) * 6;
			context.fillStyle = hsl(hue, 46, lightness);
			fillWrappedRect(context, x % width, top, plankLength, rowHeight, width, height);
			// Волокна: тонкие полосы чуть темнее вдоль доски.
			for (let grain = 0; grain < 5; grain += 1) {
				context.fillStyle = hsl(hue, 40, lightness - 6 - rng.next() * 6, 0.35);
				const grainY = top + 4 + rng.next() * (rowHeight - 8);
				fillWrappedRect(context, x % width, grainY, plankLength * (0.4 + rng.next() * 0.6), 1.5, width, height);
			}
			// Торцевой шов доски.
			context.fillStyle = hsl(26, 40, 30, 0.85);
			fillWrappedRect(context, (x + plankLength) % width, top, 2, rowHeight, width, height);
			x += plankLength;
		}
		// Продольный шов между рядами и светлая кромка под ним.
		context.fillStyle = hsl(26, 40, 28, 0.9);
		context.fillRect(0, top, width, 2);
		context.fillStyle = hsl(32, 50, 72, 0.35);
		context.fillRect(0, top + 2, width, 1.5);
	}
};

// Плитка тротуара: камни 0.5 единицы, ряды со сдвигом на полкамня, шов раствора, светлая и тёмная кромки для объёма.
const paintPaving: Painter = (context, width, height, rng) => {
	const stones = 4;
	const stoneSize = width / stones;
	const mortar = 5;
	context.fillStyle = "#9c948a";
	context.fillRect(0, 0, width, height);
	for (let row = 0; row < stones; row += 1) {
		const shift = row % 2 === 0 ? 0 : stoneSize / 2;
		for (let column = 0; column < stones + 1; column += 1) {
			const left = column * stoneSize + shift + mortar / 2;
			const top = row * stoneSize + mortar / 2;
			const size = stoneSize - mortar;
			const lightness = 80 + (rng.next() - 0.5) * 8;
			const hue = 34 + (rng.next() - 0.5) * 10;
			context.fillStyle = hsl(hue, 14, lightness);
			fillWrappedRect(context, left, top, size, size, width, height);
			context.fillStyle = hsl(hue, 18, lightness + 7, 0.8);
			fillWrappedRect(context, left, top, size, 3, width, height);
			fillWrappedRect(context, left, top, 3, size, width, height);
			context.fillStyle = hsl(hue, 12, lightness - 14, 0.7);
			fillWrappedRect(context, left, top + size - 3, size, 3, width, height);
			fillWrappedRect(context, left + size - 3, top, 3, size, width, height);
		}
	}
	// Мелкая крошка по всей поверхности.
	for (let speck = 0; speck < 900; speck += 1) {
		context.fillStyle = rng.next() < 0.5 ? "rgba(255,255,255,0.18)" : "rgba(60,50,40,0.14)";
		context.fillRect(rng.next() * width, rng.next() * height, 2, 2);
	}
};

// Асфальт: тёмно-серая основа и светлая и тёмная крошка.
const paintAsphalt: Painter = (context, width, height, rng) => {
	context.fillStyle = "#4d535a";
	context.fillRect(0, 0, width, height);
	for (let speck = 0; speck < 2600; speck += 1) {
		const light = rng.next() < 0.45;
		context.fillStyle = light ? `rgba(200,205,210,${0.12 + rng.next() * 0.2})` : `rgba(20,22,26,${0.15 + rng.next() * 0.25})`;
		const size = 1 + Math.floor(rng.next() * 2);
		context.fillRect(rng.next() * width, rng.next() * height, size, size);
	}
};

// Трава: зелёная основа, короткие штрихи травинок разных оттенков, редкие цветочки.
const paintGrass: Painter = (context, width, height, rng) => {
	context.fillStyle = "#79a94f";
	context.fillRect(0, 0, width, height);
	for (let blade = 0; blade < 1400; blade += 1) {
		const lightness = 30 + rng.next() * 22;
		context.fillStyle = hsl(88 + rng.next() * 22, 45, lightness, 0.55);
		fillWrappedRect(context, rng.next() * width, rng.next() * height, 1.5, 3 + rng.next() * 4, width, height);
	}
	const flowerColors = ["#ffffff", "#ffe066", "#f7a1c4"];
	for (let flower = 0; flower < 14; flower += 1) {
		context.fillStyle = flowerColors[flower % flowerColors.length];
		fillWrappedRect(context, rng.next() * width, rng.next() * height, 2.5, 2.5, width, height);
	}
};

// Ковёр: бордовое поле, кремовая кайма с золотой линией, ромбы в центре.
const paintRug: Painter = (context, width, height) => {
	context.fillStyle = "#8a2f3b";
	context.fillRect(0, 0, width, height);
	const border = width * 0.09;
	context.strokeStyle = "#efe0c2";
	context.lineWidth = border * 0.55;
	context.strokeRect(border * 0.6, border * 0.6, width - border * 1.2, height - border * 1.2);
	context.strokeStyle = "#d7a84a";
	context.lineWidth = 3;
	context.strokeRect(border * 1.25, border * 1.25, width - border * 2.5, height - border * 2.5);
	// Ромбы узора: большой в центре и малые по углам поля.
	const drawDiamond = (centerX: number, centerY: number, radius: number, color: string) => {
		context.fillStyle = color;
		context.beginPath();
		context.moveTo(centerX, centerY - radius);
		context.lineTo(centerX + radius, centerY);
		context.lineTo(centerX, centerY + radius);
		context.lineTo(centerX - radius, centerY);
		context.closePath();
		context.fill();
	};
	drawDiamond(width / 2, height / 2, width * 0.22, "#d7a84a");
	drawDiamond(width / 2, height / 2, width * 0.15, "#6d2230");
	drawDiamond(width / 2, height / 2, width * 0.07, "#efe0c2");
	const corner = width * 0.27;
	for (const [cornerX, cornerY] of [
		[corner, corner],
		[width - corner, corner],
		[corner, height - corner],
		[width - corner, height - corner],
	]) {
		drawDiamond(cornerX, cornerY, width * 0.05, "#efe0c2");
	}
};

// Резиновый коврик: тёмно-серое поле с сеткой круглых отверстий.
const paintKitchenMat: Painter = (context, width, height) => {
	context.fillStyle = "#6c7a83";
	context.fillRect(0, 0, width, height);
	const step = width / 8;
	context.fillStyle = "#4f5b63";
	for (let row = 0; row < 8; row += 1) {
		for (let column = 0; column < 8; column += 1) {
			context.beginPath();
			context.arc(column * step + step / 2, row * step + step / 2, step * 0.26, 0, Math.PI * 2);
			context.fill();
		}
	}
};

// Грифельная доска: рамка из дерева, тёмное поле, строки "меню" волнистыми штрихами мела (без букв) и рисунки бургера и тарелки рагу.
const paintChalkboard: Painter = (context, width, height, rng) => {
	context.fillStyle = "#7a4e2d";
	context.fillRect(0, 0, width, height);
	const frame = 12;
	context.fillStyle = "#2f3d36";
	context.fillRect(frame, frame, width - frame * 2, height - frame * 2);
	// Разводы мела по полю.
	for (let smudge = 0; smudge < 30; smudge += 1) {
		context.fillStyle = "rgba(255,255,255,0.03)";
		context.beginPath();
		context.arc(frame + rng.next() * (width - frame * 2), frame + rng.next() * (height - frame * 2), 8 + rng.next() * 20, 0, Math.PI * 2);
		context.fill();
	}
	context.strokeStyle = "rgba(245,245,235,0.85)";
	context.lineCap = "round";
	// Заголовок: короткая жирная волна по центру.
	context.lineWidth = 4;
	context.beginPath();
	for (let x = width * 0.32; x <= width * 0.68; x += 4) {
		const y = frame + 22 + Math.sin(x * 0.35) * 3;
		if (x === width * 0.32) context.moveTo(x, y);
		else context.lineTo(x, y);
	}
	context.stroke();
	// Строки меню: слева волнистая "надпись", справа короткая "цена".
	context.lineWidth = 2;
	const firstLineY = frame + 48;
	const lineStep = (height - frame * 2 - 60) / 4;
	for (let line = 0; line < 4; line += 1) {
		const y = firstLineY + line * lineStep;
		const textEnd = width * (0.42 + rng.next() * 0.12);
		context.beginPath();
		context.moveTo(width * 0.3, y);
		for (let x = width * 0.3; x <= textEnd; x += 3) {
			context.lineTo(x, y + Math.sin(x * 0.6 + line) * 2.5 + (rng.next() - 0.5) * 1.5);
		}
		context.stroke();
		context.beginPath();
		context.moveTo(width * 0.78, y);
		context.lineTo(width * 0.86, y + (rng.next() - 0.5) * 2);
		context.stroke();
	}
	// Бургер мелом слева сверху: булка, котлета, булка.
	const burgerX = width * 0.15;
	const burgerY = height * 0.42;
	context.lineWidth = 2.5;
	context.strokeStyle = "rgba(255,214,120,0.95)";
	context.beginPath();
	context.arc(burgerX, burgerY, 16, Math.PI, 0);
	context.closePath();
	context.stroke();
	context.strokeStyle = "rgba(240,140,110,0.95)";
	context.strokeRect(burgerX - 17, burgerY + 4, 34, 6);
	context.strokeStyle = "rgba(255,214,120,0.95)";
	context.strokeRect(burgerX - 16, burgerY + 13, 32, 6);
	// Тарелка рагу слева снизу с паром.
	const bowlY = height * 0.74;
	context.strokeStyle = "rgba(245,245,235,0.9)";
	context.beginPath();
	context.arc(burgerX, bowlY, 16, 0, Math.PI);
	context.closePath();
	context.stroke();
	for (let steam = -1; steam <= 1; steam += 1) {
		context.beginPath();
		context.moveTo(burgerX + steam * 7, bowlY - 4);
		context.quadraticCurveTo(burgerX + steam * 7 + 5, bowlY - 12, burgerX + steam * 7, bowlY - 20);
		context.stroke();
	}
};

// Картина: пейзаж с холмами и солнцем.
const paintLandscape: Painter = (context, width, height) => {
	const sky = context.createLinearGradient(0, 0, 0, height);
	sky.addColorStop(0, "#7cc0e8");
	sky.addColorStop(1, "#fbe3b8");
	context.fillStyle = sky;
	context.fillRect(0, 0, width, height);
	context.fillStyle = "#ffd25e";
	context.beginPath();
	context.arc(width * 0.72, height * 0.3, width * 0.12, 0, Math.PI * 2);
	context.fill();
	context.fillStyle = "#7fb35a";
	context.beginPath();
	context.moveTo(0, height * 0.7);
	context.quadraticCurveTo(width * 0.3, height * 0.45, width * 0.6, height * 0.68);
	context.quadraticCurveTo(width * 0.8, height * 0.55, width, height * 0.62);
	context.lineTo(width, height);
	context.lineTo(0, height);
	context.fill();
	context.fillStyle = "#4f8a3e";
	context.beginPath();
	context.moveTo(0, height * 0.85);
	context.quadraticCurveTo(width * 0.5, height * 0.68, width, height * 0.86);
	context.lineTo(width, height);
	context.lineTo(0, height);
	context.fill();
	context.fillStyle = "#6b4a2b";
	context.fillRect(width * 0.24, height * 0.55, width * 0.03, height * 0.14);
	context.fillStyle = "#3f7a3a";
	context.beginPath();
	context.arc(width * 0.255, height * 0.52, width * 0.08, 0, Math.PI * 2);
	context.fill();
};

// Картина: натюрморт с грушей и яблоком на столе.
const paintStillLife: Painter = (context, width, height) => {
	context.fillStyle = "#f2dcb3";
	context.fillRect(0, 0, width, height);
	context.fillStyle = "#c98b5a";
	context.fillRect(0, height * 0.68, width, height * 0.32);
	context.fillStyle = "#d94b3d";
	context.beginPath();
	context.arc(width * 0.38, height * 0.6, width * 0.15, 0, Math.PI * 2);
	context.fill();
	context.fillStyle = "#e8c13f";
	context.beginPath();
	context.ellipse(width * 0.64, height * 0.6, width * 0.11, height * 0.15, 0.2, 0, Math.PI * 2);
	context.fill();
	context.beginPath();
	context.arc(width * 0.61, height * 0.45, width * 0.07, 0, Math.PI * 2);
	context.fill();
	context.fillStyle = "#4f8a3e";
	context.beginPath();
	context.ellipse(width * 0.44, height * 0.42, width * 0.06, height * 0.025, -0.6, 0, Math.PI * 2);
	context.fill();
	context.fillStyle = "rgba(255,255,255,0.55)";
	context.beginPath();
	context.arc(width * 0.33, height * 0.55, width * 0.035, 0, Math.PI * 2);
	context.fill();
};

// Картина: тёплая абстракция из цветных блоков.
const paintAbstract: Painter = (context, width, height, rng) => {
	const colors = ["#e76f51", "#f4a261", "#e9c46a", "#2a9d8f", "#264653", "#f7ede2"];
	context.fillStyle = "#f7ede2";
	context.fillRect(0, 0, width, height);
	for (let block = 0; block < 7; block += 1) {
		context.fillStyle = colors[Math.floor(rng.next() * colors.length)];
		context.fillRect(rng.next() * width * 0.7, rng.next() * height * 0.7, width * (0.2 + rng.next() * 0.4), height * (0.15 + rng.next() * 0.35));
	}
	context.strokeStyle = "#264653";
	context.lineWidth = 4;
	context.strokeRect(width * 0.12, height * 0.12, width * 0.76, height * 0.76);
};

// Значок сердца: розовое сердце с белой обводкой.
const paintHeart: Painter = (context, width, height) => {
	const drawHeartPath = (scale: number) => {
		const centerX = width / 2;
		const top = height * (0.5 - 0.3 * scale);
		context.beginPath();
		context.moveTo(centerX, height * (0.5 + 0.36 * scale));
		context.bezierCurveTo(centerX - width * 0.5 * scale, height * (0.5 + 0.02 * scale), centerX - width * 0.36 * scale, top - height * 0.1 * scale, centerX, top + height * 0.12 * scale);
		context.bezierCurveTo(centerX + width * 0.36 * scale, top - height * 0.1 * scale, centerX + width * 0.5 * scale, height * (0.5 + 0.02 * scale), centerX, height * (0.5 + 0.36 * scale));
		context.closePath();
	};
	context.fillStyle = "#ffffff";
	drawHeartPath(1);
	context.fill();
	context.fillStyle = "#ff4f7a";
	drawHeartPath(0.8);
	context.fill();
	context.fillStyle = "rgba(255,255,255,0.6)";
	context.beginPath();
	context.ellipse(width * 0.38, height * 0.36, width * 0.07, height * 0.045, -0.6, 0, Math.PI * 2);
	context.fill();
};

// Значок раздражения: белый кружок с красным знаком из четырёх изогнутых штрихов (как вздувшаяся жилка в манге).
const paintAngry: Painter = (context, width, height) => {
	const centerX = width / 2;
	const centerY = height / 2;
	context.fillStyle = "#ffffff";
	context.beginPath();
	context.arc(centerX, centerY, width * 0.46, 0, Math.PI * 2);
	context.fill();
	context.strokeStyle = "#e0312b";
	context.lineWidth = width * 0.11;
	context.lineCap = "round";
	const gap = width * 0.07;
	const reach = width * 0.27;
	for (const [signX, signY] of [
		[-1, -1],
		[1, -1],
		[-1, 1],
		[1, 1],
	]) {
		context.beginPath();
		context.moveTo(centerX + signX * gap, centerY + signY * reach);
		context.quadraticCurveTo(centerX + signX * gap, centerY + signY * gap, centerX + signX * reach, centerY + signY * gap);
		context.stroke();
	}
};

// Создаёт canvas и рисует в нём. null, если canvas или 2D-контекст недоступны.
function paintCanvas(width: number, height: number, seed: number, painter: Painter): HTMLCanvasElement | null {
	if (typeof document === "undefined") {
		return null;
	}
	try {
		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext("2d");
		if (!context) {
			return null;
		}
		painter(context, width, height, createRng(seed));
		return canvas;
	} catch {
		return null;
	}
}

// Создаёт набор текстур. enabled = false (нет WebGL-вывода, тесты) даёт набор из null без обращения к canvas.
export function createSceneTextures(enabled: boolean): SceneTextures {
	const created: Texture[] = [];

	function make(width: number, height: number, seed: number, painter: Painter, tiled: boolean): Texture | null {
		if (!enabled) {
			return null;
		}
		const canvas = paintCanvas(width, height, seed, painter);
		if (!canvas) {
			return null;
		}
		const texture = new CanvasTexture(canvas);
		texture.colorSpace = SRGBColorSpace;
		texture.anisotropy = 8;
		if (tiled) {
			texture.wrapS = RepeatWrapping;
			texture.wrapT = RepeatWrapping;
		}
		created.push(texture);
		return texture;
	}

	return {
		hallFloor: make(512, 512, 11, paintHallFloor, true),
		paving: make(512, 512, 23, paintPaving, true),
		asphalt: make(256, 256, 37, paintAsphalt, true),
		grass: make(256, 256, 41, paintGrass, true),
		rug: make(256, 256, 53, paintRug, false),
		kitchenMat: make(128, 128, 59, paintKitchenMat, true),
		chalkboard: make(256, 192, 61, paintChalkboard, false),
		paintings: [make(128, 96, 71, paintLandscape, false), make(96, 128, 73, paintStillLife, false), make(128, 96, 79, paintAbstract, false)],
		emoteHeart: make(64, 64, 83, paintHeart, false),
		emoteAngry: make(64, 64, 89, paintAngry, false),
		dispose() {
			created.forEach((texture) => texture.dispose());
			created.length = 0;
		},
	};
}
