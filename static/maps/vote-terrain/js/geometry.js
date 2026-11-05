/* County geometry, packed (tools/vote-terrain/geometry_codec.mjs writes it): geometry.json holds the county
   names and areas and the camera presets; geometry.bin holds every polygon as unsigned LEB128 varints of
   zigzag deltas in tenths of a projected unit. The coordinates were rounded to a tenth when projected,
   so decoding gives back exactly the numbers the build wrote (q / 10 is the same double as the decimal).
   Used by the page and by the Node build scripts. */
export function decodeGeometry(head, bytes) {
  if (head.format !== 'vt-geometry-1') throw new Error('geometry.json: unknown format ' + head.format);
  const meta = {}, fips = [];
  for (const [f, n, st, a, sqmi] of head.meta) { meta[f] = { n, st, a, sqmi }; fips.push(f); }
  let i = 0;
  const next = () => { let v = 0, s = 1, b; do { b = bytes[i++]; v += (b & 127) * s; s *= 128; } while (b & 128); return v; };
  const zig = (v) => (v % 2 ? -(v + 1) / 2 : v / 2);
  const pieces = [], scale = head.scale;
  let x = 0, y = 0;
  for (let p = 0, np = next(); p < np; p++) {
    const f = fips[next()], rings = [];
    for (let r = 0, nr = next(); r < nr; r++) {
      const ring = new Array(next());
      for (let k = 0; k < ring.length; k++) { x += zig(next()); y += zig(next()); ring[k] = [x / scale, y / scale]; }
      rings.push(ring);
    }
    pieces.push({ f, p: rings });
  }
  if (i !== bytes.length) throw new Error('geometry.bin: ' + (bytes.length - i) + ' bytes left over');
  return { meta, pieces, presets: head.presets };
}
