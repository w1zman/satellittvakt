// Compact orbit propagator: SGP4-style mean-element initialisation with J2/J4 secular
// rates + mean-motion drift. Short-period terms ignored (~10 km level). TEME -> ECEF via GMST.
(function (root) {
  const D2R = Math.PI / 180, TWOPI = 2 * Math.PI;
  const RE = 6378.135, KE = 0.0743669161, J2 = 0.001082616, J4 = -0.00000165597;
  const XKE = KE; // er^1.5/min

  function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    const head = lines.shift().split(',');
    const idx = k => head.indexOf(k);
    return lines.filter(l => l.trim()).map(l => {
      // names can contain commas? CelesTrak quotes them; handle simple quoted case
      let parts = [];
      let cur = '', q = false;
      for (const ch of l) {
        if (ch === '"') { q = !q; continue; }
        if (ch === ',' && !q) { parts.push(cur); cur = ''; } else cur += ch;
      }
      parts.push(cur);
      return {
        name: parts[idx('OBJECT_NAME')], intl: parts[idx('OBJECT_ID')],
        epoch: parts[idx('EPOCH')], n: +parts[idx('MEAN_MOTION')], e: +parts[idx('ECCENTRICITY')],
        i: +parts[idx('INCLINATION')], raan: +parts[idx('RA_OF_ASC_NODE')], argp: +parts[idx('ARG_OF_PERICENTER')],
        M: +parts[idx('MEAN_ANOMALY')], id: +parts[idx('NORAD_CAT_ID')], ndot: +parts[idx('MEAN_MOTION_DOT')]
      };
    });
  }

  function init(el) {
    const s = {};
    s.el = el;
    s.t0 = Date.parse(el.epoch.endsWith('Z') ? el.epoch : el.epoch + 'Z');
    const no = el.n * TWOPI / 1440; // rad/min (Kozai)
    const e = el.e, inc = el.i * D2R;
    const cosi = Math.cos(inc), th2 = cosi * cosi;
    const eo2 = 1 - e * e, rteo = Math.sqrt(eo2);
    const ak = Math.pow(XKE / no, 2 / 3);
    const k2 = 0.5 * J2;
    const d1 = 0.75 * J2 * (3 * th2 - 1) / (rteo * eo2) / (ak * ak);
    let del = d1 / (ak * ak) * 0; // placeholder (Vallado form below)
    const delk = 1.5 * k2 * (3 * th2 - 1) / (rteo * eo2);
    const del1 = delk / (ak * ak);
    const adel = ak * (1 - del1 * del1 - del1 * (1 / 3 + 134 * del1 * del1 / 81));
    const del0 = delk / (adel * adel);
    const nn = no / (1 + del0); // un-Kozai mean motion rad/min
    const ao = Math.pow(XKE / nn, 2 / 3); // er
    const pinv = 1 / (ao * eo2);
    const pinvsq = pinv * pinv;
    const t1 = 1.5 * J2 * pinvsq * nn;
    const t2 = 0.5 * t1 * J2 * pinvsq;
    const t3 = -0.46875 * J4 * pinvsq * pinvsq * nn;
    const con41 = 3 * th2 - 1, th4 = th2 * th2;
    s.mdot = nn + 0.5 * t1 * rteo * con41 + 0.0625 * t2 * rteo * (13 - 78 * th2 + 137 * th4);
    s.argpdot = -0.5 * t1 * (1 - 5 * th2) + 0.0625 * t2 * (7 - 114 * th2 + 395 * th4) + t3 * (3 - 36 * th2 + 49 * th4);
    s.nodedot = (-t1 + (0.5 * t2 * (4 - 19 * th2) + 2 * t3 * (3 - 7 * th2))) * cosi;
    s.nn = nn; s.ao = ao; s.e = e; s.inc = inc;
    s.M0 = el.M * D2R; s.w0 = el.argp * D2R; s.O0 = el.raan * D2R;
    s.ndot = el.ndot; // rev/day^2 (this is ndot/2 as in TLE)
    return s;
  }

  // returns TEME position km and velocity km/s
  function prop(s, tms) {
    const dtm = (tms - s.t0) / 60000, dtd = dtm / 1440;
    let M = s.M0 + s.mdot * dtm + TWOPI * s.ndot * dtd * dtd;
    const nRatio = s.el.n / (s.el.n + 2 * s.ndot * dtd);
    const a = s.ao * Math.pow(Math.max(nRatio, 0.5), 2 / 3) * RE;
    const w = s.w0 + s.argpdot * dtm, O = s.O0 + s.nodedot * dtm, e = s.e;
    M = ((M % TWOPI) + TWOPI) % TWOPI;
    let E = M;
    for (let k = 0; k < 12; k++) { const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); E -= dE; if (Math.abs(dE) < 1e-12) break; }
    const cE = Math.cos(E), sE = Math.sin(E);
    const xp = a * (cE - e), yp = a * Math.sqrt(1 - e * e) * sE;
    const r = a * (1 - e * cE);
    const nrad = s.nn / 60 * Math.pow(s.ao * RE / a, 1.5); // rad/s
    const vxp = -a * a * nrad / r * sE, vyp = a * a * nrad / r * Math.sqrt(1 - e * e) * cE;
    const cO = Math.cos(O), sO = Math.sin(O), cw = Math.cos(w), sw = Math.sin(w), ci = Math.cos(s.inc), si = Math.sin(s.inc);
    const P = [cO * cw - sO * sw * ci, sO * cw + cO * sw * ci, sw * si];
    const Q = [-cO * sw - sO * cw * ci, -sO * sw + cO * cw * ci, cw * si];
    return {
      r: [xp * P[0] + yp * Q[0], xp * P[1] + yp * Q[1], xp * P[2] + yp * Q[2]],
      v: [vxp * P[0] + vyp * Q[0], vxp * P[1] + vyp * Q[1], vxp * P[2] + vyp * Q[2]]
    };
  }

  function jd(tms) { return tms / 86400000 + 2440587.5; }
  function gmst(tms) {
    const T = (jd(tms) - 2451545.0) / 36525;
    let g = -6.2e-6 * T * T * T + 0.093104 * T * T + (876600 * 3600 + 8640184.812866) * T + 67310.54841; // s
    g = ((g * D2R / 240) % TWOPI + TWOPI) % TWOPI;
    return g;
  }
  function temeToEcef(r, tms) {
    const g = gmst(tms), c = Math.cos(g), s = Math.sin(g);
    return [c * r[0] + s * r[1], -s * r[0] + c * r[1], r[2]];
  }
  function geodeticToEcef(latDeg, lonDeg, hKm) {
    const a = 6378.137, f = 1 / 298.257223563, e2 = f * (2 - f);
    const lat = latDeg * D2R, lon = lonDeg * D2R;
    const N = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
    return [(N + hKm) * Math.cos(lat) * Math.cos(lon), (N + hKm) * Math.cos(lat) * Math.sin(lon), (N * (1 - e2) + hKm) * Math.sin(lat)];
  }
  function ecefToGeodetic(p) {
    const a = 6378.137, f = 1 / 298.257223563, e2 = f * (2 - f);
    const lon = Math.atan2(p[1], p[0]), rxy = Math.hypot(p[0], p[1]);
    let lat = Math.atan2(p[2], rxy * (1 - e2)), h = 0;
    for (let k = 0; k < 6; k++) { const N = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2); h = rxy / Math.cos(lat) - N; lat = Math.atan2(p[2], rxy * (1 - e2 * N / (N + h))); }
    return [lat / D2R, lon / D2R, h];
  }
  function lookAngles(obsLat, obsLon, obsEcef, satEcef) {
    const lat = obsLat * D2R, lon = obsLon * D2R;
    const d = [satEcef[0] - obsEcef[0], satEcef[1] - obsEcef[1], satEcef[2] - obsEcef[2]];
    const sl = Math.sin(lat), cl = Math.cos(lat), so = Math.sin(lon), co = Math.cos(lon);
    const E = -so * d[0] + co * d[1];
    const N = -sl * co * d[0] - sl * so * d[1] + cl * d[2];
    const U = cl * co * d[0] + cl * so * d[1] + sl * d[2];
    const rng = Math.hypot(E, N, U);
    let az = Math.atan2(E, N) / D2R; if (az < 0) az += 360;
    return { az, el: Math.asin(U / rng) / D2R, range: rng, enu: [E, N, U] };
  }
  function sunEci(tms) {
    const T = (jd(tms) - 2451545.0) / 36525;
    const lm = (280.460 + 36000.771 * T) * D2R;
    const M = (357.5291092 + 35999.05034 * T) * D2R;
    const le = lm + (1.914666471 * Math.sin(M) + 0.019994643 * Math.sin(2 * M)) * D2R;
    const rAU = 1.000140612 - 0.016708617 * Math.cos(M) - 0.000139589 * Math.cos(2 * M);
    const eps = (23.439291 - 0.0130042 * T) * D2R;
    const r = rAU * 149597870.7;
    return [r * Math.cos(le), r * Math.cos(eps) * Math.sin(le), r * Math.sin(eps) * Math.sin(le)];
  }
  // fraction of sun disk visible from satellite (0 umbra .. 1 fully lit)
  function litFraction(rSat, rSun) {
    const RS = 696000, R = 6378.137;
    const toSun = [rSun[0] - rSat[0], rSun[1] - rSat[1], rSun[2] - rSat[2]];
    const dS = Math.hypot(...toSun), dE = Math.hypot(...rSat);
    const thS = Math.asin(RS / dS), thE = Math.asin(R / dE);
    const cosT = -(toSun[0] * rSat[0] + toSun[1] * rSat[1] + toSun[2] * rSat[2]) / (dS * dE);
    const th = Math.acos(Math.max(-1, Math.min(1, cosT)));
    if (th >= thE + thS) return 1;
    if (th <= thE - thS) return 0;
    return (th - (thE - thS)) / (2 * thS);
  }
  const api = { parseCSV, init, prop, gmst, temeToEcef, geodeticToEcef, ecefToGeodetic, lookAngles, sunEci, litFraction, jd };
  if (typeof module !== 'undefined') module.exports = api; else root.ORB = api;
})(typeof window !== 'undefined' ? window : globalThis);
