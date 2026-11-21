import { text } from './text.js';

const width = 108;
const height = 80;
const healthy = '#d1e7d8';

function part_Color(condition) {
	if (condition < .45) return '#ff686e';
	if (condition < 1) return '#ffb865';
	return healthy;
}

export function bind_DamageDisplay(canvas, propellers, guarded) {
	const context = canvas.getContext('2d');
	context.scale(2, 2);
	context.lineJoin = 'round';
	context.lineCap = 'round';
	const spanX = Math.max(...propellers.map(({ position }) => Math.abs(position.x)));
	const spanZ = Math.max(...propellers.map(({ position }) => Math.abs(position.z)));
	const scale = Math.min(35 / spanX, 23 / spanZ);
	const centers = propellers.map(({ position }) => [54 + position.x * scale, 40 + position.z * scale]);
	let previous = '';

	return ({ propellers: conditions, hull }) => {
		const parts = [...conditions, hull];
		const status = parts.map((condition, index) => condition < 1
			? `${text.flight.damageParts[index]} ${Math.min(99, Math.round(condition * 100))}%` : '').filter(Boolean).join(', ');
		if (status === previous) return;
		previous = status;
		canvas.hidden = !status;
		if (!status) return;
		canvas.setAttribute('aria-label', status);
		context.clearRect(0, 0, width, height);
		context.fillStyle = '#101914e6';
		context.fillRect(0, 0, width, height);
		context.lineWidth = 2;

		centers.forEach(([x, y], index) => {
			context.strokeStyle = part_Color(conditions[index]);
			context.beginPath();
			context.moveTo(54, 40);
			context.lineTo(x, y);
			context.stroke();
			context.beginPath();
			context.arc(x, y, guarded ? 12 : 10, 0, 2 * Math.PI);
			context.fillStyle = '#15231c';
			context.fill();
			context.stroke();
			context.beginPath();
			context.moveTo(x - 5, y - 4);
			context.lineTo(x + 5, y + 4);
			context.stroke();
		});

		context.strokeStyle = part_Color(hull);
		context.fillStyle = '#15231c';
		context.beginPath();
		context.moveTo(54, 22);
		context.lineTo(64, 33);
		context.lineTo(62, 57);
		context.lineTo(46, 57);
		context.lineTo(44, 33);
		context.closePath();
		context.fill();
		context.stroke();
	};
}
