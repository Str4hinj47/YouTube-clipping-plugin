# Aurora Bay Blender asset source

The game scene is built around a stylized but detailed Blender art direction: hard-surface cars with authored body kits, wheels and lighting, modular buildings, faceted trees, emissive glass, and cyan/lime night lighting. `create_assets.py` is the source file for the two authored GLB bundles used by the prototype:

- `midnight_gt.glb` — the player coupe, wheels, lights, spoiler, and underglow.
- `fleet/*.glb` — seven fictional, logo-free road-car variants with distinct hard-surface silhouettes and detail packages.
- `aurora_bay_environment.glb` — a reusable block of roads, buildings, trees, lights, the Pulse Station landmark, and the Pinewatch mountain-pass/village extension.
- `regions/*.glb` — six modular sector kits for Northstar Outpost, Redwood Valley, Lake Aurora, Cinder Flats, Eastgate, and Southern Crossroads. They are authored as reusable Blender chunks rather than one monolithic 10 km file, so the browser can stream regional content near the player.

Run it with Blender 4.x:

```sh
blender -b --python blender/create_assets.py -- --out assets
```

The browser loads the core GLBs through Three.js `GLTFLoader` at startup. The regional runtime currently uses deterministic sector geometry so it can load and unload without waiting for six large files; the exported kits are the art-source handoff for replacing those sector props with authored GLBs. Lake Aurora's authored kit provides the shore and dock context while the runtime water shader supplies animated waves, foam, Fresnel, and sun glints. The procedural scene remains available as a fallback if an asset is missing. Re-exporting the Blender files preserves the same filenames and requires no gameplay code changes.
