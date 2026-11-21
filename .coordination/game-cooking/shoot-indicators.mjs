// Снимки индикаторов над станциями (готовка зелёная полоса, подгорание красная полоса) крупным планом: headless Chrome по CDP
// (порт 9447), страница харнесса с демо-снимком (цикл сковороды: 0-6 с готовка, 6-12 с готово и подгорает, 12-16 с сгорело).
// Запуск: node .coordination/game-cooking/shoot-indicators.mjs. Скриншоты кладутся в папку отчёта. Тексты скрипта отладочные.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const chromePath = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const devServer = process.env.COOKING_DEV_URL ?? "http://localhost:5174";
const debugPort = 9447;
const outDir = process.env.SHOTS_DIR ?? "C:/Users/ynovka/AppData/Local/Claude-Data/claude_pzs8sxrjxfjjc/side-session-notes/local_b426fc06-ef34-48c4-a3c2-601d0bf67c9e";
mkdirSync(outDir, { recursive: true });

// Моменты цикла первой сковороды (easy) и что ожидается на индикаторе.
const shots = [
	{ name: "cooking-half", time: 3, note: "готовка наполовину: зелёная полоса 50 процентов, красная пуста" },
	{ name: "ready-burn-30", time: 7.8, note: "готово, подгорание 30 процентов: зелёная полна, красная заполнена на 30" },
	{ name: "ready-burn-60", time: 9.6, note: "готово, подгорание 60 процентов" },
	{ name: "ready-burn-90-warning", time: 11.4, note: "готово, подгорание 90 процентов: красная мигает" },
	{ name: "burnt", time: 13, note: "сгорело: индикатора нет" },
];

const chrome = spawn(
	chromePath,
	["--headless=new", `--remote-debugging-port=${debugPort}`, "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--hide-scrollbars", "--mute-audio", `--user-data-dir=${join(tmpdir(), "cooking-indicator-profile")}`, "--no-first-run", "about:blank"],
	{ stdio: "ignore" },
);

async function getJson(url) {
	for (let attempt = 0; attempt < 60; attempt += 1) {
		try {
			return await (await fetch(url)).json();
		} catch {
			await sleep(250);
		}
	}
	throw new Error("нет отладочного порта Chrome");
}

const targets = await getJson(`http://127.0.0.1:${debugPort}/json`);
const page = targets.find((target) => target.type === "page");
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolveOpen) => (socket.onopen = resolveOpen));
let nextId = 0;
const pending = new Map();
socket.onmessage = (message) => {
	const data = JSON.parse(message.data);
	if (data.id && pending.has(data.id)) {
		pending.get(data.id)(data);
		pending.delete(data.id);
	}
};
const send = (method, params = {}) =>
	new Promise((resolveSend) => {
		nextId += 1;
		pending.set(nextId, resolveSend);
		socket.send(JSON.stringify({ id: nextId, method, params }));
	});
async function evaluate(expression) {
	const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
	return response.result?.result?.value;
}

try {
	await send("Runtime.enable");
	await send("Page.enable");
	await send("Emulation.setDeviceMetricsOverride", { width: 1000, height: 560, deviceScaleFactor: 1, mobile: false });
	for (const shot of shots) {
		await send("Page.navigate", { url: `${devServer}/harness.html?level=easy&freeze&phase=running&time=${shot.time}&cam=2.6,7.6,6` });
		let ready = false;
		for (let attempt = 0; attempt < 240 && !ready; attempt += 1) {
			await sleep(500);
			ready = (await evaluate("!!window.harness?.hud")) === true;
		}
		if (!ready) throw new Error(`харнесс не запустился: ${shot.name}`);
		await evaluate(`(() => { const hud = document.querySelector(".cooking-hud"); if (hud) hud.style.display = "none"; })()`);
		await sleep(1200);
		const state = await evaluate(`(() => { const find = (name) => window.harness.scene.scene.getObjectByName(name); const indicator = find("indicator-pan-1"); const progress = find("bar-progress"); return JSON.stringify({ visible: indicator?.visible, progress: indicator?.getObjectByName("bar-progress")?.scale.x, burn: indicator?.getObjectByName("bar-burn")?.scale.x }); })()`);
		console.log(`${shot.name}: ${shot.note}; индикатор ${state}`);
		const png = await send("Page.captureScreenshot", { format: "png" });
		writeFileSync(join(outDir, `stations-indicators-${shot.name}.png`), Buffer.from(png.result.data, "base64"));
	}
} finally {
	socket.close();
	chrome.kill();
}
process.exit(0);
