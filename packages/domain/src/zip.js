const crcTable = Uint32Array.from({ length: 256 }, (_, i) => {
  let c = i;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function zip(files, date) {
  const enc = new TextEncoder();
  let length = 0;
  const entries = Object.entries(files).map(([name, xml]) => {
    const n = enc.encode(name),
      data = enc.encode(xml);
    let crc = 0xffffffff;
    for (const b of data) crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8);
    const e = { n, data, crc: (crc ^ 0xffffffff) >>> 0, offset: length };
    length += 30 + n.length + data.length;
    return e;
  });
  const central = length;
  length += entries.reduce((n, e) => n + 46 + e.n.length, 0) + 22;
  const out = new Uint8Array(length),
    view = new DataView(out.buffer);
  let at = 0;
  const u16 = (v) => {
      view.setUint16(at, v, true);
      at += 2;
    },
    u32 = (v) => {
      view.setUint32(at, v, true);
      at += 4;
    },
    bytes = (b) => {
      out.set(b, at);
      at += b.length;
    },
    time =
      (date.getUTCHours() << 11) |
      (date.getUTCMinutes() << 5) |
      (date.getUTCSeconds() >> 1),
    dos =
      ((date.getUTCFullYear() - 1980) << 9) |
      ((date.getUTCMonth() + 1) << 5) |
      date.getUTCDate();
  for (const e of entries) {
    u32(0x04034b50);
    u16(20);
    u16(0x800);
    u16(0);
    u16(time);
    u16(dos);
    u32(e.crc);
    u32(e.data.length);
    u32(e.data.length);
    u16(e.n.length);
    u16(0);
    bytes(e.n);
    bytes(e.data);
  }
  for (const e of entries) {
    u32(0x02014b50);
    u16(20);
    u16(20);
    u16(0x800);
    u16(0);
    u16(time);
    u16(dos);
    u32(e.crc);
    u32(e.data.length);
    u32(e.data.length);
    u16(e.n.length);
    u16(0);
    u16(0);
    u16(0);
    u16(0);
    u32(0);
    u32(e.offset);
    bytes(e.n);
  }
  const centralSize = at - central;
  u32(0x06054b50);
  u16(0);
  u16(0);
  u16(entries.length);
  u16(entries.length);
  u32(centralSize);
  u32(central);
  u16(0);
  return out;
}
export { zip };
