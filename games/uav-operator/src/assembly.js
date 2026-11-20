import { connections, componentColors, create_Bench, partOrder } from './scenes.js';
import { fpvKit } from './fpv.js';
import { bind_Click, query, scene_Frame, set_Status, stage_Shell } from './ui.js';
import { text } from './text.js';

export function start_Assembly({ mount, complete, signal }) {
	const bench = create_Bench();
	const copy = text.assembly;
	const color = type => `#${componentColors[type].toString(16).padStart(6,'0')}`;
	const scene = scene_Frame('<canvas id="wires" aria-hidden="true"></canvas>');
	const controls = `<div class="scene-actions"><button class="button button-primary" id="driver" type="button">${copy.tool}</button></div>`;
	const panel = `<div class="kit-profile"><h2>${fpvKit.name}</h2><p>${copy.profile}</p></div><button type="button" class="button button-quiet" id="rotate">${copy.rotate}</button><div class="diagram"><p class="micro">${copy.diagram}</p><div class="diagram-grid">
		${Object.entries(connections).map(([type, port]) => `<div><span class="part-dot" style="--part:${color(type)}"></span><b>${port}</b><span>${copy.labels[port]}</span></div>`).join('')}
		</div></div>
		<h2>${copy.parts}</h2><div class="part-grid">
		${partOrder.map(type => `<button class="part-button" id="part-${type}" type="button" aria-pressed="false"><span class="part-dot" style="--part:${color(type)}"></span>${copy.items[type].title}</button>`).join('')}
		</div>
		<p class="detail" id="part-detail" aria-live="polite">${copy.select}</p>
		<h2>${copy.ports}</h2><div class="port-grid">
		${Object.entries(connections).map(([type, port]) => `<button class="port-button" id="port-${port}" type="button" disabled>${port}</button>`).join('')}
		</div>`;
	mount(stage_Shell(0, scene, panel, controls));
	let errors = 0;
	let phase = 'opening';
	const tool = query('#driver');
	const detail = query('#part-detail');

	function update_Controls() {
		const active = bench.selected;
		for (const [type, port] of Object.entries(connections)) {
			const part = query(`#part-${type}`);
			const socket = query(`#port-${port}`);
			const installed = bench.installed.has(type);
			part.setAttribute('aria-pressed', type === active);
			socket.disabled = installed || active === null || phase !== 'wiring';
			socket.dataset.installed = installed;
			part.dataset.installed = installed;
		}
		tool.hidden = phase === 'secured' || (phase === 'wiring' && bench.installed.size < partOrder.length);
		tool.textContent = { opening: bench.tool ? copy.twist : copy.tool, wiring: copy.closeLid, closing: copy.tighten }[phase] ?? '';
	}

	const canvas = query('#canvas-slot canvas');
	let lastX = null;
	function turn_Driver(amount) {
		if (phase === 'opening') {
			bench.turn = Math.min(1, bench.turn + amount);
			if (bench.turn === 1) {
				phase = 'wiring';
				bench.lidOpen = true;
			}
			set_Status(bench.lidOpen ? copy.open : copy.turnHint);
		} else if (phase === 'closing') {
			bench.turn = Math.max(0, bench.turn - amount);
			if (bench.turn === 0) {
				phase = 'secured';
				bench.tool = false;
				set_Status(copy.secured, 'success');
			}
		}
		update_Controls();
	}
	tool.addEventListener('click', () => {
		if (phase === 'wiring' && bench.installed.size === partOrder.length) {
			phase = 'closing';
			bench.lidOpen = false;
			set_Status(copy.tightenHint);
			update_Controls();
			return;
		}
		const amount = bench.tool ? .25 : 0;
		if (phase === 'opening') bench.tool = true;
		turn_Driver(amount);
	}, { signal });
	canvas.addEventListener('pointerdown', event => {
		if (event.button !== 0 || lastX !== null || !bench.tool || (phase !== 'opening' && phase !== 'closing')) return;
		if (controlAt(point(event))?.startsWith('part-')) return;
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
			const item = copy.items[type];
			const info = `${item.title} · ${item.detail}`;
			detail.textContent = info;
			let notice = info;
			let state = '';
			if (phase === 'wiring') {
				if (type !== 'battery' && bench.installed.has('battery')) {
					notice = `${info} ${copy.disconnectPower}`;
					state = 'warn';
				} else if (bench.installed.delete(type)) {
					bench.selected = null;
					notice = `${info} ${copy.unplugged}`;
				} else bench.selected = type;
			}
			set_Status(notice, state, true);
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
		if (event.button !== 0 || dragging || lastX !== null) return;
		const position = point(event);
		const control = controlAt(position);
		if (!control) return;
		query(`#${control}`).click();
		if (phase === 'wiring' && control === `part-${bench.selected}`) {
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
		if (!bench.lidOpen) return;
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
	bench.score = () => Math.max(0, bench.installed.size * 12 + (phase === 'opening' ? 0 : 8) + (bench.lidOpen || phase === 'opening' ? 0 : 10) + (phase === 'secured' ? 10 : 0) - errors * 6);
	return bench;
}
