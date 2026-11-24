"""디렉터 스튜디오의 카메라 이동·시간 표현 기본 예제를 렌더한다.
사용: Blender --background --factory-startup --python scripts/director_moves.py -- <PNG 출력 폴더> [id ...]
한 장면에서 카메라만 바꿔 기법의 차이를 비교한다. 외부 자산을 쓰지 않는다."""
import math
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

FPS, FRAMES = 20, 80
args = sys.argv[sys.argv.index("--") + 1:]
out = Path(args[0])
only = set(args[1:])

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def material(name, color, rough=0.8, emission=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    if emission:
        b.inputs["Emission Color"].default_value = (*color, 1)
        b.inputs["Emission Strength"].default_value = emission
    return m


M = {
    "floor": material("floor", (.36, .33, .3)), "line": material("line", (.85, .6, .12)), "steel": material("steel", (.04, .22, .19), .5),
    "roof": material("roof", (.16, .2, .2)), "bench": material("bench", (.3, .14, .06)), "train": material("train", (.06, .16, .34), .3),
    "window": material("window", (.6, .75, .9), .1), "hill": material("hill", (.24, .3, .2)), "coat": material("coat", (.48, .27, .1)),
    "skin": material("skin", (.75, .5, .38)), "dark": material("dark", (.03, .03, .04)), "lamp": material("lamp", (1, .75, .4), .5, 4),
    "red": material("red", (.7, .05, .04)), "cloud": material("cloud", (.9, .92, .95)), "navy": material("navy", (.05, .08, .2)),
}


def finish(obj, mat, parent=None, smooth=False):
    obj.data.materials.append(M[mat])
    if smooth:
        for p in obj.data.polygons:
            p.use_smooth = True
    if parent:
        obj.parent = parent
    return obj


def box(size, loc, mat, parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.scale = size
    return finish(o, mat, parent)


def cyl(r1, r2, h, loc, mat, parent=None):
    bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=r1, radius2=r2, depth=h, location=loc)
    return finish(bpy.context.object, mat, parent, True)


def ball(r, loc, mat, parent=None, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=r, location=loc)
    o = bpy.context.object
    o.scale = scale
    return finish(o, mat, parent, True)


def empty(loc=(0, 0, 0), parent=None):
    o = bpy.data.objects.new("empty", None)
    scene.collection.objects.link(o)
    o.location = loc
    o.parent = parent
    return o


# 승강장. 인물은 원점에서 -Y를 보고 선다.
box((7.6, 130, .3), (0, 0, -.15), "floor")
box((60, 130, .1), (0, 0, -.9), "hill")
for x in (-2.6, 2.6):
    box((.28, 130, .02), (x, 0, .011), "line")
for i in range(-26, 27):
    box((7.6, .025, .012), (0, i * 2.5, .006), "dark")
canopy_start = set(bpy.data.objects)
for i in range(-12, 13):
    y = i * 5 + 2.5
    for x in (-3.2, 3.2):
        box((.24, .24, 4.4), (x, y, 2.2), "steel")
        box((.55, .55, .35), (x, y, .17), "steel")
    box((7.6, .2, .3), (0, y, 4.35), "steel")
    if i % 2 == 0:
        ball(.16, (0, y, 3.75), "lamp")
        box((.02, .02, .5), (0, y, 4.05), "dark")
    if i % 3 == 0:
        box((.6, 1.7, .08), (-2.05, y + 2.2, .48), "bench")
        box((.08, 1.7, .5), (-2.32, y + 2.2, .78), "bench")
        for dy in (-.6, .6):
            box((.45, .08, .45), (-2.05, y + 2.2 + dy, .24), "steel")
for x in (-2.4, -.8, .8, 2.4):
    box((1.3, 130, .06), (x, 0, 4.6), "roof")
canopy = [o for o in bpy.data.objects if o not in canopy_start and o.data.materials[0].name not in ("bench",)]
box((2.6, 46, 2.9), (5.8, 22, 1.35), "train")
for i in range(0, 18):
    box((.05, 1.5, .85), (4.48, 1 + i * 2.5, 1.9), "window")
for x, y, s in ((-34, 60, 20), (-18, 85, 26), (12, 95, 30), (40, 70, 24), (-40, -40, 22), (38, -50, 24), (0, -95, 26)):
    cyl(s, 0, s * .8, (x, y, s * .4 - 1), "hill")
clouds = [ball(3, (x, y, 24 + z), "cloud", None, (2.4, 1.2, .5)) for x, y, z in ((-25, 60, 0), (0, 75, 4), (22, 62, 2), (-10, 55, 8), (34, 80, 6))]


def person(loc, coat="coat"):
    root = empty(loc)
    body = empty((0, 0, 0), root)
    cyl(.27, .2, .95, (0, 0, 1.05), coat, body)
    ball(.215, (0, 0, 1.42), coat, body, (1, .8, .7))
    cyl(.07, .07, .14, (0, 0, 1.56), "skin", body)
    ball(.125, (0, 0, 1.7), "skin", body, (.9, 1, 1.15))
    ball(.135, (0, .022, 1.745), "dark", body, (.94, 1, .95))
    ball(.022, (0, -.125, 1.69), "skin", body)
    for x in (-.045, .045):
        ball(.015, (x, -.112, 1.725), "dark", body)
    limbs = []
    for x in (-.1, .1):
        hip = empty((x, 0, .82), body)
        cyl(.075, .06, .8, (0, 0, -.4), "dark", hip)
        box((.11, .26, .08), (0, -.06, -.78), "dark", hip)
        limbs.append(hip)
    for x in (-.25, .25):
        shoulder = empty((x, 0, 1.42), body)
        cyl(.055, .065, .62, (0, 0, -.31), coat, shoulder)
        ball(.055, (0, 0, -.66), "skin", shoulder)
        limbs.append(shoulder)
    return root, limbs


man, limbs = person((0, 0, 0))
extras = [person((x, y, 0), c) for x, y, c in ((-1.6, 2.2, "navy"), (1.5, 3.6, "dark"), (-1.2, -2.4, "dark"), (1.9, -6.4, "navy"))]
prop = empty()
cyl(.05, .065, .16, (0, 0, .08), "red", prop)
toy = ball(.16, (.75, -.2, .16), "red")
arm = cyl(.05, .06, .62, (0, 0, 0), "coat")

cam_data = bpy.data.cameras.new("cam")
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
cam_data.sensor_width = 36
cam_data.clip_end = 400
sun_data = bpy.data.lights.new("sun", "SUN")
sun = bpy.data.objects.new("sun", sun_data)
scene.collection.objects.link(sun)
sun_data.energy = 4
sun_data.angle = .03
world = bpy.data.worlds.new("world")
scene.world = world
world.use_nodes = True
sky = world.node_tree.nodes["Background"]
sky.inputs[0].default_value = (.55, .72, .92, 1)
sky.inputs[1].default_value = .75

scene.render.engine = "BLENDER_EEVEE"
scene.eevee.taa_render_samples = 16
scene.render.resolution_x, scene.render.resolution_y = 512, 384
scene.render.fps = FPS
scene.frame_start, scene.frame_end = 1, FRAMES
scene.render.image_settings.file_format = "PNG"
scene.view_settings.view_transform = "Standard"

HEAD = Vector((0, 0, 1.5))
V = lambda *v: Vector(v)
mix = lambda a, b, t: a + (b - a) * t


def ease(t):
    t = min(1, max(0, (t - .08) / .84))
    return t * t * (3 - 2 * t)


def around(angle, radius, height, target=HEAD):
    a = math.radians(angle)
    return V(target.x + math.sin(a) * radius, target.y - math.cos(a) * radius, height)


def S(loc, look=HEAD, lens=35, roll=0, **extra):
    return dict(loc=loc, look=look, lens=lens, roll=roll, **extra)


def walk(t, speed=1.3, phase=1.0):
    return dict(pos=V(0, -speed * t * 4, 0), step=math.sin(t * math.tau * 4 * phase) * .5)


def noise(t, seed):
    return sum(math.sin(t * math.tau * f + seed * 1.7 + f) / f for f in (2, 3.3, 5.1, 7.7)) / 2


ROBOT = [V(-2.2, -2.2, .6), V(0, -1.5, 2.3), V(2.0, -1.2, 1.1), V(.7, -1.1, 1.75), V(0, -2.4, 1.55)]


def spline(points, t):
    u = t * (len(points) - 1)
    i = min(int(u), len(points) - 2)
    f = u - i
    p = [points[max(0, min(len(points) - 1, i + k))] for k in (-1, 0, 1, 2)]
    return .5 * (2 * p[1] + (p[2] - p[0]) * f + (2 * p[0] - 5 * p[1] + 4 * p[2] - p[3]) * f ** 2 + (3 * p[1] - p[0] - 3 * p[2] + p[3]) * f ** 3)


def steadicam(t):
    w = walk(t)
    return S(V(math.sin(t * 5) * .9 + .2, w["pos"].y + 2.6 - t * .6, 1.65), w["pos"] + V(0, -.6, 1.35), 30, **w)


def handheld(t):
    return S(V(.25 + noise(t, 1) * .09, -2.2 + noise(t, 5) * .05, 1.6 + noise(t, 2) * .07), HEAD + V(noise(t, 3) * .12, 0, noise(t, 4) * .1), 35, noise(t, 6) * 2.4)


def dolly_zoom(t):
    d = mix(1.9, 6.0, ease(t))
    return S(V(0, -d, 1.55), V(0, 0, 1.45), 24 * d / 1.9)


def pov(t):
    y = -10 + t * 5.5
    return S(V(math.sin(t * math.tau * 3) * .035, y, 1.62 + abs(math.sin(t * math.tau * 3)) * .05), V(0, y + 6, 1.5), 26, hide=True, extras=True)


def selfie(t):
    w = walk(t)
    bob = abs(math.sin(t * math.tau * 4)) * .03
    loc = w["pos"] + V(.3, -.85, 1.78 + bob)
    return S(loc, w["pos"] + V(0, 0, 1.6), 19, 3 * math.sin(t * 9), reach=loc, **w)


def slow(t):
    u = t * 4 / 3
    return S(V(1.0, -3.4, 1.2), V(.25, 0, 1.0), 35, jump=.55 * abs(math.sin(u * math.pi * .75)), toy=.16 + 1.5 * abs(math.sin(u * math.pi * .75)))


def lapse(t):
    return S(V(0, -4.2, 1.6), V(0, 0, 1.9), 28, crowd=t, sun=(math.radians(62 - 10 * math.sin(t * math.pi)), 0, math.radians(-70 + 150 * t)),
             sky=mix(Vector((.6, .75, .95)), Vector((.95, .5, .25)), max(0, t - .35) / .65), clouds=t * 40)


def ramp_run(t):
    u = t * .7 / .3 * .35 if t < .3 else .245 / .3 * .3 + (t - .3) * .18 if t < .7 else .245 + .072 + (t - .7) * 2.27
    x = mix(-3.2, 3.2, min(1, u))
    return S(V(0, -5.2, 1.3), V(0, 0, 1.1), 32, pos=V(x, 0, .55 * max(0, math.sin((u - .2) / .25 * math.pi)) if .2 < u < .45 else 0), step=math.sin(u * 40) * .8, turn=90)


def freeze(t):
    u = min(t, .5)
    return S(V(.8, -3.6, 1.1), V(0, 0, 1.15), 32, jump=.8 * math.sin(max(0, u - .12) / .76 * math.pi) if u > .12 else 0, step=.7 if u > .12 else 0, wave=2.4 if u > .12 else 0)


MOVES = {
    "static": lambda t: S(V(.5, -3.4, 1.5), V(0, 0, 1.25), 35, crowd=t * .4),
    "dolly-in": lambda t: S(V(0, mix(-6.5, -1.5, ease(t)), 1.55)),
    "dolly-out": lambda t: S(V(0, mix(-1.5, -6.5, ease(t)), 1.55)),
    "tracking": lambda t: (lambda w: S(w["pos"] + V(.3, 3.2, 1.6), w["pos"] + V(0, 0, 1.2), 32, **w))(walk(t)),
    "truck": lambda t: (lambda w: S(w["pos"] + V(-2.6, 0, 1.45), w["pos"] + V(0, 0, 1.15), 30, **w))(walk(t)),
    "pedestal": lambda t: S(V(0, -3, mix(.45, 2.3, ease(t))), V(0, 10, mix(.45, 2.3, ease(t)))),
    "crane": lambda t: S(V(1.2, mix(-2.6, -7.0, ease(t)), mix(1.0, 3.7, ease(t))), V(0, 0, 1.2), 30),
    "robot-arm": lambda t: S(spline(ROBOT, min(1, t * 1.15)), V(0, 0, 1.4), 28, math.sin(t * math.pi * 2) * 14),
    "steadicam": steadicam,
    "handheld": handheld,
    "drone": lambda t: S(V(mix(-.6, -7, ease(t)), mix(-3, -17, ease(t)), mix(2.0, 12, ease(t))), V(0, 0, 1.2), 28, open=True),
    "pan": lambda t: S(V(0, -3.2, 1.55), V(mix(-2.6, 3.4, ease(t)), 0, 1.45), 30),
    "tilt": lambda t: S(V(.4, -3.0, 1.3), V(0, 0, mix(.1, 3.6, ease(t))), 30),
    "roll": lambda t: S(V(0, -2.8, 1.5), V(0, 0, 1.35), 32, mix(0, 28, ease(t))),
    "arc": lambda t: S(around(mix(-25, 90, ease(t)), 2.4, 1.45), V(0, 0, 1.35), 32),
    "low-arc": lambda t: S(around(mix(-30, 35, ease(t)), 2.0, .25), V(0, 0, 1.45), 24),
    "orbit": lambda t: S(around(360 * t, 2.5, 1.5), V(0, 0, 1.3), 30),
    "aerial-orbit": lambda t: S(around(mix(-60, 60, ease(t)), 3.0, 4.0, V(0, 0, 0)), V(0, 0, .9), 26),
    "whip-pan": lambda t: S(V(0, -3.2, 1.55), V(math.sin(a := mix(0, 2.6, 1 / (1 + math.exp(-(t - .5) * 40)))) * 6, -3.2 + math.cos(a) * 6, 1.45), 32, blur=True, extras=True),
    "zoom": lambda t: S(V(0, -5.5, 1.55), V(0, 0, 1.5), mix(24, 95, ease(t))),
    "dolly-zoom": dolly_zoom,
    "rack-focus": lambda t: S(V(.25, -3.4, 1.32), V(.1, 0, 1.4), 50, prop=V(.12, -2.55, 1.17), focus=mix(.85, 3.4, ease(t))),
    "pov-walk": pov,
    "selfie": selfie,
    "slow-motion": slow,
    "time-lapse": lapse,
    "speed-ramp": ramp_run,
    "freeze-frame": freeze,
}


def apply(s, t):
    direction = s["look"] - s["loc"]
    q = direction.to_track_quat("-Z", "Y") @ Quaternion((0, 0, 1), math.radians(s["roll"]))
    cam.matrix_world = Matrix.Translation(s["loc"]) @ q.to_matrix().to_4x4()
    cam.rotation_mode = "QUATERNION"
    cam_data.lens = s["lens"]
    man.location = s.get("pos", V(0, 0, 0)) + V(0, 0, s.get("jump", 0))
    man.rotation_euler = Euler((0, 0, math.radians(s.get("turn", 0))))
    step = s.get("step", 0)
    for limb, sign in zip(limbs, (1, -1, -1, 1)):
        limb.rotation_euler = Euler((step * sign * (.6 if limb in limbs[2:] else 1), 0, 0))
    if s.get("wave"):
        for limb, side in zip(limbs[2:], (1, -1)):
            limb.rotation_euler = Euler((0, s["wave"] * side, 0))
    crowd = s.get("crowd")
    for i, (root, parts) in enumerate(extras):
        if crowd is not None:
            speed = (9, 7, 11, 8)[i] if crowd > .4 or s.get("sun") else 1.2
            root.location = V((-1.7, 1.6, -1.2, 1.9)[i], ((crowd * speed * 3 * (1 if i % 2 else -1) + i * 5) % 22) - 3, 0)
            root.rotation_euler = Euler((0, 0, 0 if i % 2 == 0 else math.pi))
            for limb, sign in zip(parts, (1, -1, -1, 1)):
                limb.rotation_euler = Euler((math.sin(crowd * 60 + i) * .5 * sign, 0, 0))
    prop.location = s.get("prop", V(0, 0, -20))
    toy.location = V(.75, -.2, s["toy"]) if "toy" in s else V(0, 0, -20)
    cam_data.dof.use_dof = "focus" in s
    if "focus" in s:
        cam_data.dof.aperture_fstop = .6
        cam_data.dof.focus_distance = s["focus"]
    if "reach" in s:
        a, b = man.location + V(.24, -.05, 1.4), s["reach"] + V(.14, .2, -.3)
        arm.location = (a + b) / 2
        arm.rotation_euler = (b - a).to_track_quat("Z", "Y").to_euler()
        arm.scale = (.8, .8, (b - a).length / .62)
    else:
        arm.location = V(0, 0, -20)
    sun.rotation_euler = Euler(s.get("sun", (math.radians(52), math.radians(8), math.radians(-38))))
    sky.inputs[0].default_value = (*s.get("sky", (.55, .72, .92)), 1)
    for i, c in enumerate(clouds):
        c.location.x = ((-25, 0, 22, -10, 34)[i] + s.get("clouds", 0) + 45) % 90 - 45
    return s


def key(frame):
    for o in (cam, man, prop, toy, arm, sun, *clouds, *(r for r, _ in extras)):
        o.keyframe_insert("location", frame=frame)
        o.keyframe_insert("rotation_quaternion" if o is cam else "rotation_euler", frame=frame)
    arm.keyframe_insert("scale", frame=frame)
    for limb in (*limbs, *(p for _, parts in extras for p in parts)):
        limb.keyframe_insert("rotation_euler", frame=frame)
    cam_data.keyframe_insert("lens", frame=frame)
    cam_data.dof.keyframe_insert("focus_distance", frame=frame)
    sky.inputs[0].keyframe_insert("default_value", frame=frame)


for name, move in MOVES.items():
    if only and name not in only:
        continue
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    first = move(0)
    for frame in range(1, FRAMES + 1):
        t = (frame - 1) / (FRAMES - 1)
        apply(move(t), t)
        key(frame)
    for o in [man, *man.children_recursive]:
        o.hide_render = bool(first.get("hide"))
    show = first.get("crowd") is not None or first.get("extras")
    for root, _ in extras:
        for o in [root, *root.children_recursive]:
            o.hide_render = not show
    for o in canopy:
        o.hide_render = bool(first.get("open"))
    scene.render.use_motion_blur = bool(first.get("blur"))
    scene.render.motion_blur_shutter = .8
    scene.render.filepath = str(out / name / "####.png")
    bpy.ops.render.render(animation=True)
