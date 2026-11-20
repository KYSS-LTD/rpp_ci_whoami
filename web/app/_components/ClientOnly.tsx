"use client";

import { useSyncExternalStore, type ReactNode } from "react";

// Подписка не нужна: признак "мы в браузере" не меняется после гидратации.
function subscribeToNothing(): () => void {
	return () => {};
}

// Рисует содержимое только в браузере после гидратации.
// Компоненты внутри читают LocalStorage при отрисовке, а на сервере данных нет, поэтому без этой обёртки
// разметка сервера и браузера расходится (hydration mismatch).
export function ClientOnly({ children }: { children: ReactNode }) {
	const isClient = useSyncExternalStore(
		subscribeToNothing,
		() => true,
		() => false,
	);
	return isClient ? children : null;
}
