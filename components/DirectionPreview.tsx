"use client";

import { useEffect, useRef, useState } from "react";
import type * as THREE from "three";
import type { ImageEditSettings } from "../lib/image-edit";
import { directionFaceWeights } from "../lib/direction-face-poses";
import { createDirectionLightFixture } from "./direction-light-fixture";

type VisualSettings = Extract<ImageEditSettings, { kind: "light" | "cinematic" | "angle" | "emotion" }>;
type GuideView = "front" | "top" | "perspective" | "shot" | "lit";
type SceneState = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  orthographic: THREE.OrthographicCamera;
  head: THREE.Group;
  eyes: THREE.Mesh[];
  eyeWhites: THREE.Mesh[];
  eyebrows: THREE.Mesh[];
  mouth: THREE.Mesh;
  light: THREE.DirectionalLight;
  rim: THREE.DirectionalLight;
  sphere: typeof THREE;
  rig?: THREE.Group;
  rigMeshes: THREE.Mesh[];
  rigEyes: { mesh: THREE.Mesh; x: number; y: number }[];
  photo?: THREE.Group;
  handle?: THREE.Mesh;
  guideRay?: THREE.Line;
  fixture?: ReturnType<typeof createDirectionLightFixture>;
  aim: THREE.Vector3;
  dispose: () => void;
};

function applySettings(scene: SceneState, settings: VisualSettings, view: GuideView = "front") {
  const { sphere: T, camera, light, rim, head, eyes, eyeWhites, eyebrows, mouth } = scene;
  const spatial = settings.kind !== "emotion";
  const isLighting = settings.kind === "light" || settings.kind === "cinematic";
  const shot = settings.kind === "angle" && view === "shot";
  const litView = (settings.kind === "light" || settings.kind === "cinematic") && view === "lit";
  const showFace = !spatial || shot || litView;
  if (scene.rig) scene.rig.visible = showFace;
  head.visible = !scene.rig && showFace;
  if (scene.photo) scene.photo.visible = !showFace;
  scene.renderer.setClearColor(isLighting && !showFace ? "#2a3038" : "#e7ebef");
  if (scene.handle) {
    scene.handle.visible = spatial && !isLighting;
    if (scene.guideRay) scene.guideRay.visible = !isLighting;
    if (spatial) {
      const theta = T.MathUtils.degToRad(settings.azimuth);
      const phi = T.MathUtils.degToRad(settings.elevation);
      scene.handle.position.set(Math.sin(theta) * Math.cos(phi) * 1.45, Math.sin(phi) * 1.45, Math.cos(theta) * Math.cos(phi) * 1.45);
      const ray = scene.guideRay?.geometry.getAttribute("position");
      if (ray) {
        ray.setXYZ(1, scene.handle.position.x, scene.handle.position.y, scene.handle.position.z);
        ray.needsUpdate = true;
      }
      if (isLighting) scene.fixture?.update(scene.handle.position, scene.aim, settings.color, settings.brightness, settings.rim);
    }
  }
  const useOrtho = spatial && !shot && (view === "front" || view === "top");
  const observer = useOrtho ? scene.orthographic : camera;
  if (useOrtho) {
    const frame = (isLighting ? 1.8 : 1.66) * Math.max(1, 1 / camera.aspect);
    scene.orthographic.left = -frame * camera.aspect;
    scene.orthographic.right = frame * camera.aspect;
    scene.orthographic.top = frame;
    scene.orthographic.bottom = -frame;
    if (view === "top") observer.position.set(0, 4, 0.01);
    else observer.position.set(0, 0, 4);
  } else if (shot) {
    const pitch = T.MathUtils.degToRad(settings.elevation);
    const yaw = T.MathUtils.degToRad(settings.azimuth);
    observer.position.set(
      Math.sin(yaw) * Math.cos(pitch) * settings.distance,
      Math.sin(pitch) * settings.distance,
      Math.cos(yaw) * Math.cos(pitch) * settings.distance,
    );
    camera.fov = settings.fov;
  } else {
    if (!showFace) camera.position.set(3.1, 2.3, 4.5);
    else camera.position.set(0, 0.15, 3.6);
    camera.fov = showFace ? 35 : 43;
  }
  const target = shot ? settings.target : undefined;
  observer.lookAt(target?.x ?? 0, (shot ? 0.35 : 0) + (target?.y ?? 0), target?.z ?? 0);
  if (shot && settings.roll) camera.rotateZ(T.MathUtils.degToRad(settings.roll));
  observer.updateProjectionMatrix();

  if (settings.kind === "light" || settings.kind === "cinematic") {
    const phi = T.MathUtils.degToRad(settings.elevation);
    const theta = T.MathUtils.degToRad(settings.azimuth);
    light.position.set(Math.sin(theta) * Math.cos(phi) * 4, Math.sin(phi) * 4, Math.cos(theta) * Math.cos(phi) * 4);
    light.color.set(settings.color);
    if (settings.kind === "cinematic") {
      const coolness = Math.max(0, Math.min(1, (settings.temperature - 2000) / 8000));
      light.color.multiply(new T.Color().setRGB(1 - coolness * 0.2, 0.7 + coolness * 0.25, 0.55 + coolness * 0.45));
      scene.renderer.toneMapping = T.ACESFilmicToneMapping;
      scene.renderer.toneMappingExposure = 0.65 + settings.contrast / 100;
    } else {
      scene.renderer.toneMapping = T.NoToneMapping;
      scene.renderer.toneMappingExposure = 1;
    }
    light.intensity = settings.brightness / 35;
    rim.intensity = settings.rim ? 1.6 : 0;
  } else {
    light.position.set(3, 4, 5);
    light.color.set("#ffffff");
    light.intensity = 1.4;
    rim.intensity = 0;
    scene.renderer.toneMapping = T.NoToneMapping;
    scene.renderer.toneMappingExposure = 1;
  }

  const expression = settings.kind === "emotion" ? settings : null;
  const warmth = expression ? expression.warmth * expression.intensity : 0;
  const arousal = expression ? expression.arousal * expression.intensity : 0;
  const channels = expression?.channels;
  const strength = expression?.intensity ?? 0;
  const weights: Partial<Record<string, number>> = expression ? directionFaceWeights(expression) : {};
  eyes.forEach((eye, index) => {
    const lid = index === 0 ? channels?.eyelidLeft ?? 0 : channels?.eyelidRight ?? 0;
    const height = Math.max(0.12, 1 + arousal * 0.5 + lid * strength * 0.75);
    eye.scale.y = height;
    eye.position.x = (index === 0 ? -0.27 : 0.27) + (channels?.gazeX ?? 0) * strength * 0.055;
    eye.position.y = 0.59 + (channels?.gazeY ?? 0) * strength * 0.04;
    eyeWhites[index].scale.y = 0.7 * height;
  });
  eyebrows.forEach((brow, index) => {
    const raised = index === 0 ? channels?.browLeft ?? 0 : channels?.browRight ?? 0;
    brow.position.y = 0.91 + arousal * 0.15 + raised * strength * 0.12;
    brow.rotation.z = Math.PI / 2 + (index === 0 ? -1 : 1) * (0.1 + warmth * 0.22 - arousal * 0.18);
  });
  mouth.scale.y = Math.max(0.1, 0.35 + (weights.mouth ?? 0) * 1.5);
  mouth.rotation.z = 0;
  mouth.position.y = 0.08 + Math.abs(warmth) * 0.02;
  head.rotation.z = warmth * 0.09;
  scene.rigEyes.forEach(({ mesh, x, y }) => {
    mesh.position.x = x + (channels?.gazeX ?? 0) * strength * 0.01;
    mesh.position.y = y + (channels?.gazeY ?? 0) * strength * 0.01;
  });
  scene.rigMeshes.forEach((mesh) => {
    if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;
    for (const [name, index] of Object.entries(mesh.morphTargetDictionary)) {
      mesh.morphTargetInfluences[index] = weights[name] ?? 0;
    }
  });
  scene.renderer.render(scene.scene, observer);
}

export default function DirectionPreview({ settings, playing = false, lightView = "front", sourceUrl, onDirectionChange }: {
  settings: VisualSettings;
  playing?: boolean;
  lightView?: GuideView;
  sourceUrl?: string;
  onDirectionChange?: (azimuth: number, elevation: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const state = useRef<SceneState | null>(null);
  const latest = useRef(settings);
  const latestView = useRef(lightView);
  const [unavailable, setUnavailable] = useState(false);
  const pointer = useRef<{ x: number; y: number; azimuth: number; elevation: number } | null>(null);
  function move(event: React.PointerEvent<HTMLDivElement>) {
    const start = pointer.current;
    if (!start || !onDirectionChange) return;
    event.stopPropagation();
    const azimuth = Math.round(start.azimuth + (event.clientX - start.x) * 1.2);
    onDirectionChange(
      (((azimuth + 180) % 360 + 360) % 360) - 180,
      Math.max(-90, Math.min(90, Math.round(start.elevation - (event.clientY - start.y) * 0.7))),
    );
  }

  useEffect(() => {
    latest.current = settings;
    latestView.current = lightView;
    if (state.current) applySettings(state.current, settings, lightView);
  }, [settings, lightView]);

  useEffect(() => {
    if (!playing || settings.kind !== "emotion") return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) return;
    let frame = 0;
    let previous = 0;
    const started = performance.now();
    function animate(now: number) {
      if (reducedMotion.matches) return;
      if (now - previous >= 33 && state.current && latest.current.kind === "emotion") {
        const progress = (1 - Math.cos((now - started) / 600)) / 2;
        applySettings(state.current, { ...latest.current, intensity: latest.current.intensity * progress }, latestView.current);
        previous = now;
      }
      frame = requestAnimationFrame(animate);
    }
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      if (state.current) applySettings(state.current, latest.current, latestView.current);
    };
  }, [playing, settings.kind]);

  useEffect(() => {
    let cancelled = false;
    const mount = host.current;
    if (!mount) return;

    void import("three").then((T) => {
      if (cancelled) return;
      mount.dataset.rig = "loading";
      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
      } catch {
        setUnavailable(true);
        return;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setSize(320, 220, false);
      renderer.setClearColor("#e9ebed");
      renderer.shadowMap.enabled = true;
      mount.appendChild(renderer.domElement);
      const scene = new T.Scene();
      const camera = new T.PerspectiveCamera(45, 320 / 220, 0.1, 50);
      const orthographic = new T.OrthographicCamera(-2, 2, 2, -2, 0.1, 50);
      const geometries: THREE.BufferGeometry[] = [];
      const materials: THREE.Material[] = [];
      const material = (color: string, roughness = 0.75) => {
        const value = new T.MeshStandardMaterial({ color, roughness });
        materials.push(value);
        return value;
      };
      const clay = material("#c4c8cb");
      const dark = material("#32373c");
      const white = material("#f2f2f0");
      const head = new T.Group();
      scene.add(head);
      function mesh(geometry: THREE.BufferGeometry, surface: THREE.Material, position: [number, number, number], scale: [number, number, number] = [1, 1, 1]) {
        geometries.push(geometry);
        const object = new T.Mesh(geometry, surface);
        object.position.set(...position);
        object.scale.set(...scale);
        object.castShadow = true;
        object.receiveShadow = true;
        head.add(object);
        return object;
      }
      mesh(new T.SphereGeometry(0.78, 32, 24), clay, [0, 0.45, 0], [0.8, 1.07, 0.75]);
      mesh(new T.SphereGeometry(0.15, 20, 16), clay, [-0.64, 0.4, 0], [0.65, 1.2, 0.65]);
      mesh(new T.SphereGeometry(0.15, 20, 16), clay, [0.64, 0.4, 0], [0.65, 1.2, 0.65]);
      mesh(new T.CylinderGeometry(0.29, 0.36, 0.62, 24), clay, [0, -0.48, 0]);
      mesh(new T.SphereGeometry(0.8, 32, 20), clay, [0, -0.98, 0], [1.25, 0.5, 0.55]);
      mesh(new T.SphereGeometry(0.16, 16, 12), clay, [0, 0.35, 0.57], [0.65, 1.05, 0.8]);
      const eyeWhites: THREE.Mesh[] = [];
      const eyes = [-1, 1].map((side) => {
        eyeWhites.push(mesh(new T.SphereGeometry(0.12, 20, 12), white, [side * 0.27, 0.59, 0.53], [1.3, 0.7, 0.45]));
        return mesh(new T.SphereGeometry(0.055, 16, 12), dark, [side * 0.27, 0.59, 0.59], [1, 1, 0.45]);
      });
      const eyebrows = [-1, 1].map((side) => mesh(new T.CapsuleGeometry(0.028, 0.23, 5, 8), dark, [side * 0.27, 0.91, 0.5], [1, 1, 1]));
      eyebrows.forEach((brow) => { brow.rotation.z = Math.PI / 2; });
      const mouth = mesh(new T.SphereGeometry(0.10, 20, 12), dark, [0, 0.08, 0.56], [1.65, 0.35, 0.3]);
      scene.add(new T.HemisphereLight("#ffffff", "#69727b", 0.7));
      const light = new T.DirectionalLight("#ffffff", 1.4);
      light.castShadow = true;
      light.shadow.mapSize.set(512, 512);
      scene.add(light);
      const rim = new T.DirectionalLight("#ffffff", 0);
      rim.position.set(-2, 3, -4);
      scene.add(rim);

      const photo = new T.Group();
      const ringMaterial = new T.LineBasicMaterial({ color: "#8492a3", transparent: true, opacity: 0.55 });
      materials.push(ringMaterial);
      for (const rotation of [0, Math.PI / 3, -Math.PI / 3]) {
        const points = Array.from({ length: 65 }, (_, i) => {
          const a = i * Math.PI * 2 / 64;
          return new T.Vector3(Math.cos(a) * 1.45, Math.sin(a) * 1.45, 0);
        });
        const geometry = new T.BufferGeometry().setFromPoints(points);
        geometries.push(geometry);
        const line = new T.Line(geometry, ringMaterial);
        line.rotation.y = rotation;
        photo.add(line);
      }
      const handleGeometry = new T.SphereGeometry(0.08, 16, 12);
      geometries.push(handleGeometry);
      const handle = new T.Mesh(handleGeometry, material("#bd3d00"));
      photo.add(handle);
      const rayGeometry = new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3(0, 0, 1.45)]);
      const rayMaterial = new T.LineBasicMaterial({ color: "#bd3d00", transparent: true, opacity: 0.75 });
      geometries.push(rayGeometry);
      materials.push(rayMaterial);
      const guideRay = new T.Line(rayGeometry, rayMaterial);
      guideRay.frustumCulled = false;
      photo.add(guideRay);
      const fixture = latest.current.kind === "light" || latest.current.kind === "cinematic"
        ? createDirectionLightFixture(T) : undefined;
      if (fixture) photo.add(fixture.object);
      scene.add(photo);
      const value: SceneState = {
        renderer, scene, camera, orthographic, head, eyes, eyeWhites, eyebrows, mouth, light, rim, sphere: T, photo, handle, guideRay, fixture,
        aim: new T.Vector3(), rigMeshes: [], rigEyes: [],
        dispose: () => {
          observer.disconnect();
          fixture?.dispose();
          geometries.forEach((geometry) => geometry.dispose());
          materials.forEach((surface) => surface.dispose());
          renderer.dispose();
          renderer.forceContextLoss();
          renderer.domElement.remove();
        },
      };
      state.current = value;
      if (sourceUrl) {
        new T.TextureLoader().load(sourceUrl, (texture) => {
          if (cancelled) { texture.dispose(); return; }
          texture.colorSpace = T.SRGBColorSpace;
          const image = texture.image as HTMLImageElement;
          const aspect = image.width / image.height;
          const geometry = new T.PlaneGeometry(Math.min(1.52, 1.52 * aspect), Math.min(1.52, 1.52 / aspect));
          const surface = new T.MeshBasicMaterial({ map: texture, side: T.DoubleSide });
          geometries.push(geometry);
          materials.push(surface);
          const plane = new T.Mesh(geometry, surface);
          plane.position.z = 0;
          photo.add(plane);
          const previousDispose = value.dispose;
          value.dispose = () => { texture.dispose(); previousDispose(); };
          applySettings(value, latest.current, latestView.current);
        });
      }
      void import("three/examples/jsm/loaders/GLTFLoader.js").then(({ GLTFLoader }) => {
        new GLTFLoader().load("/rigs/direction-face.glb?v=4", (gltf) => {
          if (cancelled) return;
          const rig = gltf.scene;
          const box = new T.Box3().setFromObject(rig);
          const size = box.getSize(new T.Vector3());
          const center = box.getCenter(new T.Vector3());
          const scale = 2 / Math.max(size.x, size.y, size.z);
          rig.scale.setScalar(scale);
          rig.position.set(-center.x * scale, -center.y * scale + 0.1, -center.z * scale);
          rig.traverse((object) => {
            if (object instanceof T.Mesh) {
              object.castShadow = true;
              value.rigMeshes.push(object);
              if (/iris|pupil/i.test(object.name)) value.rigEyes.push({ mesh: object, x: object.position.x, y: object.position.y });
              geometries.push(object.geometry);
              for (const m of Array.isArray(object.material) ? object.material : [object.material]) materials.push(m);
            }
          });
          value.rig = rig;
          mount.dataset.rig = "blender";
          scene.add(rig);
          applySettings(value, latest.current, latestView.current);
        }, undefined, () => { if (!cancelled) mount.dataset.rig = "fallback"; });
      });
      const observer = new ResizeObserver(([entry]) => {
        const width = Math.max(1, Math.round(entry.contentRect.width));
        const height = Math.max(1, Math.round(entry.contentRect.height));
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        applySettings(value, latest.current, latestView.current);
      });
      observer.observe(mount);
      applySettings(value, latest.current, latestView.current);
    }).catch(() => {
      if (!cancelled) setUnavailable(true);
    });

    return () => {
      cancelled = true;
      state.current?.dispose();
      state.current = null;
      delete mount.dataset.rig;
    };
  }, [sourceUrl]);

  return (
    <div className="direction-preview">
      <div ref={host} className="direction-preview-canvas" hidden={unavailable} aria-label="연출 가이드 미리보기"
        onPointerDown={(event) => {
          if (!onDirectionChange || settings.kind === "emotion") return;
          event.stopPropagation();
          pointer.current = { x: event.clientX, y: event.clientY, azimuth: settings.azimuth, elevation: settings.elevation };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={move}
        onPointerUp={(event) => { move(event); pointer.current = null; event.stopPropagation(); }}
        onPointerCancel={(event) => { pointer.current = null; event.stopPropagation(); }} />
      {unavailable && <div className="direction-preview-fallback" aria-label="2D 연출 가이드">
        <span className="direction-preview-fallback-face" style={{
          transform: settings.kind === "angle"
            ? `rotateY(${settings.azimuth}deg) rotateX(${-settings.elevation}deg)`
            : undefined,
          background: settings.kind === "light" || settings.kind === "cinematic"
            ? `radial-gradient(circle at ${50 + settings.azimuth / 5}% ${50 - settings.elevation / 3}%, ${settings.color}, var(--muted))`
            : undefined,
        }}>
          <i className="direction-preview-fallback-eyes" style={{
            transform: settings.kind === "emotion" ? `scaleY(${Math.max(0.4, 1 + settings.arousal * settings.intensity)})` : undefined,
          }} />
          <i className="direction-preview-fallback-mouth" style={{
            transform: settings.kind === "emotion" ? `scaleY(${Math.max(0.4, 1 + settings.arousal * settings.intensity)}) rotate(${settings.warmth * settings.intensity * 15}deg)` : undefined,
          }} />
        </span>
        <p>2D 가이드로 표시합니다.</p>
      </div>}
      <p>연출 가이드 모델입니다. 생성 결과의 얼굴과 장면은 이미지 모델에서 확인하세요.</p>
    </div>
  );
}
