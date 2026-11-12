// @ts-nocheck — dieksekusi oleh Node/tsx, bukan build Vite.
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBackgroundLayers, parseGradient } from './dom-paint';

test('parseGradient membaca linear-gradient beserta sudut dan stop', () => {
  const gradient = parseGradient('linear-gradient(165deg, #131620 0%, #090a0f 100%)');
  assert.ok(gradient);
  assert.equal(gradient.radial, false);
  assert.equal(gradient.angle, 165);
  assert.deepEqual(
    gradient.stops.map((stop) => [stop.color, stop.position]),
    [['#131620', 0], ['#090a0f', 100]],
  );
});

test('parseGradient membaca radial-gradient dengan titik pusat', () => {
  const gradient = parseGradient('radial-gradient(ellipse at 85% 20%, rgba(239, 90, 107, 0.08) 0%, transparent 60%)');
  assert.ok(gradient);
  assert.equal(gradient.radial, true);
  assert.deepEqual(gradient.center, [85, 20]);
  assert.equal(gradient.stops[0].color, 'rgba(239, 90, 107, 0.08)');
  assert.equal(gradient.stops[1].color, 'rgba(0,0,0,0)');
});

test('parseGradient menolak nilai yang bukan gradient', () => {
  assert.equal(parseGradient('none'), null);
  assert.equal(parseGradient('url(foto.png)'), null);
  assert.equal(parseGradient(''), null);
});

test('parseBackgroundLayers memisahkan beberapa lapis latar', () => {
  const layers = parseBackgroundLayers(
    'radial-gradient(ellipse at 85% 20%, #ffffff 0%, transparent 60%), linear-gradient(165deg, #131620 0%, #090a0f 100%)',
  );
  assert.equal(layers.length, 2);
  assert.equal(layers[0].radial, true);
  assert.equal(layers[1].radial, false);
  assert.equal(parseBackgroundLayers('none').length, 0);
});
