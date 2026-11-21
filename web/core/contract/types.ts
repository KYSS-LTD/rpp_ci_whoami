// Типы контракта игры по спецификации game-module-contract.
import type { ComponentType } from "react";

// Версия контракта, которую поддерживает платформа. Игра с другой версией не регистрируется.
export const supportedContractVersion = 1;

// Три уровня сложности. Других уровней у игры быть не может.
export const requiredLevelIds = ["easy", "medium", "hard"] as const;

export type LevelId = (typeof requiredLevelIds)[number];

// Описание уровня: идентификатор и название, которое берется из текстов игры.
export interface LevelDefinition {
	id: LevelId;
	title: string;
}

// Связь игры с профессией. Вес от 0 до 1 показывает, насколько игра отражает профессию.
export interface ProfessionWeight {
	professionId: string;
	weight: number;
}

// Форматы игр. По формату библиотека игр показывает метку и фильтрует ленту.
export const gameFormats = ["quiz", "2d", "3d", "simulation"] as const;

export type GameFormat = (typeof gameFormats)[number];

// Превью игры: кадры из игры, которые библиотека листает с плавным приближением.
// Пути указываются от папки public, например "/game-previews/demo/frame-1.svg".
// Кадр может быть анимированным (SVG с анимацией, GIF, анимированный WebP).
export interface GamePreview {
	frames: string[];
	// Анимация первого кадра в открытой карточке, если движение разрешено настройкой браузера.
	animation?: string;
}

// Время ожидания сообщения о готовности от iframe-игры по умолчанию, в секундах.
export const defaultReadyTimeoutSec = 30;

// Папка, в которой лежат сборки iframe-игр (public/game-builds). Путь к сборке обязан начинаться с /game-builds/<gameId>/.
export const gameBuildsPath = "/game-builds";

// Запуск игры из готовой веб-сборки (Unity WebGL, three.js и другие) во фрейме, см. capability game-iframe-bridge.
export interface IframeRuntime {
	kind: "iframe";
	// Стартовая страница сборки, например "/game-builds/my-game/index.html".
	entry: string;
	// Сколько секунд ждать сообщения о готовности. Без поля используется defaultReadyTimeoutSec.
	readyTimeoutSec?: number;
}

// Манифест игры: данные, по которым платформа регистрирует игру.
// Поля после professionTags необязательные: они нужны только витрине библиотеки игр.
export interface GameManifest {
	gameId: string;
	title: string;
	description: string;
	contractVersion: number;
	levels: LevelDefinition[];
	professionTags: ProfessionWeight[];
	// Формат игры. Без него игра показывается без метки формата и попадает только в фильтр "Все".
	format?: GameFormat;
	// Краткая сводка для карточки игры в библиотеке. Без неё показывается description.
	summary?: string;
	// Кадры из игры. Без них библиотека рисует обложку-заглушку.
	preview?: GamePreview;
	// Примерное время одного уровня в минутах.
	estimatedMinutes?: number;
	// Игра ещё в разработке: библиотека показывает метку "В разработке".
	inDevelopment?: boolean;
	// Готовая веб-сборка вместо React-компонентов уровней. Без поля игра запускается через levelComponents.
	runtime?: IframeRuntime;
}

// Стандартный результат уровня, который игра передает платформе.
export interface LevelResult {
	gameId: string;
	levelId: LevelId;
	score: number;
	maxScore: number;
	completed: boolean;
	durationSec: number;
}

export type PracticeActivity = "assembly" | "survey" | "beach" | "field" | "race";

export interface PracticeAttempt {
	gameId: string;
	activity: PracticeActivity;
	difficulty: LevelId | null;
	score: number;
	completed: boolean;
	durationSec: number;
}

// Пропсы компонента уровня. Игра отдает результат через onFinish и не хранит состояние платформы.
export interface LevelComponentProps {
	level: LevelDefinition;
	onFinish: (result: LevelResult) => void;
}

// Вход реестра: модуль игры. Реестр проверяет только манифест, компоненты уровней передаются как есть.
export interface GameModuleInput {
	manifest: unknown;
	levelComponents?: Partial<Record<LevelId, ComponentType<LevelComponentProps>>>;
}

// Результат проверки манифеста: либо валидный манифест, либо список причин отказа.
export type ManifestValidation = { ok: true; manifest: GameManifest } | { ok: false; reasons: string[] };
