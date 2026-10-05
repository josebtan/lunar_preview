(() => {
  'use strict';
  const PV = window.PV, $ = id => document.getElementById(id);
  const bootEl = $('boot');
  const fail = msg => { bootEl.classList.remove('hide'); bootEl.style.whiteSpace = 'pre-wrap'; bootEl.textContent = 'Error: ' + msg; };
  addEventListener('error', e => fail(e.message));

  // ---------- estado y URL ----------
  const H = new URLSearchParams(location.hash.slice(1));
  const num = (k, d) => { const v = parseFloat(H.get(k)); return Number.isFinite(v) ? v : d; };
  const S = { seed: PV.seedFromText(H.get('seed') || '12345'), dist: num('d', 24), near: num('n', 4), speed: num('v', 40), sun: num('s', 25), walk: H.get('w') === '1' };
  const pos = { x: num('x', 0), y: num('y', 170), z: num('z', 0) };
  let yaw = num('yaw', 0.6), pitch = num('pitch', -0.35);

  // ---------- escena ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  document.body.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.Fog(0x000000, 100, 400);
  const camera = new THREE.PerspectiveCamera(70, 1, 0.5, 4000);
  camera.rotation.order = 'YXZ';
  const amb = new THREE.AmbientLight(0x505868, 0.55), sun = new THREE.DirectionalLight(0xfff2de, 1.55);
  scene.add(amb, sun);
  const setSun = () => { const e = S.sun * Math.PI / 180, az = 2.2; sun.position.set(Math.cos(az) * Math.cos(e), Math.sin(e), Math.sin(az) * Math.cos(e)); };
  { // estrellas
    const n = 1800, p = new Float32Array(n * 3), R = 1000;
    for (let i = 0; i < n; i++) { const u = Math.random() * 2 - 1, a = Math.random() * 6.2832, r = Math.sqrt(1 - u * u); p[i * 3] = r * Math.cos(a) * R; p[i * 3 + 1] = Math.abs(u) * R * 0.9 + 20; p[i * 3 + 2] = r * Math.sin(a) * R; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    var stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false }));
    stars.frustumCulled = false; scene.add(stars);
  }
  const applyFog = () => { const far = S.dist * 16; scene.fog.near = far * 0.55; scene.fog.far = far * 0.98; camera.far = Math.max(1200, far * 1.5); camera.updateProjectionMatrix(); };
  // Las teselas lejanas se hunden donde las cubre un nivel más fino (sin saltos fuera de esa zona): se evita que se solapen.
  const lodU = [null, 1, 2, 3].map(() => ({ uC: { value: new THREE.Vector2() }, uA: { value: 0 }, uB: { value: 1 }, uBias: { value: 0 } }));
  function lodMaterial(level) {
    const u = lodU[level], m = new THREE.MeshLambertMaterial({ vertexColors: true });
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec2 uC; uniform float uA; uniform float uB; uniform float uBias;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 wp0 = modelMatrix * vec4(transformed, 1.0);\nfloat dd0 = max(abs(wp0.x - uC.x), abs(wp0.z - uC.y));\ntransformed.y -= uBias * (1.0 - smoothstep(uA, uB, dd0));');
    };
    return m;
  }
  function syncLod(ccx, ccz) {
    const r = PV.radii(S.dist, S.near), cx = (ccx + 0.5) * 16, cz = (ccz + 0.5) * 16;
    // [ancho de hundimiento total, ancho donde ya no se hunde, hundimiento en bloques]
    const cfg = [null, [(r.R0 + 0.5) * 16 - 8, (r.R0 + 0.5) * 16, 2.5], [(r.R1 + 0.5) * 16 - 16, (r.R1 + 3.5) * 16, 9], [(r.R2 + 0.5) * 16 - 16, (r.R2 + 15.5) * 16, 26]];
    for (let l = 1; l <= 3; l++) { const u = lodU[l]; u.uC.value.set(cx, cz); u.uA.value = cfg[l][0]; u.uB.value = Math.max(cfg[l][1], cfg[l][0] + 1); u.uBias.value = cfg[l][2]; }
  }

  // ---------- texturas del mod ----------
  const loadImg = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('no se pudo cargar ' + src)); i.src = src; });
  let matBlocks, colHigh, colMare; const matLod = [null];
  const ready = Promise.all([loadImg('assets/lunar_regolith.png'), loadImg('assets/lunar_rock.png')]).then(([reg, rock]) => {
    const cv = document.createElement('canvas'); cv.width = 48; cv.height = 16;
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    g.drawImage(reg, 0, 0, 16, 16); g.drawImage(rock, 16, 0, 16, 16); g.drawImage(rock, 32, 0, 16, 16);
    g.fillStyle = 'rgba(18,28,48,0.55)'; g.fillRect(32, 0, 16, 16); // basalto liso: roca oscurecida
    const avg = x0 => { const d = g.getImageData(x0, 0, 16, 16).data; let r = 0, gg = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; } const k = 256 * 255; return [r / k, gg / k, b / k]; };
    colHigh = avg(0); colMare = colHigh.map(v => v * 0.72); // mare: el mismo regolito, más oscuro (el basalto liso solo aparece donde no hay regolito)
    const tex = new THREE.CanvasTexture(cv); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
    matBlocks = new THREE.MeshLambertMaterial({ map: tex });
    for (let l = 1; l <= 3; l++) matLod[l] = lodMaterial(l);
  });

  // ---------- workers ----------
  const NW = Math.max(2, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
  const workers = [], jobs = new Map(), stats = { done: 0, ms: 0 };
  let nextId = 1, epoch = 0, queue = [];
  const tiles = new Map(), pending = new Set(), chunkTops = new Map(), arrived = [];
  let keepKeys = new Set();
  function startWorkers() {
    for (let i = 0; i < NW; i++) {
      const w = new Worker('worker.js'); w.busy = 0;
      w.onmessage = e => {
        const d = e.data, job = jobs.get(d.id); w.busy--; jobs.delete(d.id);
        if (!job) return pump();
        pending.delete(job.key);
        if (d.error) { fail(d.error); return; }
        stats.done++; stats.ms += d.ms;
        if (job.epoch === epoch && keepKeys.has(job.key)) arrived.push({ job, d });
        pump();
      };
      w.onerror = e => fail('worker: ' + (e.message || 'no se pudo cargar moon.js'));
      workers.push(w);
    }
  }
  function pump() {
    while (queue.length) {
      let w = null; for (const c of workers) if (c.busy < 2 && (!w || c.busy < w.busy)) w = c;
      if (!w) break;
      const t = queue.shift(); if (tiles.has(t.key) || pending.has(t.key)) continue;
      const id = nextId++, job = { key: t.key, level: t.level, a: t.a, b: t.b, epoch };
      jobs.set(id, job); pending.add(t.key); w.busy++;
      if (t.level === 0) w.postMessage({ id, type: 'chunk', seed: S.seed, cx: t.a, cz: t.b });
      else { const sp = PV.lodSpec(t.level, t.a, t.b); w.postMessage({ id, type: 'lod', seed: S.seed, x0: sp.x0 - sp.step, z0: sp.z0 - sp.step, n: sp.n + 2, step: sp.step }); } // +1 muestra de margen por lado (normales sin costuras)
    }
  }

  // ---------- teselas ----------
  function addMesh(job, d) {
    let mesh;
    if (job.level === 0) {
      const m = PV.buildChunk(d.tops, d.mats, d.ring), g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(m.nor, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(m.uv, 2)); g.setIndex(new THREE.BufferAttribute(m.idx, 1));
      mesh = new THREE.Mesh(g, matBlocks); mesh.position.set(job.a * 16, 0, job.b * 16);
      chunkTops.set(job.key, d.tops);
    } else {
      const sp = PV.lodSpec(job.level, job.a, job.b), m = PV.buildLod(d.h, d.m, sp.n, sp.step, 0, colHigh, colMare, 1), g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(m.nor, 3));
      g.setAttribute('color', new THREE.BufferAttribute(m.col, 3)); g.setIndex(new THREE.BufferAttribute(m.idx, 1));
      mesh = new THREE.Mesh(g, matLod[job.level]); mesh.position.set(sp.x0, 0, sp.z0);
    }
    scene.add(mesh); tiles.set(job.key, mesh);
  }
  function dropTile(key) { const m = tiles.get(key); if (!m) return; scene.remove(m); m.geometry.dispose(); tiles.delete(key); chunkTops.delete(key); }
  function resetWorld() { epoch++; queue = []; arrived.length = 0; for (const k of [...tiles.keys()]) dropTile(k); }
  function update(ccx, ccz) {
    keepKeys = new Set(PV.desired(ccx, ccz, S.dist, S.near, 1).map(t => t.key));
    for (const k of [...tiles.keys()]) if (!keepKeys.has(k)) dropTile(k);
    queue = PV.desired(ccx, ccz, S.dist, S.near, 0).filter(t => !tiles.has(t.key) && !pending.has(t.key)).sort((p, q) => p.prio - q.prio || p.level - q.level);
    pump();
  }

  // ---------- control ----------
  const keys = new Set(), stick = { x: 0, y: 0 }, vbtn = { up: false, down: false };
  addEventListener('keydown', e => { if (e.target.tagName === 'INPUT') return; keys.add(e.code); });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  const cvs = renderer.domElement; let look = null;
  cvs.addEventListener('pointerdown', e => { if (look === null) { look = e.pointerId; cvs.setPointerCapture(e.pointerId); } });
  cvs.addEventListener('pointermove', e => { if (e.pointerId === look && e.buttons !== 0 || e.pointerId === look && e.pointerType === 'touch') { yaw -= e.movementX * 0.0035; pitch = Math.max(-1.5, Math.min(1.5, pitch - e.movementY * 0.0035)); } });
  const endLook = e => { if (e.pointerId === look) look = null; };
  cvs.addEventListener('pointerup', endLook); cvs.addEventListener('pointercancel', endLook);
  cvs.addEventListener('wheel', e => { S.speed = Math.max(4, Math.min(400, S.speed * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); syncUI(); }, { passive: true });
  { const st = $('stick'), kn = $('knob'); let id = null;
    const setS = e => { const r = st.getBoundingClientRect(), R = r.width / 2; let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R); const l = Math.hypot(dx, dy); if (l > R) { dx *= R / l; dy *= R / l; } stick.x = dx / R; stick.y = dy / R; kn.style.transform = `translate(${dx}px,${dy}px)`; };
    st.addEventListener('pointerdown', e => { id = e.pointerId; st.setPointerCapture(id); setS(e); e.preventDefault(); });
    st.addEventListener('pointermove', e => { if (e.pointerId === id) setS(e); });
    const off = e => { if (e.pointerId !== id) return; id = null; stick.x = stick.y = 0; kn.style.transform = ''; };
    st.addEventListener('pointerup', off); st.addEventListener('pointercancel', off); }
  for (const [el, k] of [[$('up'), 'up'], [$('down'), 'down']]) { el.addEventListener('pointerdown', e => { vbtn[k] = true; el.setPointerCapture(e.pointerId); e.preventDefault(); }); const off = () => { vbtn[k] = false; }; el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); }

  const groundAt = (x, z) => { const ci = Math.floor(x / 16), cj = Math.floor(z / 16), t = chunkTops.get('0:' + ci + ':' + cj); return t ? t[(Math.floor(z) - cj * 16) * 16 + (Math.floor(x) - ci * 16)] / 2 : NaN; };
  function move(dt) {
    let fx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + stick.x;
    let fz = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - stick.y;
    let fy = (keys.has('Space') || keys.has('KeyE') || vbtn.up ? 1 : 0) - (keys.has('ShiftLeft') || keys.has('KeyQ') || vbtn.down ? 1 : 0);
    const sp = S.speed * (keys.has('ControlLeft') ? 4 : 1), cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sP = Math.sin(pitch);
    const fwd = S.walk ? [-sy, 0, -cy] : [-sy * cp, sP, -cy * cp];
    pos.x += (fwd[0] * fz + cy * fx) * sp * dt; pos.z += (fwd[2] * fz - sy * fx) * sp * dt;
    pos.y += (fwd[1] * fz + (S.walk ? 0 : fy)) * sp * dt;
    const g = groundAt(pos.x, pos.z);
    if (Number.isFinite(g)) { if (S.walk) pos.y += (g + 1.8 - pos.y) * Math.min(1, dt * 12); else if (pos.y < g + 1.5) pos.y = g + 1.5; }
    pos.y = Math.max(2, Math.min(1000, pos.y));
  }

  // ---------- interfaz ----------
  let dirty = true;
  function syncUI() {
    $('dist').value = S.dist; $('distO').textContent = S.dist + ' ch · ' + (S.dist * 16) + ' m';
    $('near').value = S.near; $('nearO').textContent = S.near + ' ch';
    $('speed').value = Math.round(S.speed); $('speedO').textContent = Math.round(S.speed) + ' m/s';
    $('sun').value = S.sun; $('sunO').textContent = Math.round(S.sun) + '°';
    $('walk').setAttribute('aria-pressed', S.walk);
    if (document.activeElement !== $('seed')) $('seed').value = S.seed;
    $('nearO').textContent = S.near + ' ch' + (S.near > 10 ? ' ⚠' : '');
  }
  $('gear').onclick = () => document.body.classList.toggle('panel-open', $('panel').classList.toggle('open'));
  for (const [id, k, f] of [['dist', 'dist', () => { applyFog(); }], ['near', 'near', () => {}], ['speed', 'speed', () => {}], ['sun', 'sun', setSun]]) $(id).oninput = e => { S[k] = +e.target.value; f(); syncUI(); dirty = true; };
  $('walk').onclick = () => { S.walk = !S.walk; syncUI(); }; $('fly').onclick = () => { S.walk = false; syncUI(); };
  const setSeed = txt => { S.seed = PV.seedFromText(txt); resetWorld(); if (pos.y < 140) pos.y = 140; syncUI(); dirty = true; };
  $('applySeed').onclick = () => { if ($('seed').value.trim()) setSeed($('seed').value); };
  const randomSeed = () => setSeed(PV.randomSeed());
  $('rndSeed').onclick = randomSeed; $('dice').onclick = randomSeed;
  $('presets').addEventListener('click', e => { const d = +e.target.dataset.d; if (d) { S.dist = d; applyFog(); syncUI(); dirty = true; } });
  $('go').onclick = () => { const x = parseFloat($('gx').value), z = parseFloat($('gz').value); if (Number.isFinite(x) && Number.isFinite(z)) { pos.x = x; pos.z = z; pos.y = 170; dirty = true; } };

  // ---------- bucle ----------
  let last = performance.now(), lastUpd = 0, lastCC = [NaN, NaN], lastHud = 0, lastUrl = 0, shown = false, fps = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now; fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;
    move(dt);
    camera.position.set(pos.x, pos.y, pos.z); camera.rotation.set(pitch, yaw, 0); stars.position.copy(camera.position); sun.target.position.copy(camera.position);
    const ccx = Math.floor(pos.x / 16), ccz = Math.floor(pos.z / 16);
    if (dirty || ccx !== lastCC[0] || ccz !== lastCC[1] || now - lastUpd > 1000) { update(ccx, ccz); lastCC = [ccx, ccz]; dirty = false; lastUpd = now; }
    syncLod(ccx, ccz);
    const t0 = performance.now(); while (arrived.length && performance.now() - t0 < 5) { const a = arrived.shift(); if (a.job.epoch === epoch && !tiles.has(a.job.key) && keepKeys.has(a.job.key)) addMesh(a.job, a.d); }
    if (!shown) { let near = 0; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (tiles.has('0:' + (ccx + dx) + ':' + (ccz + dz))) near++; if (near >= 9) { shown = true; bootEl.classList.add('hide'); } else bootEl.textContent = 'Generando terreno con el código del mod… (' + near + '/9)'; }
    renderer.render(scene, camera);
    if (now - lastHud > 250) { lastHud = now; let n0 = 0, n1 = 0, n2 = 0, n3 = 0; for (const k of tiles.keys()) { const l = k.charCodeAt(0) - 48; if (l === 0) n0++; else if (l === 1) n1++; else if (l === 2) n2++; else n3++; }
      const g = groundAt(pos.x, pos.z);
      $('hud').textContent = `semilla ${S.seed}\nX ${pos.x.toFixed(0)}  Y ${pos.y.toFixed(0)}  Z ${pos.z.toFixed(0)}\n${Number.isFinite(g) ? 'suelo ' + g.toFixed(1) + '  ' : ''}${fps.toFixed(0)} fps\nchunks ${n0} · teselas ${n1}+${n2}+${n3} · cola ${queue.length + pending.size}` + (stats.done ? `\n${(stats.ms / stats.done).toFixed(0)} ms/pieza ×${NW}` : ''); $('hud').style.whiteSpace = 'pre'; }
    if (now - lastUrl > 1500) { lastUrl = now; history.replaceState(null, '', '#' + new URLSearchParams({ seed: S.seed, x: pos.x.toFixed(0), y: pos.y.toFixed(0), z: pos.z.toFixed(0), yaw: yaw.toFixed(2), pitch: pitch.toFixed(2), d: S.dist, n: S.near, v: Math.round(S.speed), s: Math.round(S.sun), w: S.walk ? 1 : 0 })); }
    requestAnimationFrame(frame);
  }
  const resize = () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
  addEventListener('resize', resize); resize();
  ready.then(() => { startWorkers(); setSun(); applyFog(); syncUI(); requestAnimationFrame(frame); }).catch(e => fail(e.message));
})();
