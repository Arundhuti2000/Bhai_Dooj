"""
Builds the two characters for the Bhai Phota game as skinned glTF models:
  game/assets/bhaiya.glb  and  game/assets/honey.glb

Bodies are made with a Skin modifier over a joint skeleton (smooth, organic limbs),
faces/hair/hands/clothes are separate shaped meshes, everything is weighted to one
armature so the game can pose it (walk cycle + IK arms/legs).

Usage:
  blender --background --python build_characters.py -- [--render]

Blender coords: X = character's left, -Y = front, Z = up (glTF/three.js: front = +Z).
"""
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix
from mathutils.kdtree import KDTree

try:
    ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
except NameError:
    ROOT = r"D:\Bhai_Dooj"
OUT = os.path.join(ROOT, "game", "assets")
RENDER_DIR = os.path.join(ROOT, "renders")
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
DO_RENDER = "--render" in argv

bpy.ops.wm.read_factory_settings(use_empty=True)
SCENE = bpy.context.scene


# ------------------------------------------------------------------ helpers
def srgb(h):
    h = h.lstrip("#")
    f = lambda c: (lambda v: v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4)(int(c, 16) / 255)
    return (f(h[0:2]), f(h[2:4]), f(h[4:6]), 1.0)


MATS = {}
def mat(name, hexcol, rough=0.6, metal=0.0):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = srgb(hexcol)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    m.diffuse_color = srgb(hexcol)
    MATS[name] = m
    return m


def smoothstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(1e-9, ab.dot(ab))))
    return (p - (a + ab * t)).length, t


class Char:
    """One bmesh that collects every piece of a character, with per-vertex bone weights."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.mats = []
        self.vw = []          # per vertex: dict(bone -> weight) or None (= weight by distance)
        self.vtag = []        # per vertex: "body" for the skin-modifier body (gets bone-heat weights)
        self.uvlist = []      # original UVs of the textured photo-scan faces
        self.uvref = self.bm.faces.layers.int.new("uvref")   # face -> index+1 into uvlist

    def mi(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def merge(self, tmp, m, bone=None, wfn=None, smooth=True, face_mat=None, tag=None):
        vmap = {}
        for v in tmp.verts:
            vmap[v] = self.bm.verts.new(v.co)
            self.vw.append(wfn(v.co) if wfn else ({bone: 1.0} if bone else None))
            self.vtag.append(tag)
        uv = tmp.loops.layers.uv.active
        for f in tmp.faces:
            mm = face_mat(f) if face_mat else m
            try:
                nf = self.bm.faces.new([vmap[v] for v in f.verts])
            except ValueError:          # duplicate face in scanned meshes
                continue
            nf.material_index = self.mi(mm)
            nf.smooth = smooth
            if uv is not None:          # keep the scan's texture coordinates
                self.uvlist.append([tuple(lp[uv].uv) for lp in f.loops])
                nf[self.uvref] = len(self.uvlist)
        tmp.free()


def ellipsoid(c, r, segs=(20, 14), rot=None):
    tmp = bmesh.new()
    bmesh.ops.create_uvsphere(tmp, u_segments=segs[0], v_segments=segs[1], radius=1.0)
    R = rot or Matrix.Identity(3)
    for v in tmp.verts:
        v.co = Vector(c) + R @ Vector((v.co.x * r[0], v.co.y * r[1], v.co.z * r[2]))
    return tmp


def tube(points, radius, sides=10, cap=True, side_vec=None):
    """Sweep a circle/ellipse along points. radius: float, (rw, rt) or callable(t)->either."""
    tmp = bmesh.new()
    pts = [Vector(p) for p in points]
    n = len(pts)
    rings = []
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        if side_vec is not None:
            b1 = Vector(side_vec) - t * Vector(side_vec).dot(t)
        else:
            up = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
            b1 = t.cross(up)
        b1.normalize()
        b2 = t.cross(b1).normalized()
        r = radius(i / (n - 1)) if callable(radius) else radius
        rw, rt = (r, r) if isinstance(r, (int, float)) else r
        rings.append([tmp.verts.new(p + b1 * math.cos(a) * rw + b2 * math.sin(a) * rt)
                      for a in (2 * math.pi * k / sides for k in range(sides))])
    for i in range(n - 1):
        for k in range(sides):
            k2 = (k + 1) % sides
            tmp.faces.new([rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]])
    if cap:
        tmp.faces.new(rings[0][::-1])
        tmp.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces[:])
    return tmp


def loft(sections, cap=True):
    """Quads between closed loops of equal length."""
    tmp = bmesh.new()
    rings = [[tmp.verts.new(Vector(p)) for p in s] for s in sections]
    m = len(rings[0])
    for i in range(len(rings) - 1):
        for k in range(m):
            k2 = (k + 1) % m
            tmp.faces.new([rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]])
    if cap:
        tmp.faces.new(rings[0][::-1])
        tmp.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces[:])
    return tmp


def fan(center, loop):
    tmp = bmesh.new()
    c = tmp.verts.new(Vector(center))
    vs = [tmp.verts.new(Vector(p)) for p in loop]
    for i in range(len(vs)):
        tmp.faces.new([c, vs[i], vs[(i + 1) % len(vs)]])
    return tmp


def rounded_box(c, size, bev, frame=None):
    tmp = bmesh.new()
    bmesh.ops.create_cube(tmp, size=1.0)
    for v in tmp.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    bmesh.ops.bevel(tmp, geom=list(tmp.verts) + list(tmp.edges), offset=bev, segments=3,
                    affect="EDGES", profile=0.5, clamp_overlap=True)
    F = frame or Matrix.Identity(3)
    for v in tmp.verts:
        v.co = Vector(c) + F @ v.co
    return tmp


# ------------------------------------------------------------------ skeleton
def skeleton(s):
    """Joint positions for a body. s = spec dict with height scale and widths."""
    k = s["k"]                       # vertical scale (1.0 = 1.72 m man)
    sw = s["shoulder"]               # half shoulder width
    hw = s["hip"]                    # half hip-joint spacing
    J = {
        "pelvis": (0, 0.01, 0.95 * k), "waist": (0, 0.0, 1.08 * k), "chest": (0, -0.005, 1.24 * k),
        "upchest": (0, 0.0, 1.355 * k), "neck0": (0, 0.012, 1.42 * k), "neck1": (0, 0.018, 1.50 * k),
    }
    arm_dir = Vector((math.cos(math.radians(50)), 0, -math.sin(math.radians(50))))
    for side, sx in (("L", 1), ("R", -1)):
        d = Vector((arm_dir.x * sx, 0, arm_dir.z))
        sh = Vector((sw * sx, 0.012, 1.365 * k))
        J["clav_" + side] = (0.66 * sw * sx, 0.012, 1.385 * k)
        J["shoulder_" + side] = tuple(sh)
        J["elbow_" + side] = tuple(sh + d * 0.28 * k)
        J["wrist_" + side] = tuple(sh + d * (0.28 + 0.245) * k)
        J["hip_" + side] = (hw * sx, 0.012, 0.90 * k)
        J["thigh_" + side] = (hw * sx * 1.02, 0.008, 0.72 * k)
        J["knee_" + side] = (hw * sx * 1.05, 0.0, 0.50 * k)
        J["calf_" + side] = (hw * sx * 1.05, 0.018, 0.33 * k)
        J["ankle_" + side] = (hw * sx * 1.05, 0.022, 0.085 * k)
    J = {n: Vector(p) for n, p in J.items()}
    edges = [("pelvis", "waist"), ("waist", "chest"), ("chest", "upchest"), ("upchest", "neck0"), ("neck0", "neck1")]
    for sd in "LR":
        edges += [("upchest", "clav_" + sd), ("clav_" + sd, "shoulder_" + sd), ("shoulder_" + sd, "elbow_" + sd),
                  ("elbow_" + sd, "wrist_" + sd), ("pelvis", "hip_" + sd), ("hip_" + sd, "thigh_" + sd),
                  ("thigh_" + sd, "knee_" + sd), ("knee_" + sd, "calf_" + sd), ("calf_" + sd, "ankle_" + sd)]
    return J, edges


def bones_of(J, k, head_top):
    B = {   # name: (head, tail, parent)
        "hips": (J["pelvis"], J["waist"], None),
        "spine": (J["waist"], J["chest"], "hips"),
        "chest": (J["chest"], J["neck0"], "spine"),
        "neck": (J["neck0"], J["neck1"], "chest"),
        "head": (J["neck1"], Vector((0, 0.0, head_top)), "neck"),
    }
    for sd, sx in (("L", 1), ("R", -1)):
        B["clavicle_" + sd] = (Vector((0.02 * sx, 0.012, 1.375 * k)), J["shoulder_" + sd], "chest")
        B["upperarm_" + sd] = (J["shoulder_" + sd], J["elbow_" + sd], "clavicle_" + sd)
        B["forearm_" + sd] = (J["elbow_" + sd], J["wrist_" + sd], "upperarm_" + sd)
        d = (J["wrist_" + sd] - J["elbow_" + sd]).normalized()
        B["hand_" + sd] = (J["wrist_" + sd], J["wrist_" + sd] + d * 0.17 * k, "forearm_" + sd)
        B["thigh_" + sd] = (J["hip_" + sd], J["knee_" + sd], "hips")
        B["shin_" + sd] = (J["knee_" + sd], J["ankle_" + sd], "thigh_" + sd)
        B["foot_" + sd] = (J["ankle_" + sd], J["ankle_" + sd] + Vector((0, -0.16 * k, -0.06 * k)), "shin_" + sd)
    return B


def skin_body(name, J, edges, radii):
    names = list(J.keys())
    idx = {n: i for i, n in enumerate(names)}
    me = bpy.data.meshes.new(name + "_skel")
    me.from_pydata([J[n] for n in names], [(idx[a], idx[b]) for a, b in edges], [])
    ob = bpy.data.objects.new(name + "_skel", me)
    SCENE.collection.objects.link(ob)
    ob.modifiers.new("Skin", "SKIN")
    sv = me.skin_vertices[0].data
    for n in names:
        sv[idx[n]].radius = radii[n]
    sv[idx["pelvis"]].use_root = True
    sub = ob.modifiers.new("Sub", "SUBSURF")
    sub.levels = 2
    dg = bpy.context.evaluated_depsgraph_get()
    body = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob)
    tmp = bmesh.new()
    tmp.from_mesh(body)
    bpy.data.meshes.remove(body)
    return tmp


# ------------------------------------------------------------------ heads
class Head:
    """Head shape around centre hc. Unit-sphere directions are mapped to a face-like shape."""

    def __init__(self, hc, W, D, H):
        self.hc, self.W, self.D, self.H = Vector(hc), W, D, H
        kd_pts = []
        for i in range(120):
            for j in range(120):
                th = math.pi * (0.05 + 0.9 * i / 119)        # polar from top
                ph = math.pi * (1.0 + j / 119)               # front half (y < 0)
                u = Vector((math.sin(th) * math.cos(ph), math.sin(th) * math.sin(ph), math.cos(th)))
                kd_pts.append(self.shape(u))
        self.kd = KDTree(len(kd_pts))
        for i, p in enumerate(kd_pts):
            self.kd.insert(Vector((p.x, 0, p.z)), i)
        self.kd.balance()
        self.kd_pts = kd_pts

    def shape(self, u, scale=1.0):
        x, y, z = u
        low = smoothstep(0.1, -0.9, z)
        xs = 1.0 - 0.36 * low ** 1.3 + 0.04 * math.exp(-((z + 0.15) / 0.2) ** 2)   # jaw taper, cheekbones
        if y < 0:
            y = y - 0.6 * smoothstep(-0.5, -1.0, z) * (-y)                          # chin forward
            y *= 1.0 - 0.06 * smoothstep(0.3, 0.9, z)
        else:
            y *= 1.0 + 0.1 * smoothstep(-0.3, 0.6, z)                              # rounder back of skull
        return self.hc + Vector((x * self.W * xs, y * self.D, z * self.H)) * scale

    def surf(self, x, z, out=0.0):
        """Point on the front of the face at local (x, z), pushed `out` metres forward."""
        _, i, _ = self.kd.find(Vector((self.hc.x + x, 0, self.hc.z + z)))
        p = self.kd_pts[i]
        return Vector((self.hc.x + x, p.y - out, self.hc.z + z))

    def mesh(self, segs=(48, 34)):
        tmp = bmesh.new()
        bmesh.ops.create_uvsphere(tmp, u_segments=segs[0], v_segments=segs[1], radius=1.0)
        for v in tmp.verts:
            v.co = self.shape(v.co.normalized())
        return tmp

    def shell(self, keep, extra, base=1.05, segs=(48, 34)):
        """Hair shell: kept directions get pushed out, the rest are tucked inside the head."""
        tmp = bmesh.new()
        bmesh.ops.create_uvsphere(tmp, u_segments=segs[0], v_segments=segs[1], radius=1.0)
        for v in tmp.verts:
            u = v.co.normalized()
            if keep(u):
                v.co = self.shape(u, base + extra(u))
            else:
                v.co = self.shape(u, 0.93)
        return tmp


def face(C, hd, spec, skin):
    """Eyes, lids, brows, nose, lips, ears for head hd."""
    W, H = hd.W, hd.H
    sclera, iris = mat("Sclera", "#f3efe6", 0.3), mat("Iris", spec["iris"], 0.3)
    pupil, shine = mat("Pupil", "#0b0706", 0.2), mat("EyeShine", "#ffffff", 0.1)
    lip = mat(spec["name"] + "_Lips", spec["lip"], 0.45)
    brow = mat(spec["name"] + "_Hair", spec["hair"], 0.5)
    er = spec["eye_r"]
    for sx in (1, -1):
        ex = 0.40 * W * sx
        front = hd.surf(ex, 0.0)
        ec = front + Vector((0, er * 0.55, 0))
        C.merge(ellipsoid(ec, (er, er, er), (16, 12)), sclera, "head")
        C.merge(ellipsoid(ec + Vector((0, -er * 0.88, 0)), (er * 0.52, er * 0.2, er * 0.52), (14, 8)), iris, "head")
        C.merge(ellipsoid(ec + Vector((0, -er * 0.99, 0)), (er * 0.24, er * 0.12, er * 0.24), (10, 6)), pupil, "head")
        C.merge(ellipsoid(ec + Vector((er * 0.22 * sx, -er * 1.07, er * 0.25)), (er * 0.1,) * 3, (6, 4)), shine, "head")
        # upper + lower eyelids: partial shells over the eyeball
        for upper in (True, False):
            tmp = bmesh.new()
            bmesh.ops.create_uvsphere(tmp, u_segments=18, v_segments=12, radius=er * 1.08)
            cut = 0.32 if upper else -0.55
            kill = [v for v in tmp.verts if (v.co.z < cut * er if upper else v.co.z > cut * er) or v.co.y > er * 0.45]
            bmesh.ops.delete(tmp, geom=kill, context="VERTS")
            for v in tmp.verts:
                v.co = v.co + ec
            C.merge(tmp, skin, "head")
        if spec.get("lashes"):
            pts = [ec + Vector((er * 1.05 * math.cos(a) * sx * -1, -er * 0.75 * math.sin(a) - er * 0.25, er * 0.42 + er * 0.25 * math.sin(a)))
                   for a in (math.pi * i / 8 for i in range(9))]
            C.merge(tube(pts, 0.0011, 5), pupil, "head")
        # eyebrow arc
        bpts = []
        for i in range(9):
            t = i / 8
            bx = ex + sx * (-0.55 + 1.15 * t) * er * 1.9
            bz = er * 2.1 + spec["brow_arch"] * math.sin(math.pi * min(1, t * 1.15)) - 0.002 * t
            bpts.append(hd.surf(bx, bz, -0.0015))
        bw = spec["brow_w"]
        C.merge(tube(bpts, lambda t: (bw * (1.0 - 0.45 * t), 0.0016), 6, side_vec=(0, 0, 1)), brow, "head")
    # nose
    tip = hd.surf(0, -0.36 * H, -0.024)
    root = hd.surf(0, 0.12 * H, 0.0)
    mid = (root + tip) / 2 + Vector((0, -0.006, 0))
    C.merge(tube([root, mid, tip + Vector((0, 0.004, 0.006))], lambda t: 0.0055 + 0.006 * t, 10), skin, "head")
    C.merge(ellipsoid(tip, (0.0115, 0.011, 0.011)), skin, "head")
    for sx in (1, -1):
        C.merge(ellipsoid(tip + Vector((0.0115 * sx, 0.009, -0.003)), (0.0085, 0.009, 0.0075)), skin, "head")
    # lips
    mz = -0.55 * H
    w = spec["mouth_w"]
    up = [hd.surf(x, mz + 0.0035 + 0.0022 * math.cos(x / w * math.pi / 2) + spec["smile"] * (x / w) ** 2, -0.003)
          for x in (w * (i / 8 * 2 - 1) for i in range(9))]
    lo = [hd.surf(x, mz - 0.0045 + spec["smile"] * (x / w) ** 2, -0.0025)
          for x in (w * 0.9 * (i / 8 * 2 - 1) for i in range(9))]
    C.merge(tube(up, lambda t: (0.0034 * (0.5 + 0.5 * math.sin(math.pi * t)), 0.0028), 8, side_vec=(0, 0, 1)), lip, "head")
    C.merge(tube(lo, lambda t: (0.0048 * (0.45 + 0.55 * math.sin(math.pi * t)), 0.0034), 8, side_vec=(0, 0, 1)), lip, "head")
    # ears
    for sx in (1, -1):
        ec = hd.hc + Vector((W * 0.97 * sx, 0.008, -0.03 * H))
        C.merge(ellipsoid(ec, (0.009, 0.021, 0.031), (14, 10), Matrix.Rotation(-0.25 * sx, 3, "Z")), skin, "head")


def hand(C, J, side, skin, k, nail=None):
    """Palm + four fingers + thumb in the A-pose hand frame, weighted to the hand bone."""
    wrist, elbow = J["wrist_" + side], J["elbow_" + side]
    a = (wrist - elbow).normalized()
    n0 = Vector((-1 if side == "L" else 1, 0, 0))
    n = (n0 - a * n0.dot(a)).normalized()           # palm normal, towards the body
    f0 = Vector((0, -1, 0))
    f = (f0 - a * f0.dot(a) - n * f0.dot(n)).normalized()   # towards the front (thumb side)
    F = Matrix((a, f, n)).transposed()               # columns: along, front, palm-normal
    P = lambda u, v, w: wrist + a * u * k + f * v * k + n * w * k
    bone = "hand_" + side
    C.merge(rounded_box(P(0.05, 0, 0.004), (0.092 * k, 0.074 * k, 0.034 * k), 0.014 * k, F), skin, bone)
    for i, (off, ln, r) in enumerate(((0.027, 0.072, 0.0088), (0.009, 0.08, 0.0092), (-0.009, 0.076, 0.0088), (-0.026, 0.06, 0.0078))):
        pts = []
        u, w = 0.09, 0.0
        for s in range(5):
            pts.append(P(u, off * (1 - 0.15 * s / 4), w))
            ang = (0.38 + 0.04 * i) * s              # relaxed, curled fingers (not flat paddles)
            u += ln / 4 * math.cos(ang)
            w += ln / 4 * math.sin(ang)
        C.merge(tube(pts, lambda t: r * k * (1 - 0.18 * t), 8), skin, bone)
    tpts = [P(0.02, 0.028, 0.008), P(0.042, 0.045, 0.02), P(0.06, 0.05, 0.034), P(0.072, 0.046, 0.046)]
    C.merge(tube(tpts, lambda t: 0.0105 * k * (1 - 0.2 * t), 8), skin, bone)


def shoe(C, J, side, upper, sole, k, flat=False):
    an = J["ankle_" + side]
    x0 = an.x
    secs = []
    profile = ([(0.05, 0.066, 0.075), (0.0, 0.088, 0.085), (-0.06, 0.098, 0.07), (-0.12, 0.1, 0.058), (-0.17, 0.08, 0.042), (-0.2, 0.045, 0.028)]
               if not flat else
               [(0.045, 0.06, 0.035), (0.0, 0.075, 0.035), (-0.06, 0.085, 0.03), (-0.12, 0.085, 0.026), (-0.165, 0.065, 0.022), (-0.19, 0.035, 0.016)])
    for yy, w, h in profile:
        loop = []
        for i in range(16):
            ang = 2 * math.pi * i / 16
            cx, sz = math.cos(ang), math.sin(ang)
            loop.append((x0 + w * k / 2 * math.copysign(abs(cx) ** 0.6, cx), an.y + yy * k,
                         h * k / 2 + h * k / 2 * math.copysign(abs(sz) ** 0.6, sz)))
        secs.append(loop)
    C.merge(loft(secs), upper, "foot_" + side,
            face_mat=lambda fc: sole if fc.calc_center_median().z < 0.014 * k else upper)


def weight_by_distance(co, B, names):
    best = []
    for nm in names:
        h, t, _ = B[nm]
        d, _ = seg_dist(co, h, t)
        best.append((d, nm))
    best.sort()
    (d1, b1), (d2, b2) = best[0], best[1]
    if d2 < d1 * 1.35 + 0.012:
        w1, w2 = 1 / max(d1, 1e-4) ** 4, 1 / max(d2, 1e-4) ** 4
        s = w1 + w2
        return {b1: w1 / s, b2: w2 / s}
    return {b1: 1.0}


# ------------------------------------------------------------------ photo-scan busts
def load_bust(spec):
    """Import a photo-scan bust, decimate it, and place it on the body (Blender coords)."""
    b = spec["bust"]
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=b["path"])
    new = [o for o in bpy.data.objects if o not in before]
    H = next(o for o in new if o.type == "MESH")
    s, z0, yc = b["scale"], b["z0"], b["yc"]
    H.data.transform(Matrix.Translation((0, -yc * s, z0)) @ Matrix.Scale(s, 4) @ H.matrix_world)
    H.parent = None
    H.matrix_world = Matrix.Identity(4)
    # low-poly copy: weld the UV-split vertices so decimation can work, then decimate
    bm = bmesh.new()
    bm.from_mesh(H.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0002)
    me_low = bpy.data.meshes.new(spec["name"] + "_ScanWeld")
    bm.to_mesh(me_low)
    bm.free()
    L = bpy.data.objects.new(spec["name"] + "_ScanLow", me_low)
    SCENE.collection.objects.link(L)
    dec = L.modifiers.new("Dec", "DECIMATE")
    dec.ratio = min(1.0, b["faces"] / max(1, len(me_low.polygons)))
    dg = bpy.context.evaluated_depsgraph_get()
    me_dec = bpy.data.meshes.new_from_object(L.evaluated_get(dg))
    L.modifiers.clear()
    L.data = me_dec
    bpy.data.meshes.remove(me_low)
    # fresh UVs for the low-poly copy
    for o in SCENE.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = L
    L.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.002)
    bpy.ops.object.mode_set(mode="OBJECT")
    # bake the scan's colours onto it
    res = b.get("tex", 1024)
    img = bpy.data.images.new(spec["name"] + "_ScanColor", res, res)
    m = bpy.data.materials.new(spec["name"] + "_Scan")
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.62
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    nt.nodes.active = tex
    L.data.materials.clear()
    L.data.materials.append(m)
    SCENE.render.engine = "CYCLES"
    SCENE.cycles.samples = 2
    H.select_set(True)
    L.select_set(True)
    bpy.context.view_layer.objects.active = L
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"}, use_selected_to_active=True,
                        cage_extrusion=0.012, max_ray_distance=0.04, margin=6)
    tex_dir = os.path.join(OUT, "tex")
    os.makedirs(tex_dir, exist_ok=True)
    img.filepath_raw = os.path.join(tex_dir, spec["name"].lower() + "_scan.png")
    img.file_format = "PNG"
    img.save()
    tmp = bmesh.new()
    tmp.from_mesh(L.data)
    for o in new + [L]:
        bpy.data.objects.remove(o)
    print("BUST", spec["name"], len(tmp.verts), "verts", len(tmp.faces), "faces (baked", res, "px)")
    return tmp, m


def sample_color(tmp, material, pred):
    """Average texture colour of the scan faces whose centre passes pred (returns sRGB hex)."""
    img = None
    for n in material.node_tree.nodes:
        if n.type == "TEX_IMAGE" and n.image:
            img = n.image
    if img is None:
        return None
    w, h = img.size
    px = img.pixels[:]
    uv = tmp.loops.layers.uv.active
    acc, n = [0.0, 0.0, 0.0], 0
    for f in tmp.faces:
        if not pred(f.calc_center_median()):
            continue
        for lp in f.loops:
            u, v = lp[uv].uv
            i = (int((v % 1) * (h - 1)) * w + int((u % 1) * (w - 1))) * 4
            acc[0] += px[i]; acc[1] += px[i + 1]; acc[2] += px[i + 2]
            n += 1
    if not n:
        return None
    return "#%02x%02x%02x" % tuple(int(max(0, min(1, a / n)) * 255) for a in acc)


# ------------------------------------------------------------------ characters
def build(spec):
    name, k = spec["name"], spec["k"]
    C = Char(name)
    J, edges = skeleton(spec)
    hc = Vector((0, 0.004, spec["head_z"]))
    hd = Head(hc, spec["W"], spec["D"], spec["H"])
    head_top = hc.z + spec["H"] + 0.03
    if spec.get("bust"):
        return build_with_bust(spec, C, J, edges, hd, head_top)
    B = bones_of(J, k, head_top)
    body_bones = [b for b in B if not b.startswith("hand") and not b.startswith("foot") and b != "head"]
    skin = mat(name + "_Skin", spec["skin"], 0.55)
    R = spec["radii"](J)
    body = skin_body(name, J, edges, R)
    regions = spec["regions"]
    def body_mat(fc):
        c = fc.calc_center_median()
        best, bn, bt = 9, None, 0
        for nm in body_bones:
            d, t = seg_dist(c, B[nm][0], B[nm][1])
            if d < best:
                best, bn, bt = d, nm, t
        return regions(bn, bt, c)
    C.merge(body, skin, wfn=lambda co: weight_by_distance(co, B, body_bones), face_mat=body_mat)
    C.merge(hd.mesh(), skin, "head",
            face_mat=(lambda fc: spec["head_region"](fc.calc_center_median() - hc, hd)) if spec.get("head_region") else None)
    face(C, hd, spec, skin)
    for sd in "LR":
        hand(C, J, sd, skin, k)
    spec["extras"](C, J, B, hd, skin, k)
    return C, B


def blend(z, lo, hi, below, above):
    t = smoothstep(lo, hi, z)
    if t <= 0:
        return {below: 1.0}
    if t >= 1:
        return {above: 1.0}
    return {below: 1 - t, above: t}


def build_with_bust(spec, C, J, edges, hd, head_top):
    """Photo-scan bust on top + generated, rigged lower body / arms / hands."""
    name, k, b = spec["name"], spec["k"], spec["bust"]
    bust, scan = load_bust(spec)
    skin_hex = sample_color(bust, scan, b["skin_probe"]) or spec["skin"]
    print("SKIN", name, skin_hex)
    skin = mat(name + "_Skin", skin_hex, 0.55)
    if b.get("shirt_probe"):
        shirt_hex = sample_color(bust, scan, b["shirt_probe"]) or "#19191d"
        lift = tuple(min(255, int(int(shirt_hex[i:i + 2], 16) * 1.2)) for i in (1, 3, 5))
        shirt_hex = "#%02x%02x%02x" % lift          # the scan reads a touch lighter on screen
        print("SHIRT", name, shirt_hex)
        mat("TShirt", shirt_hex, 0.62)              # same sheen as the scan
    if b.get("head_scale"):
        # shrink the head around the neck, blending through the neck so there is no crease
        lo, hi, f = b["head_scale"]
        ring = [v.co for v in bust.verts if lo < v.co.z < lo + 0.02 and abs(v.co.x) < 0.08]
        py = sum(p.y for p in ring) / max(1, len(ring))
        piv = Vector((0.0, py, lo))
        for v in bust.verts:
            t = smoothstep(lo, hi, v.co.z)
            if t > 0:
                v.co = piv + (v.co - piv) * (1 + (f - 1) * t)
    if b.get("keep_hair_below"):
        # below the neck keep only the hair (dark texels); the clothes there are generated instead
        zk, thr = b["keep_hair_below"]
        img = next(n.image for n in scan.node_tree.nodes if n.type == "TEX_IMAGE" and n.image)
        W, Hh = img.size
        px = img.pixels[:]
        uvl = bust.loops.layers.uv.active
        kill = []
        for f in bust.faces:
            cz = f.calc_center_median().z
            if cz >= zk:
                continue
            if cz < b.get("cut_below", 0):
                kill.append(f)
                continue
            c = f.calc_center_median()
            if abs(c.x) < 0.035 and c.y < 0.0:          # chest centre: no hair there, only the old top
                kill.append(f)
                continue
            u = sum(l[uvl].uv.x for l in f.loops) / len(f.loops)
            v = sum(l[uvl].uv.y for l in f.loops) / len(f.loops)
            i = (int((v % 1) * (Hh - 1)) * W + int((u % 1) * (W - 1))) * 4
            if 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2] > thr:
                kill.append(f)
        bmesh.ops.delete(bust, geom=kill, context="FACES")
        # drop small leftover islands below the neck (dark specks of the old print)
        seen, small = set(), []
        for f in bust.faces:
            if f in seen:
                continue
            comp, stack = [], [f]
            seen.add(f)
            while stack:
                g = stack.pop()
                comp.append(g)
                for e in g.edges:
                    for h in e.link_faces:
                        if h not in seen:
                            seen.add(h)
                            stack.append(h)
            if len(comp) < 60 and max(g.calc_center_median().z for g in comp) < zk + 0.01:
                small += comp
        bmesh.ops.delete(bust, geom=small, context="FACES")
        bmesh.ops.delete(bust, geom=[v for v in bust.verts if not v.link_faces], context="VERTS")
        print("HAIR-ONLY below neck:", len(kill), "faces removed,", len(small), "speck faces")
    if b.get("keep_neck"):
        # keep the head and a neck cylinder; everything else of the scan (shirt, shoulders) goes
        z_lo, z_hi, r = b["keep_neck"]
        band = [v.co for v in bust.verts if z_lo + 0.01 < v.co.z < z_lo + 0.03 and abs(v.co.x) < 0.06]
        ncy = (min(p.y for p in band) + max(p.y for p in band)) / 2 if band else 0.0
        b["neck_c"] = Vector((0.0, ncy))
        kill = [v for v in bust.verts
                if v.co.z < z_lo or (v.co.z < z_hi and Vector((v.co.x, v.co.y - ncy)).length > r)]
        bmesh.ops.delete(bust, geom=kill, context="VERTS")
        # remove small loose shards left around the neck cut
        seen, small = set(), []
        for f in bust.faces:
            if f in seen:
                continue
            comp, stack = [], [f]
            seen.add(f)
            while stack:
                g = stack.pop()
                comp.append(g)
                for e in g.edges:
                    for h in e.link_faces:
                        if h not in seen:
                            seen.add(h)
                            stack.append(h)
            if len(comp) < 200:
                small += comp
        bmesh.ops.delete(bust, geom=small, context="FACES")
        bmesh.ops.delete(bust, geom=[v for v in bust.verts if not v.link_faces], context="VERTS")
        # line the generated neck up with the scan's neck (his head sits forward of the spine)
        J["neck0"] = Vector((0.0, ncy + 0.012, J["neck0"].z))
        J["neck1"] = Vector((0.0, ncy, J["neck1"].z))
        print("NECK centre y", round(ncy, 3))
    seam = None
    if b.get("cut_z"):
        # clean horizontal cut, then free the arms; the generated torso is lofted from this edge
        bmesh.ops.bisect_plane(bust, geom=bust.verts[:] + bust.edges[:] + bust.faces[:], dist=0.0001,
                               plane_co=(0, 0, b["cut_z"]), plane_no=(0, 0, 1), clear_inner=True)
    if b.get("cut"):
        bmesh.ops.delete(bust, geom=[v for v in bust.verts if b["cut"](v.co)], context="VERTS")
    if b.get("cut_z"):
        # torso outline only (the old crossed arms are gone), used to loft the t-shirt below the cut
        seam = [v.co.copy() for v in bust.verts
                if abs(v.co.z - b["cut_z"]) < 0.002 and v.is_boundary and abs(v.co.x) < 0.2]
    if b.get("drop_bottom_cap"):
        zmin = min(v.co.z for v in bust.verts)
        caps = [f for f in bust.faces if f.calc_center_median().z < zmin + 0.006 and f.normal.z < -0.6]
        bmesh.ops.delete(bust, geom=caps, context="FACES")
    if b.get("fix_skeleton"):
        b["fix_skeleton"](J, bust)
    B = bones_of(J, k, head_top)
    body_edges = [e for e in edges if b["body_edge"](e)]
    body_bones = [bn for bn in B if not bn.startswith("hand") and not bn.startswith("foot")
                  and bn != "head" and b["body_bone"](bn)]
    R = spec["radii"](J)
    used = {n for e in body_edges for n in e}
    Jb = {n: p for n, p in J.items() if n in used}
    body = skin_body(name, Jb, body_edges, {n: R[n] for n in Jb})
    # split the body exactly along hem / sleeve lines so cloth edges come out straight
    for co, no in b.get("cuts", lambda J: [])(J):
        bmesh.ops.bisect_plane(body, geom=body.verts[:] + body.edges[:] + body.faces[:], dist=0.0001,
                               plane_co=co, plane_no=no)
    regions = spec["regions"]

    def body_mat(fc):
        c = fc.calc_center_median()
        best, bn, bt = 9, None, 0
        for nm in body_bones:
            d, t = seg_dist(c, B[nm][0], B[nm][1])
            if d < best:
                best, bn, bt = d, nm, t
        return regions(bn, bt, c)
    C.merge(body, skin, face_mat=body_mat, tag="body")   # soft body: bone-heat weights in finish()
    C.merge(bust, scan, wfn=b["weights"])
    if seam and b.get("loft"):
        C.merge(seam_loft(seam, b["cut_z"], b["loft"]), MATS["TShirt"])
    if b.get("keep_neck"):
        # ribbed t-shirt collar around the kept neck (hides the join)
        z_lo, _, r = b["keep_neck"]
        nc = b["neck_c"]
        rn = R["neck0"][0] + 0.008
        ring = [Vector((nc.x + rn * math.cos(a), nc.y + 0.008 + rn * 0.95 * math.sin(a), z_lo + 0.006))
                for a in (2 * math.pi * i / 40 for i in range(41))]
        C.merge(tube(ring, (0.012, 0.008), 8, cap=False, side_vec=(0, 0, 1)), MATS["TShirt"], "chest")
    spec["bust_extras"](C, J, B, skin, k)
    return C, B


def seam_loft(seam, z_cut, rings, n=48, cy=0.005):
    """Torso surface that starts exactly on the scan's cut edge and blends into ellipses below."""
    bins = [None] * n
    for p in seam:
        a = math.atan2(p.y - cy, p.x) % (2 * math.pi)
        i = int(a / (2 * math.pi) * n) % n
        r = Vector((p.x, p.y - cy)).length
        if bins[i] is None or r > bins[i]:
            bins[i] = r
    def ell(a, rx, ry):
        return 1.0 / math.sqrt((math.cos(a) / rx) ** 2 + (math.sin(a) / ry) ** 2)
    rx0, ry0 = rings[0][1], rings[0][2]
    for i in range(n):              # fill gaps (where the arms were cut away)
        if bins[i] is None:
            bins[i] = ell(2 * math.pi * (i + 0.5) / n, rx0, ry0)
    sm = [(bins[i - 1] + 2 * bins[i] + bins[(i + 1) % n]) / 4 for i in range(n)]
    secs = []
    for z, rx, ry in [(z_cut + 0.003, None, None)] + list(rings):
        t = smoothstep(z_cut, rings[1][0], z) if rx else 0.0
        loop = []
        for i in range(n):
            a = 2 * math.pi * (i + 0.5) / n
            r0 = sm[i] * 0.995
            r = r0 if rx is None else r0 + (ell(a, rx, ry) - r0) * t
            loop.append((r * math.cos(a), cy + r * math.sin(a), z))
        secs.append(loop)
    return loft(secs, cap=False)


def finish(C, B, out_path):
    name = C.name
    bm = C.bm
    bm.verts.index_update()
    # floral-friendly cylindrical UVs
    uvl = bm.loops.layers.uv.new("UVMap")
    bm.normal_update()
    for f in bm.faces:
        ref = f[C.uvref]
        kept = C.uvlist[ref - 1] if ref else None
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))       # tri-planar projection: no stretched prints
        for i, lp in enumerate(f.loops):
            if kept:
                lp[uvl].uv = kept[i]
            else:
                co = lp.vert.co
                u, v = ((co.y, co.z), (co.x, co.z), (co.x, co.y))[ax]
                lp[uvl].uv = (u * 3.2, v * 3.2)
    me = bpy.data.meshes.new(name + "_Mesh")
    bm.to_mesh(me)
    bm.free()
    for m in C.mats:
        me.materials.append(m)
    ob = bpy.data.objects.new(name + "_Mesh", me)
    SCENE.collection.objects.link(ob)
    # armature
    arm = bpy.data.armatures.new(name + "_Rig")
    rig = bpy.data.objects.new(name, arm)
    SCENE.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for bn, (h, t, _) in B.items():
        eb = arm.edit_bones.new(bn)
        eb.head, eb.tail = h, t
    for bn, (_, _, par) in B.items():
        if par:
            eb = arm.edit_bones[bn]
            eb.parent = arm.edit_bones[par]
    bpy.ops.object.mode_set(mode="OBJECT")
    # weights: Blender's automatic (bone heat) weights, computed on the skin-modifier body alone
    # (one clean closed surface), copied to the other soft parts by nearest body vertex;
    # the rigid parts (scan, hands, shoes) keep their explicit weights
    groups = {bn: ob.vertex_groups.new(name=bn) for bn in B}
    body_idx = [i for i, t in enumerate(C.vtag) if t == "body"]
    bset = set(body_idx)
    bmb = bmesh.new()
    bmb.from_mesh(me)
    orig = bmb.verts.layers.int.new("orig")
    for v in bmb.verts:
        v[orig] = v.index
    bmesh.ops.delete(bmb, geom=[v for v in bmb.verts if v.index not in bset], context="VERTS")
    me_b = bpy.data.meshes.new(name + "_HeatBody")
    bmb.to_mesh(me_b)
    origs = [v[orig] for v in bmb.verts]
    bmb.free()
    ob_b = bpy.data.objects.new(name + "_HeatBody", me_b)
    SCENE.collection.objects.link(ob_b)
    for o in SCENE.objects:
        o.select_set(False)
    ob_b.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    names = {g.index: g.name for g in ob_b.vertex_groups}
    heat = {}
    for v in me_b.vertices:
        w = {names[g.group]: g.weight for g in v.groups if g.weight > 1e-4}
        if w:
            s = sum(w.values())
            heat[origs[v.index]] = {k2: x / s for k2, x in w.items()}
    bpy.data.objects.remove(ob_b)
    body_bones = [b for b in B if not b.startswith(("hand", "foot")) and b != "head"]
    kd = KDTree(len(body_idx))
    for i in body_idx:
        kd.insert(me.vertices[i].co, i)
    kd.balance()
    n_heat = n_near = n_fall = 0
    for v in me.vertices:
        w = C.vw[v.index]
        if not w:
            if v.index in heat:
                w = heat[v.index]; n_heat += 1
            else:
                _, j, _ = kd.find(v.co)
                w = heat.get(j); n_near += 1
                if not w:
                    w = weight_by_distance(v.co, B, body_bones); n_fall += 1
        for bn, val in w.items():
            groups[bn].add([v.index], val, "REPLACE")
    print("WEIGHTS", name, "heat", n_heat, "nearest-body", n_near, "fallback", n_fall)
    ob.parent = rig
    mod = ob.modifiers.new("Armature", "ARMATURE")
    mod.object = rig
    for o in SCENE.objects:
        o.select_set(o in (ob, rig))
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(filepath=out_path, export_format="GLB", use_selection=True,
                              export_apply=False, export_animations=False)
    print("EXPORTED", out_path, len(me.vertices), "verts")
    return rig, ob


# ------------------------------------------------------------------ Bhaiya
def bhaiya_regions(bn, t, c):
    shirt, jeans = mat("TShirt", "#19191d", 0.85), mat("Jeans", "#2f3c5a", 0.8)
    skin = MATS["Bhaiya_Skin"]
    if bn.startswith("upperarm"):
        return shirt if t < 0.47 else skin
    if bn.startswith("forearm"):
        return skin
    if bn == "neck":       # skin only on the neck itself, not the shoulder slope
        return skin if (c.z > 1.408 and abs(c.x) < 0.07 and abs(c.y + 0.018) < 0.072) else shirt
    if bn.startswith("clavicle"):
        return shirt
    return jeans if c.z < 0.925 else shirt          # one straight t-shirt hem


def bhaiya_head_region(p, hd):
    """Short beard / stubble on the jaw and around the mouth."""
    stub = mat("Stubble", "#4a352c", 0.8)
    x, y, z = p
    if y < 0.02 and z < -0.42 * hd.H and not (abs(x) < 0.03 and -0.66 * hd.H < z < -0.44 * hd.H and y < -0.05):
        return stub
    if y < 0.03 and abs(x) > 0.6 * hd.W and -0.5 * hd.H < z < 0.05 * hd.H and y > -0.05:
        return stub                                             # sideburns into the jaw line
    return MATS["Bhaiya_Skin"]


def bhaiya_extras(C, J, B, hd, skin, k):
    hair = MATS["Bhaiya_Hair"]
    shirt, sole, white = MATS["TShirt"], mat("Sole", "#cfcfca", 0.7), mat("Sneaker", "#f3f3ef", 0.5)

    def keep(u):
        x, y, z = u
        if y < -0.3:
            return z > 0.43
        if y < 0.45:
            return z > 0.14 or (y < 0.08 and abs(x) > 0.85 and z > -0.25)    # sideburns
        return z > -0.4

    def extra(u):
        x, y, z = u
        quiff = 0.22 * smoothstep(0.45, 0.95, z) * smoothstep(0.5, -0.6, y)
        return quiff + 0.02 * smoothstep(0.2, 0.9, z) - 0.025 * smoothstep(0.4, 0.95, abs(x)) * (1 - smoothstep(0.5, 0.9, z))
    C.merge(hd.shell(keep, extra, 1.045), hair, "head")
    H, W = hd.H, hd.W
    # moustache + goatee
    mz = -0.55 * H
    mpts = [hd.surf(x, mz + 0.012 + 0.004 * math.cos(x / 0.026 * math.pi / 2), -0.0035) for x in (0.026 * (i / 8 * 2 - 1) for i in range(9))]
    C.merge(tube(mpts, lambda t: (0.0052 * (0.55 + 0.45 * math.sin(math.pi * t)), 0.0032), 8, side_vec=(0, 0, 1)), hair, "head")
    gpts = [hd.surf(0, z, -0.003) for z in (mz - 0.014, mz - 0.026, mz - 0.04, mz - 0.052)]
    C.merge(tube(gpts, lambda t: (0.013 * (1 - 0.3 * t), 0.0045), 8, side_vec=(1, 0, 0)), hair, "head")
    # aviator glasses
    frame, lens = mat("GlassFrame", "#0b0b0e", 0.3, 0.3), mat("Lens", "#2a2e3a", 0.08, 0.2)
    for sx in (1, -1):
        cx = 0.40 * W * sx
        loop = []
        for i in range(24):
            a = 2 * math.pi * i / 24
            ca, sa = math.cos(a), math.sin(a)
            lx = cx + 0.0245 * ca + (0.004 * sx * max(0, -sa))       # tear-drop: bottom drifts outwards
            lz = (0.019 if sa > 0 else 0.024) * sa - 0.002
            loop.append(hd.surf(lx, lz, 0.013 + 0.25 * (lx - cx) ** 2 * 10))
        C.merge(tube(loop + loop[:1], 0.0021, 6, cap=False), frame, "head")
        cen = sum(loop, Vector()) / len(loop)
        C.merge(fan(cen + Vector((0, -0.001, 0)), loop), lens, "head")
        tpts = [loop[0], hd.hc + Vector((W * 1.02 * sx, -0.05, 0.012)), hd.hc + Vector((W * 1.03 * sx, 0.0, 0.006)), hd.hc + Vector((W * 1.0 * sx, 0.03, -0.01))]
        C.merge(tube(tpts, 0.0017, 5), frame, "head")
    C.merge(tube([hd.surf(-0.012, 0.017, 0.016), hd.surf(0, 0.019, 0.019), hd.surf(0.012, 0.017, 0.016)], 0.0018, 5), frame, "head")
    C.merge(tube([hd.surf(-0.01, 0.004, 0.013), hd.surf(0, 0.007, 0.015), hd.surf(0.01, 0.004, 0.013)], 0.0016, 5), frame, "head")
    # t-shirt collar, sleeve hems, mustard logo
    n0 = J["neck0"]
    C.merge(tube([n0 + Vector((0.068 * math.cos(a), 0.06 * math.sin(a) - 0.006, -0.004 + 0.012 * math.sin(a))) for a in (2 * math.pi * i / 20 for i in range(21))], 0.006, 6, cap=False), shirt, "chest")
    for sd in "LR":
        sh, el = J["shoulder_" + sd], J["elbow_" + sd]
        c = sh + (el - sh) * 0.47
        d = (el - sh).normalized()
        b1 = d.cross(Vector((0, 1, 0))).normalized()
        b2 = d.cross(b1).normalized()
        C.merge(tube([c + (b1 * math.cos(a) + b2 * math.sin(a)) * 0.056 for a in (2 * math.pi * i / 18 for i in range(19))], 0.006, 6, cap=False),
                shirt, "upperarm_" + sd)
    C.merge(rounded_box(Vector((0.07, -0.118, 1.29 * k)), (0.026, 0.004, 0.012), 0.0015), mat("Logo", "#e0a43a", 0.5), "chest")
    for sd in "LR":
        shoe(C, J, sd, white, sole, k)


def bhaiya_radii(J):
    R = {"pelvis": (0.165, 0.118), "waist": (0.148, 0.105), "chest": (0.175, 0.112), "upchest": (0.16, 0.098),
         "neck0": (0.058, 0.058), "neck1": (0.052, 0.052)}
    for s in "LR":
        R.update({"clav_" + s: (0.068, 0.058), "shoulder_" + s: (0.056, 0.054), "elbow_" + s: (0.041, 0.041),
                  "wrist_" + s: (0.03, 0.026), "hip_" + s: (0.088, 0.088), "thigh_" + s: (0.078, 0.078),
                  "knee_" + s: (0.054, 0.054), "calf_" + s: (0.058, 0.058), "ankle_" + s: (0.036, 0.036)})
    return R


def bhaiya_bust_extras(C, J, B, skin, k):
    shirt, sole, white = MATS["TShirt"], mat("Sole", "#cfcfca", 0.7), mat("Sneaker", "#f3f3ef", 0.5)
    for sd in "LR":
        sh, el = J["shoulder_" + sd], J["elbow_" + sd]
        c = sh + (el - sh) * 0.47
        d = (el - sh).normalized()
        b1 = d.cross(Vector((0, 1, 0))).normalized()
        b2 = d.cross(b1).normalized()
        C.merge(tube([c + (b1 * math.cos(a) + b2 * math.sin(a)) * 0.056 for a in (2 * math.pi * i / 18 for i in range(19))],
                     0.006, 6, cap=False), shirt, "upperarm_" + sd)
        hand(C, J, sd, skin, k)
        shoe(C, J, sd, white, sole, k)
    C.merge(rounded_box(Vector((0.07, -0.142, 1.25)), (0.026, 0.004, 0.012), 0.0015), mat("Logo", "#e0a43a", 0.5), "chest")


def bhaiya_bust_radii(J):
    R = bhaiya_radii(J)
    # a relaxed t-shirt torso (the scan now only provides head + neck)
    R.update({"pelvis": (0.158, 0.118), "waist": (0.146, 0.108), "chest": (0.166, 0.115), "upchest": (0.156, 0.104),
              "neck0": (0.066, 0.064), "neck1": (0.066, 0.064)})
    for s in "LR":
        R.update({"shoulder_" + s: (0.056, 0.054), "elbow_" + s: (0.042, 0.042), "wrist_" + s: (0.031, 0.027)})
    return R


BHAIYA_BUST = dict(
    path=os.path.join(ROOT, "reference", "happy.glb"), faces=30000, scale=0.82, z0=0.913, yc=0.05,
    skin_probe=lambda c: 1.04 < c.z < 1.14 and c.y < -0.19 and abs(c.x) < 0.25,      # his crossed forearms
    shirt_probe=lambda c: 1.31 < c.z < 1.37 and c.y < -0.06 and abs(c.x) < 0.09,
    head_scale=(1.43, 1.50, 0.84),                                                    # his head was too big for the body
    keep_neck=(1.40, 1.43, 0.075),                   # keep head + neck; the whole t-shirt is one generated piece
    cuts=lambda J: [((0, 0, 0.925), (0, 0, 1))] + [
        (J["shoulder_" + s] + (J["elbow_" + s] - J["shoulder_" + s]) * 0.47, (J["elbow_" + s] - J["shoulder_" + s]).normalized())
        for s in "LR"],
    body_edge=lambda e: True, body_bone=lambda bn: True,
    weights=lambda co: blend(co.z, 1.42, 1.47, "chest", "head"))


def floral_mat():
    """Lavender floral print like Honey's smocked top (drawn with numpy, embedded in the GLB)."""
    if "Top" in MATS:
        return MATS["Top"]
    import numpy as np
    res = 512
    rgb = lambda h: np.array([int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)], np.float32)
    img = np.ones((res, res, 4), np.float32)
    img[..., :3] = rgb("#98a0d8")
    for y in range(0, res, 16):                      # faint smocking lines
        img[y:y + 2, :, :3] *= 0.88
    rng = np.random.default_rng(7)
    cols = [rgb(c) for c in ("#eab14b", "#f4f2f9", "#e58b3d", "#c8d5f4", "#eab14b", "#7d84c6")]
    yy, xx = np.mgrid[0:res, 0:res]
    def dot(cx, cy, r, col):
        x0, x1 = int(max(0, cx - r)), int(min(res, cx + r + 1))
        y0, y1 = int(max(0, cy - r)), int(min(res, cy + r + 1))
        if x0 < x1 and y0 < y1:
            sub = (xx[y0:y1, x0:x1] - cx) ** 2 + (yy[y0:y1, x0:x1] - cy) ** 2 < r * r
            img[y0:y1, x0:x1, :3][sub] = col
    for i in range(460):
        cx, cy = rng.uniform(0, res, 2)
        r = rng.uniform(4.0, 8.0)
        rot = rng.uniform(0, 6.28)
        for p in range(5):
            a = rot + p * 2 * math.pi / 5
            dot(cx + math.cos(a) * r * 0.8, cy + math.sin(a) * r * 0.8, r * 0.6, cols[i % len(cols)])
        dot(cx, cy, r * 0.35, rgb("#7a4a2a"))
    im = bpy.data.images.new("Honey_Floral", res, res)
    im.pixels.foreach_set(img.ravel())
    os.makedirs(os.path.join(OUT, "tex"), exist_ok=True)
    im.filepath_raw = os.path.join(OUT, "tex", "honey_floral.png")
    im.file_format = "PNG"
    im.save()
    m = mat("Top", "#98a0d8", 0.85)
    nt = m.node_tree
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = im
    nt.links.new(tex.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])
    return m


def honey_top_regions(bn, t, c):
    top, skin, jeans = floral_mat(), MATS["Honey_Skin"], mat("JeansLight", "#5b78a8", 0.8)
    if bn.startswith("upperarm"):
        return top if t < 0.4 else skin
    if bn.startswith("forearm") or bn == "neck":
        return skin
    if bn == "chest" or bn.startswith("clavicle"):
        return skin if (c.z > 1.255 and abs(c.x) < 0.095) else top          # square neckline
    return jeans if c.z < 0.985 else top


def honey_top_extras(C, J, B, skin, k):
    top, pink = floral_mat(), mat("Pink", "#e6aebb", 0.6)
    for sd in "LR":
        sh, el = J["shoulder_" + sd], J["elbow_" + sd]
        d = (el - sh).normalized()
        R = Matrix((d.cross(Vector((0, 1, 0))).normalized(), Vector((0, 1, 0)), d)).transposed()
        C.merge(ellipsoid(sh + d * 0.055, (0.068, 0.066, 0.078), (18, 12), R), top, "upperarm_" + sd)   # puff sleeve
        hand(C, J, sd, skin, k)
        shoe(C, J, sd, pink, mat("SoleTan", "#c99c84", 0.7), k, flat=True)
    # ruffle hem at the waist
    secs = []
    for z, rx, ry, amp in ((1.005, 0.127, 0.097, 0.0), (0.978, 0.148, 0.118, 0.01), (0.952, 0.166, 0.136, 0.018)):
        loop = []
        for j in range(48):
            a = 2 * math.pi * j / 48
            w = amp * math.sin(a * 12)
            loop.append(((rx + w) * math.cos(a), 0.012 + (ry + w) * math.sin(a), z))
        secs.append(loop)
    C.merge(loft(secs, cap=False), top)
    # pink sling bag: strap across the chest, bag at the right hip
    strap = [Vector(p) for p in ((0.112, 0.0, 1.33 * k + 0.02), (0.085, -0.098, 1.26 * k), (0.02, -0.112, 1.17 * k),
                                 (-0.06, -0.116, 1.08 * k), (-0.135, -0.098, 1.0 * k), (-0.17, -0.06, 0.96 * k))]
    C.merge(tube(strap, (0.011, 0.0025), 6, side_vec=(0, -1, 0)), pink)
    C.merge(rounded_box(Vector((-0.195, -0.04, 0.92 * k)), (0.05, 0.17, 0.13), 0.015), pink, "hips")


def honey_scan_weights(co):
    return blend(co.z, 1.34, 1.40, "chest", "head")


HONEY_BUST = dict(
    path=os.path.join(ROOT, "reference", "honey.glb"), faces=30000, scale=0.58, z0=1.031, yc=-0.01,
    skin_probe=lambda c: 1.43 < c.z < 1.47 and 0.025 < abs(c.x) < 0.055 and c.y < -0.07,   # her cheeks
    keep_hair_below=(1.345, 0.24), cut_below=1.08,     # below the neck keep only her (dark) hair
    cuts=lambda J: [((0, 0, 0.985), (0, 0, 1))],
    body_edge=lambda e: True, body_bone=lambda bn: True,
    weights=honey_scan_weights)


BHAIYA = dict(name="Bhaiya", k=1.0, shoulder=0.195, hip=0.09, head_z=1.585, W=0.08, D=0.103, H=0.122,
              skin="#bf8466", hair="#131011", lip="#94584d", iris="#2e1c12", eye_r=0.0125,
              brow_w=0.0042, brow_arch=0.004, mouth_w=0.024, smile=0.0, lashes=False,
              radii=bhaiya_radii, regions=bhaiya_regions, head_region=bhaiya_head_region, extras=bhaiya_extras)


# ------------------------------------------------------------------ Honey
def honey_regions(bn, t, c):
    dress, skin = mat("Dress", "#9d9bd6", 0.85), MATS["Honey_Skin"]
    k = HONEY["k"]
    if bn in ("hips", "spine"):
        return dress
    if bn == "chest":
        return skin if (c.z > 1.33 * k and abs(c.x) < 0.09) else dress
    if bn == "neck":
        return skin
    if bn.startswith("clavicle"):
        return skin if (c.z > 1.36 * k and abs(c.x) < 0.1) else dress
    if bn.startswith("upperarm"):
        return dress if t < 0.18 else skin
    if bn.startswith("thigh") and t < 0.45:
        return dress
    return skin


def honey_extras(C, J, B, hd, skin, k):
    hair = MATS["Honey_Hair"]
    dress, pink = MATS["Dress"], mat("Pink", "#e6aebb", 0.6)
    H, W, hc = hd.H, hd.W, hd.hc

    def keep(u):
        x, y, z = u
        if y < -0.3:
            return z > 0.46
        return z > -0.25 if y < 0.4 else z > -0.75

    def extra(u):
        x, y, z = u
        part = 0.03 * (1 - smoothstep(0.0, 0.1, abs(x))) * smoothstep(0.3, 0.6, z) * smoothstep(0.5, -0.2, y)
        return 0.02 * smoothstep(0.0, 0.8, z) - part
    C.merge(hd.shell(keep, extra, 1.05), hair, "head")
    neck_top, chest_z = J["neck1"].z, J["upchest"].z

    def hw(co):
        t = smoothstep(chest_z - 0.02, neck_top + 0.02, co.z)
        return {"head": t, "chest": 1 - t} if 0 < t < 1 else ({"head": 1.0} if t >= 1 else {"chest": 1.0})
    # long straight hair down the back, in a few overlapping layers
    for i, (ox, ln, wd) in enumerate(((0.0, 0.48, 0.075), (-0.06, 0.45, 0.07), (0.06, 0.45, 0.07), (-0.11, 0.4, 0.055), (0.11, 0.4, 0.055))):
        pts = []
        for s in range(9):
            t = s / 8
            z = hc.z + 0.07 - t * ln
            back = 0.105 + 0.02 * math.sin(t * math.pi * 0.8) + (0.04 * smoothstep(0.35, 0.7, t))
            pts.append(Vector((hc.x + ox * (0.8 + 0.5 * t), hc.y + back * (1.0 if t < 0.35 else 1.12), z)))
        C.merge(tube(pts, lambda t: (wd * (0.85 + 0.25 * t), 0.012 * (1 - 0.4 * t)), 8, side_vec=(1, 0, 0)), hair, wfn=hw)
    # side curtains framing the face and falling in front of the shoulders
    for sx in (1, -1):
        pts = []
        for s in range(9):
            t = s / 8
            pts.append(Vector((hc.x + sx * (W * 0.98 + 0.03 * smoothstep(0.2, 0.6, t) + 0.04 * t),
                               hc.y - 0.02 - 0.04 * smoothstep(0.3, 0.8, t),
                               hc.z + 0.05 - t * 0.36)))
        C.merge(tube(pts, lambda t: (0.032 * (0.8 + 0.4 * t), 0.012), 8, side_vec=(0, 1, 0)), hair, wfn=hw)
        pts = [Vector((hc.x + sx * W * 0.95, hc.y + 0.04, hc.z + 0.06 - t * 0.4)) + Vector((sx * 0.03 * t, 0.04 * t, 0)) for t in (i / 8 for i in range(9))]
        C.merge(tube(pts, lambda t: (0.045, 0.014), 8, side_vec=(0, 1, 0)), hair, wfn=hw)
    # flared skirt (floral), gathered at the waist
    secs = []
    for i, (z, rx, ry) in enumerate(((1.0, 0.152, 0.118), (0.9, 0.2, 0.16), (0.75, 0.25, 0.21), (0.6, 0.285, 0.245), (0.5, 0.3, 0.26))):
        loop = []
        for j in range(36):
            a = 2 * math.pi * j / 36
            wave = 1 + 0.035 * math.sin(a * 9) * (i / 4)
            loop.append((rx * wave * math.cos(a), 0.012 + ry * wave * math.sin(a), z * k))
        secs.append(loop)
    C.merge(loft(secs, cap=False), mat("Skirt", "#9d9bd6", 0.85), "hips")
    # puff sleeves
    for sd in "LR":
        sh, el = J["shoulder_" + sd], J["elbow_" + sd]
        d = (el - sh).normalized()
        R = Matrix((d.cross(Vector((0, 1, 0))).normalized(), Vector((0, 1, 0)), d)).transposed()
        C.merge(ellipsoid(sh + d * 0.06, (0.075, 0.072, 0.085), (18, 12), R), dress, "upperarm_" + sd)
    # sling bag strap across the chest + bag at the right hip
    strap = [Vector(p) for p in ((0.115, 0.0, 1.335 * k + 0.03), (0.085, -0.095, 1.27 * k), (0.02, -0.115, 1.17 * k),
                                 (-0.06, -0.12, 1.07 * k), (-0.14, -0.1, 0.97 * k), (-0.175, -0.06, 0.93 * k))]
    C.merge(tube(strap, (0.011, 0.0025), 6, side_vec=(0, -1, 0)), pink, wfn=lambda co: {"chest": 1.0} if co.z > 1.15 * k else {"hips": 1.0})
    C.merge(rounded_box(Vector((-0.2, -0.04, 0.9 * k)), (0.05, 0.17, 0.13), 0.015), pink, "hips")
    for sd in "LR":
        shoe(C, J, sd, pink, mat("SoleTan", "#c99c84", 0.7), k, flat=True)


def honey_radii(J):
    R = {"pelvis": (0.158, 0.118), "waist": (0.122, 0.094), "chest": (0.148, 0.106), "upchest": (0.138, 0.09),
         "neck0": (0.048, 0.048), "neck1": (0.044, 0.044)}
    for s in "LR":
        R.update({"clav_" + s: (0.055, 0.05), "shoulder_" + s: (0.046, 0.046), "elbow_" + s: (0.034, 0.034),
                  "wrist_" + s: (0.025, 0.022), "hip_" + s: (0.085, 0.085), "thigh_" + s: (0.072, 0.072),
                  "knee_" + s: (0.046, 0.046), "calf_" + s: (0.05, 0.05), "ankle_" + s: (0.031, 0.031)})
    return R


HONEY = dict(name="Honey", k=0.93, shoulder=0.172, hip=0.085, head_z=1.585 * 0.93 + 0.005, W=0.075, D=0.098, H=0.116,
             skin="#d29a78", hair="#1e130e", lip="#b35a5c", iris="#2a170e", eye_r=0.0128,
             brow_w=0.0028, brow_arch=0.006, mouth_w=0.022, smile=0.0035, lashes=True,
             radii=honey_radii, regions=honey_regions, head_region=None, extras=honey_extras)


# use the family's own photo-scan busts (reference/happy.glb, reference/honey.glb) when present
if os.path.exists(BHAIYA_BUST["path"]) and "--no-scan" not in argv:
    BHAIYA.update(bust=BHAIYA_BUST, radii=bhaiya_bust_radii, bust_extras=bhaiya_bust_extras,
                  head_z=1.555, H=0.104)
if os.path.exists(HONEY_BUST["path"]) and "--no-scan" not in argv:
    HONEY.update(bust=HONEY_BUST, regions=honey_top_regions, bust_extras=honey_top_extras,
                 head_z=1.483, H=0.11)

# ------------------------------------------------------------------ main
os.makedirs(OUT, exist_ok=True)
made = []
for spec, fn in ((BHAIYA, "char_bhaiya.glb"), (HONEY, "char_honey.glb")):
    mat(spec["name"] + "_Hair", spec["hair"], 0.45)
    C, B = build(spec)
    made.append(finish(C, B, os.path.join(OUT, fn)))

if DO_RENDER:
    rig_b, _ = made[0]
    rig_h, _ = made[1]
    rig_b.location.x = 0.45
    rig_h.location.x = -0.45
    w = bpy.data.worlds.new("W"); SCENE.world = w
    try:
        w.use_nodes = True
    except Exception:
        pass
    w.node_tree.nodes["Background"].inputs[0].default_value = srgb("#e9dcf2")
    w.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            SCENE.render.engine = eng
            break
        except TypeError:
            pass
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = 3.0
    sun.rotation_euler = Vector((0.4, 0.7, -0.6)).to_track_quat("-Z", "Y").to_euler()
    SCENE.collection.objects.link(sun)
    fill = bpy.data.objects.new("Fill", bpy.data.lights.new("Fill", "SUN"))
    fill.data.energy = 1.2
    fill.rotation_euler = Vector((-0.6, 0.5, -0.3)).to_track_quat("-Z", "Y").to_euler()
    SCENE.collection.objects.link(fill)
    def shot(name, loc, target, lens, res):
        cam = bpy.data.objects.new(name, bpy.data.cameras.new(name))
        cam.data.lens = lens
        SCENE.collection.objects.link(cam)
        cam.location = loc
        cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        SCENE.camera = cam
        SCENE.render.resolution_x, SCENE.render.resolution_y = res
        SCENE.render.filepath = os.path.join(RENDER_DIR, name + ".png")
        bpy.ops.render.render(write_still=True)
    SCENE.render.engine = "BLENDER_EEVEE"
    shot("chars_full", (0.6, -4.2, 1.1), (0, 0, 0.88), 50, (1100, 1000))
    shot("chars_faces", (0.0, -2.4, 1.5), (0, 0, 1.47), 70, (1200, 700))
