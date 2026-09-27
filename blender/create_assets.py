"""Create the low-poly car and environment source assets for Neonline.

Run from the repository root with Blender 4.x:
    blender -b --python blender/create_assets.py -- --out assets

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
MOUNTAIN_GROUND = material("Mountain ground", (.08, .12, .12), .0, 1.0)
MOUNTAIN_ROCK = material("Mountain rock", (.15, .2, .21), .0, .94)
MOUNTAIN_ROCK_LIT = material("Mountain rock lit", (.25, .31, .3), .0, .9)
MOUNTAIN_ROAD = material("Mountain road asphalt", (.055, .07, .08), .08, .9)
MOUNTAIN_SHOULDER = material("Mountain road shoulder", (.34, .38, .36), .05, .95)
GUARDRAIL = material("Mountain guardrail", (.5, .56, .55), .72, .45)
CABIN_WOOD = material("Pinewatch cabin wood", (.38, .24, .17), .0, .88)
CABIN_ROOF = material("Pinewatch cabin roof", (.09, .12, .14), .05, .9)
VILLAGE_LIGHT = material("Pinewatch window light", (1.0, .5, .18), .05, .28, (1.0, .2, .04), 4.0)
SIGN_RED = material("Road sign red", (.55, .03, .05), .15, .34, (.24, .005, .01), 1.3)
SIGN_WHITE = material("Road sign white", (.88, .9, .88), .12, .38)
SIGN_GREEN = material("Traffic signal green", (.03, .48, .22), .08, .28, (.01, .2, .07), 2.5)
SIGN_AMBER = material("Traffic signal amber", (.85, .4, .05), .08, .3, (.5, .12, .01), 2.2)


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


def make_car(body_mat=PAINT, trim_mat=LIME, name="MIDNIGHT GT / Blender vehicle"):
    root = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(root)
    cube("lower aerodynamic body", (0, .62, 0), (2.25, .48, 4.35), body_mat, .12, root)
    cube("long bonnet", (0, .86, 1.35), (2.08, .24, 1.4), body_mat, .08, root)
    cube("rear deck", (0, .84, -1.48), (2.05, .23, 1.05), body_mat, .06, root)
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
    cube("left side skirt", (-1.1, .47, 0), (.11, .2, 3.65), trim_mat, .025, root)
    cube("right side skirt", (1.1, .47, 0), (.11, .2, 3.65), trim_mat, .025, root)
    cube("rear diffuser", (0, .48, -2.16), (1.76, .12, .14), trim_mat, .02, root)
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
    cube("rear wing", (0, 1.2, -2.03), (1.7, .09, .13), trim_mat, .02, root)
    cube("wing left support", (-.73, 1.09, -2.03), (.08, .25, .08), RUBBER, .01, root)
    cube("wing right support", (.73, 1.09, -2.03), (.08, .25, .08), RUBBER, .01, root)
    return root


FLEET_PROFILES = [
    ("hatch", "Metro Hatch", (.10, .42, .56), (.91, .94, .84)),
    ("supercar", "Veloce R", (.62, .08, .14), (.96, .82, 1.02)),
    ("suv", "Trail Scout", (.24, .28, .30), (1.08, 1.22, 1.02)),
    ("pickup", "Harbor Utility", (.12, .28, .44), (1.10, 1.07, 1.06)),
    ("wagon", "Grand Tourer", (.42, .18, .12), (1.04, 1.03, 1.10)),
    ("classic", "Cinder Classic", (.55, .12, .06), (1.10, 1.02, 1.05)),
    ("ev", "Pulse EV", (.32, .48, .44), (1.02, .98, 1.00)),
]


def make_car_variant(style, display_name, color, scale):
    body = material(f"{display_name} paint", color, .82, .2)
    trim = material(f"{display_name} trim", (.68, 1.0, .18), .36, .2, (.35, .95, .08), 1.8)
    root = make_car(body, trim, f"{display_name} / logo-free Blender vehicle")
    # Fine body seams and aero details are deliberately generic, without badges or logos.
    for x in (-1.08, 1.08):
        cube("precise door shut line", (x, .78, -.2), (.025, .02, 1.4), RUBBER, .005, root)
        cube("flush door handle", (x, .98, .22), (.035, .035, .28), RIM, .005, root)
    if style == "hatch":
        cube("upright hatch glass", (0, 1.25, -1.18), (1.5, .06, .72), GLASS, .02, root)
        cube("compact roof spoiler", (0, 1.52, -1.77), (1.58, .1, .18), trim, .02, root)
        cube("hatch lower bumper", (0, .55, -2.12), (1.95, .18, .2), RUBBER, .02, root)
    elif style == "supercar":
        cube("carbon front splitter", (0, .49, 2.2), (2.1, .08, .3), RUBBER, .02, root)
        cube("left aero fin", (-1.0, .62, .45), (.12, .28, 2.6), trim, .02, root)
        cube("right aero fin", (1.0, .62, .45), (.12, .28, 2.6), trim, .02, root)
        cube("low rear lip", (0, 1.02, -2.1), (1.5, .08, .12), trim, .015, root)
    elif style == "suv":
        cube("left roof rail", (-.72, 1.95, 0), (.1, .1, 2.9), RIM, .02, root)
        cube("right roof rail", (.72, 1.95, 0), (.1, .1, 2.9), RIM, .02, root)
        cube("front bull bar", (0, .63, 2.18), (2.15, .22, .16), RUBBER, .03, root)
        cylinder("rear spare tire", (0, 1.0, -2.22), .48, .18, RUBBER, 16, root)
    elif style == "pickup":
        cube("pickup bed left wall", (-.92, 1.02, -1.2), (.16, .48, 1.55), body, .03, root)
        cube("pickup bed right wall", (.92, 1.02, -1.2), (.16, .48, 1.55), body, .03, root)
        cube("pickup bed floor", (0, .82, -1.2), (1.75, .08, 1.55), RUBBER, .02, root)
        cube("pickup tailgate", (0, 1.02, -1.98), (1.9, .5, .14), body, .03, root)
    elif style == "wagon":
        cube("wagon long cargo roof", (0, 1.27, -.62), (1.75, .34, 1.75), body, .05, root)
        cube("wagon panoramic roof", (0, 1.47, -.55), (1.5, .045, 1.2), GLASS, .02, root)
        cube("wagon roof rail left", (-.71, 1.68, -.52), (.06, .06, 1.65), RIM, .01, root)
        cube("wagon roof rail right", (.71, 1.68, -.52), (.06, .06, 1.65), RIM, .01, root)
    elif style == "classic":
        cube("classic hood scoop", (0, 1.08, 1.2), (.72, .2, .52), body, .05, root)
        cube("classic chrome front bumper", (0, .62, 2.2), (2.34, .15, .16), RIM, .025, root)
        cube("classic chrome rear bumper", (0, .62, -2.2), (2.34, .15, .16), RIM, .025, root)
        cylinder("left side exhaust", (-1.12, .48, -.1), .07, 2.0, RIM, 8, root)
        cylinder("right side exhaust", (1.12, .48, -.1), .07, 2.0, RIM, 8, root)
    elif style == "ev":
        cube("EV panoramic roof", (0, 1.38, -.1), (1.58, .06, 2.0), GLASS, .02, root)
        cube("EV front light bar", (0, .82, 2.17), (1.45, .08, .06), trim, .02, root)
        cube("EV flush front panel", (0, .76, 1.82), (1.55, .12, .12), body, .02, root)
    root.scale = scale
    return root


def export_fleet(output):
    fleet_dir = os.path.join(output, "fleet")
    os.makedirs(fleet_dir, exist_ok=True)
    for style, display_name, color, scale in FLEET_PROFILES:
        variant = make_car_variant(style, display_name, color, scale)
        export_collection(variant, os.path.join(fleet_dir, f"{style}.glb"))


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


def make_traffic_signal(name, location):
    root = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(root)
    root.location = location
    cylinder("signal pole", (0, 2.3, 0), .08, 4.6, SIDEWALK, 8, root)
    cube("signal arm", (0, 4.5, -.9), (.1, .1, 3.2), SIDEWALK, .02, root)
    cube("three lamp signal housing", (0, 3.8, -2.5), (.42, 1.3, .34), SIDEWALK, .03, root)
    for y, mat in ((4.18, SIGN_RED), (3.82, SIGN_AMBER), (3.46, SIGN_GREEN)):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=6, radius=.105, location=(0, y, -2.7))
        lamp = bpy.context.object
        lamp.name = "signal lamp"
        lamp.data.materials.append(mat)
        lamp.parent = root
    return root


def make_stop_sign(name, location):
    root = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(root)
    root.location = location
    cylinder("stop sign pole", (0, .9, 0), .055, 1.8, SIDEWALK, 8, root)
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=.56, depth=.07, location=(0, 1.85, 0), rotation=(math.pi / 2, 0, 0))
    sign = bpy.context.object
    sign.name = "unbranded stop sign"
    sign.data.materials.append(SIGN_RED)
    sign.parent = root
    return root


def make_speed_sign(name, location):
    root = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(root)
    root.location = location
    cylinder("speed sign pole", (0, .95, 0), .05, 1.9, SIDEWALK, 8, root)
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=.53, depth=.06, location=(0, 1.9, 0), rotation=(math.pi / 2, 0, 0))
    sign = bpy.context.object
    sign.name = "unbranded speed limit sign"
    sign.data.materials.append(SIGN_WHITE)
    sign.parent = root
    return root


def make_path_ribbon(name, points, width, mat, parent):
    vertices = []
    faces = []
    for index, point in enumerate(points):
        previous = points[max(0, index - 1)]
        following = points[min(len(points) - 1, index + 1)]
        tangent = Vector((following[0] - previous[0], 0.0, following[2] - previous[2])).normalized()
        normal = Vector((tangent.z, 0.0, -tangent.x)) * (width / 2.0)
        vertices.extend(((point[0] - normal.x, point[1], point[2] - normal.z),
                         (point[0] + normal.x, point[1], point[2] + normal.z)))
        if index < len(points) - 1:
            base = index * 2
            faces.extend(((base, base + 1, base + 2), (base + 1, base + 3, base + 2)))
    mesh = bpy.data.meshes.new(name + " mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(mat)
    ribbon = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(ribbon)
    ribbon.parent = parent
    return ribbon


def make_mountain_rock(name, location, radius, height, mat, parent):
    bpy.ops.mesh.primitive_cone_add(vertices=7, radius1=radius, radius2=radius * .2, depth=height, location=location)
    rock = bpy.context.object
    rock.name = name
    rock.data.materials.append(mat)
    rock.parent = parent
    return rock


def make_pinewatch_cabin(name, location, width, depth, height, rotation, parent):
    cabin = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(cabin)
    cabin.location = location
    cabin.rotation_euler[1] = rotation
    cube("mountain cabin body", (0, height / 2, 0), (width, height, depth), CABIN_WOOD, .08, cabin)
    bpy.ops.mesh.primitive_cone_add(vertices=4, radius=max(width, depth) * .72, depth=height * .56, location=(0, height + height * .23, 0), rotation=(0, 0, math.pi / 4))
    roof = bpy.context.object
    roof.name = "mountain cabin pitched roof"
    roof.data.materials.append(CABIN_ROOF)
    roof.parent = cabin
    cube("warm cabin window", (0, height * .54, depth / 2 + .04), (width * .26, height * .2, .06), VILLAGE_LIGHT, .02, cabin)
    cube("cabin porch", (0, .16, depth / 2 + .55), (width * .55, .22, 1.0), SIDEWALK, .03, cabin)
    return cabin


def make_mountain_extension(root):
    cube("mountain extension ground", (0, -.22, 50), (520, .2, 520), MOUNTAIN_GROUND, 0, root)
    points = [(66, .08, 108), (70, .22, 125), (84, .62, 139), (112, 1.5, 151),
              (138, 3.4, 147), (160, 6.8, 128), (170, 11.8, 102), (158, 15.6, 80), (136, 18.5, 68)]
    make_path_ribbon("mountain pass shoulder", points, 10.6, MOUNTAIN_SHOULDER, root)
    make_path_ribbon("mountain pass two lane road", points, 8.8, MOUNTAIN_ROAD, root)
    for index in range(1, len(points)):
        start = Vector(points[index - 1])
        end = Vector(points[index])
        flat = Vector((end.x - start.x, 0, end.z - start.z))
        length = flat.length()
        heading = math.atan2(flat.x, flat.z)
        tangent = flat.normalized()
        normal = Vector((tangent.z, 0, -tangent.x))
        for distance in range(4, max(4, int(length - 2)), 9):
            amount = distance / length
            center = start.lerp(end, amount)
            center.y += .09
            cube("mountain center dash", center, (.16, .03, 4.1), SIGN_AMBER, .01, root).rotation_euler[1] = heading
        for side in (-1, 1):
            edge = start.lerp(end, .5) + normal * (side * 4.05)
            edge.y += .1
            cube("mountain road edge line", edge, (.09, .035, length), SIGN_WHITE, .005, root).rotation_euler[1] = heading
            rail = start.lerp(end, .5) + normal * (side * 5.35)
            rail.y += .78
            cube("mountain guardrail beam", rail, (.11, .11, length), GUARDRAIL, .02, root).rotation_euler[1] = heading
        for distance in range(4, max(4, int(length)), 10):
            amount = distance / length
            center = start.lerp(end, amount)
            center.y += .45
            for side in (-1, 1):
                post = center + normal * (side * 5.35)
                cylinder("mountain guardrail post", post, .055, 1.1, GUARDRAIL, 6, root)
    for index, (x, z, radius, height) in enumerate(((106, 165, 45, 62), (176, 153, 52, 76), (192, 88, 42, 58),
                                                      (118, 79, 36, 47), (57, 184, 36, 48), (214, 190, 38, 54),
                                                      (82, 121, 25, 34), (170, 208, 44, 64))):
        make_mountain_rock(f"mountain ridge {index:02d}", (x, height / 2 - .12, z), radius, height,
                           MOUNTAIN_ROCK_LIT if index % 2 else MOUNTAIN_ROCK, root)
    cabins = ((136, 68, 7.2, 5.2, 4.8, -.25), (151, 65, 6.4, 5.0, 4.3, .5),
              (145, 53, 7.8, 5.4, 4.7, 1.1), (126, 55, 6.0, 4.6, 4.0, -.7),
              (159, 77, 5.8, 4.4, 4.1, .1), (119, 73, 5.5, 4.2, 3.8, .8))
    for index, cabin in enumerate(cabins):
        make_pinewatch_cabin("Pinewatch cabin %02d" % index, (cabin[0], 0, cabin[1]), cabin[2], cabin[3], cabin[4], cabin[5], root)
    for index, location in enumerate(((128, 68), (144, 62), (157, 72))):
        make_streetlight("Pinewatch lamp %02d" % index, (location[0], 0, location[1]))


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
    for index, (x, z) in enumerate(((-66, -66), (22, -66), (66, -22), (-22, 22), (66, 66), (-66, 66))):
        make_traffic_signal(f"traffic signal {index:02d}", (x + 5.6, 0, z + 5.6))
    for index, (x, z) in enumerate(((-66, -22), (-22, -66), (22, 22), (22, 66), (-66, 22), (66, 22))):
        make_stop_sign(f"stop sign {index:02d}", (x + (5.8 if index % 2 else -5.8), 0, z + (-5.8 if index % 2 else 5.8)))
    for index, (x, z) in enumerate(((-66, -44), (-22, 44), (22, -44), (66, 44), (44, 66), (-44, -66))):
        make_speed_sign(f"speed sign {index:02d}", (x, 0, z))
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
    make_mountain_extension(root)
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
    export_fleet(out)
    print(f"Created Blender assets, including {len(FLEET_PROFILES)} logo-free fleet variants, in {out}")


if __name__ == "__main__":
    main()
