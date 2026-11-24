import bpy
import math
import sys
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if len(args) != 2:
    raise SystemExit("Usage: blender -b --python scripts/build-direction-face.py -- source.blend output.glb")
source_path, output_path = args

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
with bpy.data.libraries.load(source_path, link=False) as (src, dst):
    dst.objects = [n for n in src.objects if n in {
        "GEO-head_animation_realistic", "GEO-head_animation_realistic.iris.L",
        "GEO-head_animation_realistic.iris.R", "GEO-head_animation_realistic.sclera.L",
        "GEO-head_animation_realistic.sclera.R"}]
reference = next(obj for obj in dst.objects if obj and obj.name == "GEO-head_animation_realistic")
reference_location = reference.location.copy()
reference_scale = reference.scale.copy()
for obj in dst.objects:
    if obj:
        offset = (obj.location - reference_location)
        for vertex in obj.data.vertices:
            for axis in range(3):
                vertex.co[axis] = (vertex.co[axis] * obj.scale[axis] + offset[axis]) / reference_scale[axis]
        bpy.context.collection.objects.link(obj)
        obj.parent = None
        obj.constraints.clear()
        obj.animation_data_clear()
        obj.location = (0, 0, 0)
        obj.rotation_euler = (0, 0, 0)
        obj.scale = (1, 1, 1)
        obj.modifiers.clear()
        obj.data.materials.clear()
        material_name = "Iris" if ".iris." in obj.name else "Sclera" if ".sclera." in obj.name else "Guide"
        material = bpy.data.materials.get(material_name) or bpy.data.materials.new(material_name)
        color = 0.18 if material_name == "Iris" else 0.64 if material_name == "Sclera" else 0.52
        material.diffuse_color = (color, color, color, 1)
        material.use_nodes = True
        material.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value = (color, color, color, 1)
        obj.data.materials.append(material)
for obj in dst.objects:
    if obj:
        for vertex in obj.data.vertices:
            vertex.co.z -= 0.22
            if ".iris." in obj.name:
                vertex.co.y -= 0.006
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
for side in (-1, 1):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, location=(side * 0.035, -0.133, 0.09), radius=0.006)
    pupil = bpy.context.object
    pupil.name = "direction-pupil.L" if side > 0 else "direction-pupil.R"
    pupil.scale = (1, 0.35, 1)
    pupil.data.materials.append(bpy.data.materials["Iris"])
head = bpy.data.objects["GEO-head_animation_realistic"]
head.shape_key_add(name="Basis")
def smooth(x, center, radius):
    return math.exp(-((x-center)/radius)**2 * 2)
for name in ["browLeft", "browRight", "browLowerLeft", "browLowerRight",
             "eyelidLeft", "eyelidRight", "eyelidOpenLeft", "eyelidOpenRight",
             "mouth", "smile", "frown", "surprise", "sadness", "cheekRaise"]:
    key = head.shape_key_add(name=name, from_mix=False)
    for v in key.data:
        x,y,z=v.co
        z += 0.22
        front=smooth(y,-0.105,0.095)
        if name.startswith("brow"):
            side = -1 if name.endswith("Left") else 1
            w=smooth(x,side*0.055,0.052)*smooth(z,0.325,0.025)*front
            v.co.z += (-0.015 if "Lower" in name else 0.017) * w
        elif name.startswith("eyelid"):
            side = -1 if name.endswith("Left") else 1
            w=smooth(x,side*0.055,0.048)*smooth(z,0.295,0.016)*front
            v.co.z += (0.012 if "Open" in name else -0.014) * w
        elif name=="mouth":
            w=smooth(x,0,0.055)*smooth(z,0.195,0.025)*front
            v.co.z-=0.030*w
        elif name in {"smile", "frown"}:
            w = (smooth(x, -0.032, 0.05) + smooth(x, 0.032, 0.05)) * smooth(z, 0.195, 0.038) * front
            v.co.z += (0.016 if name == "smile" else -0.012) * w
            v.co.x += (0.004 if x > 0 else -0.004) * w
        elif name == "surprise":
            v.co.z += 0.015 * smooth(z, 0.322, 0.03) * front
            v.co.z -= 0.018 * smooth(x, 0, 0.05) * smooth(z, 0.195, 0.02) * front
        elif name == "sadness":
            v.co.z += 0.015 * smooth(x, 0, 0.037) * smooth(z, 0.325, 0.026) * front
        elif name == "cheekRaise":
            w = (smooth(x, -0.065, 0.03) + smooth(x, 0.065, 0.03)) * smooth(z, 0.253, 0.024) * front
            v.co.z += 0.007 * w
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=output_path, export_format="GLB", use_selection=True, export_morph=True, export_yup=True)
