// Скачивание текстового файла в браузере без сервера: Blob и временная ссылка с атрибутом download.
export function downloadTextFile(fileName: string, content: string, mimeType: string): void {
	const blob = new Blob([content], { type: mimeType });
	const objectUrl = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = objectUrl;
	link.download = fileName;
	link.style.display = "none";
	document.body.appendChild(link);
	link.click();
	link.remove();
	// Ссылка освобождается после клика, иначе часть браузеров не успевает начать загрузку.
	setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}
