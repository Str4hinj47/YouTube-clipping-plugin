"""Run INSIDE Blender 4.2+: blender -b --python scripts/blender_scene.py

Imports game-ready GLBs as editable Blender projects and renders studio images.
Customize SAMPLES/RESOLUTION and lights below for final-quality output.
"""
import bpy
from pathlib import Path
from mathutils import Vector
from math import radians

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'blender'
RENDERS = ROOT / 'renders'
OUTPUT.mkdir(exist_ok=True)
RENDERS.mkdir(exist_ok=True)


def aim(obj, point):
    direction = Vector(point) - obj.location
    obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()


def area(name, location, power, size, color=(1, 1, 1), target=(0, 0, .6)):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = power
    data.shape = 'DISK'
    data.size = size
    data.color = color
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    aim(obj, target)


def build(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    parts = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for obj in parts:
        # Geometry is already tessellated densely; shade smooth without
        # changing topology or game export. For intentionally hard-edged
        # detail (lamps, plates, grilles), retain the planar face normals.
        if any(t in obj.name.lower() for t in ('fascia', 'plate', 'grille', 'bucket', 'lens', 'seat', 'dashboard', 'mirror_housing')):
            continue
        for poly in obj.data.polygons:
            poly.use_smooth = True
        # Weighted normals make the reflective paint and wheel lips calmer.
        if any(t in obj.name.lower() for t in ('fenders', 'roof', 'bonnet', 'deck')):
            modifier = obj.modifiers.new('Subtle weighted normals', 'WEIGHTED_NORMAL')
            modifier.keep_sharp = True
    # No texture references: all PBR colors/roughness/metalness live in GLB.
    ground = bpy.data.materials.new('Studio | warm matte floor')
    ground.diffuse_color = (.35, .38, .41, 1)
    ground.use_nodes = True
    shader = ground.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (.35, .38, .41, 1)
    shader.inputs['Roughness'].default_value = .78
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.022))
    bpy.context.object.name = 'Studio floor (not part of game asset)'
    bpy.context.object.data.materials.append(ground)
    area('Large overhead softbox', (1, -2, 8), 1400, 7, target=(0, 0, .5))
    area('Front reflection strip', (5, -4, 4), 850, 5, target=(0, 0, .9))
    area('Cool side fill', (-3, 3, 5), 1100, 5, (.72, .84, 1), target=(0, 0, .9))
    area('Edge highlight', (-4, -1, 4), 550, 3, target=(0, 0, 1))
    camera_data = bpy.data.cameras.new('Studio camera')
    camera = bpy.data.objects.new('Studio camera', camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (7.5, -9.5, 5.3)
    aim(camera, (0, 0, .78))
    camera_data.type = 'ORTHO'
    camera_data.ortho_scale = 7.5
    bpy.context.scene.camera = camera
    world = bpy.context.scene.world or bpy.data.worlds.new('Studio ambient')
    bpy.context.scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (.21, .26, .32, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = .45
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 48
    scene.render.resolution_x = 1440
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'AgX'
    scene.render.film_transparent = False
    scene.camera.data.lens = 55
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT / (path.stem + '.blend')))
    scene.render.filepath = str(RENDERS / (path.stem + '.png'))
    bpy.ops.render.render(write_still=True)
    print(f'Saved {path.stem}: .blend and studio PNG')


if __name__ == '__main__':
    for glb in sorted((ROOT / 'assets').glob('*.glb')):
        build(glb)
