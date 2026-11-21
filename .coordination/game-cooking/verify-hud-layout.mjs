// Проверка раскладки карточек заказов HUD на телефонах в альбомной ориентации (дефект H1): свой headless Chrome по CDP
// (порт 9446), эмуляция сенсорного экрана, страница харнесса /harness.html на dev-сервере cooking (порт 5174).
// Блок карточек справа сверху, пауза и очередь слева сверху.
// Для каждого размера окна и каждого сценария измеряются реальные прямоугольники из DOM: все карточки внутри блока, блок не
// обрезается (overflow виден) и не пересекает таймер, паузу, очередь, стик и экранные кнопки. Скриншоты кладутся в папку отчёта.
// Запуск: node .coordination/game-cooking/verify-hud-layout.mjs
// Тексты скрипта отладочные.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const chromePath = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const devServer = process.env.COOKING_DEV_URL ?? "http://localhost:5174";
const debugPort = 9446;
const outDir = process.env.SHOTS_DIR ?? "C:/Users/ynovka/AppData/Local/Claude-Data/claude_pzs8sxrjxfjjc/side-session-notes/local_b426fc06-ef34-48c4-a3c2-601d0bf67c9e";
mkdirSync(outDir, { recursive: true });

// DESKTOP=1: окна компьютера и планшета без касаний (проверка, что полный вид карточек тоже не обрезается).
const isDesktop = process.env.DESKTOP === "1";
const sizes = isDesktop
	? [
			[1280, 800],
			[1024, 768],
		]
	: [
			[844, 390],
			[667, 375],
			[740, 360],
			[932, 430],
		];
// Сценарии: демо-снимок со всеми заполненными столами hard (16 заказов) и настоящая симуляция hard после минуты без действий игрока.
const scenarios = [
	...(isDesktop ? [{ name: "demo-light", url: (extra) => `${devServer}/harness.html?level=hard&freeze&phase=running&time=20${extra}` }] : []),
	{ name: "demo-full", url: (extra) => `${devServer}/harness.html?level=hard&full&freeze&phase=running&time=20${extra}` },
	{ name: "sim-idle", url: (extra) => `${devServer}/harness.html?level=hard&bot&speed=0&phase=ready${extra}` },
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
		`--user-data-dir=${join(tmpdir(), "cooking-hud-verify-profile")}`,
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
const pageErrors = [];
socket.onmessage = (message) => {
	const data = JSON.parse(message.data);
	if (data.id && pending.has(data.id)) {
		pending.get(data.id)(data);
		pending.delete(data.id);
	} else if (data.method === "Runtime.exceptionThrown") {
		pageErrors.push(JSON.stringify(data.params.exceptionDetails).slice(0, 200));
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

// Измерение в странице: прямоугольники блоков HUD и сенсорных элементов.
const measureExpression = `(() => {
	const rect = (selector) => { const element = document.querySelector(selector); if (!element) return null; const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: r.width, h: r.height }; };
	const orders = document.querySelector(".hud-orders");
	const cards = [...document.querySelectorAll(".hud-card")].map((card) => { const r = card.getBoundingClientRect(); return { id: card.dataset.tableId, x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: r.width, h: r.height, overflowX: card.scrollWidth - card.clientWidth, overflowY: card.scrollHeight - card.clientHeight, orders: card.querySelectorAll(".hud-order").length }; });
	return JSON.stringify({
		vw: innerWidth, vh: innerHeight,
		mode: window.harness?.input?.getMode?.() ?? null,
		density: orders?.dataset.density, fits: orders?.dataset.fits, screen: document.querySelector(".cooking-hud")?.dataset.screen,
		overflow: orders ? getComputedStyle(orders).overflow : null,
		orders: rect(".hud-orders"), cards,
		timer: rect(".hud-timer"), stats: rect(".hud-stats"), pause: rect(".hud-pause-button"), queue: rect(".hud-queue"),
		stick: rect(".cooking-touch-stick"), buttons: rect(".cooking-touch-buttons"),
		tablesWithOrders: window.harness?.simulation ? window.harness.simulation.getSnapshot().tables.filter((t) => t.orders.length > 0).length : null,
		ordersTotal: window.harness?.simulation ? window.harness.simulation.getSnapshot().tables.reduce((sum, t) => sum + t.orders.length, 0) : null,
	});
})()`;

function intersects(first, second) {
	return Boolean(first && second) && first.x < second.right - 0.5 && second.x < first.right - 0.5 && first.y < second.bottom - 0.5 && second.y < first.bottom - 0.5;
}

const problems = [];
const lines = [];
await send("Runtime.enable");
await send("Page.enable");
try {
	for (const [width, height] of sizes) {
		for (const scenario of scenarios) {
			const label = `${width}x${height} ${scenario.name}`;
			// Мобильная эмуляция с касаниями: (pointer: coarse) включает сенсорный режим игры.
			await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: isDesktop ? 1 : 2, mobile: !isDesktop });
			await send("Emulation.setTouchEmulationEnabled", { enabled: !isDesktop, maxTouchPoints: isDesktop ? 0 : 5 });
			await send("Page.navigate", { url: scenario.url(isDesktop ? "&mode=keyboard" : "&mode=touch") });
			let ready = false;
			for (let attempt = 0; attempt < 240 && !ready; attempt += 1) {
				await sleep(500);
				ready = (await evaluate("!!window.harness?.hud")) === true;
			}
			if (!ready) throw new Error(`харнесс не запустился: ${label}`);
			if (scenario.name === "sim-idle") {
				await evaluate(`document.querySelector(".hud-dialog--start .hud-button--primary")?.click()`);
				// Без действий игрока гости рассаживаются и ждут заказ: шагаем по 5 секунд, пока столов с заказами не станет 5 и больше
				// (но терпение первых гостей ещё не кончилось).
				for (let chunk = 0; chunk < 24; chunk += 1) {
					await evaluate(`window.harness.runBotSteps(300, 0)`);
					const state = JSON.parse(await evaluate(`JSON.stringify((() => { const s = window.harness.simulation.getSnapshot(); const ratios = s.tables.flatMap((t) => t.orders.map((o) => o.patienceRatio)); return { phase: s.phase, tables: s.tables.filter((t) => t.orders.length > 0).length, minRatio: ratios.length ? Math.min(...ratios) : 1 }; })())`));
					if (state.phase !== "running" || state.tables >= 6 || (state.tables >= 5 && state.minRatio < 0.35)) break;
				}
			}
			await sleep(2500);
			const m = JSON.parse(await evaluate(measureExpression));
			const issues = [];
			if (!isDesktop && m.mode !== "touch" && scenario.name === "sim-idle") issues.push(`режим ввода ${m.mode}, ожидался touch`);
			if (m.cards.length === 0) issues.push("нет карточек");
			if (m.overflow !== "visible") issues.push(`overflow блока ${m.overflow}`);
			const orderRect = m.orders;
			for (const card of m.cards) {
				if (card.x < orderRect.x - 0.5 || card.right > orderRect.right + 0.5 || card.y < orderRect.y - 0.5 || card.bottom > orderRect.bottom + 0.5) issues.push(`карточка ${card.id} вне блока`);
				if (card.right > m.vw || card.bottom > m.vh || card.x < 0 || card.y < 0) issues.push(`карточка ${card.id} вне окна`);
				if (card.overflowX > 1 || card.overflowY > 1) issues.push(`содержимое карточки ${card.id} вылезает (${card.overflowX}, ${card.overflowY})`);
				for (const [name, other] of [["таймер", m.timer], ["блок таймера", m.stats], ["пауза", m.pause], ["очередь", m.queue], ["стик", m.stick], ["кнопки", m.buttons]]) {
					if (other && intersects(card, other)) issues.push(`карточка ${card.id} пересекает ${name}`);
				}
			}
			// Блок заказов справа сверху: правая половина окна, выше экранных кнопок; пауза и очередь слева.
			if (orderRect.x < m.vw / 2) issues.push("блок заказов заходит в левую половину окна");
			if (m.buttons && m.buttons.w > 0 && orderRect.bottom > m.buttons.y - 0.5) issues.push(`блок заходит на экранные кнопки (низ ${orderRect.bottom.toFixed(0)}, верх кнопок ${m.buttons.y.toFixed(0)})`);
			if (m.pause && m.pause.x > m.vw / 2) issues.push("пауза не слева");
			if (m.queue && m.queue.x > m.vw / 2) issues.push("очередь не слева");
			lines.push(`${label}: режим ${m.mode}, вид ${m.density}, помещается ${m.fits}, экран ${m.screen}, карточек ${m.cards.length}, заказов ${m.cards.reduce((sum, card) => sum + card.orders, 0)}, блок ${orderRect.w.toFixed(0)}x${orderRect.h.toFixed(0)} (низ ${orderRect.bottom.toFixed(0)} из ${m.vh}), кнопки ${m.buttons && m.buttons.w > 0 ? "видны, верх " + m.buttons.y.toFixed(0) : "нет"}, пауза x=${m.pause ? m.pause.x.toFixed(0) : "-"}${issues.length ? "  ПРОБЛЕМЫ: " + issues.join("; ") : "  ok"}`);
			problems.push(...issues.map((issue) => `${label}: ${issue}`));
			const shot = await send("Page.captureScreenshot", { format: "png" });
			writeFileSync(join(outDir, `hud-h1-${width}x${height}-${scenario.name}${isDesktop ? "-desktop" : ""}.png`), Buffer.from(shot.result.data, "base64"));
		}
	}
	console.log(lines.join("\n"));
	console.log(problems.length === 0 ? "ИТОГ: проблем нет" : `ИТОГ: проблем ${problems.length}`);
	console.log("исключения страницы:", pageErrors.length === 0 ? "нет" : pageErrors.join(" | "));
} finally {
	socket.close();
	chrome.kill();
}
process.exit(problems.length === 0 ? 0 : 1);
