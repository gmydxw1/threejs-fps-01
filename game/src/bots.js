// The bots: three teammates and four opponents, each a body that walks the map's
// routes, holds the site, and fights. A state machine — hold, patrol, rotate,
// engage, plant, defuse — driven by what they see and hear. They react after a
// human-like delay, fire in bursts, reload, crouch and stop to aim, so a fight
// against them reads as tactics, not target practice.
import * as THREE from 'three';
import { CFG } from './config.js';
import { PALETTE } from './palette.js';
import { createBody, moveBody } from './player.js';

const B = CFG.bots;
const fwdTmp = new THREE.Vector3();
const dirTmp = new THREE.Vector3();
const NAMES = {
  nightwatch: ['Ash', 'Bram', 'Cole'],
  ravens: ['Vex', 'Kite', 'Rook', 'Sable'],
};

function buildMesh(team) {
  const group = new THREE.Group();
  const teamColor = team === 'nightwatch' ? PALETTE.nightwatch : PALETTE.ravens;
  const torsoMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor), roughness: 0.7, metalness: 0.05 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85 });
  const skinMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0xc9a184), roughness: 0.7 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.3), torsoMat);
  torso.position.y = 1.0;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 10), skinMat);
  head.position.y = 1.53;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 8, 0, Math.PI * 2, 0, 1.1), torsoMat);
  helmet.position.y = 1.55;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.22), darkMat);
  legL.position.set(-0.14, 0.31, 0);
  const legR = legL.clone();
  legR.position.x = 0.14;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.55), darkMat);
  gun.position.set(0.22, 1.15, -0.25);
  group.add(torso, head, helmet, legL, legR, gun);
  group.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
  return { group, torso, head, helmet, legL, legR };
}

export function createBots(scene, colliders) {
  const bots = [];
  const hitMeshes = [];
  let now = 0;

  function spawn(team, index, x, z, yaw, weapon, role, route) {
    const body = createBody(x, z, yaw);
    const mesh = buildMesh(team);
    scene.add(mesh.group);
    const bot = {
      id: `${team}-${index}`,
      name: NAMES[team][index % NAMES[team].length],
      team,
      role, // 'attack' | 'defend'
      route: route ? route.map(([rx, rz]) => new THREE.Vector2(rx, rz)) : [],
      routeIndex: 0,
      hold: null,
      body,
      mesh,
      eye: new THREE.Vector3(),
      weapon,
      mag: CFG.weapons[weapon].mag,
      cooldown: 0,
      reloadLeft: 0,
      health: CFG.player.health,
      alive: true,
      state: 'patrol',
      target: null,
      lastSeen: null,
      reaction: 0,
      burstLeft: 0,
      burstPause: 0,
      hearPos: null,
      hearAt: -99,
      perceiveAt: Math.random() * 0.15,
      scanYaw: yaw,
      crouchAim: false,
      stepAt: 0,
      fall: 0,
    };
    mesh.torso.userData = { bot, part: 'torso' };
    mesh.head.userData = { bot, part: 'head' };
    mesh.helmet.userData = { bot, part: 'head' };
    hitMeshes.push(mesh.torso, mesh.head, mesh.helmet);
    bots.push(bot);
    return bot;
  }

  function eyePos(bot) {
    return bot.eye;
  }

  function turnToward(bot, targetYaw, dt, rate = 5) {
    let diff = targetYaw - bot.body.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const step = Math.max(-rate * dt, Math.min(rate * dt, diff));
    bot.body.yaw += step;
    return Math.abs(diff) < 0.08;
  }

  function moveToward(bot, tx, tz, dt, speed = B.moveSpeed) {
    const dx = tx - bot.body.position.x;
    const dz = tz - bot.body.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.5) return true;
    const wantYaw = Math.atan2(-dx, -dz);
    turnToward(bot, wantYaw, dt, 6);
    moveBody(bot.body, dt, { fwd: 1, strafe: 0, jump: false, crouch: false, speed }, colliders);
    return false;
  }

  function damage(bot, amount) {
    if (!bot.alive) return false;
    bot.health -= amount;
    if (bot.health > 0) return false;
    bot.alive = false;
    bot.state = 'dead';
    bot.fall = 0;
    return true;
  }

  function hear(bot, pos, radius) {
    if (!bot.alive) return;
    const dx = pos.x - bot.body.position.x;
    const dz = pos.z - bot.body.position.z;
    if (dx * dx + dz * dz > radius * radius) return;
    bot.hearPos = pos.clone();
    bot.hearAt = now;
  }

  // One fixed step. ctx: { player, canSee, shoot, onStep, bombPlanted, roundLive }.
  function step(dt, ctx) {
    now += dt;
    for (const bot of bots) {
      if (!bot.alive) {
        bot.fall = Math.min(1, bot.fall + dt / 0.4);
        bot.mesh.group.rotation.x = -bot.fall * 1.45;
        continue;
      }
      bot.eye.set(bot.body.position.x, bot.body.position.y + bot.body.eye, bot.body.position.z);
      // Scripted capture mode (?shot=): bots stand and scan, never perceive,
      // hear or shoot — the frame is staged, like the starter's shot modes.
      if (ctx.scripted) {
        bot.scanYaw += dt * 0.3;
        turnToward(bot, bot.scanYaw, dt, 1);
        moveBody(bot.body, dt, { fwd: 0, strafe: 0, jump: false, crouch: false }, colliders);
        const m0 = bot.mesh;
        m0.group.position.set(bot.body.position.x, bot.body.position.y, bot.body.position.z);
        m0.group.rotation.y = bot.body.yaw;
        continue;
      }
      bot.cooldown = Math.max(0, bot.cooldown - dt);
      bot.reloadLeft = Math.max(0, bot.reloadLeft - dt);
      if (bot.reloadLeft === 0 && bot.mag === 0) {
        bot.mag = CFG.weapons[bot.weapon].mag;
      }

      // Perception, staggered so not every bot thinks on the same tick.
      bot.perceiveAt -= dt;
      if (bot.perceiveAt <= 0) {
        bot.perceiveAt = 0.15;
        const prevTarget = bot.target;
        bot.target = null;
        let best = 1e9;
        const candidates = [];
        // The player is only a target for the other team: teammates never
        // engage the player (a friendly bot shooting its own player is a bug,
        // not tactics).
        if (ctx.player.alive && ctx.player.team !== bot.team) candidates.push({ kind: 'player', pos: ctx.player.pos, eye: ctx.player.eye, bot: null });
        for (const other of bots) {
          if (other.alive && other.team !== bot.team) {
            candidates.push({ kind: 'bot', pos: other.body.position, eye: eyePos(other), bot: other });
          }
        }
        for (const c of candidates) {
          const d = eyePos(bot).distanceTo(c.eye);
          if (d > B.seeDistance) continue;
          // Field of view: a bot only sees what is in front of it, not what is
          // behind its back.
          fwdTmp.set(-Math.sin(bot.body.yaw), 0, -Math.cos(bot.body.yaw));
          dirTmp.copy(c.eye).sub(eyePos(bot)).normalize();
          if (fwdTmp.dot(dirTmp) < 0.25) continue;
          // Target stickiness: the current target counts as 30% closer, so
          // defenders do not all snap to the closest attacker the instant one
          // pushes ahead — fire spreads across the attacking team.
          const isCurrent = prevTarget && c.kind === prevTarget.kind && c.bot === prevTarget.bot;
          const effD = isCurrent ? d * 0.7 : d;
          if (effD < best && ctx.canSee(eyePos(bot), c.eye)) {
            best = effD;
            bot.target = c;
            bot.lastSeen = c.eye.clone();
            // A new target costs a fresh reaction: switching aim is not instant.
            if (!isCurrent) {
              bot.reaction = B.reactionMin + Math.random() * (B.reactionMax - B.reactionMin);
              bot.crouchAim = Math.random() < 0.35;
            }
          }
        }
        if (!bot.target) bot.lastSeen = null;
      }

      const attacking = ctx.attackingTeam === bot.team;
      const bombPlanted = ctx.bombPlanted;

      // Objective over gunfight: an attacker standing on the site plants the
      // bomb, a defender standing on a planted site defuses it — instead of
      // trading shots. Without this the plant is unreachable in organic play
      // (0 plants in 6 observed rounds, round 2): a live defender always
      // keeps the attackers in 'engage', and the round ends the instant the
      // last defender dies, so the quiet moment the old code waited for
      // never comes. The planter crouches and stands still while the team
      // covers them; the plant still fails if they are shot first.
      if (!bombPlanted && attacking && ctx.inSite(bot.body.position)) {
        bot.state = 'plant';
        moveBody(bot.body, dt, { fwd: 0, strafe: 0, jump: false, crouch: true }, colliders);
      } else if (bombPlanted && !attacking && ctx.inSite(bot.body.position)) {
        bot.state = 'defuse';
        moveBody(bot.body, dt, { fwd: 0, strafe: 0, jump: false, crouch: true }, colliders);
      } else if (bot.target && bot.lastSeen) {
        bot.state = 'engage';
        const aim = bot.lastSeen;
        const distToTarget = bot.body.position.distanceTo(aim);
        const wantYaw = Math.atan2(-(aim.x - bot.body.position.x), -(aim.z - bot.body.position.z));
        if (attacking && distToTarget >= B.engageRange) {
          // Too far to shoot: close the distance instead of standing in a
          // standoff where nobody ever fires. Defenders hold their ground
          // and let the attacker come to them.
          moveToward(bot, aim.x, aim.z, dt);
        } else {
          // Stop to aim: a bot that plants its feet shoots straighter, like the player.
          turnToward(bot, wantYaw, dt, 7);
          moveBody(bot.body, dt, { fwd: 0, strafe: 0, jump: false, crouch: bot.crouchAim }, colliders);
        }
        bot.reaction -= dt;
        // Hold fire beyond engage range: the bot tracks the target and aims,
        // but only opens fire once the fight is actually on.
        if (bot.reaction <= 0 && bot.reloadLeft === 0 && distToTarget < B.engageRange) {
          if (bot.burstLeft <= 0) {
            bot.burstPause -= dt;
            if (bot.burstPause <= 0) {
              bot.burstLeft = B.burstMin + Math.floor(Math.random() * (B.burstMax - B.burstMin + 1));
              bot.burstPause = B.burstPauseMin + Math.random() * (B.burstPauseMax - B.burstPauseMin);
            }
          } else if (bot.cooldown <= 0) {
            if (bot.mag <= 0) {
              bot.reloadLeft = CFG.weapons[bot.weapon].reloadTime;
            } else {
              bot.mag -= 1;
              bot.cooldown = CFG.weapons[bot.weapon].fireGap * 1.15;
              bot.burstLeft -= 1;
              ctx.shoot(bot, bot.lastSeen);
            }
          }
        }
      } else if (bombPlanted && bot.team !== ctx.attackingTeam) {
        // Defenders rotate to the planted bomb; attackers fall back to guard it.
        bot.state = bombPlanted && attacking ? 'hold' : 'rotate';
        if (!attacking) {
          const site = ctx.site;
          if (moveToward(bot, site.x, site.z, dt)) bot.state = 'defuse';
        }
      } else if (bot.hearPos && now - bot.hearAt < 3) {
        bot.state = 'rotate';
        if (moveToward(bot, bot.hearPos.x, bot.hearPos.z, dt)) {
          bot.hearPos = null;
          bot.state = 'hold';
        }
      } else if (attacking) {
        // Attackers walk their route to the site, then plant.
        bot.state = 'patrol';
        const wp = bot.route[bot.routeIndex];
        if (wp) {
          if (moveToward(bot, wp.x, wp.y, dt)) {
            bot.routeIndex = Math.min(bot.routeIndex + 1, bot.route.length - 1);
          }
        }
        if (bot.routeIndex >= bot.route.length - 1 && ctx.inSite(bot.body.position)) bot.state = 'plant';
      } else {
        // Defenders hold a post and scan, drifting between holds.
        bot.state = 'hold';
        if (bot.hold) {
          const dx = bot.hold[0] - bot.body.position.x;
          const dz = bot.hold[1] - bot.body.position.z;
          if (Math.hypot(dx, dz) > 0.8) moveToward(bot, bot.hold[0], bot.hold[1], dt, B.moveSpeed * 0.8);
          else {
            bot.scanYaw += dt * 0.5;
            turnToward(bot, bot.scanYaw, dt, 1.2);
          }
        }
        moveBody(bot.body, dt, { fwd: 0, strafe: 0, jump: false, crouch: false }, colliders);
      }

      // Footsteps: bots make sound the player (and other bots) can hear.
      const speed = Math.hypot(bot.body.velocity.x, bot.body.velocity.z);
      if (speed > 1 && now - bot.stepAt > 0.45) {
        bot.stepAt = now;
        ctx.onStep(bot.body.position);
      }

      // Sync the mesh to the body.
      const m = bot.mesh;
      m.group.position.set(bot.body.position.x, bot.body.position.y, bot.body.position.z);
      m.group.rotation.y = bot.body.yaw;
      const crouchDrop = bot.body.crouching ? 0.35 : 0;
      m.torso.position.y = 1.0 - crouchDrop;
      m.head.position.y = 1.53 - crouchDrop;
      m.helmet.position.y = 1.55 - crouchDrop;
    }
  }

  function resetRound(teamSpawns, assignments) {
    // assignments: [{ team, weapon, role, route, hold, spawn }]
    for (let i = 0; i < bots.length; i += 1) {
      const bot = bots[i];
      const a = assignments[i];
      bot.team = a.team;
      bot.role = a.role;
      bot.route = a.route ? a.route.map(([x, z]) => new THREE.Vector2(x, z)) : [];
      bot.routeIndex = 0;
      bot.hold = a.hold || null;
      bot.weapon = a.weapon;
      bot.mag = CFG.weapons[a.weapon].mag;
      bot.body.position.set(a.spawn[0], 0, a.spawn[1]);
      bot.body.velocity.set(0, 0, 0);
      bot.body.yaw = a.yaw ?? 0;
      bot.body.pitch = 0;
      bot.health = CFG.player.health;
      bot.alive = true;
      bot.state = 'patrol';
      bot.target = null;
      bot.lastSeen = null;
      bot.hearPos = null;
      bot.fall = 0;
      bot.mesh.group.rotation.set(0, bot.body.yaw, 0);
      bot.mesh.group.visible = true;
      // Recolour the torso to the new team.
      const color = a.team === 'nightwatch' ? PALETTE.nightwatch : PALETTE.ravens;
      bot.mesh.torso.material.color.set(new THREE.Color(color));
    }
  }

  return { bots, hitMeshes, spawn, step, damage, hear, eyePos, resetRound };
}
