/*
 * Плагин Unity WebGL: вызовы из C# (PortalBridge.cs) в веб-SDK портала (portal-bridge.js).
 * portal-bridge.js подключает шаблон WebGLTemplates/Portal, а сам экземпляр Unity шаблон кладёт в window.portalUnityInstance.
 *
 * Положите файл в Assets/Plugins/ проекта Unity.
 * Не проверено на реальной Unity-сборке: проверяет первая команда с Unity-игрой (см. sdk/README.md).
 */
mergeInto(LibraryManager.library, {
	// Сообщает порталу о готовности и ждёт старта уровня. Старт приходит в C# через SendMessage на объект objectName.
	PortalBridge_Init: function (objectNamePtr) {
		var objectName = UTF8ToString(objectNamePtr);
		if (typeof window.PortalBridge === "undefined") {
			console.error("[PortalBridge] portal-bridge.js не подключён: соберите игру с шаблоном WebGLTemplates/Portal");
			return;
		}
		window.PortalBridge.onStart(function (start) {
			// Экземпляр Unity может появиться чуть позже первого кадра: ждём его, а не теряем старт.
			function deliverStart() {
				if (window.portalUnityInstance) {
					window.portalUnityInstance.SendMessage(objectName, "HandlePortalStart", start.levelId);
				} else {
					setTimeout(deliverStart, 50);
				}
			}
			deliverStart();
		});
	},

	// Уровень из адреса сборки ("easy", "medium", "hard"), чтобы заранее загрузить ресурсы уровня.
	PortalBridge_GetLevelId: function () {
		var levelId = typeof window.PortalBridge === "undefined" ? "easy" : window.PortalBridge.getLevelId();
		var size = lengthBytesUTF8(levelId) + 1;
		var buffer = _malloc(size);
		stringToUTF8(levelId, buffer, size);
		return buffer;
	},

	// Итог уровня. Возвращает 1, если результат отправлен, и 0, если он неверный или уже был отправлен.
	PortalBridge_Finish: function (score, maxScore, completed) {
		if (typeof window.PortalBridge === "undefined") {
			return 0;
		}
		return window.PortalBridge.finish({ score: score, maxScore: maxScore, completed: completed !== 0 }) ? 1 : 0;
	},

	// Игрок вышел без результата.
	PortalBridge_Exit: function () {
		if (typeof window.PortalBridge !== "undefined") {
			window.PortalBridge.exit();
		}
	},

	// Игра не может продолжать.
	PortalBridge_ReportError: function (messagePtr) {
		if (typeof window.PortalBridge !== "undefined") {
			window.PortalBridge.reportError(UTF8ToString(messagePtr));
		}
	},
});
