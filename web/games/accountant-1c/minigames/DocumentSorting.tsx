"use client";

// Мини-игра "Разбор первичных документов" (easy) на столе: курьер принёс стопку, документы раскладываются штампами разделов.
// Выбрать документ и нажать штамп, перетащить документ на штамп или пройти клавиатурой (Tab, Enter, стрелки, Enter).
// Неверный штамп возвращает документ, главбух печатает замечание. Разложенные документы улетают в журнал программы.
import { useState } from "react";
import { miniGameTutorials } from "../data/tutorials";
import { useTutorial } from "../hooks/useTutorial";
import { miniGameMaxScore, type DocumentSortingData, type SortingSectionId } from "../data/levels";
import { fillTemplate } from "../logic/feedback";
import { scoreDocumentSorting } from "../logic/scoring";
import { shuffle } from "../logic/shuffle";
import { accountantTexts } from "../texts";
import { useDeskLayout } from "../desk/contexts";
import { Paper, StampMark, findMovingPaper } from "../desk/Paper";
import { Workplace } from "../desk/Workplace";
import { FormToolbar } from "../ui/parts";
import { usePickAndDrop } from "../ui/usePickAndDrop";
import type { MiniGameProps } from "./types";
import styles from "./MiniGames.module.css";

const texts = accountantTexts.miniGames.documentSorting;

// Наклон бумаг по кругу, чтобы стопка выглядела живой.
const tilts = [-3, 2, -1.5, 3, -2, 1, -3.5, 2.5];

// Место документа на столе по номеру в стопке: четыре колонки, со сдвигом.
export function sortingPaperPosition(index: number): { x: number; y: number } {
	return { x: 20 + (index % 4) * 190 + (index % 2) * 8, y: 18 + Math.floor(index / 4) * 150 + ((index * 7) % 3) * 8 };
}

interface SortingDeskProps {
	// Документы, которые ещё лежат на столе.
	documents: DocumentSortingData["documents"];
	// Исходный порядок стопки: место бумаги на столе не меняется, когда соседние документы убирают.
	orderIds: string[];
	sections: SortingSectionId[];
	tutorialTarget?: string;
	onPlace: (documentId: string, sectionId: string) => boolean;
}

// Стол: документы-кнопки и лоток штампов. Внутри рабочего места, чтобы двигать бумаги по столу.
function SortingDesk({ documents, orderIds, sections, tutorialTarget, onPlace }: SortingDeskProps) {
	const layout = useDeskLayout();
	const { selectedItemId, getItemProps, getTargetProps, cancelSelection } = usePickAndDrop({
		targetIds: sections,
		tutorialTarget,
		onPlace,
		getMovingElement: findMovingPaper,
		onFreeDrop(itemId, offset) {
			layout?.moveBy(itemId, sortingPaperPosition(orderIds.indexOf(itemId)), offset.dx, offset.dy);
		},
	});

	return (
		<>
			{documents.map((document) => {
				const documentTexts = accountantTexts.documents[document.id];
				const index = orderIds.indexOf(document.id);
				return (
					<Paper key={document.id} id={document.id} handle="none" defaultPosition={sortingPaperPosition(index)} width={176} tilt={tilts[index % tilts.length]}>
						<button {...getItemProps(document.id)} className={styles.documentCard}>
							<span className={styles.documentTitle}>{documentTexts.title}</span>
							<span className={styles.documentDetails}>{documentTexts.details}</span>
						</button>
					</Paper>
				);
			})}
			<section data-tutorial-id="stamp-tray" className={styles.stampTray} aria-label={accountantTexts.stamps.barLabel}>
				<p className={styles.trayHint}>{accountantTexts.stamps.stampHint}</p>
				<div className={styles.stampRow} aria-label={texts.sectionsLabel}>
					{sections.map((sectionId) => (
						<div key={sectionId} {...getTargetProps(sectionId)} className={styles.rubberStamp} data-zone={sectionId}>
							<span className={styles.stampHandle} aria-hidden="true" />
							<span className={styles.stampFace}>{accountantTexts.sortingSections[sectionId]}</span>
						</div>
					))}
				</div>
				{selectedItemId ? (
					<button type="button" className={styles.trayCancel} onClick={cancelSelection}>
						{accountantTexts.buttons.cancelSelection}
					</button>
				) : null}
			</section>
		</>
	);
}

export function DocumentSorting({ data, random, tutorialEnabled = false, onComplete, onMistake, onProgress }: MiniGameProps<DocumentSortingData>) {
	const [documentOrder] = useState(() => shuffle(data.documents, random));
	// Разделы, куда документ положен верно.
	const [placements, setPlacements] = useState<Record<string, SortingSectionId>>({});
	// Первая попытка по каждому документу: по ней считаются очки.
	const [firstAttempts, setFirstAttempts] = useState<Record<string, SortingSectionId>>({});
	const [mistakeIds, setMistakeIds] = useState<string[]>([]);

	const pile = documentOrder.filter((document) => placements[document.id] === undefined);
	const tutorial = useTutorial(tutorialEnabled, miniGameTutorials.documentSorting(pile[0]));
	const tutorialTarget = tutorial.current?.action === "sort" ? tutorial.current.targets[1].slice("target-".length) : undefined;
	const isDone = pile.length === 0;

	function handlePlace(documentId: string, sectionId: string): boolean {
		const document = data.documents.find((candidate) => candidate.id === documentId);
		if (!document || placements[documentId] !== undefined) {
			return false;
		}
		if (!tutorial.accept("sort", documentId === pile[0]?.id && document.sectionId === sectionId)) {
			return false;
		}
		const nextAttempts = firstAttempts[documentId] ? firstAttempts : { ...firstAttempts, [documentId]: sectionId as SortingSectionId };
		setFirstAttempts(nextAttempts);
		const attemptedCount = Object.keys(nextAttempts).length;
		const firstTryCorrect = data.documents.filter((candidate) => nextAttempts[candidate.id] === candidate.sectionId).length;
		onProgress?.({
			earned: (miniGameMaxScore * firstTryCorrect) / data.documents.length,
			possible: (miniGameMaxScore * attemptedCount) / data.documents.length,
		});

		if (document.sectionId !== sectionId) {
			const explanationId = `sorting.${documentId}`;
			setMistakeIds((previous) => [...previous, explanationId]);
			onMistake({ explanationId, values: { target: accountantTexts.sortingSections[document.sectionId] } });
			return false;
		}
		setPlacements((previous) => ({ ...previous, [documentId]: document.sectionId }));
		return true;
	}

	function handleFinish() {
		onComplete({ score: scoreDocumentSorting(data, firstAttempts), hintsUsed: 0, mistakes: mistakeIds });
	}

	const journalRows = documentOrder.filter((document) => placements[document.id] !== undefined);

	return (
		<Workplace
			tutorial={tutorial}
			booth={{ character: "courier", name: accountantTexts.boothCharacters.courier, speech: accountantTexts.boothSpeech.documentSorting }}
			monitorSection="home"
			monitorTitle={texts.tab}
			rulebookTab="documents"
			monitor={
				<div className={styles.monitorForm}>
					<h2 className={styles.formTitle}>{accountantTexts.sortingPapers.journalTitle}</h2>
					<p className={styles.instruction}>{texts.instruction}</p>
					<p className={styles.counterLine}>
						{isDone ? texts.done : fillTemplate(accountantTexts.sortingPapers.leftOnDesk, { count: String(pile.length) })}
					</p>
					<table className={styles.table}>
						<tbody>
							{journalRows.length === 0 ? (
								<tr>
									<td className={styles.emptyCell}>{accountantTexts.sortingPapers.journalEmpty}</td>
								</tr>
							) : null}
							{journalRows.map((document) => (
								<tr key={document.id} data-placed-id={document.id} data-zone={placements[document.id]}>
									<td>{accountantTexts.documents[document.id].title}</td>
									<td className={styles.stampCell}>
										<StampMark label={accountantTexts.sortingSections[placements[document.id]]} tone={placements[document.id] === "trash" ? "red" : "blue"} />
									</td>
								</tr>
							))}
						</tbody>
					</table>
					<FormToolbar onPostAndClose={handleFinish} isPostAndCloseDisabled={!isDone} />
				</div>
			}
			desk={
				<SortingDesk documents={pile} orderIds={documentOrder.map((document) => document.id)} sections={data.sections} tutorialTarget={tutorialTarget} onPlace={handlePlace} />
			}
		/>
	);
}
