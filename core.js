// Pure geometry code (no browser APIs except TextDecoder) so it can be unit-tested in Node.
// Triangles are stored "soup" style: Float32Array of 9 numbers per triangle (x1 y1 z1 x2 y2 z2 x3 y3 z3).

export function parseSTL(buffer) {
  if (buffer.byteLength >= 84) {
    const dv = new DataView(buffer);
    const n = dv.getUint32(80, true);
    if (buffer.byteLength === 84 + 50 * n) {            // binary STL size signature
      const pos = new Float32Array(9 * n);
      for (let i = 0; i < n; i++) {
        const o = 84 + 50 * i + 12;                       // skip the 12-byte stored normal
        for (let k = 0; k < 9; k++) pos[9 * i + k] = dv.getFloat32(o + 4 * k, true);
      }
      return { pos, count: n };
    }
  }
  const text = new TextDecoder().decode(buffer);          // otherwise try ASCII STL
  const re = /vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g;
  const vals = [];
  let m;
  while ((m = re.exec(text)) !== null) vals.push(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
  if (vals.length === 0 || vals.length % 9 !== 0) throw new Error("This does not look like a valid STL file.");
  return { pos: Float32Array.from(vals), count: vals.length / 9 };
}

export function bounds(pos) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3)
    for (let d = 0; d < 3; d++) {
      const v = pos[i + d];
      if (v < lo[d]) lo[d] = v;
      if (v > hi[d]) hi[d] = v;
    }
  return { lo, hi, diag: Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) };
}

// Squared distance from point p to triangle abc (Ericson, Real-Time Collision Detection, 5.1.5).
export function distSqPointTri(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return apx * apx + apy * apy + apz * apz;
  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return bpx * bpx + bpy * bpy + bpz * bpz;
  const vc = d1 * d4 - d3 * d2;
  let qx, qy, qz;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    qx = ax + v * abx; qy = ay + v * aby; qz = az + v * abz;
  } else {
    const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
    const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
    if (d6 >= 0 && d5 <= d6) return cpx * cpx + cpy * cpy + cpz * cpz;
    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) {
      const w = d2 / (d2 - d6);
      qx = ax + w * acx; qy = ay + w * acy; qz = az + w * acz;
    } else {
      const va = d3 * d6 - d5 * d4;
      if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
        const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
        qx = bx + w * (cx - bx); qy = by + w * (cy - by); qz = bz + w * (cz - bz);
      } else {
        const denom = 1 / (va + vb + vc);
        const v = vb * denom, w = vc * denom;
        qx = ax + abx * v + acx * w; qy = ay + aby * v + acy * w; qz = az + abz * v + acz * w;
      }
    }
  }
  const dx = px - qx, dy = py - qy, dz = pz - qz;
  return dx * dx + dy * dy + dz * dz;
}

// Spatial grid over the TARGET triangles. Each triangle is registered in every cell its bounding box,
// grown by tol, touches, so the single cell containing a query point holds every triangle within tol.
function buildGrid(pos, lo, cell, tol) {
  const n = pos.length / 9;
  const grid = new Map();
  const idx = (v, d) => Math.floor((v - lo[d]) / cell);
  for (let t = 0; t < n; t++) {
    const o = 9 * t;
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < 3; k++)
      for (let d = 0; d < 3; d++) {
        const v = pos[o + 3 * k + d];
        if (v < mn[d]) mn[d] = v;
        if (v > mx[d]) mx[d] = v;
      }
    const i0 = idx(mn[0] - tol, 0), i1 = idx(mx[0] + tol, 0);
    const j0 = idx(mn[1] - tol, 1), j1 = idx(mx[1] + tol, 1);
    const k0 = idx(mn[2] - tol, 2), k1 = idx(mx[2] + tol, 2);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++)
        for (let k = k0; k <= k1; k++) {
          const key = i + "," + j + "," + k;
          let a = grid.get(key);
          if (!a) { a = []; grid.set(key, a); }
          a.push(t);
        }
  }
  return grid;
}

/**
 * Subtraction: returns Uint8Array (1 = support) with one flag per triangle of the with-supports mesh.
 * A triangle is PART if its 3 vertices, 3 edge midpoints and centroid all lie within `tol` of the target
 * surface; otherwise it is SUPPORT. Both files must share one coordinate frame. Works even when the part
 * surface is re-meshed in the with-supports file; does not need watertight meshes.
 */
export function classifySupports(targetPos, withPos, tol) {
  const tb = bounds(targetPos);
  const cell = Math.max(2 * tol, tb.diag / 48);
  const grid = buildGrid(targetPos, tb.lo, cell, tol);
  const tol2 = tol * tol;
  const nW = withPos.length / 9;
  const mask = new Uint8Array(nW);
  const near = (x, y, z) => {
    const key = Math.floor((x - tb.lo[0]) / cell) + "," + Math.floor((y - tb.lo[1]) / cell) + "," + Math.floor((z - tb.lo[2]) / cell);
    const cand = grid.get(key);
    if (!cand) return false;
    for (let c = 0; c < cand.length; c++) {
      const o = 9 * cand[c];
      if (distSqPointTri(x, y, z, targetPos[o], targetPos[o + 1], targetPos[o + 2],
          targetPos[o + 3], targetPos[o + 4], targetPos[o + 5],
          targetPos[o + 6], targetPos[o + 7], targetPos[o + 8]) <= tol2) return true;
    }
    return false;
  };
  for (let t = 0; t < nW; t++) {
    const o = 9 * t;
    const ax = withPos[o], ay = withPos[o + 1], az = withPos[o + 2];
    const bx = withPos[o + 3], by = withPos[o + 4], bz = withPos[o + 5];
    const cx = withPos[o + 6], cy = withPos[o + 7], cz = withPos[o + 8];
    const part =
      near(ax, ay, az) && near(bx, by, bz) && near(cx, cy, cz) &&
      near((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2) &&
      near((bx + cx) / 2, (by + cy) / 2, (bz + cz) / 2) &&
      near((cx + ax) / 2, (cy + ay) / 2, (cz + az) / 2) &&
      near((ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3);
    mask[t] = part ? 0 : 1;
  }
  return mask;
}

export function splitByMask(pos, mask) {
  let ns = 0;
  for (let i = 0; i < mask.length; i++) ns += mask[i];
  const part = new Float32Array(9 * (mask.length - ns)), sup = new Float32Array(9 * ns);
  let pi = 0, si = 0;
  for (let t = 0; t < mask.length; t++) {
    const src = pos.subarray(9 * t, 9 * t + 9);
    if (mask[t]) { sup.set(src, si); si += 9; } else { part.set(src, pi); pi += 9; }
  }
  return { part, support: sup };
}

// Number of separate supports = groups of support triangles that share a vertex.
export function countRegions(supportPos) {
  const n = supportPos.length / 9;
  const ids = new Map(), parent = [];
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const vid = (x, y, z) => {
    const k = Math.round(x * 1e3) + "," + Math.round(y * 1e3) + "," + Math.round(z * 1e3);
    let v = ids.get(k);
    if (v === undefined) { v = parent.length; parent.push(v); ids.set(k, v); }
    return v;
  };
  for (let t = 0; t < n; t++) {
    const o = 9 * t;
    const a = vid(supportPos[o], supportPos[o + 1], supportPos[o + 2]);
    const b = vid(supportPos[o + 3], supportPos[o + 4], supportPos[o + 5]);
    const c = vid(supportPos[o + 6], supportPos[o + 7], supportPos[o + 8]);
    parent[find(b)] = find(a);
    parent[find(c)] = find(a);
  }
  const roots = new Set();
  for (let i = 0; i < parent.length; i++) roots.add(find(i));
  return roots.size;
}

// Returns a warning string if the target does not sit inside the with-supports bounding box.
export function frameWarning(targetPos, withPos) {
  const t = bounds(targetPos), w = bounds(withPos), m = 0.02 * w.diag;
  for (let d = 0; d < 3; d++)
    if (t.lo[d] < w.lo[d] - m || t.hi[d] > w.hi[d] + m)
      return "The first STL does not fit inside the second one's bounding box. The files probably do not share the same position, orientation or units.";
  return null;
}
