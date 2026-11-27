import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLiqRecorder } from './recorder.js';
import { OrderBook } from '../orderbook/book.js';

test('agrupa operaciones del mismo medio segundo y lado, con precio promedio', () => {
  const r = createLiqRecorder();
  r.trade({ price: 100, qty: 1, time: 1000, isSell: false });
  r.trade({ price: 102, qty: 3, time: 1200, isSell: false }); // mismo medio segundo
  r.trade({ price: 99, qty: 2, time: 1300, isSell: true }); // otro lado
  r.trade({ price: 101, qty: 1, time: 1600, isSell: false }); // otro medio segundo
  assert.equal(r.bubbles.length, 3);
  const [b0, s0, b1] = r.bubbles;
  assert.equal(b0.qty, 4);
  assert.equal(b0.price, (100 * 1 + 102 * 3) / 4);
  assert.equal(s0.side, 'sell');
  assert.equal(b1.t, 1500);
});

test('la foto guarda bid, ask y el libro en franjas finas', () => {
  const ob = new OrderBook();
  ob.loadSnapshot({ lastUpdateId: 1, bids: [['59999', '1.5']], asks: [['60001', '2']] });
  const r = createLiqRecorder();
  assert.equal(r.sample(ob, 5000), true);
  const c = r.columns[0];
  assert.equal(c.bid, 59999);
  assert.equal(c.ask, 60001);
  assert.equal(r.step, 2);
  assert.equal(c.data.reduce((a, b) => a + b, 0), 3.5);
});
