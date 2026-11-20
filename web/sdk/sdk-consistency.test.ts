import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Пути от папки web (тесты запускаются из неё через npm run test).
const webRoot = process.cwd();
const originalBridgePath = "sdk/web/portal-bridge.js";

// Копии веб-SDK, которые обязаны совпадать с оригиналом: шаблон Unity и сборки игр-примеров.
const bridgeCopies = [
	"sdk/unity/WebGLTemplates/Portal/portal-bridge.js",
	"public/game-builds/city-builder/portal-bridge.js",
];

function readWebFile(relativePath: string): string {
	return readFileSync(resolve(webRoot, relativePath), "utf8");
}

describe("согласованность SDK", () => {
	it("копии portal-bridge.js совпадают с sdk/web/portal-bridge.js", () => {
		const original = readWebFile(originalBridgePath);
		for (const copyPath of bridgeCopies) {
			expect(readWebFile(copyPath), `${copyPath} отличается от ${originalBridgePath}, скопируйте оригинал заново`).toBe(original);
		}
	});

	it("плагин Unity вызывает только существующие методы веб-SDK", () => {
		const jslib = readWebFile("sdk/unity/Plugins/PortalBridge.jslib");
		const calledMethods = new Set(Array.from(jslib.matchAll(/window\.PortalBridge\.(\w+)\(/g), (match) => match[1]));
		expect([...calledMethods].sort()).toEqual(["exit", "finish", "getLevelId", "onStart", "reportError"]);
		const fakeWindow: Record<string, unknown> = { location: { search: "" }, addEventListener: () => undefined };
		fakeWindow.parent = fakeWindow;
		new Function("window", readWebFile(originalBridgePath))(fakeWindow);
		const bridge = fakeWindow.PortalBridge as Record<string, unknown>;
		for (const method of calledMethods) {
			expect(typeof bridge[method], method).toBe("function");
		}
	});

	it("обёртка C# объявляет все функции плагина", () => {
		const jslib = readWebFile("sdk/unity/Plugins/PortalBridge.jslib");
		const csharp = readWebFile("sdk/unity/Scripts/PortalBridge.cs");
		const pluginFunctions = Array.from(jslib.matchAll(/^\t(PortalBridge_\w+): function/gm), (match) => match[1]);
		expect(pluginFunctions.length).toBe(5);
		const externLines = csharp.split(/\r?\n/).filter((line) => line.includes("static extern"));
		for (const functionName of pluginFunctions) {
			expect(externLines.some((line) => line.includes(` ${functionName}(`)), functionName).toBe(true);
		}
	});
});
