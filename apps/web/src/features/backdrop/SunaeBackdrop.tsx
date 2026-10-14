import { useEffect, useRef, useState } from 'react';
import {
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  WebGLRenderer,
  type Texture,
} from 'three';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';

/**
 * Photo backdrop with an afterimage trail. Loaded lazily so three.js stays out of
 * the first-screen bundle. It renders continuously only while the wheel spins and
 * for a short settle afterwards; otherwise it draws a single still frame.
 */
export type BackdropMode = 'idle' | 'spinning' | 'settled';

interface SunaeBackdropProps {
  src: string;
  mode: BackdropMode;
  reduceMotion: boolean;
}

const SETTLE_MS = 1500;
const MAX_PIXEL_RATIO = 1.5;

/** Per-mode targets: how long trails linger (damp) and how hard the photo sways. */
const TARGETS: Record<BackdropMode, { damp: number; sway: number; zoom: number }> = {
  idle: { damp: 0, sway: 0, zoom: 1.08 },
  spinning: { damp: 0.94, sway: 1, zoom: 1.16 },
  settled: { damp: 0.82, sway: 0, zoom: 1.08 },
};

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Cover-fit the photo, then offset and zoom it. Zoom stays above 1 so offsets never sample past the edge.
const fragmentShader = /* glsl */ `
  uniform sampler2D uTexture;
  uniform float uImageAspect;
  uniform float uViewAspect;
  uniform float uZoom;
  uniform vec2 uOffset;
  varying vec2 vUv;
  void main() {
    vec2 uv = vUv - 0.5;
    if (uViewAspect > uImageAspect) {
      uv.y *= uImageAspect / uViewAspect;
    } else {
      uv.x *= uViewAspect / uImageAspect;
    }
    uv = uv / uZoom + 0.5 + uOffset;
    gl_FragColor = texture2D(uTexture, uv);
  }
`;

export default function SunaeBackdrop({ src, mode, reduceMotion }: SunaeBackdropProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef(mode);
  const wakeRef = useRef<() => void>(() => {});
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    modeRef.current = mode;
    wakeRef.current();
  }, [mode]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let frame = 0;
    let texture: Texture | null = null;

    const renderer = new WebGLRenderer({ antialias: false, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    renderer.domElement.className = 'block h-full w-full';
    container.appendChild(renderer.domElement);

    const scene = new Scene();
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTexture: { value: null },
        uImageAspect: { value: 4 / 3 },
        uViewAspect: { value: 1 },
        uZoom: { value: TARGETS.idle.zoom },
        uOffset: { value: new Vector2(0, 0) },
      },
    });
    const geometry = new PlaneGeometry(2, 2);
    scene.add(new Mesh(geometry, material));

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const afterimage = new AfterimagePass(0);
    composer.addPass(afterimage);
    composer.addPass(new OutputPass());

    const damp = afterimage.uniforms['damp']!;
    const uniforms = material.uniforms as {
      uZoom: { value: number };
      uOffset: { value: Vector2 };
      uViewAspect: { value: number };
      uImageAspect: { value: number };
      uTexture: { value: Texture | null };
    };

    let time = 0;
    let last = 0;
    let settledAt: number | null = null;

    const renderOnce = () => {
      if (texture) composer.render();
    };

    const tick = (now: number) => {
      frame = 0;
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
      last = now;
      time += dt;

      const current = modeRef.current;
      const target = TARGETS[current];
      const ease = 1 - Math.exp(-dt * 6);
      damp.value += (target.damp - damp.value) * ease;
      uniforms.uZoom.value += (target.zoom + target.sway * 0.03 * Math.sin(time * 9) - uniforms.uZoom.value) * ease;
      const sway = target.sway * 0.045;
      uniforms.uOffset.value.x += (sway * Math.sin(time * 7) - uniforms.uOffset.value.x) * ease;
      uniforms.uOffset.value.y += (sway * 0.35 * Math.cos(time * 5) - uniforms.uOffset.value.y) * ease;
      renderOnce();

      if (current === 'spinning') settledAt = null;
      else settledAt ??= now;
      const keepGoing = current === 'spinning' || (settledAt !== null && now - settledAt < SETTLE_MS);
      if (keepGoing && !disposed) frame = requestAnimationFrame(tick);
      else last = 0;
    };

    wakeRef.current = () => {
      if (disposed || reduceMotion || frame || !texture) return;
      settledAt = null;
      frame = requestAnimationFrame(tick);
    };

    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      renderer.setSize(width, height, false);
      composer.setSize(width, height);
      uniforms.uViewAspect.value = width / height;
      renderOnce();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    new TextureLoader()
      .loadAsync(src)
      .then((loaded) => {
        if (disposed) {
          loaded.dispose();
          return;
        }
        loaded.colorSpace = SRGBColorSpace;
        texture = loaded;
        const image = loaded.image as { width: number; height: number };
        uniforms.uTexture.value = loaded;
        uniforms.uImageAspect.value = image.width / image.height;
        resize();
        setStatus('ready');
        wakeRef.current();
      })
      .catch(() => {
        if (!disposed) setStatus('failed');
      });

    return () => {
      disposed = true;
      wakeRef.current = () => {};
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      composer.dispose();
      afterimage.dispose();
      geometry.dispose();
      material.dispose();
      texture?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [src, reduceMotion]);

  if (status === 'failed') return null;
  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={`h-full w-full transition-opacity duration-700 ease-soft ${status === 'ready' ? 'opacity-100' : 'opacity-0'}`}
    />
  );
}
