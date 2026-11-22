const flightKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);

export function bind_Joystick(root, zone, signal) {
	const knob = root.firstElementChild;
	const vector = { x: 0, y: 0 };
	let activePointer = null;
	let surface = null;
	let centerX = 0;
	let centerY = 0;
	let radius = 1;

	function move_Pointer(event) {
		const axisX = (event.clientX - centerX) / radius;
		const axisY = (event.clientY - centerY) / radius;
		const length = Math.max(1, Math.hypot(axisX, axisY));
		vector.x = axisX / length;
		vector.y = axisY / length;
		display(vector.x, vector.y);
	}

	function display(x, y) {
		knob.style.transform = `translate(${x * 70}%, ${y * 70}%)`;
	}

	function reset() {
		vector.x = vector.y = 0;
		const pointer = activePointer;
		activePointer = null;
		if (pointer !== null && surface.hasPointerCapture(pointer)) surface.releasePointerCapture(pointer);
		surface = null;
		delete zone.dataset.active;
		knob.style.transform = '';
	}

	for (const element of [root, zone]) {
		element.addEventListener('pointerdown', event => {
			if (event.button !== 0 || activePointer !== null || (element === zone && event.pointerType !== 'touch')) return;
			const rect = element.getBoundingClientRect();
			const floating = element === zone;
			centerX = floating ? event.clientX : rect.left + rect.width / 2;
			centerY = floating ? event.clientY : rect.top + rect.height / 2;
			radius = floating ? 38 : rect.width * .34;
			activePointer = event.pointerId;
			surface = element;
			element.setPointerCapture(activePointer);
			if (floating) {
				zone.style.setProperty('--touch-x', `${centerX - rect.left}px`);
				zone.style.setProperty('--touch-y', `${centerY - rect.top}px`);
				zone.dataset.active = 'true';
			}
			move_Pointer(event);
		}, { signal });
		element.addEventListener('pointermove', event => {
			if (event.pointerId === activePointer) move_Pointer(event);
		}, { signal });
		for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) element.addEventListener(name, event => {
			if (event.pointerId === activePointer) reset();
		}, { signal });
	}
	return { vector, reset };
}

export function bind_FlightInputs(attitudeStick, throttleStick, { action, land, toggleMap, restart, toggleCamera, menu, bindings, blocked, signal, showAxes }) {
	const keys = new Set();
	window.addEventListener('keydown', event => {
		if (event.altKey || event.ctrlKey || event.metaKey) return;
		if (event.target instanceof Element && event.target.closest('input, select, textarea, [contenteditable="true"]')) return;
		const hotkey = event.code === bindings.menu ? menu : event.code === bindings.restart ? restart : blocked() ? null
			: event.code === bindings.map ? toggleMap : event.code === bindings.action ? action
				: event.code === 'KeyV' ? toggleCamera : event.code === 'KeyH' ? land : null;
		if (hotkey) {
			if (['Space', 'Enter'].includes(event.code) && event.target instanceof Element && event.target.closest('button, a, summary')) return;
			event.preventDefault();
			if (!event.repeat) hotkey();
			return;
		}
		if (blocked() || !flightKeys.has(event.code)) return;
		event.preventDefault();
		keys.add(event.code);
	}, { signal });
	window.addEventListener('keyup', event => keys.delete(event.code), { signal });
	function reset() {
		keys.clear();
		attitudeStick.reset();
		throttleStick.reset();
	}
	window.addEventListener('blur', reset, { signal });
	document.addEventListener('visibilitychange', reset, { signal });
	const has = code => Number(keys.has(code));
	const clamp = value => Math.max(-1, Math.min(1, value));
	const deadzone = value => Math.abs(value) < .13 ? 0 : Math.sign(value) * (Math.abs(value) - .13) / .87;
	let forwarded = null;
	let buttons = [true, true, true, true, true];
	let canPoll = true;
	window.addEventListener('message', event => {
		const data = event.data;
		if (event.source !== window.parent || data?.source !== 'portal' || data.type !== 'gamepad') return;
		const sample = data.sample;
		if (sample === null || (Array.isArray(sample?.axes) && sample.axes.length === 4 && sample.axes.every(Number.isFinite)
			&& Array.isArray(sample.buttons) && sample.buttons.length === 5)) forwarded = sample;
	}, { signal });

	function read_Pad() {
		if (document.hidden || !document.hasFocus()) return null;
		if (forwarded || !canPoll) return forwarded;
		try {
			const pad = Array.from(navigator.getGamepads?.() ?? []).find(entry => entry?.connected && entry.mapping === 'standard');
			return pad && { axes: pad.axes, buttons: [0, 1, 2, 3, 9].map(index => pad.buttons[index]?.pressed) };
		} catch {
			canPoll = false;
			return null;
		}
	}

	return {
		reset,
		axes() {
			const pad = read_Pad();
			const previous = buttons;
			buttons = pad?.buttons ?? [];
			if (buttons[4] && !previous[4]) menu();
			if (!blocked()) {
				if (buttons[2] && !previous[2]) queueMicrotask(() => { if (!signal.aborted) restart(); });
				else if (buttons[3] && !previous[3]) toggleMap();
				else if (buttons[0] && !previous[0]) action();
			}
			const axes = {
				x: clamp(has('ArrowRight') - has('ArrowLeft') + attitudeStick.vector.x + deadzone(pad?.axes[2] ?? 0)),
				z: clamp(has('ArrowDown') - has('ArrowUp') + attitudeStick.vector.y + deadzone(pad?.axes[3] ?? 0)),
				yaw: clamp(has('KeyD') - has('KeyA') + throttleStick.vector.x + deadzone(pad?.axes[0] ?? 0)),
				y: clamp(has('KeyW') - has('KeyS') - throttleStick.vector.y - deadzone(pad?.axes[1] ?? 0)),
			};
			showAxes(axes);
			return axes;
		},
	};
}
