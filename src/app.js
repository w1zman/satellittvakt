(function () {
  const O = window.ORB, D2R = Math.PI / 180, RE = 6378.137;
  const $ = id => document.getElementById(id);
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const PLACES = { narvik: { key: 'narvik', name: 'Narvik', lat: 68.4385, lon: 17.4273, h: 0.02 }, tromso: { key: 'tromso', name: 'Tromsø', lat: 69.6496, lon: 18.9560, h: 0.02 } };
  let PLACE, LAT, LON, OBS, sLa, cLa, sLo, cLo;
  function setObserver(key) {
    PLACE = PLACES[key] || PLACES.narvik; LAT = PLACE.lat; LON = PLACE.lon; OBS = O.geodeticToEcef(LAT, LON, PLACE.h);
    sLa = Math.sin(LAT * D2R); cLa = Math.cos(LAT * D2R); sLo = Math.sin(LON * D2R); cLo = Math.cos(LON * D2R);
  }
  const initialPlace = (() => { const h = (location.hash || '').replace('#', '').toLowerCase(); if (PLACES[h]) return h;
    try { const v = localStorage.getItem('sv-place'); if (PLACES[v]) return v; } catch (e) {} return 'narvik'; })();
  setObserver(initialPlace);
  const esc = x => String(x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (x, d = 0) => x.toFixed(d).replace('-', '−');
  const DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const dirName = a => DIRS[Math.round(((a % 360) + 360) % 360 / 22.5) % 16];

  // ---------- time in Oslo ----------
  const WD = { Mon: 'Mon', Tue: 'Tue', Wed: 'Wed', Thu: 'Thu', Fri: 'Fri', Sat: 'Sat', Sun: 'Sun' };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtP = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  function oslo(t) { const p = {}; for (const x of fmtP.formatToParts(new Date(t))) p[x.type] = x.value; return { y: +p.year, mo: +p.month, d: +p.day, h: p.hour === '24' ? '00' : p.hour, mi: p.minute, s: p.second, wd: WD[p.weekday] || p.weekday }; }
  const hm = t => { const o = oslo(t); return o.h + ':' + o.mi; };
  const dayKey = t => { const o = oslo(t); return o.y * 10000 + o.mo * 100 + o.d; };
  const dateStr = t => { const o = oslo(t); return o.wd + ' ' + o.d + ' ' + MON[o.mo - 1]; };

  // ---------- astronomy helpers ----------
  function enu(x, y, z) { const dx = x - OBS[0], dy = y - OBS[1], dz = z - OBS[2];
    return [-sLo * dx + cLo * dy, -sLa * cLo * dx - sLa * sLo * dy + cLa * dz, cLa * cLo * dx + cLa * sLo * dy + sLa * dz]; }
  function sunAt(t) { const g = O.gmst(t), c = Math.cos(g), s = Math.sin(g), r = O.sunEci(t), e = [c * r[0] + s * r[1], -s * r[0] + c * r[1], r[2]], v = enu(e[0], e[1], e[2]), L = Math.hypot(v[0], v[1], v[2]);
    let az = Math.atan2(v[0], v[1]) / D2R; if (az < 0) az += 360; return { eci: r, ecef: e, el: Math.asin(v[2] / L) / D2R, az, enu: [v[0] / L, v[1] / L, v[2] / L], c, s }; }
  // full state for one object at time t (with precomputed gmst cos/sin and sun eci)
  const ST = { x: 0, y: 0, z: 0, e: 0, n: 0, u: 0, el: 0, az: 0, rng: 0, lit: 0 };
  function stateAt(o, t, c, s, sunE, wantLit) {
    const r = O.prop(o.s, t).r, x = c * r[0] + s * r[1], y = -s * r[0] + c * r[1], z = r[2], v = enu(x, y, z), L = Math.hypot(v[0], v[1], v[2]);
    ST.x = x; ST.y = y; ST.z = z; ST.e = v[0] / L; ST.n = v[1] / L; ST.u = v[2] / L; ST.rng = L; ST.el = Math.asin(ST.u) / D2R;
    let az = Math.atan2(v[0], v[1]) / D2R; ST.az = az < 0 ? az + 360 : az;
    ST.lit = wantLit ? O.litFraction(r, sunE) : 0; return ST;
  }

  // ---------- objects ----------
  const OBJ = []; let N = 0;
  const KIND_NAME = ['Space station', '', 'Starlink'];
  function addObjects(rows, group) {
    for (const el of rows) {
      let s; try { s = O.init(el); } catch (e) { continue; }
      if (!isFinite(s.mdot) || !isFinite(s.ao)) continue;
      let kind = group === 'starlink' ? 2 : (el.id === 25544 || el.id === 48274) ? 0 : 1;
      const name = el.id === 25544 ? 'ISS' : el.id === 48274 ? 'Tiangong (CSS)' : el.name;
      OBJ.push({ name, intl: el.intl, id: el.id, kind, s, epoch: s.t0 });
    }
    N = OBJ.length;
  }
  const kindLabel = o => o.kind === 0 ? 'Space station' : o.kind === 2 ? 'Starlink' : /R\/B|DEB/.test(o.name) ? 'Rocket body' : 'Satellite';

  // ---------- time model ----------
  let speed = 1, anchorWall = Date.now(), anchorSim = anchorWall, live = true;
  const simNow = () => anchorSim + (Date.now() - anchorWall) * speed;
  function setSim(t, sp) { anchorSim = t; anchorWall = Date.now(); if (sp !== undefined) speed = sp; live = false; syncControls(); force = true; }
  function goLive() { speed = 1; anchorWall = anchorSim = Date.now(); live = true; syncControls(); force = true; }
  function syncControls() {
    $('live').setAttribute('aria-pressed', String(live));
    document.querySelectorAll('.speeds button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.s === speed)));
    $('livepill').classList.toggle('off', !live);
  }

  // ---------- three.js scene ----------
  const canvas = $('cv'), stage = $('stage');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x03060c, 1);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(45, 1, 0.01, 3000);
  const R = 10, domeG = new THREE.Group(), globeG = new THREE.Group(), starG = new THREE.Group();
  scene.add(domeG, globeG, starG);
  const toDome = (e, n, u, r = R) => new THREE.Vector3(e * r, u * r, -n * r);
  const lineMat = (color, opacity) => new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });

  const domeMat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: new THREE.Vector3(-1, -0.2, 0) }, uSunAlt: { value: -13 }, uOpacity: { value: 0.55 } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'varying vec3 vDir; uniform vec3 uSun; uniform float uSunAlt; uniform float uOpacity;',
      'void main(){ float h = clamp(vDir.y, 0.0, 1.0);',
      ' float day = clamp((uSunAlt + 6.0) / 8.0, 0.0, 1.0);',
      ' vec3 night = mix(vec3(0.045,0.075,0.14), vec3(0.012,0.02,0.045), pow(h, 0.55));',
      ' vec3 dayc = mix(vec3(0.30,0.42,0.58), vec3(0.12,0.22,0.40), pow(h, 0.6));',
      ' vec3 col = mix(night, dayc, day);',
      ' vec2 a = normalize(vDir.xz + vec2(1e-5)); vec2 s = normalize(uSun.xz + vec2(1e-5));',
      ' float c = dot(a, s) * 0.5 + 0.5; float g = clamp((19.0 + uSunAlt) / 10.0, 0.0, 1.0) * (1.0 - 0.6 * day);',
      ' col += vec3(0.32,0.22,0.22) * pow(c, 5.0) * exp(-h * 7.0) * g + vec3(0.04,0.09,0.18) * pow(c, 2.0) * exp(-h * 3.0) * g;',
      ' gl_FragColor = vec4(col, uOpacity); }'].join('\n'),
    transparent: true, depthWrite: false, side: THREE.DoubleSide
  });
  domeG.add(new THREE.Mesh(new THREE.SphereGeometry(R, 72, 36, 0, Math.PI * 2, 0, Math.PI / 2), domeMat));
  const ground = new THREE.Mesh(new THREE.CircleGeometry(R * 1.25, 96), new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec2 vP; void main(){ float r = length(vP) / 12.5; vec3 c = mix(vec3(0.055,0.075,0.12), vec3(0.015,0.022,0.04), smoothstep(0.0, 1.0, r)); gl_FragColor = vec4(c, 1.0); }',
    side: THREE.DoubleSide
  }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.01; domeG.add(ground);
  function ring(el, mat, n = 160, dashed = false) {
    const pts = []; for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2, ce = Math.cos(el * D2R); pts.push(toDome(ce * Math.sin(a), ce * Math.cos(a), Math.sin(el * D2R))); }
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat); if (dashed) l.computeLineDistances(); return l;
  }
  domeG.add(ring(0, lineMat(0x8d9cb5, 0.75)));
  domeG.add(ring(10, new THREE.LineDashedMaterial({ color: 0xffc66b, transparent: true, opacity: 0.35, dashSize: 0.25, gapSize: 0.25, depthWrite: false }), 160, true));
  domeG.add(ring(30, lineMat(0x8d9cb5, 0.16)), ring(60, lineMat(0x8d9cb5, 0.16)));
  for (let az = 0; az < 180; az += 30) {
    const pts = [], a = az * D2R; for (let i = 0; i <= 60; i++) { const s = i * 3 * D2R; pts.push(toDome(Math.cos(s) * Math.sin(a), Math.cos(s) * Math.cos(a), Math.sin(s))); }
    domeG.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat(0x8d9cb5, az % 90 === 0 ? 0.16 : 0.08)));
  }
  { const pts = []; for (let az = 0; az < 360; az += 5) { const a = az * D2R, L = az % 30 === 0 ? 0.55 : az % 10 === 0 ? 0.3 : 0.14; pts.push(toDome(Math.sin(a), Math.cos(a), 0, R + 0.08), toDome(Math.sin(a), Math.cos(a), 0, R + 0.08 + L)); }
    domeG.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lineMat(0x8d9cb5, 0.55))); }
  { const pin = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffc66b })); pin.position.y = 0.14; pin.userData.domeOnly = 1; domeG.add(pin);
    const st = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, R, 0)]), lineMat(0xffc66b, 0.12)); st.userData.domeOnly = 1; domeG.add(st); }

  const labels = [];
  function makeLabel(text, opt) {
    const o = Object.assign({ px: 64, color: '#e4ecf7', weight: '600', family: '"Instrument Sans", system-ui, sans-serif', h: 1, depthTest: false }, opt || {});
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: o.depthTest, depthWrite: false }));
    sp.renderOrder = 10; sp.userData = { text, o, c: document.createElement('canvas') }; drawLabel(sp); labels.push(sp); return sp;
  }
  function drawLabel(sp) {
    const { text, o, c } = sp.userData, x = c.getContext('2d'), f = o.weight + ' ' + o.px + 'px ' + o.family;
    x.font = f; c.width = Math.ceil(x.measureText(text).width + o.px * 0.5); c.height = Math.ceil(o.px * 1.35);
    x.font = f; x.fillStyle = o.color; x.textBaseline = 'middle'; x.fillText(text, o.px * 0.25, c.height / 2);
    if (sp.material.map) sp.material.map.dispose();
    const tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    sp.material.map = tex; sp.material.needsUpdate = true; sp.scale.set(o.h * c.width / c.height, o.h, 1);
  }
  const DISPLAY = '"Big Shoulders Display", "Arial Narrow", sans-serif';
  [['N', 0], ['E', 90], ['S', 180], ['W', 270]].forEach(([t, az]) => {
    const s = makeLabel(t, { family: DISPLAY, weight: '800', px: 96, h: 1.25, color: t === 'N' ? '#ffc66b' : '#e4ecf7' });
    s.userData.compass = az; domeG.add(s);
  });
  [10, 30, 60].forEach(el => { const s = makeLabel(el + '°', { px: 48, h: 0.5, color: '#8d9cb5', family: '"JetBrains Mono", monospace', weight: '400' }); s.position.copy(toDome(0, -Math.cos(el * D2R), Math.sin(el * D2R), R + 0.05)).add(new THREE.Vector3(0.45, 0.2, 0)); domeG.add(s); });
  const narvikLbl = makeLabel(PLACE.name, { px: 56, h: 0.55, color: '#ffc66b' }); narvikLbl.position.set(0, 0.7, 0); domeG.add(narvikLbl);

  // stars (J2000 RA/Dec deg, magnitude, labelled)
  const STARS = [
    ['Polaris', 37.95, 89.26, 2.0, 1], ['Vega', 279.23, 38.78, 0.0, 1], ['Deneb', 310.36, 45.28, 1.25, 1], ['Altair', 297.70, 8.87, 0.77, 1],
    ['Capella', 79.17, 46.00, 0.08, 1], ['Arcturus', 213.92, 19.18, -0.05, 1], ['Aldebaran', 68.98, 16.51, 0.87, 1], ['Betelgeuse', 88.79, 7.41, 0.5, 1],
    ['Rigel', 78.63, -8.20, 0.13, 1], ['Procyon', 114.83, 5.22, 0.34, 0], ['Pollux', 116.33, 28.03, 1.14, 0], ['Castor', 113.65, 31.89, 1.58, 0],
    ['Regulus', 152.09, 11.97, 1.35, 0], ['Dubhe', 165.93, 61.75, 1.8, 0], ['Merak', 165.46, 56.38, 2.37, 0], ['Phecda', 178.46, 53.69, 2.44, 0],
    ['Megrez', 183.86, 57.03, 3.3, 0], ['Alioth', 193.51, 55.96, 1.77, 0], ['Mizar', 200.98, 54.93, 2.27, 0], ['Alkaid', 206.89, 49.31, 1.86, 0],
    ['Caph', 2.29, 59.15, 2.28, 0], ['Schedar', 10.13, 56.54, 2.24, 0], ['Gamma Cas', 14.18, 60.72, 2.15, 0], ['Ruchbah', 21.45, 60.24, 2.68, 0], ['Segin', 28.60, 63.67, 3.35, 0],
    ['Mirfak', 51.08, 49.86, 1.8, 0], ['Algol', 47.04, 40.96, 2.1, 0], ['Alpheratz', 2.10, 29.09, 2.06, 0], ['Mirach', 17.43, 35.62, 2.05, 0], ['Almach', 30.97, 42.33, 2.1, 0],
    ['Hamal', 31.79, 23.46, 2.0, 0], ['Markab', 346.19, 15.21, 2.48, 0], ['Scheat', 345.94, 28.08, 2.4, 0], ['Algenib', 3.31, 15.18, 2.83, 0], ['Alcyone', 56.87, 24.11, 2.87, 0],
    ['Kochab', 222.68, 74.16, 2.08, 0], ['Eltanin', 269.15, 51.49, 2.23, 0], ['Rasalhague', 263.73, 12.56, 2.08, 0], ['Alphecca', 233.67, 26.71, 2.23, 0], ['Sadr', 305.56, 40.26, 2.23, 0],
    ['Albireo', 292.68, 27.96, 3.1, 0], ['Enif', 326.05, 9.88, 2.4, 0], ['Alderamin', 319.64, 62.59, 2.5, 0], ['Menkalinan', 89.88, 44.95, 1.9, 0], ['Elnath', 81.57, 28.61, 1.65, 0], ['Bellatrix', 81.28, 6.35, 1.64, 0],
    ['Alnilam', 84.05, -1.20, 1.69, 0], ['Alnitak', 85.19, -1.94, 1.77, 0], ['Mintaka', 83.00, -0.30, 2.23, 0], ['Saiph', 86.94, -9.67, 2.09, 0]
  ];
  const SIDX = {}; STARS.forEach((s, i) => { SIDX[s[0]] = i; });
  const CONST = [
    ['Big Dipper', ['Dubhe', 'Merak', 'Phecda', 'Megrez', 'Dubhe', 'Megrez', 'Alioth', 'Mizar', 'Alkaid']],
    ['Cassiopeia', ['Caph', 'Schedar', 'Gamma Cas', 'Ruchbah', 'Segin']],
    ['Summer Triangle', ['Vega', 'Deneb', 'Altair', 'Vega']],
    ['Orion', ['Betelgeuse', 'Alnitak', 'Saiph', 'Rigel', 'Mintaka', 'Bellatrix', 'Betelgeuse', 'Alnitak', 'Alnilam', 'Mintaka']]
  ];
  const starPos = new Float32Array(STARS.length * 3), starSize = new Float32Array(STARS.length), starCol = new Float32Array(STARS.length * 4), starU = new Float32Array(STARS.length);
  STARS.forEach((s, i) => { starSize[i] = Math.max(1.8, Math.min(6.5, 5.4 - s[3] * 1.3)); starCol.set([0.85, 0.9, 1.0, 0], i * 4); });
  const PT_VS = 'attribute vec4 aCol; attribute float aSize; uniform float uPR; varying vec4 vCol; void main(){ vCol = aCol; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uPR; }';
  const PT_FS = 'varying vec4 vCol; void main(){ vec2 p = gl_PointCoord - 0.5; float d = length(p); if (d > 0.5) discard; float core = smoothstep(0.24, 0.0, d); float halo = smoothstep(0.5, 0.08, d) * 0.45; float a = (core + halo) * vCol.a; gl_FragColor = vec4(vCol.rgb * (0.75 + core * 0.6) * a, a); }';
  const uPR = { value: renderer.getPixelRatio() };
  const ptMat = () => new THREE.ShaderMaterial({ uniforms: { uPR }, vertexShader: PT_VS, fragmentShader: PT_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3)); starGeo.setAttribute('aSize', new THREE.BufferAttribute(starSize, 1)); starGeo.setAttribute('aCol', new THREE.BufferAttribute(starCol, 4));
  const starPts = new THREE.Points(starGeo, ptMat()); starPts.renderOrder = 1; starPts.frustumCulled = false; starG.add(starPts);
  const constSegs = []; CONST.forEach(c => { for (let i = 0; i < c[1].length - 1; i++) constSegs.push([SIDX[c[1][i]], SIDX[c[1][i + 1]]]); });
  const constPos = new Float32Array(constSegs.length * 6), constGeo = new THREE.BufferGeometry();
  constGeo.setAttribute('position', new THREE.BufferAttribute(constPos, 3));
  const constLines = new THREE.LineSegments(constGeo, lineMat(0x9fb3d6, 0.22)); constLines.frustumCulled = false; starG.add(constLines);
  const starLbls = STARS.map(s => { if (!s[4]) return null; const l = makeLabel(s[0], { px: 44, h: 0.42, color: '#aab8cf', weight: '500' }); starG.add(l); return l; });
  const constLbls = CONST.map(c => { const l = makeLabel(c[0], { px: 44, h: 0.42, color: '#7f90ad', weight: '500' }); starG.add(l); return l; });
  function updateStars(t, sunEl) {
    const lst = O.gmst(t) + LON * D2R, skyA = Math.max(0, Math.min(1, (-sunEl - 3) / 9));
    STARS.forEach((s, i) => {
      const ha = lst - s[1] * D2R, dec = s[2] * D2R, alt = Math.asin(sLa * Math.sin(dec) + cLa * Math.cos(dec) * Math.cos(ha));
      const az = Math.atan2(-Math.sin(ha) * Math.cos(dec), Math.sin(dec) * cLa - Math.cos(dec) * Math.cos(ha) * sLa);
      const e = Math.cos(alt) * Math.sin(az), n = Math.cos(alt) * Math.cos(az), u = Math.sin(alt); starU[i] = u;
      const p = toDome(e, n, u, R * 0.985); starPos[i * 3] = p.x; starPos[i * 3 + 1] = p.y; starPos[i * 3 + 2] = p.z;
      starCol[i * 4 + 3] = u > 0 ? Math.max(0.35, Math.min(0.95, 1 - s[3] * 0.18)) * skyA : 0;
      if (starLbls[i]) { starLbls[i].position.set(p.x, p.y + 0.38, p.z); starLbls[i].visible = u > 0.02 && skyA > 0.3; }
    });
    constSegs.forEach((sg, i) => { for (let m = 0; m < 2; m++) { const a = sg[m]; constPos[i * 6 + m * 3] = starPos[a * 3]; constPos[i * 6 + m * 3 + 1] = starPos[a * 3 + 1]; constPos[i * 6 + m * 3 + 2] = starPos[a * 3 + 2]; } });
    constLines.material.opacity = 0.22 * skyA;
    CONST.forEach((c, i) => { const uniq = [...new Set(c[1])]; let x = 0, y = 0, z = 0;
      uniq.forEach(nm => { const a = SIDX[nm]; x += starPos[a * 3]; y += starPos[a * 3 + 1]; z += starPos[a * 3 + 2]; });
      constLbls[i].position.set(x / uniq.length, y / uniq.length - 0.5, z / uniq.length); constLbls[i].visible = skyA > 0.3 && uniq.every(nm => starU[SIDX[nm]] > 0); });
    starGeo.attributes.position.needsUpdate = true; starGeo.attributes.aCol.needsUpdate = true; constGeo.attributes.position.needsUpdate = true;
  }

  // globe
  const earthMat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: new THREE.Vector3(1, 0, 0) }, uLand: { value: null }, uHasLand: { value: 0 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normal; vV = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'varying vec3 vN; varying vec3 vV; uniform vec3 uSun; uniform sampler2D uLand; uniform float uHasLand;',
      'void main(){ vec3 n = normalize(vN); float d = dot(n, uSun); float day = smoothstep(-0.12, 0.18, d);',
      ' vec2 uv = vec2(atan(-n.z, n.x) / 6.2831853 + 0.5, asin(clamp(n.y, -1.0, 1.0)) / 3.1415927 + 0.5);',
      ' float land = uHasLand > 0.5 ? texture2D(uLand, uv).r : 0.0;',
      ' vec3 ocean = mix(vec3(0.012,0.022,0.045), vec3(0.08,0.15,0.28), day);',
      ' vec3 ground = mix(vec3(0.11,0.135,0.165), vec3(0.26,0.31,0.31), day);',
      ' vec3 col = mix(ocean, ground, land);',
      ' col += vec3(0.30,0.14,0.08) * exp(-pow(d / 0.07, 2.0)) * 0.55;',
      ' float rim = pow(1.0 - abs(vV.z), 3.0); col += vec3(0.12,0.22,0.4) * rim * (0.25 + 0.75 * day);',
      ' gl_FragColor = vec4(col, 1.0); }'].join('\n')
  });
  globeG.add(new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), earthMat));
  function geoV(lat, lon, r = 1) { const la = lat * D2R, lo = lon * D2R; return new THREE.Vector3(r * Math.cos(la) * Math.cos(lo), r * Math.sin(la), -r * Math.cos(la) * Math.sin(lo)); }
  { const pts = [];
    for (let lat = -75; lat <= 75; lat += 15) for (let lo = 0; lo < 360; lo += 3) pts.push(geoV(lat, lo, 1.002), geoV(lat, lo + 3, 1.002));
    for (let lo = 0; lo < 360; lo += 15) for (let lat = -90; lat < 90; lat += 3) pts.push(geoV(lat, lo, 1.002), geoV(lat + 3, lo, 1.002));
    globeG.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lineMat(0x8d9cb5, 0.13)));
    const ac = []; for (let lo = 0; lo <= 360; lo += 2) ac.push(geoV(66.56, lo, 1.003));
    const acl = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ac), new THREE.LineDashedMaterial({ color: 0x9fd6ff, transparent: true, opacity: 0.45, dashSize: 0.02, gapSize: 0.015 })); acl.computeLineDistances(); globeG.add(acl); }
  const CITIES = [['Narvik', 68.4385, 17.4273], ['Tromsø', 69.6496, 18.956], ['Bodø', 67.280, 14.405], ['Nordkapp', 71.169, 25.784], ['Oslo', 59.913, 10.752], ['Longyearbyen', 78.223, 15.647],
    ['Reykjavík', 64.147, -21.94], ['Stockholm', 59.329, 18.069], ['Helsinki', 60.170, 24.938], ['London', 51.507, -0.128], ['North Pole', 90, 0]];
  { const cp = new Float32Array(CITIES.length * 3), cs = new Float32Array(CITIES.length), cc = new Float32Array(CITIES.length * 4);
    CITIES.forEach((c, i) => { const v = geoV(c[1], c[2], 1.004); cp.set([v.x, v.y, v.z], i * 3); cs[i] = 3.5; cc.set(c[3] ? [1, 0.78, 0.42, 1] : [0.85, 0.9, 1, 0.7], i * 4);
      const l = makeLabel(c[0], { px: 48, h: 0.022, color: c[3] ? '#ffc66b' : '#aab8cf', depthTest: true, weight: c[3] ? '600' : '500' });
      l.position.copy(geoV(c[1], c[2], 1.014)); l.position.y += 0.0055; l.userData.city = c[0]; globeG.add(l); });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(cp, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(cs, 1)); g.setAttribute('aCol', new THREE.BufferAttribute(cc, 4));
    const m = ptMat(); m.depthTest = true; globeG.add(new THREE.Points(g, m)); }
  // world map: Natural Earth 1:50m via world-atlas, loaded the first time the globe is shown
  let mapState = 'none';
  async function loadWorld() {
    if (mapState !== 'none') return; mapState = 'loading';
    try {
      const r = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json'); if (!r.ok) throw new Error('HTTP ' + r.status);
      const topo = await r.json(), [sx, sy] = topo.transform.scale, [tx, ty] = topo.transform.translate;
      const arcs = topo.arcs.map(a => { let x = 0, y = 0; return a.map(p => { x += p[0]; y += p[1]; return [x * sx + tx, y * sy + ty]; }); });
      const ring = ids => { const pts = []; ids.forEach(i => { const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i]; a.forEach((p, k) => { if (k || !pts.length) pts.push(p); }); }); return pts; };
      const polys = g => g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : [];
      // land mask texture (equirectangular)
      const W = 4096, H = 2048, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const cx = cv.getContext('2d');
      cx.fillStyle = '#000'; cx.fillRect(0, 0, W, H); cx.fillStyle = '#fff';
      const land = topo.objects.land.type === 'GeometryCollection' ? topo.objects.land.geometries : [topo.objects.land];
      land.forEach(g => polys(g).forEach(poly => {
        for (const off of [-W, 0, W]) {
          cx.beginPath();
          poly.forEach(ids => { let prev = null, shift = 0; ring(ids).forEach(([lo, la], k) => {
            if (prev !== null) { if (lo - prev > 180) shift -= 360; else if (prev - lo > 180) shift += 360; } prev = lo;
            const x = (lo + shift + 180) / 360 * W + off, y = (90 - la) / 180 * H; k ? cx.lineTo(x, y) : cx.moveTo(x, y); }); cx.closePath(); });
          cx.fill('evenodd');
        }
      }));
      const tex = new THREE.CanvasTexture(cv); tex.wrapS = THREE.RepeatWrapping; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      earthMat.uniforms.uLand.value = tex; earthMat.uniforms.uHasLand.value = 1;
      // outlines: arcs used by one country = coastline, by two = border
      const use = new Uint8Array(arcs.length);
      topo.objects.countries.geometries.forEach(g => polys(g).forEach(poly => poly.forEach(ids => ids.forEach(i => { use[i < 0 ? ~i : i]++; }))));
      const coast = [], border = [];
      arcs.forEach((a, i) => { const out = use[i] >= 2 ? border : coast; for (let k = 1; k < a.length; k++) {
        if (Math.abs(a[k][0] - a[k - 1][0]) > 180) continue;
        const p = geoV(a[k - 1][1], a[k - 1][0], 1.0015), q = geoV(a[k][1], a[k][0], 1.0015); out.push(p.x, p.y, p.z, q.x, q.y, q.z); } });
      const seg = (arr, color, op) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arr), 3)); const l = new THREE.LineSegments(g, lineMat(color, op)); l.material.depthWrite = false; return l; };
      globeG.add(seg(coast, 0xc9d6e8, 0.7), seg(border, 0x8d9cb5, 0.28));
      mapState = 'ok';
    } catch (e) { mapState = 'none'; }
  }
  let placeMark = null;
  function buildPlaceMarker() {
    if (placeMark) { globeG.remove(placeMark); placeMark.children.forEach(c => c.geometry && c.geometry.dispose()); }
    placeMark = new THREE.Group(); globeG.add(placeMark);
    globeG.children.forEach(c => { if (c.userData && c.userData.city) c.visible = c.userData.city !== PLACE.name; });
    const pts = []; const eE = [-sLo, cLo, 0], eN = [-sLa * cLo, -sLa * sLo, cLa], eU = [cLa * cLo, cLa * sLo, sLa];
    for (let az = 0; az <= 360; az += 3) { const a = az * D2R, el = 10 * D2R, u = [0, 1, 2].map(i => Math.cos(el) * Math.sin(a) * eE[i] + Math.cos(el) * Math.cos(a) * eN[i] + Math.sin(el) * eU[i]);
      const b = 2 * (OBS[0] * u[0] + OBS[1] * u[1] + OBS[2] * u[2]), c = OBS[0] ** 2 + OBS[1] ** 2 + OBS[2] ** 2 - (RE + 550) ** 2, rho = (-b + Math.sqrt(b * b - 4 * c)) / 2;
      const x = OBS[0] + rho * u[0], y = OBS[1] + rho * u[1], z = OBS[2] + rho * u[2]; pts.push(new THREE.Vector3(x / RE, z / RE, -y / RE)); }
    placeMark.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat(0xffc66b, 0.55)));
    placeMark.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([geoV(LAT, LON, 1), geoV(LAT, LON, 1 + 550 / RE)]), lineMat(0xffc66b, 0.5)));
    const pg = new THREE.BufferGeometry(), v = geoV(LAT, LON, 1.005);
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([v.x, v.y, v.z]), 3)); pg.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array([7]), 1)); pg.setAttribute('aCol', new THREE.BufferAttribute(new Float32Array([1, 0.78, 0.42, 1]), 4));
    const pm = ptMat(); pm.depthTest = true; placeMark.add(new THREE.Points(pg, pm));
    const l = makeLabel(PLACE.name, { px: 48, h: 0.03, color: '#ffc66b', depthTest: true, weight: '600' }); l.position.copy(geoV(LAT, LON, 1.014)); l.position.y += 0.0067; placeMark.add(l);
  }
  buildPlaceMarker();
  const shadow = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 5, 64, 1, true), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }));
  shadow.renderOrder = 2; globeG.add(shadow);

  // dynamic satellite buffers (rebuilt when the object count changes)
  const TR = 8, TR_DT = 12000, MAXTR = 2500;
  let pPos, pCol, pSize, pGeo, satPts, trPos, trCol, trGeo, trails, cur, curVis, curEl, curAz, curLit, cand;
  function buildBuffers() {
    if (satPts) { scene.remove(satPts); pGeo.dispose(); }
    if (trails) { scene.remove(trails); trGeo.dispose(); }
    pPos = new Float32Array(N * 3); pCol = new Float32Array(N * 4); pSize = new Float32Array(N);
    pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('aCol', new THREE.BufferAttribute(pCol, 4)); pGeo.setAttribute('aSize', new THREE.BufferAttribute(pSize, 1));
    satPts = new THREE.Points(pGeo, ptMat()); satPts.renderOrder = 4; satPts.frustumCulled = false; scene.add(satPts);
    trPos = new Float32Array(MAXTR * TR * 6); trCol = new Float32Array(MAXTR * TR * 6); trGeo = new THREE.BufferGeometry();
    trGeo.setAttribute('position', new THREE.BufferAttribute(trPos, 3)); trGeo.setAttribute('color', new THREE.BufferAttribute(trCol, 3));
    trails = new THREE.LineSegments(trGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    trails.renderOrder = 3; trails.frustumCulled = false; scene.add(trails);
    cur = new Float32Array(N * 3); curVis = new Uint8Array(N); curEl = new Float32Array(N).fill(-90); curAz = new Float32Array(N); curLit = new Uint8Array(N); cand = new Uint8Array(N);
    lastScan = -1e15;
  }
  const SELN = 81, selPos = new Float32Array(SELN * 6), selCol = new Float32Array(SELN * 6), selGeo = new THREE.BufferGeometry();
  selGeo.setAttribute('position', new THREE.BufferAttribute(selPos, 3)); selGeo.setAttribute('color', new THREE.BufferAttribute(selCol, 3));
  const selLine = new THREE.LineSegments(selGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
  selLine.renderOrder = 5; selLine.frustumCulled = false; selLine.visible = false; selGeo.setDrawRange(0, 0); scene.add(selLine);
  const ringTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.strokeStyle = '#ffc66b'; x.lineWidth = 4; x.beginPath(); x.arc(32, 32, 26, 0, Math.PI * 2); x.stroke(); return new THREE.CanvasTexture(c); })();
  const selRing = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, transparent: true, depthTest: false, depthWrite: false })); selRing.renderOrder = 11; selRing.visible = false; scene.add(selRing);

  const COL = [[1.0, 0.56, 0.42], [1.0, 0.78, 0.42], [0.62, 0.84, 1.0]], SHADE = [0.33, 0.38, 0.48];
  const BASEA = [1.0, 1.0, 0.85], BASES = [9, 7.5, 4.2], TRA = [0.8, 0.7, 0.42];
  const layer = [true, true, true]; let showShade = false, starlinkState = 'loading';
  let mode = 'dome', sel = -1, force = true, lastScan = -1e15, lastScanWall = 0;
  const V = new THREE.Vector3(), PV = new THREE.Vector3(), QV = new THREE.Vector3();
  const toScene = (st, out) => mode === 'globe' ? out.set(st.x / RE, st.z / RE, -st.y / RE) : out.set(st.e * R * 0.97, st.u * R * 0.97, -st.n * R * 0.97);
  let sunNow = null, counts = [0, 0, 0];

  function scan(t, sun) { // refresh every object (candidates for per-frame work)
    for (let j = 0; j < N; j++) { const st = stateAt(OBJ[j], t, sun.c, sun.s, sun.eci, true); writeState(j, st); cand[j] = st.el > -15 ? 1 : 0; }
    lastScan = t; lastScanWall = performance.now();
  }
  function writeState(j, st) { toScene(st, V); cur[j * 3] = V.x; cur[j * 3 + 1] = V.y; cur[j * 3 + 2] = V.z; curEl[j] = st.el; curAz[j] = st.az; curLit[j] = st.lit >= 0.5 ? 1 : 0; }

  let rr = 0;
  function update() {
    if (!N) return;
    const t = simNow(), sun = sunAt(t); sunNow = sun;
    if (Math.abs(t - lastScan) > 45000 || performance.now() - lastScanWall > 3000 || force) scan(t, sun);
    else {
      for (let j = 0; j < N; j++) if (cand[j] || OBJ[j].kind !== 2 || j === sel) writeState(j, stateAt(OBJ[j], t, sun.c, sun.s, sun.eci, true));
      if (mode === 'globe') { const n = Math.min(N, 1500); for (let i = 0; i < n; i++) { rr = (rr + 1) % N; if (!cand[rr] && OBJ[rr].kind === 2) writeState(rr, stateAt(OBJ[rr], t, sun.c, sun.s, sun.eci, true)); } }
    }
    force = false;
    let tv = 0; counts = [0, 0, 0];
    for (let j = 0; j < N; j++) {
      const o = OBJ[j], kd = o.kind, el = curEl[j], lit = curLit[j];
      if (el >= 10 && lit && sun.el < -6) counts[kd]++;
      pPos[j * 3] = cur[j * 3]; pPos[j * 3 + 1] = cur[j * 3 + 1]; pPos[j * 3 + 2] = cur[j * 3 + 2];
      const above = mode === 'globe' ? true : el > 0;
      let vis = layer[kd] && above && (lit || showShade);
      if (j === sel && above) vis = true;
      curVis[j] = vis ? 1 : 0;
      let a = 0, s = 0, c = COL[kd];
      if (vis) {
        if (!lit) { c = SHADE; a = 0.55; s = BASES[kd] * 0.8; }
        else { a = BASEA[kd]; s = BASES[kd]; if (mode === 'globe' && el < 10) { a *= 0.3; s *= 0.7; } if (mode !== 'globe' && sun.el > -6) a *= 0.45; }
        if (j === sel) { s = 12; a = 1; }
      }
      pCol[j * 4] = c[0]; pCol[j * 4 + 1] = c[1]; pCol[j * 4 + 2] = c[2]; pCol[j * 4 + 3] = a; pSize[j] = s;
      if (vis && lit && tv < MAXTR * TR - TR && (mode !== 'globe' || el > 0)) {
        PV.set(cur[j * 3], cur[j * 3 + 1], cur[j * 3 + 2]);
        const base = TRA[kd] * (sun.el > -6 && mode !== 'globe' ? 0.45 : 1);
        for (let m = 1; m <= TR; m++) {
          const st = stateAt(o, t - m * TR_DT, sun.c, sun.s, sun.eci, true);
          if (st.lit < 0.5 || (mode !== 'globe' && st.el < 0)) break;
          toScene(st, QV);
          const fa = Math.pow(1 - (m - 1) / TR, 1.6) * base, fb = Math.pow(1 - m / TR, 1.6) * base, q = tv * 6;
          trPos[q] = PV.x; trPos[q + 1] = PV.y; trPos[q + 2] = PV.z; trPos[q + 3] = QV.x; trPos[q + 4] = QV.y; trPos[q + 5] = QV.z;
          trCol[q] = c[0] * fa; trCol[q + 1] = c[1] * fa; trCol[q + 2] = c[2] * fa; trCol[q + 3] = c[0] * fb; trCol[q + 4] = c[1] * fb; trCol[q + 5] = c[2] * fb;
          tv++; PV.copy(QV);
        }
      }
    }
    trGeo.setDrawRange(0, tv * 2); trGeo.attributes.position.needsUpdate = true; trGeo.attributes.color.needsUpdate = true;
    pGeo.attributes.position.needsUpdate = true; pGeo.attributes.aCol.needsUpdate = true; pGeo.attributes.aSize.needsUpdate = true;
    domeMat.uniforms.uSun.value.set(sun.enu[0], sun.enu[2], -sun.enu[1]); domeMat.uniforms.uSunAlt.value = sun.el;
    const sl = Math.hypot(sun.ecef[0], sun.ecef[1], sun.ecef[2]), sg = new THREE.Vector3(sun.ecef[0] / sl, sun.ecef[2] / sl, -sun.ecef[1] / sl);
    earthMat.uniforms.uSun.value.copy(sg);
    shadow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), sg.clone().negate()); shadow.position.copy(sg).multiplyScalar(-2.5);
    if (mode !== 'globe') updateStars(t, sun.el);
    updateAurora(t, sun);
    if (sel >= 0) drawSelTrack(t, sun);
    updateReadout(t, sun);
  }

  function drawSelTrack(t, sun) {
    let n = 0; const o = OBJ[sel], c = COL[o.kind];
    let prevOk = false;
    for (let i = 0; i < SELN; i++) {
      const tt = t + (i - (SELN - 1) / 2) * 15000, st = stateAt(o, tt, Math.cos(O.gmst(tt)), Math.sin(O.gmst(tt)), sun.eci, true);
      const ok = mode === 'globe' || st.el >= 0, lit = st.lit >= 0.5;
      toScene(st, QV);
      if (prevOk && ok && n < SELN - 1) { const f = (lit ? 0.9 : 0.35) * (i <= (SELN - 1) / 2 ? 0.55 : 1), col = lit ? c : SHADE;
        selPos.set([PV.x, PV.y, PV.z, QV.x, QV.y, QV.z], n * 6); selCol.set([col[0] * f, col[1] * f, col[2] * f, col[0] * f, col[1] * f, col[2] * f], n * 6); n++; }
      PV.copy(QV); prevOk = ok;
    }
    selGeo.setDrawRange(0, n * 2); selGeo.attributes.position.needsUpdate = true; selGeo.attributes.color.needsUpdate = true;
  }

  function skyState(el) { return el > -0.83 ? 'Daylight' : el > -6 ? 'Civil twilight' : el > -12 ? 'Nautical twilight' : el > -18 ? 'Astronomical twilight' : 'Dark'; }
  let lastReadout = '';
  function updateReadout(t, sun) {
    const o = oslo(t), clock = o.h + ':' + o.mi + ':' + o.s;
    if (clock === lastReadout && !force) return; lastReadout = clock;
    $('clock').textContent = clock;
    const off = Math.round((t - Date.now()) / 60000);
    let dl = dateStr(t);
    if (!live) dl += ' · ' + (off === 0 ? 'now' : (off > 0 ? '+' : '−') + (Math.abs(off) >= 60 ? Math.floor(Math.abs(off) / 60) + ' h ' : '') + (Math.abs(off) % 60) + ' min') + (speed > 1 ? ' · ' + speed + '×' : '');
    $('dateline').textContent = dl;
    $('sunline').textContent = 'Sun ' + num(sun.el, 1) + '° · ' + skyState(sun.el);
    const parts = [];
    if (sun.el < -6) {
      if (counts[0]) parts.push('<span class="b">' + (counts[0] === 1 ? '1 space station' : counts[0] + ' space stations') + '</span>');
      parts.push('<span class="b">' + counts[1] + ' bright</span>');
      if (starlinkState === 'ok') parts.push('<span class="s">' + counts[2] + ' Starlink</span>');
      if (AUR.pN != null && Math.abs(t - Date.now()) < 90 * 60000) parts.push('<span class="a">aurora ' + Math.round(AUR.pN) + ' %</span>');
      $('nowline').innerHTML = 'Visible: ' + parts.join(' · ');
    } else $('nowline').textContent = 'Too bright to see satellites';
    $('livetxt').textContent = live ? 'Live' : 'Shifted';
    const ti = $('time'); if (document.activeElement !== ti) ti.value = Math.max(-60, Math.min(720, off));
    // banner
    const msgs = [];
    if (sun.el > -6) msgs.push(nextDark ? 'The sky is too bright right now. It gets dark enough around ' + hm(nextDark) + (dayKey(nextDark) !== dayKey(t) ? ' (' + dateStr(nextDark) + ')' : '') + '.' : 'The sky is too bright to see satellites right now.');
    const oldest = Math.max(dataAgeDays(), starlinkState === 'ok' ? slAgeDays() : 0);
    if (oldest > 4) msgs.push('The orbit data is ' + Math.floor(oldest) + ' days old, so positions may be off by several degrees.');
    $('banner').hidden = !msgs.length; $('bannertxt').textContent = msgs.join(' ');
  }

  // ---------- camera ----------
  let narv = geoV(LAT, LON, 1);
  const cam = { dome: { th: 20 * D2R, pol: 60 * D2R, dist: 30 }, look: { az: 320 * D2R, pitch: 32 * D2R, fov: 95 }, globe: { th: Math.atan2(narv.x, narv.z), pol: Math.acos(narv.y) + 32 * D2R, dist: 3.4 } };
  function placeCamera() {
    const w = stage.clientWidth, h = stage.clientHeight, asp = w / Math.max(1, h); camera.aspect = asp;
    if (mode === 'look') {
      const hf = cam.look.fov * D2R; camera.fov = Math.min(150, 2 * Math.atan(Math.tan(hf / 2) / asp) / D2R);
      camera.position.set(0, 0.25, 0);
      const c = cam.look, d = new THREE.Vector3(Math.cos(c.pitch) * Math.sin(c.az), Math.sin(c.pitch), -Math.cos(c.pitch) * Math.cos(c.az));
      camera.up.set(0, 1, 0); camera.lookAt(d.add(camera.position));
    } else {
      camera.fov = asp < 1 ? 2 * Math.atan(Math.tan(24 * D2R) / asp) / D2R : 48;
      const c = cam[mode], tgt = mode === 'dome' ? new THREE.Vector3(0, 2.6, 0) : narv.clone().multiplyScalar(0.55);
      camera.position.set(tgt.x + c.dist * Math.sin(c.pol) * Math.sin(c.th), tgt.y + c.dist * Math.cos(c.pol), tgt.z + c.dist * Math.sin(c.pol) * Math.cos(c.th));
      camera.up.set(0, 1, 0); camera.lookAt(tgt);
    }
    camera.near = mode === 'globe' ? 0.01 : 0.05; camera.updateProjectionMatrix();
  }
  function rotate(dx, dy) {
    const h = stage.clientHeight || 400;
    if (mode === 'look') { const k = camera.fov * D2R / h; cam.look.az -= dx * k; cam.look.pitch = Math.max(-0.08, Math.min(1.56, cam.look.pitch + dy * k)); }
    else { const c = cam[mode]; c.th -= dx * 0.006; c.pol = Math.max(mode === 'globe' ? 0.05 : 0.12, Math.min(mode === 'globe' ? Math.PI - 0.05 : 1.55, c.pol - dy * 0.006)); }
  }
  function zoom(f) {
    if (mode === 'look') cam.look.fov = Math.max(35, Math.min(120, cam.look.fov * f));
    else if (mode === 'dome') cam.dome.dist = Math.max(11, Math.min(70, cam.dome.dist * f));
    else cam.globe.dist = Math.max(1.4, Math.min(12, cam.globe.dist * f));
  }
  const ptrs = new Map(); let down = null, pinch = null;
  const pdist = () => { const v = [...ptrs.values()]; return Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y); };
  canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 }; else { pinch = pdist(); if (down) down.moved = 99; } });
  canvas.addEventListener('pointermove', e => { const p = ptrs.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 1) { rotate(dx, dy); if (down) down.moved += Math.abs(dx) + Math.abs(dy); } else if (ptrs.size === 2 && pinch) { const d = pdist(); if (d > 0) zoom(pinch / d); pinch = d; } });
  const up = e => { if (!ptrs.has(e.pointerId)) return; ptrs.delete(e.pointerId);
    if (down && ptrs.size === 0 && down.moved < 8 && performance.now() - down.t < 600) pick(e.clientX, e.clientY);
    if (ptrs.size < 2) pinch = null; if (ptrs.size === 0) down = null; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => { e.preventDefault(); zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
  const PJ = new THREE.Vector3();
  function project(x, y, z) { PJ.set(x, y, z).project(camera); const r = canvas.getBoundingClientRect(); return { x: (PJ.x + 1) / 2 * r.width, y: (1 - PJ.y) / 2 * r.height, z: PJ.z }; }
  function occluded(x, y, z) { if (mode !== 'globe') return false; const o = camera.position, d = new THREE.Vector3(x - o.x, y - o.y, z - o.z), L = d.length(); d.divideScalar(L);
    const b = o.dot(d), c = o.lengthSq() - 1, disc = b * b - c; if (disc < 0) return false; const t1 = -b - Math.sqrt(disc); return t1 > 0 && t1 < L; }
  function pick(cx, cy) {
    const r = canvas.getBoundingClientRect(), x = cx - r.left, y = cy - r.top; let best = -1, bd = 26;
    for (let j = 0; j < N; j++) { if (!curVis[j]) continue; const p = project(cur[j * 3], cur[j * 3 + 1], cur[j * 3 + 2]); if (p.z > 1 || p.z < -1) continue;
      const d = Math.hypot(p.x - x, p.y - y) - (OBJ[j].kind !== 2 ? 6 : 0); if (d < bd && !occluded(cur[j * 3], cur[j * 3 + 1], cur[j * 3 + 2])) { bd = d; best = j; } }
    select(best);
  }

  // ---------- selection & tag ----------
  const tag = $('tag');
  function select(j) {
    sel = j; selLine.visible = j >= 0; selRing.visible = j >= 0;
    document.querySelectorAll('.row').forEach(r => r.setAttribute('aria-pressed', String(+r.dataset.j === j)));
    if (j < 0) { tag.hidden = true; selGeo.setDrawRange(0, 0); } else if (sunNow) drawSelTrack(simNow(), sunNow);
  }
  function updateTag() {
    if (sel < 0) return;
    const j = sel, x = cur[j * 3], y = cur[j * 3 + 1], z = cur[j * 3 + 2], p = project(x, y, z), el = curEl[j], lit = curLit[j];
    const show = curVis[j] && p.z < 1 && p.z > -1 && !occluded(x, y, z);
    selRing.visible = !!show; selRing.position.set(x, y, z);
    const sc = mode === 'look' ? R * 0.07 * (camera.fov / 90) : camera.position.distanceTo(selRing.position) * 0.06; selRing.scale.set(sc, sc, 1);
    if (!show) { tag.hidden = true; return; }
    const o = OBJ[j], t = simNow(), st = stateAt(o, t, Math.cos(O.gmst(t)), Math.sin(O.gmst(t)), sunNow.eci, false), alt = Math.hypot(st.x, st.y, st.z) - 6371;
    const nx = PASSES.find(ps => ps.j === j && ps.tEnd > t);
    tag.innerHTML = '<b>' + esc(o.name) + '</b><span>' + kindLabel(o) + ' · ' + Math.round(alt) + ' km up</span><br><span>' + (el >= 0 ? num(el) + '° above the horizon to the ' + dirName(curAz[j]) : 'below the horizon') + ' · ' + (lit ? 'in sunlight' : 'in Earth’s shadow') + '</span>' +
      (nx ? '<br><span>' + (nx.tStart <= t ? 'Visible now, highest ' : 'Next: ') + num(nx.maxEl) + '° at ' + hm(nx.tMax) + '</span>' : '');
    tag.hidden = false;
    const r = stage.getBoundingClientRect(), tw = tag.offsetWidth, th = tag.offsetHeight; let left = p.x + 14, top = p.y - th / 2;
    if (left + tw > r.width - 8) left = p.x - tw - 14;
    top = Math.max(56, Math.min(r.height - th - 44, top)); left = Math.max(8, left);
    tag.style.transform = 'translate(' + Math.round(left) + 'px,' + Math.round(top) + 'px)';
  }

  // ---------- predictions ----------
  let PASSES = [], nextDark = null;
  const sleep = () => new Promise(r => setTimeout(r, 0));
  let predGen = 0;
  async function predictPasses() {
    const gen = predGen, t0 = Date.now(), STEP = 20000, NSx = Math.ceil(12 * 3600000 / STEP);
    const g = [], sunE = [], sunEl = [];
    for (let k = 0; k <= NSx; k++) { const t = t0 + k * STEP, s = sunAt(t); g.push([s.c, s.s]); sunE.push(s.eci); sunEl.push(s.el); }
    nextDark = null; for (let k = 0; k <= NSx; k++) if (sunEl[k] < -6) { nextDark = t0 + k * STEP; break; }
    if (!nextDark) { for (let t = t0 + 12 * 3600000; t < t0 + 48 * 3600000; t += 300000) if (sunAt(t).el < -6) { nextDark = t; break; } }
    const out = [];
    for (let j = 0; j < N; j++) {
      const o = OBJ[j]; if (o.kind === 2) continue;
      let cur = null;
      for (let k = 0; k <= NSx; k++) {
        const t = t0 + k * STEP;
        if (sunEl[k] >= -6) { if (cur) { out.push(cur); cur = null; } continue; }
        const st = stateAt(o, t, g[k][0], g[k][1], sunE[k], false);
        let vis = false;
        if (st.el >= 10) { const r = O.prop(o.s, t).r; vis = O.litFraction(r, sunE[k]) >= 0.5; }
        if (vis) { if (!cur) cur = { j, tStart: t, azStart: st.az, maxEl: -1 }; cur.tEnd = t; cur.azEnd = st.az; if (st.el > cur.maxEl) { cur.maxEl = st.el; cur.tMax = t; cur.azMax = st.az; } }
        else if (cur) { out.push(cur); cur = null; }
      }
      if (cur) out.push(cur);
      if (j % 12 === 11) { await sleep(); if (gen !== predGen) return; }
    }
    out.sort((a, b) => a.tMax - b.tMax);
    if (gen !== predGen) return;
    PASSES = out; renderPasses();
  }
  function renderPasses() {
    const rows = $('rows'); rows.innerHTML = '';
    const now = Date.now(), list = PASSES.filter(p => p.tEnd >= now - 60000).slice(0, 40);
    if (!list.length) { const d = document.createElement('div'); d.className = 'empty'; d.textContent = nextDark ? 'No bright passes while it is dark in the next 12 hours. The next dark period starts around ' + hm(nextDark) + '.' : 'No bright passes in the next 12 hours.'; rows.appendChild(d); return; }
    list.forEach(p => {
      const o = OBJ[p.j], b = document.createElement('button'); b.type = 'button'; b.className = 'row' + (o.kind === 0 ? ' st' : ''); b.dataset.j = p.j; b.setAttribute('aria-pressed', String(sel === p.j));
      const onNow = p.tStart <= now && p.tEnd >= now, other = dayKey(p.tMax) !== dayKey(now);
      b.innerHTML = '<span class="t">' + hm(p.tMax) + (onNow ? '<small class="on">now</small>' : other ? '<small>' + oslo(p.tMax).wd + '</small>' : '') + '</span><span class="n"><b>' + esc(o.name) + '</b><span>' + kindLabel(o) + ' · from ' + dirName(p.azStart) + ' to ' + dirName(p.azEnd) + '</span></span><span class="e' + (p.maxEl >= 60 ? ' hi' : '') + '">' + num(p.maxEl) + '°</span><span class="d">' + dirName(p.azMax) + '</span>';
      b.addEventListener('click', () => {
        if (sel === p.j) { select(-1); return; }
        select(p.j);
        if (Math.abs(p.tMax - Date.now()) < 30000) goLive(); else setSim(p.tMax - 30000, 1);
        const r = stage.getBoundingClientRect(); if (r.top < 0 || r.bottom > window.innerHeight + 40) stage.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      });
      $('rows').appendChild(b);
    });
  }
  async function predictStations() {
    const gen = predGen, dl = $('stations'); dl.innerHTML = '';
    const t0 = Date.now(), STEP = 30000, DAYS = 5, NSx = DAYS * 2880;
    for (const id of [25544, 48274]) {
      const j = OBJ.findIndex(o => o.id === id); const name = id === 25544 ? 'ISS' : 'Tiangong';
      const dt = document.createElement('dt'); dt.textContent = name; const dd = document.createElement('dd'); dl.append(dt, dd);
      if (j < 0) { dd.textContent = 'No orbit data.'; continue; }
      let first = null, maxAny = -90, maxT = 0, k0 = 0;
      for (let k = 0; k <= NSx; k++) {
        const t = t0 + k * STEP, gm = O.gmst(t), st = stateAt(OBJ[j], t, Math.cos(gm), Math.sin(gm), null, false);
        if (st.el > maxAny) { maxAny = st.el; maxT = t; }
        if (!first && st.el >= 10) { const s = sunAt(t); if (s.el < -6 && O.litFraction(O.prop(OBJ[j].s, t).r, s.eci) >= 0.5) first = { t, el: st.el, az: st.az }; }
        if (k - k0 > 600) { k0 = k; await sleep(); if (gen !== predGen) return; }
      }
      if (first) dd.textContent = 'Next visible pass ' + dateStr(first.t) + ' at ' + hm(first.t) + ', towards ' + dirName(first.az) + '.';
      else if (maxAny < 0) dd.textContent = 'Never rises above the horizon as seen from ' + PLACE.name + '. Its orbit does not reach far enough north.';
      else if (maxAny < 10) dd.textContent = 'No visible passes in the next ' + DAYS + ' days. From ' + PLACE.name + ' it gets no higher than ' + num(maxAny) + '° above the southern horizon, because its orbit does not reach far enough north.';
      else dd.textContent = 'No visible passes in the next ' + DAYS + ' days. When it passes over ' + PLACE.name + ', it is either too bright or it is in Earth’s shadow.';
    }
  }

  // ---------- data info ----------
  let fetched = null, slFetched = null, slInfo = null;
  const dataAgeDays = () => fetched ? (Date.now() - fetched) / 86400000 : 0;
  const slAgeDays = () => slFetched ? (Date.now() - slFetched) / 86400000 : 0;
  function ageHtml(t) {
    const age = (Date.now() - t) / 86400000, h = Math.round(age * 24), cls = age < 1.5 ? 'ok' : age < 4 ? 'mid' : 'old', lbl = age < 1.5 ? 'fresh' : age < 4 ? 'OK' : 'old';
    return esc(dateStr(t)) + ' at ' + hm(t) + ' (' + (h < 1 ? 'under 1 h' : h < 48 ? h + ' h' : Math.floor(age) + ' days') + ' ago)<span class="pill ' + cls + '">' + lbl + '</span>';
  }
  function parsePolar(txt) {
    const nl = txt.indexOf('\n'), head = txt.slice(0, nl), body = txt.slice(nl + 1).trim(), m = /T0=(\S+)/.exec(head);
    if (!m) return [];
    return body.split(';').map(r => { const f = r.split(','); if (f.length < 6) return null;
      return { name: 'STARLINK-' + f[0], intl: '', epoch: m[1], n: 14 + f[4] / 1e5, e: 0, i: f[1] / 100, raan: f[2] / 100, argp: 0, M: f[3] / 100, id: 0, ndot: f[5] / 1e6 }; }).filter(Boolean);
  }
  function renderDataInfo() {
    const dl = $('datainfo'); dl.innerHTML = '';
    const add = (k, html) => { const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.innerHTML = html; dl.append(dt, dd); };
    if (fetched) add('Bright', ageHtml(fetched));
    if (slFetched && starlinkState !== 'none') add('Starlink', ageHtml(slFetched));
    const nb = OBJ.filter(o => o.kind !== 2).length, ns = OBJ.filter(o => o.kind === 2).length;
    add('Count', nb + ' bright objects and space stations' + (ns ? ' · ' + ns.toLocaleString('en-GB') + ' Starlink' : ''));
    if (starlinkState === 'ok') add('Selection', slInfo && slInfo.format === 'polar'
      ? 'Starlink in orbits with 70° and 97° inclination, the ones that pass high over ' + PLACE.name + '. Starlink at 43° and 53° inclination never gets more than a few degrees above the southern horizon from here.'
      : 'Starlink with more than 50° inclination. The ones at 43° inclination never rise above the horizon in ' + PLACE.name + '.');
    else if (starlinkState === 'loading') add('Selection', 'Loading Starlink …');
    else if (starlinkState === 'old') add('Selection', 'The Starlink data is too old to give correct positions, so the layer is off until the next update.');
    else add('Selection', 'Starlink data is not available right now.');
  }
  function renderChips() {
    const c = [0, 0, 0]; OBJ.forEach(o => c[o.kind]++);
    $('c-station').textContent = c[0]; $('c-bright').textContent = c[1];
    const sb = $('l-starlink');
    if (starlinkState === 'ok') { $('c-starlink').textContent = c[2].toLocaleString('en-GB'); sb.disabled = false; }
    else { $('c-starlink').textContent = starlinkState === 'loading' ? '…' : starlinkState === 'old' ? 'data too old' : 'not loaded'; sb.disabled = true; sb.setAttribute('aria-pressed', 'false'); }
  }

  // ---------- controls ----------
  const modeBtns = { dome: $('m-dome'), look: $('m-look'), globe: $('m-globe') };
  function setMode(m) {
    if (m === 'globe') loadWorld();
    mode = m; Object.entries(modeBtns).forEach(([k, b]) => b.setAttribute('aria-pressed', String(k === m)));
    domeG.visible = m !== 'globe'; starG.visible = m !== 'globe'; globeG.visible = m === 'globe';
    domeMat.uniforms.uOpacity.value = m === 'look' ? 1.0 : 0.55; domeMat.side = m === 'look' ? THREE.BackSide : THREE.DoubleSide;
    domeG.children.forEach(c => { if (c.userData.compass !== undefined) { const az = c.userData.compass * D2R; if (m === 'look') c.position.copy(toDome(Math.sin(az), Math.cos(az), 0.05, R * 0.9)); else c.position.copy(toDome(Math.sin(az), Math.cos(az), 0, R + 1.4)).setY(0.5); }
      if (c.userData.domeOnly) c.visible = m === 'dome'; });
    narvikLbl.visible = m === 'dome'; force = true;
  }
  Object.entries(modeBtns).forEach(([k, b]) => b.addEventListener('click', () => setMode(k)));
  $('live').addEventListener('click', goLive);
  const ti = $('time');
  ti.addEventListener('input', () => setSim(Date.now() + (+ti.value) * 60000, speed));
  document.querySelectorAll('.speeds button').forEach(b => b.addEventListener('click', () => { const t = simNow(); setSim(t, +b.dataset.s); if (+b.dataset.s === 1 && Math.abs(t - Date.now()) < 5000) goLive(); }));
  [['l-station', 0], ['l-bright', 1], ['l-starlink', 2]].forEach(([id, k]) => $(id).addEventListener('click', e => { if (e.currentTarget.disabled) return; layer[k] = !layer[k]; e.currentTarget.setAttribute('aria-pressed', String(layer[k])); force = true; }));
  $('l-shade').addEventListener('click', e => { showShade = !showShade; e.currentTarget.setAttribute('aria-pressed', String(showShade)); force = true; });
  const pct = v => (v + 60) / 780 * 100;
  [['sc0', 0], ['sc3', 180], ['sc6', 360], ['sc9', 540]].forEach(([id, v]) => { $(id).style.left = pct(v) + '%'; });
  function paintRail() {
    const t0 = Date.now(), stops = [];
    for (let m = -60; m <= 720; m += 10) { const el = sunAt(t0 + m * 60000).el; const c = el > -0.83 ? 'rgba(255,198,107,.5)' : el > -6 ? 'rgba(255,198,107,.25)' : el > -12 ? 'rgba(159,214,255,.22)' : 'rgba(159,214,255,.42)'; stops.push(c + ' ' + pct(m).toFixed(2) + '%'); }
    document.documentElement.style.setProperty('--rail', 'linear-gradient(90deg, ' + stops.join(', ') + ')');
  }

  // ---------- northern lights: NOAA SWPC (OVATION, Kp, solar wind) + MET Norway (clouds), fetched live in the browser ----------
  const AUR = { grid: null, ovObs: null, ovFc: null, kp: null, kpTime: null, kpfc: [], bz: null, bt: null, speed: null, swTime: null, met: [], err: {}, pN: null, pSky: null, skyDir: null };
  let showAurora = true;
  // aGeo = (longitude deg, latitude deg, height 0..1). Slow travelling waves along the oval, a gentle shimmer up the curtain,
  // and a tiny sideways sway (rotation about the local vertical/polar axis) so the curtains ripple. Mean brightness ≈ unchanged.
  const aurTime = { value: 0 };
  const aurUni = (px, wob) => ({ uPx: { value: px }, uFade: { value: 1 }, uMax: { value: 120 }, uTime: aurTime, uWob: { value: wob } });
  const AUR_VS = [
    'attribute vec4 aCol; attribute float aAng; attribute vec3 aGeo; uniform float uPx; uniform float uMax; uniform float uTime; uniform float uWob; varying vec4 vCol;',
    'void main(){',
    ' float w = sin(aGeo.x * 0.35 + uTime * 0.6 + sin(aGeo.y * 0.9 + uTime * 0.25) * 1.6);',
    ' float sh = sin(aGeo.z * 5.0 - uTime * 0.9 + aGeo.x * 0.7);',
    ' float k = (0.6 + 0.4 * w) * (0.9 + 0.1 * sh) * 1.85;',
    ' vCol = vec4(aCol.rgb, aCol.a * k);',
    ' float ang = uWob * sin(aGeo.y * 1.3 + aGeo.x * 0.12 + uTime * 0.4) * (0.6 + 0.4 * aGeo.z);',
    ' float c = cos(ang), s = sin(ang);',
    ' vec3 p = vec3(c * position.x + s * position.z, position.y, -s * position.x + c * position.z);',
    ' gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); gl_PointSize = clamp(aAng * uPx, 1.5, uMax); }'].join('\n');
  const AUR_FS = 'varying vec4 vCol; uniform float uFade; void main(){ vec2 p = gl_PointCoord - 0.5; float d = dot(p, p); float a = exp(-d * 14.0) * vCol.a * uFade; if (a < 0.003) discard; gl_FragColor = vec4(vCol.rgb * a, a); }';
  const aurDomeMat = new THREE.ShaderMaterial({ uniforms: aurUni(400, 0.006),vertexShader: AUR_VS, fragmentShader: AUR_FS, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  const aurGlobeMat = new THREE.ShaderMaterial({ uniforms: aurUni(400, 0.004),vertexShader: AUR_VS, fragmentShader: AUR_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  aurGlobeMat.uniforms.uMax.value = 40;
  let aurDome = null, aurGlobe = null;
  const HEIGHTS = [100, 118, 140, 168, 205, 250], HF = [0.5, 0.62, 0.55, 0.36, 0.2, 0.11];
  const HCOL = [[0.30, 1.0, 0.58], [0.32, 1.0, 0.6], [0.36, 0.98, 0.62], [0.45, 0.9, 0.62], [0.95, 0.38, 0.55], [1.0, 0.3, 0.5]];
  function gridAt(lon, lat) {
    const g = AUR.grid; if (!g) return 0;
    lon = ((lon % 360) + 360) % 360; const x0 = Math.floor(lon), y0 = Math.floor(lat + 90), fx = lon - x0, fy = lat + 90 - y0;
    const v = (x, y) => g[((x % 360) * 181) + Math.min(180, Math.max(0, y))];
    return v(x0, y0) * (1 - fx) * (1 - fy) + v(x0 + 1, y0) * fx * (1 - fy) + v(x0, y0 + 1) * (1 - fx) * fy + v(x0 + 1, y0 + 1) * fx * fy;
  }
  function buildAurora() {
    const g = AUR.grid; if (!g) return; AUR.pN = gridAt(LON, LAT);
    if (aurDome) { scene.remove(aurDome); aurDome.geometry.dispose(); }
    if (aurGlobe) { globeG.remove(aurGlobe); aurGlobe.geometry.dispose(); }
    // dome: emission columns within sight of the observer
    const P = [], C = [], A = [], GE = []; let pSky = 0, skyAz = null;
    for (let lat = 52; lat <= 86; lat++) for (let lo = -45; lo <= 80; lo++) {
      const p = g[(((lo % 360) + 360) % 360) * 181 + lat + 90]; if (p < 3) continue;
      for (let h = 0; h < HEIGHTS.length; h++) {
        const e = O.geodeticToEcef(lat, lo, HEIGHTS[h]), v = enu(e[0], e[1], e[2]), L = Math.hypot(v[0], v[1], v[2]), el = Math.asin(v[2] / L) / D2R;
        if (el < -1) continue;
        if (h === 1 && el >= 12 && p > pSky) { pSky = p; let az = Math.atan2(v[0], v[1]) / D2R; skyAz = az < 0 ? az + 360 : az; }
        const q = toDome(v[0] / L, v[1] / L, v[2] / L, R * 0.955); P.push(q.x, q.y, q.z);
        const ext = 0.22 + 0.78 * Math.min(1, Math.max(0, el) / 25);
        const a = Math.min(1, p / 32) * HF[h] * ext, c = HCOL[h]; C.push(c[0], c[1], c[2], a);
        A.push(Math.min(0.7, 150 / L)); GE.push(lo, lat, h / (HEIGHTS.length - 1));
      }
    }
    AUR.pSky = pSky; AUR.skyDir = skyAz;
    let geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3)); geo.setAttribute('aCol', new THREE.BufferAttribute(new Float32Array(C), 4)); geo.setAttribute('aAng', new THREE.BufferAttribute(new Float32Array(A), 1));
    geo.setAttribute('aGeo', new THREE.BufferAttribute(new Float32Array(GE), 3));
    aurDome = new THREE.Points(geo, aurDomeMat); aurDome.renderOrder = 2; aurDome.frustumCulled = false; scene.add(aurDome);
    // globe: the whole oval, both hemispheres, at 110 km
    const P2 = [], C2 = [], A2 = [], G2 = [];
    for (let lo = 0; lo < 360; lo++) for (let y = 0; y <= 180; y++) {
      const p = g[lo * 181 + y], lat = y - 90; if (p < 3 || Math.abs(lat) < 35) continue;
      const v = geoV(lat, lo, 1 + 110 / RE), a = Math.min(1, p / 22);
      P2.push(v.x, v.y, v.z); C2.push(0.36, 1.0, 0.62, 0.7 * a); A2.push(0.034); G2.push(lo, lat, 0);
      const w = geoV(lat, lo, 1 + 180 / RE); P2.push(w.x, w.y, w.z); C2.push(0.45, 1.0, 0.7, 0.25 * a); A2.push(0.075); G2.push(lo, lat, 1);
    }
    geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P2), 3)); geo.setAttribute('aCol', new THREE.BufferAttribute(new Float32Array(C2), 4)); geo.setAttribute('aAng', new THREE.BufferAttribute(new Float32Array(A2), 1));
    geo.setAttribute('aGeo', new THREE.BufferAttribute(new Float32Array(G2), 3));
    aurGlobe = new THREE.Points(geo, aurGlobeMat); aurGlobe.renderOrder = 3; aurGlobe.frustumCulled = false; globeG.add(aurGlobe);
  }
  function updateAurora(t, sun) {
    const nearNow = Math.abs(t - Date.now()) < 90 * 60000, fresh = AUR.ovObs && Date.now() - AUR.ovObs < 3 * 3600000;
    const on = showAurora && nearNow && fresh;
    const dark = Math.max(0, Math.min(1, (-sun.el - 4) / 8));
    const pxScreen = renderer.getPixelRatio() * stage.clientHeight / (camera.fov * D2R);
    if (!reduce) aurTime.value = performance.now() / 1000;
    if (aurDome) { aurDome.visible = on && mode !== 'globe' && dark > 0; aurDomeMat.uniforms.uFade.value = dark;
      aurDomeMat.uniforms.uPx.value = mode === 'look' ? pxScreen : pxScreen * R / Math.max(1, camera.position.length()); }
    if (aurGlobe) { aurGlobe.visible = on && mode === 'globe'; aurGlobeMat.uniforms.uPx.value = pxScreen / Math.max(0.5, camera.position.distanceTo(narv.clone().multiplyScalar(0.55))); }
  }

  // data
  async function getJSON(u, opt) { const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 30000);
    try { const r = await fetch(u, Object.assign({ signal: ctl.signal }, opt || {})); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); } finally { clearTimeout(to); } }
  const SWPC = 'https://services.swpc.noaa.gov/';
  async function loadOvation() {
    try { const j = await getJSON(SWPC + 'json/ovation_aurora_latest.json', { cache: 'no-store' });
      const g = new Uint8Array(360 * 181); for (const c of j.coordinates) { const lo = ((c[0] % 360) + 360) % 360, y = c[1] + 90; if (y >= 0 && y <= 180) g[lo * 181 + y] = Math.min(255, Math.max(0, c[2])); }
      AUR.grid = g; AUR.ovObs = Date.parse(j['Observation Time']); AUR.ovFc = Date.parse(j['Forecast Time']); AUR.err.ov = null; buildAurora();
    } catch (e) { AUR.err.ov = e.message; }
    renderAurora();
  }
  async function loadKp() {
    try { const j = await getJSON(SWPC + 'json/planetary_k_index_1m.json', { cache: 'no-store' }); const last = j[j.length - 1];
      AUR.kp = +(last.estimated_kp ?? last.kp_index); AUR.kpTime = Date.parse(last.time_tag + 'Z'); AUR.err.kp = null; } catch (e) { AUR.err.kp = e.message; }
    try { const s = await getJSON(SWPC + 'products/summary/solar-wind-mag-field.json', { cache: 'no-store' }), w = await getJSON(SWPC + 'products/summary/solar-wind-speed.json', { cache: 'no-store' });
      const m = Array.isArray(s) ? s[0] : s, v = Array.isArray(w) ? w[0] : w;
      AUR.bz = m && m.bz_gsm != null ? +m.bz_gsm : null; AUR.bt = m && m.bt != null ? +m.bt : null; AUR.speed = v && v.proton_speed != null ? +v.proton_speed : null; AUR.swTime = Date.parse((m && m.time_tag) || (v && v.time_tag)); AUR.err.sw = null;
    } catch (e) { AUR.err.sw = e.message; }
    renderAurora();
  }
  async function loadKpForecast() {
    try { const j = await getJSON(SWPC + 'products/noaa-planetary-k-index-forecast.json');
      const rows = Array.isArray(j[0]) ? j.slice(1).map(r => ({ t: r[0], kp: +r[1], obs: r[2] })) : j.map(r => ({ t: r.time_tag, kp: +r.kp, obs: r.observed }));
      AUR.kpfc = rows.map(r => ({ t: Date.parse(String(r.t).replace(' ', 'T') + (/Z$/.test(r.t) ? '' : 'Z')), kp: r.kp, obs: r.obs })).filter(r => isFinite(r.t) && isFinite(r.kp)); AUR.err.fc = null;
    } catch (e) { AUR.err.fc = e.message; }
    renderAurora();
  }
  async function loadMet() {
    try { const j = await getJSON('https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=' + LAT.toFixed(2) + '&lon=' + LON.toFixed(2));
      AUR.met = j.properties.timeseries.map(s => ({ t: Date.parse(s.time), c: s.data.instant.details.cloud_area_fraction })).filter(s => s.c != null); AUR.err.met = null;
    } catch (e) { AUR.err.met = e.message; }
    renderAurora();
  }
  const cloudAt = t => { let best = null; for (const s of AUR.met) if (s.t <= t + 30 * 60000) best = s; return best; };

  // panel
  const kpCls = k => k >= 5 ? 'storm' : k >= 3 ? 'act' : 'calm';
  function renderAurora() {
    const now = Date.now(), sun = sunAt(now), cl = cloudAt(now), pN = AUR.pN, pSky = AUR.pSky;
    const vEl = $('a-verdict'), sum = $('a-summary');
    let verdict = 'Loading …', cls = 'wait', text = '';
    const score = pN == null ? null : Math.max(pN, (pSky || 0) * 0.8);
    if (AUR.err.ov && pN == null) { verdict = 'No data'; cls = 'low'; text = 'Could not fetch the northern lights forecast from NOAA right now. The page will try again in a few minutes.'; }
    else if (score != null) {
      const dir = AUR.skyDir != null ? dirName(AUR.skyDir) : null;
      const where = pSky > pN + 3 && dir ? ' Strongest to the ' + dir + ', up to ' + Math.round(pSky) + ' % there.' : '';
      if (sun.el > -8) { verdict = 'Too bright'; cls = 'low'; text = 'The sky is too bright for northern lights right now.' + (nextDark ? ' It gets dark around ' + hm(nextDark) + '.' : '') + ' The forecast below shows the activity.'; }
      else if (cl && cl.c >= 85) { verdict = 'Cloudy'; cls = 'cloud'; text = 'There is ' + Math.round(cl.c) + ' % cloud cover over ' + PLACE.name + ', so the northern lights will be hard to see even though activity is ' + (score >= 12 ? 'good' : 'low') + '.'; }
      else {
        if (score >= 30) { verdict = 'Good chances'; cls = 'good'; } else if (score >= 12) { verdict = 'Possible'; cls = 'mid'; } else if (score >= 5) { verdict = 'Slight chance'; cls = 'mid'; } else { verdict = 'Unlikely'; cls = 'low'; }
        text = (score >= 12 ? 'Go out and look, ideally away from street lights.' : score >= 5 ? 'Faint northern lights may show low in the sky, best seen from a dark spot.' : 'Little activity right now.') + where + (cl && cl.c >= 50 ? ' It is partly cloudy (' + Math.round(cl.c) + ' %).' : '');
      }
    }
    vEl.textContent = verdict; vEl.className = 'verdict ' + cls; sum.textContent = text || 'Loading data from NOAA and the Norwegian Meteorological Institute …';
    $('a-prob').textContent = pN == null ? '–' : Math.round(pN) + ' %';
    $('a-kp').textContent = AUR.kp == null ? '–' : num(AUR.kp, 1); $('a-kp').className = AUR.kp == null ? '' : 'kp-' + kpCls(AUR.kp);
    $('a-cloud').textContent = cl ? Math.round(cl.c) + ' %' : '–';
    $('c-aurora').textContent = pN == null ? '–' : Math.round(pN) + ' %';
    // solar wind
    const sw = $('a-wind'); sw.innerHTML = '';
    const add = (k, html) => { const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.innerHTML = html; sw.append(dt, dd); };
    if (AUR.bz != null) add('Bz', '<b class="' + (AUR.bz <= -5 ? 'good' : AUR.bz < 0 ? 'mid' : '') + '">' + num(AUR.bz, 0) + ' nT</b> · ' + (AUR.bz < 0 ? 'pointing south, which helps the northern lights' : 'pointing north, which dampens the northern lights'));
    if (AUR.speed != null) add('Solar wind', '<b class="' + (AUR.speed >= 550 ? 'good' : AUR.speed >= 450 ? 'mid' : '') + '">' + Math.round(AUR.speed) + ' km/s</b> · ' + (AUR.speed >= 550 ? 'fast' : AUR.speed >= 450 ? 'fairly fast' : 'calm'));
    if (AUR.bz == null && AUR.speed == null) add('Solar wind', AUR.err.sw ? 'Not available right now' : 'Loading …');
    // Kp forecast: next 8 three-hour blocks
    const kb = $('a-kpfc'); kb.innerHTML = '';
    const blocks = AUR.kpfc.filter(r => r.t + 3 * 3600000 > now).slice(0, 8);
    blocks.forEach(r => { const d = document.createElement('div'); d.className = 'kb ' + kpCls(r.kp) + (r.t <= now ? ' cur' : '');
      d.innerHTML = '<i style="height:' + Math.max(6, r.kp / 9 * 100).toFixed(0) + '%"></i><b>' + num(r.kp, 0) + '</b><span>' + oslo(r.t).h + '</span>'; d.title = 'Kp ' + num(r.kp, 1) + ' from ' + hm(r.t); kb.appendChild(d); });
    if (!blocks.length) kb.innerHTML = '<p class="m">' + (AUR.err.fc ? 'The Kp forecast is not available right now.' : 'Loading Kp forecast …') + '</p>';
    // clouds next 12 h
    const cb = $('a-clouds'); cb.innerHTML = '';
    const hrs = AUR.met.filter(s => s.t >= now - 30 * 60000).slice(0, 12);
    hrs.forEach((s, i) => { const d = document.createElement('div'); d.className = 'cb'; d.title = Math.round(s.c) + ' % cloud cover at ' + hm(s.t);
      d.innerHTML = '<i style="height:' + Math.max(4, s.c).toFixed(0) + '%"></i><span>' + (i % 3 === 0 ? oslo(s.t).h : '') + '</span>'; cb.appendChild(d); });
    if (!hrs.length) cb.innerHTML = '<p class="m">' + (AUR.err.met ? 'The cloud forecast is not available right now.' : 'Loading cloud forecast …') + '</p>';
    const upd = [AUR.ovObs, AUR.kpTime].filter(Boolean);
    $('a-updated').textContent = upd.length ? 'Northern lights data from ' + hm(Math.max(...upd)) + '.' : '';
  }
  $('l-aurora').addEventListener('click', e => { showAurora = !showAurora; e.currentTarget.setAttribute('aria-pressed', String(showAurora)); });
  function startAurora() {
    loadOvation(); loadKp(); loadKpForecast(); loadMet();
    const every = (fn, min) => setInterval(() => { if (!document.hidden) fn(); }, min * 60000);
    every(loadOvation, 10); every(loadKp, 3); every(loadKpForecast, 60); every(loadMet, 30); every(renderAurora, 1);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && AUR.ovObs && Date.now() - AUR.ovObs > 15 * 60000) { loadOvation(); loadKp(); } });
  }

  // ---------- place switch ----------
  function applyPlaceText() {
    document.querySelectorAll('.pname').forEach(e => { e.textContent = PLACE.name; });
    $('pcoords').textContent = num(LAT, 2) + '° N ' + num(LON, 2) + '° E';
    document.title = 'Satellite Watch ' + PLACE.name;
    $('cv').setAttribute('aria-label', '3D view of satellites over ' + PLACE.name);
    document.querySelectorAll('.place button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.place === PLACE.key)));
  }
  function setPlace(key) {
    if (!PLACES[key] || key === PLACE.key) return;
    setObserver(key);
    try { localStorage.setItem('sv-place', key); } catch (e) {}
    try { history.replaceState(null, '', key === 'narvik' ? location.pathname + location.search : '#' + key); } catch (e) {}
    narvikLbl.userData.text = PLACE.name; drawLabel(narvikLbl);
    buildPlaceMarker(); narv = geoV(LAT, LON, 1);
    cam.globe.th = Math.atan2(narv.x, narv.z); cam.globe.pol = Math.acos(narv.y) + 32 * D2R;
    select(-1); force = true; lastScan = -1e15;
    applyPlaceText(); paintRail(); renderDataInfo();
    if (AUR.grid) buildAurora(); AUR.met = []; renderAurora(); loadMet();
    predGen++; $('rows').innerHTML = '<div class="empty">Calculating passes …</div>'; PASSES = [];
    predictPasses().then(predictStations);
  }
  document.querySelectorAll('.place button').forEach(b => b.addEventListener('click', () => setPlace(b.dataset.place)));
  window.addEventListener('hashchange', () => { const h = location.hash.replace('#', '').toLowerCase(); if (PLACES[h]) setPlace(h); });
  applyPlaceText();

  // ---------- loop ----------
  function resize() { renderer.setSize(stage.clientWidth, stage.clientHeight, false); uPR.value = renderer.getPixelRatio(); placeCamera(); }
  new ResizeObserver(resize).observe(stage);
  function frame() {
    if (simNow() > Date.now() + 12 * 3600000 || simNow() < Date.now() - 2 * 3600000) goLive();
    update(); placeCamera(); renderer.render(scene, camera); updateTag();
    requestAnimationFrame(frame);
  }
  const relabel = () => labels.forEach(drawLabel);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relabel);

  async function getText(u) { const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) throw new Error(u + ' ' + r.status); return r.text(); }
  async function boot() {
    setMode('dome'); resize(); syncControls(); paintRail(); renderChips(); startAurora();
    let meta = {};
    try { meta = JSON.parse(await getText('meta.json')); } catch (e) { meta = {}; }
    const vInfo = meta.visual || { file: 'visual.csv', fetched: meta.fetched };
    fetched = vInfo.fetched ? Date.parse(vInfo.fetched) : null;
    slInfo = meta.starlink || null; slFetched = slInfo && slInfo.fetched ? Date.parse(slInfo.fetched) : null;
    let vis;
    try { vis = await getText(vInfo.file || 'visual.csv'); } catch (e) { $('loading').textContent = 'Could not find the orbit data. Please reload the page.'; return; }
    addObjects(O.parseCSV(vis), 'visual'); buildBuffers();
    $('loading').hidden = true; renderChips(); renderDataInfo();
    requestAnimationFrame(frame);
    const loadStarlink = async () => {
      if (!slInfo || !slInfo.file) { starlinkState = 'none'; return; }
      if (slAgeDays() > 7) { starlinkState = 'old'; return; }
      const txt = await getText(slInfo.file);
      const rows = slInfo.format === 'polar' ? parsePolar(txt) : O.parseCSV(txt).filter(r => r.i > 50);
      if (!rows.length) throw new Error('empty');
      addObjects(rows, 'starlink'); buildBuffers(); starlinkState = 'ok'; layer[2] = true; $('l-starlink').setAttribute('aria-pressed', 'true'); force = true;
    };
    loadStarlink().catch(() => { starlinkState = 'none'; })
      .finally(() => { if (starlinkState !== 'ok') layer[2] = false; renderChips(); renderDataInfo(); });
    await predictPasses(); predictStations();
    setInterval(() => { predictPasses(); paintRail(); renderDataInfo(); }, 10 * 60000);
  }
  boot();
})();
