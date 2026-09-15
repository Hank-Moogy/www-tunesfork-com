import { useEffect, useRef } from "react";

type GcSignalFieldProps = {
  onUnavailable: () => void;
};

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uScroll;
  uniform float uPixelRatio;
  uniform float uAspect;
  uniform vec2 uMouse;

  attribute vec3 aRandom;

  varying float vAlpha;
  varying float vEnergy;

  const float TAU = 6.28318530718;

  float ease(float edge0, float edge1, float value) {
    float x = clamp((value - edge0) / (edge1 - edge0), 0.0, 1.0);
    return x * x * (3.0 - 2.0 * x);
  }

  // Each particle starts its move at a slightly different moment, so a shape
  // sweeps into place instead of the whole cloud snapping at once.
  float easeStagger(float edge0, float edge1, float value, float offset) {
    float span = edge1 - edge0;
    float s = edge0 + offset * span * 0.55;
    float e = s + span * 0.45;
    float x = clamp((value - s) / max(e - s, 0.0001), 0.0, 1.0);
    return x * x * (3.0 - 2.0 * x);
  }

  // 1 at the midpoint of a transition, 0 at either end — drives turbulence.
  float bump(float edge0, float edge1, float value) {
    float x = clamp((value - edge0) / (edge1 - edge0), 0.0, 1.0);
    return 4.0 * x * (1.0 - x);
  }

  mat2 rotate2d(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat2(c, -s, s, c);
  }

  vec3 potential(vec3 p, float t) {
    return vec3(
      sin(p.y * 1.7 + t * 0.7) + cos(p.z * 1.3 - t * 0.5),
      sin(p.z * 1.5 - t * 0.6) + cos(p.x * 1.9 + t * 0.4),
      sin(p.x * 1.4 + t * 0.5) + cos(p.y * 1.6 - t * 0.7)
    );
  }

  // Curl of a potential field is divergence-free, so particles swirl and fold
  // like fluid instead of sliding along straight lines between two shapes.
  vec3 curlNoise(vec3 p, float t) {
    float e = 0.14;
    vec3 dx = vec3(e, 0.0, 0.0);
    vec3 dy = vec3(0.0, e, 0.0);
    vec3 dz = vec3(0.0, 0.0, e);
    vec3 px0 = potential(p - dx, t); vec3 px1 = potential(p + dx, t);
    vec3 py0 = potential(p - dy, t); vec3 py1 = potential(p + dy, t);
    vec3 pz0 = potential(p - dz, t); vec3 pz1 = potential(p + dz, t);
    return vec3(
      (py1.z - py0.z) - (pz1.y - pz0.y),
      (pz1.x - pz0.x) - (px1.z - px0.z),
      (px1.y - px0.y) - (py1.x - py0.x)
    ) / (2.0 * e);
  }

  void main() {
    float angle = position.x;
    float radialPosition = position.y;
    float seed = position.z;

    float aspectScale = max(1.0, uAspect * 0.72);
    float gridX = (angle / TAU - 0.5) * 2.0;
    float gridY = (radialPosition - 0.5) * 2.0;
    float stagger = fract(sin(seed * 91.37 + aRandom.x * 47.1) * 43758.5453);

    // 01 — hero: the accretion disc.
    float radius = 0.52 + pow(radialPosition, 0.68) * 1.82;
    float shear = uTime * (0.12 + (1.0 - radialPosition) * 0.74);
    float theta = angle + shear + (aRandom.x - 0.5) * 0.08;
    float ripple = sin(theta * 3.0 - uTime * 1.65 + radialPosition * 12.0) * 0.075;
    float halo = smoothstep(0.78, 1.0, aRandom.z);
    vec3 blackHole = vec3(
      cos(theta) * (radius + ripple) * aspectScale,
      sin(theta) * radius * 0.57 + (aRandom.y - 0.5) * (0.1 + halo * 1.25),
      sin(theta) * radius * 0.78 + cos(theta * 2.0 + uTime) * 0.12
    );
    blackHole.y += sign(aRandom.y - 0.5) * halo * pow(abs(aRandom.y - 0.5), 1.8) * 1.1;

    // 02 — auto save: an audio waveform running across the field.
    float env = 0.42 + 0.58 * cos(gridX * 1.28);
    float w =
      sin(gridX * 11.0 + uTime * 1.1) * 0.55 +
      sin(gridX * 27.0 - uTime * 0.7) * 0.24 +
      sin(gridX * 5.0 + uTime * 0.42) * 0.30;
    vec3 waveform = vec3(
      gridX * 3.85 * aspectScale,
      w * env * (0.3 + radialPosition * 1.4) * sign(aRandom.y - 0.5),
      (seed - 0.5) * 0.55
    );

    // 03 — collaborate: collaborators as nodes, with particles travelling the
    // edges between them.
    float nodeCount = 6.0;
    float nid = floor(aRandom.x * nodeCount);
    float na = (nid / nodeCount) * TAU + 0.42;
    vec3 node = vec3(cos(na) * 2.55 * aspectScale, sin(na) * 1.42, sin(na * 2.0) * 0.55);
    float nid2 = mod(nid + 1.0 + floor(aRandom.y * 2.0), nodeCount);
    float na2 = (nid2 / nodeCount) * TAU + 0.42;
    vec3 node2 = vec3(cos(na2) * 2.55 * aspectScale, sin(na2) * 1.42, sin(na2 * 2.0) * 0.55);
    float travel = fract(radialPosition + uTime * 0.09 + stagger);
    vec3 cluster = node + (aRandom - 0.5) * 0.62;
    // Edges are deliberately loose: crisp beams cut through the body copy.
    vec3 edge = mix(node, node2, travel) + (aRandom - 0.5) * 0.3;
    vec3 network = mix(cluster, edge, step(0.55, aRandom.z));

    // 04 — the agent: a smooth orb whose surface keeps flowing once settled,
    // so the shape stays alive rather than freezing after the morph.
    float phi = angle;
    float ct = radialPosition * 2.0 - 1.0;
    float st = sqrt(max(0.0, 1.0 - ct * ct));
    vec3 shell = vec3(st * cos(phi), ct, st * sin(phi));
    float breathe = 1.0 + sin(uTime * 0.5 + seed * 2.2) * 0.05;
    vec3 fork = shell * 1.66 * breathe;
    fork.x *= aspectScale * 0.95;
    fork += curlNoise(shell * 1.3 + vec3(0.0, uTime * 0.1, 0.0), uTime * 0.16) * 0.19;
    fork.xz = rotate2d(uTime * 0.07) * fork.xz;

    // 05 — close: everything settles onto a calm plane.
    vec3 calm = vec3(gridX * 3.25 * aspectScale, gridY * 1.95, sin(gridX * 4.0 + uTime * 0.5) * 0.2);

    float toWave = easeStagger(0.06, 0.21, uScroll, stagger);
    float toNet  = easeStagger(0.31, 0.46, uScroll, stagger);
    float toFork = easeStagger(0.56, 0.71, uScroll, stagger);
    float toCalm = easeStagger(0.81, 0.96, uScroll, stagger);

    vec3 transformed = blackHole;
    transformed = mix(transformed, waveform, toWave);
    transformed = mix(transformed, network, toNet);
    transformed = mix(transformed, fork, toFork);
    transformed = mix(transformed, calm, toCalm);

    float motion = max(
      max(bump(0.06, 0.21, uScroll), bump(0.31, 0.46, uScroll)),
      max(bump(0.56, 0.71, uScroll), bump(0.81, 0.96, uScroll))
    );
    vec3 swirl = curlNoise(transformed * 0.4 + seed * 2.5, uTime * 0.32);
    transformed += swirl * motion * (0.42 + aRandom.z * 0.85);

    vec2 cursor = uMouse * vec2(3.8 * aspectScale, 2.5);
    float cursorField = exp(-length(transformed.xy - cursor) * 1.25);
    transformed.z += cursorField * 0.58;
    transformed.xy += normalize(transformed.xy - cursor + 0.0001) * cursorField * 0.08;

    transformed.xz = rotate2d(-0.12 + uScroll * 0.28 + uMouse.x * 0.12) * transformed.xz;
    transformed.yz = rotate2d(-0.08 - uMouse.y * 0.12) * transformed.yz;
    transformed *= mix(1.0, 0.94, toCalm);

    vec4 viewPosition = modelViewMatrix * vec4(transformed, 1.0);
    float depthScale = clamp(460.0 / -viewPosition.z, 0.45, 2.4);
    float sparkle = 0.76 + sin(uTime * 1.8 + seed * 31.0) * 0.24;
    float hotParticle = smoothstep(0.92, 1.0, aRandom.x);
    float size = mix(0.82, 2.15, aRandom.z) * sparkle * depthScale * uPixelRatio;
    size *= 1.0 + hotParticle * 0.72;
    size *= 1.0 + motion * 0.7 + cursorField * 0.45;
    gl_PointSize = clamp(size, 0.8, 7.5 * uPixelRatio);
    gl_Position = projectionMatrix * viewPosition;

    vEnergy = clamp(0.42 + depthScale * 0.32 + cursorField * 0.35 + motion * 0.3, 0.0, 1.0);
    vAlpha = mix(0.16, 0.72, hotParticle) * mix(1.0, 0.52, halo) * (1.0 + motion * 0.45);
  }
`;

const fragmentShader = /* glsl */ `
  varying float vAlpha;
  varying float vEnergy;

  void main() {
    vec2 point = gl_PointCoord - 0.5;
    float distanceToCenter = length(point);
    float body = 1.0 - smoothstep(0.12, 0.5, distanceToCenter);
    float core = 1.0 - smoothstep(0.0, 0.16, distanceToCenter);
    float alpha = (body * 0.64 + core * 0.42) * vAlpha;
    if (alpha < 0.015) discard;
    vec3 white = mix(vec3(0.62), vec3(1.0, 1.0, 0.97), vEnergy);
    gl_FragColor = vec4(white, alpha);
  }
`;

const horizonVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const horizonFragmentShader = /* glsl */ `
  uniform float uHero;
  uniform float uTime;
  varying vec2 vUv;

  void main() {
    vec2 point = vUv - 0.5;
    point.y *= 2.15;
    float radius = length(point);
    float ring = smoothstep(0.31, 0.265, radius) * smoothstep(0.205, 0.245, radius);
    float lens = smoothstep(0.43, 0.22, radius) * 0.2;
    float pulse = 0.82 + sin(uTime * 0.8) * 0.18;
    float alpha = (ring * 0.46 + lens * 0.12) * uHero * pulse;
    gl_FragColor = vec4(vec3(0.92), alpha);
  }
`;

export default function GcSignalField({ onUnavailable }: GcSignalFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let teardown = () => {};

    const start = async () => {
      const THREE = await import("three");
      if (disposed) return;

      const renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: false,
        antialias: false,
        depth: true,
        powerPreference: "high-performance",
      });
      renderer.setClearColor(0x050505, 1);
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 40);
      camera.position.set(0, 0, 7.2);

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const finePointer = window.matchMedia("(pointer: fine)").matches;
      const cores = navigator.hardwareConcurrency || 4;
      const pointCount = window.innerWidth < 720
        ? (cores <= 4 ? 9000 : 14000)
        : window.innerWidth > 1900
          ? (cores <= 4 ? 21000 : 42000)
          : (cores <= 4 ? 18000 : 30000);

      const positions = new Float32Array(pointCount * 3);
      const randoms = new Float32Array(pointCount * 3);
      for (let index = 0; index < pointCount; index += 1) {
        const offset = index * 3;
        positions[offset] = Math.random() * Math.PI * 2;
        positions[offset + 1] = Math.random();
        positions[offset + 2] = Math.random();
        randoms[offset] = Math.random();
        randoms[offset + 1] = Math.random();
        randoms[offset + 2] = Math.random();
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("aRandom", new THREE.BufferAttribute(randoms, 3));

      const uniforms = {
        uTime: { value: 0 },
        uScroll: { value: 0 },
        uPixelRatio: { value: 1 },
        uAspect: { value: 1 },
        uMouse: { value: new THREE.Vector2() },
      };
      const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const points = new THREE.Points(geometry, material);
      points.frustumCulled = false;
      scene.add(points);

      const horizonUniforms = { uHero: { value: 1 }, uTime: { value: 0 } };
      const horizonMaterial = new THREE.ShaderMaterial({
        uniforms: horizonUniforms,
        vertexShader: horizonVertexShader,
        fragmentShader: horizonFragmentShader,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      });
      const horizon = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), horizonMaterial);
      horizon.position.z = -0.3;
      horizon.renderOrder = -1;
      scene.add(horizon);

      const coreMaterial = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
      const core = new THREE.Mesh(new THREE.CircleGeometry(0.64, 72), coreMaterial);
      core.position.z = 0.28;
      core.scale.y = 0.62;
      core.renderOrder = 10;
      scene.add(core);

      const mouseTarget = new THREE.Vector2();
      const mouse = new THREE.Vector2();
      let width = 0;
      let height = 0;
      let scrollTarget = 0;
      let scroll = 0;
      let time = 0;
      let previousTime = performance.now();
      let frame = 0;
      let visible = true;

      const resize = () => {
        width = window.innerWidth;
        height = window.innerHeight;
        const pixelRatio = Math.min(window.devicePixelRatio || 1, width < 720 ? 1.15 : 1.55);
        renderer.setPixelRatio(pixelRatio);
        renderer.setSize(width, height, false);
        camera.aspect = width / Math.max(height, 1);
        camera.updateProjectionMatrix();
        uniforms.uPixelRatio.value = pixelRatio;
        uniforms.uAspect.value = camera.aspect;
      };

      const readScroll = () => {
        const stops = Array.from(document.querySelectorAll<HTMLElement>("[data-field-stop]"));
        if (stops.length > 1) {
          const centre = window.scrollY + window.innerHeight / 2;
          const marks = stops.map((stop) => {
            const box = stop.getBoundingClientRect();
            return box.top + window.scrollY + stop.offsetHeight / 2;
          });
          const last = marks.length - 1;
          if (centre <= marks[0]) {
            scrollTarget = 0;
          } else if (centre >= marks[last]) {
            scrollTarget = 1;
          } else {
            let index = 0;
            while (index < last && centre > marks[index + 1]) index += 1;
            const span = marks[index + 1] - marks[index];
            const local = span > 0 ? (centre - marks[index]) / span : 0;
            scrollTarget = (index + local) / last;
          }
        } else {
          const available = document.documentElement.scrollHeight - window.innerHeight;
          scrollTarget = available > 0 ? window.scrollY / available : 0;
        }
      };

      const readPointer = (event: PointerEvent) => {
        if (!finePointer) return;
        mouseTarget.set(
          event.clientX / Math.max(width, 1) * 2 - 1,
          -(event.clientY / Math.max(height, 1) * 2 - 1),
        );
      };

      const render = (now: number) => {
        if (!visible || disposed) return;
        const delta = Math.min(34, now - previousTime) / 1000;
        previousTime = now;
        if (!reducedMotion) time += delta;
        scroll += (scrollTarget - scroll) * (reducedMotion ? 1 : 0.11);
        mouse.lerp(mouseTarget, 0.055);

        uniforms.uTime.value = time;
        uniforms.uScroll.value = scroll;
        uniforms.uMouse.value.copy(mouse);
        horizonUniforms.uTime.value = time;
        horizonUniforms.uHero.value = 1 - smoothstepNumber(0.12, 0.27, scroll);
        coreMaterial.opacity = horizonUniforms.uHero.value * 0.98;
        core.visible = coreMaterial.opacity > 0.01;
        horizon.visible = horizonUniforms.uHero.value > 0.01;
        camera.position.x += (mouse.x * 0.15 - camera.position.x) * 0.035;
        camera.position.y += (mouse.y * 0.1 - camera.position.y) * 0.035;
        camera.lookAt(0, 0, 0);

        renderer.render(scene, camera);
        frame = requestAnimationFrame(render);
      };

      const visibility = () => {
        visible = !document.hidden;
        if (visible) {
          previousTime = performance.now();
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(render);
        } else {
          cancelAnimationFrame(frame);
        }
      };

      resize();
      readScroll();
      window.addEventListener("resize", resize, { passive: true });
      window.addEventListener("scroll", readScroll, { passive: true });
      window.addEventListener("pointermove", readPointer, { passive: true });
      document.addEventListener("visibilitychange", visibility);
      frame = requestAnimationFrame(render);

      teardown = () => {
        cancelAnimationFrame(frame);
        window.removeEventListener("resize", resize);
        window.removeEventListener("scroll", readScroll);
        window.removeEventListener("pointermove", readPointer);
        document.removeEventListener("visibilitychange", visibility);
        geometry.dispose();
        material.dispose();
        horizon.geometry.dispose();
        horizonMaterial.dispose();
        core.geometry.dispose();
        coreMaterial.dispose();
        renderer.dispose();
      };
    };

    start().catch(() => {
      if (!disposed) onUnavailable();
    });

    return () => {
      disposed = true;
      teardown();
    };
  }, [onUnavailable]);

  return <canvas className="tf-signal-field" ref={canvasRef} aria-hidden="true" />;
}

function smoothstepNumber(min: number, max: number, value: number) {
  const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return x * x * (3 - 2 * x);
}
