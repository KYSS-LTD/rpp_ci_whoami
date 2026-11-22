import { Suspense } from "react";
import { gameRegistry } from "@/core/registry";
import { ClientOnly } from "../../../_components/ClientOnly";
import { LevelRunner } from "../../../_components/LevelRunner";

interface LevelPageProps {
	params: Promise<{ gameId: string; level: string }>;
}

// Все пары игра-уровень из реестра известны при сборке, поэтому страницы уровней собираются заранее.
export function generateStaticParams(): { gameId: string; level: string }[] {
	return gameRegistry.games.flatMap(({ manifest }) => {
		const gameId = manifest.gameId;
		const levels: string[] = manifest.levels.map((level) => level.id);
		if (gameId === "uav-operator") levels.push("free");
		return levels.map((level) => ({ gameId, level }));
	});
}

// Читает параметры маршрута внутри Suspense: так Next.js не блокирует предварительную отрисовку страницы.
async function LevelContent({ params }: LevelPageProps) {
	const { gameId, level } = await params;
	return (
		<ClientOnly>
			<LevelRunner key={`${gameId}/${level}`} gameId={gameId} levelId={level} />
		</ClientOnly>
	);
}

// Страница уровня. Параметры маршрута передаются в клиентский компонент, который запускает уровень.
export default function LevelPage({ params }: LevelPageProps) {
	return (
		<Suspense fallback={null}>
			<LevelContent params={params} />
		</Suspense>
	);
}
