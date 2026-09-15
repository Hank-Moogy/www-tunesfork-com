import { useEffect, useRef } from "react";

/**
 * The ambient orb from the landing page's "agent" chapter, on its own.
 *
 * GcSignalField morphs through five shapes as you scroll; shape 04 — the one
 * behind "Your AI agent that can perform actions in your projects" — is a
 * smooth, dense sphere whose surface keeps flowing after it settles. That is
 * the shape reproduced here, and the maths below is lifted verbatim from that
 * shader (shell, breathe, curl displacement, spin) so the two fields are the
 * same object rather than a lookalike.
 *
 * Why not import GcSignalField directly: it costs ~188 KB gzip of three.js and
 * reads its progress from [data-field-stop] elements spread down a long page.
 * On a single-viewport screen there is nothing to scroll. This talks to WebGL
 * directly — no dependency — which is also what makes the density affordable:
 * a canvas-2D version tops out near 1.4k sprites, where the landing field runs
 * 18k–42k points. Below that count the orb reads as sparse dust rather than a
 * body.
 *
 * Decorative and aria-hidden: if WebGL is unavailable it renders nothing.
 */

type TfParticleFieldProps = {
  /** Fraction of points tinted with the brand green. 0 disables it. */
  accentRatio?: number;
  className?: string;
};

const vertexShader = /* glsl */ `
  precision highp float;

  attribute vec3 aSeed;    // angle, radialPosition, seed
  attribute vec3 aRandom;
  attribute float aAccent;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uAspect;
  uniform float uCamZ;
  uniform vec2 uMouse;

  varying float vAlpha;
  varying float vEnergy;
  varying float vAccent;

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

  // Curl of a potential field is divergence-free, so the surface swirls and
  // folds like fluid instead of sliding along straight lines.
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
    float angle = aSeed.x;
    float radialPosition = aSeed.y;
    float seed = aSeed.z;

    float aspectScale = max(1.0, uAspect * 0.72);

    // --- shape 04, verbatim from GcSignalField -------------------------
    float phi = angle;
    float ct = radialPosition * 2.0 - 1.0;
    float st = sqrt(max(0.0, 1.0 - ct * ct));
    vec3 shell = vec3(st * cos(phi), ct, st * sin(phi));
    float breathe = 1.0 + sin(uTime * 0.5 + seed * 2.2) * 0.05;
    vec3 fork = shell * 1.66 * breathe;
    fork.x *= aspectScale * 0.95;
    fork += curlNoise(shell * 1.3 + vec3(0.0, uTime * 0.1, 0.0), uTime * 0.16) * 0.19;
    fork.xz = rotate2d(uTime * 0.07) * fork.xz;
    // -------------------------------------------------------------------

    vec2 cursor = uMouse * vec2(3.8 * aspectScale, 2.5);
    float cursorField = exp(-length(fork.xy - cursor) * 1.25);
    fork.z += cursorField * 0.58;
    fork.xy += normalize(fork.xy - cursor + 0.0001) * cursorField * 0.08;

    // Own camera rather than THREE's: orthographic-ish perspective with the
    // divide done by w. Depth test is off (additive), so z is unused.
    vec4 viewPosition = vec4(fork.x, fork.y, fork.z - uCamZ, 1.0);
    float f = 2.4;
    gl_Position = vec4(
      viewPosition.x * f / uAspect,
      viewPosition.y * f,
      0.0,
      -viewPosition.z
    );

    float depthScale = clamp(5.9 / -viewPosition.z, 0.45, 2.4);
    float sparkle = 0.76 + sin(uTime * 1.8 + seed * 31.0) * 0.24;
    float hotParticle = smoothstep(0.92, 1.0, aRandom.x);
    // The landing field spreads its points across a whole viewport, where
    // ~1px dust reads as atmosphere. In a panel that disappears, so points
    // are scaled up to carry the same shape at a fraction of the area.
    float size = mix(0.82, 2.15, aRandom.z) * sparkle * depthScale * uPixelRatio * 2.3;
    size *= 1.0 + hotParticle * 0.72;
    size *= 1.0 + cursorField * 0.45;
    gl_PointSize = clamp(size, 1.4, 14.0 * uPixelRatio);

    vEnergy = clamp(0.42 + depthScale * 0.32 + cursorField * 0.35, 0.0, 1.0);
    vAlpha = mix(0.24, 0.80, hotParticle);
    vAccent = aAccent;
  }
`;

const fragmentShader = /* glsl */ `
  precision mediump float;

  varying float vAlpha;
  varying float vEnergy;
  varying float vAccent;

  void main() {
    vec2 point = gl_PointCoord - 0.5;
    float distanceToCenter = length(point);
    float body = 1.0 - smoothstep(0.12, 0.5, distanceToCenter);
    float core = 1.0 - smoothstep(0.0, 0.16, distanceToCenter);
    float alpha = (body * 0.64 + core * 0.42) * vAlpha;
    if (alpha < 0.015) discard;
    vec3 white = mix(vec3(0.62), vec3(1.0, 1.0, 0.97), vEnergy);
    vec3 tint = mix(white, white * vec3(0.27, 1.0, 0.45), vAccent);
    gl_FragColor = vec4(tint, alpha);
  }
`;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn("[TfParticleField]", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export default function TfParticleField({
  accentRatio = 0.05,
  className,
}: TfParticleFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = (canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      premultipliedAlpha: false,
    } as WebGLContextAttributes) ||
      canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const vs = compile(gl, gl.VERTEX_SHADER, vertexShader);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fragmentShader);
    if (!vs || !fs) return;
    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn("[TfParticleField]", gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);

    // Matches GcSignalField's budget, scaled down for a panel rather than a
    // full viewport. Below ~10k the orb reads as dust, not a surface.
    const cores = navigator.hardwareConcurrency || 4;
    const wide = window.innerWidth > 1900;
    const pointCount = cores <= 4
      ? (wide ? 34000 : 26000)
      : (wide ? 72000 : 58000);

    const seeds = new Float32Array(pointCount * 3);
    const randoms = new Float32Array(pointCount * 3);
    const accents = new Float32Array(pointCount);
    for (let i = 0; i < pointCount; i += 1) {
      const o = i * 3;
      seeds[o] = Math.random() * Math.PI * 2;
      seeds[o + 1] = Math.random();
      seeds[o + 2] = Math.random();
      randoms[o] = Math.random();
      randoms[o + 1] = Math.random();
      randoms[o + 2] = Math.random();
      accents[i] = Math.random() < accentRatio ? 1 : 0;
    }

    const bind = (data: Float32Array, name: string, size: number) => {
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      const location = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
      return buffer;
    };
    const buffers = [
      bind(seeds, "aSeed", 3),
      bind(randoms, "aRandom", 3),
      bind(accents, "aAccent", 1),
    ];

    const u = {
      time: gl.getUniformLocation(program, "uTime"),
      pixelRatio: gl.getUniformLocation(program, "uPixelRatio"),
      aspect: gl.getUniformLocation(program, "uAspect"),
      camZ: gl.getUniformLocation(program, "uCamZ"),
      mouse: gl.getUniformLocation(program, "uMouse"),
    };

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // additive, so overlaps build light

    let dpr = 1;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform1f(u.pixelRatio, dpr);
      gl.uniform1f(u.aspect, rect.width / rect.height);
      // Pull the camera back on a narrow panel so the orb still fits.
      gl.uniform1f(u.camZ, rect.width / rect.height < 0.8 ? 7.6 : 6.6);
    };

    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.tx = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      mouse.ty = -((event.clientY - rect.top) / rect.height - 0.5) * 2;
    };

    let frame = 0;
    let running = true;
    const start = performance.now();

    const render = (now: number) => {
      const time = reduceMotion ? 6 : (now - start) / 1000;
      // Ease toward the pointer so the cloud drifts rather than snaps.
      mouse.x += (mouse.tx - mouse.x) * 0.045;
      mouse.y += (mouse.ty - mouse.y) * 0.045;

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(u.time, time);
      gl.uniform2f(u.mouse, mouse.x, mouse.y);
      gl.drawArrays(gl.POINTS, 0, pointCount);

      if (running && !reduceMotion) frame = requestAnimationFrame(render);
    };

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(frame);
      } else if (!running) {
        running = true;
        if (!reduceMotion) frame = requestAnimationFrame(render);
      }
    };

    const onContextLost = (event: Event) => {
      event.preventDefault();
      running = false;
      cancelAnimationFrame(frame);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    frame = requestAnimationFrame(render);

    window.addEventListener("pointermove", onPointerMove);
    document.addEventListener("visibilitychange", onVisibility);
    canvas.addEventListener("webglcontextlost", onContextLost);

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      buffers.forEach((b) => gl.deleteBuffer(b));
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [accentRatio]);

  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
}
