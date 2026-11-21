// Сборка игры "Повар" (cooking): Vite, TypeScript и three.js. Запуск: npm run dev:cooking и npm run build:cooking из папки web.
// Сборка идёт в public/game-builds/cooking/ портала и открывается во фрейме по адресу /game-builds/cooking/index.html.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Папка игры (корень проекта Vite) и папка web портала.
const gameRoot = fileURLToPath(new URL(".", import.meta.url));
const webRoot = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
	root: gameRoot,
	// Относительные пути: сборка работает из любой папки, в том числе из /game-builds/cooking/ в изолированном фрейме.
	base: "./",
	// Переменная отладки одна на портал и игру: NEXT_PUBLIC_DEBUG читается из .env папки web.
	envDir: webRoot,
	envPrefix: ["NEXT_PUBLIC_"],
	build: {
		outDir: fileURLToPath(new URL("../../public/game-builds/cooking", import.meta.url)),
		emptyOutDir: true,
		target: "es2020",
		// Предупреждение о размере чанка отключено: three.js в vendor/ заведомо больше 500 КБ.
		chunkSizeWarningLimit: 1500,
		rollupOptions: {
			output: {
				// three.js выделяется в чанк внутри vendor/: сторонние библиотеки пропускают check:dashes и ESLint.
				manualChunks(moduleId) {
					if (moduleId.includes("node_modules/three/")) {
						return "three";
					}
					return undefined;
				},
				chunkFileNames(chunkInfo) {
					return chunkInfo.name === "three" ? "vendor/[name]-[hash].js" : "assets/[name]-[hash].js";
				},
			},
		},
	},
	server: {
		port: 5174,
		// Корень проекта Vite внутри web, поэтому разрешаем читать файлы всей папки web (общий .env, sdk).
		fs: { allow: [webRoot] },
	},
});
