# Neonline // Aurora Bay

A stylized open-world night driving game built as a browser prototype. Cruise through a modular neon city, discover route beacons, collect data caches, run courier deliveries, outrun Night Patrol, drift across the grid, and explore the waterfront.

## Run

```sh
python3 -m http.server 4173 --bind 0.0.0.0
```

Then open `http://localhost:4173` (or use the Arena live preview).

## Controls

- **WASD / arrow keys** — drive and steer
- **Shift** — nitro
- **Space** — handbrake / drift
- **C** — chase / high camera
- **E** — start or rematch Midnight Sprint when near the orange gate
- **V** — accept a courier delivery at the blue depot
- **X** — trigger a Night Patrol pursuit
- **G** — open the garage and buy performance upgrades
- **P / Escape** — pause and open settings
- **M** — expand/collapse the map
- **R** — reset vehicle
- **Gamepad / touch controls** — supported on compatible devices

## Art pipeline

The game loads the authored GLB assets in `assets/` at runtime: the hero car, environment, and the detailed logo-free fleet in `assets/fleet/`. The Blender source for all of them is [`blender/create_assets.py`](./blender/create_assets.py), and the game keeps its procedural scene as a graceful fallback if an asset fails to load. See [`blender/README.md`](./blender/README.md) for the Blender 4.x export command.
