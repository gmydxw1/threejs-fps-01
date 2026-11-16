// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's
// rate. ?shot=start|play|plant|end with &seed=N sets up a deterministic frame for
// a capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createMap } from './map.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createTracers } from './tracers.js';
import { createViewmodel } from './viewmodel.js';
import { createSim } from './sim.js';
import { CFG } from './config.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 26, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const map = createMap(scene);
const audio = createAudio();
const hud = createHud(map.minimapRects);
const tracers = createTracers(scene);
const viewmodel = createViewmodel(camera);
const input = createInput(renderer.domElement, onLockChange);
const sim = createSim({
  scene,
  camera,
  map,
  hud,
  audio,
  tracers,
  onBuyClosed: () => { if (!shot) input.requestLock(); },
});

const body = sim.player.state;
let started = false;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let lastWeapon = '';
let currentFov = 74;

// The buy menu is clicked with a free mouse, so the round's buy phase runs
// unlocked; DEPLOY (or Enter/B) closes it and locks the pointer for the fight.
document.getElementById('deploy').addEventListener('click', () => {
  sim.deploy();
  input.requestLock();
});

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  const phase = sim.state.phase;
  if (phase === 'matchEnd') {
    sim.startMatch();
    return;
  }
  if (phase === 'roundEnd') {
    sim.nextRound();
    return;
  }
  if (!sim.state.playerAlive) {
    hud.hideOverlay();
    return;
  }
  if (!started) {
    started = true;
    sim.startMatch();
    return;
  }
  hud.hideOverlay();
  input.requestLock();
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    audio.unlock();
    hud.hideOverlay();
    return;
  }
  // Unlocked mid-round with the player alive: offer the pause panel, unless the
  // buy menu is the thing on screen.
  if (started && sim.state.playerAlive && !hud.isBuyOpen()
    && (sim.state.phase === 'live' || sim.state.phase === 'planted')) {
    hud.showOverlay('paused');
  }
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function settle(steps, fakeInput) {
  for (let i = 0; i < steps; i += 1) sim.step(FIXED_STEP, fakeInput || input);
}

function fakeKeys(codes) {
  return { state: { keys: new Set(codes), firing: false, zooming: false }, takePressed: () => false, takeFiringEdge: () => false };
}

function runShot(name) {
  started = true;
  sim.state.scripted = true;
  sim.startMatch();
  hud.hideOverlay();
  // The buy menu is a real DOM panel; the start shot shows it over the spawn view.
  if (name === 'start') {
    body.position.set(1, 0, 14);
    body.yaw = -0.2;
    body.pitch = 0.02;
    settle(20);
    syncCamera();
    paintTwiceThenReady();
    return;
  }
  // Every other shot plays live: close the buy phase and arm the player.
  sim.deploy();
  sim.arsenal.state.owned.rifle = true;
  sim.arsenal.switchTo('rifle');
  sim.arsenal.state.mag = 30;
  sim.arsenal.state.reserve = 90;

  if (name === 'play') {
    // Mid-lane firefight through the east gap of the mid container.
    body.position.set(1.75, 0, 3);
    body.yaw = 0.05;
    body.pitch = 0;
    const enemy = sim.bots.bots.find((b) => b.team === 'ravens');
    enemy.body.position.set(2.5, 0, -4);
    enemy.body.yaw = Math.PI;
    enemy.hold = [2.5, -4];
    enemy.alive = true;
    enemy.health = 100;
    settle(15);
    // Fire a burst at the enemy's chest: tracer, impact and hit marker in frame.
    for (let round = 0; round < 3; round += 1) {
      aimAt(new THREE.Vector3(2.5, 1.1, -4));
      sim.playerShoot();
      settle(6);
    }
    aimAt(new THREE.Vector3(2.5, 1.1, -4));
    hud.hitMarker(false, 4000);
    settle(4);
  } else if (name === 'plant') {
    // Stand at the site's edge looking up at the Relay mast: dish, beacon and
    // the planting bar all in frame, with a teammate guarding the approach.
    body.position.set(2.8, 0, -9.2);
    body.yaw = 0.75;
    body.pitch = 0.12;
    const mate = sim.bots.bots.find((b) => b.team === 'nightwatch');
    mate.body.position.set(-3.5, 0, -8.5);
    mate.body.yaw = 0.5;
    settle(10);
    // Hold E in the zone until the plant bar is most of the way there.
    const holding = fakeKeys(['KeyE']);
    for (let i = 0; i < 130 && sim.bomb.state.phase !== 'planted'; i += 1) sim.step(FIXED_STEP, holding);
    settle(4);
  } else if (name === 'end') {
    body.position.set(-2, 0, 8);
    body.yaw = -0.3;
    body.pitch = 0.02;
    sim.endRound('nightwatch', 'Nightwatch take Round 1 — the Relay holds');
    settle(20);
  }
  sim.updateHud();
  syncCamera();
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
      return;
    }
    requestAnimationFrame(paint);
  }
  requestAnimationFrame(paint);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (frozen) {
    renderer.render(scene, camera);
    return;
  }
  const look = input.takeLook();
  sim.player.look(look.x, look.y);
  if (sim.state.phase === 'buy' && document.pointerLockElement) {
    // The buy menu needs a free mouse: release the lock while it is open.
    document.exitPointerLock();
  }
  accumulator += dt;
  let steps = 0;
  while (accumulator >= FIXED_STEP && steps < 5) {
    sim.step(FIXED_STEP, input);
    accumulator -= FIXED_STEP;
    steps += 1;
  }
  if (accumulator > FIXED_STEP * 5) accumulator = 0;
  // Zoom: the DMR's scope narrows the field of view while the right button is held.
  const targetFov = input.state.zooming && sim.arsenal.state.current === 'dmr' ? CFG.weapons.dmr.zoomFov : 74;
  if (Math.abs(targetFov - currentFov) > 0.05) {
    currentFov += (targetFov - currentFov) * Math.min(1, dt * 14);
    camera.fov = currentFov;
    camera.updateProjectionMatrix();
  }
  if (sim.arsenal.state.current !== lastWeapon) {
    lastWeapon = sim.arsenal.state.current;
    viewmodel.setWeapon(lastWeapon);
  }
  viewmodel.step(sim.arsenal.state, CFG.weapons[sim.arsenal.state.current].reloadTime);
  syncCamera();
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Exposed for play-testing from the console and the browser harness.
window.__game = { sim, map, hud, input, CFG };

syncCamera();
if (shot) {
  hud.hideOverlay();
  runShot(shot);
} else {
  hud.showOverlay('start');
  requestAnimationFrame(frame);
}
