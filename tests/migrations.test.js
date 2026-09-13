import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateSave } from '../src/engine/migrations.js';

test('migrateSave returns the input unchanged when already at the target version', () => {
  const save = { version: 2, x: 1 };
  assert.equal(migrateSave(save, 2), save);
});

test('migrateSave chains multiple registered steps to reach the target version', () => {
  const registry = {
    1: (old) => ({ ...old, version: 2, added: true }),
    2: (old) => ({ ...old, version: 3, addedAgain: true })
  };
  const result = migrateSave({ version: 1, foo: 'bar' }, 3, registry);
  assert.deepEqual(result, { version: 3, foo: 'bar', added: true, addedAgain: true });
});

test('migrateSave returns null (never a partial object) when no migration path exists', () => {
  assert.equal(migrateSave({ version: 999 }, 2, {}), null);
});

test('migrateSave returns null for malformed input instead of throwing', () => {
  assert.equal(migrateSave(null, 2), null);
  assert.equal(migrateSave({}, 2), null);
});

test('migrateSave guards against a cyclic or misconfigured migration chain', () => {
  const registry = { 1: (old) => ({ ...old, version: 1 }) }; // never advances
  assert.equal(migrateSave({ version: 1 }, 2, registry), null);
});
