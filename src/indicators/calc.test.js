// Pruebas de los cálculos. Se corren con:  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sma, ema, bollinger, rsi, macd, volumeDelta, cvd } from './calc.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('SMA promedia los últimos N valores', () => {
  assert.deepEqual(sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
});

test('EMA arranca con la SMA y después pondera', () => {
  const out = ema([1, 2, 3, 4, 5], 3);
  assert.deepEqual(out.slice(0, 2), [null, null]);
  close(out[2], 2); // SMA de 1,2,3
  close(out[3], 4 * 0.5 + 2 * 0.5); // k = 2/(3+1) = 0.5
  close(out[4], 5 * 0.5 + 3 * 0.5);
});

test('EMA ignora los null iniciales (necesario para la señal del MACD)', () => {
  const out = ema([null, null, 2, 4, 6], 2);
  assert.deepEqual(out.slice(0, 3), [null, null, null]);
  close(out[3], 3);
});

test('Bollinger: con precios constantes las bandas coinciden con la media', () => {
  const { mid, upper, lower } = bollinger([5, 5, 5, 5], 2, 2);
  assert.deepEqual([mid[3], upper[3], lower[3]], [5, 5, 5]);
});

test('Bollinger: desvío estándar poblacional', () => {
  const { upper, lower } = bollinger([2, 4], 2, 1); // media 3, desvío 1
  close(upper[1], 4);
  close(lower[1], 2);
});

test('RSI: solo subas = 100, solo bajas = 0', () => {
  assert.equal(rsi([1, 2, 3, 4, 5, 6], 3).at(-1), 100);
  assert.equal(rsi([6, 5, 4, 3, 2, 1], 3).at(-1), 0);
});

test('RSI coincide con el ejemplo clásico de Wilder', () => {
  // Datos del ejemplo de StockCharts (RSI 14). Su tabla dice 70.53, 66.32, 66.55, 69.41, 66.36, 57.97,
  // pero redondea los promedios a 2 decimales en cada paso; sin redondear da ~0.07 menos.
  const data = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.0, 46.03, 46.41, 46.22, 45.64];
  const out = rsi(data, 14);
  [70.53, 66.32, 66.55, 69.41, 66.36, 57.97].forEach((ref, k) => close(out[14 + k], ref, 0.1));
});

test('MACD: histograma = línea − señal', () => {
  const data = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 4) * 5 + i * 0.2);
  const { line, signal, hist } = macd(data);
  const i = 59;
  close(hist[i], line[i] - signal[i]);
  assert.equal(line[24], null); // la EMA lenta (26) todavía no existe
  assert.notEqual(line[25], null);
  assert.notEqual(signal[33], null); // 26 + 9 − 2
});

test('Delta y CVD: compras − ventas, acumulado', () => {
  const bars = [{ volume: 10, buyVolume: 7 }, { volume: 5, buyVolume: 1 }, { volume: 4, buyVolume: 2 }];
  assert.deepEqual(volumeDelta(bars), [4, -3, 0]);
  assert.deepEqual(cvd(bars), [4, 1, 1]);
});

test('CVD: sin dato de compras (acciones/forex) da null', () => {
  assert.deepEqual(cvd([{ volume: 10 }]), [null]);
});
