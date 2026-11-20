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

// Манифест игры: данные, по которым платформа регистрирует игру.
export interface GameManifest {
	gameId: string;
	title: string;
	description: string;
	contractVersion: number;
	levels: LevelDefinition[];
	professionTags: ProfessionWeight[];
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
