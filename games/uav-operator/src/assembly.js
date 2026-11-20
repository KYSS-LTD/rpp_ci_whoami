import { connections, componentColors, create_Bench, partOrder } from './scenes.js';
import { fpvKit } from './fpv.js';
import { bind_Click, query, scene_Frame, set_Status, stage_Shell } from './ui.js';
import { text } from './text.js';

export function start_Assembly({ mount, complete, signal }) {
	const bench = create_Bench();
	const copy = text.assembly;
	const color = type => `#${componentColors[type].toString(16).padStart(6,'0')}`;
	const scene = scene_Frame(`<canvas id="wires" aria-hidden="true"></canvas><span class="view-label">${copy.view}</span><button type="button" class="scene-button" id="rotate">${copy.rotate}</button>`);
	const panel = `<div class="kit-profile"><h2>${fpvKit.name}</h2><p>${copy.profile}</p></div><button class="button button-primary" id="driver" type="button">${copy.tool}</button><div class="diagram"><p class="micro">${copy.diagram}</p><div class="diagram-grid">
		${Object.entries(connections).map(([type, port]) => `<div><span class="part-dot" style="--part:${color(type)}"></span><b>${port}</b><span>${copy.labels[port]}</span></div>`).join('')}
		</div></div>
		<h2>${copy.parts}</h2><div class="part-grid">
		${partOrder.map(type => `<button class="part-button" id="part-${type}" type="button" aria-pressed="false"><span class="part-dot" style="--part:${color(type)}"></span>${copy.items[type].title}</button>`).join('')}
		</div>
		<p class="detail" id="part-detail" aria-live="polite">${copy.select}</p>
		<h2>${copy.ports}</h2><div class="port-grid">
		${Object.entries(connections).map(([type, port]) => `<button class="port-button" id="port-${port}" type="button" disabled>${port}</button>`).join('')}
		</div>
		<button class="button button-primary wide" id="check" type="button" disabled>${copy.check}</button>`;
	mount(stage_Shell(0, scene, panel));
	let errors = 0;

	function update_Controls() {
		const active = bench.selected;
		for (const [type, port] of Object.entries(connections)) {
			const part = query(`#part-${type}`);
			const socket = query(`#port-${port}`);
			const installed = bench.installed.has(type);
			part.disabled = bench.turn < 1;
			part.setAttribute('aria-pressed', type === active);
			socket.disabled = installed || active === null;
			socket.dataset.installed = installed;
			part.dataset.installed = installed;
		}
		query('#check').disabled = bench.installed.size !== partOrder.length;
		query('#part-detail').textContent = active ? copy.items[active].detail : copy.select;
	}

	const canvas = query('#canvas-slot canvas');
	const tool = query('#driver');
	let lastX = null;
	function turn_Driver(amount) {
		bench.tool = true;
		bench.turn = Math.min(1, bench.turn + amount);
		tool.textContent = bench.turn === 1 ? copy.open : copy.twist;
		tool.disabled = bench.turn === 1;
		set_Status(bench.turn === 1 ? copy.select : copy.turnHint);
		update_Controls();
	}
	tool.addEventListener('click', () => turn_Driver(bench.tool ? .25 : 0), { signal });
	canvas.addEventListener('pointerdown', event => {
		if (!bench.tool || bench.turn === 1) return;
		canvas.setPointerCapture(event.pointerId);
		lastX = event.clientX;
	}, { signal });
	canvas.addEventListener('pointermove', event => {
		if (lastX === null || !canvas.hasPointerCapture(event.pointerId)) return;
		turn_Driver(Math.abs(event.clientX - lastX) / 320);
		lastX = event.clientX;
	}, { signal });
	canvas.addEventListener('lostpointercapture', () => { lastX = null; }, { signal });
	update_Controls();
	for (const [type, port] of Object.entries(connections)) {
		bind_Click(`#part-${type}`, () => {
			if (type !== 'battery' && bench.installed.has('battery')) {
				set_Status(copy.disconnectPower, 'warn');
				return;
			}
			if (bench.installed.delete(type)) {
				bench.selected = null;
				set_Status(copy.unplugged);
				update_Controls();
				return;
			}
			bench.selected = type;
			set_Status('');
			update_Controls();
		}, signal);
		bind_Click(`#port-${port}`, () => {
			if (bench.selected !== type) {
				errors++;
				set_Status(copy.wrong, 'warn');
				return;
			}
			if (type === 'battery' && bench.installed.size < partOrder.length - 1) {
				errors++;
				set_Status(copy.last, 'warn');
				return;
			}
			bench.installed.add(type);
			bench.selected = null;
			update_Controls();
			const nextPart = query('.part-button:not(:disabled)') || query('#check');
			nextPart.focus({ preventScroll: true });
			set_Status(bench.installed.size === partOrder.length ? copy.good : `${copy.installed} ${bench.installed.size} / ${partOrder.length}`, 'success');
		}, signal);
	}
	const wires = query('#wires');
	const ink = wires.getContext('2d');
	let dragging = null;
	function point(event) {
		const rect = canvas.getBoundingClientRect();
		return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
	}
	function controlAt(position) {
		return bench.pick(position.x * 2 - 1, 1 - position.y * 2);
	}
	canvas.addEventListener('pointerdown', event => {
		if (bench.turn < 1 || event.button !== 0 || dragging) return;
		const position = point(event);
		const control = controlAt(position);
		if (!control) return;
		query(`#${control}`).click();
		if (control.startsWith('part-') && bench.selected) {
			dragging = { id: event.pointerId, position };
			canvas.setPointerCapture(event.pointerId);
		}
	}, { signal });
	canvas.addEventListener('pointermove', event => {
		if (dragging?.id === event.pointerId) dragging.position = point(event);
	}, { signal });
	canvas.addEventListener('pointerup', event => {
		if (dragging?.id !== event.pointerId) return;
		const control = controlAt(point(event));
		if (control?.startsWith('port-')) query(`#${control}`).click();
		dragging = null;
	}, { signal });
	canvas.addEventListener('lostpointercapture', () => { dragging = null; }, { signal });
	const animateBench = bench.update.bind(bench);
	bench.update = (delta, time) => {
		animateBench(delta, time);
		bench.camera.updateMatrixWorld();
		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		if (wires.width !== width || wires.height !== height) {
			wires.width = width;
			wires.height = height;
		}
		ink.clearRect(0, 0, width, height);
		for (const type of partOrder) {
			const moving = dragging && type === bench.selected;
			if (!moving && !bench.installed.has(type)) continue;
			const [plug, socket] = bench.wireEnds(type);
			const startX = (1 + plug.x) * width / 2;
			const startY = (1 - plug.y) * height / 2;
			const endX = moving ? dragging.position.x * width : (1 + socket.x) * width / 2;
			const endY = moving ? dragging.position.y * height : (1 - socket.y) * height / 2;
			ink.beginPath();
			ink.moveTo(startX, startY);
			ink.bezierCurveTo(startX, startY + height * .06, endX, endY + height * .06, endX, endY);
			ink.lineWidth = 5;
			ink.strokeStyle = '#252826';
			ink.stroke();
			ink.lineWidth = 2;
			ink.strokeStyle = color(type);
			ink.stroke();
		}
	};
	bind_Click('#rotate', () => bench.rotate(), signal);
	bind_Click('#check', () => complete(Math.max(55, 100 - errors * 6)), signal);
	return bench;
}
