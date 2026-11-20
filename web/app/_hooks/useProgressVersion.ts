import { useSyncExternalStore } from "react";
import { getProgressVersion, subscribeToProgress } from "@/core/progress";

// Перерисовывает компонент при каждом изменении прогресса (имя, результаты, сброс).
export function useProgressVersion(): number {
	return useSyncExternalStore(subscribeToProgress, getProgressVersion, () => 0);
}
