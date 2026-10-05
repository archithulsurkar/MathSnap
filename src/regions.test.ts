import assert from 'node:assert/strict';
import test from 'node:test';
import { countRegions, fitWithin, isTooSmall, moveRegion, rectFromDrag, toPixelRect, type Region } from './regions.js';

const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);

test('rectFromDrag normalizes a drag in any direction', () => {
  const forward = rectFromDrag({ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.6 });
  const backward = rectFromDrag({ x: 0.4, y: 0.6 }, { x: 0.1, y: 0.2 });
  assert.deepEqual(forward, backward);
  near(forward.x, 0.1);
  near(forward.y, 0.2);
  near(forward.w, 0.3);
  near(forward.h, 0.4);
});

test('rectFromDrag clamps a drag that leaves the page', () => {
  assert.deepEqual(rectFromDrag({ x: -0.5, y: 0.5 }, { x: 1.5, y: 2 }), { x: 0, y: 0.5, w: 1, h: 0.5 });
});

test('isTooSmall measures in display pixels on each axis', () => {
  const display = { width: 800, height: 1000 };
  assert.equal(isTooSmall({ x: 0, y: 0, w: 0.005, h: 0.5 }, 8, display), true); // 4px wide
  assert.equal(isTooSmall({ x: 0, y: 0, w: 0.5, h: 0.005 }, 8, display), true); // 5px tall
  assert.equal(isTooSmall({ x: 0, y: 0, w: 0.02, h: 0.02 }, 8, display), false); // 16 × 20px
});

test('toPixelRect rounds outwards to whole pixels', () => {
  assert.deepEqual(toPixelRect({ x: 0.25, y: 0.25, w: 0.5, h: 0.125 }, 1000, 2000), {
    x: 250,
    y: 500,
    w: 500,
    h: 250,
  });
  assert.deepEqual(toPixelRect({ x: 0.1005, y: 0, w: 0.1, h: 1 }, 1000, 10), { x: 100, y: 0, w: 101, h: 10 });
});

test('toPixelRect stays inside the image and keeps at least one pixel', () => {
  assert.deepEqual(toPixelRect({ x: 1, y: 1, w: 0, h: 0 }, 100, 50), { x: 99, y: 49, w: 1, h: 1 });
  assert.deepEqual(toPixelRect({ x: 0, y: 0, w: 1, h: 1 }, 640, 480), { x: 0, y: 0, w: 640, h: 480 });
});

test('moveRegion moves up and down and clamps at the ends', () => {
  const list = ['a', 'b', 'c'];
  assert.deepEqual(moveRegion(list, 1, -1), ['b', 'a', 'c']);
  assert.deepEqual(moveRegion(list, 1, 1), ['a', 'c', 'b']);
  assert.deepEqual(moveRegion(list, 0, -1), ['a', 'b', 'c']);
  assert.deepEqual(moveRegion(list, 2, 1), ['a', 'b', 'c']);
  assert.deepEqual(moveRegion(list, 5, 1), ['a', 'b', 'c']);
  assert.deepEqual(list, ['a', 'b', 'c'], 'input untouched');
});

test('fitWithin shrinks the long edge and never enlarges', () => {
  assert.deepEqual(fitWithin(4000, 3000, 2000), { width: 2000, height: 1500, scale: 0.5 });
  assert.deepEqual(fitWithin(300, 200, 2000), { width: 300, height: 200, scale: 1 });
  assert.equal(fitWithin(5000, 1, 100).height, 1);
});

test('countRegions sums every page', () => {
  const region = (id: string): Region => ({ id, kind: 'text', x: 0, y: 0, w: 1, h: 1 });
  assert.equal(countRegions([[region('a'), region('b')], [], [region('c')]]), 3);
  assert.equal(countRegions([]), 0);
});
