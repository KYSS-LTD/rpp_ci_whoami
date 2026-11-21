import fontkit from "@pdf-lib/fontkit";
import { BlendMode, PDFDocument, rgb } from "pdf-lib";
import type { LevelResult } from "../contract/types";
import { issueDiploma } from "./index";
import { diplomasTexts } from "@/texts/diplomas";
import { commonTexts } from "@/texts/common";

function color(hex: number) {
	return rgb((hex >> 16) / 255, (hex >> 8 & 255) / 255, (hex & 255) / 255);
}

async function fetchAsset(path: string, signal?: AbortSignal) {
	const response = await fetch(path, { signal });
	if (!response.ok) throw new Error(`PDF asset unavailable: ${path}`);
	return response.arrayBuffer();
}

export async function createDiplomaPdf(
	result: LevelResult,
	name: string,
	gameTitle: string,
	levelTitle: string,
	difficulty: string,
	issuedAt: string,
	signal?: AbortSignal,
) {
	const diploma = issueDiploma(result, name, issuedAt);
	if (!diploma) throw new Error("Invalid diploma data");
	const [fontFile, logoFile, flagFile] = await Promise.all([
		fetchAsset("/diploma/NotoSans.ttf", signal),
		fetchAsset("/brand/logo.png", signal),
		fetchAsset("/brand/kyss.png", signal),
	]);
	const pdf = await PDFDocument.create();
	pdf.registerFontkit(fontkit);
	const font = await pdf.embedFont(fontFile, { subset: true });
	const logo = await pdf.embedPng(logoFile);
	const flag = await pdf.embedPng(flagFile);
	const supported = new Set(font.getCharacterSet());
	const page = pdf.addPage([842, 595]);
	const { width, height } = page.getSize();
	const ink = color(0x16241c);
	const green = color(0x17573a);
	const deep = color(0x124a30);
	const muted = color(0x55675c);
	const line = color(0xd3e4d9);
	const medal = {
		gold: color(0x83550f),
		silver: color(0x4a5664),
		bronze: color(0x894d2b),
	}[diploma.rating];
	const copy = diplomasTexts.result.pdf;

	function centered(value: string, y: number, maxSize: number, maxWidth: number, center = width / 2, textColor = ink) {
		const printable = Array.from(value, (character) => supported.has(character.codePointAt(0)!) ? character : "?").join("");
		const naturalWidth = font.widthOfTextAtSize(printable, maxSize);
		const size = Math.min(maxSize, maxSize * maxWidth / Math.max(naturalWidth, 1));
		page.drawText(printable, { x: center - font.widthOfTextAtSize(printable, size) / 2, y, size, font, color: textColor });
	}

	page.drawRectangle({ x: 0, y: 0, width, height, color: color(0xf3f7f4) });
	page.drawRectangle({ x: 34, y: 34, width: width - 68, height: height - 68, color: rgb(1, 1, 1), borderColor: line, borderWidth: 1 });
	page.drawRectangle({ x: 34, y: 468, width: width - 68, height: 93, color: deep });
	page.drawRectangle({ x: 34, y: 465, width: width - 68, height: 3, color: color(0xf0c419) });
	page.drawImage(logo, { x: 66, y: 491, ...logo.scaleToFit(48, 48) });
	page.drawText(commonTexts.siteName, { x: 129, y: 510, size: 16, font, color: rgb(1, 1, 1) });
	// Screen сохраняет зелёный фон под чёрными пикселями флага и оставляет белую надпись.
	page.drawImage(flag, { x: 657, y: 486, ...flag.scaleToFit(112, 60), blendMode: BlendMode.Screen });

	centered(copy.heading, 395, 48, 670, width / 2, green);
	centered(copy.intro, 358, 15, 670, width / 2, muted);
	centered(diploma.playerName, 302, 34, 670);
	centered(gameTitle, 250, 21, 650, width / 2, green);
	if (levelTitle !== difficulty && levelTitle !== gameTitle) centered(levelTitle, 224, 14, 650, width / 2, muted);

	const minutes = Math.floor(result.durationSec / 60);
	const seconds = result.durationSec % 60;
	const metrics = [
		{ label: copy.difficulty, value: difficulty, ink },
		{ label: copy.score, value: `${result.score} / ${result.maxScore}`, ink },
		{ label: copy.rating, value: diplomasTexts.ratings[diploma.rating], ink: medal },
		{ label: copy.duration, value: `${minutes}:${String(seconds).padStart(2, "0")}`, ink },
	];
	metrics.forEach((metric, index) => {
		const x = 87 + index * 170;
		page.drawRectangle({ x, y: 117, width: 158, height: 70, color: color(0xebf3ee), borderColor: line, borderWidth: 1 });
		centered(metric.label, 159, 11, 138, x + 79, muted);
		centered(metric.value, 135, 16, 138, x + 79, metric.ink);
	});
	const date = new Intl.DateTimeFormat("ru-RU").format(new Date(issuedAt));
	centered(`${copy.issued} · ${date}`, 73, 12, 670, width / 2, muted);
	pdf.setTitle(`${copy.heading} / ${gameTitle}`);
	pdf.setAuthor(`${commonTexts.siteName} · KYSS`);
	return new Blob([new Uint8Array(await pdf.save())], { type: "application/pdf" });
}
