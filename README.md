# Original car concepts · Blender / glTF

Three original **procedurally modeled car concepts** for a driving-game prototype. The repository originally contained only a one-line README; there were no supplied car meshes to retouch. These are new designs, **not modifications of existing models or licensed real-world cars**.

| Car | Description | Game asset | Preview |
| --- | --- | --- | --- |
| Aster Sedan | Blue 4-door executive sedan | [GLB](assets/Aster_Sedan.glb) | [PNG](previews/Aster_Sedan.png) |
| Vela GT | Red low-roof coupe | [GLB](assets/Vela_GT.glb) | [PNG](previews/Vela_GT.png) |
| Atlas SUV | Green tall-roof SUV | [GLB](assets/Atlas_SUV.glb) | [PNG](previews/Atlas_SUV.png) |

All three assets are metric-scale, self-contained glTF 2.0 binaries (~0.5 MB each), with individually named parts and baked PBR material parameters. Front is **+X**, up is **+Z**. Painted sides are lofted around actual wheel openings; windows, wheels, headlamps, indicators, rear lamps, handles, mirrors, grilles, trim, interior silhouettes and arches are separate editable elements. The wheel centers are at their respective tire radii so tires sit on the floor.

### Best way to use on Windows 10

1. Install Blender **4.2 or newer** from [blender.org/download](https://www.blender.org/download/). No separate Python installation is needed to open the finished cars or run the Blender script.
2. Download **this branch** from GitHub (use **Code → Download ZIP** on the branch page), then **extract the entire ZIP** somewhere such as `C:\Cars`. Don't run the script from inside the ZIP: it needs the adjacent `assets` directory.
3. To inspect/edit immediately: launch Blender → **File → Import → glTF 2.0 (.glb/.gltf)** → choose, for example, `C:\Cars\assets\Aster_Sedan.glb`. Switch the viewport to **Material Preview** to see the car colors and materials. The `.glb` files are the ready-to-use, game-engine-compatible deliverables; the `previews/` PNGs are quick inspection images.
4. To create three `.blend` projects with studio floors and lighting **and** render PNGs, open **PowerShell**, change to the *extracted folder containing `scripts` and `assets`*, and run (adjust the Blender version/path if yours differs):

   ```powershell
   cd C:\Cars
   & 'C:\Program Files\Blender Foundation\Blender 4.2\blender.exe' -b --python scripts\blender_scene.py
   ```

   Output: `C:\Cars\blender\*.blend` and `C:\Cars\renders\*.png`. Open a `.blend` in Blender to continue editing. Rendering with Cycles may take several minutes per model; you can edit `scene.cycles.samples` in `scripts/blender_scene.py` for faster or cleaner results. If Blender is installed in another folder/version, use the path to **your** `blender.exe` (in File Explorer, right-click its shortcut → Open file location). If Windows blocks script execution, note that `blender.exe -b --python` runs a *Python file inside Blender*, not a PowerShell script; you do not need to change PowerShell's execution policy.

> **Rendering limitation:** The provided `previews/` images are lightweight software-rasterized inspection views, **not photoreal renders**. The sandbox that built this repository lacks Blender's system graphics libraries, so `.blend` files and Cycles renders could not be generated or verified here. Run step 4 on a working Blender installation to produce them. These are medium-poly stylized concepts, not photogrammetry or production-grade photoreal car models.

### Open on macOS / Linux

**File → Import → glTF 2.0** and select any file in `assets/`, or create scenes and renders with Blender 4.2+:

```sh
blender -b --python scripts/blender_scene.py
```

### Rebuild assets / previews

```sh
python -m pip install numpy trimesh pillow numba
python scripts/build_cars.py
python scripts/render_previews.py
```

The GLBs contain geometry and material colors, without external textures or texture downloads. These are stylized, medium-poly concept vehicles; physical panel thickness, rigged suspension, UV texture maps and production-grade photoreal surfacing would require additional artist work. The two Python scripts in `scripts/` make the asset generation and Blender setup reproducible.
