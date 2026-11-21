// Съёмка кадров превью игры cooking для библиотеки игр (задача 9.5): headless Chrome по протоколу CDP, окно 1280x800 (16:10),
// сцена и HUD игры на настоящей Simulation под управлением эталонного бота (страница харнесса /harness.html).
// Запуск (нужен dev-сервер cooking на порту 5174: npm run dev:cooking из папки web):
//   node .coordination/game-cooking/capture-previews.mjs
// Результат: web/public/game-previews/cooking/frame-1.webp и frame-2.webp (плюс PNG-копии во временной папке для просмотра).
// Скрипт служебный и не входит в сборку игры. Тексты здесь отладочные.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const chromePath = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const devServer = process.env.COOKING_DEV_URL ?? "http://localhost:5174";
const debugPort = 9444;
const width = 1280;
const height = 800;
const outDir = resolve(import.meta.dirname, "../../web/public/game-previews/cooking");
const pngDir = join(tmpdir(), "cooking-preview-shots");
mkdirSync(pngDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

// Кадры: страница харнесса, оценка выразительности момента (функция страницы), приближение камеры, показ HUD.
// Бот прокручивается без рендера: сначала на копии симуляции ищется момент с наибольшей оценкой, потом основная симуляция
// проматывается до него (симуляция и бот детерминированы).
const shots = [
	{
		name: "frame-1",
		// Идёт готовка, официант несёт блюдо, зал заселён, на улице очередь: крупный план без HUD (в ленте виден только первый кадр).
		url: `${devServer}/harness.html?level=easy&bot&speed=0&phase=ready`,
		closeup: [9, 4.9, 22],
		botSec: 200,
		hideHud: true,
		minSec: 20,
		maxSec: 170,
		score: `(s) => {
			const cooking = s.stations.filter((x) => (x.kind === "pan" || x.kind === "oven" || x.kind === "pot") && (x.phase === "processing" || x.phase === "ready")).length;
			const seated = s.customers.filter((c) => c.isSeated).length;
			const carrying = s.waiters.some((w) => w.carrying.length > 0 && w.moving);
			const queued = s.customers.filter((c) => c.phase === "queued").length;
			const visibleProgress = s.stations.filter((x) => x.phase === "processing" && x.progress > 0.35).length;
			return (carrying ? 4 : 0) + Math.min(cooking, 2) * 2 + Math.min(visibleProgress, 2) * 2 + (s.chef.working ? 3 : 0) + Math.min(seated, 4) + Math.min(queued, 3) * 2 + (s.chef.hand ? 1 : 0);
		}`,
	},
	{
		name: "frame-2",
		// Полный зал и карточки заказов: игровая камера и HUD, как их видит игрок.
		url: `${devServer}/harness.html?level=hard&bot&speed=0&phase=ready`,
		closeup: null,
		hideHud: false,
		// Бот играет первые 60 секунд (готовка идёт, часть блюд подана), потом игрок бездействует: зал наполняется заказами.
		botSec: 60,
		minSec: 60,
		maxSec: 280,
		score: `(s) => {
			if (s.phase !== "running") return -1000;
			const minRatio = Math.min(1, ...s.tables.flatMap((t) => t.orders.filter((o) => o.status !== "served").map((o) => o.patienceRatio)), ...s.queue.map((g) => g.patienceRatio));
			if (minRatio < 0.12) return -1000;
			const waitingTables = s.tables.filter((t) => t.state === "waiting" && t.orders.length > 0).length;
			const orders = s.tables.reduce((sum, t) => sum + t.orders.length, 0);
			const seated = s.customers.filter((c) => c.isSeated).length;
			const cooking = s.stations.filter((x) => (x.kind === "pan" || x.kind === "oven" || x.kind === "pot") && (x.phase === "processing" || x.phase === "ready")).length;
			const carrying = s.waiters.some((w) => w.carrying.length > 0);
			return Math.min(waitingTables, 5) * 3 + Math.min(orders, 9) + Math.min(seated, 10) + Math.min(cooking, 3) + (s.queue.length > 0 ? 3 : 0) + (carrying ? 2 : 0);
		}`,
	},
];

const chrome = spawn(
	chromePath,
	[
		"--headless=new",
		`--remote-debugging-port=${debugPort}`,
		"--use-angle=swiftshader",
		"--enable-unsafe-swiftshader",
		"--ignore-gpu-blocklist",
		"--hide-scrollbars",
		"--mute-audio",
		`--window-size=${width},${height}`,
		`--user-data-dir=${join(tmpdir(), "cooking-preview-profile")}`,
		"--no-first-run",
		"about:blank",
	],
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
const consoleErrors = [];
socket.onmessage = (message) => {
	const data = JSON.parse(message.data);
	if (data.id && pending.has(data.id)) {
		pending.get(data.id)(data);
		pending.delete(data.id);
	} else if (data.method === "Runtime.consoleAPICalled" && data.params.type === "error") {
		consoleErrors.push(data.params.args.map((arg) => arg.value ?? arg.description).join(" ").slice(0, 200));
	} else if (data.method === "Runtime.exceptionThrown") {
		consoleErrors.push(JSON.stringify(data.params.exceptionDetails).slice(0, 200));
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
	if (response.result?.exceptionDetails) {
		const details = response.result.exceptionDetails;
		throw new Error(`ошибка в странице: ${details.exception?.description ?? details.text} (выражение: ${expression.slice(0, 80)})`);
	}
	return response.result?.result?.value;
}

await send("Runtime.enable");
await send("Page.enable");
// Размер окна 1280x800 в пикселях страницы, плотность 1: PNG и WebP получаются ровно 1280x800.
await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });

try {
	for (const shot of shots) {
		console.log(`кадр ${shot.name}: загрузка ${shot.url}`);
		await send("Page.navigate", { url: shot.url });
		// Ждём харнесс: загрузка 87 моделей и иконок блюд на программном рендере занимает до минуты.
		let ready = false;
		for (let attempt = 0; attempt < 240 && !ready; attempt += 1) {
			await sleep(500);
			ready = (await evaluate("!!window.harness?.simulation")) === true;
		}
		if (!ready) {
			throw new Error(`харнесс не запустился для ${shot.name}`);
		}
		await evaluate(`document.querySelector(".hud-dialog--start .hud-button--primary")?.click()`);
		// Поиск лучшего момента на копии симуляции и перемотка основной симуляции до него.
		const best = await evaluate(`JSON.stringify(window.harness.scanBestStep(${shot.score}, ${shot.minSec}, ${shot.maxSec}, ${shot.botSec}))`);
		const { step, score } = JSON.parse(best);
		await evaluate(`window.harness.runBotSteps(${step}, ${shot.botSec})`);
		const state = await evaluate(`(() => { const s = window.harness.simulation.getSnapshot(); return JSON.stringify({ phase: s.phase, t: Math.round(s.elapsedSec), served: s.servedCustomers, waiterCarrying: s.waiters.map((w) => w.carrying.length), tables: s.tables.filter((t) => t.orders.length > 0).length, seated: s.customers.filter((c) => c.isSeated).length, queue: s.queue.length }); })()`);
		console.log(`кадр ${shot.name}: лучший момент на шаге ${step} (оценка ${score}): ${state}`);
		if (shot.closeup) {
			await evaluate(`window.harness.closeup(${shot.closeup.join(", ")})`);
		}
		if (shot.hideHud) {
			await evaluate(`(() => { const hud = document.querySelector(".cooking-hud"); if (hud) hud.style.display = "none"; })()`);
		}
		// Даём кадрам дорисоваться: плавные движения персонажей и индикаторы приходят в установившееся положение.
		await sleep(2500);
		const png = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
		const webp = await send("Page.captureScreenshot", { format: "webp", quality: 88, captureBeyondViewport: false });
		writeFileSync(join(pngDir, `${shot.name}.png`), Buffer.from(png.result.data, "base64"));
		writeFileSync(join(outDir, `${shot.name}.webp`), Buffer.from(webp.result.data, "base64"));
	}
	console.log("ошибки консоли страницы:", consoleErrors.length === 0 ? "нет" : consoleErrors.join(" | "));
} finally {
	socket.close();
	chrome.kill();
}
process.exit(0);
