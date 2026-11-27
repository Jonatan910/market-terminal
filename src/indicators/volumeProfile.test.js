import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeProfile } from './volumeProfile.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('el volumen total se conserva', () => {
  const bars = [
    { open: 10, high: 12, low: 10, close: 11, volume: 100 },
    { open: 11, high: 14, low: 11, close: 13, volume: 50 },
  ];
  const p = computeProfile(bars, { rows: 8 });
  close(p.total, 150);
  close(p.rows.reduce((s, r) => s + r.buy + r.sell, 0), 150);
});

test('una vela reparte su volumen en partes iguales entre las filas que toca', () => {
  const p = computeProfile([{ open: 0, high: 4, low: 0, close: 4, volume: 40, buyVolume: 10 }], { rows: 4 });
  for (const r of p.rows) {
    close(r.buy + r.sell, 10);
    close(r.buy, 2.5); // 10 de 40 fueron compras → 25 % en cada fila
  }
});

test('el POC es la fila con más volumen', () => {
  const bars = [
    { open: 0, high: 10, low: 0, close: 5, volume: 10 },
    { open: 7, high: 7.5, low: 7, close: 7.2, volume: 100 }, // mucho volumen cerca de 7
  ];
  const p = computeProfile(bars, { rows: 10 });
  assert.equal(p.poc, 7);
});

test('el área de valor junta al menos el 70 % del volumen e incluye el POC', () => {
  const bars = Array.from({ length: 20 }, (_, i) => ({ open: i, high: i + 1, low: i, close: i + 1, volume: 10 + (i === 10 ? 200 : 0) }));
  const p = computeProfile(bars, { rows: 20 });
  let inVa = 0;
  for (let r = p.vaLow; r <= p.vaHigh; r++) inVa += p.rows[r].buy + p.rows[r].sell;
  assert.ok(inVa >= p.total * 0.7);
  assert.ok(p.vaLow <= p.poc && p.poc <= p.vaHigh);
});

test('sin volumen (forex) no hay perfil', () => {
  assert.equal(computeProfile([{ open: 1, high: 2, low: 1, close: 2, volume: 0 }]), null);
});

test('acciones: compras estimadas por dónde cerró la vela', () => {
  const p = computeProfile([{ open: 0, high: 10, low: 0, close: 8, volume: 100 }], { rows: 1 });
  close(p.rows[0].buy, 80);
});
