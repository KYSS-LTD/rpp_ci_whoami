import { connections, componentColors, create_Bench, screwTurns } from './bench.js';
import { fpvKit } from './fpv.js';
import { bind_Click, query, scene_Frame, set_Status, show_CompletePrompt, stage_Shell, vibrate_Device } from './ui.js';
import { text } from './text.js';

export function start_Assembly({ mount, signal, settings }) {
	const { parts, preinstalled } = settings.assembly;
	const bench = create_Bench({ parts, preinstalled });
	const copy = text.assembly;
	const color = type => `#${componentColors[type].toString(16).padStart(6, '0')}`;
	const typeByPort = Object.fromEntries(Object.entries(connections).map(([type, port]) => [port, type]));
	const scene = scene_Frame(`<canvas id="wires" aria-hidden="true"></canvas><p class="assembly-step" id="assembly-step" aria-live="polite"></p>`);
	const panel = `<div class="kit-profile"><h2>${fpvKit.name}</h2><p>${copy.profile}</p></div><button type="button" class="button button-quiet" id="rotate">${copy.rotate}</button><div class="diagram"><p class="micro">${copy.diagram}</p><div class="diagram-grid">
		${[...parts, ...preinstalled].map(type => `<div><span class="part-dot" style="--part:${color(type)}"></span><b>${connections[type]}</b><span>${copy.labels[connections[type]]}${preinstalled.includes(type) ? ` · ${copy.preinstalledMark}` : ''}</span></div>`).join('')}
		</div></div>
		<h2>${copy.parts}</h2><div class="part-grid">
		${parts.map(type => `<button class="part-button" id="part-${type}" type="button" aria-pressed="false"><span class="part-dot" style="--part:${color(type)}"></span>${copy.items[type].title}</button>`).join('')}
		</div>
		<p class="detail" id="part-detail" aria-live="polite">${copy.select}</p>
		<h2>${copy.ports}</h2><div class="port-grid">
		${parts.map(type => `<button class="port-button" id="port-${connections[type]}" type="button" disabled>${connections[type]}</button>`).join('')}
		</div>`;
	mount(stage_Shell(0, scene, panel, '', `<p class="keyboard-note">${copy.keys}</p>`));
	const frame = query('#scene-frame');
	frame.tabIndex = -1;
	const canvas = query('#canvas-slot canvas');
	const detail = query('#part-detail');
	const step = query('#assembly-step');
	const wires = query('#wires');
	const ink = wires.getContext('2d');
	let errors = 0;
	let phase = 'opening';
	let lidRemoved = false;
	let dragging = null;
	let lastGuide = '';
	let touchInput = false;

	const lidScrews = () => bench.screws.filter(entry => entry.state === 'lid');
	const trayScrews = () => bench.screws.filter(entry => entry.state === 'tray');
	const placedScrews = () => bench.screws.filter(entry => entry.state === 'lid' && entry.depth < 1);
	const playerInstalled = () => parts.filter(type => bench.installed.has(type)).length;
	const turnsLeft = entry => Math.round((phase === 'opening' ? entry.depth : 1 - entry.depth) * screwTurns);

	// Подсказка следующего шага и подсветка объектов, с которыми нужно работать.
	function guide_Step() {
		const highlight = bench.highlight;
		highlight.clear();
		const engaged = bench.engagedScrew === null ? null : bench.screws[bench.engagedScrew];
		if (phase === 'opening') {
			if (engaged) {
				highlight.add(`screw-${bench.engagedScrew}`).add('driver');
				return `${copy.unscrew} ${turnsLeft(engaged)}`;
			}
			if (lidScrews().length) {
				if (bench.driverState === 'table') {
					highlight.add('driver');
					return copy.takeDriver;
				}
				for (const entry of lidScrews()) highlight.add(`screw-${bench.screws.indexOf(entry)}`);
				return copy.insertDriver;
			}
			highlight.add('lid');
			return copy.removeLid;
		}
		if (phase === 'wiring') {
			if (playerInstalled() === parts.length) {
				highlight.add('lid');
				return copy.closeLid;
			}
			return bench.selected ? copy.placePart : copy.choosePart;
		}
		if (phase === 'closing') {
			if (engaged) {
				highlight.add(`screw-${bench.engagedScrew}`).add('driver');
				return `${copy.tighten} ${turnsLeft(engaged)}`;
			}
			if (placedScrews().length) {
				highlight.add('driver');
				if (bench.driverState === 'hand') for (const entry of placedScrews()) highlight.add(`screw-${bench.screws.indexOf(entry)}`);
				return bench.driverState === 'hand' ? copy.engagePlaced : copy.takeDriverTighten;
			}
			for (const entry of trayScrews()) highlight.add(`screw-${bench.screws.indexOf(entry)}`);
			return copy.insertScrew;
		}
		return copy.secured;
	}

	function update_Controls() {
		for (const type of parts) {
			const part = query(`#part-${type}`);
			const socket = query(`#port-${connections[type]}`);
			const installed = bench.installed.has(type);
			part.setAttribute('aria-pressed', String(type === bench.selected));
			socket.disabled = installed || bench.selected === null || phase !== 'wiring';
			socket.dataset.installed = installed;
			part.dataset.installed = installed;
		}
		const message = guide_Step();
		if (message !== lastGuide) {
			lastGuide = message;
			step.textContent = message;
		}
	}

	function engage_Screw(index) {
		bench.driverState = 'engaged';
		bench.engagedScrew = index;
	}

	// Один щелчок по отвёртке или винту - один оборот.
	function turn_Screw() {
		const entry = bench.screws[bench.engagedScrew];
		const turns = Math.round(entry.depth * screwTurns) + (phase === 'opening' ? -1 : 1);
		entry.depth = Math.min(screwTurns, Math.max(0, turns)) / screwTurns;
		vibrate_Device(12);
		if (phase === 'opening' && entry.depth === 0) {
			entry.state = 'tray';
			bench.engagedScrew = null;
			bench.driverState = lidScrews().length ? 'hand' : 'table';
			set_Status(lidScrews().length ? copy.screwOut : copy.allOut, 'success');
		} else if (phase === 'closing' && entry.depth === 1) {
			bench.engagedScrew = null;
			if (lidScrews().length === bench.screws.length && !placedScrews().length) finish_Assembly();
			else {
				bench.driverState = placedScrews().length ? 'hand' : 'table';
				set_Status(copy.screwTight, 'success');
			}
		}
		update_Controls();
	}

	function finish_Assembly() {
		phase = 'secured';
		bench.driverState = 'table';
		set_Status(copy.secured, 'success');
		show_CompletePrompt(copy.completeNotice);
	}

	function use_Driver() {
		if (phase === 'wiring') return set_Status(copy.driverIdle);
		if (phase === 'secured') return set_Status(copy.driverDone);
		if (bench.driverState === 'engaged') return turn_Screw();
		const placed = placedScrews()[0];
		if (phase === 'closing' && placed) engage_Screw(bench.screws.indexOf(placed));
		else if (bench.driverState === 'table') {
			if (phase === 'opening' && !lidScrews().length) return set_Status(copy.removeLid);
			if (phase === 'closing') return set_Status(copy.insertScrew);
			bench.driverState = 'hand';
		} else bench.driverState = 'table';
		update_Controls();
	}

	function use_Screw(index) {
		const entry = bench.screws[index];
		if (entry.state === 'tray') {
			if (phase !== 'closing') return set_Status(phase === 'wiring' ? copy.closeFirst : copy.screwTray);
			entry.state = 'lid';
			entry.depth = entry.shownDepth = 0;
			set_Status(copy.screwPlaced, 'success');
			return update_Controls();
		}
		if (bench.driverState === 'engaged' && bench.engagedScrew === index) return turn_Screw();
		const needsWork = phase === 'opening' ? entry.depth > 0 : phase === 'closing' && entry.depth < 1;
		if (!needsWork) return set_Status(copy.screwDone);
		if (bench.driverState === 'table') return set_Status(copy.needDriver, 'warn');
		engage_Screw(index);
		update_Controls();
	}

	function use_Lid() {
		if (phase === 'opening') {
			if (lidScrews().length) return set_Status(copy.lidLocked, 'warn');
			bench.lidOpen = true;
			lidRemoved = true;
			phase = 'wiring';
			set_Status(copy.open, 'success');
		} else if (phase === 'wiring') {
			if (playerInstalled() < parts.length) return set_Status(copy.lidWait, 'warn');
			bench.selected = null;
			bench.lidOpen = false;
			phase = 'closing';
			set_Status(copy.lidOn, 'success');
		} else if (phase === 'closing' && lidScrews().length === 0) {
			// Пока ни один винт не вставлен, крышку можно снова снять и поправить проводку.
			bench.lidOpen = true;
			phase = 'wiring';
			set_Status(copy.open);
		} else return set_Status(copy.lidScrewed);
		update_Controls();
	}

	function select_Part(type) {
		const item = copy.items[type];
		const info = `${item.title} · ${item.detail}`;
		detail.textContent = info;
		if (!parts.includes(type)) return set_Status(`${item.title}. ${copy.preinstalledNote}`, '', true);
		let notice = info;
		let state = '';
		if (phase !== 'wiring') notice = `${info} ${phase === 'opening' ? copy.lidOpenNeeded : ''}`;
		else if (bench.installed.has(type)) {
			if (type !== 'battery' && bench.installed.has('battery')) {
				notice = `${info} ${copy.disconnectPower}`;
				state = 'warn';
			} else {
				bench.installed.delete(type);
				bench.selected = null;
				notice = `${info} ${copy.unplugged}`;
			}
		} else bench.selected = type;
		set_Status(notice.trim(), state, true);
		update_Controls();
	}

	function connect_Part(type) {
		if (phase !== 'wiring' || bench.installed.has(type)) return;
		if (!bench.selected) return set_Status(copy.selectFirst);
		if (bench.selected !== type) {
			errors++;
			vibrate_Device([20, 40, 20]);
			return set_Status(copy.wrong, 'warn');
		}
		if (type === 'battery' && playerInstalled() < parts.length - 1) {
			errors++;
			vibrate_Device([20, 40, 20]);
			return set_Status(copy.last, 'warn');
		}
		bench.installed.add(type);
		bench.selected = null;
		vibrate_Device(15);
		set_Status(playerInstalled() === parts.length ? copy.good : `${copy.installed} ${playerInstalled()} / ${parts.length}`, 'success');
		update_Controls();
	}

	// Выполняет следующий шаг с отвёрткой и крышкой. Нужен для управления с клавиатуры.
	function perform_Suggested() {
		if (bench.driverState === 'engaged') return turn_Screw();
		if (phase === 'opening') {
			const screw = lidScrews()[0];
			if (!screw) return use_Lid();
			return bench.driverState === 'table' ? use_Driver() : use_Screw(bench.screws.indexOf(screw));
		}
		if (phase === 'wiring' && playerInstalled() === parts.length) return use_Lid();
		if (phase === 'closing') {
			if (placedScrews().length) return use_Driver();
			const screw = trayScrews()[0];
			if (screw) return use_Screw(bench.screws.indexOf(screw));
		}
	}

	function handle_Control(control) {
		if (control === 'driver') use_Driver();
		else if (control === 'lid') use_Lid();
		else if (control.startsWith('screw-')) use_Screw(Number(control.slice(6)));
		else if (control.startsWith('part-')) select_Part(control.slice(5));
		else if (control.startsWith('port-')) connect_Part(typeByPort[control.slice(5)]);
	}

	// Объекты, которые имеет смысл выбирать сейчас. Остальные не перехватывают нажатие у соседей.
	function relevant(control) {
		if (control === 'driver' || control.startsWith('screw-') || control.startsWith('part-')) return true;
		if (control === 'lid') return (phase === 'opening' && !lidScrews().length) || (phase === 'wiring' && playerInstalled() === parts.length) || phase === 'closing';
		if (control.startsWith('port-')) return phase === 'wiring' && bench.lidOpen && bench.lid_Settled();
		return false;
	}

	function point(event) {
		const rect = canvas.getBoundingClientRect();
		return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
	}

	function control_At(position, accept = relevant) {
		const tolerance = { x: (touchInput ? 34 : 18) * 2 / canvas.clientWidth, y: (touchInput ? 34 : 18) * 2 / canvas.clientHeight };
		const x = position.x * 2 - 1;
		const y = 1 - position.y * 2;
		return bench.pick(x, y, accept, tolerance) ?? bench.pick(x, y, () => true, { x: 1e-6, y: 1e-6 });
	}

	canvas.addEventListener('pointerdown', event => {
		if (event.button !== 0 || dragging) return;
		touchInput = event.pointerType !== 'mouse';
		const position = point(event);
		if (bench.driverState === 'hand') bench.aim_Hand(position.x * 2 - 1, 1 - position.y * 2);
		const control = control_At(position);
		if (!control) return;
		handle_Control(control);
		if (phase === 'wiring' && control === `part-${bench.selected}`) {
			dragging = { id: event.pointerId, position };
			canvas.setPointerCapture(event.pointerId);
		}
	}, { signal });
	canvas.addEventListener('pointermove', event => {
		const position = point(event);
		if (dragging?.id === event.pointerId) {
			dragging.position = position;
			return;
		}
		if (bench.driverState === 'hand') bench.aim_Hand(position.x * 2 - 1, 1 - position.y * 2);
		if (event.pointerType === 'mouse') canvas.style.cursor = control_At(position) ? 'pointer' : 'default';
	}, { signal });
	canvas.addEventListener('pointerup', event => {
		if (dragging?.id !== event.pointerId) return;
		const control = control_At(point(event), entry => entry.startsWith('port-'));
		if (control?.startsWith('port-')) connect_Part(typeByPort[control.slice(5)]);
		dragging = null;
	}, { signal });
	canvas.addEventListener('lostpointercapture', () => { dragging = null; }, { signal });
	frame.addEventListener('keydown', event => {
		if ((event.key === ' ' || event.key === 'Enter') && event.target === frame && !event.repeat) {
			event.preventDefault();
			perform_Suggested();
		}
	}, { signal });
	for (const type of parts) {
		bind_Click(`#part-${type}`, () => select_Part(type), signal);
		bind_Click(`#port-${connections[type]}`, () => connect_Part(type), signal);
	}
	bind_Click('#rotate', () => bench.rotate(), signal);
	update_Controls();

	// Линия от выбранного модуля к пальцу или курсору во время перетаскивания.
	const animateBench = bench.update.bind(bench);
	bench.update = (delta, time) => {
		animateBench(delta, time);
		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		if (wires.width !== width || wires.height !== height) {
			wires.width = width;
			wires.height = height;
		}
		ink.clearRect(0, 0, width, height);
		if (!dragging || !bench.selected) return;
		const start = bench.projected_Part(bench.selected);
		const startX = (1 + start.x) * width / 2;
		const startY = (1 - start.y) * height / 2;
		const endX = dragging.position.x * width;
		const endY = dragging.position.y * height;
		ink.beginPath();
		ink.moveTo(startX, startY);
		ink.bezierCurveTo(startX, startY + height * .06, endX, endY + height * .06, endX, endY);
		ink.lineWidth = 5;
		ink.strokeStyle = '#252826';
		ink.stroke();
		ink.lineWidth = 2;
		ink.strokeStyle = color(bench.selected);
		ink.stroke();
	};
	bench.focus = () => frame.focus({ preventScroll: true });
	bench.score = () => {
		const wiring = Math.round(playerInstalled() / parts.length * 72);
		const closed = phase === 'closing' || phase === 'secured';
		return Math.max(0, wiring + (lidRemoved ? 8 : 0) + (closed ? 10 : 0) + (phase === 'secured' ? 10 : 0) - errors * 6);
	};
	bench.summary = () => `${copy.summary} ${errors}`;
	return bench;
}
