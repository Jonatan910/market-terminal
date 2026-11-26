import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldTrigger } from './conditions.js';

const alert = (condition, price = 100, active = true) => ({ condition, price, active });

test('cruza: en las dos direcciones', () => {
  assert.equal(shouldTrigger(alert('crossing'), 99, 101), true);
  assert.equal(shouldTrigger(alert('crossing'), 101, 99), true);
  assert.equal(shouldTrigger(alert('crossing'), 101, 102), false);
});

test('cruza: tocar el nivel justo cuenta', () => {
  assert.equal(shouldTrigger(alert('crossing'), 99, 100), true);
});

test('cruza: sin precio anterior no se dispara', () => {
  assert.equal(shouldTrigger(alert('crossing'), null, 150), false);
});

test('cruza hacia arriba / abajo respetan la dirección', () => {
  assert.equal(shouldTrigger(alert('crossing_up'), 99, 101), true);
  assert.equal(shouldTrigger(alert('crossing_up'), 101, 99), false);
  assert.equal(shouldTrigger(alert('crossing_down'), 101, 99), true);
  assert.equal(shouldTrigger(alert('crossing_down'), 99, 101), false);
});

test('mayor que: se dispara al quedar arriba, no en cada precio', () => {
  assert.equal(shouldTrigger(alert('above'), null, 101), true); // ya estaba arriba al crearla
  assert.equal(shouldTrigger(alert('above'), 99, 101), true);
  assert.equal(shouldTrigger(alert('above'), 101, 102), false); // sigue arriba: no repite
  assert.equal(shouldTrigger(alert('above'), 99, 100), false); // igual no es "mayor"
});

test('menor que', () => {
  assert.equal(shouldTrigger(alert('below'), 101, 99), true);
  assert.equal(shouldTrigger(alert('below'), 99, 98), false);
});

test('una alerta pausada nunca se dispara', () => {
  assert.equal(shouldTrigger(alert('crossing', 100, false), 99, 101), false);
});
