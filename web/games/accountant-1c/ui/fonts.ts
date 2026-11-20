// Шрифты игры (design.md, D11): пиксельный для заголовков и вывесок, моноширинный для бумаг и калькулятора.
// next/font раздаёт файлы шрифтов с самого сайта, внешних запросов при игре нет.
import { PT_Mono, Pixelify_Sans } from "next/font/google";

export const pixelFont = Pixelify_Sans({
	subsets: ["latin", "cyrillic"],
	variable: "--acc-font-pixel",
	display: "swap",
});

export const paperFont = PT_Mono({
	subsets: ["latin", "cyrillic"],
	weight: "400",
	variable: "--acc-font-paper",
	display: "swap",
});

// Классы с переменными шрифтов для корня сцены.
export const fontVariables = `${pixelFont.variable} ${paperFont.variable}`;
