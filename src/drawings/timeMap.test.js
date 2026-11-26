import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTimeMap } from './timeMap.js';

const bars = [100, 200, 300, 500].map((time) => ({ time })); // hueco entre 300 y 500

test('una fecha de vela da su índice exacto', () => {
  const m = createTimeMap(bars);
  assert.equal(m.toLogical(200), 1);
  assert.equal(m.toLogical(500), 3);
});

test('entre velas interpola (también en huecos)', () => {
  const m = createTimeMap(bars);
  assert.equal(m.toLogical(150), 0.5);
  assert.equal(m.toLogical(400), 2.5);
});

test('extrapola hacia el futuro y el pasado con el paso típico', () => {
  const m = createTimeMap(bars); // paso típico = 100
  assert.equal(m.toLogical(700), 5);
  assert.equal(m.toLogical(0), -1);
});

test('ida y vuelta: toTime(toLogical(t)) === t', () => {
  const m = createTimeMap(bars);
  for (const t of [0, 100, 150, 400, 500, 900]) assert.equal(m.toTime(m.toLogical(t)), t);
});
