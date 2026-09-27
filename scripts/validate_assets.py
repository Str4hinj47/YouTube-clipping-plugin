"""Basic export sanity checks; run with python scripts/validate_assets.py."""
from pathlib import Path
import trimesh
import numpy as np

root=Path(__file__).resolve().parents[1]
for name in ('Aster_Sedan','Vela_GT','Atlas_SUV'):
    path=root/'assets'/f'{name}.glb'
    scene=trimesh.load(path,force='scene')
    assert len(scene.geometry)>300, (name,len(scene.geometry))
    all_names=' '.join(scene.graph.nodes_geometry).lower()
    for term in ('windshield','wheel','headlight','tail_lamp','mirror','roof','bonnet','door_seam'):
        assert term in all_names, (name,term)
    assert len(scene.geometry)<500, name
    assert path.stat().st_size<2_000_000, name
    meshes=list(scene.geometry.values())
    for m in meshes:
        assert m.vertices.shape[0] and m.faces.shape[0],name
        assert np.isfinite(m.vertices).all(),name
        assert m.visual.material is not None,name
    print(name, 'OK', len(meshes),'editable parts', sum(len(m.faces) for m in meshes),'triangles')
