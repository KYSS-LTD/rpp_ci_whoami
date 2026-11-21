// Точка входа игры cooking: подключает стили и запускает игру (game.ts). Модели, связь с порталом, симуляция, ввод, сцена и HUD
// собираются там; здесь только корневой элемент страницы и обработка непредвиденной ошибки запуска.
import "./base.css";
import { debugLog } from "./config/debug";
import { startGame } from "./game";
import { systemTexts } from "./texts";
import type { PortalBridgeApi } from "./contracts";

const bridge = (window as unknown as { PortalBridge: PortalBridgeApi }).PortalBridge;
const root = document.getElementById("game-root");
document.title = systemTexts.documentTitle;

if (!root) {
	bridge.reportError(systemTexts.unexpectedError);
} else {
	startGame({ bridge, root }).catch((error: unknown) => {
		debugLog("main", "игра не запустилась", error);
		bridge.reportError(systemTexts.unexpectedError);
	});
}
