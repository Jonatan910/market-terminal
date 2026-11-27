import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDetector, percentile } from './detector.js';

// Grabación de mentira: franjas de 1 USDT alrededor de 100.
function fakeRec() {
  return { step: 1, columns: [], bubbles: [], volAt: new Map() };
}
function column(t, levels) {
  // levels: { precio: cantidad }
  const data = new Float32Array(21); // precios 90..110
  for (const [p, q] of Object.entries(levels)) data[+p - 90] = q;
  return { t, bid: 99.5, ask: 100.5, base: 90, data };
}

test('percentil', () => {
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9), 10);
  assert.equal(percentile([], 0.5), null);
});

test('marca una operación grande (umbral fijo) solo cuando la burbuja ya cerró', () => {
  const rec = fakeRec();
  const d = createDetector();
  rec.bubbles.push({ t: 0, side: 'buy', qty: 5, price: 100 }, { t: 500, side: 'sell', qty: 0.1, price: 100 });
  rec.columns.push(column(600, {}));
  let ev = d.update(rec, { trade: 2, wall: 50 });
  assert.equal(ev.length, 1);
  assert.equal(ev[0].type, 'trade');
  assert.equal(rec.bubbles[0].big, true);
  // la segunda (t=500) seguía abierta; al cerrarse, no es grande
  rec.columns.push(column(1100, {}));
  ev = d.update(rec, { trade: 2, wall: 50 });
  assert.equal(ev.length, 0);
});

test('pared nueva (después de 3 s) y después retirada (sin operaciones en ese precio)', () => {
  const rec = fakeRec();
  const d = createDetector();
  rec.columns.push(column(0, { 95: 60 }));
  assert.equal(d.update(rec, { trade: 99, wall: 50 }).length, 0); // todavía no se confirma
  rec.columns.push(column(3000, { 95: 60 }));
  let ev = d.update(rec, { trade: 99, wall: 50 });
  assert.equal(ev[0].type, 'wall-new');
  assert.equal(ev[0].side, 'bid'); // debajo del precio: compra
  rec.columns.push(column(3500, { 95: 1 }));
  ev = d.update(rec, { trade: 99, wall: 50 });
  assert.equal(ev[0].type, 'wall-pulled');
});

test('pared ejecutada: se operó al menos la mitad de su tamaño en ese precio', () => {
  const rec = fakeRec();
  const d = createDetector();
  rec.columns.push(column(0, { 105: 80 }));
  d.update(rec, { trade: 99, wall: 50 });
  rec.columns.push(column(3000, { 105: 80 }));
  d.update(rec, { trade: 99, wall: 50 });
  rec.volAt.set(105, { buy: 45, sell: 0 }); // compraron 45 contra la pared de venta de 80
  rec.columns.push(column(3500, {}));
  const ev = d.update(rec, { trade: 99, wall: 50 });
  assert.equal(ev[0].type, 'wall-filled');
  assert.equal(ev[0].side, 'ask');
});

test('una pared que se achica pero sigue grande no genera evento', () => {
  const rec = fakeRec();
  const d = createDetector();
  rec.columns.push(column(0, { 95: 60 }));
  d.update(rec, { trade: 99, wall: 50 });
  rec.columns.push(column(500, { 95: 30 })); // 30 ≥ 30 % de 50
  assert.equal(d.update(rec, { trade: 99, wall: 50 }).length, 0);
});

test('una pared que dura menos de 3 s se ignora (ruido)', () => {
  const rec = fakeRec();
  const d = createDetector();
  rec.columns.push(column(0, { 95: 60 }));
  d.update(rec, { trade: 99, wall: 50 });
  rec.columns.push(column(1000, {})); // se fue al segundo
  assert.equal(d.update(rec, { trade: 99, wall: 50 }).length, 0);
});
