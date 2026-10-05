// Lógica pura del explorador (sin DOM ni three.js): mallas y selección de teselas. Se prueba en Node (test/mesh-test.js).
(function (root) {
  'use strict';
  // Ids de bloque de MoonChunkGen: 1 roca, 2 regolito, 3 basalto, 4 losa de roca, 5 losa de regolito.
  const tileOf = m => (m === 2 || m === 5) ? 0 : (m === 3 ? 2 : 1); // atlas: 0 regolito, 1 roca, 2 basalto
  const TW = 1 / 3, EPS = 0.004;

  // Malla de un chunk de 16x16 columnas con relieve "de bloques" (cara superior + paredes de 1 bloque).
  function buildChunk(tops, mats, ring) {
    const P = [], N = [], U = [], I = [];
    let v = 0;
    const quad = (a, b, c, d, n, tile, v0, v1) => {
      P.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);
      for (let k = 0; k < 4; k++) N.push(n[0], n[1], n[2]);
      const u0 = tile * TW + EPS, u1 = (tile + 1) * TW - EPS;
      U.push(u0, v0, u1, v0, u1, v1, u0, v1);
      I.push(v, v + 1, v + 2, v, v + 2, v + 3);
      v += 4;
    };
    const nb = (lx, lz) => lx < 0 ? ring[lz] : lx > 15 ? ring[16 + lz] : lz < 0 ? ring[32 + lx] : lz > 15 ? ring[48 + lx] : tops[lz * 16 + lx];
    const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
      const i = lz * 16 + lx, h2 = tops[i], h = h2 / 2, tile = tileOf(mats[i]);
      quad([lx, h, lz + 1], [lx + 1, h, lz + 1], [lx + 1, h, lz], [lx, h, lz], [0, 1, 0], tile, 0, 1);
      for (const [dx, dz] of SIDES) {
        const nh2 = nb(lx + dx, lz + dz);
        if (h2 <= nh2) continue;
        let a0, a1, n;
        if (dx === 1) { a0 = [lx + 1, lz + 1]; a1 = [lx + 1, lz]; n = [1, 0, 0]; }
        else if (dx === -1) { a0 = [lx, lz]; a1 = [lx, lz + 1]; n = [-1, 0, 0]; }
        else if (dz === 1) { a0 = [lx, lz + 1]; a1 = [lx + 1, lz + 1]; n = [0, 0, 1]; }
        else { a0 = [lx + 1, lz]; a1 = [lx, lz]; n = [0, 0, -1]; }
        const low = nh2 / 2;
        let yt = h, d = 0;
        while (yt > low + 1e-6) {
          const yb = Math.max(low, yt - 1), fr = yt - yb, wt = d < 2 ? tile : 1;
          quad([a0[0], yb, a0[1]], [a1[0], yb, a1[1]], [a1[0], yt, a1[1]], [a0[0], yt, a0[1]], n, wt, 1 - fr, 1);
          yt = yb; d++;
        }
      }
    }
    return { pos: Float32Array.from(P), nor: Float32Array.from(N), uv: Float32Array.from(U),
      idx: v > 65535 ? Uint32Array.from(I) : Uint16Array.from(I) };
  }

  // Malla suave de baja resolución: rejilla (n+1)^2 de alturas h y "mare" m (0..1), muestreada cada `step` bloques.
  function buildLod(h, m, n, step, offsetY, colHigh, colMare) {
    const w = n + 1, pos = new Float32Array(w * w * 3), nor = new Float32Array(w * w * 3), col = new Float32Array(w * w * 3);
    const at = (i, j) => h[Math.min(n, Math.max(0, i)) * w + Math.min(n, Math.max(0, j))];
    for (let i = 0; i < w; i++) for (let j = 0; j < w; j++) {
      const k = i * w + j;
      pos[k * 3] = j * step; pos[k * 3 + 1] = h[k] - offsetY; pos[k * 3 + 2] = i * step;
      const gx = (at(i, j + 1) - at(i, j - 1)) / (2 * step), gz = (at(i + 1, j) - at(i - 1, j)) / (2 * step);
      const len = Math.sqrt(gx * gx + gz * gz + 1);
      nor[k * 3] = -gx / len; nor[k * 3 + 1] = 1 / len; nor[k * 3 + 2] = -gz / len;
      const t = Math.min(1, Math.max(0, m[k]));
      for (let c = 0; c < 3; c++) col[k * 3 + c] = colHigh[c] + (colMare[c] - colHigh[c]) * t;
    }
    const idx = new Uint16Array(n * n * 6);
    let p = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const a = i * w + j, b = a + 1, c = a + w, d = c + 1;
      idx[p++] = a; idx[p++] = c; idx[p++] = b; idx[p++] = b; idx[p++] = c; idx[p++] = d;
    }
    return { pos, nor, col, idx };
  }

  // Qué teselas hacen falta alrededor del chunk (ccx, ccz). Nivel 0: chunks de 16 con detalle completo hasta `near`;
  // nivel 1: teselas de 4x4 chunks (cada 4 bloques) hasta near+14; nivel 2: teselas de 16x16 chunks (cada 16) hasta D.
  // `extra` ensancha los radios (conjunto de retención, para no descargar y recargar en el borde).
  function desired(ccx, ccz, D, near, extra) {
    const R0 = Math.min(near, D), R1 = Math.min(D, R0 + 14);
    const r0 = R0 + extra, r1 = R1 + extra, r2 = D + extra, out = [];
    for (let dz = -r0; dz <= r0; dz++) for (let dx = -r0; dx <= r0; dx++) {
      out.push({ key: '0:' + (ccx + dx) + ':' + (ccz + dz), level: 0, a: ccx + dx, b: ccz + dz, prio: Math.max(Math.abs(dx), Math.abs(dz)) });
    }
    const ring = (level, size, inner, outer) => {
      const t0x = Math.floor((ccx - outer) / size), t1x = Math.floor((ccx + outer) / size);
      const t0z = Math.floor((ccz - outer) / size), t1z = Math.floor((ccz + outer) / size);
      for (let tz = t0z; tz <= t1z; tz++) for (let tx = t0x; tx <= t1x; tx++) {
        const span = (c, lo) => { const a = lo * size, b = a + size - 1; return [c >= a && c <= b ? 0 : Math.min(Math.abs(c - a), Math.abs(c - b)), Math.max(Math.abs(c - a), Math.abs(c - b))]; };
        const [nx, fx] = span(ccx, tx), [nz, fz] = span(ccz, tz);
        const dmin = Math.max(nx, nz), dmax = Math.max(fx, fz);
        if (dmax > inner && dmin <= outer) out.push({ key: level + ':' + tx + ':' + tz, level, a: tx, b: tz, prio: dmin });
      }
    };
    // El límite interior no se ensancha (se estrecha) para que el conjunto de retención contenga siempre al deseado.
    if (R1 > R0) ring(1, 4, R0 - extra, r1);
    if (D > R1) ring(2, 16, R1 - extra, r2);
    return out;
  }

  // Parámetros de muestreo de una tesela de baja resolución.
  function lodSpec(level, a, b) {
    return level === 1 ? { x0: a * 64, z0: b * 64, n: 16, step: 4, offset: 2 } : { x0: a * 256, z0: b * 256, n: 16, step: 16, offset: 7 };
  }

  // Semilla como Minecraft: número tal cual; cualquier otro texto, su String.hashCode() de Java.
  function seedFromText(text) {
    text = String(text).trim();
    if (/^-?\d{1,18}$/.test(text)) return String(parseInt(text, 10) === 0 && /^-?0+$/.test(text) ? 0 : text.replace(/^(-?)0+(?=\d)/, '$1'));
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
    return String(h);
  }

  const api = { tileOf, buildChunk, buildLod, desired, lodSpec, seedFromText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PV = api;
})(typeof self !== 'undefined' ? self : this);
