// Movement: acceleration, friction, gravity, crouch and jump, resolved as a box
// against the world's colliders one axis at a time, so a wall never swallows a
// body. The same mover drives the player and every bot, so bots collide with the
// map exactly the way the player does.
import * as THREE from 'three';
import { CFG } from './config.js';

const P = CFG.player;

export function createBody(x, z, yaw = 0) {
  return {
    position: new THREE.Vector3(x, 0, z),
    velocity: new THREE.Vector3(),
    yaw,
    pitch: 0,
    eye: P.standEye,
    onGround: true,
    crouching: false,
    height: P.standHeight,
  };
}

const probe = new THREE.Box3();
const wish = new THREE.Vector3();

function overlaps(body, x, y, z, colliders, lift) {
  probe.min.set(x - P.radius, y + lift, z - P.radius);
  probe.max.set(x + P.radius, y + body.height - lift, z + P.radius);
  for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
  return null;
}

// move: { fwd, strafe, jump, crouch, speed } — fwd/strafe are -1..1 wish directions
// relative to the body's yaw. Reuses one probe and one wish vector: no allocation.
export function moveBody(body, dt, move, colliders) {
  const crouching = !!move.crouch;
  if (crouching && !body.crouching) {
    body.crouching = true;
    body.height = P.crouchHeight;
  } else if (!crouching && body.crouching && !overlaps(body, body.position.x, body.position.y, body.position.z, colliders, 0.02)) {
    body.crouching = false;
    body.height = P.standHeight;
  }
  const eyeTarget = body.crouching ? P.crouchEye : P.standEye;
  body.eye += (eyeTarget - body.eye) * Math.min(1, dt * 12);

  wish.set(0, 0, 0);
  if (move.fwd || move.strafe) {
    const sin = Math.sin(body.yaw);
    const cos = Math.cos(body.yaw);
    wish.set(-sin * move.fwd + cos * move.strafe, 0, -cos * move.fwd - sin * move.strafe).normalize();
  }
  const speed = move.speed ?? (body.crouching ? P.crouchSpeed : P.walkSpeed);
  const blend = Math.min(1, (body.onGround ? P.groundAccel : P.airAccel) * dt / speed);
  body.velocity.x += (wish.x * speed - body.velocity.x) * blend;
  body.velocity.z += (wish.z * speed - body.velocity.z) * blend;
  if (body.onGround && !wish.lengthSq()) {
    const damp = Math.max(0, 1 - P.friction * dt);
    body.velocity.x *= damp;
    body.velocity.z *= damp;
  }

  if (move.jump && body.onGround) {
    body.velocity.y = P.jumpSpeed;
    body.onGround = false;
  }
  body.velocity.y -= P.gravity * dt;

  const nextX = body.position.x + body.velocity.x * dt;
  if (!overlaps(body, nextX, body.position.y, body.position.z, colliders, 0.04)) body.position.x = nextX;
  else body.velocity.x = 0;
  const nextZ = body.position.z + body.velocity.z * dt;
  if (!overlaps(body, body.position.x, body.position.y, nextZ, colliders, 0.04)) body.position.z = nextZ;
  else body.velocity.z = 0;

  body.position.y += body.velocity.y * dt;
  body.onGround = false;
  const hit = overlaps(body, body.position.x, body.position.y, body.position.z, colliders, 0);
  if (hit && body.velocity.y <= 0) {
    body.position.y = hit.max.y;
    body.velocity.y = 0;
    body.onGround = true;
  } else if (hit) {
    body.position.y = hit.min.y - body.height;
    body.velocity.y = 0;
  }
  if (body.position.y < 0) {
    body.position.y = 0;
    body.velocity.y = 0;
    body.onGround = true;
  }
  body.velocity.y = Math.max(-30, body.velocity.y);
}

export function createPlayer(colliders, x, z, yaw) {
  const body = createBody(x, z, yaw);

  function look(dx, dy, sensitivity = 0.0022) {
    body.yaw -= dx * sensitivity;
    body.pitch = Math.max(-1.45, Math.min(1.45, body.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    body.pitch = Math.min(1.45, body.pitch + pitchKick);
    body.yaw += yawKick;
  }

  function step(dt, keys) {
    moveBody(body, dt, {
      fwd: (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0),
      strafe: (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0),
      jump: keys.has('Space'),
      crouch: keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC'),
    }, colliders);
  }

  return {
    state: body,
    step,
    look,
    recoil,
    groundSpeed() {
      return Math.hypot(body.velocity.x, body.velocity.z);
    },
  };
}
