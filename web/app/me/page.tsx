import { ClientOnly } from "../_components/ClientOnly";
import { ProfileView } from "../_components/ProfileView";

// Личная страница анализа профессий.
export default function ProfilePage() {
	return (
		<ClientOnly>
			<ProfileView />
		</ClientOnly>
	);
}
