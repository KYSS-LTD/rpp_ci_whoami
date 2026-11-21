// Публичный вход рендера: функции с именами и сигнатурами из interfaces.md (раздел 2). Остальные файлы папки внутренние.
// prepareAssets - подготовка ресурсов (6.1), createSceneRenderer - сцена (6.2-6.7), createDishIcons - иконки для HUD.
export { prepareAssets } from "./prepare";
export { createSceneRenderer } from "./sceneRenderer";
export { createDishIcons } from "./dishIcons";
export { createFrameLoop } from "./frameLoop";
export type { LoadedAssets } from "./assets";
