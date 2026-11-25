"use client";
// Why: a flat drawing reads as a sticker; a lit 3D figure that turns toward
//      you feels like a companion living on the page.
// How: builds Kai from simple shapes (spheres, capsules, cones) in three.js
//      with soft studio lighting: warm key, cool fill and an orange rim light
//      from behind. A small transparent WebGL canvas renders him every frame.
//      Head and body turn toward the pointer, irises follow it, and the mood
//      (eyes, brows, mouth, extras like sweat, Zzz, hearts) and one-off
//      actions (hop, spin, wave…) are animated in code from the same
//      mood/action/blink props the SVG version uses. Mouths and closed eyes
//      are small canvas-drawn textures on the face. Loaded lazily (Pet.tsx),
//      and if WebGL isn't available `onFail` switches back to the SVG.
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Action, Mood } from "./PetProvider";

type Props = { mood: Mood; action: Action; blink: boolean; onFail: () => void };

const C = {
  skin: "#f6c19d", skinD: "#e7a07a", hair: "#5a321d", hairL: "#7a4a2c", jacket: "#e6d4b8", jacketD: "#cdb795",
  hoodie: "#25242b", pants: "#2c2b32", strap: "#1f1e24", orange: "#ff7a1f", shoe: "#f7f7f9", sole: "#9a9ca6", iris: "#7a4524",
};

/* ---------- small helpers ---------- */
const std = (color: string, rough = 0.6, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number] = [0, 0, 0], scale?: [number, number, number], rot?: [number, number, number]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  if (scale) m.scale.set(...scale);
  if (rot) m.rotation.set(...rot);
  return m;
}
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  g.lineCap = "round"; g.lineJoin = "round";
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* mouths, drawn on a 128×80 canvas */
type MouthKind = "smile" | "grin" | "flat" | "wavy" | "frown" | "o" | "sleep";
function mouthTex(kind: MouthKind) {
  return canvasTex(128, 80, (g) => {
    g.strokeStyle = "#5a1d10"; g.fillStyle = "#7a2414"; g.lineWidth = 7;
    g.beginPath();
    if (kind === "smile") { g.moveTo(34, 30); g.quadraticCurveTo(64, 58, 94, 30); g.stroke(); }
    if (kind === "grin") {
      g.moveTo(28, 22); g.quadraticCurveTo(64, 82, 100, 22); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = "#ff8a8a"; g.beginPath(); g.ellipse(64, 50, 16, 8, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#fff"; g.fillRect(40, 22, 48, 7);
    }
    if (kind === "flat") { g.moveTo(44, 40); g.lineTo(84, 40); g.stroke(); }
    if (kind === "wavy") { g.moveTo(30, 42); g.quadraticCurveTo(47, 28, 64, 42); g.quadraticCurveTo(81, 56, 98, 42); g.stroke(); }
    if (kind === "frown") { g.moveTo(36, 52); g.quadraticCurveTo(64, 24, 92, 52); g.stroke(); }
    if (kind === "o") { g.ellipse(64, 42, 14, 18, 0, 0, Math.PI * 2); g.fill(); g.stroke(); }
    if (kind === "sleep") { g.ellipse(64, 42, 8, 6, 0, 0, Math.PI * 2); g.fill(); }
  });
}
/* closed eyes: happy arcs (^) or sleeping arcs (‿) */
function eyeArcTex(kind: "happy" | "shut") {
  return canvasTex(96, 64, (g) => {
    g.strokeStyle = "#2a160b"; g.lineWidth = 8; g.beginPath();
    if (kind === "happy") { g.moveTo(16, 46); g.quadraticCurveTo(48, 6, 80, 46); }
    else { g.moveTo(16, 26); g.quadraticCurveTo(48, 50, 80, 26); }
    g.stroke();
  });
}
function glyphTex(draw: (g: CanvasRenderingContext2D) => void) { return canvasTex(64, 64, draw); }

const MOUTH: Record<Mood, MouthKind> = { idle: "smile", wave: "smile", happy: "grin", love: "grin", excited: "grin", thinking: "flat", worried: "wavy", panic: "o", sad: "frown", sleep: "sleep" };

export default function Kai3D({ mood, action, blink, onFail }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const state = useRef({ mood, action, blink, actionAt: 0 });

  useEffect(() => {
    const s = state.current;
    if (action !== s.action && action) s.actionAt = performance.now();
    s.mood = mood; s.action = action; s.blink = blink;
  }, [mood, action, blink]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    } catch { onFail(); return; }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 50);
    camera.position.set(0, 2.1, 11.5);
    camera.lookAt(0, 1.95, 0);

    // lights: warm key, cool fill, orange rim from behind
    scene.add(new THREE.HemisphereLight(0xfff2e4, 0x5a4a3c, 1.15));
    const key = new THREE.DirectionalLight(0xfff0e0, 2.3); key.position.set(3, 5, 6); scene.add(key);
    const fill = new THREE.DirectionalLight(0xbcd4ff, 0.55); fill.position.set(-5, 2, 3); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xff9a4a, 1.6); rim.position.set(-2.5, 3.5, -5); scene.add(rim);
    const rim2 = new THREE.DirectionalLight(0xffd2a8, 0.9); rim2.position.set(3, 2, -4); scene.add(rim2);

    const disposables: { dispose(): void }[] = [];
    const keep = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };
    const M = {
      skin: keep(std(C.skin, 0.55)), skinD: keep(std(C.skinD, 0.6)), hair: keep(std(C.hair, 0.5)), hairL: keep(std(C.hairL, 0.5)),
      jacket: keep(std(C.jacket, 0.85)), jacketD: keep(std(C.jacketD, 0.85)), hoodie: keep(std(C.hoodie, 0.9)), pants: keep(std(C.pants, 0.9)),
      strap: keep(std(C.strap, 0.8)), orange: keep(std(C.orange, 0.45)), shoe: keep(std(C.shoe, 0.4)), sole: keep(std(C.sole, 0.7)),
      eyeWhite: keep(new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 })),
      iris: keep(new THREE.MeshBasicMaterial({ color: C.iris })), pupil: keep(new THREE.MeshBasicMaterial({ color: "#140904" })),
      glint: keep(new THREE.MeshBasicMaterial({ color: "#ffffff" })),
      cheek: keep(new THREE.MeshBasicMaterial({ color: "#ff8f8f", transparent: true, opacity: 0.35, depthWrite: false })),
      badge: keep(std(C.orange, 0.3, { emissive: new THREE.Color(C.orange), emissiveIntensity: 0.8 })),
      drop: keep(new THREE.MeshPhysicalMaterial({ color: "#9fdcff", roughness: 0.05, transmission: 0.2, clearcoat: 1 })),
    };
    const G = {
      sphere: keep(new THREE.SphereGeometry(1, 40, 28)),
      cap: (r: number, l: number) => keep(new THREE.CapsuleGeometry(r, l, 10, 24)),
      cyl: (r1: number, r2: number, h: number) => keep(new THREE.CylinderGeometry(r1, r2, h, 28)),
      cone: (r: number, h: number) => keep(new THREE.ConeGeometry(r, h, 18)),
      circle: (r: number) => keep(new THREE.CircleGeometry(r, 28)),
      plane: (w: number, h: number) => keep(new THREE.PlaneGeometry(w, h)),
      torus: (r: number, t: number, arc = Math.PI * 2) => keep(new THREE.TorusGeometry(r, t, 14, 36, arc)),
    };

    const root = new THREE.Group(); scene.add(root);
    const body = new THREE.Group(); root.add(body);

    // contact shadow
    const shadowTex = keep(canvasTex(128, 128, (g) => {
      const r = g.createRadialGradient(64, 64, 4, 64, 64, 62);
      r.addColorStop(0, "rgba(20,10,0,0.45)"); r.addColorStop(1, "rgba(20,10,0,0)");
      g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    }));
    const shadow = mesh(G.plane(2.2, 2.2), keep(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })), [0, 0.01, 0], [1, 1, 1], [-Math.PI / 2, 0, 0]);
    root.add(shadow);

    // shoes
    for (const x of [-0.29, 0.29]) {
      body.add(mesh(G.sphere, M.shoe, [x, 0.17, 0.1], [0.24, 0.17, 0.36]));
      body.add(mesh(G.sphere, M.sole, [x, 0.07, 0.1], [0.255, 0.07, 0.38]));
      body.add(mesh(G.cap(0.035, 0.22), M.orange, [x + Math.sign(x) * 0.2, 0.18, 0.12], undefined, [Math.PI / 2, 0, 0]));
    }
    // legs
    for (const x of [-0.27, 0.27]) {
      body.add(mesh(G.cap(0.23, 0.48), M.pants, [x, 0.63, 0]));
      body.add(mesh(G.sphere, M.strap, [x + Math.sign(x) * 0.17, 0.68, 0.02], [0.06, 0.12, 0.1]));
    }
    body.add(mesh(G.cyl(0.5, 0.48, 0.16), M.hoodie, [0, 1.0, 0]));
    // backpack and torso
    body.add(mesh(G.cap(0.42, 0.32), M.strap, [0, 1.48, -0.42], [1.15, 1, 0.65]));
    const torso = new THREE.Group(); torso.position.set(0, 1.45, 0); body.add(torso);
    torso.add(mesh(G.cap(0.5, 0.42), M.jacket, [0, 0, 0], [1.1, 1, 0.85]));
    torso.add(mesh(G.cap(0.2, 0.5), M.hoodie, [0, 0, 0.36], [1, 1, 0.4]));
    for (const x of [-0.2, 0.2]) torso.add(mesh(G.cyl(0.022, 0.022, 0.78), M.orange, [x, -0.02, 0.41]));
    for (const x of [-0.33, 0.33]) torso.add(mesh(G.cap(0.05, 0.6), M.strap, [x, 0.02, 0.33], undefined, [0, 0, x > 0 ? 0.06 : -0.06]));
    const badge = mesh(G.cyl(0.09, 0.09, 0.04), M.badge, [0.3, 0.12, 0.41], undefined, [Math.PI / 2, 0, 0]); torso.add(badge);
    body.add(mesh(G.torus(0.33, 0.11), keep(std("#cfc8be", 0.85)), [0, 1.95, -0.08], undefined, [Math.PI / 2 - 0.25, 0, 0]));
    body.add(mesh(G.cyl(0.14, 0.15, 0.3), M.skinD, [0, 1.98, 0]));

    // arms (pivot at the shoulder)
    const arm = (side: 1 | -1) => {
      const g = new THREE.Group(); g.position.set(0.58 * side, 1.75, 0);
      const inner = new THREE.Group(); inner.rotation.z = 0.12 * side; g.add(inner);
      inner.add(mesh(G.cap(0.16, 0.42), M.jacket, [0, -0.3, 0]));
      inner.add(mesh(G.cyl(0.165, 0.165, 0.1), M.hoodie, [0, -0.58, 0]));
      inner.add(mesh(G.sphere, M.skin, [0, -0.72, 0], [0.14, 0.14, 0.14]));
      body.add(g);
      return g;
    };
    const armL = arm(-1), armR = arm(1);

    // head
    const head = new THREE.Group(); head.position.set(0, 2.05, 0); body.add(head);
    const H = new THREE.Group(); H.position.set(0, 0.85, 0); head.add(H);
    H.add(mesh(G.sphere, M.skin, [0, 0, 0], [0.95, 0.92, 0.9]));
    for (const x of [-0.92, 0.92]) H.add(mesh(G.sphere, M.skin, [x, -0.05, -0.02], [0.17, 0.2, 0.12]));
    H.add(mesh(G.sphere, M.skinD, [0, -0.14, 0.88], [0.07, 0.06, 0.06]));
    for (const x of [-0.5, 0.5]) H.add(mesh(G.sphere, M.cheek, [x, -0.22, 0.72], [0.15, 0.09, 0.05], [0, x * 1.1, 0]));
    // hair: cap tilted back, tufts all over, bangs swept over the forehead
    const capGeo = keep(new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.55));
    H.add(mesh(capGeo, M.hair, [0, 0.02, -0.03], [1.0, 0.98, 0.96], [-0.42, 0, 0]));
    // tufts: soft elongated blobs placed on the scalp and pointed along a direction, for a messy look
    const UP = new THREE.Vector3(0, 1, 0);
    const spike = (at: [number, number, number], point: [number, number, number], r: number, h: number, mat: THREE.Material) => {
      const dir = new THREE.Vector3(...point).normalize();
      const m = mesh(G.sphere, mat, [0, 0, 0], [r, h * 0.5, r * 0.75]);
      m.quaternion.setFromUnitVectors(UP, dir);
      m.position.set(...at).add(dir.clone().multiplyScalar(h * 0.3));
      H.add(m);
    };
    // crown and back
    const crown: [number, number, number][] = [
      [0, 1, 0.1], [0.45, 0.9, 0.05], [-0.45, 0.9, 0.05], [0.2, 0.85, -0.5], [-0.25, 0.85, -0.45], [0.7, 0.55, -0.35], [-0.7, 0.55, -0.35],
      [0.85, 0.35, 0.1], [-0.85, 0.35, 0.1], [0, 0.6, -0.8], [0.45, 0.3, -0.85], [-0.45, 0.3, -0.85], [0.25, 0.95, 0.35], [-0.25, 0.95, 0.35],
    ];
    crown.forEach((d, i) => {
      const v = new THREE.Vector3(...d).normalize();
      const at = v.clone().multiplyScalar(0.86);
      const tip = v.clone().add(new THREE.Vector3(Math.sin(i * 2.3) * 0.45, 0.1, -0.35 + Math.cos(i * 1.7) * 0.2));
      spike([at.x, at.y, at.z], [tip.x, tip.y, tip.z], 0.17, 0.8, i % 3 === 0 ? M.hairL : M.hair);
    });
    // bangs: sweep forward and down over the forehead
    const bangs: [number, number][] = [[-0.5, 0.9], [-0.15, 0.85], [0.22, 0.75], [0.55, 0.5]];
    bangs.forEach(([x, lean]) => spike([x * 0.95, 0.6, 0.6 - Math.abs(x) * 0.25], [x * 0.3 + lean, -0.45, 0.55], 0.2, 0.7, M.hair));
    // sideburns
    for (const x of [-0.82, 0.82]) spike([x, 0.15, 0.25], [x * 0.3, -1, 0.2], 0.12, 0.35, M.hair);
    const cowlick = mesh(G.torus(0.16, 0.04, Math.PI * 1.2), M.hair, [0.05, 1.18, -0.05], undefined, [0, 0.4, 0.6]); H.add(cowlick);

    // eyes
    const eyes: { g: THREE.Group; iris: THREE.Group }[] = [];
    for (const x of [-0.31, 0.31]) {
      const g = new THREE.Group(); g.position.set(x, 0.02, 0.8); g.rotation.y = x * 0.55; H.add(g);
      g.add(mesh(G.sphere, M.eyeWhite, [0, 0, 0], [0.19, 0.23, 0.1]));
      const iris = new THREE.Group(); iris.position.z = 0.1; g.add(iris);
      iris.add(mesh(G.circle(0.13), M.iris, [0, -0.01, 0]));
      iris.add(mesh(G.circle(0.065), M.pupil, [0, -0.01, 0.002]));
      iris.add(mesh(G.circle(0.04), M.glint, [-0.045, 0.045, 0.004]));
      iris.add(mesh(G.circle(0.018), M.glint, [0.04, -0.05, 0.004]));
      eyes.push({ g, iris });
    }
    // brows
    const brows = [-0.31, 0.31].map((x) => { const b = mesh(G.cap(0.035, 0.2), M.hair, [x, 0.33, 0.83], undefined, [0, x * 0.5, Math.PI / 2 + (x > 0 ? -0.12 : 0.12)]); H.add(b); return b; });
    // closed-eye arcs
    const arcMat = (k: "happy" | "shut") => keep(new THREE.MeshBasicMaterial({ map: keep(eyeArcTex(k)), transparent: true, depthWrite: false }));
    const arcHappy = arcMat("happy"), arcShut = arcMat("shut");
    const arcs = [-0.31, 0.31].map((x) => { const p = mesh(G.plane(0.36, 0.24), arcHappy, [x, 0.02, 0.87], undefined, [0, x * 0.55, 0]); p.visible = false; H.add(p); return p; });
    // mouth
    const mouthTexs = Object.fromEntries((["smile", "grin", "flat", "wavy", "frown", "o", "sleep"] as MouthKind[]).map((k) => [k, keep(mouthTex(k))])) as unknown as Record<MouthKind, THREE.Texture>;
    const mouthMat = keep(new THREE.MeshBasicMaterial({ map: mouthTexs.smile, transparent: true, depthWrite: false }));
    H.add(mesh(G.plane(0.46, 0.29), mouthMat, [0, -0.34, 0.85], undefined, [-0.3, 0, 0]));
    // extras
    const sweat = mesh(G.sphere, M.drop, [0.72, 0.45, 0.45], [0.07, 0.1, 0.07]); H.add(sweat);
    const tear = mesh(G.sphere, M.drop, [-0.36, -0.2, 0.8], [0.05, 0.07, 0.05]); H.add(tear);
    const sprite = (draw: (g: CanvasRenderingContext2D) => void) => new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: keep(glyphTex(draw)), transparent: true, depthWrite: false })));
    const zzz = [0, 1, 2].map((i) => { const sp = sprite((g) => { g.fillStyle = "#a39d8f"; g.font = "bold 48px Inter, sans-serif"; g.fillText(i === 2 ? "Z" : "z", 16, 48); }); sp.scale.setScalar(0.25 + i * 0.08); scene.add(sp); return sp; });
    const hearts = [0, 1].map(() => { const sp = sprite((g) => { g.fillStyle = "#ff5d7a"; g.beginPath(); g.moveTo(32, 56); g.bezierCurveTo(-8, 28, 14, 0, 32, 18); g.bezierCurveTo(50, 0, 72, 28, 32, 56); g.fill(); }); sp.scale.setScalar(0.32); scene.add(sp); return sp; });
    const sparks = [0, 1, 2].map(() => { const sp = sprite((g) => { g.fillStyle = "#ffc43d"; g.beginPath(); g.moveTo(32, 2); g.lineTo(39, 25); g.lineTo(62, 32); g.lineTo(39, 39); g.lineTo(32, 62); g.lineTo(25, 39); g.lineTo(2, 32); g.lineTo(25, 25); g.closePath(); g.fill(); }); sp.scale.setScalar(0.3); scene.add(sp); return sp; });
    const dots = [0, 1, 2].map((i) => { const d = mesh(G.sphere, keep(std("#b9b29c", 0.6)), [0.9 + i * 0.22, 3.75 + i * 0.18, 0.3], [0.05 + i * 0.015, 0.05 + i * 0.015, 0.05 + i * 0.015]); scene.add(d); return d; });

    // sizing
    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();

    // pointer → where Kai looks
    const look = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / 500, dy = (e.clientY - (r.top + r.height * 0.3)) / 400;
      look.tx = Math.max(-1, Math.min(1, dx)); look.ty = Math.max(-1, Math.min(1, dy));
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
    let raf = 0, last = performance.now();
    const blinkAmt = { v: 1 };
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const t = now / 1000;
      const { mood: md, action: ac, blink: bl, actionAt } = state.current;
      const at = (now - actionAt) / 1000;
      const k = 1 - Math.pow(0.001, dt);

      look.x = lerp(look.x, look.tx, k * 0.6); look.y = lerp(look.y, look.ty, k * 0.6);

      // body: breathing, idle sway, toward the pointer
      let y = 0, sx = 1, sy = 1, rotY = look.x * 0.35, rotZ = Math.sin(t * 0.7) * 0.02, posX = 0;
      sy += Math.sin(t * 2) * 0.012; sx -= Math.sin(t * 2) * 0.006;
      if (ac === "hop" && at < 1.4) { const p = (at % 0.7) / 0.7; y = Math.sin(p * Math.PI) * 0.55; const sq = Math.cos(p * Math.PI * 2) * 0.06; sy -= sq; sx += sq; }
      if (ac === "spin" && at < 0.9) { const p = at / 0.9; rotY += (1 - Math.pow(1 - p, 3)) * Math.PI * 2; y = Math.sin(p * Math.PI) * 0.3; }
      if (ac === "shake" && at < 0.9) { posX = Math.sin(at * 40) * 0.08; rotZ += Math.sin(at * 40) * 0.05; }
      if (ac === "wiggle" && at < 0.8) rotZ += Math.sin(at * 20) * 0.08 * (1 - at / 0.8);
      if (ac === "stretch" && at < 1) { const p = Math.sin((at / 1) * Math.PI); sy += p * 0.05; sx -= p * 0.03; }
      if (md === "panic") { posX += Math.sin(t * 60) * 0.02; y += Math.abs(Math.sin(t * 30)) * 0.02; }
      if (md === "sleep") { sy += Math.sin(t * 1.2) * 0.015; rotY = lerp(rotY, 0, 0.8); }
      body.position.set(posX, y, 0); body.scale.set(sx, sy, sx); body.rotation.set(0, rotY, rotZ);
      shadow.scale.setScalar(1 - y * 0.6); (shadow.material as THREE.MeshBasicMaterial).opacity = 1 - y * 0.9;

      // head: follows the pointer harder than the body
      let hx = look.y * 0.3, hy = look.x * 0.45, hz = Math.sin(t * 0.9) * 0.04;
      if (md === "thinking") { hz += 0.14; hx -= 0.12; }
      if (md === "sad") { hx += 0.25; hz -= 0.05; }
      if (md === "sleep") { hx = 0.3 + Math.sin(t * 1.2) * 0.05; hy = 0; hz = 0.1; }
      head.rotation.set(lerp(head.rotation.x, hx, k), lerp(head.rotation.y, hy, k), lerp(head.rotation.z, hz, k));
      cowlick.rotation.z = 0.6 + Math.sin(t * 3) * 0.2;

      // arms
      let lz = 0, rz = 0, lx = Math.sin(t * 2) * 0.03, rx = -Math.sin(t * 2) * 0.03;
      if (ac === "wave" && at < 1.2) rz = 2.6 + Math.sin(at * 14) * 0.35;
      if (md === "wave") rz = 2.6 + Math.sin(t * 12) * 0.35;
      if (ac === "stretch" && at < 1) { const p = Math.sin(at * Math.PI); lz = -2.6 * p; rz = 2.6 * p; }
      if (md === "excited" || md === "happy") { lz = -0.35 - Math.abs(Math.sin(t * 6)) * 0.2; rz = 0.35 + Math.abs(Math.sin(t * 6 + 1)) * 0.2; }
      if (md === "panic") { lz = -0.9; rz = 0.9; }
      armL.rotation.set(lx, 0, lerp(armL.rotation.z, lz, k)); armR.rotation.set(rx, 0, lerp(armR.rotation.z, rz, k));

      // face
      const closed = md === "happy" || md === "love" || md === "excited" || md === "sleep";
      blinkAmt.v = lerp(blinkAmt.v, bl ? 0.08 : 1, 0.6);
      const eyeScale = md === "panic" ? 1.18 : 1;
      let ix = look.x * 0.06, iy = -look.y * 0.05;
      if (md === "thinking") { ix = 0.05; iy = 0.06; }
      if (md === "sad") iy = -0.05;
      for (const e of eyes) {
        e.g.visible = !closed;
        e.g.scale.set(eyeScale, eyeScale * blinkAmt.v, eyeScale);
        e.iris.position.x = lerp(e.iris.position.x, ix, k); e.iris.position.y = lerp(e.iris.position.y, iy, k);
        e.iris.scale.setScalar(md === "panic" ? 0.75 : 1);
      }
      for (const a of arcs) { a.visible = closed; a.material = md === "sleep" ? arcShut : arcHappy; }
      const browY = md === "panic" ? 0.42 : md === "worried" ? 0.37 : 0.33;
      const browTilt = md === "worried" || md === "panic" ? 0.35 : md === "sad" ? -0.25 : md === "thinking" ? 0.1 : 0;
      brows.forEach((b, i) => { const s = i === 0 ? 1 : -1; b.position.y = lerp(b.position.y, browY, k); b.rotation.z = lerp(b.rotation.z, Math.PI / 2 + s * (0.12 - browTilt), k); });
      mouthMat.map = mouthTexs[MOUTH[md]];
      M.cheek.opacity = closed && md !== "sleep" ? 0.6 : 0.35;
      M.badge.emissiveIntensity = md === "panic" ? 0.6 + Math.abs(Math.sin(t * 12)) * 1.6 : md === "excited" ? 0.8 + Math.abs(Math.sin(t * 6)) : 0.55 + Math.sin(t * 2.5) * 0.3;

      // extras
      const drip = (spd: number) => (t * spd) % 1;
      sweat.visible = md === "worried" || md === "panic";
      if (sweat.visible) { const p = drip(md === "panic" ? 1.3 : 0.7); sweat.position.y = 0.45 - p * 0.4; (sweat.material as THREE.MeshPhysicalMaterial).opacity = 1; }
      tear.visible = md === "sad";
      if (tear.visible) tear.position.y = -0.2 - drip(0.55) * 0.35;
      const headTop = new THREE.Vector3(0, 3.7, 0);
      zzz.forEach((z, i) => { z.visible = md === "sleep"; const p = (t * 0.4 + i / 3) % 1; z.position.set(0.7 + p * 0.7, headTop.y + p * 0.8, 0.2); z.material.opacity = Math.sin(p * Math.PI); });
      hearts.forEach((h, i) => { h.visible = md === "love"; const p = (t * 0.6 + i / 2) % 1; h.position.set((i ? 0.95 : -0.95) + Math.sin(p * 6) * 0.08, 2.9 + p * 1.1, 0.4); h.material.opacity = Math.sin(p * Math.PI); });
      sparks.forEach((s, i) => { s.visible = md === "excited"; const a = t * 1.5 + (i * Math.PI * 2) / 3; s.position.set(Math.cos(a) * 1.3, 2.9 + Math.sin(a * 1.3) * 0.6, Math.sin(a) * 0.6 + 0.3); s.material.opacity = 0.5 + Math.abs(Math.sin(t * 5 + i)) * 0.5; s.material.rotation = t * 2; });
      dots.forEach((d, i) => { d.visible = md === "thinking"; d.position.y = 3.55 + i * 0.2 + Math.sin(t * 4 + i) * 0.04; });

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      ro.disconnect();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [onFail]);

  return <div ref={host} className="kai3d" />;
}
