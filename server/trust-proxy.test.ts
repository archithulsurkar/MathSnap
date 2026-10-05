import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTrustProxy } from './trust-proxy.js';

test('unset or blank leaves the default', () => {
  assert.equal(parseTrustProxy(undefined), undefined);
  assert.equal(parseTrustProxy('  '), undefined);
});

test('a hop count is a number', () => {
  assert.equal(parseTrustProxy('1'), 1);
  assert.equal(parseTrustProxy(' 2 '), 2);
});

test('true and false are booleans', () => {
  assert.equal(parseTrustProxy('true'), true);
  assert.equal(parseTrustProxy('false'), false);
});

test('anything else passes through as an address list', () => {
  assert.equal(parseTrustProxy('loopback, 10.0.0.0/8'), 'loopback, 10.0.0.0/8');
});
