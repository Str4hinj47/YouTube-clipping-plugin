# Neonline: Aurora Bay — production direction

This repository is the production prototype for a publishable premium PC game. The browser renderer is the current distribution and iteration target, not the quality target. A desktop wrapper can be added after the vertical slice is stable.

## Product bar

The goal is a complete, coherent driving game with a small number of finished spaces, not an oversized unfinished map. A feature is not considered done because it renders or because it has a label; it must read clearly at driving speed, survive repeated play, and remain performant on a real laptop or desktop.

Final-facing scenery must use authored modular assets or deliberate, reusable construction kits. Runtime procedural geometry is allowed for deterministic fallback, blockout, road dressing, and streamed utility props, but it must not be the substitute for the primary landmarks, building silhouettes, vehicles, or hero spaces.

## First shippable vertical slice

The first production slice is intentionally bounded:

- Aurora Bay downtown, waterfront, and one complete boulevard loop.
- The Pinewatch pass and the small Pinewatch village approach.
- One repeatable city cargo contract, one Pinewatch contract, and the full roadside-stop resolution.
- One owned starter home, Garage, Market, phone inbox, save slots, and settings.
- Legal driving, traffic signals, radar inspections, vehicle damage, water recovery, and the existing vehicle progression.
- A finished presentation pass: authored landmarks, coherent night lighting, PBR materials, road markings, signs, traffic, ambience, and tuned camera composition.

No new island regions should be added until this slice meets the quality bar above.

## Art requirements

- Fictional, logo-free vehicles remain the hero assets. Every final vehicle needs a readable silhouette, wheel/contact relationship, lights, glass, trim, damage response, and a consistent material response.
- Landmark and building kits need bevels, facade depth, windows, service details, signage as geometry or authored textures, and intentional night lighting. Floating debug-style labels are not a replacement for architecture.
- Procedural and authored surfaces share the same color-management, roughness, metalness, emissive, and shadow rules.
- Distant content needs authored low-cost representations or LOD behavior; it must not rely on a full-resolution asset at every distance.
- Pinewatch stays quiet, sparse, and residential. It is not a second city.

## Runtime budgets

These are initial budgets for the vertical slice and should be measured rather than assumed:

- 60 FPS target at 1080p on a mainstream integrated or entry desktop GPU; graceful resolution reduction is preferable to input or simulation slowdown.
- 16 ms simulation/render frame budget at the target; no unbounded per-frame allocation in driving or streaming code.
- Streamed regional sectors must load and unload without gameplay stalls, duplicate collision volumes, or orphaned GPU resources.
- Real-time shadow-casting lights are reserved for hero spaces and landmarks. Repeated roadside light should use shared materials, baked-looking emissive geometry, or pooled lights.
- Each authored asset needs a predictable memory footprint and a fallback path. A missing optional GLB must never prevent the game from booting.

## Production gates

1. **Blockout:** route, camera, collision, mission, and save behavior are playable.
2. **Art pass:** primary silhouettes and composition are authored; placeholders are explicitly tracked.
3. **Lighting pass:** night hierarchy, materials, fog, emissives, traffic lights, and headlights read in motion.
4. **Performance pass:** frame time, memory, load/unload behavior, and low-quality mode are measured.
5. **Playtest pass:** a new player can start from the world-shot menu, take a contract, finish or fail it, use a home/Garage, and recover from a roadside stop without developer knowledge.
6. **Release pass:** desktop packaging, versioned saves, error recovery, settings persistence, and a reproducible asset export are documented.

## Current implementation policy

Keep existing gameplay systems and the authored vehicle direction. Improve the vertical slice in focused passes. Do not compensate for missing authored content by continuously adding procedural neon primitives or expanding the map. When an asset is unavailable in this environment, keep a deterministic fallback and record the asset as a production gap rather than pretending the fallback is final.
