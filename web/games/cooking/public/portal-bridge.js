/*
 * Мост между игрой и порталом профессий (протокол версии 1, docs/game-bridge-protocol.md).
 * Обычный скрипт без зависимостей: подключается в three.js-проект, любую HTML5-игру и шаблон Unity WebGL.
 *
 *   <script src="portal-bridge.js"></script>
 *   PortalBridge.onStart(function (start) { startLevel(start.levelId); });
 *   PortalBridge.finish({ score: 8, maxScore: 10 });
 *
 * Если открыть игру напрямую, без портала, мост работает в автономном режиме: уровень берётся из адреса (?level=easy),
 * а сообщения пишутся в консоль. Так игру удобно запускать и отлаживать отдельно.
 *
 * Значения протокола повторяют core/bridge/protocol.ts портала: при изменении протокола править оба файла.
 */
(function (win) {
	"use strict";

	var PROTOCOL_VERSION = 1;
	var GAME_SOURCE = "portal-game";
	var PORTAL_SOURCE = "portal";
	var LEVEL_IDS = ["easy", "medium", "hard"];

	// Игра открыта внутри портала, если у окна есть родитель.
	var isEmbedded = win.parent !== win;

	var startCallback = null;
	var startPayload = null;
	var isReadySent = false;
	var isFinished = false;

	// Уровень из адреса сборки. Портал всегда передаёт его в параметре level.
	function readLevelFromUrl() {
		var match = /[?&]level=([^&#]*)/.exec(win.location && win.location.search ? win.location.search : "");
		var levelId = match ? decodeURIComponent(match[1]) : "";
		return LEVEL_IDS.indexOf(levelId) === -1 ? "easy" : levelId;
	}

	// Отправляет сообщение порталу или в консоль в автономном режиме.
	function send(type, fields) {
		var message = { source: GAME_SOURCE, version: PROTOCOL_VERSION, type: type };
		for (var key in fields) {
			if (Object.prototype.hasOwnProperty.call(fields, key)) {
				message[key] = fields[key];
			}
		}
		if (isEmbedded) {
			// "*": у изолированного фрейма портала нет адресуемого источника, а в сообщениях нет секретов.
			win.parent.postMessage(message, "*");
		} else if (typeof console !== "undefined") {
			console.info("[PortalBridge] автономный режим, сообщение порталу:", message);
		}
	}

	function deliverStart() {
		if (startCallback && startPayload) {
			var callback = startCallback;
			startCallback = null;
			callback(startPayload);
		}
	}

	// Сообщение о старте принимается только от портала (родительского окна) и в правильном формате.
	win.addEventListener("message", function (event) {
		var data = event.data;
		if (event.source !== win.parent || !data || data.source !== PORTAL_SOURCE || data.version !== PROTOCOL_VERSION) {
			return;
		}
		if (data.type === "start" && !startPayload) {
			startPayload = { gameId: String(data.gameId), levelId: String(data.levelId) };
			deliverStart();
		}
	});

	function isFiniteNumber(value) {
		return typeof value === "number" && isFinite(value);
	}

	win.PortalBridge = {
		// Версия протокола, с которой работает этот файл.
		protocolVersion: PROTOCOL_VERSION,

		// true, если игра открыта внутри портала.
		isEmbedded: isEmbedded,

		// Уровень из адреса. Удобно, чтобы заранее загрузить ресурсы уровня, пока ждём старта.
		getLevelId: readLevelFromUrl,

		// Подписка на старт уровня. Первый вызов сообщает порталу, что игра готова.
		// callback получает { gameId, levelId }. Вызывается один раз.
		onStart: function (callback) {
			startCallback = callback;
			if (!isEmbedded && !startPayload) {
				startPayload = { gameId: "standalone", levelId: readLevelFromUrl() };
			}
			if (!isReadySent) {
				isReadySent = true;
				send("ready", {});
			}
			deliverStart();
		},

		// Итог уровня: { score, maxScore, completed }. completed по умолчанию true.
		// Возвращает false, если результат уже отправлен или числа неверные (результат тогда не отправляется).
		finish: function (result) {
			if (isFinished || !result) {
				return false;
			}
			var score = result.score;
			var maxScore = result.maxScore;
			if (!isFiniteNumber(score) || !isFiniteNumber(maxScore) || maxScore <= 0 || score < 0 || score > maxScore) {
				if (typeof console !== "undefined") {
					console.error("[PortalBridge] неверный результат, нужно 0 <= score <= maxScore и maxScore > 0:", result);
				}
				return false;
			}
			isFinished = true;
			send("level-result", { score: score, maxScore: maxScore, completed: result.completed !== false });
			return true;
		},

		// Игрок вышел без результата. Портал покажет экран незавершённого уровня и ничего не сохранит.
		exit: function () {
			if (!isFinished) {
				isFinished = true;
				send("exit", {});
			}
		},

		// Игра не может продолжать (нет WebGL, не загрузились данные). Портал покажет экран с повтором.
		reportError: function (message) {
			send("error", { message: String(message || "") });
		},
	};
})(typeof window !== "undefined" ? window : this);
