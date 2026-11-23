import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

const waterShader = {
	name: 'Open water',
	uniforms: {
		color: { value: null }, textureMatrix: { value: null }, tDiffuse: { value: null },
		clock: { value: 0 }, sky: { value: null }, wavelets: { value: null }, skyTurn: { value: 0 }, sunlight: { value: new THREE.Vector3() },
		shoreline: { value: 0 }, useMirror: { value: 0 },
	},
	vertexShader: `
		attribute float waterDepth;
		uniform mat4 textureMatrix;
		varying float depth;
		varying vec3 world;
		varying vec4 mirror;
		void main() {
			depth = waterDepth;
			vec4 point = vec4(position, 1.);
			mirror = textureMatrix * point;
			world = (modelMatrix * point).xyz;
			gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.);
		}`,
	fragmentShader: `
		uniform sampler2D sky, tDiffuse, wavelets;
		uniform float clock, skyTurn, shoreline, useMirror;
		uniform vec3 sunlight;
		varying float depth;
		varying vec3 world;
		varying vec4 mirror;
		void main() {
			vec2 p = world.xz;
			vec3 view = normalize(cameraPosition - world);
			float range = distance(world, cameraPosition);
			float calm = (.42 + .58 * shoreline) * (1. - smoothstep(32.,180.,range));
			float swell = sin(dot(p, vec2(.78,.42)) + clock * 1.15 + sin(p.y*.24)*1.3);
			float chop = sin(dot(p, vec2(1.36,-2.07)) - clock * 1.67 + 1.3*swell);
			float fine = sin(dot(p, vec2(5.32,.93)) + clock * 2.8 + sin(p.x*.83) + chop);
			float micro = (1.-smoothstep(16.,74.,range)) * fine;
			vec2 ripples = texture2D(wavelets,p*.13+clock*vec2(.009,-.012)).rg
				+ texture2D(wavelets,p.yx*.29+clock*vec2(-.019,.01)).gr - 1.;
			vec3 n = normalize(vec3((.045*swell+.038*chop+.018*micro+.22*ripples.x)*calm, 1., (.054*chop-.028*swell+.025*micro+.22*ripples.y)*calm));
			float grazing = 1.-clamp(dot(n,view),0.,1.);
			float fresnel = .045+.91*pow(grazing,4.);
			vec3 ray = reflect(-view,n);
			vec2 skyUv = vec2(.5+(atan(ray.z,ray.x)+skyTurn)/6.2831853,.5+asin(clamp(ray.y,0.,1.))/3.14159);
			vec3 reflection = textureLod(sky,vec2(fract(skyUv.x),skyUv.y),2.).rgb;
			if(useMirror>.5 && mirror.w>0.) {
				vec2 uv = mirror.xy/mirror.w + n.xz*(.026+.019*grazing);
				vec2 edges = min(uv,1.-uv);
				float inside = smoothstep(0.,.03,min(edges.x,edges.y));
				reflection = mix(reflection,texture2D(tDiffuse,clamp(uv,0.,1.)).rgb,inside);
			}
			float silt = .5+.5*sin(p.x*.38 + sin(p.y*.24)*2.)*cos(p.y*.47);
			vec3 shallow = mix(vec3(.10,.29,.21),vec3(.21,.40,.30),silt);
			vec3 body = mix(shallow,vec3(.013,.105,.126),1.-exp(-max(depth,0.)*.91));
			vec3 col = mix(body,reflection,fresnel);
			float glint = pow(max(dot(ray,sunlight),0.),195.);
			col += vec3(1.,.87,.64)*glint*calm;
			float coast = p.x - (13.+6.*cos(p.y*.044)-6.*sin(p.y*.069));
			float swash = coast-.55-.48*sin(p.y*.31+clock*1.2)-.28*chop;
			float lace = abs(sin(p.x*3.7+chop*2.3)+sin(p.y*2.1-swell*2.8+clock*.7));
			float crest = smoothstep(.77,1.,sin(swash*1.35+clock*1.17+.43*swell));
			float foam = shoreline*(.56*exp(-abs(swash)*2.8) + .57*crest*(1.-smoothstep(.8,8.,coast))*(1.-smoothstep(.12,.64,lace)));
			col = mix(col,vec3(.78,.84,.81),foam);
			col = mix(col,reflection*.83,smoothstep(120.,390.,range)*shoreline*.75);
			float opacity = clamp(.14+.82*(1.-exp(-max(depth,0.)*.92))+.64*fresnel+foam,0.,1.);
			gl_FragColor = vec4(col,opacity);
			#include <tonemapping_fragment>
			#include <colorspace_fragment>
		}`,
};

export function add_Water(scene, sun, geometry, center, groundAt, ocean) {
	const p = geometry.attributes.position;
	const depths = Float32Array.from({ length: p.count }, (_, i) =>
		center.y - groundAt(center.x + p.getX(i), center.z - p.getY(i)));
	geometry.setAttribute('waterDepth', new THREE.BufferAttribute(depths, 1));
	const water = new Reflector(geometry, { textureWidth: 512, textureHeight: 384, multisample: 0, shader: waterShader });
	water.position.copy(center);
	water.rotation.x = -Math.PI / 2;
	water.name = ocean ? 'Tidal water' : 'Glacial tarn';
	const { material } = water;
	material.transparent = true;
	material.depthWrite = false;
	const uniforms = material.uniforms;
	const wavelets = new THREE.TextureLoader().load(new URL('./assets/ripple-normal.webp', import.meta.url).href);
	wavelets.wrapS = wavelets.wrapT = THREE.RepeatWrapping;
	uniforms.wavelets.value = wavelets;
	uniforms.sky.value = scene.background;
	uniforms.skyTurn.value = scene.backgroundRotation.y;
	uniforms.shoreline.value = Number(ocean);
	uniforms.sunlight.value.copy(sun.position).sub(sun.target.position).normalize();
	const renderReflection = water.onBeforeRender;
	const coarse = matchMedia('(pointer: coarse)').matches;
	let nextReflection = 0, lastCamera;
	// На телефоне вода отражает панораму. На ПК обновляем отражения берегов отдельным редким проходом.
	water.onBeforeRender = (renderer, scene, camera) => {
		const enabled = !coarse && camera.isPerspectiveCamera && renderer.extensions.has('EXT_color_buffer_float');
		uniforms.useMirror.value = Number(enabled);
		const now = performance.now();
		if (enabled && (now >= nextReflection || camera !== lastCamera)) {
			renderReflection.call(water, renderer, scene, camera);
			nextReflection = now + 110;
			lastCamera = camera;
		}
	};
	material.addEventListener('dispose', () => {
		wavelets.dispose();
		water.getRenderTarget().dispose();
	});
	scene.add(water);
	return uniforms.clock;
}
