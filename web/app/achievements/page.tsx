import { ClientOnly } from "../_components/ClientOnly";
import { AchievementsList } from "../_components/AchievementsList";

// Страница ачивок: полученные и закрытые ачивки.
export default function AchievementsPage() {
	return (
		<ClientOnly>
			<AchievementsList />
		</ClientOnly>
	);
}
