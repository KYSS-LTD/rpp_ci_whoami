// Геометрия уровня (задача 2.2): препятствия, сетка коллизий и навигационная сетка шага GRID_STEP из данных LevelConfig.
// Владелец: SONNET-2 (geometry-control-nav). sim/ не импортирует three и DOM.
import type { GeometryFactory, LevelConfig, LevelGeometry } from "../../contracts";
import { collectObstacles } from "../../config/levels/validate";
import { collectDoorwayJambs } from "./doorway";
import { buildCollisionGrid, buildNavGrid } from "./grid";

export { buildCollisionGrid, buildNavGrid } from "./grid";
export { maxPenetration, moveCircle, resolveCircle, type CollisionWorld } from "./collision";
export { collectDoorwayJambs, DOORWAY_MODEL, DOORWAY_OPENING_WIDTH, isDoorwayModel, LOW_DOORWAY_MODEL } from "./doorway";

// Строит геометрию уровня. Препятствия: те же, что считает validateLevelConfig (collectObstacles: блокирующие props, colliders,
// станции, столешницы и стулья), и стойки проёмов wall_doorway (collectDoorwayJambs). Сам проём (его середина) проходим.
export const buildGeometry: GeometryFactory = (level: LevelConfig): LevelGeometry => {
	const obstacles = [...collectObstacles(level).map((labeled) => labeled.rect), ...collectDoorwayJambs(level)];
	return {
		level,
		obstacles,
		collisionGrid: buildCollisionGrid(level.bounds, obstacles),
		navGrid: buildNavGrid(level.bounds, obstacles, level.params.nav.agentRadius),
	};
};
