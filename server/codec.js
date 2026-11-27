// Formato compacto de un minuto de grabación (libro + operaciones), comprimido con gzip.
// Así 7 días de 2 símbolos entran en el plan gratis de Supabase (≈ 15 MB por día por símbolo).
//
// Versión 1 (little endian):
//   encabezado: u8 versión · f32 franja (step) · u16 cantidad de fotos · u32 cantidad de operaciones
//   foto:       u16 ms desde el inicio del minuto · f32 bid · f32 ask · i32 base · u8 n · n × (u16 offset, f32 cantidad)
//   operación:  u16 ms desde el inicio del minuto · u8 lado (0 compra, 1 venta) · f32 precio · f32 cantidad
import { gzipSync, gunzipSync } from 'node:zlib';

export function encodeMinute(minute, step, columns, bubbles) {
  let size = 1 + 4 + 2 + 4;
  for (const c of columns) size += 2 + 4 + 4 + 4 + 1 + c.levels.length * 6;
  size += bubbles.length * 11;
  const buf = Buffer.alloc(size);
  let o = 0;
  buf.writeUInt8(1, o++);
  buf.writeFloatLE(step, o);
  o += 4;
  buf.writeUInt16LE(columns.length, o);
  o += 2;
  buf.writeUInt32LE(bubbles.length, o);
  o += 4;
  for (const c of columns) {
    buf.writeUInt16LE(c.t - minute, o);
    o += 2;
    buf.writeFloatLE(c.bid, o);
    o += 4;
    buf.writeFloatLE(c.ask, o);
    o += 4;
    buf.writeInt32LE(c.base, o);
    o += 4;
    buf.writeUInt8(c.levels.length, o++);
    for (const [off, qty] of c.levels) {
      buf.writeUInt16LE(off, o);
      o += 2;
      buf.writeFloatLE(qty, o);
      o += 4;
    }
  }
  for (const b of bubbles) {
    buf.writeUInt16LE(b.t - minute, o);
    o += 2;
    buf.writeUInt8(b.side === 'sell' ? 1 : 0, o++);
    buf.writeFloatLE(b.price, o);
    o += 4;
    buf.writeFloatLE(b.qty, o);
    o += 4;
  }
  return gzipSync(buf);
}

export function decodeMinute(minute, gz) {
  const buf = gunzipSync(gz);
  let o = 0;
  const version = buf.readUInt8(o++);
  if (version !== 1) throw new Error(`Versión desconocida: ${version}`);
  const step = buf.readFloatLE(o);
  o += 4;
  const nCols = buf.readUInt16LE(o);
  o += 2;
  const nBub = buf.readUInt32LE(o);
  o += 4;
  const columns = [];
  for (let i = 0; i < nCols; i++) {
    const t = minute + buf.readUInt16LE(o);
    o += 2;
    const bid = buf.readFloatLE(o);
    o += 4;
    const ask = buf.readFloatLE(o);
    o += 4;
    const base = buf.readInt32LE(o);
    o += 4;
    const n = buf.readUInt8(o++);
    const levels = [];
    for (let k = 0; k < n; k++) {
      const off = buf.readUInt16LE(o);
      o += 2;
      levels.push([off, buf.readFloatLE(o)]);
      o += 4;
    }
    columns.push({ t, bid, ask, base, levels });
  }
  const bubbles = [];
  for (let i = 0; i < nBub; i++) {
    const t = minute + buf.readUInt16LE(o);
    o += 2;
    const side = buf.readUInt8(o++) ? 'sell' : 'buy';
    const price = buf.readFloatLE(o);
    o += 4;
    bubbles.push({ t, side, price, qty: buf.readFloatLE(o) });
    o += 4;
  }
  return { step: Math.round(step * 1e8) / 1e8, columns, bubbles };
}
