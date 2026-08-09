"""Build and render Maefer website Section 01 in Blender.

Usage:
  blender --background --python tools/render_section_one.py -- --preview
  blender --background --python tools/render_section_one.py -- --animation
"""

from __future__ import annotations

import argparse
import math
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import bpy
from mathutils import Vector


PROJECT_ROOT = Path(__file__).resolve().parents[1]
RENDER_DIR = PROJECT_ROOT / "render"
MEDIA_DIR = PROJECT_ROOT / "public" / "media"
BLEND_DIR = PROJECT_ROOT / "assets" / "blender"

FPS = 15
PRINT_END = 1290
FRAME_END = 1350
LAYERS = 38
POINTS_PER_LAYER = 112
BLUE = (0.002, 0.035, 0.320, 1.0)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--preview", action="store_true")
    parser.add_argument("--animation", action="store_true")
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(arguments)


def clean_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for block in list(collection):
            if block.users == 0:
                collection.remove(block)


def material(
    name: str,
    base_color: tuple[float, float, float, float],
    *,
    metallic: float = 0.0,
    roughness: float = 0.42,
    coat: float = 0.0,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = base_color
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = base_color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Coat Weight"].default_value = coat
    return mat


def textured_material(
    name: str,
    base_color: tuple[float, float, float, float],
    *,
    metallic: float,
    roughness: float,
    noise_scale: float,
    bump_strength: float,
) -> bpy.types.Material:
    mat = material(
        name,
        base_color,
        metallic=metallic,
        roughness=roughness,
        coat=0.12,
    )
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = noise_scale
    noise.inputs["Detail"].default_value = 4.0
    noise.inputs["Roughness"].default_value = 0.72
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = bump_strength
    bump.inputs["Distance"].default_value = 0.07
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def emissive_material(
    name: str,
    color: tuple[float, float, float, float],
    strength: float = 5.0,
) -> bpy.types.Material:
    mat = material(name, color, metallic=0.08, roughness=0.24, coat=0.18)
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Emission Color"].default_value = color
    bsdf.inputs["Emission Strength"].default_value = strength
    return mat


def add_beveled_cube(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    mat: bpy.types.Material,
    *,
    bevel: float = 0.08,
    segments: int = 4,
    parent: bpy.types.Object | None = None,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        modifier = obj.modifiers.new("Precision edge radius", "BEVEL")
        modifier.width = bevel
        modifier.segments = segments
    obj.data.materials.append(mat)
    obj.parent = parent
    return obj


def add_cylinder(
    name: str,
    location: tuple[float, float, float],
    radius: float,
    depth: float,
    mat: bpy.types.Material,
    *,
    vertices: int = 48,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    bevel: float = 0.02,
    parent: bpy.types.Object | None = None,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    if bevel:
        modifier = obj.modifiers.new("Machined edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
    obj.data.materials.append(mat)
    obj.parent = parent
    return obj


def add_torus(
    name: str,
    location: tuple[float, float, float],
    major_radius: float,
    minor_radius: float,
    mat: bpy.types.Material,
    *,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    parent: bpy.types.Object | None = None,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=64,
        minor_segments=12,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    obj.parent = parent
    return obj


def add_sphere(
    name: str,
    location: tuple[float, float, float],
    radius: float,
    mat: bpy.types.Material,
    *,
    parent: bpy.types.Object | None = None,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=40,
        ring_count=20,
        radius=radius,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    obj.parent = parent
    bevel = obj.modifiers.new("Precision joint edge", "BEVEL")
    bevel.width = radius * 0.035
    bevel.segments = 2
    return obj


def set_link_pose(
    obj: bpy.types.Object,
    start: Vector,
    end: Vector,
    frame: int,
) -> None:
    direction = end - start
    obj.location = (start + end) * 0.5
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("X", "Z")
    obj.scale = (max(direction.length, 0.001), 1.0, 1.0)
    obj.keyframe_insert("location", frame=frame)
    obj.keyframe_insert("rotation_quaternion", frame=frame)
    obj.keyframe_insert("scale", frame=frame)


def set_keyframes_linear(animation_data: bpy.types.AnimData | None) -> None:
    if not animation_data or not animation_data.action:
        return

    action = animation_data.action
    fcurves = getattr(action, "fcurves", None)
    if fcurves is not None:
        fcurve_groups = [fcurves]
    else:
        fcurve_groups = [
            channelbag.fcurves
            for layer in action.layers
            for strip in layer.strips
            for channelbag in strip.channelbags
        ]

    for fcurve_group in fcurve_groups:
        for fcurve in fcurve_group:
            for keyframe in fcurve.keyframe_points:
                keyframe.interpolation = "LINEAR"


def build_plate() -> None:
    existing_objects = set(bpy.context.scene.objects)
    graphite = textured_material(
        "Fine PEI surface",
        (0.070, 0.078, 0.084, 1.0),
        metallic=0.16,
        roughness=0.58,
        noise_scale=145.0,
        bump_strength=0.16,
    )
    aluminium = textured_material(
        "Bead-blasted aluminium",
        (0.255, 0.285, 0.300, 1.0),
        metallic=0.88,
        roughness=0.3,
        noise_scale=68.0,
        bump_strength=0.055,
    )
    black = material(
        "Fastener black",
        (0.012, 0.015, 0.018, 1.0),
        metallic=0.82,
        roughness=0.22,
    )
    edge_blue = material(
        "Anodized blue edge",
        (0.012, 0.105, 0.335, 1.0),
        metallic=0.8,
        roughness=0.24,
        coat=0.2,
    )

    add_beveled_cube(
        "CNC aluminium carrier",
        (0.0, 0.0, -0.13),
        (3.25, 3.25, 0.12),
        aluminium,
        bevel=0.13,
        segments=6,
    )
    add_beveled_cube(
        "Textured magnetic build surface",
        (0.0, 0.0, 0.015),
        (3.08, 3.08, 0.045),
        graphite,
        bevel=0.09,
        segments=6,
    )

    # A fine inset border gives the plate scale without printed words or logos.
    for z, size, thickness in ((0.069, 2.88, 0.018), (0.071, 2.55, 0.009)):
        for x, y, sx, sy in (
            (0, size, size, thickness),
            (0, -size, size, thickness),
            (size, 0, thickness, size),
            (-size, 0, thickness, size),
        ):
            add_beveled_cube(
                "Etched plate guide",
                (x, y, z),
                (sx, sy, 0.004),
                edge_blue,
                bevel=0.008,
                segments=2,
            )

    for x in (-2.91, 2.91):
        for y in (-2.91, 2.91):
            add_cylinder(
                "Flush plate fastener",
                (x, y, 0.075),
                0.095,
                0.028,
                black,
                vertices=36,
                bevel=0.012,
            )
            add_beveled_cube(
                "Fastener slot",
                (x, y, 0.093),
                (0.048, 0.011, 0.007),
                aluminium,
                bevel=0.006,
                segments=2,
            )

    bed_root = bpy.data.objects.new("Compact build bed", None)
    bpy.context.collection.objects.link(bed_root)
    bed_root.scale = (0.78, 0.78, 0.78)
    for obj in set(bpy.context.scene.objects) - existing_objects:
        if obj is not bed_root:
            obj.parent = bed_root


def make_print_path() -> tuple[bpy.types.Object, list[Vector]]:
    blue_filament = textured_material(
        "Maefer technical blue filament",
        BLUE,
        metallic=0.08,
        roughness=0.37,
        noise_scale=92.0,
        bump_strength=0.09,
    )
    blue_filament.node_tree.nodes["Principled BSDF"].inputs[
        "Coat Weight"
    ].default_value = 0.26

    points: list[Vector] = []
    for layer in range(LAYERS):
        height_t = layer / (LAYERS - 1)
        z = 0.12 + layer * 0.061
        layer_phase = layer * 0.09
        # A modern, printable sculptural vase: softly triangular, gently twisted,
        # wider at its shoulder and neatly tapered at the base and rim.
        envelope = (
            1.02
            + 0.24 * math.sin(height_t * math.pi)
            - 0.12 * math.exp(-height_t * 8.0)
            - 0.16 * max(0.0, height_t - 0.82) / 0.18
        )
        for point_index in range(POINTS_PER_LAYER + 1):
            angle = point_index / POINTS_PER_LAYER * math.tau
            radius = envelope * (
                1.0
                + 0.14 * math.cos(3.0 * angle + layer_phase)
                + 0.025 * math.cos(6.0 * angle - layer_phase * 0.7)
            )
            points.append(
                Vector(
                    (
                        radius * math.cos(angle),
                        radius * math.sin(angle),
                        z,
                    )
                )
            )

    curve_data = bpy.data.curves.new("Layer-by-layer toolpath", "CURVE")
    curve_data.dimensions = "3D"
    curve_data.resolution_u = 1
    curve_data.bevel_depth = 0.0315
    curve_data.bevel_resolution = 3
    curve_data.resolution_u = 2
    curve_data.twist_smooth = 8
    curve_data.bevel_factor_start = 0.0
    curve_data.bevel_factor_end = 0.001

    spline = curve_data.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for spline_point, point in zip(spline.points, points):
        spline_point.co = (*point, 1.0)

    printed_part = bpy.data.objects.new("Blue printed part", curve_data)
    bpy.context.collection.objects.link(printed_part)
    printed_part.data.materials.append(blue_filament)
    printed_part.data.bevel_factor_end = 0.001
    printed_part.data.keyframe_insert("bevel_factor_end", frame=1)
    printed_part.data.bevel_factor_end = 1.0
    printed_part.data.keyframe_insert("bevel_factor_end", frame=PRINT_END)
    printed_part.data.keyframe_insert("bevel_factor_end", frame=FRAME_END)

    set_keyframes_linear(printed_part.data.animation_data)

    return printed_part, points


def build_nozzle(path_points: list[Vector]) -> bpy.types.Object:
    brushed = textured_material(
        "Brushed stainless steel",
        (0.34, 0.39, 0.42, 1.0),
        metallic=0.94,
        roughness=0.22,
        noise_scale=76.0,
        bump_strength=0.035,
    )
    dark_metal = material(
        "Dark machined metal",
        (0.025, 0.033, 0.039, 1.0),
        metallic=0.9,
        roughness=0.2,
        coat=0.22,
    )
    brass = material(
        "Precision brass",
        (0.70, 0.275, 0.052, 1.0),
        metallic=0.84,
        roughness=0.21,
        coat=0.1,
    )
    ceramic = material(
        "Heater ceramic",
        (0.72, 0.75, 0.76, 1.0),
        metallic=0.05,
        roughness=0.32,
    )
    accent = material(
        "Nozzle blue accent",
        (0.005, 0.14, 0.54, 1.0),
        metallic=0.74,
        roughness=0.2,
        coat=0.3,
    )
    copper = material(
        "Copper cable",
        (0.53, 0.055, 0.025, 1.0),
        metallic=0.45,
        roughness=0.35,
    )

    root = bpy.data.objects.new("Moving print head", None)
    bpy.context.collection.objects.link(root)
    # Keep the tool head compact so it reads as a precise nozzle rather than a
    # bulky printer assembly. The slightly narrower X/Y scale preserves its
    # height while reducing the silhouette over the printed part.
    root.scale = (0.50, 0.50, 0.62)

    # Precision tip and heat block.
    bpy.ops.mesh.primitive_cone_add(
        vertices=64,
        radius1=0.035,
        radius2=0.095,
        depth=0.34,
        location=(0, 0, 0.18),
    )
    tip = bpy.context.object
    tip.name = "Replaceable brass nozzle"
    tip.data.materials.append(brass)
    tip.parent = root
    add_cylinder(
        "Nozzle hex collar",
        (0, 0, 0.34),
        0.105,
        0.13,
        brass,
        vertices=6,
        bevel=0.018,
        parent=root,
    )
    heater = add_beveled_cube(
        "Ceramic heater block",
        (0, 0, 0.53),
        (0.22, 0.19, 0.12),
        ceramic,
        bevel=0.07,
        segments=5,
        parent=root,
    )
    heater.rotation_euler.z = math.radians(3)
    add_beveled_cube(
        "Heater protective sleeve",
        (0, 0.0, 0.53),
        (0.24, 0.21, 0.065),
        dark_metal,
        bevel=0.06,
        segments=5,
        parent=root,
    )
    add_cylinder(
        "Heat break",
        (0, 0, 0.79),
        0.105,
        0.38,
        brushed,
        bevel=0.018,
        parent=root,
    )

    # Keep only the functional hotend stack above the nozzle. The previous
    # boxy shroud made the first-stage head look visually top-heavy.
    for index in range(7):
        z = 0.89 + index * 0.105
        add_cylinder(
            f"Cooling fin {index + 1:02d}",
            (0, 0, z),
            0.305 - index * 0.008,
            0.047,
            brushed,
            vertices=64,
            bevel=0.012,
            parent=root,
        )
    add_cylinder(
        "Radiator core",
        (0, 0, 1.22),
        0.14,
        0.8,
        dark_metal,
        bevel=0.02,
        parent=root,
    )

    add_cylinder(
        "Filament inlet",
        (0, 0, 1.79),
        0.090,
        0.14,
        dark_metal,
        bevel=0.022,
        parent=root,
    )
    add_torus(
        "Filament inlet accent",
        (0, 0, 1.73),
        0.090,
        0.023,
        accent,
        parent=root,
    )

    # Animate the entire print head directly along the same deposited path.
    root.location = path_points[0] + Vector((0, 0, 0.055))
    root.keyframe_insert("location", frame=1)
    key_interval = 3
    for frame in range(1 + key_interval, PRINT_END + 1, key_interval):
        progress = (frame - 1) / (PRINT_END - 1)
        index = min(round(progress * (len(path_points) - 1)), len(path_points) - 1)
        root.location = path_points[index] + Vector((0, 0, 0.055))
        root.keyframe_insert("location", frame=frame)
    root.location = path_points[-1] + Vector((0, 0, 0.055))
    root.keyframe_insert("location", frame=PRINT_END)
    root.keyframe_insert("location", frame=FRAME_END)

    set_keyframes_linear(root.animation_data)
    return root


def build_qr_handling_arm() -> None:
    armor = textured_material(
        "Robot graphite armor",
        (0.10, 0.16, 0.20, 1.0),
        metallic=0.78,
        roughness=0.24,
        noise_scale=84.0,
        bump_strength=0.025,
    )
    edge_metal = material(
        "Robot machined edges",
        (0.24, 0.31, 0.35, 1.0),
        metallic=0.92,
        roughness=0.2,
        coat=0.22,
    )
    joint_dark = material(
        "Robot joint core",
        (0.008, 0.016, 0.023, 1.0),
        metallic=0.9,
        roughness=0.17,
    )
    cyan = emissive_material(
        "Robot cyan status light",
        (0.004, 0.18, 0.48, 1.0),
        strength=2.2,
    )

    base = Vector((-3.45, 1.3, 0.15))
    shoulder = Vector((-3.45, 1.3, 1.75))
    add_cylinder(
        "Robotic arm rotating base",
        tuple(base),
        0.72,
        0.36,
        armor,
        vertices=64,
        bevel=0.08,
    )
    add_cylinder(
        "Robotic arm base light",
        (base.x, base.y, base.z + 0.2),
        0.62,
        0.045,
        cyan,
        vertices=64,
        bevel=0.012,
    )
    add_beveled_cube(
        "Robotic arm pedestal",
        (base.x, base.y, 0.93),
        (0.43, 0.38, 0.66),
        armor,
        bevel=0.2,
        segments=7,
    )
    add_sphere(
        "Robotic shoulder housing",
        tuple(shoulder),
        0.48,
        edge_metal,
    )
    add_sphere(
        "Robotic shoulder light",
        (shoulder.x, shoulder.y - 0.43, shoulder.z),
        0.22,
        cyan,
    )

    upper = add_beveled_cube(
        "Robotic upper arm",
        (0, 0, 0),
        (0.5, 0.30, 0.24),
        armor,
        bevel=0.16,
        segments=7,
    )
    forearm = add_beveled_cube(
        "Robotic forearm",
        (0, 0, 0),
        (0.5, 0.24, 0.20),
        armor,
        bevel=0.14,
        segments=7,
    )
    upper_rail = add_beveled_cube(
        "Upper arm cyan rail",
        (0, 0, 0),
        (0.5, 0.045, 0.055),
        cyan,
        bevel=0.025,
        segments=3,
    )
    forearm_rail = add_beveled_cube(
        "Forearm cyan rail",
        (0, 0, 0),
        (0.5, 0.038, 0.045),
        cyan,
        bevel=0.022,
        segments=3,
    )
    elbow_outer = add_sphere(
        "Robotic elbow housing",
        (0, 0, 0),
        0.39,
        edge_metal,
    )
    elbow_light = add_sphere(
        "Robotic elbow cyan core",
        (0, 0, 0),
        0.21,
        cyan,
    )
    wrist_outer = add_sphere(
        "Robotic wrist housing",
        (0, 0, 0),
        0.3,
        joint_dark,
    )
    wrist_light = add_sphere(
        "Robotic wrist cyan core",
        (0, 0, 0),
        0.15,
        cyan,
    )

    # This is the independent QR handling robot, parked beside the printer.
    # It never follows or touches the nozzle during the printing loop.
    elbow = Vector((-2.65, 0.75, 2.85))
    wrist = Vector((-1.72, -0.18, 2.05))
    for frame in (1, FRAME_END):
        set_link_pose(upper, shoulder, elbow, frame)
        set_link_pose(forearm, elbow, wrist, frame)
        for rail, start, end, offset in (
            (upper_rail, shoulder, elbow, 0.31),
            (forearm_rail, elbow, wrist, 0.25),
        ):
            set_link_pose(rail, start, end, frame)
            rail.location += rail.rotation_quaternion @ Vector((0, -offset, 0))
            rail.keyframe_insert("location", frame=frame)
        for obj, point_location in (
            (elbow_outer, elbow),
            (elbow_light, elbow + Vector((0, -0.36, 0))),
            (wrist_outer, wrist),
            (wrist_light, wrist + Vector((0, -0.28, 0))),
        ):
            obj.location = point_location
            obj.keyframe_insert("location", frame=frame)

    # A clearly separated two-finger gripper identifies this as the module
    # handling arm rather than part of the printing mechanism.
    add_beveled_cube(
        "QR handling wrist block",
        (wrist.x + 0.16, wrist.y, wrist.z),
        (0.22, 0.24, 0.16),
        edge_metal,
        bevel=0.09,
        segments=5,
    )
    for side in (-1, 1):
        add_beveled_cube(
            "QR handling gripper finger",
            (wrist.x + 0.56, wrist.y + side * 0.17, wrist.z),
            (0.36, 0.055, 0.065),
            joint_dark,
            bevel=0.045,
            segments=4,
        )
        add_beveled_cube(
            "QR handling cyan fingertip",
            (wrist.x + 0.9, wrist.y + side * 0.17, wrist.z),
            (0.055, 0.07, 0.08),
            cyan,
            bevel=0.025,
            segments=3,
        )

    for obj in (
        upper,
        forearm,
        upper_rail,
        forearm_rail,
        elbow_outer,
        elbow_light,
        wrist_outer,
        wrist_light,
    ):
        set_keyframes_linear(obj.animation_data)


def look_at(obj: bpy.types.Object, point: tuple[float, float, float]) -> None:
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat("-Z", "Y").to_euler()


def add_area_light(
    name: str,
    location: tuple[float, float, float],
    energy: float,
    size: float,
    color: tuple[float, float, float],
    target: tuple[float, float, float],
) -> None:
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = color
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    look_at(obj, target)


def studio() -> None:
    graphite = textured_material(
        "Architectural graphite",
        (0.018, 0.027, 0.035, 1.0),
        metallic=0.72,
        roughness=0.3,
        noise_scale=92.0,
        bump_strength=0.035,
    )
    dark_panel = material(
        "Dark lab panels",
        (0.026, 0.045, 0.059, 1.0),
        metallic=0.62,
        roughness=0.28,
        coat=0.22,
    )
    black_metal = material(
        "Black structural metal",
        (0.008, 0.014, 0.020, 1.0),
        metallic=0.9,
        roughness=0.2,
    )
    cyan = emissive_material(
        "Cyan laboratory light",
        (0.012, 0.56, 1.0, 1.0),
        strength=7.0,
    )
    blue = emissive_material(
        "Blue machine status light",
        (0.005, 0.16, 0.95, 1.0),
        strength=5.0,
    )

    add_beveled_cube(
        "Dark laboratory floor",
        (0, 0, -0.2),
        (12, 12, 0.14),
        graphite,
        bevel=0.12,
        segments=4,
    )

    # Recessed floor panels and light channels establish industrial scale.
    for x in (-7.2, -3.6, 0.0, 3.6, 7.2):
        add_beveled_cube(
            "Floor panel seam",
            (x, 0, -0.045),
            (0.018, 10.5, 0.008),
            black_metal,
            bevel=0.006,
            segments=2,
        )
    for y in (-6.0, -2.7, 2.7, 6.0):
        add_beveled_cube(
            "Floor panel seam",
            (0, y, -0.044),
            (10.5, 0.018, 0.008),
            black_metal,
            bevel=0.006,
            segments=2,
        )
    for x in (-4.8, 4.8):
        add_beveled_cube(
            "Floor cyan guide",
            (x, -0.4, -0.035),
            (0.025, 8.5, 0.012),
            cyan,
            bevel=0.01,
            segments=2,
        )

    # Layered rear wall with luminous vertical service bays.
    add_beveled_cube(
        "Rear laboratory wall",
        (0, 7.2, 4.2),
        (11.5, 0.3, 4.4),
        dark_panel,
        bevel=0.16,
        segments=4,
    )
    for x in (-8.0, -4.0, 0.0, 4.0, 8.0):
        add_beveled_cube(
            "Rear structural column",
            (x, 6.82, 4.15),
            (0.18, 0.22, 4.0),
            black_metal,
            bevel=0.055,
            segments=3,
        )
    for x in (-6.0, -2.0, 2.0, 6.0):
        add_beveled_cube(
            "Vertical cyan light",
            (x, 6.47, 4.25),
            (0.045, 0.025, 2.45),
            cyan,
            bevel=0.018,
            segments=3,
        )
        add_beveled_cube(
            "Machine status panel",
            (x, 6.43, 1.25),
            (0.46, 0.028, 0.3),
            blue,
            bevel=0.06,
            segments=3,
        )

    # Ceiling gantry beams frame the moving vertical tool shaft.
    for y in (-3.2, 2.2, 6.0):
        add_beveled_cube(
            "Ceiling gantry beam",
            (0, y, 7.25),
            (10.8, 0.19, 0.2),
            black_metal,
            bevel=0.06,
            segments=3,
        )
        add_beveled_cube(
            "Ceiling light rail",
            (0, y - 0.22, 7.12),
            (8.8, 0.025, 0.035),
            cyan,
            bevel=0.012,
            segments=2,
        )

    # Side machinery creates the dense, cinematic laboratory depth seen in the
    # reference while leaving the printed object unobstructed.
    for side in (-1, 1):
        x = side * 6.5
        add_beveled_cube(
            "Side fabrication cabinet",
            (x, 2.6, 1.35),
            (1.25, 1.2, 1.5),
            dark_panel,
            bevel=0.18,
            segments=5,
        )
        for row in range(5):
            add_beveled_cube(
                "Cabinet status light",
                (x - side * 1.27, 1.9 + row * 0.34, 1.0),
                (0.025, 0.09, 0.035),
                cyan if row % 2 == 0 else blue,
                bevel=0.01,
                segments=2,
            )

    build_plate()

    add_area_light(
        "Cool laboratory key",
        (-5.5, -4.6, 8.5),
        1050,
        4.8,
        (0.34, 0.66, 1.0),
        (0, 0, 1.0),
    )
    add_area_light(
        "Cyan right rim",
        (5.5, 0.8, 6.5),
        1250,
        3.0,
        (0.10, 0.68, 1.0),
        (0, 0, 1.35),
    )
    add_area_light(
        "Warm robotic fill",
        (0.5, -5.0, 3.0),
        520,
        2.5,
        (1.0, 0.48, 0.18),
        (0, 0, 1.1),
    )
    add_area_light(
        "Top machinery reflection",
        (0, 1.0, 10),
        720,
        3.0,
        (0.26, 0.55, 1.0),
        (0, 0, 0),
    )

    camera_data = bpy.data.cameras.new("Cinematic camera")
    camera = bpy.data.objects.new("Cinematic camera", camera_data)
    bpy.context.collection.objects.link(camera)
    # Pull back by roughly 30% so the fabrication assembly stays centered and
    # the laboratory architecture becomes part of the composition.
    camera.location = (13.3, -17.3, 8.1)
    camera_data.lens = 58
    camera_data.sensor_width = 36
    camera_data.dof.use_dof = True
    camera_data.dof.focus_distance = 18.0
    camera_data.dof.aperture_fstop = 4.4
    look_at(camera, (0, 0, 1.0))
    bpy.context.scene.camera = camera


def minimal_studio() -> None:
    """A clean render stage; the persistent futuristic shell lives in CSS."""
    graphite = textured_material(
        "Minimal graphite floor",
        (0.012, 0.021, 0.029, 1.0),
        metallic=0.58,
        roughness=0.34,
        noise_scale=105.0,
        bump_strength=0.03,
    )
    add_beveled_cube(
        "Minimal dark stage",
        (0, 0, -0.2),
        (12, 12, 0.14),
        graphite,
        bevel=0.12,
        segments=4,
    )
    build_plate()

    add_area_light(
        "Minimal cool key",
        (-5.5, -4.6, 8.5),
        1050,
        4.8,
        (0.34, 0.66, 1.0),
        (0, 0, 1.0),
    )
    add_area_light(
        "Minimal cyan rim",
        (5.5, 0.8, 6.5),
        1050,
        3.0,
        (0.10, 0.68, 1.0),
        (0, 0, 1.35),
    )
    add_area_light(
        "Minimal warm fill",
        (0.5, -5.0, 3.0),
        440,
        2.5,
        (1.0, 0.48, 0.18),
        (0, 0, 1.1),
    )

    camera_data = bpy.data.cameras.new("Cinematic camera")
    camera = bpy.data.objects.new("Cinematic camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (13.3, -17.3, 8.1)
    camera_data.lens = 58
    camera_data.sensor_width = 36
    camera_data.dof.use_dof = True
    camera_data.dof.focus_distance = 18.0
    camera_data.dof.aperture_fstop = 4.4
    look_at(camera, (0, 0, 1.0))
    bpy.context.scene.camera = camera


def configure_scene() -> None:
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = FRAME_END
    engines = {
        item.identifier
        for item in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items
    }
    scene.render.engine = (
        "BLENDER_EEVEE_NEXT"
        if "BLENDER_EEVEE_NEXT" in engines
        else "BLENDER_EEVEE"
    )
    scene.render.resolution_x = 2560
    scene.render.resolution_y = 1440
    scene.render.resolution_percentage = 100
    scene.render.fps = FPS
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.render.image_settings.color_depth = "8"

    scene.world.color = (0.004, 0.008, 0.014)
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.004, 0.009, 0.018, 1.0)
    background.inputs["Strength"].default_value = 0.16

    scene.render.image_settings.color_mode = "RGB"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.eevee.taa_render_samples = 4
    scene.render.use_motion_blur = True
    scene.render.motion_blur_shutter = 0.08
    scene.render.use_file_extension = True
    scene.render.image_settings.compression = 38


def render_preview() -> None:
    scene = bpy.context.scene
    RENDER_DIR.mkdir(parents=True, exist_ok=True)
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    scene.frame_set(PRINT_END // 2)
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(MEDIA_DIR / "section-01-poster.png")
    bpy.ops.render.render(write_still=True)


def render_animation() -> None:
    scene = bpy.context.scene
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    scene.frame_set(1)
    output_path = MEDIA_DIR / "section-01-print.mp4"

    try:
        scene.render.image_settings.file_format = "FFMPEG"
    except TypeError:
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            raise RuntimeError(
                "Blender cannot use FFMPEG output directly and ffmpeg is not installed."
            )
        with tempfile.TemporaryDirectory(prefix="maefer-section-01-frames-") as tmp:
            frame_dir = Path(tmp)
            scene.render.image_settings.file_format = "PNG"
            scene.render.image_settings.color_mode = "RGB"
            scene.render.filepath = str(frame_dir / "section-01-####")
            bpy.ops.render.render(animation=True)
            subprocess.run(
                [
                    ffmpeg,
                    "-y",
                    "-framerate",
                    str(FPS),
                    "-start_number",
                    str(scene.frame_start),
                    "-i",
                    str(frame_dir / "section-01-%04d.png"),
                    "-c:v",
                    "libx264",
                    "-pix_fmt",
                    "yuv420p",
                    "-crf",
                    "23",
                    "-preset",
                    "medium",
                    "-movflags",
                    "+faststart",
                    str(output_path),
                ],
                check=True,
            )
        return

    scene.render.ffmpeg.format = "MPEG4"
    scene.render.ffmpeg.codec = "H264"
    scene.render.ffmpeg.constant_rate_factor = "MEDIUM"
    scene.render.ffmpeg.ffmpeg_preset = "GOOD"
    scene.render.ffmpeg.audio_codec = "NONE"
    scene.render.filepath = str(output_path)
    bpy.ops.render.render(animation=True)


def main() -> None:
    args = parse_args()
    clean_scene()
    configure_scene()
    minimal_studio()
    _, points = make_print_path()
    build_nozzle(points)

    BLEND_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_DIR / "section-01-print.blend"))
    if args.preview or not args.animation:
        render_preview()
    if args.animation:
        render_animation()


if __name__ == "__main__":
    main()
