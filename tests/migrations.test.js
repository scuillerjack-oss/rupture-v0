import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateSave } from '../src/engine/migrations.js';
import { responseCapAt } from '../src/engine/balance.js';

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

// V4.1 : la migration réelle V3->V4 (voir migrations.js) doit produire un
// globalContainment cohérent avec responseCapAt() tel que le moteur le
// calculerait pour la même Conscience - sinon une sauvegarde migrée
// afficherait une Réponse mondiale que la partie en cours n'aurait jamais pu
// atteindre par elle-même. Bug réel trouvé et corrigé pendant le
// développement V4.1 : le calcul local de la migration ignorait
// fullConscienceLevel, ce qui sous-plafonnait la Réponse migrée par rapport
// à ce que le moteur produirait pour la même Conscience.
test('the real V3->V4 migration reconstructs globalAwareness and caps globalContainment exactly as the live engine would', () => {
  const oldSave = {
    version: 3,
    globalContainment: 42,
    territories: {
      a: { id: 'a', crisis: 50, awareness: 40, containment: 10, closedRoutes: [] },
      b: { id: 'b', crisis: 30, awareness: 60, containment: 5, closedRoutes: [] }
    }
  };
  const migrated = migrateSave(oldSave, 4);
  assert.equal(migrated.version, 4);
  assert.equal(migrated.globalAwareness, 50); // moyenne de 40 et 60
  assert.equal(migrated.globalMobilization, 42); // ancien globalContainment, tel quel
  const expectedCap = responseCapAt(50 / 100);
  assert.equal(migrated.globalContainment, Math.min(42, expectedCap));
});

test('the real V3->V4 migration never lets globalContainment exceed the live responseCapAt for the reconstructed Conscience, even with a very high old value', () => {
  const oldSave = {
    version: 3,
    globalContainment: 100,
    territories: {
      a: { id: 'a', crisis: 50, awareness: 10, containment: 0, closedRoutes: [] }
    }
  };
  const migrated = migrateSave(oldSave, 4);
  assert.equal(migrated.globalAwareness, 10);
  assert.equal(migrated.globalContainment, responseCapAt(10 / 100));
  assert.ok(migrated.globalContainment < 100, 'a low reconstructed Conscience must keep the migrated Réponse well under 100');
});
