// Стойки проёмов (модель wall_doorway): непроходимые части куска стены по бокам видимого проёма.
// Проём в данных уровня это непроходимый для коллизий кусок стены целиком (PropConfig.blocking = false), но у самой модели
// проходом служит только середина: кусок шириной 2 (4 в единицах модели) имеет проём шириной 1 (2 в единицах модели) по центру,
// по бокам остаются стойки по 0.5. Если считать проходимым весь кусок, самый короткий путь (A* и сглаживание) срезает стойку,
// а персонажи (клиенты у двери, официанты, повар) заходят внутрь видимой стены. Поэтому геометрия добавляет стойки как
// препятствия по данным уровня, и это верно для любой будущей раскладки. Владелец: SONNET-2 (geometry-control-nav).
import { MODEL_SCALE, type LevelConfig, type Rect } from "../../contracts";

// Имя модели проёма (KayKit Restaurant Bits).
export const DOORWAY_MODEL = "wall_doorway";

// Низкая версия проёма (та же рама, срезанная сверху): размеры в плане те же, стойки те же.
export const LOW_DOORWAY_MODEL = "wall_doorway_low";

export function isDoorwayModel(model: string | null): boolean {
	return model === DOORWAY_MODEL || model === LOW_DOORWAY_MODEL;
}

// Ширина проёма в мире: в модели проём от -1 до 1 (ширина 2 в единицах модели), масштаб MODEL_SCALE.
export const DOORWAY_OPENING_WIDTH = 2 * MODEL_SCALE;

// Стойки по сторонам проёма для всех проходов уровня: каждая непроходимая часть куска вне середины проёма.
// Кусок вытянут вдоль длинной стороны своего прямоугольника; проём стоит по его центру. Блокирующие куски и другие модели
// стоек не получают (блокирующий кусок и так целиком препятствие).
export function collectDoorwayJambs(level: LevelConfig): Rect[] {
	const jambs: Rect[] = [];
	for (const prop of level.props) {
		if (prop.blocking || !isDoorwayModel(prop.model)) {
			continue;
		}
		const { rect } = prop;
		const alongX = rect.width >= rect.depth;
		const length = alongX ? rect.width : rect.depth;
		const jambLength = (length - DOORWAY_OPENING_WIDTH) / 2;
		if (jambLength <= 0) {
			continue;
		}
		if (alongX) {
			jambs.push({ x: rect.x, z: rect.z, width: jambLength, depth: rect.depth });
			jambs.push({ x: rect.x + rect.width - jambLength, z: rect.z, width: jambLength, depth: rect.depth });
		} else {
			jambs.push({ x: rect.x, z: rect.z, width: rect.width, depth: jambLength });
			jambs.push({ x: rect.x, z: rect.z + rect.depth - jambLength, width: rect.width, depth: jambLength });
		}
	}
	return jambs;
}
