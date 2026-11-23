// Игра "Город будущего" на three.js: пример iframe-игры для портала профессий.
// Игрок строит дороги, дома и электростанции на изометрической карте. Дом заселяется, если рядом есть дорога
// и хватает энергии. Цель уровня - население; результат уходит в портал через PortalBridge (sdk/web/portal-bridge.js).
import * as THREE from "./vendor/three.module.min.js";

const texts = window.CITY_BUILDER_TEXTS;
const bridge = window.PortalBridge;

// Параметры уровней: размер карты, бюджет, цель по населению и клетки с водой, где строить нельзя.
const levelSettings = {
	easy: { gridSize: 7, budget: 900, targetPopulation: 50, water: [] },
	medium: { gridSize: 8, budget: 1100, targetPopulation: 80, water: [[0, 7], [1, 7], [7, 0]] },
	hard: {
		gridSize: 9,
		budget: 1300,
		targetPopulation: 120,
		water: [[3, 3], [3, 4], [4, 3], [4, 4], [4, 5], [0, 8], [1, 8], [8, 0]],
	},
};

// Постройки: цена, жители, энергия (плюс - даёт, минус - потребляет).
const buildingTypes = {
	road: { cost: 10 },
	house: { cost: 70, population: 10, energy: -1 },
	plant: { cost: 180, energy: 6 },
};

const refundShare = 0.5;
const toolOrder = ["road", "house", "plant", "bulldozer"];

const colors = {
	grass: 0x7cc495,
	grassAlt: 0x74bd8d,
	water: 0x4aa3d8,
	road: 0x56675d,
	hover: 0xf0c419,
	houseWalls: [0xfdf6e3, 0xe8f3ec, 0xeef1f6],
	houseRoof: 0xb4553a,
	houseInactive: 0x9aa59f,
	plant: 0xd9e2dc,
	plantChimney: 0x7d8798,
	smoke: 0xffffff,
};

// Состояние уровня.
const state = {
	levelId: "easy",
	settings: null,
	budget: 0,
	tool: "road",
	cells: [],
	placementCounter: 0,
	population: 0,
	energyUsed: 0,
	energyCapacity: 0,
	isFinished: false,
};

let renderer;
let scene;
let camera;
let raycaster;
let pointer;
let tilesGroup;
let buildingsGroup;
let hoverMarker;
const tileMeshes = [];
const growingObjects = [];
const smokePuffs = [];

const elements = {
	loading: document.getElementById("loading"),
	hud: document.querySelector(".hud"),
	toolbar: document.querySelector(".toolbar"),
	hint: document.getElementById("hint"),
	levelTitle: document.getElementById("level-title"),
	goal: document.getElementById("goal"),
	budget: document.getElementById("budget"),
	population: document.getElementById("population"),
	energy: document.getElementById("energy"),
	tools: document.getElementById("tools"),
	finish: document.getElementById("finish"),
	exit: document.getElementById("exit"),
};

// Подставляет тексты из texts.js во все элементы с data-text.
function fillStaticTexts() {
	document.querySelectorAll("[data-text]").forEach((element) => {
		element.textContent = texts[element.dataset.text] ?? "";
	});
}

// Создаёт рендерер. Без WebGL игра сообщает порталу об ошибке, и портал покажет экран с повтором.
function createRenderer() {
	try {
		renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
	} catch (error) {
		bridge.reportError(`${texts.webglError}: ${error instanceof Error ? error.message : String(error)}`);
		return false;
	}
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	document.getElementById("scene").appendChild(renderer.domElement);
	return true;
}

function createScene() {
	scene = new THREE.Scene();

	camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
	camera.position.set(12, 13, 12);
	camera.lookAt(0, 0, 0);

	scene.add(new THREE.HemisphereLight(0xffffff, 0x4aa86c, 1.6));
	const sun = new THREE.DirectionalLight(0xffffff, 2.2);
	sun.position.set(6, 12, 4);
	sun.castShadow = true;
	sun.shadow.mapSize.set(1024, 1024);
	sun.shadow.camera.left = -8;
	sun.shadow.camera.right = 8;
	sun.shadow.camera.top = 8;
	sun.shadow.camera.bottom = -8;
	scene.add(sun);

	tilesGroup = new THREE.Group();
	buildingsGroup = new THREE.Group();
	scene.add(tilesGroup, buildingsGroup);

	hoverMarker = new THREE.Mesh(
		new THREE.BoxGeometry(1, 0.04, 1),
		new THREE.MeshBasicMaterial({ color: colors.hover, transparent: true, opacity: 0.45 }),
	);
	hoverMarker.visible = false;
	scene.add(hoverMarker);

	raycaster = new THREE.Raycaster();
	pointer = new THREE.Vector2();
}

// Переводит клетку сетки в координаты сцены (карта по центру).
function cellPosition(column, row) {
	const offset = (state.settings.gridSize - 1) / 2;
	return new THREE.Vector3(column - offset, 0, row - offset);
}

function cellAt(column, row) {
	if (column < 0 || row < 0 || column >= state.settings.gridSize || row >= state.settings.gridSize) {
		return null;
	}
	return state.cells[row * state.settings.gridSize + column];
}

// Строит карту уровня: плитки травы и воды.
function buildMap() {
	const { gridSize, water } = state.settings;
	const waterCells = new Set(water.map(([column, row]) => `${column}:${row}`));
	const tileGeometry = new THREE.BoxGeometry(0.98, 0.2, 0.98);

	for (let row = 0; row < gridSize; row += 1) {
		for (let column = 0; column < gridSize; column += 1) {
			const isWater = waterCells.has(`${column}:${row}`);
			const color = isWater ? colors.water : (column + row) % 2 === 0 ? colors.grass : colors.grassAlt;
			const tile = new THREE.Mesh(tileGeometry, new THREE.MeshLambertMaterial({ color }));
			tile.position.copy(cellPosition(column, row)).setY(-0.1);
			tile.receiveShadow = true;
			tile.userData = { column, row };
			tilesGroup.add(tile);
			tileMeshes.push(tile);
			state.cells.push({ column, row, isWater, building: null, mesh: null, placedAt: 0 });
		}
	}
	// Основание карты: толстая плита под клетками.
	const base = new THREE.Mesh(
		new THREE.BoxGeometry(gridSize + 0.4, 0.6, gridSize + 0.4),
		new THREE.MeshLambertMaterial({ color: 0x3d9b5c }),
	);
	base.position.y = -0.5;
	base.receiveShadow = true;
	tilesGroup.add(base);
}

// Модель дома: стены и двускатная крыша.
function createHouse() {
	const group = new THREE.Group();
	const wallColor = colors.houseWalls[state.placementCounter % colors.houseWalls.length];
	const walls = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.62), new THREE.MeshLambertMaterial({ color: wallColor }));
	walls.position.y = 0.25;
	const roof = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.34, 4), new THREE.MeshLambertMaterial({ color: colors.houseRoof }));
	roof.position.y = 0.67;
	roof.rotation.y = Math.PI / 4;
	group.add(walls, roof);
	group.userData.walls = walls;
	group.userData.wallColor = wallColor;
	return group;
}

// Модель электростанции: корпус и труба с дымом.
function createPlant() {
	const group = new THREE.Group();
	const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.42, 0.7), new THREE.MeshLambertMaterial({ color: colors.plant }));
	body.position.y = 0.21;
	const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.9, 12), new THREE.MeshLambertMaterial({ color: colors.plantChimney }));
	chimney.position.set(0.22, 0.55, 0.18);
	group.add(body, chimney);
	for (let index = 0; index < 3; index += 1) {
		const puff = new THREE.Mesh(
			new THREE.SphereGeometry(0.09, 10, 10),
			new THREE.MeshLambertMaterial({ color: colors.smoke, transparent: true, opacity: 0.7 }),
		);
		puff.userData.phase = index / 3;
		puff.userData.origin = new THREE.Vector3(0.22, 1.0, 0.18);
		group.add(puff);
		smokePuffs.push(puff);
	}
	return group;
}

function createRoad() {
	const road = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.04, 0.98), new THREE.MeshLambertMaterial({ color: colors.road }));
	road.position.y = 0.02;
	return road;
}

function createBuildingMesh(type) {
	if (type === "house") {
		return createHouse();
	}
	if (type === "plant") {
		return createPlant();
	}
	return createRoad();
}

function showHint(message) {
	elements.hint.textContent = message;
	elements.hint.hidden = !message;
}

// Пересчитывает население и энергию. Дома заселяются в порядке постройки, пока хватает энергии.
function recalculateCity() {
	const cells = state.cells;
	state.energyCapacity = cells.filter((cell) => cell.building === "plant").length * buildingTypes.plant.energy;
	state.energyUsed = 0;
	state.population = 0;
	let hasUnconnectedHouse = false;
	let hasUnpoweredHouse = false;

	const houses = cells.filter((cell) => cell.building === "house").sort((first, second) => first.placedAt - second.placedAt);
	for (const house of houses) {
		const neighbours = [
			cellAt(house.column + 1, house.row),
			cellAt(house.column - 1, house.row),
			cellAt(house.column, house.row + 1),
			cellAt(house.column, house.row - 1),
		];
		const isConnected = neighbours.some((cell) => cell && cell.building === "road");
		const isPowered = isConnected && state.energyUsed < state.energyCapacity;
		if (isPowered) {
			state.energyUsed += 1;
			state.population += buildingTypes.house.population;
		}
		hasUnconnectedHouse = hasUnconnectedHouse || !isConnected;
		hasUnpoweredHouse = hasUnpoweredHouse || (isConnected && !isPowered);
		house.mesh.userData.walls.material.color.setHex(isPowered ? house.mesh.userData.wallColor : colors.houseInactive);
	}

	if (hasUnconnectedHouse) {
		showHint(texts.hints.needRoad);
	} else if (hasUnpoweredHouse) {
		showHint(texts.hints.needEnergy);
	}
	updateHud();

	if (!state.isFinished && state.population >= state.settings.targetPopulation) {
		showHint(texts.hints.goalReached);
		window.setTimeout(finishLevel, 1200);
	}
}

function updateHud() {
	elements.budget.textContent = `${state.budget} ${texts.costSuffix}`;
	elements.population.textContent = `${state.population} / ${state.settings.targetPopulation}`;
	elements.energy.textContent = `${state.energyUsed} / ${state.energyCapacity}`;
	elements.energy.classList.toggle("warning", state.cells.some((cell) => cell.building === "house") && state.energyCapacity === 0);
	elements.tools.querySelectorAll("button").forEach((button) => {
		button.setAttribute("aria-pressed", String(button.dataset.tool === state.tool));
	});
}

// Действие выбранного инструмента на клетке.
function applyTool(cell) {
	if (state.isFinished) {
		return;
	}
	if (state.tool === "bulldozer") {
		if (!cell.building) {
			showHint(texts.hints.empty);
			return;
		}
		state.budget += Math.floor(buildingTypes[cell.building].cost * refundShare);
		removeBuildingMesh(cell);
		cell.building = null;
		recalculateCity();
		return;
	}
	if (cell.isWater) {
		showHint(texts.hints.water);
		return;
	}
	if (cell.building) {
		showHint(texts.hints.occupied);
		return;
	}
	const cost = buildingTypes[state.tool].cost;
	if (cost > state.budget) {
		showHint(texts.hints.noMoney);
		return;
	}
	state.budget -= cost;
	state.placementCounter += 1;
	cell.building = state.tool;
	cell.placedAt = state.placementCounter;
	cell.mesh = createBuildingMesh(state.tool);
	cell.mesh.position.copy(cellPosition(cell.column, cell.row));
	cell.mesh.traverse((object) => {
		object.castShadow = true;
	});
	cell.mesh.scale.setScalar(0.01);
	growingObjects.push(cell.mesh);
	buildingsGroup.add(cell.mesh);
	showHint("");
	recalculateCity();
}

function removeBuildingMesh(cell) {
	if (!cell.mesh) {
		return;
	}
	buildingsGroup.remove(cell.mesh);
	cell.mesh.traverse((object) => {
		const index = smokePuffs.indexOf(object);
		if (index !== -1) {
			smokePuffs.splice(index, 1);
		}
	});
	cell.mesh = null;
}

// Клетка под указателем мыши или пальца.
function pickCell(event) {
	const bounds = renderer.domElement.getBoundingClientRect();
	pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
	pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
	raycaster.setFromCamera(pointer, camera);
	const hit = raycaster.intersectObjects(tileMeshes, false)[0];
	return hit ? cellAt(hit.object.userData.column, hit.object.userData.row) : null;
}

function handlePointerMove(event) {
	const cell = pickCell(event);
	hoverMarker.visible = Boolean(cell);
	if (cell) {
		hoverMarker.position.copy(cellPosition(cell.column, cell.row)).setY(0.03);
	}
}

function handlePointerDown(event) {
	const cell = pickCell(event);
	if (cell) {
		applyTool(cell);
	}
}

// Кнопки инструментов с ценой постройки.
function buildToolbar() {
	elements.tools.textContent = "";
	for (const tool of toolOrder) {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "tool";
		button.dataset.tool = tool;
		const label = document.createElement("span");
		label.className = "tool-label";
		label.textContent = texts.tools[tool];
		const symbol = document.createElement("i");
		symbol.className = "tool-icon";
		symbol.setAttribute("aria-hidden", "true");
		button.append(symbol,label);
		if (buildingTypes[tool]) {
			const price = document.createElement("small");
			price.textContent = `${buildingTypes[tool].cost} ${texts.costSuffix}`;
			label.appendChild(price);
		}
		button.addEventListener("click", () => {
			state.tool = tool;
			updateHud();
		});
		elements.tools.appendChild(button);
	}
}

// Заголовок и инструменты занимают собственные строки. Камера подстраивается под оставшееся поле.
function resize() {
	const area = renderer.domElement.parentElement;
	const width = area.clientWidth;
	const height = area.clientHeight;
	if (!width || !height) return;
	renderer.setSize(width, height, false);
	const aspect = width / height;
	const gridSize = state.settings ? state.settings.gridSize : 8;
	const halfHeightForMap = (gridSize * .86 + 2.6) / 2;
	const halfWidthForMap = (gridSize * 1.42) / 2 / .90;
	const halfHeight = Math.max(halfHeightForMap, halfWidthForMap / aspect);
	camera.left = -halfHeight * aspect;
	camera.right = halfHeight * aspect;
	camera.top = halfHeight;
	camera.bottom = -halfHeight;
	camera.updateProjectionMatrix();
}

// Анимация: постройки вырастают, дым поднимается.
function animate(timeMs) {
	for (let index = growingObjects.length - 1; index >= 0; index -= 1) {
		const object = growingObjects[index];
		const nextScale = Math.min(1, object.scale.x + 0.12);
		object.scale.setScalar(nextScale);
		if (nextScale >= 1) {
			growingObjects.splice(index, 1);
		}
	}
	const seconds = timeMs / 1000;
	for (const puff of smokePuffs) {
		const progress = (seconds * 0.5 + puff.userData.phase) % 1;
		puff.position.copy(puff.userData.origin).add(new THREE.Vector3(progress * 0.25, progress * 0.7, 0));
		puff.scale.setScalar(0.6 + progress * 1.4);
		puff.material.opacity = 0.7 * (1 - progress);
	}
	renderer.render(scene, camera);
}

function finishLevel() {
	if (state.isFinished) {
		return;
	}
	state.isFinished = true;
	const target = state.settings.targetPopulation;
	bridge.finish({ score: Math.min(state.population, target), maxScore: target, completed: true });
}

// Запуск уровня по сообщению портала (или сразу в автономном режиме).
function startLevel(levelId) {
	state.levelId = levelSettings[levelId] ? levelId : "easy";
	state.settings = levelSettings[state.levelId];
	state.budget = state.settings.budget;

	buildMap();
	// Матрицы плиток иначе обновятся только при первой отрисовке, и клик в первый кадр уйдёт мимо карты.
	scene.updateMatrixWorld();
	buildToolbar();
	resize();

	elements.levelTitle.textContent = texts.levelTitles[state.levelId];
	elements.goal.textContent = `${texts.goalPrefix} ${state.settings.targetPopulation} ${texts.goalSuffix}`;
	elements.loading.hidden = true;
	elements.hud.hidden = false;
	elements.toolbar.hidden = false;
	showHint(texts.hints.start);
	updateHud();
	renderer.domElement.focus();
}

function init() {
	fillStaticTexts();
	if (!createRenderer()) {
		return;
	}
	createScene();
	resize();
	renderer.setAnimationLoop(animate);

	new ResizeObserver(resize).observe(renderer.domElement.parentElement);
	renderer.domElement.addEventListener("pointermove", handlePointerMove);
	renderer.domElement.addEventListener("pointerdown", handlePointerDown);
	renderer.domElement.addEventListener("pointerleave", () => {
		hoverMarker.visible = false;
	});
	elements.finish.addEventListener("click", finishLevel);
	elements.exit.addEventListener("click", () => {
		state.isFinished = true;
		bridge.exit();
	});

	// Игра готова принять уровень: мост сообщает порталу о готовности и ждёт старта.
	bridge.onStart((start) => startLevel(start.levelId));
}

init();
