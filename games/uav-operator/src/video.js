import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

export function create_AnalogFeed(renderer) {
	const type = renderer.extensions.has('EXT_color_buffer_float') ? THREE.HalfFloatType : THREE.UnsignedByteType;
	const target = new THREE.WebGLRenderTarget(1, 1, { type });
	const size = new THREE.Vector2();
	const uniforms = {
		image: { value: target.texture }, pixels: { value: new THREE.Vector2() },
		clock: { value: 0 }, signalLoss: { value: 0 }, noise: { value: 0 },
	};
	const material = new THREE.ShaderMaterial({
		uniforms, depthWrite: false, depthTest: false,
		vertexShader: `varying vec2 coord;
			void main() { coord = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
		fragmentShader: `
			uniform sampler2D image;
			uniform vec2 pixels;
			uniform float clock, signalLoss, noise;
			varying vec2 coord;
			float hash(vec2 point) {
				return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
			}
			void main() {
				vec2 centered = (coord - .5) * 2.0;
				float radius = dot(centered, centered);
				vec2 uv = .5 + centered * (.463 + .021 * radius);
				float field = floor(clock * 50.0);
				float line = floor(uv.y * pixels.y);
				float band = step(.94 - .12 * signalLoss, hash(vec2(floor(line / 7.0), floor(field / 3.0))));
				uv.x += (hash(vec2(line, field)) - .5) * noise * (.002 + band * signalLoss * .058);
				vec3 color = texture2D(image, uv).rgb;
				vec3 bleed = texture2D(image, uv + vec2(2.0 / pixels.x, 0.0)).rgb;
				vec3 luma = vec3(.2126, .7152, .0722);
				color = vec3(dot(color, luma)) + .78 * (mix(color, bleed, .53) - dot(mix(color, bleed, .53), luma));
				float grain = hash(vec2(floor(uv.x * pixels.x), line + field * 127.0)) - .5;
				float stripe = mod(line + field, 2.0) * .021;
				color *= 1.0 - .15 * smoothstep(.38, 1.9, radius) - stripe;
				color += noise * (grain * (.029 + signalLoss * .15) + .011 * sin(field * 1.17));
				color = mix(color, vec3(.42 + grain * .65), band * signalLoss * noise * .32);
				gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
				#include <tonemapping_fragment>
				#include <colorspace_fragment>
			}`,
	});
	const quad = new FullScreenQuad(material);
	return {
		render(scene, camera, time, signalLoss, noise) {
			renderer.getDrawingBufferSize(size);
			const height = Math.max(1, Math.min(size.y, 480));
			const width = Math.max(1, Math.min(size.x, Math.round(height * size.x / size.y)));
			if (target.width !== width || target.height !== height) target.setSize(width, height);
			uniforms.pixels.value.set(width, height);
			uniforms.clock.value = time;
			uniforms.signalLoss.value = signalLoss;
			uniforms.noise.value = noise;
			renderer.setRenderTarget(target);
			try { renderer.render(scene, camera); }
			finally { renderer.setRenderTarget(null); }
			quad.render(renderer);
		},
		dispose() {
			target.dispose();
			material.dispose();
		},
	};
}
