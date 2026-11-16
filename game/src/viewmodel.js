// The first-person gun: a box-built model per weapon, hung off the camera, with a
// muzzle flash and a kick that recovers. No models, no textures — the silhouette
// changes with the weapon, so the buy menu's choice is visible in the hand.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { CFG } from './config.js';

function buildModel(kind) {
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const steel = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const wood = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.8, metalness: 0.05 });
  const group = new THREE.Group();
  function part(geo, mat, x, y, z) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }
  if (kind === 'pistol') {
    part(new THREE.BoxGeometry(0.07, 0.09, 0.22), steel, 0, 0, -0.1);
    part(new THREE.BoxGeometry(0.06, 0.12, 0.07), dark, 0, -0.09, 0.02);
  } else if (kind === 'rifle') {
    part(new THREE.BoxGeometry(0.09, 0.1, 0.42), steel, 0, 0, -0.05);
    part(new THREE.BoxGeometry(0.045, 0.045, 0.4), dark, 0, 0.025, -0.42);
    part(new THREE.BoxGeometry(0.075, 0.08, 0.22), wood, 0, -0.02, 0.26);
    part(new THREE.BoxGeometry(0.05, 0.06, 0.12), dark, 0, 0.06, -0.18);
  } else if (kind === 'smg') {
    part(new THREE.BoxGeometry(0.08, 0.09, 0.3), steel, 0, 0, -0.05);
    part(new THREE.BoxGeometry(0.04, 0.04, 0.26), dark, 0, 0.02, -0.3);
    part(new THREE.BoxGeometry(0.05, 0.16, 0.06), dark, 0, -0.1, -0.08);
    part(new THREE.BoxGeometry(0.07, 0.07, 0.14), wood, 0, -0.015, 0.18);
  } else { // dmr
    part(new THREE.BoxGeometry(0.08, 0.09, 0.55), steel, 0, 0, -0.12);
    part(new THREE.BoxGeometry(0.04, 0.04, 0.5), dark, 0, 0.02, -0.55);
    part(new THREE.BoxGeometry(0.06, 0.06, 0.16), dark, 0, 0.07, -0.15);
    part(new THREE.BoxGeometry(0.07, 0.08, 0.2), wood, 0, -0.02, 0.24);
  }
  return group;
}

export function createViewmodel(camera) {
  const models = {};
  for (const kind of Object.keys(CFG.weapons)) models[kind] = buildModel(kind);
  let current = null;
  let currentKind = '';

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.17, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  function setWeapon(kind) {
    if (kind === currentKind) return;
    if (current) camera.remove(current);
    current = models[kind];
    currentKind = kind;
    current.position.set(0.24, -0.2, -0.42);
    camera.add(current);
  }

  function step(state, reloadTotal) {
    if (!current) return;
    current.position.z = -0.42 + state.kick;
    current.rotation.x = state.kick * 2.2;
    if (state.reloadLeft > 0 && reloadTotal > 0) {
      current.rotation.x = -0.55 * Math.min(1, (reloadTotal - state.reloadLeft) * 2);
    }
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
  }

  return { setWeapon, step };
}
