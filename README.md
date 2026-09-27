# Neonline // Aurora Bay

A stylized open-world night driving game built as a browser prototype. Cruise legally through a modular neon city, climb the two-lane mountain pass with opposing traffic, use the full Aurora Bay map to plan routes, discover route beacons, collect data caches, run city and Pinewatch village deliveries, and explore the waterfront at your own pace.

## Run

```sh
python3 -m http.server 4173 --bind 0.0.0.0
```

Then open `http://localhost:4173` (or use the Arena live preview).

## Controls

- **WASD / arrow keys** — drive and steer
- **Space** — handbrake
- **C** — follow / high camera
- **V** — accept a courier delivery at the blue depot
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
- Red lights and stop signs are only camera-enforced at selected high-traffic Aurora Bay junctions, and only when nearby traffic provides a realistic witness context. Quiet intersections, villages, Pinewatch, and empty regional roads do not issue automatic fines. Speed enforcement only happens at a randomly selected roadside radar location; a police unit appears there, follows briefly, and asks the player to pull over without starting a chase or raising a wanted level.

## World layout

Aurora Bay now uses a roughly 10 by 10 km streamed world envelope. The authored city grid remains a dense 232 by 232 world-unit core, extended with irregular boulevard routes, varied storefronts, unique procedural building treatments, mixed-occupancy parking lots, parked cars, landscaped tree medians, and additional street lighting. Regional highway routes connect Pinewatch, Redwood Valley, Lake Aurora, Cinder Flats, Eastgate, and Southern Crossroads. Nearby rural sectors stream in around the player so the browser does not load the entire world at once, while the renderer adapts resolution when a device needs more headroom. The full island is bordered by an animated ocean ring, with no artificial walls inside the playable space. The north-east edge connects to a switchback pass with two opposing traffic lanes, guardrails, rock formations, and Pinewatch, a quiet small town with individual houses, three local stores, gravel parking, parked vehicles, a few pass-through cars, traffic signals, and warm streetlights. The Blender environment generator includes the city, mountain extension, and six reusable regional sector kits; the browser keeps deterministic sector geometry as a fallback when those optional regional GLBs are not present.

## Art pipeline

The game loads the authored GLB assets in `assets/` at runtime: the hero car, environment, and the detailed logo-free fleet in `assets/fleet/`; Blender can also export modular regional kits into `assets/regions/` for streamed sector art handoff. Lake Aurora and the surrounding ocean use an animated shader with multi-frequency waves, Fresnel response, foam, and sun glints. The Blender source for all of them is [`blender/create_assets.py`](./blender/create_assets.py), and the game keeps its procedural scene as a graceful fallback if an asset fails to load. See [`blender/README.md`](./blender/README.md) for the Blender 4.x export command.
