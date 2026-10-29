import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isHalloween, halloween } from '../worker/halloween.js';

// Dates are Brazil time (UTC-3), so 03:00 UTC is midnight there.
test('on from 15 Oct to 1 Nov, Brazil time', () => {
  assert.equal(isHalloween(new Date('2026-10-15T03:00:00Z')), true);
  assert.equal(isHalloween(new Date('2026-10-31T23:00:00Z')), true);
  assert.equal(isHalloween(new Date('2026-11-02T02:59:00Z')), true);  // still 1 Nov in Brazil
});

test('off outside those days', () => {
  assert.equal(isHalloween(new Date('2026-10-15T02:59:00Z')), false); // still 14 Oct in Brazil
  assert.equal(isHalloween(new Date('2026-11-02T03:00:00Z')), false);
  assert.equal(isHalloween(new Date('2026-06-10T12:00:00Z')), false);
});

test('adds nothing outside Halloween', () => {
  assert.deepEqual(halloween('ranking', new Date('2026-06-10T12:00:00Z')), { style: '', decor: '' });
  const on = halloween('ranking', new Date('2026-10-29T12:00:00Z'));
  assert.match(on.style, /medal\.m1/);
  assert.doesNotMatch(halloween('public', new Date('2026-10-29T12:00:00Z')).style, /medal/);
});
