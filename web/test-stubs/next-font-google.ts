// Заглушка next/font/google для тестов. В vitest нет компилятора Next.js, который превращает вызов шрифта в CSS,
// поэтому любой шрифт возвращает пустые классы. Подключается псевдонимом в vitest.config.mts.

interface FontResult {
	className: string;
	variable: string;
	style: { fontFamily: string };
}

function createFontStub(): FontResult {
	return { className: "", variable: "", style: { fontFamily: "monospace" } };
}

// Любое имя шрифта (Manrope, Pixelify_Sans, PT_Mono и другие) возвращает одну и ту же заглушку.
export const Manrope = createFontStub;
export const Pixelify_Sans = createFontStub;
export const PT_Mono = createFontStub;
