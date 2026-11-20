const flightKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'KeyQ', 'KeyE', 'KeyR', 'KeyF', 'Space']);

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

export function bind_FlightInputs(left, right, action, signal) {
	const keys = new Set();
	window.addEventListener('keydown', event => {
		if (!flightKeys.has(event.code) || event.altKey || event.ctrlKey || event.metaKey) return;
		if (event.code === 'Space' && event.target instanceof HTMLButtonElement) return;
		event.preventDefault();
		if (event.code === 'Space' && !event.repeat) action();
		keys.add(event.code);
	}, { signal });
	window.addEventListener('keyup', event => keys.delete(event.code), { signal });
	function reset() {
		keys.clear();
		left.reset();
		right.reset();
	}
	window.addEventListener('blur', reset, { signal });
	document.addEventListener('visibilitychange', reset, { signal });
	const has = (...codes) => Number(codes.some(code => keys.has(code)));
	return {
		reset,
		axes() {
			return {
				x: has('KeyD', 'ArrowRight') - has('KeyA', 'ArrowLeft') + left.vector.x,
				z: has('KeyS', 'ArrowDown') - has('KeyW', 'ArrowUp') + left.vector.y,
				yaw: has('KeyE') - has('KeyQ') + right.vector.x,
				y: has('KeyR') - has('KeyF') - right.vector.y,
			};
		},
	};
}
