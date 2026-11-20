import { ClientOnly } from "../_components/ClientOnly";
import { DiplomasList } from "../_components/DiplomasList";

// Страница дипломов: группировка по игре и сложности, пометка о локальном хранении.
export default function DiplomasPage() {
	return (
		<ClientOnly>
			<DiplomasList />
		</ClientOnly>
	);
}
