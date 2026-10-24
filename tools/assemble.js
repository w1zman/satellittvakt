// Satellittvakt Narvik data assembler.
//   node assemble.js DIR curl [IN] IN (default DIR) has visual.csv + starlink.csv straight from CelesTrak
//   node assemble.js DIR browser  DIR has expected.json, visual.csv and/or c0.txt..cN.txt from the browser
// Writes DIR/visual.csv (normalised), DIR/starlink-polar.txt, DIR/meta.json (keeps entries it did not refresh).
const fs = require('fs'), path = require('path');
const O = require(path.join(__dirname, 'orb.js')), P = require(path.join(__dirname, 'polar.js'));
const [dir, mode, inDir] = process.argv.slice(2);
const f = n => path.join(dir, n), read = n => fs.existsSync(f(n)) ? fs.readFileSync(f(n), 'utf8') : '';
const src = n => { const q = path.join(inDir || dir, n); return fs.existsSync(q) ? fs.readFileSync(q, 'utf8') : ''; };
let meta = {}; try { meta = JSON.parse(read('meta.json')); } catch (e) { meta = {}; }
const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z'), done = [], failed = [];
const okVisual = v => /^OBJECT_NAME,/.test(v) && v.split('\n').length > 100;
if (mode === 'curl') {
  const v = src('visual.csv').replace(/\r/g, '').trim();
  if (okVisual(v)) { fs.writeFileSync(f('visual.csv'), v + '\n'); meta.visual = { file: 'visual.csv', fetched: now }; done.push('visual (' + (v.split('\n').length - 1) + ' rader)'); } else failed.push('visual');
  const sRows = O.parseCSV(src('starlink.csv') || 'X');
  if (sRows.length > 5000) {
    const T0 = new Date(Math.floor(Date.now() / 3600000) * 3600000).toISOString().replace('.000', '');
    const recs = P.build(O, sRows, Date.parse(T0));
    if (recs.length > 500) { fs.writeFileSync(f('starlink-polar.txt'), 'T0=' + T0 + '\n' + recs.join(';')); meta.starlink = { file: 'starlink-polar.txt', format: 'polar', fetched: now }; done.push('starlink (' + recs.length + ' polare)'); } else failed.push('starlink');
  } else failed.push('starlink');
} else if (mode === 'browser') {
  const exp = JSON.parse(read('expected.json'));
  if (exp.visualHash) {
    const v = read('visual.csv').replace(/\r/g, '').trim();
    if (P.fnv(v) === exp.visualHash && okVisual(v)) { fs.writeFileSync(f('visual.csv'), v + '\n'); meta.visual = { file: 'visual.csv', fetched: now }; done.push('visual'); }
    else failed.push('visual (hash ' + P.fnv(v) + ' != ' + exp.visualHash + ')');
  }
  if (exp.hashes) {
    const parts = [], bad = [];
    exp.hashes.forEach((h, i) => { const c = read('c' + i + '.txt').trim(); if (P.fnv(c) !== h) bad.push(i); parts.push(c); });
    if (!bad.length) { fs.writeFileSync(f('starlink-polar.txt'), 'T0=' + exp.T0 + '\n' + parts.join(';')); meta.starlink = { file: 'starlink-polar.txt', format: 'polar', fetched: now }; done.push('starlink (' + parts.join(';').split(';').length + ')'); }
    else failed.push('starlink chunks ' + bad.join(','));
  }
} else { console.log('usage: node assemble.js DIR curl|browser'); process.exit(2); }
if (done.length) fs.writeFileSync(f('meta.json'), JSON.stringify(meta));
console.log((done.length ? 'OK ' : 'NOTHING ') + JSON.stringify({ done, failed, meta }));
process.exit(done.length ? 0 : 1);
