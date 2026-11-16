// Grenades: a thrown point with velocity, gravity and bounces off the map's boxes.
// A frag fuses and hurts everyone in radius, less through walls; a smoke blooms
// into a cloud that blocks sight for twelve seconds.
import * as THREE from 'three';
import { CFG } from './config.js';
import { PALETTE } from './palette.js';

const GRAVITY = 12;
const BOUNCE = 0.45;

export function createGrenades(scene, colliders) {
  const live = [];
  const smokes = [];
  const probe = new THREE.Box3();
  const tmp = new THREE.Vector3();

  const fragGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const fragMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.6, metalness: 0.4 });
  const smokeGeo = new THREE.SphereGeometry(1, 14, 10);
  const smokeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.smoke), transparent: true, opacity: 0.32, depthWrite: false });

  function collide(pos, radius) {
    probe.min.set(pos.x - radius, pos.y - radius, pos.z - radius);
    probe.max.set(pos.x + radius, pos.y + radius, pos.z + radius);
    for (const c of colliders) if (probe.intersectsBox(c)) return c;
    return null;
  }

  function throwGrenade(kind, origin, direction) {
    const mesh = new THREE.Mesh(fragGeo, fragMat);
    mesh.position.copy(origin);
    scene.add(mesh);
    const g = {
      kind,
      mesh,
      pos: origin.clone(),
      vel: direction.clone().multiplyScalar(14).add(new THREE.Vector3(0, 3.2, 0)),
      fuse: CFG.grenades[kind].fuse,
      alive: true,
    };
    live.push(g);
    return g;
  }

  function bloomSmoke(pos) {
    const cloud = new THREE.Group();
    const offsets = [[0, 0, 0], [2.2, 0.4, 0.8], [-2, 0.6, -0.6], [0.8, 0.3, -2.2], [-0.9, 0.5, 2.1], [1.6, 1.2, -1.4], [-1.8, 1.1, 1.5]];
    for (const [x, y, z] of offsets) {
      const puff = new THREE.Mesh(smokeGeo, smokeMat);
      puff.position.set(x, y + 1, z);
      puff.scale.setScalar(1.6 + Math.random() * 0.7);
      cloud.add(puff);
    }
    cloud.position.copy(pos);
    cloud.position.y = Math.max(0.4, pos.y);
    scene.add(cloud);
    smokes.push({ group: cloud, pos: pos.clone(), radius: CFG.grenades.smoke.radius, left: CFG.grenades.smoke.duration });
  }

  // Returns detonation events for the sim to resolve: { kind, pos }.
  function step(dt) {
    const events = [];
    for (let i = live.length - 1; i >= 0; i -= 1) {
      const g = live[i];
      g.vel.y -= GRAVITY * dt;
      g.pos.addScaledVector(g.vel, dt);
      if (g.pos.y < 0.09) {
        g.pos.y = 0.09;
        g.vel.y = Math.abs(g.vel.y) * BOUNCE;
        g.vel.x *= 0.7;
        g.vel.z *= 0.7;
      }
      const hit = collide(g.pos, 0.09);
      if (hit) {
        // Push out along the smallest penetration axis and reflect that component.
        const cx = Math.max(hit.min.x, Math.min(g.pos.x, hit.max.x));
        const cy = Math.max(hit.min.y, Math.min(g.pos.y, hit.max.y));
        const cz = Math.max(hit.min.z, Math.min(g.pos.z, hit.max.z));
        tmp.set(g.pos.x - cx, g.pos.y - cy, g.pos.z - cz);
        if (Math.abs(tmp.x) >= Math.abs(tmp.y) && Math.abs(tmp.x) >= Math.abs(tmp.z)) g.vel.x = -g.vel.x * BOUNCE;
        else if (Math.abs(tmp.y) >= Math.abs(tmp.z)) g.vel.y = -g.vel.y * BOUNCE;
        else g.vel.z = -g.vel.z * BOUNCE;
        g.pos.addScaledVector(tmp.normalize(), 0.12);
      }
      g.mesh.position.copy(g.pos);
      g.fuse -= dt;
      if (g.fuse <= 0) {
        events.push({ kind: g.kind, pos: g.pos.clone() });
        if (g.kind === 'smoke') bloomSmoke(g.pos);
        scene.remove(g.mesh);
        live.splice(i, 1);
      }
    }
    for (let i = smokes.length - 1; i >= 0; i -= 1) {
      const s = smokes[i];
      s.left -= dt;
      if (s.left <= 0) {
        scene.remove(s.group);
        smokes.splice(i, 1);
      }
    }
    return events;
  }

  function clear() {
    for (const g of live) scene.remove(g.mesh);
    live.length = 0;
    for (const s of smokes) scene.remove(s.group);
    smokes.length = 0;
  }

  return { throwGrenade, step, clear, smokes, live };
}
