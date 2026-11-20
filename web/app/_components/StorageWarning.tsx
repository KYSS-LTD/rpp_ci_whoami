"use client";

import { useSyncExternalStore } from "react";
import { platformStorage } from "@/core/storage";
import { commonTexts } from "@/texts/common";
import styles from "./StorageWarning.module.css";

// Статус хранилища не меняется во время сессии, поэтому подписка ничего не делает.
function subscribeToNothing(): () => void {
	return () => {};
}

// Предупреждение, если LocalStorage недоступен. На сервере статус неизвестен, поэтому там предупреждение не рисуется,
// а в браузере статус читается после гидратации.
export function StorageWarning({ storageStatus }: { storageStatus?: () => "persistent" | "memory" }) {
	const readStatus = storageStatus ?? platformStorage.getStatus;
	const isMemoryOnly = useSyncExternalStore(
		subscribeToNothing,
		() => readStatus() === "memory",
		() => false,
	);

	if (!isMemoryOnly) {
		return null;
	}

	return (
		<p role="alert" className={styles.warning}>
			{commonTexts.storageWarning}
		</p>
	);
}
