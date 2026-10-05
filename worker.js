'use strict';
// Worker: ejecuta la generación real del mod (moon.js, compilada con TeaVM desde MoonTerrain/MoonChunkGen).
importScripts('moon.js');
self.onmessage = e => {
  const m = e.data, t0 = performance.now();
  try {
    if (m.type === 'chunk') {
      const r = moonChunk(m.seed, m.cx, m.cz);
      self.postMessage({ id: m.id, ms: performance.now() - t0, tops: r.tops, mats: r.mats, ring: r.ring, runs: r.runs },
        [r.tops.buffer, r.mats.buffer, r.ring.buffer, r.runs.buffer]);
    } else if (m.type === 'entrances') {
      const r = moonEntrances(m.seed, m.x, m.z, m.r);
      self.postMessage({ id: m.id, ms: performance.now() - t0, list: r }, [r.buffer]);
    } else {
      const r = moonLod(m.seed, m.x0, m.z0, m.n, m.step);
      self.postMessage({ id: m.id, ms: performance.now() - t0, h: r.h, m: r.m }, [r.h.buffer, r.m.buffer]);
    }
  } catch (err) {
    self.postMessage({ id: m.id, error: String(err && err.stack || err) });
  }
};
