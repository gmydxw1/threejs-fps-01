// The bomb: plant it in the Relay zone, guard the 35-second fuse, or defuse it.
// One state machine, driven by who stands in the zone holding the use key.
import * as THREE from 'three';
import { CFG } from './config.js';
import { PALETTE } from './palette.js';

export function createBomb(scene, siteBox) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.28, 0.34),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(0x2a2d31), roughness: 0.5, metalness: 0.5 }),
  );
  body.position.y = 0.14;
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 10, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.danger) }),
  );
  light.position.set(0.18, 0.3, 0);
  group.add(body, light);
  group.visible = false;
  scene.add(group);

  const state = {
    phase: 'idle', // idle | planting | planted | defusing | exploded | defused
    progress: 0,
    timer: CFG.round.plantSeconds,
    plantedAt: null,
    beepAt: 0,
  };

  function inZone(pos) {
    return siteBox.containsPoint(pos);
  }

  function reset() {
    state.phase = 'idle';
    state.progress = 0;
    state.timer = CFG.round.plantSeconds;
    state.plantedAt = null;
    group.visible = false;
  }

  // dt step. planter/defuser are null or { pos, hasKit }. Returns events.
  function step(dt, planter, defuser) {
    const events = [];
    if (state.phase === 'idle' || state.phase === 'planting') {
      if (planter && inZone(planter.pos)) {
        if (state.phase === 'idle') state.phase = 'planting';
        state.progress += dt / CFG.round.plantTime;
        if (state.progress >= 1) {
          state.phase = 'planted';
          state.progress = 0;
          state.timer = CFG.round.plantSeconds;
          state.plantedAt = planter.pos.clone();
          group.position.set(planter.pos.x, 0, planter.pos.z);
          group.visible = true;
          events.push({ type: 'planted' });
        }
      } else {
        if (state.phase === 'planting') state.progress = Math.max(0, state.progress - dt / CFG.round.plantTime);
        if (state.progress <= 0) state.phase = 'idle';
      }
      return events;
    }
    if (state.phase === 'planted' || state.phase === 'defusing') {
      state.timer -= dt;
      state.beepAt -= dt;
      if (state.beepAt <= 0) {
        state.beepAt = Math.max(0.25, state.timer / CFG.round.plantSeconds);
        events.push({ type: 'tick' });
      }
      light.material.color.setHex(Math.sin(state.timer * 10) > 0 ? 0xff3020 : 0x881508);
      if (defuser && inZone(defuser.pos)) {
        if (state.phase === 'planted') state.phase = 'defusing';
        const need = defuser.hasKit ? CFG.round.defuseKitTime : CFG.round.defuseTime;
        state.progress += dt / need;
        if (state.progress >= 1) {
          state.phase = 'defused';
          state.progress = 0;
          group.visible = false;
          events.push({ type: 'defused' });
        }
      } else if (state.phase === 'defusing') {
        state.phase = 'planted';
        state.progress = Math.max(0, state.progress - dt / CFG.round.defuseTime);
      }
      if (state.timer <= 0 && state.phase !== 'defused') {
        state.phase = 'exploded';
        group.visible = false;
        events.push({ type: 'exploded' });
      }
      return events;
    }
    return events;
  }

  return { state, step, reset, inZone, group };
}
