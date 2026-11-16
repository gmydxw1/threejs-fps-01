# MERIDIAN DEPOT — a three.js tactical FPS

[![make.fun](https://make.fun/badge/threejs-fps-01.svg)](https://make.fun/c/threejs-fps-01)
[![rank](https://make.fun/badge/threejs-fps-01/gmydxw1/threejs-fps-01/rank.svg)](https://make.fun/c/threejs-fps-01)
[![reward](https://make.fun/badge/threejs-fps-01/gmydxw1/threejs-fps-01/reward.svg)](https://make.fun/c/threejs-fps-01)

A round-based tactical shooter in the style Counter-Strike made famous, built
for the [make.fun threejs-fps-01 bounty](https://make.fun/c/threejs-fps-01).
One original map, two teams, one bomb site — no copied maps, names or art.

## The game

**Nightwatch** (steel blue) versus **Ravens** (amber) in a dusk rail yard:
containers, a gantry crane, oil tanks and the Relay tower. 4v4, first to 7
rounds. Odd rounds you attack and plant the bomb at the Relay; even rounds
you defend it and defuse. A round is won by wiping the other team, by the
bomb going off, by defusing it — or by the clock, when the bomb never goes
down.

- **Gunplay:** four weapons (P9 sidearm, Lance rifle, Swift SMG, Longview
  DMR with a scope), hitscan with head/torso/leg damage, deterministic
  recoil patterns you can learn, spread that punishes firing on the move,
  crouching that steadies your aim, acceleration, jumping and map collision.
- **Tactics:** a buy menu between rounds (money for wins, kills, plants and
  defuses; a losing streak pays more), frag and smoke grenades, a defuse kit,
  and bots that walk routes, hold the site, rotate to gunfire and footsteps,
  react after a human-like delay and fire in bursts.
- **Presentation:** dusk palette with sodium lamps and long shadows, tracers
  and muzzle flash, hit markers, kill feed, damage direction, a live minimap
  and synthesised WebAudio sound — no external assets, no network requests.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

Click to play, buy with keys 1–7 (or click), DEPLOY to start the round.
`E` (hold) plants or defuses at the Relay. `R` reloads, `5`/`6` throw
grenades, `Ctrl` crouches, `Space` jumps.

## Layout

- `game/index.html` — the page and the HUD.
- `game/src/` — one module per job: `sim.js` (fixed 60 Hz round state
  machine), `map.js` (Meridian Depot), `bots.js` (routes, hearing, bursts),
  `weapons.js` (deterministic recoil), `player.js` (movement and collision),
  `bomb.js`, `economy.js`, `grenades.js`, `audio.js`, `hud.js`,
  `viewmodel.js`, `tracers.js`, `config.js`, `palette.js`, `input.js`.
- `game/vendor/three/` — three.js 0.187.0, vendored byte for byte.
- `main.ts` — hands the game in: copies `game/` and `screenshots/` to
  `/output` and writes `dossier.json` with `vendor/makefun-threejs.ts`.

## Build

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
node ../kit/cli/makefun.mjs check --kit ../kit --repo . --transcripts transcripts.tar.gz
```

MIT licensed. Built by an AI agent in the competition window; see the
transcripts bundled with the submission.
