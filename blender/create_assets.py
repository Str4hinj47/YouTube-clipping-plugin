"""Create the low-poly car and environment source assets for Neonline.

Run from the repository root with Blender 4.x:
    blender -b --python blender/create_assets.py -- --out public/assets

This intentionally keeps the scene dependency-free: all geometry is made from
Blender primitives, which makes the art direction easy to iterate on in-editor.
"""
import bpy
import math
import os
import sys
from mathutils import Vector


def args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    output = "assets"
    if "--out" in argv:
        output = argv[argv.index("--out") + 1]
    return os.path.abspath(output)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    # Keep the authored material handles below alive. Blender will clean unused
    # datablocks when the generated file is reopened or saved.


def material(name, color, metallic=0.0, roughness=0.5, emission=None, strength=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = strength
    return mat


PAINT = material("Midnight cobalt paint", (0.08, 0.12, 0.55), .8, .22)
LIME = material("Aurora lime trim", (0.68, 1.0, 0.18), .35, .22, (0.35, 0.95, 0.08), 2.4)
RUBBER = material("Tire rubber", (0.008, 0.012, 0.016), .05, .84)
RIM = material("Machined rims", (.46, .52, .56), .9, .18)
GLASS = material("Smoked glass", (.025, .09, .13), .55, .14, (.01, .08, .11), .6)
HEADLIGHT = material("Headlight white", (.8, .95, 1.0), .1, .2, (.6, .85, 1.0), 8)
TAIL = material("Tail light red", (1.0, .03, .04), .1, .2, (1.0, .01, .02), 7)
ASPHALT = material("Wet asphalt", (.035, .055, .075), .1, .92)
SIDEWALK = material("Concrete sidewalk", (.25, .3, .31), .05, .96)
GRASS = material("Night grass", (.04, .17, .12), .0, 1.0)
TRUNK = material("Tree trunk", (.15, .1, .08), .0, 1.0)
LEAF = material("Faceted leaf", (.07, .3, .22), .0, .94)
BUILDING = material("Building concrete", (.12, .2, .25), .08, .86)
WINDOW = material("Emissive windows", (.14, .65, .66), .15, .24, (.04, .38, .4), 4.0)
WATER = material("Aurora water", (.015, .14, .18), .45, .24, (.0, .05, .07), .8)


def cube(name, location, scale, mat, bevel=0.0, parent=None):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (scale[0] / 2, scale[1] / 2, scale[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new("small manufactured bevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    obj.data.materials.append(mat)
    if parent:
        obj.parent = parent
    return obj


def cylinder(name, location, radius, depth, mat, vertices=12, parent=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    if parent:
        obj.parent = parent
    return obj


def make_car():
    root = bpy.data.objects.new("MIDNIGHT GT / Blender vehicle", None)
    bpy.context.collection.objects.link(root)
    cube("lower aerodynamic body", (0, .62, 0), (2.25, .48, 4.35), PAINT, .12, root)
    cube("long bonnet", (0, .86, 1.35), (2.08, .24, 1.4), PAINT, .08, root)
    cube("rear deck", (0, .84, -1.48), (2.05, .23, 1.05), PAINT, .06, root)
    # Trapezoid cabin mesh, with the same hard-surface silhouette as the in-browser preview.
    vertices = [(-.86, .87, -.9), (.86, .87, -.9), (-.72, 1.74, -.34), (.72, 1.74, -.34),
                (-.72, 1.74, .72), (.72, 1.74, .72), (-.86, .87, .9), (.86, .87, .9)]
    faces = [(0, 1, 3, 2), (2, 3, 5, 4), (4, 5, 7, 6), (0, 2, 4, 6), (1, 7, 5, 3)]
    mesh = bpy.data.meshes.new("GT cabin mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(GLASS)
    cabin = bpy.data.objects.new("smoked glass cabin", mesh)
    bpy.context.collection.objects.link(cabin)
    cabin.parent = root
    cube("left side skirt", (-1.1, .47, 0), (.11, .2, 3.65), LIME, .025, root)
    cube("right side skirt", (1.1, .47, 0), (.11, .2, 3.65), LIME, .025, root)
    cube("rear diffuser", (0, .48, -2.16), (1.76, .12, .14), LIME, .02, root)
    for x in (-.71, .71):
        cube("white LED headlight", (x, .78, 2.16), (.28, .15, .08), HEADLIGHT, .02, root)
        cube("red tail light", (x, .76, -2.16), (.3, .14, .08), TAIL, .02, root)
    for x in (-1.14, 1.14):
        for z in (1.35, -1.35):
            bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=.46, depth=.3, location=(x, .46, z), rotation=(0, 0, math.pi / 2))
            tire = bpy.context.object
            tire.name = "wheel tire"
            tire.data.materials.append(RUBBER)
            tire.parent = root
            bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=.24, depth=.315, location=(x, .46, z), rotation=(0, 0, math.pi / 2))
            rim = bpy.context.object
            rim.name = "machined wheel hub"
            rim.data.materials.append(RIM)
            rim.parent = root
    cube("rear wing", (0, 1.2, -2.03), (1.7, .09, .13), LIME, .02, root)
    cube("wing left support", (-.73, 1.09, -2.03), (.08, .25, .08), RUBBER, .01, root)
    cube("wing right support", (.73, 1.09, -2.03), (.08, .25, .08), RUBBER, .01, root)
    return root


def make_building(name, location, width, depth, height, material_slot=BUILDING):
    root = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(root)
    root.location = location
    cube("modular building body", (0, height / 2, 0), (width, height, depth), material_slot, .04, root)
    for floor in range(max(2, int(height / 3.1))):
        y = 1.35 + floor * 3.05
        for col in range(max(2, int(width / 2.7))):
            x = -width / 2 + 1.35 + col * ((width - 2.2) / max(1, int(width / 2.7) - 1))
            cube("cyan lit window", (x, y, depth / 2 + .025), (.72, .45, .035), WINDOW, .015, root)
    return root


def make_tree(name, location, scale=1.0):
    root = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(root)
    root.location = location
    root.scale = (scale, scale, scale)
    cylinder("low poly trunk", (0, .75, 0), .22, 1.5, TRUNK, 7, root)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1.2, location=(0, 2.0, 0))
    leaves = bpy.context.object
    leaves.name = "faceted tree crown"
    leaves.data.materials.append(LEAF)
    leaves.parent = root
    return root


def make_streetlight(name, location):
    root = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(root)
    root.location = location
    cylinder("streetlight pole", (0, 2.35, 0), .07, 4.7, SIDEWALK, 7, root)
    cube("streetlight arm", (.55, 4.68, 0), (1.25, .08, .08), SIDEWALK, .02, root)
    cylinder("warm streetlight", (1.08, 4.57, 0), .16, .15, HEADLIGHT, 8, root)
    return root


def make_environment():
    root = bpy.data.objects.new("AURORA BAY / Blender environment", None)
    bpy.context.collection.objects.link(root)
    cube("ground plane", (0, -.15, 0), (270, .2, 270), GRASS, 0, root)
    cube("waterfront", (0, -.08, -121), (300, .12, 44), WATER, 0, root)
    for x in (-66, -22, 22, 66):
        cube("vertical asphalt road", (x, -.03, 0), (9.6, .1, 230), ASPHALT, 0, root)
    for z in (-66, -22, 22, 66):
        cube("horizontal asphalt road", (0, -.03, z), (230, .1, 9.6), ASPHALT, 0, root)
    for index, (x, z) in enumerate(((-91, -91), (-44, -91), (0, -91), (44, -91), (91, -91),
                                                       (-91, -44), (-44, -44), (44, -44), (91, -44),
                                                       (-91, 0), (-44, 0), (0, 0), (44, 0), (91, 0),
                                                       (-91, 44), (-44, 44), (44, 44), (91, 44),
                                                       (-91, 91), (-44, 91), (0, 91), (44, 91), (91, 91))):
        if z < -77:
            continue
        make_building(f"city block {index:02d}", (x, 0, z), 13 + (index % 3) * 3, 12 + (index % 2) * 4, 9 + (index % 5) * 3)
    for index, (x, z) in enumerate(((-61, 30), (-52, 47), (-34, 37), (-2, 50), (31, -88), (4, -91), (78, -92))):
        make_tree(f"faceted tree {index:02d}", (x, 0, z), .8 + (index % 3) * .12)
    for index, (x, z) in enumerate(((-73, -60), (-73, -16), (-73, 28), (-29, -60), (-29, 28), (15, -60), (59, -16), (59, 28))):
        make_streetlight(f"lamp {index:02d}", (x, 0, z))
    # Pulse Station landmark, designed as an emissive beacon with readable rings.
    station = bpy.data.objects.new("PULSE STATION landmark", None)
    bpy.context.collection.objects.link(station)
    station.location = (44, 0, -44)
    cylinder("station platform", (0, .18, 0), 7, .35, SIDEWALK, 32, station)
    for height in (.52, .75, .98):
        bpy.ops.mesh.primitive_torus_add(major_radius=3.7 - (height - .52) * 4, minor_radius=.065, major_segments=32, location=(0, height, 0))
        ring = bpy.context.object
        ring.name = "emissive station ring"
        ring.data.materials.append(LIME)
        ring.parent = station
    cylinder("station beacon", (0, 3.8, 0), .14, 7, LIME, 8, station)
    return root


def export_collection(obj, filepath):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    for child in obj.children_recursive:
        child.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(filepath=filepath, export_format="GLB", use_selection=True, export_apply=True)


def main():
    out = args()
    os.makedirs(out, exist_ok=True)
    clear_scene()
    car = make_car()
    environment = make_environment()
    export_collection(car, os.path.join(out, "midnight_gt.glb"))
    export_collection(environment, os.path.join(out, "aurora_bay_environment.glb"))
    print(f"Created Blender assets in {out}")


if __name__ == "__main__":
    main()
