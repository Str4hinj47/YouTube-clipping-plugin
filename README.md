# Neonline // Aurora Bay

A stylized open-world driving game built as a browser prototype. Cruise legally through a modular neon city, climb the two-lane mountain pass with opposing traffic, watch the accelerated day/night cycle move the dynamic sun and moon across the island, use the full Aurora Bay map to plan routes, discover route beacons, collect data caches, run city and Pinewatch village deliveries, and explore the waterfront at your own pace.

## Run

```sh
python3 -m http.server 4173 --bind 0.0.0.0
```

The production scope, vertical-slice gates, art rules, and initial runtime budgets are documented in [`PRODUCTION_DIRECTION.md`](./PRODUCTION_DIRECTION.md). This is being built as a serious publishable game prototype; the browser build is the current iteration target, not a reason to lower the art or systems bar.

Then open `http://localhost:4173` (or use the Arena live preview).

## Controls

- **WASD / arrow keys** — drive and steer
- **Space** — handbrake
- **C** — follow / high camera
- **V** — accept a hot-cargo delivery at the active city pickup waypoint (one of three fixed underpass/alley locations)
- **G** — open the in-game garage, repair damage, buy performance upgrades, or respray the car
- **E** — open a physical mechanic shop's repair bay when parked at its service marker
- **P** — open/close the secure in-game phone; opening it suppresses driving and shows the cartel mission inbox
- **Escape** — pause the run, close the phone/map/garage, or return through the active overlay
- **Title menu** — an automatic world-tour slideshow with one shot per region, Continue (latest save), Play (choose among local saves or start a new slot), Market, Garage, and Settings
- **M** — open/close the full city map; the map pauses the drive while you plan
- **Touch** — use the mobile PHONE button beside the pause control to open the same inbox
- **R** — reset vehicle
- **Gamepad / touch controls** — supported on compatible devices
- **Local saves** — Play exposes three local save slots; Continue loads the most recently updated profile without opening slot selection. Each slot persists the resume position and heading, vehicle condition/damage, selected home and car, active cargo case/deadline/exposure, fictional cartel phone inbox, read/unread state, roadside history, and mission contacts. The game also checkpoints the active run periodically while driving.

## Road consequences

- Crashes reduce the active vehicle's condition. Hard impacts can temporarily disable the player car or leave traffic vehicles stopped in the lane with hazards flashing.
- Disabled traffic clears after a short roadside incident window and respawns at the edge of the city. Traffic-to-traffic impacts are resolved separately from player collisions, so pileups can briefly slow an intersection or mountain pass.
- The mountain pass is a two-lane road with right-hand opposing traffic, a center line, guardrails, switchbacks, and oncoming vehicles that make overtaking a deliberate risk.
- Dirt and gravel are separate from asphalt, shoulder, and grass handling: Pinewatch parking lots and regional roadside pull-offs reduce grip, add rolling resistance, rough suspension movement, lower-frequency tire noise, and kick up loose-surface dust.
- Pinewatch Village adds a remote supply-delivery loop beyond the pass, with a depot, cabin drop, village buildings, and extra route rewards. The player starts at the simple Pinewatch Shack rather than in the city.
- City courier work uses a two-step route: collect the unmarked cargo at one of exactly three recurring pickup spots (an underpass or one of two dark alleys), then follow the active minimap waypoint to a randomly selected remote dropoff outside Aurora Bay.
- Homes are available in the Garage safehouse section. The Pinewatch Shack is owned for free; additional Pinewatch, Aurora Bay, and remote houses can be purchased, selected as the spawn point, and persisted in the local save.
- Courier work is a repeatable mission progression rather than a single route: the city rotates through six named delivery jobs with recurring pickup locations, randomized remote destinations, deadlines, and rewards, while Pinewatch remains a separate mountain run.
- City and Pinewatch jobs now carry fictional unmarked contraband. Each run has a hard deadline: delivering early adds a cash bonus, while missing the window loses the payout. The fictional cartel contact network sends phone messages when contracts open, cases are accepted, deadlines get tight, deliveries settle successfully, or a run is failed/compromised.
- Speed above the posted limit, red lights, stop signs, collisions, water loss, and vehicle damage raise a mission-only exposure meter. Higher exposure makes an existing radar roadside inspection more likely to bust the run; there is no global heat or pursuit loop.
- A radar stop now resolves through a dedicated roadside panel: pull over safely, see the recorded speed, posted limit, district, warning/citation record, and cargo state, then resolve the contact. Minor radar violations can produce a warning with no fine; larger violations use the existing citation. An active case is inspected using the exposure-based risk: a clear inspection adds radar exposure, while a failed inspection compromises the run. Recent radar contacts persist in the selected local save, and the phone records cargo outcomes for the fictional contact network. Stops never start a chase or heat state.
- The delivery HUD, full map, and roadside notifications show the countdown, estimated payout, and current exposure tier. Driving legally and smoothly protects the cargo, while taking a faster line creates a deliberate risk-versus-reward decision.
- Completed deliveries are saved locally and grant the next vehicle automatically at the configurable milestones in `PROGRESSION_CONFIG` inside `src/main.js`. Change `starterStyle` or the `vehicleUnlocks` delivery counts there to rebalance the career without rewriting the mission logic.
- Every player collision adds persistent, varied visual bodywork: localized dents, scratches, folded panel creases, paint transfer, cracked-looking marks, and displaced trim can accumulate across impacts on both procedural cars and authored GLB vehicles. The marks remain until a full Garage repair or water recovery clears them, and the impact records are included in the local save.
- The HUD, Market, and both Garage interfaces show condition, repair pricing, and water-recovery pricing. Full repair is intentionally expensive: it is priced at 80% of the active vehicle's Market cost at 0% condition. If the player enters Lake Aurora, the waterfront inlet, or the outer ocean, the car sinks into a recoverable disabled state; the Garage revival fee is exactly 50% of that vehicle cost. The free sport starter has a `vehicleValue` of `$2,200`, so its recovery fee is exactly `$1,100`.
- Every existing `districtAt()` district has a physical, collision-backed mechanic shop: Waterfront Loop, Neon District, Octane Row, Northstar Ave, Midtown East, South Market, Outer Ridge, Mountain Pass, Pinewatch Village, Northstar Outpost, Redwood Valley, Lake Aurora, Cinder Flats, Eastgate, and Southern Crossroads. Orange service-bay markers appear on the minimap and full map; stop inside the marked bay and press `E` to reuse the existing Garage repair, upgrade, paint, cash, and recovery systems.
- Repairs and recovery are saved locally. `R` cannot bypass a submerged vehicle's recovery fee; paying the recovery charge tows the car to its last safe road, restores condition, and clears the visible damage.
- Red lights and stop signs are only camera-enforced at selected high-traffic Aurora Bay junctions, and only when nearby traffic provides a realistic witness context. Quiet intersections, villages, Pinewatch, and empty regional roads do not issue automatic fines. Speed enforcement only happens at a randomly selected roadside radar location; a police unit appears there, follows briefly, and asks the player to pull over without starting a chase or raising a wanted level.

## World layout

Aurora Bay now uses a roughly 10 by 10 km streamed world envelope. The authored city grid remains a dense 232 by 232 world-unit core, extended with irregular boulevard routes, varied storefronts, unique procedural building treatments, mixed-occupancy parking lots, parked cars, landscaped tree medians, and additional street lighting. The night-polish pass adds a central Aurora Spire, lower skyline landmarks, an illuminated harbor gateway, emissive lamp pools, and reflective urban road markers without turning Pinewatch into another dense city. Regional highway routes connect Pinewatch, Redwood Valley, Lake Aurora, Cinder Flats, Eastgate, and Southern Crossroads. Nearby rural sectors stream in around the player so the browser does not load the entire world at once, while the renderer adapts resolution when a device needs more headroom. The full island is bordered by an animated ocean ring, with no artificial walls inside the playable space. The north-east edge connects to a switchback pass with two opposing traffic lanes, guardrails, rock formations, and Pinewatch, a quiet small town with individual houses, three local stores, gravel parking, parked vehicles, a few pass-through cars, traffic signals, and warm streetlights. The Blender environment generator includes the city, mountain extension, and six reusable regional sector kits; the browser keeps deterministic sector geometry as a fallback when those optional regional GLBs are not present.

## Art pipeline

The game loads the authored GLB assets in `assets/` at runtime: the handmade compact-hatch starter car, the Midnight GT hero coupe, environment, and the detailed logo-free fleet in `assets/fleet/`; Blender can also export modular regional kits into `assets/regions/` for streamed sector art handoff. Imported Standard materials receive a conservative night-scene normalization for roughness, metal response, environment intensity, and named emissive surfaces so they sit beside the procedural architecture instead of looking like a separate render pass. Aurora Bay uses a shader-gradient night sky, layered moon halo, animated landmark accents, and region-coded roadside reflectors. Lake Aurora and the surrounding ocean use an animated shader with multi-frequency waves, Fresnel response, foam, and sun glints. The Blender source for all of them is [`blender/create_assets.py`](./blender/create_assets.py), and the game keeps its procedural scene as a graceful fallback if an asset fails to load. See [`blender/README.md`](./blender/README.md) for the Blender 4.x export command.
