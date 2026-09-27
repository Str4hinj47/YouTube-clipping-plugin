# Aurora Bay Blender asset source

The game scene is built around a low-poly Blender art direction: hard-surface cars, faceted trees, modular buildings, emissive glass, and cyan/lime night lighting. `create_assets.py` is the source file for the two authored GLB bundles used by the prototype:

- `midnight_gt.glb` — the player coupe, wheels, lights, spoiler, and underglow.
- `aurora_bay_environment.glb` — a reusable block of roads, buildings, trees, lights, and the Pulse Station landmark.

Run it with Blender 4.x:

```sh
blender -b --python blender/create_assets.py -- --out public/assets
```

The browser prototype currently uses the same geometry language as a procedural fallback so the game can boot without a binary asset download. The generated GLBs can be dropped into a Three.js loader later without changing the driving/UI systems.
