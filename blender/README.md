# Aurora Bay Blender asset source

The game scene is built around a stylized but detailed Blender art direction: hard-surface cars with authored body kits, wheels and lighting, modular buildings, faceted trees, emissive glass, and cyan/lime night lighting. `create_assets.py` is the source file for the two authored GLB bundles used by the prototype:

- `midnight_gt.glb` — the player coupe, wheels, lights, spoiler, and underglow.
- `fleet/*.glb` — eight fictional, logo-free road-car variants with distinct hard-surface silhouettes and production-style detail packages.
- `aurora_bay_environment.glb` — a reusable block of roads, detailed facade kits, trees, lights, the Pulse Station, Aurora Spire skyline set, illuminated harbor gateway, and the Pinewatch mountain-pass/village extension.
- `regions/*.glb` — six modular sector kits for Northstar Outpost, Redwood Valley, Lake Aurora, Cinder Flats, Eastgate, and Southern Crossroads. They are authored as reusable Blender chunks rather than one monolithic 10 km file, so the browser can stream regional content near the player.

Run it with Blender 4.x:

```sh
blender -b --python blender/create_assets.py -- --out assets
```

The browser loads the core GLBs through Three.js `GLTFLoader` at startup. When the six optional files are present under `assets/regions/`, the streamed runtime hydrates the matching regional sector with the authored kit and hides only that sector's deterministic visual fallback; missing kits are handled silently and do not block boot. Lake Aurora's authored kit provides the shore and dock context while the runtime water shader supplies animated waves, foam, Fresnel, and sun glints. The procedural scene remains available as a fallback if an asset is missing. Re-exporting the Blender files preserves the same filenames and requires no gameplay code changes.
