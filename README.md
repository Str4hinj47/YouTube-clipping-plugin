# Neonline // Aurora Bay

A stylized open-world night driving game built as a browser prototype. Cruise through a modular neon city, climb the two-lane mountain pass with opposing traffic, use the full Aurora Bay city map to plan routes, discover route beacons, collect data caches, run city and Pinewatch village deliveries, outrun Night Patrol, drift across the grid, and explore the waterfront.

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
- **G** — open the in-game garage, repair damage, buy performance upgrades, or respray the car
- **P / Escape** — pause, open settings, or return to the full title menu
- **Title menu** — Play, Market (buy and select cars), Garage (respray and upgrades), and Settings
- **M** — open/close the full city map; the map pauses the drive while you plan
- **R** — reset vehicle
- **Gamepad / touch controls** — supported on compatible devices

## Road consequences

- Crashes reduce the active vehicle's condition. Hard impacts can temporarily disable the player car or leave traffic vehicles stopped in the lane with hazards flashing.
- Disabled traffic clears after a short roadside incident window and respawns at the edge of the city. Traffic-to-traffic impacts are resolved separately from player collisions, so pileups can briefly slow an intersection or mountain pass.
- The mountain pass is a two-lane road with right-hand opposing traffic, a center line, guardrails, switchbacks, and oncoming vehicles that make overtaking a deliberate risk.
- Pinewatch Village adds a remote supply-delivery loop beyond the pass, with a depot, cabin drop, village buildings, and extra route rewards.
- The HUD and both Garage interfaces show condition and the full-repair price. Repairs cost `$5` per missing condition point, are saved locally, and restore a disabled player car.
- Driving through a red light or stop sign, or holding more than 10 km/h over the displayed limit, issues a citation and fine. Repeated violations raise HEAT and can call in Night Patrol.

## World layout

Aurora Bay's city grid occupies a roughly 232 by 232 world-unit core. The north-east edge now connects to a longer switchback pass with two opposing traffic lanes, guardrails, rock formations, and Pinewatch Village. The full map shows both the city grid and the mountain route; the Blender environment generator includes the same extension for future GLB re-exports.

## Art pipeline

The game loads the authored GLB assets in `assets/` at runtime: the hero car, environment, and the detailed logo-free fleet in `assets/fleet/`. The Blender source for all of them is [`blender/create_assets.py`](./blender/create_assets.py), and the game keeps its procedural scene as a graceful fallback if an asset fails to load. See [`blender/README.md`](./blender/README.md) for the Blender 4.x export command.
