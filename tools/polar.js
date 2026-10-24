// Builds the compact Starlink file used by Satellittvakt Narvik (polar shells only, i > 60 deg).
// Record: number,i*100,raan*100,(argp+M)*100,(n-14)*1e5,ndot*1e6  — mean elements at common epoch T0.
(function (root) {
  function fnv(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16); }
  function build(O, rows, T0) {
    const R2D = 180 / Math.PI, w360 = x => ((x % 360) + 360) % 360;
    return rows.filter(r => r.i > 60 && /^STARLINK-\d+/.test(r.name)).map(el => {
      const s = O.init(el), dtm = (T0 - s.t0) / 60000, dtd = dtm / 1440;
      const M = s.M0 + s.mdot * dtm + 2 * Math.PI * s.ndot * dtd * dtd, w = s.w0 + s.argpdot * dtm, Om = s.O0 + s.nodedot * dtm;
      const nT = el.n + 2 * el.ndot * dtd, num = +/^STARLINK-(\d+)/.exec(el.name)[1];
      return { num, line: [num, Math.round(el.i * 100), Math.round(w360(Om * R2D) * 100) % 36000, Math.round(w360((M + w) * R2D) * 100) % 36000, Math.round((nT - 14) * 1e5), Math.round(el.ndot * 1e6)].join(',') };
    }).filter(r => isFinite(r.num)).sort((a, b) => a.num - b.num).map(r => r.line);
  }
  const api = { build, fnv };
  if (typeof module !== 'undefined') module.exports = api; else root.POLAR = api;
})(typeof window !== 'undefined' ? window : globalThis);
