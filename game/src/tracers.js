// Tracers and impacts: a fixed pool of line segments, reused every shot, so the
// hot loop never allocates. A tracer fades in a tenth of a second; an impact is a
// short-lived glow where the bullet stopped.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const POOL = 24;
const IMPACT_POOL = 10;

export function createTracers(scene) {
  const tracers = [];
  for (let i = 0; i < POOL; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  const impacts = [];
  const impactGeo = new THREE.SphereGeometry(0.07, 8, 6);
  for (let i = 0; i < IMPACT_POOL; i += 1) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 });
    const mesh = new THREE.Mesh(impactGeo, mat);
    mesh.visible = false;
    scene.add(mesh);
    impacts.push({ mesh, life: 0 });
  }
  let next = 0;
  let nextImpact = 0;

  function fire(from, to, life = 0.1) {
    const t = tracers[next];
    next = (next + 1) % POOL;
    const attr = t.line.geometry.getAttribute('position');
    attr.setXYZ(0, from.x, from.y, from.z);
    attr.setXYZ(1, to.x, to.y, to.z);
    attr.needsUpdate = true;
    t.life = life;
    t.line.material.opacity = 0.85;
  }

  function impact(at) {
    const p = impacts[nextImpact];
    nextImpact = (nextImpact + 1) % IMPACT_POOL;
    p.mesh.position.copy(at);
    p.mesh.visible = true;
    p.life = 0.18;
    p.mesh.material.opacity = 0.95;
  }

  function step(dt) {
    for (const t of tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.1) * 0.85;
    }
    for (const p of impacts) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.mesh.material.opacity = Math.max(0, p.life / 0.18) * 0.95;
      if (p.life <= 0) p.mesh.visible = false;
    }
  }

  return { fire, impact, step };
}
