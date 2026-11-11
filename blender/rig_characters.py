"""
Rigs the family's full-body A-pose character models for the game.

  reference/happy.glb, honey.glb, Mom.glb, Dad.glb   (Tripo, ~1M faces, un-rigged)
      -> game/assets/char_bhaiya.glb, char_honey.glb, char_maa.glb, char_baba.glb
      -> game/assets/characters.json   (face anchor heights etc. for the game)

For each model:
  1. scale to a real height, feet on the ground, facing -Y (glTF +Z)
  2. decimate to a game-friendly size and re-bake its colour texture from the original
  3. fit a skeleton by measuring the body (legs, crotch, neck, shoulders, fingertips)
  4. skin it: bone-heat weights on a watertight voxel copy, transferred to the model
  5. export a skinned GLB with the same bone names the game's IK rig uses

Usage:  blender --background --python rig_characters.py -- [--render] [--only=honey]
"""
import bpy, bmesh, math, os, sys, json
from mathutils import Vector, Matrix
from mathutils.kdtree import KDTree

try:
    ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
except NameError:
    ROOT = r"D:\Bhai_Dooj"
REF = os.path.join(ROOT, "reference")
OUT = os.path.join(ROOT, "game", "assets")
RENDER_DIR = os.path.join(ROOT, "renders")
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
DO_RENDER = "--render" in argv
ONLY = next((a.split("=", 1)[1] for a in argv if a.startswith("--only=")), None)

# name in game, source file, real height (m)
CHARS = [
    ("bhaiya", "happy.glb", 1.72),
    ("honey", "honey.glb", 1.60),
    ("maa", "Mom.glb", 1.55),
    ("baba", "Dad.glb", 1.70),
]
FACES = 32000
TEX = 1024

SCENE = bpy.context.scene


def clear_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)


def select_only(*objs, active=None):
    for o in SCENE.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or objs[0]


# ------------------------------------------------------------------ 1-2: import, place, decimate, bake
def load_model(src, height, name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(REF, src))
    new = [o for o in bpy.data.objects if o not in before]
    H = next(o for o in new if o.type == "MESH")
    H.data.transform(H.matrix_world)
    H.parent = None
    H.matrix_world = Matrix.Identity(4)
    for o in new:
        if o is not H:
            bpy.data.objects.remove(o)
    me = H.data
    xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
    s = height / (max(zs) - min(zs))
    me.transform(Matrix.Scale(s, 4) @ Matrix.Translation((-(max(xs) + min(xs)) / 2, -(max(ys) + min(ys)) / 2, -min(zs))))
    # face -Y: the toes stick out further to the front than the heels to the back
    feet = [v.co for v in me.vertices if v.co.z < 0.03 * height]
    if feet and abs(min(p.y for p in feet)) < abs(max(p.y for p in feet)):
        me.transform(Matrix.Rotation(math.pi, 4, "Z"))
        print("  rotated 180 so the character faces -Y")
    H.name = name + "_hi"
    return H


# per-character touch-ups to the scan before rigging (the reference files stay untouched)
LEG_BULK = {"baba": 1.24}   # Papa's trousers came out thin under his big puffy jacket


def thicken_legs(H, Hh, k):
    """Make the trouser legs thicker around each leg's own centre. Each leg grows outwards,
    so the inner thighs stay where they are; shoes barely change; the effect fades out at the hips."""
    me = H.data
    band = 0.02 * Hh
    lim = 0.17 * Hh                     # stay clear of the hanging A-pose hands
    z_full, z_end = 0.42 * Hh, 0.52 * Hh
    stats = {}
    for v in me.vertices:
        c = v.co
        if c.z > z_end or abs(c.x) > lim:
            continue
        s = stats.setdefault((int(c.z / band), 1 if c.x >= 0 else -1), [9.0, -9.0, 9.0, -9.0])
        s[0] = min(s[0], c.x); s[1] = max(s[1], c.x); s[2] = min(s[2], c.y); s[3] = max(s[3], c.y)
    moved = 0
    for v in me.vertices:
        c = v.co
        if c.z > z_end or abs(c.x) > lim:
            continue
        side = 1 if c.x >= 0 else -1
        s = stats.get((int(c.z / band), side))
        if not s:
            continue
        cx, cy, hw = (s[0] + s[1]) / 2, (s[2] + s[3]) / 2, (s[1] - s[0]) / 2
        if c.z < 0.06 * Hh:
            f = 1 + (k - 1) * 0.25          # shoes: only a touch bigger
        elif c.z < 0.12 * Hh:
            f = 1 + (k - 1) * 0.6           # ankles
        elif c.z < z_full:
            f = k
        else:
            f = 1 + (k - 1) * (z_end - c.z) / (z_end - z_full)
        c.x = cx + (c.x - cx) * f + side * (f - 1) * hw
        c.y = cy + (c.y - cy) * f
        moved += 1
    me.update()
    print(f"  thickened the legs x{k} ({moved} vertices)")


def decimate_and_bake(H, name):
    bm = bmesh.new()
    bm.from_mesh(H.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0002)
    weld = bpy.data.meshes.new(name + "_weld")
    bm.to_mesh(weld)
    bm.free()
    L = bpy.data.objects.new(name + "_lo", weld)
    SCENE.collection.objects.link(L)
    dec = L.modifiers.new("Dec", "DECIMATE")
    dec.ratio = min(1.0, FACES / max(1, len(weld.polygons)))
    dg = bpy.context.evaluated_depsgraph_get()
    low = bpy.data.meshes.new_from_object(L.evaluated_get(dg))
    L.modifiers.clear()
    L.data = low
    bpy.data.meshes.remove(weld)
    select_only(L)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.002)
    bpy.ops.object.mode_set(mode="OBJECT")
    img = bpy.data.images.new(name + "_color", TEX, TEX)
    m = bpy.data.materials.new(name.capitalize() + "_Skin")
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.6
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    nt.nodes.active = tex
    L.data.materials.clear()
    L.data.materials.append(m)
    SCENE.render.engine = "CYCLES"
    SCENE.cycles.samples = 2
    select_only(H, L, active=L)
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"}, use_selected_to_active=True,
                        cage_extrusion=0.012, max_ray_distance=0.04, margin=6)
    os.makedirs(os.path.join(OUT, "tex"), exist_ok=True)
    img.filepath_raw = os.path.join(OUT, "tex", name + ".png")
    img.file_format = "PNG"
    img.save()
    for p in L.data.polygons:
        p.use_smooth = True
    print(f"  decimated to {len(L.data.polygons)} faces, baked {TEX}px")
    return L


# ------------------------------------------------------------------ 3: fit a skeleton by measuring the body
def runs(values, gap):
    """Group sorted 1-D values into runs separated by more than `gap`."""
    out = []
    for x in sorted(values):
        if out and x - out[-1][1] <= gap:
            out[-1][1] = x
        else:
            out.append([x, x])
    return out


def fit_skeleton(L, Hh):
    P = [v.co.copy() for v in L.data.vertices]
    dz = 0.006 * Hh
    sl = lambda z: [p for p in P if abs(p.z - z) < dz]
    gap = 0.012 * Hh

    def centre_run(z, lim=None):
        pts = sl(z)
        if lim:
            pts = [p for p in pts if abs(p.x) < lim]
        if not pts:
            return None
        for a, b in runs([p.x for p in pts], gap):
            if a <= 0.0 <= b:
                inr = [p for p in pts if a <= p.x <= b]
                return a, b, (min(p.y for p in inr) + max(p.y for p in inr)) / 2
        return None

    def yc(z, x=0.0, w=0.05):
        pts = [p for p in sl(z) if abs(p.x - x) < w * Hh]
        return (min(p.y for p in pts) + max(p.y for p in pts)) / 2 if pts else 0.0

    # legs: two runs at knee height; crotch = where they merge going up
    lk = [r for r in runs([p.x for p in sl(0.25 * Hh) if abs(p.x) < 0.2 * Hh], gap)]
    if len(lk) >= 2:
        lk.sort(key=lambda r: abs((r[0] + r[1]) / 2))
        leg_x = sorted(((r[0] + r[1]) / 2 for r in lk[:2]))
        lx = (abs(leg_x[0]) + abs(leg_x[1])) / 2
    else:
        lx = 0.055 * Hh
    crotch = 0.45 * Hh
    for i in range(60):
        z = (0.28 + i * 0.006) * Hh
        rr = runs([p.x for p in sl(z) if abs(p.x) < 0.2 * Hh], gap)
        if len(rr) == 1 and rr[0][0] < -0.5 * lx and rr[0][1] > 0.5 * lx:
            crotch = z
            break
    # neck: narrowest centre run between 70% and 93% of the height
    best = (9, 0.85 * Hh)
    for i in range(70):
        z = (0.70 + i * 0.0033) * Hh
        r = centre_run(z, 0.2 * Hh)
        if r and (r[1] - r[0]) < best[0]:
            best = (r[1] - r[0], z)
    neck_z = best[1]
    # shoulders: top of the shoulder slope just under the neck; arm joint sits inside the deltoid
    sh_z = neck_z - 0.045 * Hh
    r = centre_run(neck_z - 0.03 * Hh)
    half = max(abs(r[0]), abs(r[1])) if r else 0.15 * Hh
    sh_x = max(0.07 * Hh, half - 0.035 * Hh)
    # fingertips = the most lateral points of each arm
    tipL = max(P, key=lambda p: p.x)
    tipR = min(P, key=lambda p: p.x)
    J = {}
    J["pelvis"] = Vector((0, yc(crotch + 0.06 * Hh), crotch + 0.06 * Hh))
    J["waist"] = Vector((0, yc(crotch + 0.14 * Hh), crotch + 0.14 * Hh))
    J["chest"] = Vector((0, yc(neck_z - 0.13 * Hh), neck_z - 0.13 * Hh))
    J["neck0"] = Vector((0, yc(neck_z - 0.02 * Hh), neck_z - 0.02 * Hh))
    J["neck1"] = Vector((0, yc(neck_z + 0.03 * Hh), neck_z + 0.03 * Hh))
    J["head_top"] = Vector((0, J["neck1"].y, Hh))
    for sd, sx, tip in (("L", 1, tipL), ("R", -1, tipR)):
        sh = Vector((sx * sh_x, yc(sh_z, sx * sh_x, 0.04), sh_z))
        arm = (tip - sh)
        hand_len = min(0.105 * Hh, arm.length * 0.24)
        wr = tip - arm.normalized() * hand_len
        el = sh + (wr - sh) * 0.52 + Vector((0, 0.008 * Hh, 0))
        J["clav_" + sd] = Vector((sx * 0.02 * Hh, J["neck0"].y, sh_z + 0.01 * Hh))
        J["shoulder_" + sd] = sh
        J["elbow_" + sd] = el
        J["wrist_" + sd] = wr
        J["tip_" + sd] = tip.copy()
        hip = Vector((sx * lx, yc(crotch, sx * lx, 0.04), crotch + 0.01 * Hh))
        an = Vector((sx * lx, yc(0.05 * Hh, sx * lx, 0.05), 0.05 * Hh))
        feet = [p for p in P if p.z < 0.04 * Hh and abs(p.x - sx * lx) < 0.06 * Hh]
        toe_y = min(p.y for p in feet) if feet else an.y - 0.1 * Hh
        J["hip_" + sd] = hip
        J["knee_" + sd] = (hip + an) / 2 + Vector((0, -0.008 * Hh, 0))
        J["ankle_" + sd] = an
        J["toe_" + sd] = Vector((sx * lx, toe_y + 0.02 * Hh, 0.015 * Hh))
    print("  joints: crotch %.2f neck %.2f shoulder x %.2f z %.2f" % (crotch, neck_z, sh_x, sh_z))
    return J


def bones_from(J):
    B = {"hips": (J["pelvis"], J["waist"], None), "spine": (J["waist"], J["chest"], "hips"),
         "chest": (J["chest"], J["neck0"], "spine"), "neck": (J["neck0"], J["neck1"], "chest"),
         "head": (J["neck1"], J["head_top"], "neck")}
    for sd in "LR":
        B["clavicle_" + sd] = (J["clav_" + sd], J["shoulder_" + sd], "chest")
        B["upperarm_" + sd] = (J["shoulder_" + sd], J["elbow_" + sd], "clavicle_" + sd)
        B["forearm_" + sd] = (J["elbow_" + sd], J["wrist_" + sd], "upperarm_" + sd)
        B["hand_" + sd] = (J["wrist_" + sd], J["tip_" + sd], "forearm_" + sd)
        B["thigh_" + sd] = (J["hip_" + sd], J["knee_" + sd], "hips")
        B["shin_" + sd] = (J["knee_" + sd], J["ankle_" + sd], "thigh_" + sd)
        B["foot_" + sd] = (J["ankle_" + sd], J["toe_" + sd], "shin_" + sd)
    return B


def make_armature(name, B):
    arm = bpy.data.armatures.new(name + "_rig")
    rig = bpy.data.objects.new(name, arm)
    SCENE.collection.objects.link(rig)
    select_only(rig)
    bpy.ops.object.mode_set(mode="EDIT")
    for bn, (h, t, _) in B.items():
        eb = arm.edit_bones.new(bn)
        eb.head, eb.tail = h, t
    for bn, (_, _, par) in B.items():
        if par:
            arm.edit_bones[bn].parent = arm.edit_bones[par]
    bpy.ops.object.mode_set(mode="OBJECT")
    return rig


# ------------------------------------------------------------------ 4: skin weights via a watertight proxy
def seg_weights(co, segs):
    """Fallback: weight by distance to the two nearest bone segments."""
    best = []
    for nm, a, b in segs:
        ab = b - a
        t = max(0.0, min(1.0, (co - a).dot(ab) / max(1e-9, ab.dot(ab))))
        best.append(((co - (a + ab * t)).length, nm))
    best.sort()
    (d1, b1), (d2, b2) = best[0], best[1]
    w1, w2 = 1 / max(d1, 1e-4) ** 4, 1 / max(d2, 1e-4) ** 4
    if d2 > d1 * 1.5 + 0.02:
        return {b1: 1.0}
    return {b1: w1 / (w1 + w2), b2: w2 / (w1 + w2)}


def heat_proxy(L, rig, Hh, voxel):
    proxy = bpy.data.objects.new(L.name + "_proxy", L.data.copy())
    SCENE.collection.objects.link(proxy)
    rm = proxy.modifiers.new("Remesh", "REMESH")
    rm.mode = "VOXEL"
    rm.voxel_size = voxel * Hh / 1.7
    dg = bpy.context.evaluated_depsgraph_get()
    pm = bpy.data.meshes.new_from_object(proxy.evaluated_get(dg))
    proxy.modifiers.clear()
    proxy.data = pm
    dec = proxy.modifiers.new("Dec", "DECIMATE")
    dec.ratio = min(1.0, 40000 / max(1, len(pm.polygons)))
    dg = bpy.context.evaluated_depsgraph_get()
    pm2 = bpy.data.meshes.new_from_object(proxy.evaluated_get(dg))
    proxy.modifiers.clear()
    proxy.data = pm2
    select_only(proxy, rig, active=rig)
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    names = {g.index: g.name for g in proxy.vertex_groups}
    pw = [{names[g.group]: g.weight for g in v.groups if g.weight > 1e-4} for v in pm2.vertices]
    return proxy, pm2, pw


def skin(L, rig, Hh):
    # bone heat on a watertight copy; retry other voxel sizes if the solver gives up
    for voxel in (0.011, 0.014, 0.0085, 0.018):
        proxy, pm2, pw = heat_proxy(L, rig, Hh, voxel)
        empty = sum(1 for w in pw if not w)
        if empty < 0.05 * len(pw):
            break
        print(f"  bone heat failed on {empty}/{len(pw)} proxy verts at voxel {voxel}, retrying")
        bpy.data.objects.remove(proxy)
    segs = [(b.name, b.head_local.copy(), b.tail_local.copy()) for b in rig.data.bones]
    for i, w in enumerate(pw):          # anything still unweighted: distance to bones
        if not w:
            pw[i] = seg_weights(pm2.vertices[i].co, segs)
    kd = KDTree(len(pm2.vertices))
    for v in pm2.vertices:
        kd.insert(v.co, v.index)
    kd.balance()
    groups = {bn.name: L.vertex_groups.new(name=bn.name) for bn in rig.data.bones}
    # everything above the neck (face, glasses, hair round the face) moves with the head only,
    # so spectacles and ears don't stretch when the head turns; a short blend over the neck
    head_z = rig.data.bones["head"].head_local.z + 0.015 * Hh
    blend = 0.03 * Hh
    for v in L.data.vertices:
        acc, tot = {}, 0.0
        for co, i, d in kd.find_n(v.co, 4):
            if not pw[i]:
                continue
            f = 1.0 / (d + 1e-4)
            tot += f
            for bn, x in pw[i].items():
                acc[bn] = acc.get(bn, 0.0) + x * f
        if tot == 0:
            continue
        s = sum(acc.values())
        w = {bn: x / s for bn, x in acc.items()}
        t = max(0.0, min(1.0, (v.co.z - (head_z - blend)) / blend)) if abs(v.co.x) < 0.14 * Hh else 0.0
        if t > 0:
            w = {bn: x * (1 - t) for bn, x in w.items()}
            w["head"] = w.get("head", 0.0) + t
        for bn, x in w.items():
            if x > 0.01:
                groups[bn].add([v.index], x, "REPLACE")
    bpy.data.objects.remove(proxy)
    L.parent = rig
    mod = L.modifiers.new("Armature", "ARMATURE")
    mod.object = rig
    print(f"  skinned via voxel proxy ({len(pm2.vertices)} verts, {empty} without heat weights)")


# ------------------------------------------------------------------ main
meta = {}
path_meta = os.path.join(OUT, "characters.json")
if os.path.exists(path_meta):
    meta = json.load(open(path_meta))
made = []
for name, src, height in CHARS:
    if ONLY and name != ONLY:
        continue
    print("==", name, src, height)
    clear_scene()
    Hobj = load_model(src, height, name)
    if name in LEG_BULK:
        thicken_legs(Hobj, height, LEG_BULK[name])
    L = decimate_and_bake(Hobj, name)
    J = fit_skeleton(L, height)
    B = bones_from(J)
    bpy.data.objects.remove(Hobj)
    rig = make_armature(name, B)
    L.name = name + "_mesh"
    skin(L, rig, height)
    select_only(L, rig, active=rig)
    out = os.path.join(OUT, "char_" + name + ".glb")
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_selection=True, export_apply=False, export_animations=False)
    print("  EXPORTED", out)
    neck, top = J["neck1"].z, height
    meta[name] = {"height": height, "forehead": round(neck + 0.62 * (top - neck), 3), "mouth": round(neck + 0.2 * (top - neck), 3),
                  "headTop": round(top, 3), "shoulder": round(J["shoulder_L"].z, 3)}
    if DO_RENDER:
        made.append((name, rig, L, J))
json.dump(meta, open(path_meta, "w"), indent=1)
print("WROTE", path_meta)

if DO_RENDER:
    # line them up and render (with the fitted joints shown as small spheres)
    clear_scene()
    for name, src, height in CHARS:
        if ONLY and name != ONLY:
            continue
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, "char_" + name + ".glb"))
        for o in bpy.data.objects:
            if o not in before and o.parent is None:
                o.location.x = {"maa": -1.35, "honey": -0.45, "bhaiya": 0.45, "baba": 1.35}[name]
    SCENE.render.engine = "BLENDER_EEVEE"
    w = bpy.data.worlds.new("W"); SCENE.world = w
    try:
        w.use_nodes = True
    except Exception:
        pass
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.8, 0.78, 0.85, 1)
    for nm, d, e in (("Key", (0.4, 0.8, -0.6), 3.0), ("Fill", (-0.6, 0.6, -0.3), 1.2)):
        sun = bpy.data.objects.new(nm, bpy.data.lights.new(nm, "SUN"))
        sun.data.energy = e
        sun.rotation_euler = Vector(d).to_track_quat("-Z", "Y").to_euler()
        SCENE.collection.objects.link(sun)
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    SCENE.collection.objects.link(cam)
    cam.location = (0, -6.0, 1.0)
    cam.rotation_euler = (Vector((0, 0, 0.85)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = 45
    SCENE.camera = cam
    SCENE.render.resolution_x, SCENE.render.resolution_y = 1400, 900
    SCENE.render.filepath = os.path.join(RENDER_DIR, "family_rigged.png")
    bpy.ops.render.render(write_still=True)
    print("RENDERED family_rigged.png")
