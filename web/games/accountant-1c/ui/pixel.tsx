// Пиксельные персонажи для окошка (design.md, D11). Свои спрайты 16 × 18 точек: строка - ряд, символ - цвет из палитры.
// Рисуются прямоугольниками SVG с чёткими краями, поэтому не размываются на плотных экранах.
import styles from "./pixel.module.css";

export type CharacterId = "chief" | "director" | "courier" | "inspector" | "collector" | "visitor";

type Palette = Record<string, string>;

// Общая кожа и глаза для всех персонажей.
const skinColors: Palette = { S: "#e8b796", s: "#c98f6c", E: "#1f1a17", M: "#9b4a3a", W: "#f4efe1" };

const chiefSprite = [
	"......HHHH......",
	".....HHHHHH.....",
	"....HHHHHHHH....",
	"...HHHHHHHHHH...",
	"..HHSSSSSSSSHH..",
	"..HSSSSSSSSSSH..",
	"..HGGGSSSSGGGH..",
	"..HGEGGGGGGEGH..",
	"..HSGGSSSSGGSH..",
	"...SSSSssSSSS...",
	"...SSSMMMMSSS...",
	"....SSSSSSSS....",
	".....ssSSss.....",
	"...CCWWWWWWCC...",
	"..CCCCCWWCCCCC..",
	".CCCCCCCCCCCCCC.",
	"CCCCCCCCCCCCCCCC",
	"CCCCCCCCCCCCCCCC",
];

const directorSprite = [
	"................",
	"....SSSSSSSS....",
	"...SSSSSSSSSS...",
	"..hSSSSSSSSSSh..",
	"..hSSSSSSSSSSh..",
	"..hSEESSSSEESh..",
	"..SSSSSSSSSSSS..",
	"..SSSSSssSSSSS..",
	"...SShhhhhhSS...",
	"...SSSMMMMSSS...",
	"....SSSSSSSS....",
	".....ssSSss.....",
	"...CCWWWWWWCC...",
	"..CCCCWTTWCCCC..",
	".CCCCCCTTCCCCCC.",
	"CCCCCCCTTCCCCCCC",
	"CCCCCCCTTCCCCCCC",
	"CCCCCCCCCCCCCCCC",
];

// Голова и плечи без шапки: подходит посетителям.
const personSprite = [
	"................",
	"....HHHHHHHH....",
	"...HHHHHHHHHH...",
	"..HHHHHHHHHHHH..",
	"..HSSSSSSSSSSH..",
	"..HSEESSSSEESH..",
	"..SSSSSSSSSSSS..",
	"..SSSSSssSSSSS..",
	"...SSSSSSSSSS...",
	"...SSSMMMMSSS...",
	"....SSSSSSSS....",
	".....ssSSss.....",
	"...CCCCCCCCCC...",
	"..CCCCCccCCCCC..",
	".CCCCCCccCCCCCC.",
	"CCCCCCCccCCCCCCC",
	"CCCCCCCccCCCCCCC",
	"CCCCCCCCCCCCCCCC",
];

// Персонаж в кепке с козырьком.
const cappedSprite = [
	"................",
	"....KKKKKKKK....",
	"...KKKKKKKKKK...",
	"..KKKKKKKKKKKKkk",
	"..HSSSSSSSSSSH..",
	"..HSEESSSSEESH..",
	"..SSSSSSSSSSSS..",
	"..SSSSSssSSSSS..",
	"...SSSSSSSSSS...",
	"...SSSMMMMSSS...",
	"....SSSSSSSS....",
	".....ssSSss.....",
	"...CCCCCCCCCC...",
	"..CCCCCTTCCCCC..",
	".CCCCCCTTCCCCCC.",
	"CCCCCCCTTCCCCCCC",
	"CCCCCCCTTCCCCCCC",
	"CCCCCCCCCCCCCCCC",
];

// Фуражка с околышем и кокардой, мундир с пуговицами.
const uniformSprite = [
	"...KKKKKKKKKK...",
	"..KKKKKKKKKKKK..",
	"..TTTTTWWTTTTT..",
	".kkkkkkkkkkkkkk.",
	"..HSSSSSSSSSSH..",
	"..HSEESSSSEESH..",
	"..SSSSSSSSSSSS..",
	"..SSSSSssSSSSS..",
	"...SSSSSSSSSS...",
	"...SSSMMMMSSS...",
	"....SSSSSSSS....",
	".....ssSSss.....",
	"...CCCCCCCCCC...",
	"..CCCCCWCCCCCC..",
	".CCCCCCCCCCCCCC.",
	"CCCCCCCWCCCCCCCC",
	"CCCCCCCCCCCCCCCC",
	"CCCCCCCWCCCCCCCC",
];

interface CharacterLook {
	sprite: string[];
	palette: Palette;
}

const characterLooks: Record<Exclude<CharacterId, "visitor">, CharacterLook> = {
	chief: { sprite: chiefSprite, palette: { H: "#5b3a29", G: "#c9952e", C: "#2f7d7a" } },
	director: { sprite: directorSprite, palette: { h: "#8a8a8a", C: "#2d3442", T: "#c8102e" } },
	courier: { sprite: cappedSprite, palette: { K: "#c8102e", k: "#8e0b1f", H: "#3b2a20", C: "#e07b24", T: "#f6d64b" } },
	inspector: { sprite: uniformSprite, palette: { K: "#24324a", k: "#141d2e", T: "#c9a227", H: "#2a2a2a", C: "#24324a", W: "#e9d27a" } },
	collector: { sprite: cappedSprite, palette: { K: "#4b5563", k: "#2f3640", H: "#2a2a2a", C: "#6b7280", T: "#f6d64b" } },
};

// Посетители кассы различаются причёской и одеждой.
const visitorPalettes: Palette[] = [
	{ H: "#3b2f2a", C: "#5b7fa6", c: "#46688c" },
	{ H: "#b0703a", C: "#8c6bb1", c: "#735896" },
	{ H: "#1f1a17", C: "#c97b2a", c: "#a86520" },
	{ H: "#d9b46a", C: "#4f8a5b", c: "#3e7049" },
];

// Ряд пикселей в виде отрезков одного цвета: меньше элементов SVG.
function toRuns(row: string, palette: Palette): Array<{ x: number; width: number; color: string }> {
	const runs: Array<{ x: number; width: number; color: string }> = [];
	let index = 0;
	while (index < row.length) {
		const symbol = row[index];
		let end = index + 1;
		while (end < row.length && row[end] === symbol) {
			end += 1;
		}
		const color = palette[symbol];
		if (symbol !== "." && color) {
			runs.push({ x: index, width: end - index, color });
		}
		index = end;
	}
	return runs;
}

export function getCharacterLook(character: CharacterId, variant = 0): CharacterLook {
	if (character === "visitor") {
		return { sprite: personSprite, palette: visitorPalettes[variant % visitorPalettes.length] };
	}
	return characterLooks[character];
}

interface PixelCharacterProps {
	character: CharacterId;
	variant?: number;
	label?: string;
	className?: string;
}

// Персонаж в окошке. Слегка покачивается, при сниженном движении стоит неподвижно (pixel.module.css).
export function PixelCharacter({ character, variant = 0, label, className }: PixelCharacterProps) {
	const look = getCharacterLook(character, variant);
	const palette = { ...skinColors, ...look.palette };
	return (
		<svg
			viewBox="0 0 16 18"
			className={`${styles.character} ${className ?? ""}`}
			shapeRendering="crispEdges"
			role={label ? "img" : undefined}
			aria-label={label}
			aria-hidden={label ? undefined : true}
			data-character={character}
		>
			{look.sprite.map((row, rowIndex) =>
				toRuns(row, palette).map((run) => <rect key={`${rowIndex}-${run.x}`} x={run.x} y={rowIndex} width={run.width} height={1} fill={run.color} />),
			)}
		</svg>
	);
}
