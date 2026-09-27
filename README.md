# Neonline // Aurora Bay

A stylized open-world night driving game built as a browser prototype. Cruise through a modular neon city, discover route beacons, drift across the grid, and explore the waterfront.

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
- **R** — reset vehicle

## Art pipeline

The in-browser scene is a procedural Three.js fallback that keeps the prototype self-contained. The authored Blender source for the Midnight GT and Aurora Bay environment lives in [`blender/create_assets.py`](./blender/create_assets.py) and exports `midnight_gt.glb` plus `aurora_bay_environment.glb` when run with Blender 4.x. See [`blender/README.md`](./blender/README.md) for the export command.
