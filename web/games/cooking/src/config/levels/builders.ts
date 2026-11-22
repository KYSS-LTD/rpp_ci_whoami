// Помощники для сборки данных уровней: стены из кусков по 2, оболочка ресторана, станции, столы с местами, очередь.
// Они только считают координаты по правилам из contracts.ts и не содержат баланса. Владелец: Opus-агент.
// Все размеры в мире (прилавок 1 x 1, клетка 0.5). Стены собираются из модели wall длиной 2 с точкой отсчёта в центре.
import type { FloorConfig, PropConfig, QueueConfig, Rect, Rotation, SeatConfig, ServingWindowConfig, StationConfig, StationKind, TableConfig, Vec2 } from "../../contracts";

// Низкие стены (передняя стена и куски разделителя южнее окна выдачи) не закрывают от камеры блюда и зал. Это не сжатые по
// высоте высокие стены, а отдельные модели: копии wall, wall_doorway и wall_orderwindow с отрезанной верхней частью
// (tools/make_low_walls.py).
export const LOW_WALL_MODEL = "wall_low";
export const LOW_DOORWAY_MODEL = "wall_doorway_low";
// Окно выдачи тоже низкое (без перемычки над проёмом, стойки высотой с низкую стену): блюда на прилавке видны камере.
export const LOW_SERVING_WINDOW_MODEL = "wall_orderwindow_low";

// Толщина стен в мире.
export const WALL_THICKNESS = 0.5;

// Длина одного куска стены в мире.
export const WALL_PIECE_LENGTH = 2;

// Прямоугольник по четырём числам.
export function rect(x: number, z: number, width: number, depth: number): Rect {
	return { x, z, width, depth };
}

// Точка по двум числам.
export function point(x: number, z: number): Vec2 {
	return { x, z };
}

// Ряд кусков стены. axis "x": куски лежат вдоль оси x (прямоугольник 2 x 0.5), "z": вдоль оси z (0.5 x 2, поворот 90).
// kinds задаёт вид каждого куска: "wall" - блокирующая стена, "doorway" - проём с рамой (не блокирует), "skip" - пропуск
// (место станции окна выдачи, которая сама является куском стены).
export type WallPieceKind = "wall" | "doorway" | "skip";

// low: true делает все куски низкими (модели wall_low / wall_doorway_low), функция решает по номеру куска.
export function createWallRun(
	idPrefix: string,
	startX: number,
	startZ: number,
	axis: "x" | "z",
	kinds: readonly WallPieceKind[],
	low: boolean | ((pieceIndex: number) => boolean) = false,
): PropConfig[] {
	const props: PropConfig[] = [];
	kinds.forEach((kind, pieceIndex) => {
		if (kind === "skip") {
			return;
		}
		const offset = pieceIndex * WALL_PIECE_LENGTH;
		const pieceRect = axis === "x" ? rect(startX + offset, startZ, WALL_PIECE_LENGTH, WALL_THICKNESS) : rect(startX, startZ + offset, WALL_THICKNESS, WALL_PIECE_LENGTH);
		const isLow = typeof low === "function" ? low(pieceIndex) : low;
		const model = kind === "doorway" ? (isLow ? LOW_DOORWAY_MODEL : "wall_doorway") : isLow ? LOW_WALL_MODEL : "wall";
		props.push({
			id: `${idPrefix}-${pieceIndex}`,
			model,
			rect: pieceRect,
			rotationDeg: axis === "x" ? 0 : 90,
			blocking: kind === "wall",
		});
	});
	return props;
}

// Описание оболочки ресторана: наружные стены, разделяющая стена кухни и зала, дверь, улица.
export interface ShellSpec {
	// Ширина мира (чётное число).
	width: number;
	// Глубина внутренней части по z (чётное число): от северной стены до передней стены.
	interiorDepth: number;
	// Глубина улицы по z.
	streetDepth: number;
	// Координата x разделяющей стены (левый край, толщина 0.5).
	dividerX: number;
	// Левый край проёма двери в южной стене (чётный, проём 2 шириной).
	doorX: number;
	// Куски разделяющей стены сверху вниз по 2 (длина массива равна interiorDepth / 2): "wall", "doorway" (проход кухня-зал) или
	// "skip" (окно выдачи, которое задаётся станцией).
	dividerKinds: readonly WallPieceKind[];
}

// Результат сборки оболочки.
export interface ShellResult {
	props: PropConfig[];
	// Прямоугольник проёма двери.
	doorRect: Rect;
	// Прямоугольник под окно выдачи на разделяющей стене (первый "skip" в dividerKinds).
	windowRect: Rect;
	// Границы мира: весь ресторан с улицей.
	bounds: Rect;
	// Координата z южной (передней) стены.
	frontWallZ: number;
	// Координата z начала улицы.
	streetZ: number;
}

// Собирает стены, проём двери и границы мира.
export function createShell(spec: ShellSpec): ShellResult {
	const interiorStartZ = WALL_THICKNESS;
	const frontWallZ = interiorStartZ + spec.interiorDepth;
	const streetZ = frontWallZ + WALL_THICKNESS;
	const northPieces = spec.width / WALL_PIECE_LENGTH;
	const sidePieces = spec.interiorDepth / WALL_PIECE_LENGTH;
	const doorPieceIndex = spec.doorX / WALL_PIECE_LENGTH;
	const frontKinds: WallPieceKind[] = Array.from({ length: northPieces }, (_, index) => (index === doorPieceIndex ? "doorway" : "wall"));
	const windowPieceIndex = spec.dividerKinds.indexOf("skip");
	if (windowPieceIndex < 0 || spec.dividerKinds.length !== sidePieces) {
		throw new Error("dividerKinds должен содержать окно выдачи (skip) и иметь interiorDepth / 2 кусков");
	}

	const props: PropConfig[] = [
		...createWallRun("wall-north", 0, 0, "x", Array.from({ length: northPieces }, () => "wall" as const)),
		...createWallRun("wall-west", 0, interiorStartZ, "z", Array.from({ length: sidePieces }, () => "wall" as const)),
		...createWallRun("wall-east", spec.width - WALL_THICKNESS, interiorStartZ, "z", Array.from({ length: sidePieces }, () => "wall" as const)),
		...createWallRun("wall-front", 0, frontWallZ, "x", frontKinds, true),
		// Куски южнее окна выдачи низкие: иначе стена закрывает от камеры блюда, стоящие в окне.
		...createWallRun("wall-divider", spec.dividerX, interiorStartZ, "z", spec.dividerKinds, (pieceIndex) => pieceIndex > windowPieceIndex),
	];
	return {
		props,
		doorRect: rect(spec.doorX, frontWallZ, WALL_PIECE_LENGTH, WALL_THICKNESS),
		windowRect: rect(spec.dividerX, interiorStartZ + windowPieceIndex * WALL_PIECE_LENGTH, WALL_THICKNESS, WALL_PIECE_LENGTH),
		bounds: rect(0, 0, spec.width, streetZ + spec.streetDepth),
		frontWallZ,
		streetZ,
	};
}

// Станция 1 x 1 с левым верхним углом (x, z).
export function createStation(id: string, kind: StationKind, x: number, z: number, rotationDeg: Rotation = 0, extra: Partial<StationConfig> = {}): StationConfig {
	return { id, kind, rect: rect(x, z, 1, 1), rotationDeg, ...extra };
}

// Ящик с ингредиентом: идентификатор crate-<ингредиент>.
export function createCrate(ingredient: NonNullable<StationConfig["ingredient"]>, x: number, z: number, rotationDeg: Rotation = 0): StationConfig {
	return createStation(`crate-${ingredient}`, "crate", x, z, rotationDeg, { ingredient });
}

// Место за столом по прямоугольнику стула: сидящий в центре стула, подход и подача в одной точке.
function createSeat(chairRect: Rect, chairModel: string, rotationDeg: Rotation, approachPoint: Vec2, dishPoint: Vec2): SeatConfig {
	return {
		chairRect,
		chairModel,
		rotationDeg,
		approachPoint,
		sitPoint: point(chairRect.x + chairRect.width / 2, chairRect.z + chairRect.depth / 2),
		dishPoint,
		servePoint: approachPoint,
	};
}

// Уплотнённый ряд столов: все места подаются с одного свободного бокового прохода.
function assignSharedApproach(seats: SeatConfig[], approachX: number | undefined): SeatConfig[] {
	if (approachX === undefined) {
		return seats;
	}
	return seats.map((seat, index) => {
		// Двухместный стол обслуживается с двух сторон, а у четырёхместного западное место остаётся у левого прохода.
		if (seats.length === 2 || index === 3) {
			return seat;
		}
		const approachPoint = point(approachX, seat.sitPoint.z);
		return { ...seat, approachPoint, servePoint: approachPoint };
	});
}

// Все столы зала квадратные: одна модель kitchentable_B (1 x 1). У стола на 4 места рендер растягивает её по плану до 1.5 x 1.5.
export const SQUARE_TABLE_MODEL = "kitchentable_B";

// Стол на 2 места: квадратная столешница 1 x 1 с углом (x, z), стулья слева и справа (0.5 x 1). Места: 0 слева, 1 справа.
export function createTwoTop(id: string, number: number, x: number, z: number, sharedApproachX?: number): TableConfig {
	const centerZ = z + 0.5;
	return {
		id,
		number,
		rect: rect(x, z, 1, 1),
		model: SQUARE_TABLE_MODEL,
		rotationDeg: 0,
		seats: assignSharedApproach([
			createSeat(rect(x - 0.5, z, 0.5, 1), "chair_stool", 90, point(x - 1, centerZ), point(x + 0.3, centerZ)),
			createSeat(rect(x + 1, z, 0.5, 1), "chair_stool", 270, point(x + 2, centerZ), point(x + 0.7, centerZ)),
		], sharedApproachX),
	};
}

// Стол на 4 места: квадратная столешница 1.5 x 1.5 с углом (x, z), стулья 0.5 x 0.5 с четырёх сторон. Места: 0 север, 1 восток, 2 юг, 3 запад.
export function createFourTop(id: string, number: number, x: number, z: number, sharedApproachX?: number): TableConfig {
	const centerX = x + 0.75;
	const centerZ = z + 0.75;
	return {
		id,
		number,
		rect: rect(x, z, 1.5, 1.5),
		model: SQUARE_TABLE_MODEL,
		rotationDeg: 0,
		seats: assignSharedApproach([
			createSeat(rect(x + 0.5, z - 0.5, 0.5, 0.5), "chair_A", 0, point(centerX, z - 1), point(centerX, z + 0.35)),
			createSeat(rect(x + 1.5, z + 0.5, 0.5, 0.5), "chair_A", 270, point(x + 2.5, centerZ), point(x + 1.15, centerZ)),
			createSeat(rect(x + 0.5, z + 1.5, 0.5, 0.5), "chair_A", 180, point(centerX, z + 2.5), point(centerX, z + 1.15)),
			createSeat(rect(x - 0.5, z + 0.5, 0.5, 0.5), "chair_A", 90, point(x - 1, centerZ), point(x + 0.35, centerZ)),
		], sharedApproachX),
	};
}

// Смещения четырёх членов группы от центра слота очереди (ряд поперёк x, шаг 0.55).
export const QUEUE_MEMBER_OFFSETS: Vec2[] = [point(-0.825, 0), point(-0.275, 0), point(0.275, 0), point(0.825, 0)];

// Очередь: слоты задаются центрами по порядку от двери (индекс 0 ближайший).
export function createQueue(slotCenters: readonly Vec2[]): QueueConfig {
	return {
		slots: slotCenters.map((position, index) => ({ index, position })),
		memberOffsets: QUEUE_MEMBER_OFFSETS.map((offset) => ({ ...offset })),
	};
}

// Участки пола по зонам: кухня слева от разделяющей стены, зал справа, улица под передней стеной.
export function createFloors(spec: ShellSpec, shell: ShellResult): FloorConfig[] {
	const hallStartX = spec.dividerX + WALL_THICKNESS;
	return [
		{ rect: rect(WALL_THICKNESS, WALL_THICKNESS, spec.dividerX - WALL_THICKNESS, spec.interiorDepth), zone: "kitchen" },
		{ rect: rect(hallStartX, WALL_THICKNESS, spec.width - WALL_THICKNESS - hallStartX, spec.interiorDepth), zone: "hall" },
		{ rect: rect(0, shell.streetZ, spec.width, shell.bounds.depth - shell.streetZ), zone: "street" },
	];
}

// Станция окна выдачи на разделяющей стене и описание окна: слоты блюд вдоль окна со стороны зала, точка забора официанта.
export function createServingWindow(shell: ShellResult, dishSlotCount: number): { station: StationConfig; window: ServingWindowConfig } {
	const station: StationConfig = { id: "window-1", kind: "servingWindow", rect: shell.windowRect, rotationDeg: 90, model: LOW_SERVING_WINDOW_MODEL };
	const slotStep = 1.1 / Math.max(1, dishSlotCount - 1);
	const dishPoints = Array.from({ length: dishSlotCount }, (_, index) => point(shell.windowRect.x + 0.25, shell.windowRect.z + 0.45 + index * slotStep));
	return {
		station,
		window: {
			stationId: station.id,
			dishPoints,
			pickupPoint: point(shell.windowRect.x + WALL_THICKNESS + 0.75, shell.windowRect.z + 1),
		},
	};
}
