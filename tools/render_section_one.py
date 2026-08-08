"""Build and render Maefer website Section 01 in Blender.

Usage:
  blender --background --python tools/render_section_one.py -- --preview
  blender --background --python tools/render_section_one.py -- --animation
"""

from __future__ import annotations

import argparse
import math
import sys
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

    if printed_part.data.animation_data and printed_part.data.animation_data.action:
        for fcurve in printed_part.data.animation_data.action.fcurves:
            for keyframe in fcurve.keyframe_points:
                keyframe.interpolation = "LINEAR"

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
    black_polymer = textured_material(
        "Technical black polymer",
        (0.013, 0.018, 0.022, 1.0),
        metallic=0.12,
        roughness=0.29,
        noise_scale=54.0,
        bump_strength=0.045,
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
    root.scale = (0.68, 0.68, 0.68)

    # Precision tip and heat block.
    bpy.ops.mesh.primitive_cone_add(
        vertices=64,
        radius1=0.055,
        radius2=0.16,
        depth=0.28,
        location=(0, 0, 0.16),
    )
    tip = bpy.context.object
    tip.name = "Replaceable brass nozzle"
    tip.data.materials.append(brass)
    tip.parent = root
    add_cylinder(
        "Nozzle hex collar",
        (0, 0, 0.34),
        0.175,
        0.18,
        brass,
        vertices=6,
        bevel=0.018,
        parent=root,
    )
    heater = add_beveled_cube(
        "Ceramic heater block",
        (0, 0, 0.53),
        (0.34, 0.29, 0.15),
        ceramic,
        bevel=0.07,
        segments=5,
        parent=root,
    )
    heater.rotation_euler.z = math.radians(3)
    add_beveled_cube(
        "Heater protective sleeve",
        (0, 0.0, 0.53),
        (0.365, 0.315, 0.08),
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

    # Separate radiator fins create a crisp, physically credible silhouette.
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

    # Floating modern shroud around the hotend, with a front intake.
    shroud = add_beveled_cube(
        "Modern print head shroud",
        (0, 0.035, 1.38),
        (0.48, 0.34, 0.36),
        black_polymer,
        bevel=0.14,
        segments=8,
        parent=root,
    )
    shroud.rotation_euler.z = math.radians(-2.0)
    add_beveled_cube(
        "Anodized face plate",
        (0, -0.320, 1.38),
        (0.34, 0.024, 0.24),
        accent,
        bevel=0.09,
        segments=8,
        parent=root,
    )
    add_cylinder(
        "Cooling intake recess",
        (0, -0.356, 1.38),
        0.160,
        0.026,
        dark_metal,
        rotation=(math.pi / 2, 0, 0),
        bevel=0.009,
        parent=root,
    )
    add_torus(
        "Cooling intake ring",
        (0, -0.373, 1.38),
        0.125,
        0.017,
        brushed,
        rotation=(math.pi / 2, 0, 0),
        parent=root,
    )
    for angle in (0, math.pi / 2, math.pi / 4, -math.pi / 4):
        bar = add_beveled_cube(
            "Fan guard",
            (0, -0.391, 1.38),
            (0.140, 0.009, 0.014),
            brushed,
            bevel=0.009,
            segments=2,
            parent=root,
        )
        bar.rotation_euler.y = angle

    # Details: fasteners, heater leads, strain relief and filament throat.
    for x in (-0.29, 0.29):
        for z in (1.19, 1.57):
            add_cylinder(
                "Torx housing fastener",
                (x, -0.348, z),
                0.030,
                0.020,
                brushed,
                vertices=24,
                rotation=(math.pi / 2, 0, 0),
                bevel=0.006,
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
    for x in (-0.37, 0.37):
        add_cylinder(
            "Heater cable",
            (x, 0.16, 0.55),
            0.032,
            0.63,
            copper if x < 0 else black_polymer,
            rotation=(0.18, 0.0, 0.0),
            bevel=0.01,
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

    if root.animation_data and root.animation_data.action:
        for fcurve in root.animation_data.action.fcurves:
            for keyframe in fcurve.keyframe_points:
                keyframe.interpolation = "LINEAR"
    return root


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
    white = material(
        "Studio white",
        (0.92, 0.94, 0.95, 1.0),
        metallic=0,
        roughness=0.68,
    )
    add_beveled_cube(
        "White studio floor",
        (0, 0, -0.14),
        (12, 12, 0.14),
        white,
        bevel=0.12,
        segments=4,
    )

    add_area_light(
        "Large left softbox",
        (-5.5, -4.6, 8.5),
        1450,
        5.5,
        (0.88, 0.94, 1.0),
        (0, 0, 1.0),
    )
    add_area_light(
        "Right rim softbox",
        (5.5, 0.8, 6.5),
        1150,
        4.0,
        (0.72, 0.84, 1.0),
        (0, 0, 1.35),
    )
    add_area_light(
        "Warm front fill",
        (0.5, -5.0, 3.0),
        650,
        3.0,
        (1.0, 0.90, 0.78),
        (0, 0, 1.1),
    )
    add_area_light(
        "Top reflection strip",
        (0, 1.0, 10),
        1000,
        3.0,
        (1.0, 1.0, 1.0),
        (0, 0, 0),
    )

    camera_data = bpy.data.cameras.new("Cinematic camera")
    camera = bpy.data.objects.new("Cinematic camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (10.15, -12.85, 7.55)
    camera_data.lens = 60
    camera_data.sensor_width = 36
    camera_data.dof.use_dof = True
    camera_data.dof.focus_distance = 11.5
    camera_data.dof.aperture_fstop = 5.6
    look_at(camera, (0, 0, 1.1))
    bpy.context.scene.camera = camera


def configure_scene() -> None:
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = FRAME_END
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = 100
    scene.render.fps = FPS
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.render.image_settings.color_depth = "8"

    scene.world.color = (1.0, 1.0, 1.0)
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    background.inputs["Strength"].default_value = 1.4

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
    scene.render.image_settings.file_format = "FFMPEG"
    scene.render.ffmpeg.format = "MPEG4"
    scene.render.ffmpeg.codec = "H264"
    scene.render.ffmpeg.constant_rate_factor = "MEDIUM"
    scene.render.ffmpeg.ffmpeg_preset = "GOOD"
    scene.render.ffmpeg.audio_codec = "NONE"
    scene.render.filepath = str(MEDIA_DIR / "section-01-print.mp4")
    bpy.ops.render.render(animation=True)


def main() -> None:
    args = parse_args()
    clean_scene()
    configure_scene()
    studio()
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
