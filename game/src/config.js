// MERIDIAN DEPOT — every tuning number lives here, in one place, so the sim, the
// weapons and the bots all read the same truth. Nothing here is a guess at runtime.
export const CFG = {
  // Rounds: buy freeze, live round, plant countdown, plant / defuse holds, first to 7.
  round: {
    buySeconds: 12,
    roundSeconds: 100,
    plantSeconds: 35,
    plantTime: 3.5,
    defuseTime: 5,
    defuseKitTime: 2.5,
    winRounds: 7,
    roundEndSeconds: 4,
    matchEndSeconds: 8,
  },
  // Money: start broke, win pays, losing streaks pay more, kills and objectives pay.
  economy: {
    start: 800,
    win: 3250,
    lossBase: 1900,
    lossStreakBonus: 500,
    lossCap: 3400,
    kill: 300,
    headshot: 400,
    plant: 300,
    defuse: 300,
  },
  // Movement and the body that collides with the map.
  player: {
    radius: 0.34,
    standHeight: 1.72,
    crouchHeight: 1.12,
    standEye: 1.6,
    crouchEye: 1.02,
    walkSpeed: 5.2,
    crouchSpeed: 2.4,
    groundAccel: 42,
    airAccel: 9,
    friction: 9,
    gravity: 20,
    jumpSpeed: 6.2,
    health: 100,
  },
  // Weapons. damage is per torso hit; head multiplies, legs scale down. Recoil is
  // deterministic: every shot in a burst takes the next offset from RECOIL_PATTERN,
  // so the same burst always climbs the same way and the player can learn it.
  weapons: {
    pistol: {
      name: 'P9 Sidearm', price: 0, damage: 34, headMult: 4, legMult: 0.75,
      mag: 15, reserve: 45, fireGap: 0.14, reloadTime: 1.4, auto: false,
      spreadStill: 0.003, spreadMove: 0.02, spreadAir: 0.02, spreadCrouch: -0.0012,
      recoil: [[0.006, 0], [0.008, 0.001], [0.009, -0.001], [0.01, 0.002]],
      range: 60, tracer: 0.35,
    },
    rifle: {
      name: 'Lance Rifle', price: 2700, damage: 33, headMult: 4, legMult: 0.75,
      mag: 30, reserve: 90, fireGap: 0.096, reloadTime: 1.9, auto: true,
      spreadStill: 0.0022, spreadMove: 0.028, spreadAir: 0.024, spreadCrouch: -0.001,
      recoil: [
        [0.009, 0], [0.011, 0.001], [0.012, -0.001], [0.013, 0.002], [0.014, -0.002],
        [0.015, 0.002], [0.016, -0.003], [0.016, 0.003], [0.017, -0.002], [0.017, 0.002],
        [0.018, -0.003], [0.018, 0.003],
      ],
      range: 80, tracer: 0.5,
    },
    smg: {
      name: 'Swift SMG', price: 1500, damage: 25, headMult: 4, legMult: 0.75,
      mag: 32, reserve: 96, fireGap: 0.07, reloadTime: 1.6, auto: true,
      spreadStill: 0.005, spreadMove: 0.032, spreadAir: 0.026, spreadCrouch: -0.0015,
      recoil: [
        [0.007, 0.002], [0.008, -0.002], [0.009, 0.003], [0.01, -0.003],
        [0.011, 0.002], [0.011, -0.002], [0.012, 0.003], [0.012, -0.003],
      ],
      range: 55, tracer: 0.4,
    },
    dmr: {
      name: 'Longview DMR', price: 3500, damage: 80, headMult: 4, legMult: 0.75,
      mag: 10, reserve: 30, fireGap: 0.9, reloadTime: 2.4, auto: false,
      spreadStill: 0.0009, spreadMove: 0.04, spreadAir: 0.03, spreadCrouch: -0.0004,
      recoil: [[0.035, 0], [0.038, 0.002], [0.04, -0.002]],
      range: 100, tracer: 0.7, zoomFov: 52,
    },
  },
  grenades: {
    frag: { name: 'Frag Grenade', price: 300, fuse: 1.6, radius: 7, damage: 110, minDamage: 18 },
    smoke: { name: 'Smoke Grenade', price: 300, fuse: 1.4, radius: 4.5, duration: 12 },
  },
  defuseKitPrice: 400,
  // Bots: reaction time, how far they hear, how far they see, burst discipline.
  bots: {
    reactionMin: 0.22,
    reactionMax: 0.38,
    hearGunshot: 42,
    hearFootstep: 9,
    // Bots see only 20 m, not the whole 28 m yard: at 55 m they spotted the
    // enemy at spawn and bee-lined straight at them, so nobody ever walked
    // a route, held a post or used a lane — the round-2 probe caught every
    // bot in 'engage' within a second of deploy, 28 m apart. At 20 m the
    // routes matter again and fights open at lane range, not spawn to spawn.
    seeDistance: 20,
    // Bots track a target as far as they can see, but hold fire beyond this
    // range: a defender should not melt an attacker across the whole yard
    // before the fight has even started. The mid fight opens at ~15 m,
    // where the mid container is a step away.
    engageRange: 15,
    burstMin: 2,
    burstMax: 4,
    burstPauseMin: 1.0,
    burstPauseMax: 1.8,
    aimError: 0.028,
    aimDistance: 20,
    // Slow, hard-hitting weapons are harder for a bot to land at range.
    aimErrorByWeapon: { pistol: 1.1, rifle: 1, smg: 1.2, dmr: 1.8 },
    moveSpeed: 4.4,
  },
  // The Relay site: a box on the ground the bomb is planted inside.
  site: { x: 0, z: -11.5, halfX: 4, halfZ: 3 },
  teams: {
    nightwatch: { name: 'Nightwatch', color: 0x7fa8c9, css: '#7fa8c9' },
    ravens: { name: 'Ravens', color: 0xe8a33d, css: '#e8a33d' },
  },
};
