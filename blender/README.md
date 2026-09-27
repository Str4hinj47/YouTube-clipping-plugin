# Aurora Bay Blender asset source

The game scene is built around a low-poly Blender art direction: hard-surface cars, faceted trees, modular buildings, emissive glass, and cyan/lime night lighting. `create_assets.py` is the source file for the two authored GLB bundles used by the prototype:

- `midnight_gt.glb` — the player coupe, wheels, lights, spoiler, and underglow.
- `fleet/*.glb` — seven fictional, logo-free road-car variants with distinct hard-surface silhouettes and detail packages.
- `aurora_bay_environment.glb` — a reusable block of roads, buildings, trees, lights, the Pulse Station landmark, and the Pinewatch mountain-pass/village extension.

Run it with Blender 4.x:

```sh
blender -b --python blender/create_assets.py -- --out assets
```

The browser loads these GLBs through Three.js `GLTFLoader` at startup. The procedural scene remains available as a fallback so the game can still boot if an asset is missing. Re-exporting the Blender files preserves the same filenames and requires no gameplay code changes.
