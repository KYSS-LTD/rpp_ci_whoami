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
		knob.style.transform = `translate(${vector.x * rect.width * .28}px, ${vector.y * rect.height * .28}px)`;
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

export function bind_FlightInputs(attitudeStick, throttleStick, { action, toggleMap, restart, blocked, signal }) {
	const keys = new Set();
	window.addEventListener('keydown', event => {
		if (event.altKey || event.ctrlKey || event.metaKey || blocked()) return;
		if (event.target instanceof Element && event.target.closest('input, select, textarea, dialog, [contenteditable="true"]')) return;
		if (event.code === 'KeyR') {
			event.preventDefault();
			if (!event.repeat) restart();
			return;
		}
		if (event.code === 'KeyM' || event.code === 'Space') {
			if (event.code === 'Space' && event.target instanceof HTMLButtonElement) return;
			event.preventDefault();
			if (!event.repeat) (event.code === 'KeyM' ? toggleMap : action)();
			return;
		}
		if (!flightKeys.has(event.code)) return;
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
	return {
		reset,
		axes() {
			return {
				x: has('ArrowRight') - has('ArrowLeft') + attitudeStick.vector.x,
				z: has('ArrowDown') - has('ArrowUp') + attitudeStick.vector.y,
				yaw: has('KeyD') - has('KeyA') + throttleStick.vector.x,
				y: has('KeyW') - has('KeyS') - throttleStick.vector.y,
			};
		},
	};
}
