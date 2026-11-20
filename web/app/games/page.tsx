import { gameRegistry } from "@/core/registry";
import { ClientOnly } from "../_components/ClientOnly";
import { GamesList } from "../_components/GamesList";

// Экран игр: показывает все игры, которые подключены в реестр.
export default function GamesPage() {
	return (
		<ClientOnly>
			<GamesList games={gameRegistry.games.map((game) => game.manifest)} />
		</ClientOnly>
	);
}
