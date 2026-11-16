// The simulation: one fixed 60 Hz step, kept apart from rendering. It owns the
// round state machine (buy → live → planted → round end → next round), the
// player, the bots, the bomb, the grenades and the money — all state in one place,
// so a round can be replayed from the same numbers.
import * as THREE from 'three';
import { CFG } from './config.js';
import { PALETTE } from './palette.js';
import { createPlayer } from './player.js';
import { createArsenal } from './weapons.js';
import { createEconomy } from './economy.js';
import { createBomb } from './bomb.js';
import { createGrenades } from './grenades.js';
import { createBots } from './bots.js';

const FIXED = 1 / 60;
const E = CFG.economy;

export function createSim(deps) {
  const { scene, camera, map, hud, audio, tracers, onBuyClosed } = deps;
  const raycaster = new THREE.Raycaster();
  const tmpDir = new THREE.Vector3();
  const tmpPoint = new THREE.Vector3();

  const player = createPlayer(map.colliders, 0, 14, 0);
  const arsenal = createArsenal();
  const economy = createEconomy();
  const bomb = createBomb(scene, map.siteBox);
  const grenades = createGrenades(scene, map.colliders);
  const bots = createBots(scene, map.colliders);

  // Seven bots: three Nightwatch teammates, four Ravens opponents.
  for (let i = 0; i < 3; i += 1) bots.spawn('nightwatch', i, -4 + i * 2, 14, 0, 'rifle', 'attack', map.routes.mid);
  for (let i = 0; i < 4; i += 1) bots.spawn('ravens', i, -5 + i * 3, -13, Math.PI, 'rifle', 'defend', map.routes.mid);

  const state = {
    phase: 'buy', // buy | live | planted | roundEnd | matchEnd
    round: 1,
    score: { nightwatch: 0, ravens: 0 },
    buyLeft: CFG.round.buySeconds,
    roundLeft: CFG.round.roundSeconds,
    roundEndLeft: 0,
    matchEndLeft: 0,
    playerHp: CFG.player.health,
    playerAlive: true,
    playerAttacking: true,
    frozen: true,
    scripted: false, // ?shot= capture mode: bots stand and scan, never shoot
    lastKiller: '',
    lastDamage: null, // { by, amount, at } — the most recent hit on the player
    roundWinner: '',
    elapsed: 0,
    seenEnemies: [], // { x, z, at } for the minimap
  };

  const shootables = map.shootables;
  const allShootables = shootables.concat(bots.hitMeshes);
  const playerEye = new THREE.Vector3();
  const grenadeTargetTmp = new THREE.Vector3();
  const muzzleTmp = new THREE.Vector3();
  const originTmp = new THREE.Vector3();
  const headTmp = new THREE.Vector3();
  const chestTmp = new THREE.Vector3();
  const seeDir = new THREE.Vector3();
  const seeCenter = new THREE.Vector3();
  const seeClosest = new THREE.Vector3();

  // --- shooting -------------------------------------------------------------
  const projTmp = new THREE.Vector3();
  // Ray vs sphere, correctly: t is the distance ALONG the ray (not the
  // perpendicular distance — Ray.distanceToPoint returns the latter, and using
  // it as an along-ray distance lets shots hit through walls). Returns t or -1.
  function rayHitSphere(origin, dir, center, radius, maxDist) {
    projTmp.copy(center).sub(origin);
    const t = projTmp.dot(dir);
    if (t < 0 || t > maxDist) return -1;
    const perpSq = projTmp.lengthSq() - t * t;
    return perpSq < radius * radius ? t : -1;
  }

  function resolveShot(origin, dir, range, shooterBot) {
    raycaster.set(origin, dir);
    raycaster.far = range;
    const hits = raycaster.intersectObjects(allShootables, false);
    let best = hits.length ? hits[0] : null;
    let bestDist = best ? best.distance : range;
    // The player is hit-tested analytically: a chest sphere and a head sphere.
    if (state.playerAlive && shooterBot) {
      chestTmp.set(player.state.position.x, player.state.position.y + 1.1, player.state.position.z);
      headTmp.set(player.state.position.x, player.state.position.y + 1.53, player.state.position.z);
      const tHead = rayHitSphere(origin, dir, headTmp, 0.16, bestDist);
      const tChest = rayHitSphere(origin, dir, chestTmp, 0.38, bestDist);
      if (tHead >= 0 && (tChest < 0 || tHead <= tChest)) {
        return { kind: 'player', part: 'head', point: headTmp, dist: tHead };
      }
      if (tChest >= 0) {
        return { kind: 'player', part: 'torso', point: chestTmp, dist: tChest };
      }
    }
    if (!best) {
      tmpPoint.copy(origin).addScaledVector(dir, range);
      return { kind: 'none', point: tmpPoint, dist: range };
    }
    if (best.object.userData.bot) {
      return { kind: 'bot', bot: best.object.userData.bot, part: best.object.userData.part || 'torso', point: best.point, dist: best.distance };
    }
    return { kind: 'world', point: best.point, dist: best.distance };
  }

  function applyDamageToPlayer(amount, fromPos, shooterName) {
    if (!state.playerAlive) return;
    state.playerHp -= amount;
    state.lastDamage = { by: shooterName || '', amount: Math.round(amount), at: +state.elapsed.toFixed(2) };
    audio.hurt();
    const dx = fromPos.x - player.state.position.x;
    const dz = fromPos.z - player.state.position.z;
    const angle = Math.atan2(dx, dz) * 180 / Math.PI - player.state.yaw * 180 / Math.PI;
    hud.damageFrom(angle);
    if (state.playerHp <= 0) {
      state.playerHp = 0;
      state.playerAlive = false;
      state.lastKiller = shooterName || '';
      hud.showOverlay('dead');
      if (document.pointerLockElement) document.exitPointerLock();
      checkElimination();
    }
  }

  // killer: 'YOU' when the player lands it (pays money), a bot name for bot kills,
  // null when nobody gets credit (a grenade). The feed only names real killers.
  function applyDamageToBot(bot, amount, part, killer) {
    if (!bot.alive) return;
    const killed = bots.damage(bot, amount);
    const byPlayer = killer === 'YOU';
    if (byPlayer) hud.hitMarker(killed, killed ? 400 : 90);
    if (killed) {
      const headshot = part === 'head';
      if (killer) hud.killfeed(killer, bot.name, headshot);
      if (byPlayer) {
        economy.award(headshot ? E.headshot : E.kill);
        audio.kill();
      }
      checkElimination();
    } else if (byPlayer) {
      audio.hit(part === 'head');
    }
  }

  function checkElimination() {
    if (state.phase !== 'live' && state.phase !== 'planted') return;
    const aliveN = bots.bots.filter((b) => b.alive && b.team === 'nightwatch').length + (state.playerAlive ? 1 : 0);
    const aliveR = bots.bots.filter((b) => b.alive && b.team === 'ravens').length;
    const planted = bomb.state.phase === 'planted' || bomb.state.phase === 'defusing';
    if (aliveN === 0 && !planted) endRound('ravens', 'Ravens wipe out Nightwatch');
    else if (aliveR === 0 && !planted) endRound('nightwatch', 'Nightwatch wipe out the Ravens');
    else if (aliveR === 0 && planted) endRound('nightwatch', 'No Ravens left to defuse');
    // Attackers all dead with a planted bomb: the round plays on until it blows or is defused.
  }

  // --- sounds the bots hear --------------------------------------------------
  function emitSound(pos, radius) {
    for (const bot of bots.bots) bots.hear(bot, pos, radius);
  }

  function canSee(from, to) {
    const dir = seeDir.copy(to).sub(from);
    const dist = dir.length();
    if (dist < 0.01) return true;
    dir.normalize();
    raycaster.set(from, dir);
    raycaster.far = dist;
    if (raycaster.intersectObjects(shootables, false).length) return false;
    // Smoke blocks sight.
    for (const s of grenades.smokes) {
      seeCenter.copy(s.pos).sub(from);
      const along = seeCenter.dot(dir);
      if (along < 0 || along > dist) continue;
      seeClosest.copy(from).addScaledVector(dir, along);
      if (seeClosest.distanceTo(s.pos) < s.radius) return false;
    }
    return true;
  }

  // --- bot shooting ----------------------------------------------------------
  function botShoot(bot, targetEye) {
    const origin = bots.eyePos(bot);
    const def = CFG.weapons[bot.weapon];
    const dist = origin.distanceTo(targetEye);
    // Quadratic falloff: close fights stay deadly, long-range fire is
    // suppressive — a bot should not melt a player across the whole yard.
    const err = CFG.bots.aimError * (1 + (dist / CFG.bots.aimDistance) ** 2) * (CFG.bots.aimErrorByWeapon[bot.weapon] ?? 1);
    tmpDir.copy(targetEye).sub(origin).normalize();
    tmpDir.x += (Math.random() * 2 - 1) * err;
    tmpDir.y += (Math.random() * 2 - 1) * err;
    tmpDir.z += (Math.random() * 2 - 1) * err;
    tmpDir.normalize();
    const muzzle = muzzleTmp.copy(origin).addScaledVector(tmpDir, 0.6);
    const hit = resolveShot(origin, tmpDir, def.range, bot);
    tracers.fire(muzzle, hit.point);
    if (hit.kind === 'world') tracers.impact(hit.point);
    if (hit.kind === 'player') {
      const dmg = def.damage * (hit.part === 'head' ? def.headMult : 1) * (1 - Math.min(0.4, dist / 200));
      applyDamageToPlayer(dmg, origin, bot.name);
    } else if (hit.kind === 'bot' && hit.bot !== bot && hit.bot.team !== bot.team) {
      const dmg = def.damage * (hit.part === 'head' ? def.headMult : hit.part === 'legs' ? def.legMult : 1);
      applyDamageToBot(hit.bot, dmg, hit.part, bot.name);
    }
    // A teammate in the line of fire stops the shot but takes no damage:
    // bots never team-kill.
    audio.shot(bot.weapon);
    emitSound(origin, CFG.bots.hearGunshot);
  }

  // --- player shooting -------------------------------------------------------
  function playerShoot() {
    if ((state.phase !== 'live' && state.phase !== 'planted') || state.frozen || !state.playerAlive) return;
    const def = arsenal.def();
    if (arsenal.state.mag <= 0) {
      audio.dryFire();
      return;
    }
    const offset = arsenal.pullTrigger();
    if (!offset) return;
    camera.getWorldDirection(tmpDir);
    const spread = arsenal.spread(player.groundSpeed(), player.state.crouching, !player.state.onGround);
    tmpDir.x += (Math.random() * 2 - 1) * spread;
    tmpDir.y += (Math.random() * 2 - 1) * spread;
    tmpDir.z += (Math.random() * 2 - 1) * spread;
    tmpDir.normalize();
    const origin = originTmp.copy(camera.position);
    const hit = resolveShot(origin, tmpDir, def.range, null);
    const muzzle = muzzleTmp.copy(origin).addScaledVector(tmpDir, 0.5);
    tracers.fire(muzzle, hit.point);
    if (hit.kind === 'world') tracers.impact(hit.point);
    if (hit.kind === 'bot') {
      const dmg = def.damage * (hit.part === 'head' ? def.headMult : hit.part === 'legs' ? def.legMult : 1);
      applyDamageToBot(hit.bot, dmg, hit.part, 'YOU');
    }
    player.recoil(offset[0], offset[1]);
    audio.shot(state.current);
    emitSound(origin, CFG.bots.hearGunshot);
  }

  // --- rounds ----------------------------------------------------------------
  function attackingTeam() {
    return state.round % 2 === 1 ? 'nightwatch' : 'ravens';
  }

  function setupRound(n) {
    state.round = n;
    state.playerAttacking = attackingTeam() === 'nightwatch';
    state.phase = 'buy';
    state.buyLeft = CFG.round.buySeconds;
    state.roundLeft = CFG.round.roundSeconds;
    state.playerHp = CFG.player.health;
    state.playerAlive = true;
    state.frozen = true;
    bomb.reset();
    grenades.clear();
    arsenal.resetRound();
    const atk = attackingTeam();
    const spawn = state.playerAttacking ? map.spawns.attack[0] : map.spawns.defend[0];
    player.state.position.set(spawn[0], 0, spawn[1]);
    player.state.velocity.set(0, 0, 0);
    player.state.yaw = state.playerAttacking ? 0 : Math.PI;
    player.state.pitch = 0;
    const assignments = [];
    const routes = [map.routes.west, map.routes.east, map.routes.mid];
    // Friendlies: 3 bots. Enemies: 4 bots.
    for (let i = 0; i < 3; i += 1) {
      const team = 'nightwatch';
      const isAtk = atk === team;
      assignments.push({
        team, role: isAtk ? 'attack' : 'defend',
        weapon: ['rifle', 'smg', 'rifle'][i],
        route: isAtk ? routes[i % 3] : null,
        hold: isAtk ? null : map.holds[i],
        spawn: isAtk ? map.spawns.attack[i + 1] : map.spawns.defend[i + 1],
        yaw: isAtk ? 0 : Math.PI,
      });
    }
    for (let i = 0; i < 4; i += 1) {
      const team = 'ravens';
      const isAtk = atk === team;
      assignments.push({
        team, role: isAtk ? 'attack' : 'defend',
        weapon: ['rifle', 'smg', 'rifle', 'dmr'][i],
        route: isAtk ? routes[i % 3] : null,
        hold: isAtk ? null : map.holds[(i + 3) % map.holds.length],
        spawn: isAtk ? map.spawns.attack[(i + 1) % 4] : map.spawns.defend[(i + 1) % 4],
        yaw: isAtk ? 0 : Math.PI,
      });
    }
    bots.resetRound(null, assignments);
    hud.setScore(state.score.nightwatch, state.score.ravens, state.round);
    hud.setTeam(state.playerAttacking);
    hud.setHealth(state.playerHp);
    hud.setMoney(economy.state.money);
    hud.setAmmo(arsenal.state.mag, arsenal.state.reserve);
    hud.hideBomb();
    openBuy();
  }

  function buyItems() {
    const items = [];
    const keys = ['Digit1', 'Digit2', 'Digit3', 'Digit4'];
    for (const [i, key] of Object.keys(CFG.weapons).entries()) {
      const w = CFG.weapons[key];
      items.push({ key, keyLabel: String(i + 1), name: `${w.name} — ${w.damage} dmg`, price: w.price, owned: !!arsenal.state.owned[key] });
    }
    items.push({ key: 'frag', keyLabel: '5', name: `Frag Grenade ×${arsenal.state.frags}`, price: CFG.grenades.frag.price, owned: false });
    items.push({ key: 'smoke', keyLabel: '6', name: `Smoke Grenade ×${arsenal.state.smokes}`, price: CFG.grenades.smoke.price, owned: false });
    items.push({ key: 'kit', keyLabel: '7', name: 'Defuse Kit (2.5s defuse)', price: CFG.defuseKitPrice, owned: arsenal.state.hasKit });
    return items;
  }

  function openBuy() {
    hud.showBuy(economy.state.money, buyItems(), (key) => buy(key));
  }

  function buy(key) {
    if (state.phase !== 'buy') return;
    if (key === 'frag' || key === 'smoke') {
      const price = CFG.grenades[key].price;
      if (!economy.spend(price)) { audio.denied(); return; }
      if (key === 'frag') arsenal.state.frags += 1;
      else arsenal.state.smokes += 1;
      audio.buy();
    } else if (key === 'kit') {
      if (arsenal.state.hasKit) return;
      if (!economy.spend(CFG.defuseKitPrice)) { audio.denied(); return; }
      arsenal.state.hasKit = true;
      audio.buy();
    } else {
      const price = arsenal.buy(key, economy.state.money);
      if (price < 0) { audio.denied(); return; }
      economy.spend(price);
      arsenal.switchTo(key);
      audio.buy();
    }
    hud.setMoney(economy.state.money);
    openBuy();
  }

  function closeBuy() {
    hud.hideBuy();
  }

  // The buy phase ends: the round goes live and the pointer locks for the fight.
  function deploy() {
    if (state.phase !== 'buy') return;
    closeBuy();
    state.phase = 'live';
    state.frozen = false;
    if (onBuyClosed) onBuyClosed();
  }

  function endRound(winner, reason) {
    if (state.phase === 'roundEnd' || state.phase === 'matchEnd') return;
    state.phase = 'roundEnd';
    state.roundWinner = winner;
    state.roundEndLeft = CFG.round.roundEndSeconds;
    state.score[winner] += 1;
    const won = winner === 'nightwatch';
    economy.settleRound(won);
    arsenal.keepOrDrop(state.playerAlive);
    hud.setScore(state.score.nightwatch, state.score.ravens, state.round);
    hud.setMoney(economy.state.money);
    hud.hideBomb();
    hud.banner(won ? 'ROUND WON' : 'ROUND LOST', reason, 3600);
    audio.horn(won);
    hud.showOverlay('roundEnd', { copy: `${reason}. Nightwatch ${state.score.nightwatch} — ${state.score.ravens} Ravens. ${won ? `+$${E.win}` : 'Loss bonus paid'}.` });
  }

  function nextRound() {
    hud.hideOverlay();
    if (state.score.nightwatch >= CFG.round.winRounds || state.score.ravens >= CFG.round.winRounds) {
      state.phase = 'matchEnd';
      state.matchEndLeft = CFG.round.matchEndSeconds;
      const won = state.score.nightwatch > state.score.ravens;
      hud.showOverlay('matchEnd', {
        copy: won
          ? `Nightwatch take the depot ${state.score.nightwatch}–${state.score.ravens}. The Relay is yours.`
          : `The Ravens take the depot ${state.score.ravens}–${state.score.nightwatch}. Run it back.`,
      });
      return;
    }
    setupRound(state.round + 1);
  }

  function startMatch() {
    state.score = { nightwatch: 0, ravens: 0 };
    economy.reset();
    arsenal.state.owned = { pistol: true };
    arsenal.state.current = 'pistol';
    arsenal.state.frags = 0;
    arsenal.state.smokes = 0;
    arsenal.state.hasKit = false;
    hud.hideOverlay();
    setupRound(1);
  }

  // --- grenade detonations ---------------------------------------------------
  function resolveGrenade(event) {
    const g = CFG.grenades[event.kind];
    if (event.kind === 'frag') {
      const origin = event.pos;
      const victims = [];
      if (state.playerAlive) victims.push({ kind: 'player', pos: player.state.position, chest: 1.1 });
      for (const bot of bots.bots) {
        if (bot.alive) victims.push({ kind: 'bot', bot, pos: bot.body.position, chest: 1.1 });
      }
      for (const v of victims) {
        const dx = v.pos.x - origin.x;
        const dz = v.pos.z - origin.z;
        const dy = (v.pos.y + v.chest) - origin.y;
        const dist = Math.hypot(dx, dy, dz);
        if (dist > g.radius) continue;
        const blocked = !canSee(origin, grenadeTargetTmp.set(v.pos.x, v.pos.y + v.chest, v.pos.z));
        let dmg = g.damage + (g.minDamage - g.damage) * (dist / g.radius);
        if (blocked) dmg *= 0.5;
        if (v.kind === 'player') applyDamageToPlayer(dmg, origin, 'frag');
        else applyDamageToBot(v.bot, dmg, 'torso', null);
      }
      audio.explosion();
      emitSound(origin, CFG.bots.hearGunshot);
    }
  }

  // --- the fixed step ----------------------------------------------------------
  let stepSoundAt = 0;

  function step(dt, input) {
    state.elapsed += dt;
    const keys = input.state.keys;

    // Buy keys work during the buy phase, locked or not.
    if (state.phase === 'buy') {
      const map1 = { Digit1: 'pistol', Digit2: 'rifle', Digit3: 'smg', Digit4: 'dmr' };
      for (const [code, key] of Object.entries(map1)) {
        if (input.takePressed(code)) buy(key);
      }
      if (input.takePressed('Digit5')) buy('frag');
      if (input.takePressed('Digit6')) buy('smoke');
      if (input.takePressed('Digit7')) buy('kit');
      if (input.takePressed('Enter') || input.takePressed('KeyB')) {
        deploy();
      }
      state.buyLeft -= dt;
      if (state.buyLeft <= 0) {
        deploy();
      }
    }

    if (state.phase === 'roundEnd') {
      state.roundEndLeft -= dt;
      if (state.roundEndLeft <= 0) nextRound();
    }
    if (state.phase === 'matchEnd') {
      state.matchEndLeft -= dt;
      if (state.matchEndLeft <= 0) startMatch();
    }

    const live = state.phase === 'live' || state.phase === 'planted';

    // Player movement and actions.
    if (live && state.playerAlive && !state.frozen) {
      player.step(dt, keys);
      if (input.takePressed('KeyR') && arsenal.reload()) audio.reload();
      const switchKeys = { Digit1: 'pistol', Digit2: 'rifle', Digit3: 'smg', Digit4: 'dmr' };
      for (const [code, key] of Object.entries(switchKeys)) {
        if (input.takePressed(code) && arsenal.switchTo(key)) audio.reload();
      }
      // Semi-auto weapons fire once per press; full-auto weapons fire while held.
      const trigger = input.takeFiringEdge();
      if (input.state.firing && (arsenal.def().auto || trigger)) playerShoot();
      if (input.takePressed('Digit5') && arsenal.state.frags > 0) {
        arsenal.state.frags -= 1;
        camera.getWorldDirection(tmpDir);
        grenades.throwGrenade('frag', camera.position, tmpDir);
      }
      if (input.takePressed('Digit6') && arsenal.state.smokes > 0) {
        arsenal.state.smokes -= 1;
        camera.getWorldDirection(tmpDir);
        grenades.throwGrenade('smoke', camera.position, tmpDir);
      }
      const speed = player.groundSpeed();
      if (speed > 1 && state.elapsed - stepSoundAt > 0.42) {
        stepSoundAt = state.elapsed;
        audio.step();
        emitSound(player.state.position, CFG.bots.hearFootstep);
      }
    } else if (state.frozen) {
      // Frozen in buy: no movement, but the player may look around.
      player.state.velocity.set(0, 0, 0);
    }
    arsenal.step(dt);

    // Bots.
    if (live) {
      playerEye.set(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
      bots.step(dt, {
        player: {
          alive: state.playerAlive,
          team: 'nightwatch',
          pos: player.state.position,
          eye: playerEye,
        },
        attackingTeam: attackingTeam(),
        bombPlanted: bomb.state.phase === 'planted' || bomb.state.phase === 'defusing',
        site: CFG.site,
        inSite: (pos) => bomb.inZone(pos),
        canSee,
        shoot: botShoot,
        scripted: state.scripted,
        onStep: () => {},
      });
    }

    // Grenades.
    const events = grenades.step(dt);
    for (const e of events) resolveGrenade(e);
    tracers.step(dt);

    // Bomb: who is planting / defusing right now.
    if (live) {
      let planter = null;
      let defuser = null;
      const atk = attackingTeam();
      if (state.playerAlive && keys.has('KeyE')) {
        const inZone = bomb.inZone(player.state.position);
        if (inZone && atk === 'nightwatch') planter = { pos: player.state.position };
        if (inZone && atk === 'ravens') defuser = { pos: player.state.position, hasKit: arsenal.state.hasKit };
      }
      for (const bot of bots.bots) {
        if (!bot.alive) continue;
        if (bot.team === atk && (bot.state === 'plant' || bomb.state.phase === 'planting') && bomb.inZone(bot.body.position)) {
          planter = { pos: bot.body.position };
        }
        if (bot.team !== atk && bot.state === 'defuse' && bomb.inZone(bot.body.position)) {
          defuser = { pos: bot.body.position, hasKit: false };
        }
      }
      const bombEvents = bomb.step(dt, planter, defuser);
      for (const e of bombEvents) {
        if (e.type === 'planted') {
          state.phase = 'planted';
          state.roundLeft = CFG.round.plantSeconds;
          economy.award(E.plant);
          hud.setMoney(economy.state.money);
          hud.banner('BOMB PLANTED', '35 seconds to detonation', 3000);
          audio.plantBeep(true);
        } else if (e.type === 'tick') {
          audio.bombTick();
        } else if (e.type === 'defused') {
          economy.award(E.defuse);
          endRound('ravens' === atk ? 'nightwatch' : 'ravens', 'Bomb defused');
        } else if (e.type === 'exploded') {
          audio.explosion();
          endRound(atk, 'The Relay blows — the bomb site is gone');
        }
      }
      // Bomb progress UI for the player.
      if (bomb.state.phase === 'planting') hud.showBomb('PLANTING…', bomb.state.progress);
      else if (bomb.state.phase === 'defusing') hud.showBomb('DEFUSING…', bomb.state.progress);
      else if (bomb.state.phase === 'planted') hud.showBomb('BOMB LIVE', 1 - bomb.state.timer / CFG.round.plantSeconds);
      else hud.hideBomb();
    }

    // Round timer.
    if (state.phase === 'live') {
      state.roundLeft -= dt;
      if (state.roundLeft <= 0) {
        endRound(attackingTeam() === 'nightwatch' ? 'ravens' : 'nightwatch', 'Time expires — the bomb never went down');
      }
    }

    // Seen enemies for the minimap (last 4 seconds).
    state.seenEnemies = [];
    for (const bot of bots.bots) {
      if (bot.alive && bot.team === 'ravens' && bot.lastSeen) {
        state.seenEnemies.push({ x: bot.body.position.x, z: bot.body.position.z });
      }
    }
    updateHud();
  }

  function updateHud() {
    hud.setHealth(state.playerHp);
    hud.setAmmo(arsenal.state.mag, arsenal.state.reserve);
    if (state.phase === 'buy') hud.setTimer(state.buyLeft, 'BUY');
    else if (state.phase === 'live') hud.setTimer(state.roundLeft, state.playerAttacking ? 'PLANT' : 'DEFEND');
    else if (state.phase === 'planted') hud.setTimer(bomb.state.timer, 'BOMB');
    else hud.setTimer(0, state.phase.toUpperCase());
    hud.setScore(state.score.nightwatch, state.score.ravens, state.round);
    hud.setMoney(economy.state.money);
    const mates = bots.bots
      .filter((b) => b.team === 'nightwatch')
      .map((b) => ({ name: b.name, hp: b.health, alive: b.alive, x: b.body.position.x, z: b.body.position.z }));
    hud.setTeammates(mates);
    const spreadPx = arsenal.spread(player.groundSpeed(), player.state.crouching, !player.state.onGround) * 9000;
    hud.setCrosshair(Math.min(26, spreadPx));
    hud.drawMinimap(
      { x: player.state.position.x, z: player.state.position.z, yaw: player.state.yaw },
      mates,
      state.seenEnemies,
      bomb.state.phase === 'planted',
      CFG.site,
    );
  }

  return {
    state,
    player,
    arsenal,
    economy,
    bomb,
    bots,
    grenades,
    step,
    startMatch,
    setupRound,
    playerShoot,
    buy,
    deploy,
    closeBuy,
    endRound,
    nextRound,
    attackingTeam,
    updateHud,
  };
}
