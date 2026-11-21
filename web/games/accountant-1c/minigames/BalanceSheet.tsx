"use client";

// Мини-игра "Бухгалтерский баланс" (hard). Карточки ОСВ с суммами лежат на столе рядом с бланком баланса:
// карточку перетаскивают на строку или выбирают её и затем строку. Нераспределённую прибыль игрок считает сам
// (калькулятор на столе). Весы показывают, сходится ли актив с пассивом.
import { useState } from "react";
import { miniGameTutorials } from "../data/tutorials";
import { useTutorial } from "../hooks/useTutorial";
import { type BalanceItem, type BalanceLineId, type BalanceSheetData } from "../data/levels";
import { formatRubles, parseAmountInput } from "../logic/money";
import { calculateComputedLine, retainedEarningsPoints, scoreBalanceSheet } from "../logic/scoring";
import { shuffle } from "../logic/shuffle";
import { accountantTexts } from "../texts";
import { AmountInput } from "../desk/AmountInput";
import { useDeskLayout } from "../desk/contexts";
import { Paper, findMovingPaper } from "../desk/Paper";
import { Workplace } from "../desk/Workplace";
import { Scales } from "../ui/art";
import { FormToolbar } from "../ui/parts";
import { usePickAndDrop } from "../ui/usePickAndDrop";
import type { MiniGameProps } from "./types";
import styles from "./MiniGames.module.css";

const texts = accountantTexts.miniGames.balanceSheet;
const maxTiltDeg = 18;
const cardTilts = [-3, 2, -1, 3, -2, 1.5, -2.5, 2];

// Наклон весов: актив тяжелее - вправо, пассив тяжелее - влево. 0 градусов, когда итоги равны.
export function calculateBalanceTilt(assetsTotal: number, liabilitiesTotal: number): number {
	const larger = Math.max(assetsTotal, liabilitiesTotal);
	if (larger === 0) {
		return 0;
	}
	return Math.round(maxTiltDeg * ((assetsTotal - liabilitiesTotal) / larger) * 10) / 10;
}

// Место карточки ОСВ на столе: два столбца слева от бланка.
function cardPosition(index: number): { x: number; y: number } {
	return { x: 16 + (index % 2) * 176, y: 16 + Math.floor(index / 2) * 92 + (index % 2) * 14 };
}

interface BalanceDeskProps {
	data: BalanceSheetData;
	pile: BalanceItem[];
	orderIds: string[];
	placements: Record<string, BalanceLineId>;
	computedInput: string;
	onComputedChange: (value: string) => void;
	isFinished: boolean;
	assetsTotal: number;
	liabilitiesTotal: number;
	tutorialTarget?: string;
	onPlace: (itemId: string, lineId: string) => boolean;
}

function BalanceDesk({ data, pile, orderIds, placements, computedInput, onComputedChange, isFinished, assetsTotal, liabilitiesTotal, tutorialTarget, onPlace }: BalanceDeskProps) {
	const layout = useDeskLayout();
	const targetLineIds = [...data.assetLines, ...data.liabilityLines].filter((lineId) => lineId !== data.computedLineId);
	const { selectedItemId, getItemProps, getTargetProps, cancelSelection } = usePickAndDrop({
		targetIds: targetLineIds,
		tutorialTarget,
		onPlace,
		getMovingElement: findMovingPaper,
		onFreeDrop(itemId, offset) {
			layout?.moveBy(itemId, cardPosition(orderIds.indexOf(itemId)), offset.dx, offset.dy);
		},
	});
	const tiltDeg = calculateBalanceTilt(assetsTotal, liabilitiesTotal);

	function renderLine(lineId: BalanceLineId) {
		const lineTitle = accountantTexts.balanceLines[lineId];
		if (lineId === data.computedLineId) {
			return (
				<li key={lineId} className={styles.balanceLine} data-computed="true">
					<label className={styles.computedLabel}>
						<span className={styles.lineTitle}>{lineTitle}</span>
						<AmountInput
							className={styles.cellInput}
							label={texts.computedLabel}
							data-tutorial-id="balance-computed"
							value={computedInput}
							disabled={isFinished}
							onValueChange={onComputedChange}
						/>
					</label>
				</li>
			);
		}
		const placedItems = data.items.filter((item) => placements[item.id] === lineId);
		return (
			<li key={lineId} className={styles.balanceLine}>
				<div {...getTargetProps(lineId)} className={styles.lineTarget} data-zone={lineId}>
					<span className={styles.lineTitle}>{lineTitle}</span>
					{placedItems.map((item) => (
						<span key={item.id} data-placed-id={item.id} className={styles.placedItem}>
							<span>{accountantTexts.balanceItems[item.id]}</span>
							<span className={styles.mono}>{formatRubles(item.amount)}</span>
						</span>
					))}
				</div>
			</li>
		);
	}

	return (
		<>
			{pile.map((item) => {
				const index = orderIds.indexOf(item.id);
				return (
					<Paper key={item.id} id={item.id} handle="none" variant="card" defaultPosition={cardPosition(index)} width={168} tilt={cardTilts[index % cardTilts.length]}>
						<button {...getItemProps(item.id)} className={styles.amountCard} disabled={isFinished}>
							<span className={styles.cardTag}>{accountantTexts.balancePapers.cardsTitle}</span>
							<span className={styles.documentDetails}>{accountantTexts.balanceItems[item.id]}</span>
							<span className={styles.amountValue}>{formatRubles(item.amount)}</span>
						</button>
					</Paper>
				);
			})}

			<Paper id="balanceForm" variant="form" defaultPosition={{ x: 370, y: 12 }} width={440} tilt={0.5} title={accountantTexts.balancePapers.formTitle}>
				<div className={styles.balanceForm}>
					<section aria-label={texts.assetsTitle}>
						<h3 className={styles.areaTitle}>{texts.assetsTitle}</h3>
						<ul className={styles.balanceLines}>{data.assetLines.map(renderLine)}</ul>
						<p className={styles.balanceTotal}>
							{texts.totalLabel}: <span className={styles.mono}>{formatRubles(assetsTotal)}</span>
						</p>
					</section>
					<section aria-label={texts.liabilitiesTitle}>
						<h3 className={styles.areaTitle}>{texts.liabilitiesTitle}</h3>
						<ul className={styles.balanceLines}>{data.liabilityLines.map(renderLine)}</ul>
						<p className={styles.balanceTotal}>
							{texts.totalLabel}: <span className={styles.mono}>{formatRubles(liabilitiesTotal)}</span>
						</p>
					</section>
				</div>
				{selectedItemId ? (
					<button type="button" className={styles.paperButton} onClick={cancelSelection}>
						{accountantTexts.buttons.cancelSelection}
					</button>
				) : null}
			</Paper>

			<Paper id="balanceScales" variant="card" defaultPosition={{ x: 16, y: 392 }} width={180} tilt={-1.5} title={texts.scalesLabel}>
				<figure className={styles.scalesFigure}>
					<Scales tiltDeg={tiltDeg} label={texts.scalesLabel} />
					<figcaption data-testid="balance-scales" data-tilt={tiltDeg}>
						{formatRubles(assetsTotal)} / {formatRubles(liabilitiesTotal)}
					</figcaption>
				</figure>
			</Paper>
		</>
	);
}

export function BalanceSheet({ data, random, tutorialEnabled = false, onComplete, onMistake, onProgress }: MiniGameProps<BalanceSheetData>) {
	const [itemOrder] = useState(() => shuffle(data.items, random));
	// Строки, куда карточка положена верно.
	const [placements, setPlacements] = useState<Record<string, BalanceLineId>>({});
	// Первая попытка по каждой карточке: по ней считаются очки.
	const [firstAttempts, setFirstAttempts] = useState<Record<string, BalanceLineId>>({});
	const [computedInput, setComputedInput] = useState("");
	const [mistakeIds, setMistakeIds] = useState<string[]>([]);
	const [isFinished, setIsFinished] = useState(false);

	const pile = itemOrder.filter((item) => placements[item.id] === undefined);
	const tutorial = useTutorial(tutorialEnabled, miniGameTutorials.balanceSheet(pile[0]));
	const tutorialTarget = tutorial.current?.action === "balance" ? tutorial.current.targets[1].slice("target-".length) : undefined;
	const computedAmount = parseAmountInput(computedInput);

	const sumPlaced = (lineIds: BalanceLineId[]) =>
		data.items.filter((item) => placements[item.id] !== undefined && lineIds.includes(item.lineId)).reduce((total, item) => total + item.amount, 0);
	const assetsTotal = sumPlaced(data.assetLines);
	const liabilitiesTotal = sumPlaced(data.liabilityLines) + (computedAmount ?? 0);

	function handlePlace(itemId: string, lineId: string): boolean {
		const item = data.items.find((candidate) => candidate.id === itemId);
		if (!item || placements[itemId] !== undefined) {
			return false;
		}
		if (!tutorial.accept("balance", itemId === pile[0]?.id && item.lineId === lineId)) {
			return false;
		}
		const nextAttempts = firstAttempts[itemId] ? firstAttempts : { ...firstAttempts, [itemId]: lineId as BalanceLineId };
		setFirstAttempts(nextAttempts);
		const attempted = data.items.filter((candidate) => nextAttempts[candidate.id] !== undefined);
		onProgress?.({
			earned: attempted.filter((candidate) => nextAttempts[candidate.id] === candidate.lineId).length,
			possible: attempted.length,
		});
		if (item.lineId !== lineId) {
			setMistakeIds((previous) => [...previous, "balance.item"]);
			onMistake({
				explanationId: "balance.item",
				values: { target: accountantTexts.balanceLines[item.lineId], itemReason: accountantTexts.balanceItemReasons[item.id] },
			});
			return false;
		}
		setPlacements((previous) => ({ ...previous, [itemId]: item.lineId }));
		return true;
	}

	function handleFinish() {
		if (isFinished) {
			return;
		}
		setIsFinished(true);
		const expected = calculateComputedLine(data);
		const finalMistakes = [...mistakeIds];
		if (computedAmount !== expected) {
			finalMistakes.push("balance.computed");
			onMistake({ explanationId: "balance.computed", values: { expected: formatRubles(expected) } });
		}
		onProgress?.({
			earned: data.items.filter((item) => firstAttempts[item.id] === item.lineId).length + (computedAmount === expected ? retainedEarningsPoints : 0),
			possible: data.items.length + retainedEarningsPoints,
		});
		onComplete({ score: scoreBalanceSheet(data, firstAttempts, computedAmount), hintsUsed: 0, mistakes: finalMistakes });
	}

	return (
		<Workplace
			tutorial={tutorial}
			booth={{ character: "inspector", name: accountantTexts.boothCharacters.inspector, speech: accountantTexts.boothSpeech.balanceSheet }}
			monitorSection="reports"
			monitorTitle={texts.tab}
			rulebookTab="balance"
			deskHeight={540}
			monitor={
				<div className={styles.monitorForm}>
					<h2 className={styles.formTitle}>{accountantTexts.balancePapers.monitorTitle}</h2>
					<p className={styles.instruction}>{texts.instruction}</p>
					<table className={styles.table}>
						<tbody>
							<tr>
								<th scope="row">{texts.assetsTitle}</th>
								<td className={styles.amountCell}>{formatRubles(assetsTotal)}</td>
							</tr>
							<tr>
								<th scope="row">{texts.liabilitiesTitle}</th>
								<td className={styles.amountCell}>{formatRubles(liabilitiesTotal)}</td>
							</tr>
						</tbody>
					</table>
					<FormToolbar onPostAndClose={handleFinish} isPostAndCloseDisabled={isFinished || pile.length > 0 || computedAmount === null} />
				</div>
			}
			desk={
				<BalanceDesk
					data={data}
					pile={pile}
					orderIds={itemOrder.map((item) => item.id)}
					placements={placements}
					computedInput={computedInput}
					onComputedChange={setComputedInput}
					isFinished={isFinished}
					assetsTotal={assetsTotal}
					liabilitiesTotal={liabilitiesTotal}
					tutorialTarget={tutorialTarget}
					onPlace={handlePlace}
				/>
			}
		/>
	);
}
