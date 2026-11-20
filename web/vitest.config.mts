// Настройки тестов: псевдоним "@/" как в tsconfig.json и браузерное окружение jsdom для компонентов и LocalStorage.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./", import.meta.url)),
		},
	},
	test: {
		environment: "jsdom",
		include: ["**/*.test.{ts,tsx}"],
		exclude: ["node_modules/**", ".next/**"],
	},
});
