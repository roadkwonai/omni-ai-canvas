"""씬룸에서 검증한 GLB와 장면 명세로 로컬 MP4를 렌더한다."""
import json
import math
import re
import sys
import traceback

import bpy
from mathutils import Vector


def fail(message):
    raise RuntimeError("SCENE_ROOM:" + message)


def import_glb(filename):
    before_objects = set(bpy.data.objects)
    before_actions = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=filename)
    objects = [obj for obj in bpy.data.objects if obj not in before_objects]
    actions = [action for action in bpy.data.actions if action not in before_actions]
    meshes = [obj for obj in objects if obj.type == "MESH"]
    if not meshes:
        fail("GLB에 화면에 표시할 메시가 없습니다.")
    roots = [obj for obj in objects if obj.parent not in objects]
    return objects, actions, meshes, roots


def group_roots(name, roots):
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    for obj in roots:
        world = obj.matrix_world.copy()
        obj.parent = root
        obj.matrix_world = world
    return root


def reset_imported_animation(objects):
    for obj in objects:
        # glTF import may activate an arbitrary clip and create additional NLA tracks.
        # Start from rest and activate the user's selected character clip below.
        if obj.animation_data:
            obj.animation_data_clear()
        if obj.type == "ARMATURE":
            for bone in obj.pose.bones:
                bone.location = (0, 0, 0)
                bone.rotation_euler = (0, 0, 0)
                bone.rotation_quaternion = (1, 0, 0, 0)
                bone.rotation_axis_angle = (0, 0, 1, 0)
                bone.scale = (1, 1, 1)
        if obj.type == "MESH" and obj.data.shape_keys and obj.data.shape_keys.animation_data:
            obj.data.shape_keys.animation_data_clear()
        # Imported cameras cannot become the shot camera and imported lights
        # must not alter the explicitly configured scene lighting.
        if obj.type in {"CAMERA", "LIGHT"}:
            obj.hide_render = True


def configure(data):
    spec = data["spec"]
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = 16 if data["quality"] == "preview" else 48
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 4
    scene.render.fps = spec["fps"]
    scene.frame_start = 1
    scene.frame_end = round(spec["seconds"] * spec["fps"])
    base = (640, 360) if data["quality"] == "preview" else (1280, 720)
    aspect = spec["aspect"]
    scene.render.resolution_x, scene.render.resolution_y = (base if aspect == "16:9" else (base[1], base[0]) if aspect == "9:16" else (base[1], base[1]))
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = data["frames"]
    scene.render.use_file_extension = True
    scene.render.film_transparent = False

    environment, _, _, env_roots = import_glb(data["paths"]["environmentPath"])
    reset_imported_animation(environment)
    env_root = group_roots("Environment", env_roots)
    env_root.location = spec["environmentPosition"]
    env_root.scale = [spec["environmentScale"]] * 3
    actors = spec.get("actors") or [{
        "characterId": spec["characterId"], "action": spec["action"], "loop": spec["loop"],
        "poses": spec.get("poses", []) + ([{"bone": spec["bone"], "rotation": spec["boneRotation"]}] if spec["bone"] and not any(p["bone"] == spec["bone"] for p in spec.get("poses", [])) else []),
        "position": spec["characterPosition"], "rotation": spec["characterRotation"], "expressions": [], "lipCues": []
    }]
    paths = data["paths"].get("actorPaths") or [data["paths"]["characterPath"]]
    if len(paths) != len(actors):
        fail("배역 모델 경로를 확인해 주세요.")
    for index, actor in enumerate(actors):
        objects, actions, meshes, roots = import_glb(paths[index])
        reset_imported_animation(objects)
        character = group_roots("Character " + str(index + 1), roots)
        bpy.context.view_layer.update()
        points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
        low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
        high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
        height = high.z - low.z
        if height <= 1e-8 or not math.isfinite(height):
            fail("캐릭터 모델의 크기를 확인할 수 없습니다.")
        scale = 1.8 / height
        character.scale = [scale] * 3
        character.rotation_euler.z = math.radians(actor["rotation"])
        # Anchor the original ground plane and horizontal centre after scale and yaw.
        bpy.context.view_layer.update()
        moved = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
        centre_x = (min(p.x for p in moved) + max(p.x for p in moved)) / 2
        centre_y = (min(p.y for p in moved) + max(p.y for p in moved)) / 2
        floor_z = min(p.z for p in moved)
        character.location = Vector(actor["position"]) - Vector((centre_x, centre_y, floor_z))

        armatures = [obj for obj in objects if obj.type == "ARMATURE"]
        if actor["action"]:
            action = next((item for item in actions if (item.name == actor["action"] or re.sub(r"\.\d{3}$", "", item.name) == actor["action"])), None)
            if not action:
                fail("선택한 애니메이션을 캐릭터에서 찾을 수 없습니다.")
            if not armatures:
                fail("애니메이션을 적용할 리그가 없습니다.")
            rig = armatures[0]
            rig.animation_data_create()
            rig.animation_data.action = action
            # NLA strip repeats the imported clip without modifying source keys.
            if actor["loop"]:
                rig.animation_data.action = None
                start, end = action.frame_range
                if end <= start:
                    fail("애니메이션 길이를 확인할 수 없습니다.")
                track = rig.animation_data.nla_tracks.new()
                strip = track.strips.new("Character action", 1, action)
                strip.repeat = max(1.0, scene.frame_end / (end - start))
                strip.frame_end = scene.frame_end + 1
        poses = {pose["bone"]: pose["rotation"] for pose in actor.get("poses", [])}
        for name, rotation in poses.items():
            rig = next((item for item in armatures if item.pose.bones.get(name)), None)
            if not rig:
                fail("선택한 본을 캐릭터에서 찾을 수 없습니다.")
            offset = bpy.data.objects.new("Pose offset", None)
            scene.collection.objects.link(offset)
            offset.rotation_euler = [math.radians(value) for value in rotation]
            constraint = rig.pose.bones[name].constraints.new("COPY_ROTATION")
            constraint.name = "Scene Room pose offset"
            constraint.target = offset
            constraint.owner_space = "LOCAL"
            constraint.target_space = "LOCAL"
            constraint.mix_mode = "AFTER"


        shape_keys = {key.name: key for mesh in meshes if mesh.data.shape_keys for key in mesh.data.shape_keys.key_blocks}
        for expression in actor.get("expressions", []):
            key = shape_keys.get(expression["key"])
            if key is None:
                fail("선택한 표정 키를 캐릭터에서 찾을 수 없습니다.")
            key.value = expression["value"]
        for cue in actor.get("lipCues", []):
            key = shape_keys.get(cue["key"])
            if key is None:
                fail("선택한 입 모양 키를 캐릭터에서 찾을 수 없습니다.")
            key.value = cue["value"]
            key.keyframe_insert(data_path="value", frame=1 + round(cue["time"] * spec["fps"]))

    camera_data = bpy.data.cameras.new("Shot camera")
    camera = bpy.data.objects.new("Shot camera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.data.lens = spec["camera"]["lens"]
    target = bpy.data.objects.new("Camera target", None)
    scene.collection.objects.link(target)
    target.location = spec["camera"]["target"]
    track = camera.constraints.new("TRACK_TO")
    track.target = target
    track.track_axis = "TRACK_NEGATIVE_Z"
    track.up_axis = "UP_Y"
    camera.location = spec["camera"]["position"]
    camera.keyframe_insert(data_path="location", frame=scene.frame_start)
    camera.location = spec["camera"]["endPosition"]
    camera.keyframe_insert(data_path="location", frame=scene.frame_end)
    light_data = bpy.data.lights.new("Key light", "AREA")
    light_data.energy = spec["light"]["power"]
    light_data.size = 4
    light_data.color = tuple(int(spec["light"]["color"][i:i+2], 16) / 255 for i in (1, 3, 5))
    light = bpy.data.objects.new("Key light", light_data)
    scene.collection.objects.link(light)
    light.location = spec["light"]["position"]
    direction = Vector(spec["camera"]["target"]) - light.location
    if direction.length > 1e-8:
        light.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    world = bpy.data.worlds.new("Ambient")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes.get("Background").inputs["Strength"].default_value = spec["light"]["ambient"]
    if data.get("blendFile"):
        bpy.ops.file.pack_all()
        bpy.ops.wm.save_as_mainfile(filepath=data["blendFile"])
        if data.get("exportOnly"):
            return
    scene.render.use_overwrite = False
    bpy.ops.render.render(animation=True)


try:
    args = sys.argv[sys.argv.index("--") + 1:]
    with open(args[0], encoding="utf-8") as file:
        configure(json.load(file))
except Exception as exc:
    message = str(exc)
    print(message if "SCENE_ROOM:" in message else "SCENE_ROOM:모델 또는 렌더 설정을 확인하세요.", file=sys.stderr)
    traceback.print_exc(file=sys.stderr)
    sys.exit(1)
