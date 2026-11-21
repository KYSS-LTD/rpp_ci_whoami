// Глобальные объявления сборки: типы Vite (import.meta.env) и мост с порталом (portal-bridge.js, подключён обычным скриптом).
/// <reference types="vite/client" />

import type { PortalBridgeApi } from "./contracts";

declare global {
	interface ImportMetaEnv {
		// Режим отладки, одна переменная на портал и игру (CodeStyle, п.3). Значение "true" включает отладочный оверлей.
		readonly NEXT_PUBLIC_DEBUG?: string;
	}

	interface Window {
		// Мост с порталом из portal-bridge.js (копия sdk/web/portal-bridge.js).
		PortalBridge: PortalBridgeApi;
	}
}
