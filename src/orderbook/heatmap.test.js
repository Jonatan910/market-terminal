import { test } from 'node:test';
import assert from 'node:assert/strict';
import { niceStep, bucketizeBook, createRecorder } from './heatmap.js';
import { OrderBook } from './book.js';

test('niceStep redondea a 1, 2 o 5 por potencia de 10', () => {
  assert.equal(niceStep(12), 10);
  assert.equal(niceStep(0.33), 0.2);
  assert.equal(niceStep(0.0000115), 0.00001);
  assert.equal(niceStep(4), 5);
});

test('bucketizeBook suma compras y ventas en la misma franja', () => {
  const bids = new Map([[99.9, 1], [100.1, 2]]);
  const asks = new Map([[100.04, 3], [120, 9]]); // 120 queda fuera del ±5 %
  const { base, data } = bucketizeBook(bids, asks, 100, 1);
  assert.equal(data[100 - base], 6); // 99.9, 100.1 y 100.04 caen en la franja de 100
  assert.equal(data.reduce((a, b) => a + b, 0), 6);
});

test('el grabador guarda una columna por foto', () => {
  const ob = new OrderBook();
  ob.loadSnapshot({ lastUpdateId: 1, bids: [['60000', '2']], asks: [['60010', '1']] });
  const rec = createRecorder();
  assert.equal(rec.sample(ob, 10_000), true);
  assert.equal(rec.sample(ob, 12_000), true);
  assert.equal(rec.columns.length, 2);
  assert.equal(rec.step, 10);
  assert.equal(rec.since, 10);
});

test('sin libro listo no graba', () => {
  assert.equal(createRecorder().sample(new OrderBook()), false);
});
