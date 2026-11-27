import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OrderBook } from './book.js';

const snap = { lastUpdateId: 100, bids: [['99', '1'], ['98', '2']], asks: [['101', '1'], ['102', '3']] };

test('carga la foto y da mejor compra/venta', () => {
  const ob = new OrderBook();
  ob.loadSnapshot(snap);
  assert.equal(ob.bestBid(), 99);
  assert.equal(ob.bestAsk(), 101);
});

test('descarta cambios anteriores a la foto', () => {
  const ob = new OrderBook();
  ob.loadSnapshot(snap);
  assert.equal(ob.apply({ U: 90, u: 100, b: [['99', '9']], a: [] }), 'skipped');
  assert.equal(ob.bids.get(99), 1);
});

test('el primer cambio puede empezar antes de la foto si la cubre', () => {
  const ob = new OrderBook();
  ob.loadSnapshot(snap);
  assert.equal(ob.apply({ U: 95, u: 105, b: [['99', '5']], a: [['101', '0']] }), 'applied');
  assert.equal(ob.bids.get(99), 5);
  assert.equal(ob.asks.has(101), false); // cantidad 0 = se borra
  assert.equal(ob.bestAsk(), 102);
});

test('después exige numeración continua; un salto pide foto nueva', () => {
  const ob = new OrderBook();
  ob.loadSnapshot(snap);
  ob.apply({ U: 101, u: 110, b: [], a: [] });
  assert.equal(ob.apply({ U: 111, u: 115, b: [['97', '4']], a: [] }), 'applied');
  assert.equal(ob.apply({ U: 120, u: 125, b: [], a: [] }), 'gap');
});

test('un primer cambio que empieza después de la foto es un salto', () => {
  const ob = new OrderBook();
  ob.loadSnapshot(snap);
  assert.equal(ob.apply({ U: 105, u: 110, b: [], a: [] }), 'gap');
});

test('futuros: el primer cambio debe cubrir la foto y después se encadena con pu', () => {
  const ob = new OrderBook('futures');
  ob.loadSnapshot(snap); // lastUpdateId 100
  assert.equal(ob.apply({ U: 80, u: 99, pu: 79, b: [], a: [] }), 'skipped'); // viejo
  assert.equal(ob.apply({ U: 98, u: 103, pu: 97, b: [['99', '7']], a: [] }), 'applied');
  assert.equal(ob.bids.get(99), 7);
  assert.equal(ob.apply({ U: 104, u: 110, pu: 103, b: [], a: [['101', '0']] }), 'applied');
  assert.equal(ob.asks.has(101), false);
  assert.equal(ob.apply({ U: 115, u: 120, pu: 112, b: [], a: [] }), 'gap'); // se perdió el 111-112
});

test('futuros: un primer cambio posterior a la foto es un salto', () => {
  const ob = new OrderBook('futures');
  ob.loadSnapshot(snap);
  assert.equal(ob.apply({ U: 102, u: 105, pu: 101, b: [], a: [] }), 'gap');
});
