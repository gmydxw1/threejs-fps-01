// MERIDIAN DEPOT: a dusk rail yard, built from boxes. Two lanes (west and east),
// a mid connector, and one bomb site — the Relay tower — at the north end.
// Every box is a collider for players and bots and a surface a bullet stops on.
// No textures, no models: containers, crates, barrels, pipes and a gantry crane.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { CFG } from './config.js';

const WALL_H = 4.2;

export function createMap(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.04,
    });
  }

  const colliders = [];
  const shootables = [];
  const minimapRects = [];

  function box(w, h, d, x, y, z, material, minimap = true, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    // Flat ground markings (the rail strips) must not be colliders: a 6 cm
    // lip spanning the whole map would be an invisible wall across both lanes.
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    if (minimap) minimapRects.push({ x: x - w / 2, z: z - d / 2, w, d, color: PALETTE[material] });
    return mesh;
  }

  // Ground: ballast gravel with two rail strips running east-west.
  box(46, 0.4, 36, 0, -0.2, 0, 'surface', false);
  box(46, 0.06, 1.6, 0, 0.03, 4.5, 'hairline', false, false);
  box(46, 0.06, 1.6, 0, 0.03, -4.5, 'hairline', false, false);
  // Perimeter walls.
  box(46, WALL_H, 0.5, 0, WALL_H / 2, -17.25, 'surface');
  box(46, WALL_H, 0.5, 0, WALL_H / 2, 17.25, 'surface');
  box(0.5, WALL_H, 36, -22.75, WALL_H / 2, 0, 'surface');
  box(0.5, WALL_H, 36, 22.75, WALL_H / 2, 0, 'surface');

  // The Relay tower at the bomb site: a mast with a dish, the round's objective.
  const relay = new THREE.Group();
  relay.position.set(0, 0, -11.5);
  const mast = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6.5, 0.5), materials.rust);
  mast.position.y = 3.25;
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.18, 20), materials.ink);
  dish.position.set(0, 6.2, 0.4);
  dish.rotation.x = 0.7;
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 12, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.danger) }),
  );
  beacon.position.y = 6.7;
  relay.add(mast, dish, beacon);
  relay.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
  scene.add(relay);
  colliders.push(new THREE.Box3().setFromObject(mast));
  shootables.push(mast);
  minimapRects.push({ x: -0.6, z: -12.1, w: 1.2, d: 1.2, color: PALETTE.rust });

  // Spawn cover: two staggered containers at the south end break the 25 m
  // sightline from the Relay to the attacker spawn, so the round opens with
  // a corner to play around instead of a shooting gallery.
  box(6, 2.6, 2.5, -5, 1.3, 10.5, 'teal');
  box(6, 2.6, 2.5, 6, 1.3, 6.5, 'rust');
  // Mid cover: a tall container in the middle of mid splits the lane and gives
  // the attackers a piece of eye-level cover to advance behind. The mid route
  // weaves east of it (x 1..2.5 gap) and back west.
  box(2, 2.6, 2.5, 0, 1.3, -1, 'rust');
  box(1.4, 1.1, 1.4, -3, 0.55, 2, 'teal');
  box(6, 2.6, 2.5, -14, 1.3, 9, 'teal');
  box(6, 2.6, 2.5, -14, 1.3, 1, 'rust');
  box(2.5, 2.6, 6, -9.5, 1.3, -5, 'olive');
  box(6, 2.6, 2.5, 14, 1.3, 9, 'rust');
  box(6, 2.6, 2.5, 14, 1.3, 1, 'teal');
  box(2.5, 2.6, 6, 9.5, 1.3, -5, 'olive');
  box(5, 2.6, 2.5, -5, 1.3, 3.5, 'rust');
  box(5, 2.6, 2.5, 5, 1.3, -2.5, 'teal');
  // Stacked pair guarding the site approach.
  box(6, 2.6, 2.5, -7.5, 1.3, -9.5, 'teal');
  box(6, 2.6, 2.5, -7.5, 3.9, -9.5, 'rust');
  box(6, 2.6, 2.5, 7.5, 1.3, -9.5, 'olive');
  // Crates and barrels for close cover.
  box(1.4, 1.1, 1.4, -3.5, 0.55, 8, 'hairline');
  box(1.4, 1.1, 1.4, 3.5, 0.55, 8, 'hairline');
  box(1.2, 0.9, 1.2, -1.8, 0.45, -6.5, 'hairline');
  box(1.2, 0.9, 1.2, 1.8, 0.45, -6.5, 'hairline');
  box(1.2, 0.9, 1.2, -11, 0.45, -12.5, 'hairline');
  box(1.2, 0.9, 1.2, 11, 0.45, -12.5, 'hairline');
  const barrelGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.05, 14);
  // Barrels on the flanks only: the two that used to sit in the central
  // corridor (-2,12.5) and (2.5,12.8) blocked the spawn exit for bots and
  // the player, so they are gone.
  for (const [x, z] of [[-16.5, 5], [-16.5, 6.2], [16.5, -2], [16.5, -3.2]]) {
    const barrel = new THREE.Mesh(barrelGeo, materials.rust);
    barrel.position.set(x, 0.53, z);
    barrel.castShadow = true;
    barrel.receiveShadow = true;
    group.add(barrel);
    colliders.push(new THREE.Box3().setFromObject(barrel));
    shootables.push(barrel);
    minimapRects.push({ x: x - 0.42, z: z - 0.42, w: 0.84, d: 0.84, color: PALETTE.rust });
  }

  // Gantry crane over mid: two legs and a beam, a silhouette against the dusk sky.
  box(0.8, 9, 0.8, -6, 4.5, 0, 'hairline');
  box(0.8, 9, 0.8, 6, 4.5, 0, 'hairline');
  const beam = new THREE.Mesh(new THREE.BoxGeometry(13.5, 0.9, 1.1), materials.hairline);
  beam.position.set(0, 9.2, 0);
  beam.castShadow = true;
  group.add(beam);
  colliders.push(new THREE.Box3().setFromObject(beam));
  shootables.push(beam);

  // Shed at the south-east corner and oil tanks at the north-west, for silhouette.
  box(8, 3.4, 5, 17.5, 1.7, 13.5, 'surface');
  const tankGeo = new THREE.CylinderGeometry(1.6, 1.6, 3.2, 18);
  for (const [x, z] of [[-18.5, -13.5], [-15, -14.5]]) {
    const tank = new THREE.Mesh(tankGeo, materials.teal);
    tank.position.set(x, 1.6, z);
    tank.castShadow = true;
    tank.receiveShadow = true;
    group.add(tank);
    colliders.push(new THREE.Box3().setFromObject(tank));
    shootables.push(tank);
    minimapRects.push({ x: x - 1.6, z: z - 1.6, w: 3.2, d: 3.2, color: PALETTE.teal });
  }

  // Light: low dusk sun from the west, cool sky fill, and three sodium lamps.
  const sky = new THREE.HemisphereLight(new THREE.Color(0x8a97ad), new THREE.Color(0x2a2118), 0.9);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color(0xffb36b), 2.4);
  sun.position.set(-26, 12, 8);
  sun.target.position.set(4, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -28;
  sun.shadow.camera.right = 28;
  sun.shadow.camera.top = 28;
  sun.shadow.camera.bottom = -28;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const lamps = [];
  for (const [x, z] of [[-14, 5], [14, 5], [0, -8]]) {
    const lamp = new THREE.PointLight(new THREE.Color(PALETTE.accent), 22, 16, 1.8);
    lamp.position.set(x, 5.4, z);
    scene.add(lamp);
    lamps.push(lamp);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 5.4, 0.18), materials.hairline);
    post.position.set(x, 2.7, z);
    group.add(post);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 10, 8),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) }),
    );
    head.position.set(x, 5.5, z);
    group.add(head);
  }

  const site = CFG.site;
  return {
    colliders,
    shootables,
    group,
    minimapRects,
    relay,
    beacon,
    lamps,
    siteBox: new THREE.Box3(
      new THREE.Vector3(site.x - site.halfX, 0, site.z - site.halfZ),
      new THREE.Vector3(site.x + site.halfX, 2.5, site.z + site.halfZ),
    ),
    spawns: {
      attack: [[-4, 14], [-1.5, 14.5], [1.5, 14.5], [4, 14]],
      defend: [[-5, -13], [-1.5, -14], [1.5, -14], [5, -13]],
    },
    // Routes: every waypoint stands on open ground and every leg clears the
    // boxes between its ends — the round-1 routes did not. Two waypoints sat
    // inside colliders (west/east (±14,2) inside the lane containers,
    // mid (-1.75,-6) inside a crate, west/east (±9,-10) inside the site
    // stacks), so flank attackers stalled on a container face and never
    // reached the Relay; only the mid attacker ever got close. The flank
    // routes now cut east/west across mid at z=0 (south of the olive
    // containers, clear of the gantry legs) and join the mid tail through
    // the central gap, so all three lanes actually arrive at the site.
    routes: {
      west: [[-5, 13], [-10, 13], [-10, 8], [-10, 3], [-10, 0], [-7, -1], [-3, -4], [-4, -8], [0, -10.5]],
      east: [[5, 13], [10, 13], [10, 8], [10, 3], [10, 0], [7, -1], [2, -5], [4, -8], [0, -10.5]],
      mid: [[0, 13], [0, 6], [1.75, 2], [1.75, -4], [-4, -8], [0, -10.5]],
    },
    holds: [[-4, -9], [4, -9], [-11, -7], [11, -7], [-2, -13.5], [2, -13.5]],
  };
}
