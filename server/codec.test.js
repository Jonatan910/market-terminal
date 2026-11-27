import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeMinute, decodeMinute } from './codec.js';

const close = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

test('un minuto se codifica y se decodifica igual (con la precisión de float32)', () => {
  const minute = 1_800_000_000_000 - (1_800_000_000_000 % 60000);
  const columns = [
    { t: minute + 2000, bid: 60001.5, ask: 60002.5, base: 29700, levels: [[10, 12.5], [600, 0.75]] },
    { t: minute + 4000, bid: 60003, ask: 60004, base: 29701, levels: [] },
  ];
  const bubbles = [{ t: minute + 1000, side: 'sell', price: 60002.25, qty: 1.234 }];
  const gz = encodeMinute(minute, 2, columns, bubbles);
  const d = decodeMinute(minute, gz);
  assert.equal(d.step, 2);
  assert.equal(d.columns.length, 2);
  assert.equal(d.columns[0].t, minute + 2000);
  close(d.columns[0].bid, 60001.5, 0.01);
  assert.equal(d.columns[0].base, 29700);
  assert.deepEqual(d.columns[0].levels.map(([o]) => o), [10, 600]);
  close(d.columns[0].levels[0][1], 12.5, 1e-6);
  assert.equal(d.bubbles[0].side, 'sell');
  close(d.bubbles[0].qty, 1.234, 1e-6);
});

test('comprime: un minuto típico pesa poco', () => {
  const minute = 0;
  const columns = Array.from({ length: 30 }, (_, i) => ({
    t: i * 2000,
    bid: 60000 + i,
    ask: 60001 + i,
    base: 29700,
    levels: Array.from({ length: 80 }, (_, k) => [k * 7, 1 + (k % 9)]),
  }));
  const gz = encodeMinute(minute, 2, columns, []);
  assert.ok(gz.length < 15000, `pesa ${gz.length} bytes`);
});
