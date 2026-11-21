import { permanentRedirect } from "next/navigation";

// Страница дипломов: группировка по игре и сложности, пометка о локальном хранении.
export default function DiplomasPage() {
	permanentRedirect("/games");
}
