"""
House exterior builder for the Bhai Dooj / Bhai Phota game.

Builds a cute, low-poly version of the family home from the reference photos in
../reference/, saves it as a .blend, and optionally renders previews and exports a .glb.

Usage:
  blender --background --python build_house.py -- [--render] [--export] [--dusk]

Coordinates (metres): X runs along the street-facing front (left -> right as seen from
the street), Y goes from the front facade (y=0) back into the plot, Z is up.

Layout (from the photos):
  * corner plot: front faces the street (-Y), the lane runs along the right side (+X)
  * front = white wing A (main door, behind the dark main gate) + lavender block B
  * the lavender block, its balcony, crown and arched windows wrap round the corner onto
    the lane side until the white "straight part" (stair-room column) starts
  * lane side = white wall with stacked windows, clothes balcony, AC units, side door,
    white/pink fence with blue gate
  * left of the house: passage from the main gate (chips-mosaic floor, potted plants,
    scooter) leading back to the backyard (checkered tiles, steel swing, garden bed)
"""
import bpy, bmesh, math, os, sys, random
from mathutils import Matrix, Vector

try:
    ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
except NameError:
    ROOT = r"D:\Bhai_Dooj"
BLEND_OUT  = os.path.join(ROOT, "blender", "house_exterior.blend")
GLB_OUT    = os.path.join(ROOT, "game", "assets", "house_exterior.glb")
RENDER_DIR = os.path.join(ROOT, "renders")
RENDER_TAG = "v3"

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
DO_RENDER = "--render" in argv
DO_EXPORT = "--export" in argv
DO_DUSK   = "--dusk" in argv

# ------------------------------------------------------------------ dimensions
PLINTH = 0.45
GF_TOP = 3.40            # top of ground-floor walls
SLAB   = 0.18
FF0    = GF_TOP + SLAB   # first-floor level
FF_TOP = FF0 + 3.05
ROOF   = FF_TOP + SLAB   # roof level
D_HOUSE = 12.0           # depth of the house, front facade -> back facade

xA0, xA1 = -4.2, 0.0                  # A: white wing (left of the front, main door)
xB0, xB1 = 0.0, 6.0                   # B: lavender corner block; x=xB1 is the lane-side facade
X_SIDE = xB1
TOWER = (3.4, 6.0, 2.8, 6.6)          # stair room on the roof ("straight part"): x0, x1, y0, y1
TOWER_TOP = ROOF + 2.9
LAV_D = TOWER[2]                      # lavender + balcony wrap onto the side until the straight part
BAL_P = 1.35                          # balcony projection (front and side)
CROWN_P = 1.5                         # crown overhang (front and side)
LOGGIA = (7.4, 10.6)                  # side clothes-balcony span along Y (first floor)

Y_WALL = -3.30                        # front boundary wall (outer face)
X_SIDE_WALL = 8.6                     # lane-side fence (inner face)
X_LEFT_WALL = -9.0                    # left boundary wall (inner face)
Y_BACK = 17.0                         # back boundary wall (inner face)
GATE_X0, GATE_X1 = -4.45, -1.95       # main gate opening in the front wall
CHECKER_Y = 4.0                       # checkered backyard tiles start here on the left side

# ------------------------------------------------------------------ reset scene
bpy.ops.wm.read_factory_settings(use_empty=True)
SCENE = bpy.context.scene


def new_coll(name):
    c = bpy.data.collections.new(name)
    SCENE.collection.children.link(c)
    return c


C_HOUSE = new_coll("House")
C_SITE  = new_coll("Site")
C_DECOR = new_coll("Decor")
C_RIG   = new_coll("CamerasLights")

# ------------------------------------------------------------------ materials
def srgb(h):
    h = h.lstrip("#")
    def lin(c):
        c = int(c, 16) / 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (lin(h[0:2]), lin(h[2:4]), lin(h[4:6]), 1.0)


def make_mat(name, hexcol, rough=0.75, metal=0.0, emit=0.0):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = srgb(hexcol)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit > 0:
        bsdf.inputs["Emission Color"].default_value = srgb(hexcol)
        bsdf.inputs["Emission Strength"].default_value = emit
    m.diffuse_color = srgb(hexcol)
    return m


M = {k: make_mat(*v) for k, v in {
    "lav":        ("Lavender", "#C8B2DD"),
    "white":      ("WhitePaint", "#F4F1EC"),
    "salmon":     ("Salmon", "#EE9470"),
    "plinth":     ("Plinth", "#D98262"),
    "peach":      ("PeachWall", "#ECB59B"),
    "peach_top":  ("PeachCap", "#F4CDB9"),
    "steel":      ("Steel", "#D9DDE2", 0.28, 0.85),
    "grille":     ("Grille", "#2D2B35", 0.5, 0.3),
    "glass":      ("Glass", "#36435A", 0.08, 0.1),
    "wood":       ("Wood", "#9A6440", 0.6),
    "wood_d":     ("WoodDark", "#6E4429", 0.6),
    "doorway":    ("Doorway", "#2b211b", 0.9),
    "brass":      ("Brass", "#E2B44B", 0.3, 0.9),
    "gate":       ("GateDark", "#4E3428", 0.45, 0.4),
    "gate_light": ("GateLight", "#F1E6D3", 0.6),
    "blue":       ("GateBlue", "#3F86C8", 0.4, 0.3),
    "pink":       ("FencePink", "#F2A7B6"),
    "concrete":   ("Concrete", "#ABA79F", 0.95),
    "step":       ("Step", "#D8D1C8", 0.6),
    "marble":     ("Marble", "#F4F2EE", 0.25),
    "mosaic":     ("ChipsMosaic", "#E9E6E0", 0.45),
    "grout":      ("Grout", "#BEB8AE", 0.8),
    "chip":       ("ChipBlack", "#34343C", 0.4),
    "chip_g":     ("ChipGrey", "#8E8C8A", 0.4),
    "check_w":    ("CheckerLight", "#DAD6CF", 0.6),
    "check_r":    ("CheckerMaroon", "#8E3A3A", 0.6),
    "brick":      ("Brick", "#A9583F", 0.9),
    "mortar":     ("Mortar", "#CDB39A", 0.9),
    "soil":       ("Soil", "#6B4A33", 1.0),
    "border":     ("BedBorder", "#D9D5CF", 0.8),
    "ground":     ("Ground", "#CFC1A9", 1.0),
    "road":       ("Road", "#B8AA94", 1.0),
    "leaf":       ("Leaf", "#73B85E"),
    "leaf_d":     ("LeafDark", "#4F9549"),
    "leaf_y":     ("LeafYellowGreen", "#A4C95A"),
    "trunk":      ("Trunk", "#8C6446"),
    "terracotta": ("Terracotta", "#C8693F"),
    "pot_w":      ("PotWhite", "#EDEBE6", 0.5),
    "ac":         ("ACUnit", "#ECECE8", 0.4),
    "cover":      ("ScooterCover", "#5E86B8", 0.7),
    "tyre":       ("Tyre", "#2A2A2E", 0.8),
    "canopy":     ("SwingCanopy", "#3F78B5", 0.7),
    "cushion":    ("SwingCushion", "#C9D3DC", 0.9),
    "swing_back": ("SwingBack", "#D9C49A", 0.8),
    "chair":      ("PlasticChair", "#4A4D52", 0.5),
    "bucket_w":   ("BucketWhite", "#F2F2F0", 0.4),
    "bucket_r":   ("BucketRed", "#C23B32", 0.4),
    "meter":      ("MeterBox", "#C9B98A", 0.6),
    "pipe":       ("PVCPipe", "#F4F4F2", 0.4),
    "hose":       ("Hose", "#C8742E", 0.6),
    "college":    ("CollegeTan", "#E6C894"),
    "sign":       ("SignBlue", "#1F4FA0", 0.5),
    "sign_text":  ("SignText", "#FFFFFF", 0.5),
    "marigold":   ("Marigold", "#FF9F1C", 0.6),
    "marigold_y": ("MarigoldYellow", "#FFD23A", 0.6),
    "fairy_w":    ("FairyWarm", "#FFE2A0", 0.5, 0.0, 6.0),
    "fairy_p":    ("FairyPink", "#FF8FBE", 0.5, 0.0, 6.0),
    "fairy_b":    ("FairyBlue", "#8ED8FF", 0.5, 0.0, 6.0),
    "flame":      ("Flame", "#FFB347", 0.5, 0.0, 14.0),
    "clay":       ("Clay", "#B5532E"),
    "alpona":     ("Alpona", "#FCF9F2", 0.9),
    "sindoor":    ("Sindoor", "#D7263D"),
    "plaque":     ("Plaque", "#FFFDF7", 0.3),
    "cloth1":     ("Cloth1", "#FF7A8A"),
    "cloth2":     ("Cloth2", "#5AB3E6"),
    "cloth3":     ("Cloth3", "#FFD35A"),
    "cloth4":     ("Cloth4", "#8BD17C"),
    "nb1":        ("NeighbourYellow", "#F2E2B3"),
    "nb2":        ("NeighbourGrey", "#E3DDD3"),
    "nb3":        ("NeighbourMint", "#CFE6D6"),
}.items()}

# ------------------------------------------------------------------ geometry helpers
PARTS = []


def _align_z(d):
    """Rotation matrix taking +Z onto direction d."""
    d = d.normalized()
    z = Vector((0, 0, 1))
    axis = z.cross(d)
    if axis.length < 1e-8:
        return Matrix.Identity(4) if d.z > 0 else Matrix.Rotation(math.pi, 4, "X")
    ang = math.acos(max(-1.0, min(1.0, z.dot(d))))
    return Matrix.Rotation(ang, 4, axis.normalized())


def fpoint(F, u, d, z):
    """World point at facade coordinates. F=(facing, plane): u runs along the facade,
    d is the distance in front of the wall surface (positive = outwards), z is up."""
    k, p = F
    return {"-y": (u, p - d, z), "+y": (u, p + d, z), "-x": (p - d, u, z), "+x": (p + d, u, z)}[k]


class Part:
    """Accumulates primitives into one mesh object (one material slot per colour)."""

    def __init__(self, name, coll):
        self.name, self.coll = name, coll
        self.bm = bmesh.new()
        self.mats = []
        PARTS.append(self)

    def _merge(self, tmp, m, smooth=False):
        if m not in self.mats:
            self.mats.append(m)
        mi = self.mats.index(m)
        vmap = {v: self.bm.verts.new(v.co) for v in tmp.verts}
        for f in tmp.faces:
            nf = self.bm.faces.new([vmap[v] for v in f.verts])
            nf.material_index = mi
            nf.smooth = smooth
        tmp.free()

    def box(self, x0, x1, y0, y1, z0, z1, m, bev=0.0, seg=2):
        x0, x1 = sorted((x0, x1)); y0, y1 = sorted((y0, y1)); z0, z1 = sorted((z0, z1))
        sx, sy, sz = x1 - x0, y1 - y0, z1 - z0
        if min(sx, sy, sz) <= 1e-5:
            return
        tmp = bmesh.new()
        bmesh.ops.create_cube(tmp, size=1.0)
        cx, cy, cz = (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2
        for v in tmp.verts:
            v.co = Vector((cx + v.co.x * sx, cy + v.co.y * sy, cz + v.co.z * sz))
        b = min(bev, 0.4 * min(sx, sy, sz))
        if b > 0.002:
            bmesh.ops.bevel(tmp, geom=list(tmp.verts) + list(tmp.edges), offset=b,
                            offset_type="OFFSET", segments=seg, profile=0.5,
                            affect="EDGES", clamp_overlap=True)
        self._merge(tmp, m)

    def cyl(self, p0, p1, r, m, seg=8, smooth=False, r2=None):
        p0, p1 = Vector(p0), Vector(p1)
        d = p1 - p0
        if d.length < 1e-6:
            return
        mat = Matrix.Translation((p0 + p1) / 2) @ _align_z(d)
        tmp = bmesh.new()
        bmesh.ops.create_cone(tmp, cap_ends=True, cap_tris=False, segments=seg,
                              radius1=r, radius2=(r if r2 is None else r2),
                              depth=d.length, matrix=mat)
        self._merge(tmp, m, smooth)

    def sphere(self, c, r, m, sub=2, scale=(1, 1, 1), smooth=False, rotz=0.0):
        mat = (Matrix.Translation(Vector(c)) @ Matrix.Rotation(rotz, 4, "Z")
               @ Matrix.Diagonal(Vector((scale[0], scale[1], scale[2], 1.0))))
        tmp = bmesh.new()
        bmesh.ops.create_icosphere(tmp, subdivisions=sub, radius=r, matrix=mat)
        self._merge(tmp, m, smooth)

    def prism_f(self, pts, d0, d1, F, m):
        """Convex polygon given as (u, z) points on facade F, extruded from d0 to d1."""
        tmp = bmesh.new()
        f = [tmp.verts.new(fpoint(F, u, d0, z)) for u, z in pts]
        b = [tmp.verts.new(fpoint(F, u, d1, z)) for u, z in pts]
        tmp.faces.new(f)
        tmp.faces.new(list(reversed(b)))
        n = len(pts)
        for i in range(n):
            j = (i + 1) % n
            tmp.faces.new([f[i], f[j], b[j], b[i]])
        bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces[:])
        self._merge(tmp, m)

    def band_f(self, outer, inner, d0, d1, F, m):
        """Strip between two open (u, z) polylines on facade F, extruded from d0 to d1."""
        tmp = bmesh.new()
        of = [tmp.verts.new(fpoint(F, u, d0, z)) for u, z in outer]
        ob = [tmp.verts.new(fpoint(F, u, d1, z)) for u, z in outer]
        inf = [tmp.verts.new(fpoint(F, u, d0, z)) for u, z in inner]
        inb = [tmp.verts.new(fpoint(F, u, d1, z)) for u, z in inner]
        for i in range(len(outer) - 1):
            tmp.faces.new([of[i], of[i + 1], inf[i + 1], inf[i]])
            tmp.faces.new([ob[i], inb[i], inb[i + 1], ob[i + 1]])
            tmp.faces.new([of[i], ob[i], ob[i + 1], of[i + 1]])
            tmp.faces.new([inf[i], inf[i + 1], inb[i + 1], inb[i]])
        tmp.faces.new([of[0], inf[0], inb[0], ob[0]])
        tmp.faces.new([of[-1], ob[-1], inb[-1], inf[-1]])
        bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces[:])
        self._merge(tmp, m)

    def ring_xy(self, c, r_out, r_in, z0, z1, m, n=40):
        tmp = bmesh.new()
        cx, cy = c
        def pts(r, z):
            return [tmp.verts.new((cx + r * math.cos(2 * math.pi * i / n),
                                   cy + r * math.sin(2 * math.pi * i / n), z)) for i in range(n)]
        ot, ob, it, ib = pts(r_out, z1), pts(r_out, z0), pts(r_in, z1), pts(r_in, z0)
        for i in range(n):
            j = (i + 1) % n
            tmp.faces.new([ot[i], ot[j], it[j], it[i]])
            tmp.faces.new([ob[i], ib[i], ib[j], ob[j]])
            tmp.faces.new([ob[i], ob[j], ot[j], ot[i]])
            tmp.faces.new([ib[i], it[i], it[j], ib[j]])
        bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces[:])
        self._merge(tmp, m)

    def quad_z(self, cx, cy, z, w, h, rot, m):
        """Flat upward-facing quad (floor tiles, chips)."""
        tmp = bmesh.new()
        c, s = math.cos(rot), math.sin(rot)
        vs = [tmp.verts.new((cx + px * c - py * s, cy + px * s + py * c, z))
              for px, py in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2))]
        tmp.faces.new(vs)
        self._merge(tmp, m)

    def sheet(self, rows, m):
        """Quad grid through rows of 3D points (cloth, canopies)."""
        tmp = bmesh.new()
        vv = [[tmp.verts.new(p) for p in row] for row in rows]
        for i in range(len(rows) - 1):
            for j in range(len(rows[0]) - 1):
                tmp.faces.new([vv[i][j], vv[i][j + 1], vv[i + 1][j + 1], vv[i + 1][j]])
        self._merge(tmp, m, smooth=True)

    def build(self):
        if len(self.bm.verts) == 0:
            self.bm.free()
            return None
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(m)
        ob = bpy.data.objects.new(self.name, me)
        self.coll.objects.link(ob)
        return ob


def fbox(P, F, u0, u1, d0, d1, z0, z1, m, bev=0.0):
    """Box placed relative to a facade (see fpoint)."""
    k, p = F
    if k == "-y":
        P.box(u0, u1, p - d1, p - d0, z0, z1, m, bev)
    elif k == "+y":
        P.box(u0, u1, p + d0, p + d1, z0, z1, m, bev)
    elif k == "-x":
        P.box(p - d1, p - d0, u0, u1, z0, z1, m, bev)
    elif k == "+x":
        P.box(p + d0, p + d1, u0, u1, z0, z1, m, bev)


# ------------------------------------------------------------------ building elements
def rect_window(P, F, u0, u1, z0, z1, frame=None, surround=None, chajja=None,
                use_grille=True, bar_gap=0.12, hbars=2):
    frame = frame or M["white"]
    fw = 0.08
    if surround is not None:
        fbox(P, F, u0 - 0.2, u1 + 0.2, 0, 0.02, z0 - 0.22, z1 + 0.18, surround)
    fbox(P, F, u0, u1, -0.01, 0.03, z0, z1, M["glass"])
    fbox(P, F, u0 - fw, u0, 0, 0.08, z0, z1, frame)
    fbox(P, F, u1, u1 + fw, 0, 0.08, z0, z1, frame)
    fbox(P, F, u0 - fw, u1 + fw, 0, 0.08, z1, z1 + fw, frame)
    fbox(P, F, u0 - fw, u1 + fw, 0, 0.08, z0 - fw, z0, frame)
    if u1 - u0 > 1.0:
        um = (u0 + u1) / 2
        fbox(P, F, um - 0.03, um + 0.03, 0, 0.06, z0, z1, frame)
    fbox(P, F, u0 - fw - 0.06, u1 + fw + 0.06, 0, 0.14, z0 - fw - 0.07, z0 - fw, frame, 0.012)
    if use_grille:
        n = max(2, int(round((u1 - u0) / bar_gap)))
        for i in range(1, n):
            u = u0 + (u1 - u0) * i / n
            fbox(P, F, u - 0.01, u + 0.01, 0.035, 0.055, z0, z1, M["grille"])
        for j in range(1, hbars + 1):
            z = z0 + (z1 - z0) * j / (hbars + 1)
            fbox(P, F, u0, u1, 0.035, 0.055, z - 0.012, z + 0.012, M["grille"])
    if chajja is not None:
        fbox(P, F, u0 - 0.3, u1 + 0.3, 0, 0.55, z1 + 0.2, z1 + 0.32, chajja, 0.025)


def door(P, F, u0, u1, z0, z1, wood, frame, grille=False, leaf=None):
    """Door frame on P; the door leaf (panel, insets, handle) on `leaf` if given, so the game
    can swing it open. A dark recess behind the leaf shows when it is open."""
    fw = 0.09
    Lf = leaf or P
    fbox(P, F, u0 - fw, u0, 0, 0.08, z0, z1 + fw, frame, 0.01)
    fbox(P, F, u1, u1 + fw, 0, 0.08, z0, z1 + fw, frame, 0.01)
    fbox(P, F, u0 - fw, u1 + fw, 0, 0.08, z1, z1 + fw, frame, 0.01)
    if leaf is not None:
        fbox(P, F, u0, u1, -0.012, -0.002, z0, z1, M["doorway"])
    fbox(Lf, F, u0, u1, -0.01 if leaf is None else 0.0, 0.03, z0, z1, wood)
    h = z1 - z0
    fbox(Lf, F, u0 + 0.1, u1 - 0.1, 0.03, 0.05, z0 + 0.15, z0 + h * 0.45, M["wood_d"], 0.01)
    fbox(Lf, F, u0 + 0.1, u1 - 0.1, 0.03, 0.05, z0 + h * 0.52, z1 - 0.15, M["wood_d"], 0.01)
    Lf.sphere(fpoint(F, u1 - 0.12, 0.08, z0 + h * 0.48), 0.035, M["brass"], sub=1, smooth=True)
    if grille:
        n = int((u1 - u0) / 0.11)
        for i in range(1, n):
            u = u0 + (u1 - u0) * i / n
            fbox(Lf, F, u - 0.01, u + 0.01, 0.06, 0.08, z0, z1, M["grille"])
        for z in (z0 + 0.1, z0 + h * 0.5, z1 - 0.1):
            fbox(Lf, F, u0, u1, 0.06, 0.08, z - 0.015, z + 0.015, M["grille"])


def arch_pts(cu, zb, w, zs, n=20):
    r = w / 2
    pts = [(cu - r, zb)]
    for i in range(n + 1):
        a = math.pi * (1 - i / n)
        pts.append((cu + r * math.cos(a), zs + r * math.sin(a)))
    pts.append((cu + r, zb))
    return pts


def arch_window(P, F, cu, w, zb, zs, frame=None):
    """Arched window (semicircular head, black square grille) on facade F."""
    frame = frame or M["white"]
    r, fw = w / 2, 0.13
    P.prism_f(arch_pts(cu, zb, w, zs), -0.01, 0.03, F, M["glass"])
    P.band_f(arch_pts(cu, zb, w + 2 * fw, zs), arch_pts(cu, zb, w, zs), -0.01, 0.09, F, frame)
    fbox(P, F, cu - 0.09, cu + 0.09, -0.01, 0.12, zs + r - 0.02, zs + r + fw + 0.05, frame, 0.012)
    fbox(P, F, cu - r - fw - 0.08, cu + r + fw + 0.08, -0.01, 0.16, zb - 0.1, zb, frame, 0.015)
    g = 0.2
    k = int(r / g) + 1
    for i in range(-k, k + 1):
        u = cu + i * g
        du = abs(u - cu)
        if du >= r - 0.02:
            continue
        zt = zs + math.sqrt(r * r - du * du)
        fbox(P, F, u - 0.014, u + 0.014, 0.03, 0.06, zb, zt, M["grille"])
    z = zb + g
    while z < zs + r - 0.03:
        hw = r if z <= zs else math.sqrt(max(0.0, r * r - (z - zs) ** 2))
        fbox(P, F, cu - hw, cu + hw, 0.03, 0.06, z - 0.014, z + 0.014, M["grille"])
        z += g


def jali_parapet(P, axis, s0, s1, c, t, z0, z1, n_open, open_to=None):
    """White parapet with salmon-framed rectangular openings (the 'crown' on top)."""
    wall, trim = M["white"], M["salmon"]

    def B(a0, a1, b0, b1, za, zb, m, bev=0.0):
        if axis == "x":
            P.box(a0, a1, b0, b1, za, zb, m, bev)
        else:
            P.box(b0, b1, a0, a1, za, zb, m, bev)

    post, bot, top = 0.30, 0.26, 0.22
    zo0, zo1 = z0 + bot, z1 - top
    t0, t1 = c - t / 2, c + t / 2
    B(s0, s1, t0, t1, z0, zo0, wall)
    B(s0, s1, t0, t1, zo1, z1, wall)
    B(s0 - 0.035, s1 + 0.035, t0 - 0.035, t1 + 0.035, z1, z1 + 0.07, wall, 0.015)
    B(s0 - 0.02, s1 + 0.02, t0 - 0.02, t1 + 0.02, z0, z0 + 0.09, trim)
    oe = s1 if open_to is None else open_to
    ow = (oe - s0 - post * (n_open + 1)) / n_open
    B(s0, s0 + post, t0, t1, zo0, zo1, wall)
    f, ins, rw = 0.055, 0.15, 0.045
    for i in range(n_open):
        a = s0 + post + i * (ow + post)
        b = a + ow
        B(b, b + post, t0, t1, zo0, zo1, wall)
        B(a, b, t0 - 0.01, t1 + 0.01, zo0, zo0 + f, trim)
        B(a, b, t0 - 0.01, t1 + 0.01, zo1 - f, zo1, trim)
        B(a, a + f, t0 - 0.01, t1 + 0.01, zo0, zo1, trim)
        B(b - f, b, t0 - 0.01, t1 + 0.01, zo0, zo1, trim)
        ia, ib, iz0, iz1 = a + ins, b - ins, zo0 + ins * 0.75, zo1 - ins * 0.75
        B(ia, ib, c - 0.035, c + 0.035, iz0, iz0 + rw, trim)
        B(ia, ib, c - 0.035, c + 0.035, iz1 - rw, iz1, trim)
        B(ia, ia + rw, c - 0.035, c + 0.035, iz0, iz1, trim)
        B(ib - rw, ib, c - 0.035, c + 0.035, iz0, iz1, trim)
        zm = (zo0 + zo1) / 2
        B(a + f, ia, c - 0.02, c + 0.02, zm - 0.02, zm + 0.02, trim)
        B(ib, b - f, c - 0.02, c + 0.02, zm - 0.02, zm + 0.02, trim)
    if oe < s1 - 1e-4:
        B(oe, s1, t0, t1, zo0, zo1, wall)


def railing(P, path, z0, h=1.0, m=None, gap=0.11, post_every=1.2):
    """Stainless-steel balcony railing following a 2D path of (x, y) points."""
    m = m or M["steel"]
    up = lambda p, z: Vector((p.x, p.y, z))
    for a2, b2 in zip(path[:-1], path[1:]):
        a, b = Vector((a2[0], a2[1], 0)), Vector((b2[0], b2[1], 0))
        L = (b - a).length
        u = (b - a) / L
        P.cyl(up(a, z0 + h), up(b, z0 + h), 0.03, m, seg=10, smooth=True)
        P.cyl(up(a, z0 + 0.1), up(b, z0 + 0.1), 0.015, m, seg=6)
        P.cyl(up(a, z0 + h - 0.13), up(b, z0 + h - 0.13), 0.013, m, seg=6)
        n = max(1, int(L / gap))
        for i in range(n + 1):
            p = a + u * (L * i / n)
            P.cyl(up(p, z0 + 0.1), up(p, z0 + h - 0.13), 0.008, m, seg=5)
        npost = max(1, round(L / post_every))
        for i in range(npost + 1):
            p = a + u * (L * i / npost)
            P.cyl(up(p, z0), up(p, z0 + h), 0.024, m, seg=10, smooth=True)
        for i in range(npost):           # little diamond motif in the middle of every panel
            p = a + u * (L * (i + 0.5) / npost)
            zc, s = z0 + h * 0.5, 0.14
            q = [up(p - u * s, zc), up(p, zc + s), up(p + u * s, zc), up(p, zc - s)]
            for j in range(4):
                P.cyl(q[j], q[(j + 1) % 4], 0.011, m, seg=5)


# ------------------------------------------------------------------ props
def potted_plant(P, x, y, z, s=1.0, pot="terracotta", kind="round"):
    P.cyl((x, y, z), (x, y, z + 0.32 * s), 0.13 * s, M[pot], seg=10, r2=0.18 * s)
    if kind == "round":
        P.sphere((x, y, z + 0.5 * s), 0.24 * s, M["leaf"], sub=2)
        P.sphere((x + 0.12 * s, y - 0.05, z + 0.42 * s), 0.17 * s, M["leaf_d"], sub=1)
    elif kind == "leafy":             # big-leaved plant (like the ones along the gate wall)
        for i in range(7):
            a = 2 * math.pi * i / 7
            P.sphere((x + 0.2 * s * math.cos(a), y + 0.2 * s * math.sin(a), z + (0.55 + 0.12 * (i % 3)) * s),
                     0.16 * s, M["leaf"] if i % 2 else M["leaf_y"], sub=1, scale=(1.6, 0.7, 0.35), rotz=a)
        P.sphere((x, y, z + 0.75 * s), 0.18 * s, M["leaf_d"], sub=1, scale=(1, 1, 1.3))
    elif kind == "snake":             # upright snake plant
        for i in range(6):
            a = 2 * math.pi * i / 6
            dx, dy = 0.06 * s * math.cos(a), 0.06 * s * math.sin(a)
            P.sphere((x + dx, y + dy, z + 0.6 * s), 0.05 * s, M["leaf_d"] if i % 2 else M["leaf_y"],
                     sub=1, scale=(1.2, 0.5, 6.0), rotz=a)


def debdaru(P, x, y, h=7.5):
    """Tall columnar tree (debdaru), like the one beside the house."""
    P.cyl((x, y, 0), (x, y, 1.1), 0.13, M["trunk"], seg=8)
    levels = 9
    for i in range(levels):
        t = i / (levels - 1)
        z = 1.3 + t * (h - 1.9)
        r = 0.85 * (1 - t) + 0.25
        P.sphere((x + 0.07 * math.sin(i * 1.7), y + 0.07 * math.cos(i * 2.3), z), r,
                 M["leaf"] if i % 2 == 0 else M["leaf_d"], sub=2, scale=(1, 1, 1.35))


def round_tree(P, x, y, h=4.6, r=1.6):
    P.cyl((x, y, 0), (x, y, h - r * 0.6), 0.18, M["trunk"], seg=8)
    P.sphere((x, y, h), r, M["leaf"], sub=2)
    P.sphere((x + r * 0.65, y - 0.2, h - 0.45), r * 0.7, M["leaf_d"], sub=2)
    P.sphere((x - r * 0.6, y + 0.25, h - 0.35), r * 0.75, M["leaf_d"], sub=2)


def bush(P, x, y, s=1.0, z=0.0):
    for dx, dy, dz, r, m in ((0, 0, 0.7, 0.75, "leaf"), (0.55, -0.1, 0.5, 0.55, "leaf_d"),
                             (-0.5, 0.15, 0.55, 0.6, "leaf_d"), (0.1, 0.3, 1.15, 0.5, "leaf_y")):
        P.sphere((x + dx * s, y + dy * s, z + dz * s), r * s, M[m], sub=2)


def covered_scooter(P, x, y):
    """Scooter under its blue cover, parked along X (front towards +X)."""
    c = M["cover"]
    for wx in (-0.58, 0.6):
        P.cyl((x + wx, y - 0.06, 0.2), (x + wx, y + 0.06, 0.2), 0.2, M["tyre"], seg=14)
    P.box(x - 0.8, x + 0.62, y - 0.3, y + 0.3, 0.22, 0.8, c, 0.15, seg=3)
    P.sphere((x - 0.2, y, 0.78), 0.34, c, sub=2, scale=(1.6, 0.85, 0.45), smooth=True)
    P.box(x + 0.5, x + 0.8, y - 0.3, y + 0.3, 0.25, 1.1, c, 0.1, seg=3)
    P.box(x + 0.55, x + 0.85, y - 0.4, y + 0.4, 1.0, 1.22, c, 0.08, seg=3)


def swing(P, cx, cy):
    """Steel garden swing (jhoola) with blue canopy, seat facing -Y."""
    st, hw = M["steel"], 1.0
    for sx in (-hw, hw):
        x = cx + sx
        P.cyl((x, cy - 0.65, 0.04), (x, cy + 0.65, 0.04), 0.03, st, seg=8)
        P.cyl((x, cy - 0.6, 0.04), (x, cy, 1.95), 0.025, st, seg=8)
        P.cyl((x, cy + 0.6, 0.04), (x, cy, 1.95), 0.025, st, seg=8)
        arch = [(x, cy + 0.75 * math.cos(math.pi * i / 8), 1.95 + 0.35 * math.sin(math.pi * i / 8)) for i in range(9)]
        for a, b in zip(arch[:-1], arch[1:]):
            P.cyl(a, b, 0.015, st, seg=6)
    P.cyl((cx - hw, cy, 1.95), (cx + hw, cy, 1.95), 0.03, st, seg=10)
    rows = []
    for i in range(9):
        a = math.pi * i / 8
        y, z = cy + 0.78 * math.cos(a), 1.97 + 0.37 * math.sin(a)
        rows.append([(cx - hw - 0.05, y, z), (cx + hw + 0.05, y, z)])
    P.sheet(rows, M["canopy"])
    for sx in (-0.72, 0.72):
        P.cyl((cx + sx, cy, 1.93), (cx + sx, cy, 0.62), 0.008, st, seg=4)
    P.box(cx - 0.8, cx + 0.8, cy - 0.28, cy + 0.28, 0.45, 0.52, st, 0.01)
    P.box(cx - 0.78, cx + 0.78, cy - 0.27, cy + 0.25, 0.52, 0.64, M["cushion"], 0.05)
    P.box(cx - 0.78, cx + 0.78, cy + 0.2, cy + 0.3, 0.6, 1.25, M["swing_back"], 0.03)
    P.cyl((cx - 0.8, cy + 0.3, 1.27), (cx + 0.8, cy + 0.3, 1.27), 0.02, st, seg=6)
    for sx in (-0.8, 0.8):
        P.cyl((cx + sx, cy - 0.27, 0.52), (cx + sx, cy - 0.27, 0.85), 0.015, st, seg=6)
        P.cyl((cx + sx, cy - 0.27, 0.85), (cx + sx, cy + 0.28, 0.85), 0.015, st, seg=6)


def plastic_chair(P, x, y):
    """Dark plastic chair facing -Y."""
    m = M["chair"]
    P.box(x - 0.25, x + 0.25, y - 0.25, y + 0.22, 0.42, 0.47, m, 0.03)
    P.box(x - 0.25, x + 0.25, y + 0.17, y + 0.24, 0.47, 0.9, m, 0.03)
    for sx in (-0.22, 0.22):
        for sy in (-0.22, 0.19):
            P.box(x + sx - 0.03, x + sx + 0.03, y + sy - 0.03, y + sy + 0.03, 0.0, 0.43, m, 0.01)
        P.box(x + sx - 0.03, x + sx + 0.03, y - 0.22, y + 0.22, 0.6, 0.65, m, 0.01)
        P.box(x + sx - 0.03, x + sx + 0.03, y - 0.2, y - 0.14, 0.47, 0.62, m, 0.01)


def bucket(P, x, y, m, s=1.0):
    P.cyl((x, y, 0.0), (x, y, 0.38 * s), 0.14 * s, m, seg=12, r2=0.18 * s)


# ------------------------------------------------------------------ the house
def build_house():
    FRONT = ("-y", 0.0)
    SIDE = ("+x", X_SIDE)
    BACK = ("+y", D_HOUSE)
    LEFT = ("-x", xA0)
    D = D_HOUSE
    tx0, tx1, ty0, ty1 = TOWER

    # ---- Block A: white wing on the left of the front, holds the main door ----
    A = Part("Block_A", C_HOUSE)
    A.box(xA0, xA1, 0, D, 0, ROOF, M["white"], 0.04)
    A.box(xA0, -0.4, 0, 0.15, ROOF, ROOF + 0.95, M["white"], 0.03)
    A.box(xA0, xA0 + 0.15, 0, D, ROOF, ROOF + 0.95, M["white"], 0.03)
    A.box(xA0, -0.4, D - 0.15, D, ROOF, ROOF + 0.95, M["white"], 0.03)
    A.box(xA0 - 0.04, xA0 + 0.2, -0.05, 0.25, 0, ROOF + 1.0, M["salmon"], 0.02)   # corner stripe
    for u0, u1 in ((-3.6, -2.5), (-1.75, -0.65)):
        rect_window(A, FRONT, u0, u1, FF0 + 0.85, FF0 + 2.2, surround=M["lav"], chajja=M["salmon"])
    rect_window(A, FRONT, -3.65, -2.65, 1.0, 2.4, surround=M["lav"], chajja=M["salmon"])
    for u0, u1 in ((2.4, 3.4), (5.2, 6.2), (8.0, 9.0)):
        rect_window(A, LEFT, u0, u1, 1.0, 2.4, surround=M["lav"], chajja=M["salmon"])
        rect_window(A, LEFT, u0, u1, FF0 + 0.85, FF0 + 2.2, surround=M["lav"], chajja=M["salmon"])
    # main door: lavender surround, white marble steps, salmon sunshade
    fbox(A, FRONT, -2.1, -0.3, 0, 0.025, PLINTH, PLINTH + 2.55, M["lav"])
    for k in range(3):
        A.box(-2.25, -0.15, -0.32 * (3 - k), 0.0, 0.15 * k, 0.15 * (k + 1), M["marble"], 0.012)
    fbox(A, FRONT, -2.15, -0.25, 0, 0.75, PLINTH + 2.62, PLINTH + 2.74, M["salmon"], 0.025)
    Dm = Part("Door_Main", C_HOUSE)          # just the leaf; the game swings it open for Maa
    door(A, FRONT, -1.75, -0.65, PLINTH, PLINTH + 2.2, M["wood"], M["wood_d"], leaf=Dm)

    # ---- Block B: lavender corner block (front + lane side up to the straight part) ----
    Bk = Part("Block_B", C_HOUSE)
    ly0, ly1 = LOGGIA
    lx = X_SIDE - 1.2                     # back wall of the side clothes balcony
    Bk.box(xB0, xB1, 0, LAV_D, 0, GF_TOP, M["lav"], 0.04)
    Bk.box(xB0, xB1, 0, LAV_D, FF0, FF_TOP, M["lav"], 0.04)
    Bk.box(xB0, xB1, LAV_D, D, 0, GF_TOP, M["white"], 0.04)
    Bk.box(xB0, xB1, 0, D, GF_TOP, FF0, M["white"], 0.02)
    Bk.box(xB0, lx, LAV_D, D, FF0, FF_TOP, M["white"], 0.04)
    Bk.box(lx, xB1, LAV_D, ly0, FF0, FF_TOP, M["white"], 0.04)
    Bk.box(lx, xB1, ly1, D, FF0, FF_TOP, M["white"], 0.04)
    Bk.box(lx, xB1, ly0, ly1, FF0 + 2.55, FF_TOP, M["white"], 0.03)
    Bk.box(lx, lx + 0.03, ly0, ly1, FF0, FF0 + 2.55, M["lav"])            # clothes balcony inside
    Bk.box(lx, xB1, ly0, ly0 + 0.03, FF0, FF0 + 2.55, M["lav"])
    Bk.box(lx, xB1, ly1 - 0.03, ly1, FF0, FF0 + 2.55, M["lav"])
    Bk.box(lx, xB1, ly0, ly1, FF0, FF0 + 0.02, M["marble"])
    Bk.box(xB1 - 0.02, xB1 + 0.06, ly0, ly1, FF0 - 0.2, FF0 + 0.04, M["white"], 0.015)
    # salmon pilasters: left of the front, wrapping the corner, and where the lavender ends
    Bk.box(xB0, xB0 + 0.3, -0.06, 0.02, PLINTH, GF_TOP, M["salmon"], 0.015)
    Bk.box(xB1 - 0.3, xB1 + 0.06, -0.06, 0.3, PLINTH, GF_TOP, M["salmon"], 0.015)
    Bk.box(xB1 - 0.02, xB1 + 0.06, LAV_D - 0.3, LAV_D, PLINTH, GF_TOP, M["salmon"], 0.015)
    # big arched window on the front, smaller one round the corner on the lane side
    arch_window(Bk, FRONT, 2.9, 3.4, 0.8, GF_TOP - 0.2 - 1.7)
    arch_window(Bk, SIDE, 1.45, 1.3, 0.8, GF_TOP - 0.2 - 0.65)
    # first floor: grilled door, and a glass window that turns the corner
    door(Bk, FRONT, 0.95, 2.0, FF0 + 0.02, FF0 + 2.25, M["wood"], M["white"], grille=True)
    rect_window(Bk, FRONT, 4.0, 5.92, FF0 + 0.85, FF0 + 2.2)
    rect_window(Bk, SIDE, 0.08, 1.35, FF0 + 0.85, FF0 + 2.2)

    # ---- L-shaped balcony: along the front and round the corner to the straight part ----
    Bal = Part("Balcony", C_HOUSE)
    bx0, bxo, byo, byb = -0.3, X_SIDE + BAL_P, -BAL_P, LAV_D
    Bal.box(bx0, bxo, byo, 0.0, FF0 - 0.2, FF0, M["salmon"], 0.02)
    Bal.box(X_SIDE, bxo, 0.0, byb, FF0 - 0.2, FF0, M["salmon"], 0.02)
    Bal.box(bx0, bxo, byo, byo + 0.16, FF0 - 0.48, FF0 + 0.05, M["salmon"], 0.035)
    Bal.box(bx0, bx0 + 0.16, byo, 0.0, FF0 - 0.48, FF0 + 0.05, M["salmon"], 0.035)
    Bal.box(bxo - 0.16, bxo, byo, byb, FF0 - 0.48, FF0 + 0.05, M["salmon"], 0.035)
    Bal.box(X_SIDE, bxo, byb - 0.16, byb, FF0 - 0.48, FF0 + 0.05, M["salmon"], 0.035)
    Bal.box(bx0 + 0.16, bxo - 0.16, byo + 0.16, 0.0, FF0, FF0 + 0.02, M["marble"])
    Bal.box(X_SIDE, bxo - 0.16, 0.0, byb - 0.16, FF0, FF0 + 0.02, M["marble"])
    for x, y in ((0.35, -0.95), (2.75, -0.95), (5.6, -0.95), (6.8, 1.9)):
        potted_plant(Bal, x, y, FF0 + 0.02)
    Rl = Part("Railing_Balcony", C_HOUSE)
    railing(Rl, [(bx0 + 0.08, -0.02), (bx0 + 0.08, byo + 0.08), (bxo - 0.08, byo + 0.08),
                 (bxo - 0.08, byb - 0.08), (X_SIDE + 0.02, byb - 0.08)], FF0 + 0.05, 1.0)

    # ---- crown: overhanging roof slab + jali parapet, also wrapping the corner ----
    cxo = X_SIDE + CROWN_P
    Cr = Part("Crown", C_HOUSE)
    Cr.box(-0.4, cxo, -CROWN_P, LAV_D, FF_TOP, ROOF, M["white"], 0.02)
    Cr.box(xB0, xB1, LAV_D, D, FF_TOP, ROOF, M["white"], 0.02)
    z0t, z1t = FF_TOP - 0.02, FF_TOP + 0.08
    Cr.box(-0.43, cxo + 0.03, -CROWN_P - 0.03, -CROWN_P + 0.06, z0t, z1t, M["salmon"])
    Cr.box(-0.43, -0.36, -CROWN_P - 0.03, 0.0, z0t, z1t, M["salmon"])
    Cr.box(cxo - 0.06, cxo + 0.03, -CROWN_P - 0.03, LAV_D + 0.03, z0t, z1t, M["salmon"])
    Cr.box(X_SIDE, cxo + 0.03, LAV_D - 0.06, LAV_D + 0.03, z0t, z1t, M["salmon"])
    for xb in (0.13, 3.0, 5.87):                          # beams under the front overhang
        Cr.box(xb - 0.13, xb + 0.13, -CROWN_P, 0.0, FF_TOP - 0.36, FF_TOP, M["white"], 0.015)
        Cr.box(xb - 0.135, xb + 0.135, -CROWN_P - 0.01, 0.0, FF_TOP - 0.39, FF_TOP - 0.34, M["salmon"])
    for yb in (1.4, LAV_D - 0.13):                        # beams under the side overhang
        Cr.box(X_SIDE, cxo, yb - 0.13, yb + 0.13, FF_TOP - 0.36, FF_TOP, M["white"], 0.015)
        Cr.box(X_SIDE, cxo + 0.01, yb - 0.135, yb + 0.135, FF_TOP - 0.39, FF_TOP - 0.34, M["salmon"])
    CZ1 = ROOF + 1.3
    jali_parapet(Cr, "x", -0.4, cxo, -CROWN_P + 0.075, 0.15, ROOF, CZ1, 4)
    jali_parapet(Cr, "y", -CROWN_P, D, -0.325, 0.15, ROOF, CZ1, 2, open_to=2.2)
    jali_parapet(Cr, "y", -CROWN_P, LAV_D, cxo - 0.075, 0.15, ROOF, CZ1, 2)
    Cr.box(X_SIDE, cxo, LAV_D - 0.15, LAV_D, ROOF, CZ1, M["white"], 0.02)
    Cr.box(5.85, 6.0, ty1, D, ROOF, ROOF + 1.0, M["white"], 0.02)
    Cr.box(-0.25, 6.0, D - 0.15, D, ROOF, ROOF + 1.0, M["white"], 0.02)

    # ---- stair room (mumty) on the roof: the "straight part", flush with the lane side ----
    Tw = Part("Stair_Room", C_HOUSE)
    Tw.box(tx0, tx1, ty0, ty1, ROOF, TOWER_TOP, M["white"], 0.04)
    Tw.box(tx0 - 0.1, tx1 + 0.1, ty0 - 0.1, ty1 + 0.1, TOWER_TOP, TOWER_TOP + 0.16, M["white"], 0.03)
    door(Tw, ("-y", ty0), 4.05, 4.95, ROOF + 0.02, ROOF + 2.15, M["wood"], M["wood_d"])
    wy0, wy1 = ty0 + 1.2, ty0 + 2.1      # the three stacked windows seen in the street photo
    rect_window(Tw, SIDE, wy0, wy1, ROOF + 0.75, ROOF + 2.2, hbars=2)

    # ---- lane side: windows, clothes balcony, AC units, side door ----
    S = Part("Side_Features", C_HOUSE)
    rect_window(S, SIDE, wy0, wy1, 0.95, 2.6, hbars=3)
    rect_window(S, SIDE, wy0, wy1, FF0 + 0.55, FF0 + 2.3, hbars=3)
    rect_window(S, SIDE, 5.6, 6.6, 1.0, 2.4)
    rect_window(S, SIDE, 5.75, 6.45, FF0 + 0.8, FF0 + 2.25, hbars=2)
    rect_window(S, SIDE, 11.0, 11.7, 1.0, 2.4, hbars=2)
    rect_window(S, SIDE, 11.0, 11.7, FF0 + 0.8, FF0 + 2.25, hbars=2)
    Ds = Part("Door_Side", C_HOUSE)
    door(Ds, SIDE, 8.55, 9.55, PLINTH, PLINTH + 2.15, M["wood"], M["wood_d"])
    for k in range(3):
        S.box(X_SIDE, X_SIDE + 0.3 * (3 - k), 8.3, 9.8, 0.15 * k, 0.15 * (k + 1), M["step"], 0.015)
    for y0 in (7.5, 9.85):               # AC outdoor units under the clothes balcony
        S.box(X_SIDE, X_SIDE + 0.34, y0, y0 + 0.85, 2.75, 3.3, M["ac"], 0.04)
        S.cyl((X_SIDE + 0.33, y0 + 0.33, 3.02), (X_SIDE + 0.345, y0 + 0.33, 3.02), 0.2, M["grille"], seg=16)
        S.box(X_SIDE + 0.33, X_SIDE + 0.35, y0 + 0.62, y0 + 0.78, 2.85, 3.2, M["grille"])
    Rc = Part("Railing_Loggia", C_HOUSE)
    railing(Rc, [(X_SIDE - 0.08, ly0 + 0.08), (X_SIDE - 0.08, ly1 - 0.08)], FF0 + 0.04, 1.0)
    Cl = Part("Clothes", C_HOUSE)
    lz, cxl = FF0 + 2.25, lx + 0.6
    Cl.cyl((cxl, ly0 + 0.05, lz), (cxl, ly1 - 0.05, lz), 0.008, M["grille"], seg=4)
    ys = ly0 + 0.25
    for w, h, mk in ((0.55, 0.7, "cloth1"), (0.45, 0.55, "cloth2"), (0.9, 1.25, "cloth3"),
                     (0.5, 0.65, "cloth4"), (0.4, 0.5, "cloth1")):
        Cl.box(cxl - 0.015, cxl + 0.015, ys, ys + w, lz - h, lz, M[mk], 0.01)
        ys += w + 0.08

    # ---- back of the house: door to the backyard, windows, meter box and pipes ----
    Bb = Part("Back_Features", C_HOUSE)
    Db = Part("Door_Back", C_HOUSE)
    door(Db, BACK, -2.0, -1.0, PLINTH, PLINTH + 2.15, M["wood"], M["wood_d"])
    for k in range(3):
        Bb.box(-2.3, -0.7, D, D + 0.3 * (3 - k), 0.15 * k, 0.15 * (k + 1), M["step"], 0.015)
    for u0, u1 in ((-3.6, -2.7), (1.0, 2.0), (3.5, 4.5)):
        rect_window(Bb, BACK, u0, u1, FF0 + 0.85, FF0 + 2.2, chajja=M["salmon"])
    for u0, u1 in ((1.0, 2.0), (3.5, 4.5)):
        rect_window(Bb, BACK, u0, u1, 1.0, 2.4, chajja=M["salmon"])
    Bb.box(xA0 - 0.22, xA0, 10.0, 10.75, 1.7, 2.6, M["meter"], 0.02)
    for yy in (11.05, 11.22):
        Bb.cyl((xA0 - 0.08, yy, 0.05), (xA0 - 0.08, yy, ROOF + 0.3), 0.035, M["pipe"], seg=8)
    Bb.ring_xy((xA0 - 0.55, 10.4), 0.32, 0.22, 0.0, 0.08, M["hose"], 20)
    bucket(Bb, xA0 - 0.5, 11.45, M["bucket_w"])

    # plinth band along the front and both sides
    Pl = Part("Plinth", C_HOUSE)
    Pl.box(xA0 - 0.06, xB1 + 0.06, -0.06, 0.4, 0.0, PLINTH, M["plinth"], 0.015)
    Pl.box(xA0 - 0.06, xA0 + 0.4, -0.06, D + 0.06, 0.0, PLINTH, M["plinth"], 0.015)
    Pl.box(xB1 - 0.4, xB1 + 0.06, -0.06, D + 0.06, 0.0, PLINTH, M["plinth"], 0.015)
    Pl.box(xA0 - 0.06, xB1 + 0.06, D - 0.4, D + 0.06, 0.0, PLINTH, M["plinth"], 0.015)


# ------------------------------------------------------------------ site
def in_checker(x, y):
    return (X_LEFT_WALL <= x <= xA0 and CHECKER_Y <= y <= D_HOUSE) or (y >= D_HOUSE and x <= X_SIDE_WALL)


def build_site():
    rng = random.Random(7)
    G = Part("Ground", C_SITE)
    G.box(-45, 45, -35, 40, -0.3, -0.06, M["ground"])
    G.box(-45, 45, -10.5, Y_WALL - 0.25, -0.06, -0.02, M["road"])                       # front street
    G.box(X_SIDE_WALL + 0.5, X_SIDE_WALL + 5.3, Y_WALL - 0.25, 40, -0.06, -0.02, M["road"])  # side lane
    G.box(X_SIDE_WALL + 0.25, X_SIDE_WALL + 0.5, Y_WALL - 0.25, 40, -0.05, -0.025, M["concrete"])  # drain

    # ---- compound floors: chips mosaic at the front, maroon/white checkers at the back ----
    Yd = Part("Yard_Floor", C_SITE)
    yf0 = Y_WALL + 0.23
    Yd.box(X_LEFT_WALL, X_SIDE_WALL, yf0, Y_BACK, -0.06, 0.01, M["mosaic"])
    gx = X_LEFT_WALL + 1.0
    while gx < X_SIDE_WALL:
        Yd.box(gx - 0.012, gx + 0.012, yf0, Y_BACK, 0.01, 0.013, M["grout"])
        gx += 1.0
    gy = yf0 + 1.0
    while gy < Y_BACK:
        Yd.box(X_LEFT_WALL, X_SIDE_WALL, gy - 0.012, gy + 0.012, 0.01, 0.013, M["grout"])
        gy += 1.0
    house = lambda x, y: (xA0 - 0.1 < x < xB1 + 0.1 and -0.1 < y < D_HOUSE + 0.1)
    for _ in range(1400):
        x, y = rng.uniform(X_LEFT_WALL + 0.05, X_SIDE_WALL - 0.05), rng.uniform(yf0 + 0.05, Y_BACK - 0.05)
        if house(x, y) or in_checker(x, y):
            continue
        s = rng.uniform(0.04, 0.09)
        Yd.quad_z(x, y, 0.0135, s, s * rng.uniform(0.5, 1.2), rng.uniform(0, math.pi),
                  M["chip"] if rng.random() < 0.7 else M["chip_g"])
    T_SZ = 0.45
    for (x0, x1, y0, y1) in ((X_LEFT_WALL, xA0, CHECKER_Y, D_HOUSE), (X_LEFT_WALL, X_SIDE_WALL, D_HOUSE, Y_BACK)):
        Yd.box(x0, x1, y0, y1, 0.0, 0.016, M["check_w"])
        i = 0
        y = y0
        while y < y1 - 1e-3:
            x = x0 + (T_SZ if i % 2 else 0.0)
            while x < x1 - 1e-3:
                w, h = min(T_SZ, x1 - x), min(T_SZ, y1 - y)
                if not (house(x + w / 2, y + h / 2)):
                    Yd.quad_z(x + w / 2, y + h / 2, 0.017, w - 0.01, h - 0.01, 0.0, M["check_r"])
                x += 2 * T_SZ
            y += T_SZ
            i += 1

    # ---- boundary walls ----
    Bd = Part("Boundary_Wall", C_SITE)
    y0, y1, WH = Y_WALL, Y_WALL + 0.23, 1.95
    xl0, xl1 = X_LEFT_WALL - 0.23, X_LEFT_WALL
    for a, b in ((xl0, GATE_X0 - 0.4), (GATE_X1 + 0.4, X_SIDE_WALL - 0.2)):
        Bd.box(a, b, y0, y1, 0, WH, M["peach"], 0.02)
        Bd.box(a - 0.02, b + 0.02, y0 - 0.04, y1 + 0.04, WH, WH + 0.07, M["peach_top"], 0.015)
    for a, b in ((GATE_X0 - 0.4, GATE_X0), (GATE_X1, GATE_X1 + 0.4)):      # tall gate pillars
        Bd.box(a, b, y0 - 0.08, y1 + 0.08, 0, 2.45, M["peach"], 0.03)
        Bd.box(a - 0.05, b + 0.05, y0 - 0.13, y1 + 0.13, 2.45, 2.55, M["peach_top"], 0.025)
    Bd.box(GATE_X1 + 0.04, GATE_X1 + 0.36, y0 - 0.1, y0 - 0.07, 1.35, 1.62, M["plaque"], 0.01)   # name plate
    # left wall: plastered at the front, exposed brick along the backyard
    Bd.box(xl0, xl1, y0, CHECKER_Y, 0, WH, M["peach"], 0.02)
    Bd.box(xl0 - 0.04, xl1 + 0.04, y0 - 0.04, CHECKER_Y, WH, WH + 0.07, M["peach_top"], 0.015)
    Bd.box(xl0, xl1, CHECKER_Y, Y_BACK + 0.23, 0, 2.6, M["brick"], 0.02)
    z = 0.22
    while z < 2.55:
        Bd.box(xl1, xl1 + 0.006, CHECKER_Y, Y_BACK, z - 0.012, z + 0.012, M["mortar"])
        z += 0.24
    # back wall with pilasters
    Bd.box(xl0, X_SIDE_WALL + 0.23, Y_BACK, Y_BACK + 0.23, 0, 2.4, M["peach"], 0.02)
    Bd.box(xl0 - 0.04, X_SIDE_WALL + 0.27, Y_BACK - 0.04, Y_BACK + 0.27, 2.4, 2.47, M["peach_top"], 0.015)
    px = X_LEFT_WALL + 3.0
    while px < X_SIDE_WALL - 1.0:
        Bd.box(px - 0.2, px + 0.2, Y_BACK - 0.12, Y_BACK, 0, 2.4, M["peach"], 0.02)
        px += 3.2

    # ---- main gate: dark sheet-metal double gate with curly grille on top ----
    # Each leaf is its own object so the game can swing it open around its hinge.
    gx0, gx1, gy = GATE_X0 + 0.02, GATE_X1 - 0.02, Y_WALL + 0.115
    gcx, gw = (gx0 + gx1) / 2, (gx1 - gx0) / 2
    SOLID = 1.75
    top = lambda x: SOLID + 0.28 + 0.38 * math.cos((x - gcx) / gw * math.pi / 2)
    for name, l0, l1 in (("Gate_Leaf_L", gx0, gcx), ("Gate_Leaf_R", gcx, gx1)):
        Gt = Part(name, C_SITE)
        pts = [l0 + (l1 - l0) * i / 12 for i in range(13)]
        for a, b in zip(pts[:-1], pts[1:]):
            Gt.cyl((a, gy, top(a)), (b, gy, top(b)), 0.024, M["gate"], seg=8)
        Gt.box(l0 + 0.03, l1 - 0.03, gy - 0.02, gy + 0.02, 0.08, SOLID, M["gate"], 0.01)
        Gt.box(l0, l0 + 0.06, gy - 0.035, gy + 0.035, 0.05, top(l0), M["gate"])
        Gt.box(l1 - 0.06, l1, gy - 0.035, gy + 0.035, 0.05, top(l1), M["gate"])
        Gt.box(l0, l1, gy - 0.035, gy + 0.035, SOLID - 0.04, SOLID + 0.03, M["gate"])
        Gt.box(l0, l1, gy - 0.035, gy + 0.035, 0.05, 0.12, M["gate"])
        for yy in (gy - 0.03, gy + 0.03):           # X braces on both faces
            Gt.cyl((l0 + 0.09, yy, 0.62), (l1 - 0.09, yy, SOLID - 0.1), 0.018, M["gate"], seg=6)
            Gt.cyl((l0 + 0.09, yy, SOLID - 0.1), (l1 - 0.09, yy, 0.62), 0.018, M["gate"], seg=6)
        for row in range(2):                       # band of small openings near the bottom
            zr, x = 0.2 + row * 0.15, l0 + 0.1 + (0.075 if row else 0.0)
            while x + 0.11 < l1 - 0.08:
                Gt.box(x, x + 0.11, gy - 0.026, gy + 0.026, zr, zr + 0.09, M["gate_light"])
                x += 0.15
        x = l0 + 0.12
        while x < l1 - 0.07:
            Gt.cyl((x, gy, SOLID + 0.03), (x, gy, top(x)), 0.012, M["gate"], seg=6)
            x += 0.14
        for cxs in (l0 + (l1 - l0) * 0.3, l0 + (l1 - l0) * 0.7):     # curls
            zc, r, n = SOLID + 0.22, 0.1, 12
            pts = [(cxs + r * math.cos(2 * math.pi * i / n), gy, zc + r * math.sin(2 * math.pi * i / n))
                   for i in range(n + 1)]
            for a, b in zip(pts[:-1], pts[1:]):
                Gt.cyl(a, b, 0.012, M["gate"], seg=5)

    # ---- grey corner pillar, then the white/pink fence + blue gate along the lane ----
    Fn = Part("Fence_Blue_Gate", C_SITE)
    fx0, fx1 = X_SIDE_WALL, X_SIDE_WALL + 0.23
    fxc = (fx0 + fx1) / 2

    def SB(a0, a1, b0, b1, za, zb, m, bev=0.0):    # a runs along the lane (Y), b across (X)
        Fn.box(b0, b1, a0, a1, za, zb, m, bev)

    Fn.box(X_SIDE_WALL - 0.2, X_SIDE_WALL + 0.28, y0 - 0.05, y1 + 0.17, 0, 2.25, M["concrete"], 0.02)
    g0, g1 = 7.75, 10.35                           # blue gate, opposite the side door
    gm = (g0 + g1) / 2
    for a, b in ((y1 + 0.17, g0 - 0.2), (g1 + 0.2, Y_BACK)):
        SB(a, b, fx0, fx1, 0, 0.6, M["white"], 0.02)
        SB(a - 0.02, b + 0.02, fx0 - 0.03, fx1 + 0.03, 0.6, 0.68, M["pink"], 0.015)
        SB(a, b, fx0 + 0.07, fx1 - 0.07, 1.68, 1.76, M["white"], 0.01)
        y = a
        while y < b - 0.05:
            SB(y, y + 0.1, fx0 + 0.05, fx1 - 0.05, 0.68, 1.8, M["white"], 0.015)
            for k in (0.12, 0.24):
                if y + k + 0.07 < b:
                    SB(y + k, y + k + 0.06, fx0 + 0.08, fx1 - 0.08, 0.72, 1.66, M["pink"], 0.01)
            y += 0.38
    for a, b in ((g0 - 0.2, g0), (g1, g1 + 0.2)):
        SB(a, b, fx0 - 0.02, fx1 + 0.02, 0, 1.95, M["white"], 0.02)
    for l0, l1 in ((g0, gm), (gm, g1)):
        SB(l0 + 0.02, l1 - 0.02, fx0 + 0.09, fx1 - 0.09, 0.08, 1.1, M["blue"], 0.01)
        SB(l0 + 0.02, l1 - 0.02, fx0 + 0.08, fx1 - 0.08, 1.7, 1.76, M["blue"])
        y = l0 + 0.1
        while y < l1 - 0.05:
            Fn.cyl((fxc, y, 1.1), (fxc, y, 1.7), 0.012, M["blue"], seg=6)
            y += 0.12

    # ---- plants, scooter, backyard things ----
    T = Part("Trees_Plants", C_SITE)
    debdaru(T, X_LEFT_WALL + 0.8, Y_WALL + 0.9, 7.8)
    bush(T, X_LEFT_WALL + 1.6, Y_WALL + 0.75, 0.7)
    for x, s, kind, pot in ((-7.0, 1.0, "leafy", "terracotta"), (-6.4, 0.8, "snake", "pot_w"),
                            (-5.85, 1.1, "leafy", "pot_w"), (-5.35, 0.75, "round", "terracotta")):
        potted_plant(T, x, Y_WALL + 0.55, 0.0, s, pot, kind)
    for y, s, kind in ((-0.8, 0.9, "leafy"), (0.2, 0.8, "round"), (1.2, 1.0, "snake")):
        potted_plant(T, X_LEFT_WALL + 0.35, y, 0.0, s, "terracotta", kind)
    bucket(T, -6.65, Y_WALL + 0.55, M["bucket_w"], 0.8)
    potted_plant(T, X_SIDE_WALL - 0.4, -2.3, 0.0, 0.9, "terracotta", "leafy")
    round_tree(T, X_SIDE_WALL + 6.9, 13.0, 4.8, 1.7)
    bush(T, X_SIDE_WALL + 6.0, 11.6, 0.8)

    Sc = Part("Scooter", C_SITE)
    covered_scooter(Sc, -3.4, -0.85)

    By = Part("Backyard", C_SITE)
    bx0, bx1 = X_LEFT_WALL, X_LEFT_WALL + 1.4                 # raised garden bed along the brick wall
    by0, by1 = CHECKER_Y + 0.8, Y_BACK
    By.box(bx1 - 0.12, bx1, by0, by1, 0, 0.32, M["border"], 0.02)
    By.box(bx0, bx1, by0, by0 + 0.12, 0, 0.32, M["border"], 0.02)
    By.box(bx0, bx1 - 0.12, by0 + 0.12, by1, 0, 0.27, M["soil"])
    y = by0 + 0.8
    i = 0
    while y < by1 - 0.4:
        bush(By, bx0 + 0.65, y, 0.75 + 0.25 * ((i * 7) % 3) / 2, z=0.2)
        y += 1.45
        i += 1
    round_tree(By, bx0 + 0.7, by1 - 2.2, 3.4, 1.1)
    swing(By, X_LEFT_WALL + 2.75, Y_BACK - 1.05)
    plastic_chair(By, X_LEFT_WALL + 3.1, D_HOUSE + 1.2)
    bucket(By, bx1 + 0.35, by0 + 0.4, M["bucket_w"])
    bucket(By, bx1 + 0.75, by0 + 0.25, M["bucket_r"], 0.8)

    # ---- neighbourhood ----
    N = Part("Neighbours", C_SITE)
    xl = X_SIDE_WALL + 5.6                        # across the side lane
    for (a, b, c, d, h, m) in ((-20.0, X_LEFT_WALL - 0.6, 0.8, 12.5, 7.4, "brick"),
                               (xl, xl + 7.5, 0.5, 11.0, 8.8, "nb2"),
                               (X_LEFT_WALL, X_SIDE_WALL, Y_BACK + 1.0, Y_BACK + 8.0, 3.2, "nb3"),
                               (xl, xl + 7.0, 12.5, 22.0, 6.0, "nb1"),
                               (-31, -21.0, 2.0, 12.0, 5.6, "nb2")):
        N.box(a, b, c, d, 0, h, M[m], 0.05)
        N.box(a, b, c, c + 0.15, h, h + 0.9, M[m], 0.03)
        for i in range(int((b - a) // 2.4)):
            u = a + 1.0 + i * 2.4
            for zz in (1.1, 4.3) if h > 6 else (1.1,):
                N.box(u, u + 0.9, c - 0.04, c + 0.01, zz, zz + 1.3, M["glass"])
    # the girls' inter college across the street, with its blue signboard facing the house
    Co = Part("College_Across", C_SITE)
    cy = -18.0                                      # its front face (kept clear of the game camera)
    Co.box(-17.0, 1.5, cy - 8.5, cy, 0, 9.0, M["college"], 0.05)
    Co.box(-17.0, 1.5, cy - 0.15, cy, 9.0, 9.9, M["college"], 0.03)
    for i in range(7):
        u = -16.0 + i * 2.5
        for zz in (1.2, 4.8):
            Co.box(u, u + 1.1, cy - 0.02, cy + 0.06, zz, zz + 1.5, M["wood_d"])
    Co.box(-13.5, -3.5, cy, cy + 0.14, 3.1, 4.1, M["sign"], 0.02)
    for i in range(9):                              # stylised lettering
        u = -12.9 + i * 1.0
        Co.box(u, u + 0.7, cy + 0.13, cy + 0.17, 3.45, 3.75, M["sign_text"])


# ------------------------------------------------------------------ festive decor (Bhai Phota)
def string_of(P, a, b, sag, spacing, r, mats, wire=True, sub=1):
    a, b = Vector(a), Vector(b)
    n = max(1, int((b - a).length / spacing))
    prev = None
    for i in range(n + 1):
        t = i / n
        p = a.lerp(b, t)
        p.z -= sag * math.sin(math.pi * t)
        if wire and prev is not None:
            P.cyl(prev, p, 0.004, M["grille"], seg=4)
        P.sphere(p, r, mats[i % len(mats)], sub=sub, smooth=True)
        prev = p


def string_path(P, path, z, span, sag, spacing, r, mats, wire=True):
    for a, b in zip(path[:-1], path[1:]):
        a, b = Vector((a[0], a[1], z)), Vector((b[0], b[1], z))
        n = max(1, round((b - a).length / span))
        for i in range(n):
            string_of(P, a.lerp(b, i / n), a.lerp(b, (i + 1) / n), sag, spacing, r, mats, wire)


def diya(P, x, y, z):
    P.cyl((x, y, z), (x, y, z + 0.05), 0.04, M["clay"], seg=10, r2=0.075)
    P.sphere((x, y, z + 0.09), 0.022, M["flame"], sub=1, scale=(1, 1, 1.9), smooth=True)


def build_decor():
    fairy = [M["fairy_w"], M["fairy_w"], M["fairy_p"], M["fairy_w"], M["fairy_b"]]
    orange = [M["marigold"], M["marigold"], M["marigold_y"]]
    bx0, bxo, byo, byb = -0.3, X_SIDE + BAL_P, -BAL_P, LAV_D
    cxo, cz = X_SIDE + CROWN_P, ROOF + 1.37

    Fl = Part("Fairy_Lights", C_DECOR)
    string_path(Fl, [(bx0 + 0.03, -0.02), (bx0 + 0.03, byo + 0.03), (bxo - 0.03, byo + 0.03),
                     (bxo - 0.03, byb - 0.03), (X_SIDE + 0.02, byb - 0.03)],
                FF0 + 1.05, 1.25, 0.1, 0.17, 0.026, fairy)
    string_path(Fl, [(-0.4, -CROWN_P - 0.06), (cxo + 0.06, -CROWN_P - 0.06), (cxo + 0.06, LAV_D)],
                cz, 1.7, 0.16, 0.18, 0.028, fairy)
    for i in range(10):                            # hanging strands under the crown
        x = -0.25 + (cxo - 0.15) * i / 9
        string_of(Fl, (x, -CROWN_P - 0.08, FF_TOP - 0.02),
                  (x, -CROWN_P - 0.08, FF_TOP - 0.37 - 0.25 * (i % 2)), 0.0, 0.14, 0.022, fairy)
    for i, y in enumerate((-0.4, 0.9, 2.2)):
        string_of(Fl, (cxo + 0.08, y, FF_TOP - 0.02), (cxo + 0.08, y, FF_TOP - 0.37 - 0.25 * (i % 2)),
                  0.0, 0.14, 0.022, fairy)

    Mg = Part("Marigold_Garlands", C_DECOR)
    gy, gz = Y_WALL - 0.16, 2.5
    pl, pr = GATE_X0 - 0.2, GATE_X1 + 0.2
    string_of(Mg, (pl, gy, gz), (pr, gy, gz), 0.5, 0.065, 0.048, orange, wire=False)
    for x in (pl, pr):
        string_of(Mg, (x, gy, gz), (x, gy, gz - 0.75), 0.0, 0.065, 0.045, orange, wire=False)
    string_of(Mg, (-1.95, -0.13, PLINTH + 2.55), (-0.45, -0.13, PLINTH + 2.55), 0.12, 0.06, 0.04, orange, wire=False)
    for i in range(7):                             # toran over the main door
        x = -1.85 + 1.3 * i / 6
        zz = PLINTH + 2.53 - 0.12 * math.sin(math.pi * i / 6)
        Mg.sphere((x, -0.15, zz - 0.12), 0.06, M["leaf"], sub=1, scale=(0.45, 0.2, 1.3), smooth=True)
    string_path(Mg, [(bx0, byo - 0.05), (bxo + 0.05, byo - 0.05), (bxo + 0.05, byb)],
                FF0 + 0.03, 1.6, 0.25, 0.07, 0.045, orange, wire=False)

    Dy = Part("Diyas", C_DECOR)
    ytop = Y_WALL + 0.115
    for x in (X_LEFT_WALL + 0.5, X_LEFT_WALL + 1.6, X_LEFT_WALL + 2.7, X_LEFT_WALL + 3.8):
        diya(Dy, x, ytop, 1.95 + 0.07)
    for i in range(6):
        diya(Dy, GATE_X1 + 0.75 + 0.55 * i, ytop, 1.95 + 0.07)
    for x in (pl, pr):
        diya(Dy, x, ytop, 2.55)
    for x in (-2.1, -0.3):
        diya(Dy, x, -0.8, 0.15)

    Al = Part("Alpona", C_DECOR)                   # white rice-paste art outside the gate
    cx, cy, z0, z1 = (GATE_X0 + GATE_X1) / 2, -4.75, -0.02, -0.012
    Al.ring_xy((cx, cy), 1.05, 0.98, z0, z1, M["alpona"], 56)
    Al.ring_xy((cx, cy), 0.55, 0.5, z0, z1, M["alpona"], 40)
    Al.ring_xy((cx, cy), 0.2, 0.15, z0, z1 + 0.002, M["alpona"], 24)
    Al.cyl((cx, cy, z0), (cx, cy, z1 + 0.003), 0.12, M["sindoor"], seg=20)
    for i in range(8):
        a = 2 * math.pi * i / 8
        Al.sphere((cx + 0.78 * math.cos(a), cy + 0.78 * math.sin(a), z0 + 0.004), 0.2, M["alpona"],
                  sub=2, scale=(1.0, 0.42, 0.04), rotz=a, smooth=True)
        Al.sphere((cx + 0.36 * math.cos(a + 0.39), cy + 0.36 * math.sin(a + 0.39), z0 + 0.004), 0.09,
                  M["alpona"], sub=2, scale=(1.0, 0.5, 0.04), rotz=a + 0.39, smooth=True)
    for i in range(24):
        a = 2 * math.pi * i / 24
        Al.cyl((cx + 1.17 * math.cos(a), cy + 1.17 * math.sin(a), z0),
               (cx + 1.17 * math.cos(a), cy + 1.17 * math.sin(a), z1 + 0.002), 0.035, M["alpona"], seg=10)


# ------------------------------------------------------------------ lights, cameras, render
def set_world(hexcol, strength):
    w = SCENE.world or bpy.data.worlds.new("World")
    SCENE.world = w
    try:
        w.use_nodes = True
    except Exception:
        pass
    bg = w.node_tree.nodes.get("Background")
    bg.inputs[0].default_value = srgb(hexcol)
    bg.inputs[1].default_value = strength


def add_sun(energy, color, direction, angle_deg=3.0):
    ld = bpy.data.lights.new("Sun", "SUN")
    ld.energy, ld.color, ld.angle = energy, color, math.radians(angle_deg)
    ob = bpy.data.objects.new("Sun", ld)
    C_RIG.objects.link(ob)
    ob.rotation_euler = Vector(direction).normalized().to_track_quat("-Z", "Y").to_euler()
    return ob


def add_point(name, loc, energy, color=(1.0, 0.78, 0.45), radius=0.15):
    ld = bpy.data.lights.new(name, "POINT")
    ld.energy, ld.color = energy, color
    try:
        ld.shadow_soft_size = radius
    except Exception:
        pass
    ob = bpy.data.objects.new(name, ld)
    C_RIG.objects.link(ob)
    ob.location = loc
    return ob


def add_cam(name, loc, target, lens):
    cam = bpy.data.cameras.new(name)
    cam.lens, cam.clip_end = lens, 400
    ob = bpy.data.objects.new(name, cam)
    C_RIG.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return ob


def setup_render():
    r = SCENE.render
    for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            r.engine = eng
            break
        except TypeError:
            continue
    for attr, val in (("taa_render_samples", 48), ("use_raytracing", True), ("use_shadows", True)):
        try:
            setattr(SCENE.eevee, attr, val)
        except Exception:
            pass
    try:
        SCENE.view_settings.view_transform = "AgX"
    except Exception:
        pass
    for look in ("AgX - Punchy", "Punchy", "AgX - Medium High Contrast"):
        try:
            SCENE.view_settings.look = look
            break
        except TypeError:
            continue
    r.image_settings.file_format = "PNG"
    r.resolution_percentage = 100


def render(cam, name, res):
    SCENE.camera = cam
    SCENE.render.resolution_x, SCENE.render.resolution_y = res
    SCENE.render.filepath = os.path.join(RENDER_DIR, f"{name}_{RENDER_TAG}.png")
    bpy.ops.render.render(write_still=True)
    print("RENDERED", SCENE.render.filepath)


def glow_mat(m, hexcol, strength):
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Emission Color"].default_value = srgb(hexcol)
    bsdf.inputs["Emission Strength"].default_value = strength


# ------------------------------------------------------------------ game layout (walkable plan)
def game_layout():
    """Blocker rectangles [x0, x1, y0, y1], spawn points and item spots, in Blender XY metres.
    The game converts them with three.x = x, three.z = -y."""
    D = D_HOUSE
    sx, sy = X_LEFT_WALL + 2.75, Y_BACK - 1.05            # swing centre (see build_site)
    gx0, gx1, gy = GATE_X0 + 0.02, GATE_X1 - 0.02, Y_WALL + 0.115
    blockers = [
        [xA0 - 0.06, xB1 + 0.06, -0.06, D + 0.06],                         # house
        [-2.25, -0.15, -0.96, 0.0],                                        # main door steps
        [-2.3, -0.7, D, D + 0.9],                                          # back door steps
        [X_SIDE, X_SIDE + 0.9, 8.3, 9.8],                                  # side door steps
        [X_LEFT_WALL - 0.23, GATE_X0 - 0.4, Y_WALL, Y_WALL + 0.23],        # front wall, left of gate
        [GATE_X0 - 0.45, GATE_X0, Y_WALL - 0.13, Y_WALL + 0.36],           # gate pillars
        [GATE_X1, GATE_X1 + 0.45, Y_WALL - 0.13, Y_WALL + 0.36],
        [GATE_X1 + 0.4, X_SIDE_WALL - 0.2, Y_WALL, Y_WALL + 0.23],         # front wall, right of gate
        [X_SIDE_WALL - 0.2, X_SIDE_WALL + 0.28, Y_WALL - 0.05, Y_WALL + 0.4],  # corner pillar
        [X_SIDE_WALL, X_SIDE_WALL + 0.23, Y_WALL, Y_BACK + 0.23],          # lane fence (blue gate shut)
        [X_LEFT_WALL - 0.23, X_LEFT_WALL, Y_WALL, Y_BACK + 0.23],          # left wall
        [X_LEFT_WALL - 0.23, X_SIDE_WALL + 0.23, Y_BACK - 0.12, Y_BACK + 0.23],  # back wall
        [X_LEFT_WALL, X_LEFT_WALL + 2.3, Y_WALL + 0.23, Y_WALL + 1.6],     # debdaru + bush corner
        [-7.35, -5.0, Y_WALL + 0.23, Y_WALL + 0.9],                        # pots along the front wall
        [X_LEFT_WALL, X_LEFT_WALL + 0.75, -1.2, 1.6],                      # pots along the left wall
        [X_SIDE_WALL - 0.75, X_SIDE_WALL, -2.65, -1.95],                   # pot by the corner pillar
        [-4.25, -2.5, -1.3, -0.4],                                         # scooter
        [X_LEFT_WALL, X_LEFT_WALL + 1.4, CHECKER_Y + 0.8, Y_BACK],         # garden bed
        [X_LEFT_WALL + 1.4, X_LEFT_WALL + 2.4, CHECKER_Y + 0.8, CHECKER_Y + 1.5],  # buckets
        [sx - 1.1, sx + 1.1, sy - 0.75, sy + 0.75],                        # swing
        [X_LEFT_WALL + 2.8, X_LEFT_WALL + 3.4, D + 0.9, D + 1.5],          # plastic chair
        [xA0 - 0.9, xA0, 10.05, 11.7],                                     # hose + bucket
        [-20.0, X_LEFT_WALL - 0.6, 0.8, 12.5],                             # neighbour on the left
    ]
    return {
        "blockers": [[round(v, 3) for v in b] for b in blockers],
        "bounds": [-16.0, 13.8, -8.0, Y_BACK + 0.23],
        "gate": {"hingeL": [gx0, gy], "hingeR": [gx1, gy], "center": [(gx0 + gx1) / 2, gy],
                 "blocker": [GATE_X0, GATE_X1, Y_WALL, Y_WALL + 0.23]},
        "swing": [sx, sy, 0.64],
        "doorHinge": [-1.75, 0.0],                     # main door leaf hinge (opens inwards)
        "maaDoor": [-1.2, -0.16, PLINTH],              # Maa waits in the open doorway, on the top step
        "didi": [sx + 1.5, sy - 1.0],
        "start": [(GATE_X0 + GATE_X1) / 2, -6.3],
        "items": [
            {"id": "chandan", "x": 3.0, "y": -1.7},
            {"id": "diya", "x": 7.4, "y": 5.0},
            {"id": "mishti", "x": 1.8, "y": 13.9},
            {"id": "dhaan_durbo", "x": -7.0, "y": 8.6},
            {"id": "kajal", "x": -6.0, "y": 0.6},
        ],
    }


# ------------------------------------------------------------------ main
build_house()
build_site()
build_decor()
objs = [p.build() for p in PARTS]
tris = sum(sum(len(poly.vertices) - 2 for poly in o.data.polygons) for o in objs if o)
print(f"BUILT {len([o for o in objs if o])} objects, ~{tris} triangles")

set_world("#B3D3F7", 1.15)
SUN = add_sun(4.3, (1.0, 0.95, 0.87), (0.38, 0.8, -0.55))
setup_render()
CAMS = {   # name: (location, target, lens, resolution)
    "house_view_photo1": ((6.9, -5.6, 2.3), (3.0, 0.5, 6.2), 15, (900, 900)),
    "house_view_photo2": ((11.5, -12.0, 2.4), (4.0, 2.0, 4.6), 20, (1050, 900)),
    "house_hero_day":    ((18.0, -18.0, 11.0), (-0.5, 3.5, 2.0), 24, (1400, 1000)),
    "house_backyard":    ((-3.0, 29.0, 20.0), (-2.5, 11.5, 0.0), 28, (1400, 1000)),
    "house_cctv_gate":   ((0.3, -0.35, 2.9), (-4.3, -3.0, 0.6), 12, (1170, 660)),
    "house_cctv_back":   ((xA0 - 0.15, 9.7, 3.0), (-7.0, 16.5, 0.4), 12, (1170, 660)),
}
cams = {k: add_cam("Cam_" + k, *v[:3]) for k, v in CAMS.items()}

os.makedirs(os.path.dirname(BLEND_OUT), exist_ok=True)
os.makedirs(RENDER_DIR, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT)
print("SAVED", BLEND_OUT)

if DO_EXPORT:
    os.makedirs(os.path.dirname(GLB_OUT), exist_ok=True)
    for o in SCENE.objects:
        o.select_set(o.type == "MESH")
    bpy.ops.export_scene.gltf(filepath=GLB_OUT, export_format="GLB", use_selection=True, export_apply=True)
    print("EXPORTED", GLB_OUT)
    import json
    with open(os.path.join(os.path.dirname(GLB_OUT), "layout.json"), "w", encoding="utf-8") as f:
        json.dump(game_layout(), f, indent=1)
    print("WROTE layout.json")

if DO_RENDER:
    for k, v in CAMS.items():
        render(cams[k], k, v[3])

if DO_DUSK:
    set_world("#2C2A5C", 0.6)
    SUN.data.energy, SUN.data.color = 0.5, (1.0, 0.62, 0.42)
    glow_mat(M["glass"], "#FFC46B", 1.6)
    for k in ("fairy_w", "fairy_p", "fairy_b"):
        M[k].node_tree.nodes.get("Principled BSDF").inputs["Emission Strength"].default_value = 18.0
    add_point("Porch", (-1.2, -0.7, 2.95), 60)
    add_point("UnderBalcony", (2.9, -0.7, 3.0), 120)
    add_point("UnderBalconySide", (6.7, 1.4, 3.0), 60)
    add_point("UnderCrown", (3.0, -0.8, FF_TOP - 0.5), 120, (1.0, 0.85, 0.6))
    add_point("GateL", (GATE_X0 - 0.2, -3.6, 2.7), 25)
    add_point("GateR", (GATE_X1 + 0.2, -3.6, 2.7), 25)
    add_point("SideDoor", (X_SIDE + 0.7, 9.05, 2.7), 40)
    add_point("Backyard", (-5.5, 13.5, 3.0), 80)
    render(cams["house_hero_day"], "house_hero_dusk", (1400, 1000))
