// Предзагрузка анимаций подсказок рецептов: GIF шагов (или неподвижные постеры при prefers-reduced-motion) начинают грузиться
// сразу, как только известно, какие подсказки покажутся, пока игрок читает стартовый экран. Когда шаг открывается, картинка уже
// в кэше браузера и сразу проигрывается, без пустого кадра. Ссылки на объекты Image держит вызывающий: иначе загрузку может
// отменить сборщик мусора.
import { dishTutorials } from "../config/tutorial";
import type { DishId } from "../contracts";

// Папка подсказок в сборке (относительный путь, как у <img> в HUD).
export const TUTORIAL_DIR = "tutorial/";

// Включено ли у игрока уменьшение движения: тогда HUD показывает постеры, и грузить нужно их.
function prefersReducedMotion(): boolean {
	return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Запускает загрузку картинок всех шагов подсказок по блюдам в порядке показа. Первая картинка грузится с высоким приоритетом,
// остальные следом. Возвращает созданные Image (держать до конца показа подсказок). Без DOM (тесты в node) возвращает пустой список.
export function preloadTutorialImages(dishes: readonly DishId[]): HTMLImageElement[] {
	if (typeof Image === "undefined" || dishes.length === 0) {
		return [];
	}
	const usePosters = prefersReducedMotion();
	const images: HTMLImageElement[] = [];
	for (const dish of dishes) {
		for (const step of dishTutorials[dish].steps) {
			const image = new Image();
			image.decoding = "async";
			image.fetchPriority = images.length === 0 ? "high" : "low";
			image.src = `${TUTORIAL_DIR}${usePosters ? step.posterFile : step.animationFile}`;
			images.push(image);
		}
	}
	return images;
}
