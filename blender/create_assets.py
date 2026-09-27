"""Create the detailed logo-free car and modular environment source assets for Neonline.

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
CYAN = material("Aurora cyan trim", (0.16, 0.78, 0.78), .3, .24, (0.04, 0.62, 0.66), 3.8)
PINK = material("Aurora magenta trim", (0.95, 0.16, 0.48), .26, .26, (0.58, 0.03, 0.3), 3.2)
AMBER = material("Aurora amber trim", (1.0, 0.48, 0.14), .24, .3, (0.72, 0.12, 0.025), 2.8)
DARK_METAL = material("Landmark dark metal", (0.035, 0.055, 0.07), .72, .34)
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
FOREST_GROUND = material("Redwood forest ground", (.055, .18, .12), .0, 1.0)
LAKE_GROUND = material("Lake Aurora shore", (.025, .16, .2), .28, .35, (.0, .04, .06), .65)
DESERT_GROUND = material("Cinder Flats sand", (.28, .16, .09), .0, 1.0)
INDUSTRIAL_GROUND = material("Eastgate industrial ground", (.11, .14, .16), .12, .92)
RURAL_GROUND = material("Southern rural ground", (.12, .24, .13), .0, 1.0)
REGION_ROAD = material("Regional route asphalt", (.045, .06, .07), .08, .91)
REGION_SHOULDER = material("Regional route shoulder", (.28, .32, .3), .04, .96)
SIGN_RED = material("Road sign red", (.55, .03, .05), .15, .34, (.24, .005, .01), 1.3)
SIGN_WHITE = material("Road sign white", (.88, .9, .88), .12, .38)
SIGN_GREEN = material("Traffic signal green", (.03, .48, .22), .08, .28, (.01, .2, .07), 2.5)
SIGN_AMBER = material("Traffic signal amber", (.85, .4, .05), .08, .3, (.5, .12, .01), 2.2)
# Automotive finish materials. They stay logo-free, but give the cars the
# layered material breakup of a real production vehicle instead of one material
# being stretched over every part.
BLACK_PLASTIC = material("Textured black exterior plastic", (.012, .017, .021), .12, .42)
CARBON = material("Forged carbon aero", (.018, .025, .03), .62, .28)
CHROME = material("Brushed chrome", (.72, .78, .8), .92, .16)
GRILLE = material("Satin black grille", (.008, .012, .016), .32, .3)
INTERIOR = material("Dark interior", (.018, .025, .032), .0, .78)
BRAKE_DISC = material("Ventilated brake disc", (.24, .27, .28), .78, .3)
BRAKE_CALIPER = material("Brake caliper red", (.72, .035, .025), .42, .24, (.28, .008, .004), 1.4)
INDICATOR = material("Amber indicator", (1.0, .34, .025), .08, .2, (.95, .12, .008), 5.0)
REVERSE = material("Reverse lamp white", (.86, .95, 1.0), .08, .18, (.52, .75, .95), 4.0)
LICENSE_PLATE = material("Blank license plate", (.72, .76, .72), .12, .36)


def finish_mesh(obj, smooth=False, bevel=0.0):
    """Give generated hard-surface parts clean normals and restrained edge radii."""
    if obj.type != "MESH":
        return obj
    if smooth:
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    if bevel:
        modifier = obj.modifiers.new("manufactured edge radius", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
        modifier.limit_method = "ANGLE"
        modifier.angle_limit = math.radians(28)
        modifier.harden_normals = True
    normals = obj.modifiers.new("weighted production normals", "WEIGHTED_NORMAL")
    try:
        normals.keep_sharp = True
    except AttributeError:
        pass
    return obj


def cube(name, location, scale, mat, bevel=0.0, parent=None):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (scale[0] / 2, scale[1] / 2, scale[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    finish_mesh(obj, bevel=bevel)
    if parent:
        obj.parent = parent
    return obj


def cylinder(name, location, radius, depth, mat, vertices=12, parent=None, rotation=None, smooth=True, bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
        rotation=rotation or (0, 0, 0),
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    finish_mesh(obj, smooth=smooth, bevel=bevel)
    if parent:
        obj.parent = parent
    return obj


def uv_sphere(name, location, scale, mat, parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    finish_mesh(obj, smooth=True)
    if parent:
        obj.parent = parent
    return obj


def torus(name, location, major_radius, minor_radius, mat, rotation=(0, 0, 0), parent=None):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=32,
        minor_segments=10,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    finish_mesh(obj, smooth=True)
    if parent:
        obj.parent = parent
    return obj


def orient_game_space_root(root):
    """Convert the generator's X/Y-height/Z-forward convention to Blender Z-up."""
    root.rotation_euler[0] = math.pi / 2
    return root


def mesh_object(name, vertices, faces, mat, parent=None, smooth=False, bevel=0.0):
    mesh = bpy.data.meshes.new(f"{name} mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    finish_mesh(obj, smooth=smooth, bevel=bevel)
    if parent:
        obj.parent = parent
    return obj


def beam_between(name, start, end, thickness, mat, parent=None, bevel=0.0):
    start = Vector(start)
    end = Vector(end)
    direction = end - start
    length = max(direction.length, .001)
    obj = cube(name, (start + end) / 2, (thickness, thickness, length), mat, bevel, parent)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    return obj


def rounded_hull(name, stations, mat, parent=None):
    """Loft a softly rounded automotive shell through front-to-rear stations."""
    vertices = []
    ring_size = 13
    for z, width, bottom, top in stations:
        cross_section = [
            (-width * .70, bottom),
            (-width * .92, bottom + .045),
            (-width, bottom + .18),
            (-width * .98, bottom + .43),
            (-width * .82, top - .13),
            (-width * .46, top - .025),
            (0, top),
            (width * .46, top - .025),
            (width * .82, top - .13),
            (width * .98, bottom + .43),
            (width, bottom + .18),
            (width * .92, bottom + .045),
            (width * .70, bottom),
        ]
        vertices.extend((x, y, z) for x, y in cross_section)
    faces = []
    for station_index in range(len(stations) - 1):
        current = station_index * ring_size
        following = (station_index + 1) * ring_size
        for point_index in range(ring_size):
            next_point = (point_index + 1) % ring_size
            # Reverse the winding so the outside of both shoulders faces out.
            faces.append((following + point_index, following + next_point, current + next_point, current + point_index))
    faces.append(tuple(range(ring_size - 1, -1, -1)))
    end = (len(stations) - 1) * ring_size
    faces.append(tuple(end + point_index for point_index in range(ring_size)))
    return mesh_object(name, vertices, faces, mat, parent, smooth=True, bevel=.018)


def make_wheel(root, side, z, wheel_style="sport"):
    """Build a production-style wheel with sidewall, rotor, caliper, hub, and spokes."""
    x = side * 1.15
    side_name = "left" if side < 0 else "right"
    tire = cylinder(
        f"{side_name} wheel tire",
        (x, .49, z),
        .48,
        .31,
        RUBBER,
        32,
        root,
        rotation=(0, math.pi / 2, 0),
        smooth=True,
        bevel=.035,
    )
    # The name is intentionally kept compatible with the runtime wheel animation.
    tire.name = f"{side_name} wheel tire"
    outer_x = x + side * .17
    torus(f"{side_name} tire sidewall bead", (outer_x, .49, z), .365, .045, RUBBER, (0, math.pi / 2, 0), root)
    cylinder(f"{side_name} ventilated brake disc", (outer_x + side * .012, .49, z), .365, .035, BRAKE_DISC, 32, root, rotation=(0, math.pi / 2, 0), smooth=True, bevel=.008)
    cylinder(f"{side_name} machined wheel hub", (outer_x + side * .04, .49, z), .31, .055, RIM, 32, root, rotation=(0, math.pi / 2, 0), smooth=True, bevel=.012)
    cylinder(f"{side_name} wheel center cap", (outer_x + side * .082, .49, z), .09, .065, CHROME, 20, root, rotation=(0, math.pi / 2, 0), smooth=True, bevel=.01)
    for spoke_index in range(5):
        angle = (spoke_index / 5) * math.tau + math.pi / 2
        spoke_y = .49 + math.sin(angle) * .16
        spoke_z = z + math.cos(angle) * .16
        spoke = cube(f"{side_name} wheel spoke {spoke_index + 1}", (outer_x + side * .085, spoke_y, spoke_z), (.045, .065, .27), RIM, .012, root)
        spoke.rotation_euler[0] = angle
    caliper = cube(f"{side_name} brake caliper", (outer_x + side * .055, .62, z + .16), (.075, .15, .28), BRAKE_CALIPER, .025, root)
    caliper.rotation_euler[0] = -.14
    # Subtle center groove makes the tire read as a manufactured compound, not a black cylinder.
    torus(f"{side_name} rim outer lip", (outer_x + side * .11, .49, z), .285, .018, CHROME, (0, math.pi / 2, 0), root)
    return tire


def make_car(body_mat=PAINT, trim_mat=LIME, name="MIDNIGHT GT / Blender vehicle"):
    """Build a smooth, generic performance coupe with real automotive part breakup.

    The silhouette is intentionally logo-free and not a one-to-one brand copy, but
    the proportions, panel gaps, glazing, lighting, brakes, wheel arches, and aero
    surfaces are based on production sports coupes rather than stacked primitives.
    """
    root = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(root)

    body_stations = [
        (-2.25, .72, .43, .85), (-2.14, .93, .42, .94), (-1.84, 1.075, .42, 1.00),
        (-1.35, 1.13, .43, 1.04), (-.65, 1.15, .43, 1.055), (.2, 1.16, .43, 1.06),
        (1.02, 1.13, .43, 1.04), (1.62, 1.07, .42, 1.00), (2.08, .94, .42, .94),
        (2.25, .76, .43, .84),
    ]
    rounded_hull("sculpted one-piece body shell", body_stations, body_mat, root)

    # Separate hood/deck surfaces and lower fascias create believable part lines.
    cube("front hood skin", (0, 1.02, 1.38), (1.88, .075, 1.18), body_mat, .075, root)
    cube("rear deck skin", (0, .98, -1.53), (1.84, .075, .84), body_mat, .065, root)
    cube("front bumper fascia", (0, .64, 2.17), (1.98, .28, .22), BLACK_PLASTIC, .075, root)
    cube("rear bumper fascia", (0, .64, -2.13), (1.98, .27, .22), BLACK_PLASTIC, .075, root)
    cube("front carbon splitter", (0, .52, 2.27), (1.92, .09, .22), CARBON, .025, root)
    cube("rear diffuser center", (0, .52, -2.25), (1.72, .12, .18), CARBON, .025, root)

    # A closed glass volume gives the cabin continuous reflections; pillars and seals
    # are layered over it to keep the silhouette clean from every camera angle.
    cabin_stations = [
        (-1.16, .62, .94, 1.40), (-.92, .75, .95, 1.66), (-.18, .80, .96, 1.78),
        (.58, .77, .95, 1.72), (1.04, .64, .94, 1.42),
    ]
    rounded_hull("continuous smoked glass cabin", cabin_stations, GLASS, root)
    cube("dark cabin interior", (0, 1.05, -.05), (1.34, .12, 1.7), INTERIOR, .04, root)
    for side in (-1, 1):
        prefix = "left" if side < 0 else "right"
        beam_between(f"{prefix} A pillar", (side * .68, 1.02, .97), (side * .57, 1.65, .59), .075, BLACK_PLASTIC, root, .018)
        beam_between(f"{prefix} B pillar", (side * .78, 1.03, .12), (side * .72, 1.70, .08), .072, BLACK_PLASTIC, root, .016)
        beam_between(f"{prefix} C pillar", (side * .65, 1.02, -.82), (side * .53, 1.42, -.93), .082, BLACK_PLASTIC, root, .018)
        beam_between(f"{prefix} lower window seal", (side * 1.03, .99, -.8), (side * 1.03, .99, .72), .035, RUBBER, root, .008)
        mirror = uv_sphere(f"{prefix} aerodynamic mirror housing", (side * .91, 1.23, .67), (.22, .12, .13), body_mat, root)
        mirror.rotation_euler[0] = -.14
        uv_sphere(f"{prefix} mirror glass", (side * 1.075, 1.235, .67), (.018, .095, .085), GLASS, root)
        beam_between(f"{prefix} mirror stalk", (side * .8, 1.12, .68), (side * .96, 1.2, .68), .045, BLACK_PLASTIC, root, .01)

        # Wheel-arch bead and lower side sill sit outside the body shell.
        torus(f"{prefix} front fender arch bead", (side * 1.145, .51, 1.35), .535, .045, BLACK_PLASTIC, (0, math.pi / 2, 0), root)
        torus(f"{prefix} rear fender arch bead", (side * 1.145, .51, -1.35), .535, .045, BLACK_PLASTIC, (0, math.pi / 2, 0), root)
        cube(f"{prefix} aerodynamic side sill", (side * 1.105, .51, 0), (.11, .18, 3.48), trim_mat, .028, root)
        cube(f"{prefix} side intake", (side * 1.14, .72, .35), (.055, .22, .56), GRILLE, .018, root)
        cube(f"{prefix} side intake blade", (side * 1.175, .73, .35), (.03, .08, .4), trim_mat, .01, root)
        beam_between(f"{prefix} door shut line", (side * 1.155, .82, -.76), (side * 1.155, .82, .58), .018, RUBBER, root, .004)
        cube(f"{prefix} flush door handle", (side * 1.165, 1.0, .08), (.035, .035, .27), CHROME, .008, root)
        cylinder(f"{prefix} fuel door", (side * 1.16, .86, -.72), .13, .022, body_mat, 24, root, rotation=(0, math.pi / 2, 0), smooth=True, bevel=.008)

    # Hood shut lines, front grille, and intake vanes.
    for side in (-1, 1):
        beam_between("hood shut line", (side * .45, 1.062, .72), (side * .45, 1.062, 1.95), .017, RUBBER, root, .004)
    cube("upper front grille surround", (0, .77, 2.24), (1.12, .2, .07), GRILLE, .03, root)
    cube("lower front intake surround", (0, .62, 2.285), (1.44, .13, .06), GRILLE, .022, root)
    for index in range(5):
        x = -.46 + index * .23
        cube("front grille horizontal vane", (x, .77, 2.285), (.028, .13, .04), CHROME, .008, root)
    for side in (-1, 1):
        prefix = "left" if side < 0 else "right"
        cube(f"{prefix} headlight smoked housing", (side * .67, .91, 2.15), (.54, .17, .095), GRILLE, .035, root)
        cube(f"{prefix} headlight projector", (side * .67, .92, 2.17), (.28, .105, .045), HEADLIGHT, .018, root)
        cube(f"{prefix} white LED headlight", (side * .67, .86, 2.215), (.44, .035, .028), HEADLIGHT, .012, root)
        cube(f"{prefix} amber front indicator", (side * .92, .84, 2.19), (.12, .045, .035), INDICATOR, .012, root)

    # Rear lighting and the blank, logo-free plate recess.
    cube("rear tail light dark housing", (0, .86, -2.15), (1.72, .16, .08), GRILLE, .03, root)
    for side in (-1, 1):
        prefix = "left" if side < 0 else "right"
        cube(f"{prefix} red tail light", (side * .63, .88, -2.205), (.52, .07, .055), TAIL, .018, root)
        cube(f"{prefix} rear indicator", (side * .92, .84, -2.2), (.11, .045, .035), INDICATOR, .012, root)
    cube("rear center reverse lamp", (0, .84, -2.21), (.28, .045, .035), REVERSE, .012, root)
    cube("blank rear license plate", (0, .69, -2.235), (.62, .22, .035), LICENSE_PLATE, .018, root)
    cube("rear plate shadow recess", (0, .68, -2.255), (.72, .27, .025), GRILLE, .012, root)
    for side in (-1, 1):
        cylinder(f"{('left' if side < 0 else 'right')} exhaust tip", (side * .55, .57, -2.27), .085, .18, CHROME, 16, root, rotation=(0, 0, 0), smooth=True, bevel=.012)

    cube("rear spoiler blade", (0, 1.19, -2.03), (1.62, .095, .14), trim_mat, .025, root)
    beam_between("left spoiler support", (-.68, 1.04, -2.03), (-.68, 1.18, -2.03), .07, CARBON, root, .012)
    beam_between("right spoiler support", (.68, 1.04, -2.03), (.68, 1.18, -2.03), .07, CARBON, root, .012)

    for side in (-1, 1):
        make_wheel(root, side, 1.35)
        make_wheel(root, side, -1.35)
    orient_game_space_root(root)
    return root


def make_golf6_starter(body_mat=None, trim_mat=None, name="Golf 6 starter hatch / handmade Blender vehicle"):
    """Build the starter as a hand-authored, logo-free Mk6 compact hatchback.

    This is not the browser procedural car generator and does not use badges or
    trademarked marks.  The proportions deliberately follow a late-2000s compact
    five-door hatch: short front overhang, upright greenhouse, thick C-pillars,
    almost vertical hatch glass, modest wheel/tire package, and practical bumpers.
    """
    body_mat = body_mat or material("Starter deep graphite paint", (.055, .07, .085), .78, .24)
    trim_mat = trim_mat or material("Starter subtle blue trim", (.11, .28, .62), .35, .24, (.015, .075, .18), 1.1)
    root = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(root)

    # Main steel shell: compact hatchback proportions instead of a long sports coupe.
    body_stations = [
        (-1.98, .74, .42, .94), (-1.78, .91, .42, 1.08), (-1.38, 1.02, .42, 1.18),
        (-.72, 1.06, .42, 1.22), (.08, 1.08, .42, 1.22), (.78, 1.06, .42, 1.18),
        (1.34, 1.00, .42, 1.09), (1.76, .88, .42, 1.00), (1.94, .70, .43, .88),
    ]
    rounded_hull("golf6 compact rounded body shell", body_stations, body_mat, root)

    # Hatchback-specific upright roof and rear quarter massing.
    cube("golf6 flat roof panel", (0, 1.58, -.34), (1.58, .12, 1.78), body_mat, .07, root)
    cube("golf6 rear hatch metal surround", (0, 1.16, -1.73), (1.52, .64, .28), body_mat, .06, root)
    cube("golf6 lower tailgate skin", (0, .82, -1.92), (1.74, .42, .16), body_mat, .05, root)
    cube("golf6 front hood slab with softened crown", (0, 1.10, 1.18), (1.72, .095, 1.12), body_mat, .075, root)
    cube("golf6 front bumper painted cover", (0, .68, 1.92), (1.86, .34, .22), body_mat, .07, root)
    cube("golf6 rear bumper painted cover", (0, .66, -2.02), (1.86, .32, .24), body_mat, .07, root)
    cube("golf6 black lower front valance", (0, .49, 2.02), (1.74, .16, .14), BLACK_PLASTIC, .03, root)
    cube("golf6 black rear lower valance", (0, .49, -2.09), (1.62, .16, .14), BLACK_PLASTIC, .03, root)

    # Glasshouse with tall windshield, separate side windows, and thick rear pillar.
    cabin_stations = [
        (-1.34, .60, 1.02, 1.32), (-1.08, .72, 1.04, 1.58), (-.48, .78, 1.05, 1.72),
        (.34, .77, 1.05, 1.72), (.96, .69, 1.04, 1.55), (1.32, .55, 1.02, 1.31),
    ]
    rounded_hull("golf6 continuous dark greenhouse glass", cabin_stations, GLASS, root)
    cube("golf6 dark cabin interior volume", (0, 1.14, -.12), (1.28, .22, 1.9), INTERIOR, .035, root)
    cube("golf6 upright rear hatch glass", (0, 1.32, -1.58), (1.28, .075, .72), GLASS, .03, root)
    cube("golf6 windshield reflective pane", (0, 1.34, .92), (1.30, .075, .74), GLASS, .03, root)
    cube("golf6 panoramic roof dark insert", (0, 1.665, -.24), (1.16, .035, .92), GLASS, .02, root)

    for side in (-1, 1):
        prefix = "left" if side < 0 else "right"
        # Pillars and beltline seals keep the greenhouse recognisably Mk6-hatch-like.
        beam_between(f"{prefix} golf6 A pillar black", (side * .69, 1.05, .72), (side * .57, 1.66, .43), .082, BLACK_PLASTIC, root, .016)
        beam_between(f"{prefix} golf6 B pillar black", (side * .82, 1.04, -.18), (side * .75, 1.70, -.18), .092, BLACK_PLASTIC, root, .016)
        beam_between(f"{prefix} golf6 thick C pillar body color", (side * .74, 1.06, -.94), (side * .58, 1.58, -1.24), .17, body_mat, root, .025)
        beam_between(f"{prefix} golf6 lower window rubber seal", (side * 1.02, 1.02, -1.18), (side * 1.02, 1.02, .62), .038, RUBBER, root, .006)
        beam_between(f"{prefix} golf6 roof drip rail", (side * .82, 1.64, -1.18), (side * .70, 1.68, .54), .038, BLACK_PLASTIC, root, .008)

        # Five-door shut lines and practical handles.
        beam_between(f"{prefix} golf6 front door shut line", (side * 1.085, .72, .34), (side * 1.085, 1.10, .34), .018, RUBBER, root, .004)
        beam_between(f"{prefix} golf6 rear door shut line", (side * 1.095, .72, -.58), (side * 1.095, 1.12, -.58), .018, RUBBER, root, .004)
        beam_between(f"{prefix} golf6 hatch side shut line", (side * .86, .84, -1.44), (side * .86, 1.32, -1.73), .018, RUBBER, root, .004)
        cube(f"{prefix} golf6 front flush door handle", (side * 1.12, 1.02, .08), (.038, .04, .24), CHROME, .008, root)
        cube(f"{prefix} golf6 rear flush door handle", (side * 1.12, 1.02, -.78), (.038, .04, .24), CHROME, .008, root)
        cylinder(f"{prefix} golf6 round fuel flap", (side * 1.11, .89, -1.10), .115, .02, body_mat, 24, root, rotation=(0, math.pi / 2, 0), smooth=True, bevel=.006)

        # Compact hatch mirrors, wheel arches, rocker plastics, and side molding.
        mirror = uv_sphere(f"{prefix} golf6 compact mirror housing", (side * .94, 1.22, .58), (.18, .095, .115), body_mat, root)
        mirror.rotation_euler[0] = -.08
        uv_sphere(f"{prefix} golf6 mirror glass", (side * 1.07, 1.225, .58), (.016, .082, .074), GLASS, root)
        beam_between(f"{prefix} golf6 mirror stalk", (side * .81, 1.13, .57), (side * .96, 1.19, .58), .04, BLACK_PLASTIC, root, .008)
        torus(f"{prefix} golf6 front wheel arch plastic lip", (side * 1.075, .50, 1.18), .505, .038, BLACK_PLASTIC, (0, math.pi / 2, 0), root)
        torus(f"{prefix} golf6 rear wheel arch plastic lip", (side * 1.075, .50, -1.26), .505, .038, BLACK_PLASTIC, (0, math.pi / 2, 0), root)
        cube(f"{prefix} golf6 textured rocker skirt", (side * 1.065, .49, -.05), (.105, .145, 3.18), BLACK_PLASTIC, .025, root)
        cube(f"{prefix} golf6 slim side rub strip", (side * 1.105, .81, -.25), (.036, .045, 2.18), BLACK_PLASTIC, .009, root)

    # Nose: plain twin-bar grille, projector lamps and lower intakes, all badge-free.
    cube("golf6 upper black grille opening", (0, .86, 1.965), (1.14, .14, .075), GRILLE, .024, root)
    cube("golf6 grille upper chrome blade", (0, .915, 1.99), (1.08, .035, .035), CHROME, .006, root)
    cube("golf6 grille lower chrome blade", (0, .805, 1.99), (1.08, .035, .035), CHROME, .006, root)
    cube("golf6 lower honeycomb intake", (0, .58, 2.05), (1.42, .115, .07), GRILLE, .02, root)
    for x in (-.48, -.24, 0, .24, .48):
        cube("golf6 lower intake vertical rib", (x, .585, 2.085), (.026, .09, .035), BLACK_PLASTIC, .006, root)
    for side in (-1, 1):
        prefix = "left" if side < 0 else "right"
        cube(f"{prefix} golf6 rounded headlight housing", (side * .61, .93, 1.90), (.54, .16, .09), GRILLE, .032, root)
        cylinder(f"{prefix} golf6 round headlamp projector", (side * .50, .94, 1.94), .105, .035, HEADLIGHT, 24, root, rotation=(math.pi / 2, 0, 0), smooth=True, bevel=.006)
        cylinder(f"{prefix} golf6 inner headlamp reflector", (side * .70, .94, 1.94), .078, .03, HEADLIGHT, 20, root, rotation=(math.pi / 2, 0, 0), smooth=True, bevel=.006)
        cube(f"{prefix} golf6 amber bumper side marker", (side * .91, .69, 1.96), (.10, .045, .035), INDICATOR, .01, root)

    # Rear: wide hatch seam, simple lamps, rear wiper, blank plate recess, single exhaust.
    cube("golf6 rear hatch shut seam top", (0, 1.535, -1.61), (1.34, .03, .035), RUBBER, .004, root)
    cube("golf6 rear hatch center shut seam", (0, .96, -2.018), (1.48, .026, .035), RUBBER, .004, root)
    cube("golf6 blank rear plate recess", (0, .78, -2.115), (.64, .20, .035), LICENSE_PLATE, .012, root)
    cube("golf6 black rear plate pocket shadow", (0, .78, -2.135), (.74, .27, .025), GRILLE, .01, root)
    beam_between("golf6 rear window wiper arm", (-.16, 1.41, -1.965), (.24, 1.33, -1.965), .028, BLACK_PLASTIC, root, .006)
    cylinder("golf6 rear wiper pivot", (-.2, 1.405, -1.965), .035, .025, BLACK_PLASTIC, 16, root, rotation=(math.pi / 2, 0, 0), smooth=True, bevel=.004)
    for side in (-1, 1):
        prefix = "left" if side < 0 else "right"
        cube(f"{prefix} golf6 red tail lamp outer lens", (side * .68, .93, -2.075), (.34, .15, .055), TAIL, .02, root)
        cube(f"{prefix} golf6 red tail lamp inner lens", (side * .42, .96, -2.085), (.20, .10, .046), TAIL, .014, root)
        cube(f"{prefix} golf6 rear amber indicator", (side * .82, .83, -2.08), (.10, .045, .035), INDICATOR, .01, root)
        cube(f"{prefix} golf6 reverse lamp", (side * .35, .82, -2.085), (.12, .045, .032), REVERSE, .01, root)
    cylinder("golf6 single left exhaust tip", (-.48, .50, -2.16), .065, .16, CHROME, 18, root, rotation=(0, 0, 0), smooth=True, bevel=.01)
    cube("golf6 small roof spoiler", (0, 1.67, -1.70), (1.42, .09, .18), body_mat, .025, root)
    cube("golf6 high center brake light", (0, 1.61, -1.80), (.44, .035, .032), TAIL, .008, root)

    # Handmade, asset-level wheel detail, not the game's procedural car mesh.
    for side in (-1, 1):
        make_wheel(root, side, 1.18, "compact")
        make_wheel(root, side, -1.26, "compact")
    orient_game_space_root(root)
    return root


FLEET_PROFILES = [
    ("hatch", "Metro Hatch", (.10, .42, .56), (.91, .94, .84)),
    ("supercar", "Veloce R", (.62, .08, .14), (.96, .82, 1.02)),
    ("suv", "Trail Scout", (.24, .28, .30), (1.08, 1.22, 1.02)),
    ("pickup", "Harbor Utility", (.12, .28, .44), (1.10, 1.07, 1.06)),
    ("wagon", "Grand Tourer", (.42, .18, .12), (1.04, 1.03, 1.10)),
    ("classic", "Cinder Classic", (.55, .12, .06), (1.10, 1.02, 1.05)),
    ("ev", "Pulse EV", (.32, .48, .44), (1.02, .98, 1.00)),
    ("sport", "Midnight GT", (.08, .12, .55), (1.0, 1.0, 1.0)),
]


def make_car_variant(style, display_name, color, scale):
    body = material(f"{display_name} paint", color, .82, .2)
    trim = material(f"{display_name} trim", (.68, 1.0, .18), .36, .2, (.35, .95, .08), 1.8)
    root = make_car(body, trim, f"{display_name} / logo-free Blender vehicle")
    # Fine body seams are deliberately generic, without badges or logos.
    for side in (-1, 1):
        prefix = "left" if side < 0 else "right"
        cube(f"{prefix} precision door crease", (side * 1.17, .74, -.08), (.022, .024, 1.36), RUBBER, .004, root)
        cube(f"{prefix} lower door crease", (side * 1.17, .61, -.18), (.018, .018, 1.25), trim, .003, root)
    if style == "hatch":
        cube("upright hatch glass", (0, 1.28, -1.18), (1.42, .06, .68), GLASS, .025, root)
        cube("compact roof spoiler", (0, 1.55, -1.77), (1.55, .1, .18), trim, .025, root)
        cube("hatch lower bumper", (0, .57, -2.12), (1.86, .18, .2), BLACK_PLASTIC, .03, root)
    elif style == "supercar":
        cube("carbon front splitter extension", (0, .49, 2.33), (2.08, .07, .28), CARBON, .02, root)
        beam_between("left supercar aero blade", (-1.02, .64, .1), (-1.02, .64, 1.25), .12, trim, root, .02)
        beam_between("right supercar aero blade", (1.02, .64, .1), (1.02, .64, 1.25), .12, trim, root, .02)
        cube("low rear diffuser lip", (0, .6, -2.27), (1.55, .08, .13), trim, .018, root)
        for side in (-1, 1):
            cylinder(f"{('left' if side < 0 else 'right')} supercar exhaust", (side * .35, .61, -2.31), .075, .16, CHROME, 16, root, smooth=True, bevel=.01)
    elif style == "suv":
        beam_between("left roof rail", (-.72, 1.78, -1.18), (-.72, 1.78, 1.18), .085, CHROME, root, .018)
        beam_between("right roof rail", (.72, 1.78, -1.18), (.72, 1.78, 1.18), .085, CHROME, root, .018)
        cube("front bull bar", (0, .67, 2.23), (2.08, .2, .14), BLACK_PLASTIC, .04, root)
        cylinder("rear spare tire", (0, 1.0, -2.22), .48, .18, RUBBER, 24, root, smooth=True, bevel=.025)
        torus("rear spare wheel bead", (0, 1.0, -2.32), .34, .04, RIM, (0, 0, 0), root)
    elif style == "pickup":
        cube("pickup bed left wall", (-.92, 1.03, -1.2), (.16, .48, 1.55), body, .045, root)
        cube("pickup bed right wall", (.92, 1.03, -1.2), (.16, .48, 1.55), body, .045, root)
        cube("pickup bed floor", (0, .82, -1.2), (1.75, .08, 1.55), CARBON, .025, root)
        cube("pickup tailgate", (0, 1.02, -1.98), (1.9, .5, .14), body, .045, root)
        beam_between("pickup left bed rail", (-.88, 1.3, -1.2), (-.88, 1.3, .05), .065, CHROME, root, .012)
        beam_between("pickup right bed rail", (.88, 1.3, -1.2), (.88, 1.3, .05), .065, CHROME, root, .012)
    elif style == "wagon":
        cube("wagon long cargo roof", (0, 1.27, -.62), (1.75, .34, 1.75), body, .065, root)
        cube("wagon panoramic roof", (0, 1.47, -.55), (1.5, .045, 1.2), GLASS, .025, root)
        beam_between("wagon roof rail left", (-.71, 1.68, -1.22), (-.71, 1.68, .18), .06, CHROME, root, .012)
        beam_between("wagon roof rail right", (.71, 1.68, -1.22), (.71, 1.68, .18), .06, CHROME, root, .012)
    elif style == "classic":
        cube("classic hood scoop", (0, 1.08, 1.2), (.72, .2, .52), body, .06, root)
        cube("classic chrome front bumper", (0, .62, 2.2), (2.28, .15, .16), CHROME, .035, root)
        cube("classic chrome rear bumper", (0, .62, -2.2), (2.28, .15, .16), CHROME, .035, root)
        cylinder("left side exhaust", (-1.12, .48, -.1), .07, 2.0, CHROME, 12, root, rotation=(0, math.pi / 2, 0), smooth=True, bevel=.012)
        cylinder("right side exhaust", (1.12, .48, -.1), .07, 2.0, CHROME, 12, root, rotation=(0, math.pi / 2, 0), smooth=True, bevel=.012)
    elif style == "ev":
        cube("EV panoramic roof", (0, 1.38, -.1), (1.58, .06, 2.0), GLASS, .025, root)
        cube("EV front light bar", (0, .87, 2.19), (1.45, .08, .06), trim, .02, root)
        cube("EV flush front panel", (0, .76, 1.82), (1.55, .12, .12), body, .025, root)
        beam_between("EV rear light bar", (-.7, .88, -2.21), (.7, .88, -2.21), .04, TAIL, root, .012)
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
    cube("modular building body", (0, height / 2, 0), (width, height, depth), material_slot, .08, root)
    cube("building roof coping", (0, height + .08, 0), (width + .18, .14, depth + .18), DARK_METAL, .025, root)
    floors = max(2, int(height / 3.1))
    front_columns = max(2, int(width / 2.7))
    side_columns = max(2, int(depth / 2.7))
    for floor in range(floors):
        y = 1.35 + floor * 3.05
        for col in range(front_columns):
            x = -width / 2 + 1.35 + col * ((width - 2.2) / max(1, front_columns - 1))
            cube("front lit window", (x, y, depth / 2 + .025), (.72, .45, .035), WINDOW, .015, root)
            if floor == 0 and col % 2 == 0:
                cube("ground floor facade reveal", (x, .54, depth / 2 + .045), (.82, .08, .06), SIDEWALK, .012, root)
        for col in range(side_columns):
            z = -depth / 2 + 1.35 + col * ((depth - 2.2) / max(1, side_columns - 1))
            if col % 2 == 0 or floor == 0:
                cube("side lit window", (width / 2 + .025, y, z), (.035, .45, .72), WINDOW, .015, root)
    for side in (-1, 1):
        cube("facade vertical pilaster", (side * (width / 2 - .24), height / 2, depth / 2 + .07), (.16, height * .88, .12), SIDEWALK, .025, root)
    return root


def make_aurora_spire(name, location, height, accent, variant=0, parent=None):
    root = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(root)
    root.location = location
    base_radius = 2.25 if variant % 2 == 0 else 1.8
    cylinder("landmark dark base", (0, .14, 0), base_radius + .85, .28, DARK_METAL, 10, root)
    cylinder("landmark tapered core", (0, height * .42, 0), base_radius, height * .84, accent, 8 if variant != 1 else 6, root)
    for side in (-1, 1):
        cube("landmark vertical light blade", (side * base_radius * .72, height * .4, 0), (.16, height * .77, .16), accent, .025, root)
        cube("landmark side light blade", (0, height * .34, side * base_radius * .72), (.11, height * .64, .11), accent, .018, root)
    ring_count = 4 if variant == 2 else 3
    for index in range(ring_count):
        bpy.ops.mesh.primitive_torus_add(
            major_radius=base_radius + .2 + (index % 2) * .28,
            minor_radius=.07,
            major_segments=32,
            minor_segments=7,
            location=(0, height * (.2 + index * .19), 0),
            rotation=(math.pi / 2, 0, 0),
        )
        ring = bpy.context.object
        ring.name = "animated landmark light ring"
        ring.data.materials.append(accent)
        ring.parent = root
    if variant == 1:
        cube("landmark cross crown", (0, height * .9, 0), (base_radius * 1.8, .16, .16), accent, .02, root)
        cube("landmark cross crown depth", (0, height * .9, 0), (.16, .16, base_radius * 1.8), accent, .02, root)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=.28, radius2=.02, depth=2.4, location=(0, height + 1.2, 0))
        crown = bpy.context.object
        crown.name = "landmark antenna"
        crown.data.materials.append(accent)
        crown.parent = root
    if parent:
        root.parent = parent
    return root


def make_harbor_gateway(name, location, parent=None):
    root = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(root)
    root.location = location
    cube("harbor gateway left column", (-9, 3.9, 0), (1.05, 7.8, 1.05), DARK_METAL, .05, root)
    cube("harbor gateway right column", (9, 3.9, 0), (1.05, 7.8, 1.05), DARK_METAL, .05, root)
    cube("harbor gateway top beam", (0, 7.55, 0), (19.5, .42, .42), DARK_METAL, .04, root)
    cube("harbor gateway cyan blade", (-8.35, 3.8, .54), (.18, 7.2, .18), CYAN, .02, root)
    cube("harbor gateway amber blade", (8.35, 3.8, .54), (.18, 7.2, .18), AMBER, .02, root)
    cube("harbor gateway cyan rail", (0, 7.36, .55), (17.2, .11, .11), CYAN, .02, root)
    cube("harbor gateway pink rail", (0, 7.67, .55), (17.2, .08, .08), PINK, .02, root)
    if parent:
        root.parent = parent
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
    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=max(width, depth) * .72, radius2=0, depth=height * .56, location=(0, height + height * .23, 0), rotation=(0, 0, math.pi / 4))
    roof = bpy.context.object
    roof.name = "mountain cabin pitched roof"
    roof.data.materials.append(CABIN_ROOF)
    roof.parent = cabin
    cube("warm cabin window", (0, height * .54, depth / 2 + .04), (width * .26, height * .2, .06), VILLAGE_LIGHT, .02, cabin)
    cube("cabin porch", (0, .16, depth / 2 + .55), (width * .55, .22, 1.0), SIDEWALK, .03, cabin)
    return cabin


REGIONAL_KITS = (
    ("northstar_outpost", "NORTHSTAR OUTPOST", "highlands"),
    ("redwood_valley", "REDWOOD VALLEY", "forest"),
    ("lake_aurora", "LAKE AURORA", "lake"),
    ("cinder_flats", "CINDER FLATS", "desert"),
    ("eastgate", "EASTGATE", "industrial"),
    ("southern_crossroads", "SOUTHERN CROSSROADS", "rural"),
)


def make_regional_kit(slug, display_name, biome):
    root = bpy.data.objects.new(f"{display_name} / modular Blender region kit", None)
    bpy.context.collection.objects.link(root)
    ground_materials = {
        "highlands": MOUNTAIN_GROUND,
        "forest": FOREST_GROUND,
        "lake": LAKE_GROUND,
        "desert": DESERT_GROUND,
        "industrial": INDUSTRIAL_GROUND,
        "rural": RURAL_GROUND,
    }
    cube(f"{display_name} sector ground", (0, -.15, 0), (190, .2, 190), ground_materials[biome], 0, root)
    path = [(-90, .02, -22), (-48, .04, -12), (-4, .06, 0), (42, .08, 17), (92, .1, 29)]
    make_path_ribbon(f"{display_name} regional road shoulder", path, 14.2, REGION_SHOULDER, root)
    make_path_ribbon(f"{display_name} regional road", path, 11.4, REGION_ROAD, root)
    for index in range(1, len(path)):
        start = Vector(path[index - 1])
        end = Vector(path[index])
        flat = Vector((end.x - start.x, 0, end.z - start.z))
        length = max(.001, flat.length)
        heading = math.atan2(flat.x, flat.z)
        tangent = flat.normalized()
        normal = Vector((tangent.z, 0, -tangent.x))
        for distance in range(7, max(7, int(length - 3)), 16):
            center = start.lerp(end, distance / length)
            center.y += .11
            cube(f"{display_name} center dash", center, (.16, .035, 7.2), SIGN_AMBER, .01, root).rotation_euler[1] = heading
        for side in (-1, 1):
            edge = start.lerp(end, .5) + normal * (side * 5.15)
            edge.y += .11
            cube(f"{display_name} edge line", edge, (.08, .035, length), SIGN_WHITE, .005, root).rotation_euler[1] = heading
    for index in range(7):
        x = -72 + (index * 29) % 145
        z = -75 + ((index * 47) % 145)
        if abs(z - x * .28) < 17:
            z += 27
        if biome in ("forest", "highlands", "rural"):
            make_tree(f"{display_name} tree {index:02d}", (x, 0, z), .9 + (index % 3) * .14).parent = root
        elif biome == "desert":
            make_mountain_rock(f"{display_name} cinder rock {index:02d}", (x, 1.5, z), 2.4 + index % 3, 3.2 + index % 4, MOUNTAIN_ROCK, root)
        elif biome == "lake":
            cylinder(f"{display_name} shore marker {index:02d}", (x, .02, z), 2.3 + index % 2, .08, WATER, 12, root)
    if biome == "lake":
        cube(f"{display_name} water basin", (-25, -.04, 34), (92, .12, 64), WATER, 0, root)
        cube(f"{display_name} dock", (-25, .2, -2), (6, .35, 26), CABIN_WOOD, .04, root)
    if biome == "industrial":
        for index, location in enumerate(((-56, 0, 45), (-18, 0, 54), (34, 0, 42), (62, 0, -46))):
            building = make_building(f"{display_name} warehouse {index:02d}", location, 18 + index * 2, 15, 8 + index * 2, INDUSTRIAL_GROUND)
            building.parent = root
    elif biome in ("highlands", "forest", "rural"):
        for index, location in enumerate(((-44, 0, 45), (34, 0, 55), (55, 0, -45))):
            cabin = make_pinewatch_cabin(f"{display_name} cabin {index:02d}", location, 7.2, 5.1, 4.5, index * .45, root)
            cabin.parent = root
    elif biome == "desert":
        for index, location in enumerate(((-42, 0, 47), (36, 0, 54), (58, 0, -46))):
            building = make_building(f"{display_name} service depot {index:02d}", location, 15, 11, 5 + index, INDUSTRIAL_GROUND)
            building.parent = root
    elif biome == "lake":
        cabin = make_pinewatch_cabin(f"{display_name} ranger cabin", (51, 0, 48), 7.4, 5.2, 4.7, -.25, root)
        cabin.parent = root
    make_speed_sign(f"{display_name} speed sign", (16, 0, 9)).parent = root
    make_stop_sign(f"{display_name} stop sign", (-10, 0, -8)).parent = root
    label = bpy.data.objects.new(f"{display_name} marker", None)
    bpy.context.collection.objects.link(label)
    label.parent = root
    orient_game_space_root(root)
    return root


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
        length = flat.length
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
    # Primary skyline assets live in the source scene as authored geometry. The
    # runtime keeps a deterministic fallback, but it should not be the final art.
    make_aurora_spire("AURORA SPIRE landmark", (0, 0, 44), 40, CYAN, 0, root)
    make_aurora_spire("NORTH LIGHT landmark", (-88, 0, -62), 27, PINK, 1, root)
    make_aurora_spire("EAST LOOP landmark", (88, 0, -53), 32, AMBER, 2, root)
    make_aurora_spire("HARBOR LINK landmark", (-4, 0, 91), 24, LIME, 3, root)
    make_harbor_gateway("AURORA HARBOR gateway", (0, 0, -95), root)
    make_mountain_extension(root)
    orient_game_space_root(root)
    return root


def export_collection(obj, filepath):
    # Blender is Z-up, while the source coordinates above deliberately use
    # game-space Y-up/Z-forward values so they match the browser scene. Flatten
    # the hierarchy while preserving world matrices so the GLB keeps that
    # conversion instead of dropping the empty root's rotation on export.
    bpy.context.view_layer.update()
    descendants = list(obj.children_recursive)
    world_matrices = [(child, child.matrix_world.copy()) for child in descendants]
    for child, matrix in world_matrices:
        child.parent = None
        child.matrix_world = matrix
    obj.location = (0, 0, 0)
    obj.rotation_euler = (0, 0, 0)
    obj.scale = (1, 1, 1)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    for child in descendants:
        child.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(filepath=filepath, export_format="GLB", use_selection=True, export_apply=True)


def main():
    out = args()
    os.makedirs(out, exist_ok=True)
    clear_scene()
    car = make_car()
    starter = make_golf6_starter()
    environment = make_environment()
    export_collection(car, os.path.join(out, "midnight_gt.glb"))
    export_collection(starter, os.path.join(out, "golf6_starter.glb"))
    export_collection(environment, os.path.join(out, "aurora_bay_environment.glb"))
    region_dir = os.path.join(out, "regions")
    os.makedirs(region_dir, exist_ok=True)
    for slug, display_name, biome in REGIONAL_KITS:
        kit = make_regional_kit(slug, display_name, biome)
        export_collection(kit, os.path.join(region_dir, f"{slug}.glb"))
    export_fleet(out)
    print(f"Created Blender assets, including {len(FLEET_PROFILES)} logo-free fleet variants and {len(REGIONAL_KITS)} modular region kits, in {out}")


if __name__ == "__main__":
    main()
