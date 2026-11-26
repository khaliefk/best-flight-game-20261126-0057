[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/c/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/khaliefk/best-flight-game-20261126-0057/rank.svg)](https://make.fun/c/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/khaliefk/best-flight-game-20261126-0057/reward.svg)](https://make.fun/c/best-flight-game-20261126-0057)

# Skylark Run — Island Hopper

A flight game for the [make.fun best flight game bounty](https://make.fun/c/best-flight-game-20261126-0057). Fly the Kancil-9 bush plane across an island archipelago in a chase view over real terrain, thread the glowing sky rings, mind the fuel gauge, and bring her home onto runway 09.

Three missions: **Ring Run** (six rings over the home island), **Island Hop** (eight rings across the whole archipelago on tight fuel), and **Sunset Landing** (three rings, then a landing that only counts gentle, straight and on the strip).

## Play

Open `game/index.html` in desktop Chrome, or serve it locally:

```sh
node serve.ts
# then open http://localhost:8080
```

- **Arrows / WASD** — pitch and bank
- **W / S** — throttle up and down (**Shift** full, **Ctrl** idle)
- **Mouse** — steer by pointer position
- **Space** — brake on the ground
- **C** — chase / nose camera, **P** — pause, **M** — mute, **R** — fly again

The HUD shows altitude in feet, speed in knots, a heading tape, vertical speed, an attitude ball, throttle, fuel and the ring count. Engine hum and wind are synthesised in the browser; there are no audio files and no network requests. Everything the game loads lives under `game/`.

## Shots

`shots.json` lists the four staged scenes (`?shot=start|rings|runway|land`) used for the screenshots in `screenshots/`. Each one is the real flight model played forward by a small autopilot from a fixed seed, so the same seed always gives the same frame.

## Hand in

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/` to `/output` and writes `/output/dossier.json` with the vendored make.fun library:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

MIT licensed. Built from scratch: own idea, art, sound and names.
