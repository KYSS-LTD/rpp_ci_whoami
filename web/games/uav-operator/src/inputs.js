const flightKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);

export function bind_Joystick(root, signal) {
	const knob = root.firstElementChild;
	const vector = { x: 0, y: 0 };
	let activePointer = null;

	function move_Pointer(event) {
		const rect = root.getBoundingClientRect();
		const axisX = (event.clientX - rect.left - rect.width / 2) / (rect.width * .34);
		const axisY = (event.clientY - rect.top - rect.height / 2) / (rect.height * .34);
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
		if (activePointer !== null && root.hasPointerCapture(activePointer)) root.releasePointerCapture(activePointer);
		activePointer = null;
		knob.style.transform = '';
	}

	root.addEventListener('pointerdown', event => {
		if (event.button !== 0 || activePointer !== null) return;
		activePointer = event.pointerId;
		root.setPointerCapture(activePointer);
		move_Pointer(event);
	}, { signal });
	root.addEventListener('pointermove', event => {
		if (event.pointerId === activePointer) move_Pointer(event);
	}, { signal });
	root.addEventListener('lostpointercapture', event => {
		if (event.pointerId === activePointer) reset();
	}, { signal });
	return { vector, reset };
}

export function bind_FlightInputs(attitudeStick, throttleStick, { action, toggleMap, restart, menu, bindings, blocked, signal, showAxes }) {
	const keys = new Set();
	window.addEventListener('keydown', event => {
		if (event.altKey || event.ctrlKey || event.metaKey) return;
		if (event.target instanceof Element && event.target.closest('input, select, textarea, [contenteditable="true"]')) return;
		const hotkey = event.code === bindings.menu ? menu : event.code === bindings.restart ? restart : blocked() ? null
			: event.code === bindings.map ? toggleMap : event.code === bindings.action ? action : null;
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
