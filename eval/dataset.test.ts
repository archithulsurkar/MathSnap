import assert from 'node:assert/strict';
import test from 'node:test';
import { loadDataset, validateEntry } from './dataset.js';

const VALID = {
  id: '0001-example',
  image: 'images/0001-example.png',
  category: 'typeset',
  latex: 'E = mc^{2}',
};

test('every committed entry loads and validates', () => {
  // Ground truth that will not convert would make every prediction scored
  // against it meaningless, so the suite refuses to carry it.
  const entries = loadDataset();
  for (const entry of entries) {
    assert.ok(entry.id, 'entry has an id');
    assert.ok(entry.latex, `${entry.id} has latex`);
  }
});

test('ids are unique', () => {
  const ids = loadDataset().map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('rejects an entry missing required fields', () => {
  assert.throws(() => validateEntry({ ...VALID, id: undefined }, 'test'), /has no id/);
  assert.throws(() => validateEntry({ ...VALID, latex: undefined }, 'test'), /has no latex/);
  assert.throws(() => validateEntry({ ...VALID, image: undefined }, 'test'), /has no image/);
});

test('rejects an unknown category', () => {
  assert.throws(() => validateEntry({ ...VALID, category: 'diagrams' }, 'test'), /expected one of/);
});

test('rejects ground truth that will not convert', () => {
  assert.throws(
    () => validateEntry({ ...VALID, latex: '\\frac{1}' }, 'test'),
    /will not convert/,
  );
});
