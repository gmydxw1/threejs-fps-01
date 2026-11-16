// The arsenal: four weapons, each with its own numbers, and a deterministic recoil
// pattern — a fixed table of pitch/yaw offsets, one per shot in a burst, so the
// same burst always climbs the same way. Standing still and crouching shrink the
// spread; moving and jumping grow it, so stopping to aim pays.
import { CFG } from './config.js';

const WEAPONS = CFG.weapons;

export function createArsenal() {
  const state = {
    current: 'pistol',
    mag: WEAPONS.pistol.mag,
    reserve: WEAPONS.pistol.reserve,
    cooldown: 0,
    reloadLeft: 0,
    recoilIndex: 0,
    recoilReset: 0,
    flash: 0,
    kick: 0,
    owned: { pistol: true },
    frags: 0,
    smokes: 0,
    hasKit: false,
  };

  function def() {
    return WEAPONS[state.current];
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    if (state.recoilReset > 0) {
      state.recoilReset -= dt;
      if (state.recoilReset <= 0) state.recoilIndex = 0;
    }
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      if (state.reloadLeft === 0) {
        const need = def().mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    def,
    step,
    list() {
      return Object.keys(WEAPONS);
    },
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    // Fires one round: consumes ammo, starts the cooldown, returns the recoil
    // offset for this shot in the burst, or null when it cannot fire.
    pullTrigger() {
      if (state.mag <= 0 || state.cooldown > 0 || state.reloadLeft > 0) return null;
      state.mag -= 1;
      state.cooldown = def().fireGap;
      state.flash = 0.06;
      state.kick = 0.055;
      const pattern = def().recoil;
      const offset = pattern[state.recoilIndex % pattern.length];
      state.recoilIndex += 1;
      state.recoilReset = 0.35;
      return offset;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === def().mag || state.reserve === 0) return false;
      state.reloadLeft = def().reloadTime;
      return true;
    },
    spread(speed, crouching, airborne) {
      const d = def();
      let spread = d.spreadStill + Math.min(1, speed / CFG.player.walkSpeed) * d.spreadMove;
      if (airborne) spread += d.spreadAir;
      if (crouching) spread += d.spreadCrouch;
      return Math.max(0.0004, spread);
    },
    switchTo(key) {
      if (!state.owned[key] || key === state.current) return false;
      state.current = key;
      const d = WEAPONS[key];
      state.mag = d.mag;
      state.reserve = d.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.recoilIndex = 0;
      return true;
    },
    buy(key, money) {
      const d = WEAPONS[key];
      if (!d || state.owned[key] || money < d.price) return -1;
      state.owned[key] = true;
      return d.price;
    },
    // Called at round end: a dead player's primary is lost, a survivor keeps it.
    keepOrDrop(alive) {
      if (alive) return;
      for (const key of Object.keys(state.owned)) {
        if (key !== 'pistol') delete state.owned[key];
      }
      state.current = 'pistol';
      state.mag = WEAPONS.pistol.mag;
      state.reserve = WEAPONS.pistol.reserve;
      state.frags = 0;
      state.smokes = 0;
      state.hasKit = false;
    },
    resetRound() {
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.recoilIndex = 0;
      state.flash = 0;
      state.kick = 0;
      const d = def();
      state.mag = d.mag;
      state.reserve = d.reserve;
    },
  };
}
