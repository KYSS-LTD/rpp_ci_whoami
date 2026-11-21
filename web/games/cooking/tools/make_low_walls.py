"""Делает низкие версии стены и проёма из высоких моделей KayKit: срез по плоскости y = CUT_Y, верхняя (бежевая) часть удаляется.

Запуск: python tools/make_low_walls.py (из папки games/cooking). Читает public/models/wall*.gltf, пишет wall_low*.gltf и wall_doorway_low*.gltf.
Срез идёт по острию канавки (y = 2.0): остаются бирюзовая нижняя часть и светлая фаска, сверху ставится плоская крышка того же цвета.
"""
import json
import os
import struct

MODELS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "models")
CUT_Y = 2.0
EPS = 1e-4
# Точка текстуры с цветом светлой бирюзовой фаски: крышка среза берёт цвет оттуда.
CAP_UV = (0.327, 0.3365)


def load(name):
    gltf = json.load(open(os.path.join(MODELS, name + ".gltf"), encoding="utf-8"))
    blob = open(os.path.join(MODELS, name + ".bin"), "rb").read()

    def read(index, fmt):
        accessor = gltf["accessors"][index]
        view = gltf["bufferViews"][accessor["bufferView"]]
        offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        size = struct.calcsize(fmt)
        return [struct.unpack_from(fmt, blob, offset + i * size) for i in range(accessor["count"])]

    prim = gltf["meshes"][0]["primitives"][0]
    attrs = prim["attributes"]
    positions = read(attrs["POSITION"], "<3f")
    uvs = read(attrs["TEXCOORD_0"], "<2f")
    normals = read(attrs["NORMAL"], "<3f")
    indices = [i[0] for i in read(prim["indices"], "<H")]
    return gltf, positions, uvs, normals, indices


def lerp(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def clip_below(vertices, triangles):
    """Режет треугольники плоскостью y = CUT_Y, оставляя то, что ниже. vertices: список (pos, uv, normal)."""
    out_vertices = []
    out_triangles = []

    def add(vertex):
        out_vertices.append(vertex)
        return len(out_vertices) - 1

    for tri in triangles:
        ys = [vertices[i][0][1] for i in tri]
        if max(ys) <= CUT_Y + EPS:
            out_triangles.append([add(vertices[i]) for i in tri])
            continue
        if min(ys) >= CUT_Y - EPS:
            continue
        # Треугольник пересекает плоскость: режем многоугольник, затем веер.
        polygon = []
        for k in range(3):
            a, b = vertices[tri[k]], vertices[tri[(k + 1) % 3]]
            ya, yb = a[0][1], b[0][1]
            if ya <= CUT_Y + EPS:
                polygon.append(a)
            if (ya - CUT_Y) * (yb - CUT_Y) < 0 and abs(ya - CUT_Y) > EPS and abs(yb - CUT_Y) > EPS:
                t = (CUT_Y - ya) / (yb - ya)
                polygon.append((lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)))
        ids = [add(v) for v in polygon]
        for k in range(1, len(ids) - 1):
            out_triangles.append([ids[0], ids[k], ids[k + 1]])
    return out_vertices, out_triangles


def convex_hull(points):
    pts = sorted(set(points))
    if len(pts) < 3:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower = []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 1e-9:
            lower.pop()
        lower.append(p)
    upper = []
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 1e-9:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def add_caps(vertices, triangles):
    """Крышка на срезе: меш делится на связные куски (по совпадающим позициям), у каждого куска выпуклая оболочка точек среза."""
    parent = {}

    def key(v):
        return tuple(round(c, 4) for c in v[0])

    def find(k):
        parent.setdefault(k, k)
        while parent[k] != k:
            parent[k] = parent[parent[k]]
            k = parent[k]
        return k

    for tri in triangles:
        keys = [key(vertices[i]) for i in tri]
        for k in keys[1:]:
            parent[find(k)] = find(keys[0])
    groups = {}
    for v in vertices:
        if abs(v[0][1] - CUT_Y) < EPS:
            groups.setdefault(find(key(v)), set()).add((round(v[0][0], 4), round(v[0][2], 4)))
    print("  cap groups:", len(groups))
    for group in groups.values():
        hull = convex_hull(list(group))
        if len(hull) < 3:
            continue
        ids = []
        for x, z in hull:
            vertices.append(((x, CUT_Y, z), CAP_UV, (0.0, 1.0, 0.0)))
            ids.append(len(vertices) - 1)
        for k in range(1, len(ids) - 1):
            a, b, c = (vertices[ids[0]][0], vertices[ids[k]][0], vertices[ids[k + 1]][0])
            # Нормаль крышки смотрит вверх (+y): порядок обхода выбирается по знаку.
            cross_y = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2])
            if cross_y >= 0:
                triangles.append([ids[0], ids[k], ids[k + 1]])
            else:
                triangles.append([ids[0], ids[k + 1], ids[k]])


def write(source_name, target_name):
    gltf, positions, uvs, normals, indices = load(source_name)
    vertices = [(positions[i], uvs[i], normals[i]) for i in range(len(positions))]
    triangles = [indices[i : i + 3] for i in range(0, len(indices), 3)]
    vertices, triangles = clip_below(vertices, triangles)
    add_caps(vertices, triangles)

    pos_blob = b"".join(struct.pack("<3f", *v[0]) for v in vertices)
    uv_blob = b"".join(struct.pack("<2f", *v[1]) for v in vertices)
    nor_blob = b"".join(struct.pack("<3f", *v[2]) for v in vertices)
    idx_blob = b"".join(struct.pack("<H", i) for tri in triangles for i in tri)
    idx_len = len(idx_blob)
    idx_blob += b"\x00" * (-idx_len % 4)
    blob = pos_blob + uv_blob + nor_blob + idx_blob

    mins = [min(v[0][k] for v in vertices) for k in range(3)]
    maxs = [max(v[0][k] for v in vertices) for k in range(3)]
    count = len(vertices)
    index_count = len(triangles) * 3
    gltf["nodes"][0]["name"] = target_name
    gltf["meshes"][0]["name"] = target_name
    gltf["buffers"] = [{"byteLength": len(blob), "uri": target_name + ".bin"}]
    gltf["bufferViews"] = [
        {"buffer": 0, "byteOffset": 0, "byteLength": len(pos_blob), "target": 34962},
        {"buffer": 0, "byteOffset": len(pos_blob), "byteLength": len(uv_blob), "target": 34962},
        {"buffer": 0, "byteOffset": len(pos_blob) + len(uv_blob), "byteLength": len(nor_blob), "target": 34962},
        {"buffer": 0, "byteOffset": len(pos_blob) + len(uv_blob) + len(nor_blob), "byteLength": idx_len, "target": 34963},
    ]
    gltf["accessors"] = [
        {"bufferView": 0, "componentType": 5126, "count": count, "type": "VEC3", "min": mins, "max": maxs},
        {"bufferView": 1, "componentType": 5126, "count": count, "type": "VEC2"},
        {"bufferView": 2, "componentType": 5126, "count": count, "type": "VEC3"},
        {"bufferView": 3, "componentType": 5123, "count": index_count, "type": "SCALAR"},
    ]
    with open(os.path.join(MODELS, target_name + ".gltf"), "w", encoding="utf-8") as fh:
        json.dump(gltf, fh, indent=2)
    with open(os.path.join(MODELS, target_name + ".bin"), "wb") as fh:
        fh.write(blob)
    print(target_name, "verts", count, "tris", len(triangles), "bbox", [round(x, 3) for x in mins], [round(x, 3) for x in maxs])


if __name__ == "__main__":
    write("wall", "wall_low")
    write("wall_doorway", "wall_doorway_low")
