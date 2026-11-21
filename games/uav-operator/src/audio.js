// Один контекст на игру. Узлы каждого этапа освобождаются при выходе.
import { read_SoundEnabled, save_SoundEnabled } from './progress.js';

let context;
let muted = !read_SoundEnabled();

export function create_Sound(signal) {
	let master, noise, rotors, motorGain, rotorFilter, wind, radio;
	function gain_Node(destination, value) {
		const gain = context.createGain();
		gain.gain.value = value;
		gain.connect(destination);
		return gain;
	}
	function unlock() {
		if (!window.AudioContext) return;
		try {
			context ??= new AudioContext();
			if (context.state === 'suspended') context.resume().catch(() => {});
			if (master) return;
			master = gain_Node(context.destination, muted ? 0 : .38);
			noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
			const samples = noise.getChannelData(0);
			for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;
		} catch {
			// Браузер может запретить звук во встроенной игре.
		}
	}
	document.addEventListener('pointerdown', unlock, { capture: true, signal });
	document.addEventListener('keydown', unlock, { capture: true, signal });
	function sync_Volume() {
		if (master) master.gain.setTargetAtTime(muted || document.hidden ? 0 : .38, context.currentTime, .025);
	}
	document.addEventListener('visibilitychange', sync_Volume, { signal });
	function noise_Band(type, frequency, destination) {
		const source = context.createBufferSource();
		source.buffer = noise;
		const filter = context.createBiquadFilter();
		filter.type = type;
		filter.frequency.value = frequency;
		source.connect(filter).connect(destination);
		return source;
	}
	const sources = [];
	function start_Motors() {
		motorGain = gain_Node(master, 0);
		rotorFilter = context.createBiquadFilter();
		rotorFilter.type = 'lowpass';
		rotorFilter.connect(motorGain);
		const harmonics = new Float32Array([0, .75, .25, .33, .12, .11, .06, .04]);
		const wave = context.createPeriodicWave(new Float32Array(harmonics.length), harmonics);
		rotors = [0, 1, 2, 3].map(index => {
			const rotor = context.createOscillator();
			rotor.setPeriodicWave(wave);
			rotor.detune.value = (index - 1.5) * 8;
			rotor.connect(rotorFilter);
			rotor.start();
			return rotor;
		});
		wind = gain_Node(master, 0);
		radio = gain_Node(master, 0);
		const air = noise_Band('lowpass', 1150, wind);
		const hiss = noise_Band('highpass', 2500, radio);
		for (const source of [air, hiss]) {
			source.loop = true;
			source.start();
		}
		sources.push(...rotors, air, hiss);
	}
	signal.addEventListener('abort', () => {
		for (const source of sources) source.stop();
		master?.disconnect();
	}, { once: true });
	const effects = {
		metal: [2700, .08, .38], turn: [1950, .12, .48], plug: [1400, .045, .48],
		lid: [480, .14, .68], land: [210, .16, .58], impact: [420, .27, .85],
		shutter: [2300, .085, .50], mark: [1200, .045, .32],
	};
	return {
		get muted() { return muted; },
		toggle() { muted = !muted; save_SoundEnabled(!muted); sync_Volume(); return muted; },
		play(name) {
			if (!master || muted || document.hidden) return;
			const [frequency, duration, volume] = effects[name];
			const envelope = gain_Node(master, volume);
			const source = noise_Band('bandpass', frequency, envelope);
			const now = context.currentTime;
			envelope.gain.setValueAtTime(volume, now);
			envelope.gain.exponentialRampToValueAtTime(.001, now + duration);
			source.onended = () => envelope.disconnect();
			source.start();
			source.stop(now + duration);
		},
		flight({ running, throttle, speed, loss, paused }) {
			if (!master || (!rotors && !running)) return;
			if (!rotors) start_Motors();
			const now = context.currentTime;
			const audible = !paused && !document.hidden;
			const load = Math.min(1, Math.max(0, throttle));
			for (const [index, rotor] of rotors.entries()) {
				const drift = Math.sin(now * (2.8 + index)) * (1.3 + load * 2);
				rotor.frequency.setTargetAtTime(67 + load * 265 + drift, now, .055);
			}
			rotorFilter.frequency.setTargetAtTime(620 + load * 1900, now, .07);
			motorGain.gain.setTargetAtTime(running && audible ? .052 + load * .053 : 0, now, .07);
			wind.gain.setTargetAtTime(running && audible ? .038 + Math.min(speed / 28, 1) * .18 : 0, now, .15);
			radio.gain.setTargetAtTime(audible ? loss ** 2 * .16 : 0, now, .09);
		},
	};
}
