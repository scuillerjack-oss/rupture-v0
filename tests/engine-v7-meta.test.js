import test from 'node:test';
import assert from 'node:assert/strict';
import { createMeta, recordGame, isUnlocked, starsFor, totalStars, STAR_DAYS } from '../src/engine/meta.js';
import { STRAINS } from '../src/engine/strains.js';

function finished(status, day, difficulty = 'normal', extra = {}) {
  return { status, day, difficulty, strain: 'standard', outcome: { result: status, day }, ...extra };
}

test('V7 méta : createMeta donne un état vide', () => {
  const meta = createMeta();
  assert.equal(meta.games, 0);
  assert.equal(totalStars(meta), 0);
});

test('V7 méta : starsFor 0 en défaite, 1-3 en victoire selon le jour et la difficulté', () => {
  assert.equal(starsFor(finished('defeat', 300)), 0);
  assert.equal(starsFor(finished('victory', STAR_DAYS.three)), 3);
  assert.equal(starsFor(finished('victory', STAR_DAYS.two)), 2);
  assert.equal(starsFor(finished('victory', STAR_DAYS.two + 1)), 1);
  assert.equal(starsFor(finished('victory', STAR_DAYS.three, 'easy')), 2);
  assert.equal(starsFor(finished('victory', STAR_DAYS.two + 1, 'hard')), 2);
  assert.equal(starsFor(finished('victory', 900, 'easy')), 1, 'jamais moins d’une étoile en victoire');
  assert.equal(starsFor(null), 0);
});

test('V7 méta : recordGame garde la meilleure note par (difficulté, souche) et détecte un record', () => {
  let { meta, newRecord, starsGained } = recordGame(createMeta(), finished('victory', 530));
  assert.equal(starsGained, 2);
  assert.equal(newRecord, true);
  ({ meta, newRecord, starsGained } = recordGame(meta, finished('victory', 600)));
  assert.equal(starsGained, 0);
  assert.equal(newRecord, false);
  ({ meta, newRecord, starsGained } = recordGame(meta, finished('victory', 400)));
  assert.equal(starsGained, 1);
  assert.equal(newRecord, true);
  assert.equal(totalStars(meta), 3);
  ({ meta } = recordGame(meta, finished('defeat', 300)));
  assert.equal(meta.games, 4);
  assert.equal(meta.wins, 3);
});

test('V7 méta : recordGame ne modifie pas la méta reçue et ignore une partie en cours', () => {
  const meta = createMeta();
  const res = recordGame(meta, finished('victory', 400));
  assert.equal(meta.games, 0);
  assert.notEqual(res.meta, meta);
  assert.equal(recordGame(meta, { status: 'playing' }).meta.games, 0);
  assert.doesNotThrow(() => recordGame(null, null));
});

test('V7 méta : souches débloquées par les étoiles', () => {
  let meta = createMeta();
  assert.equal(isUnlocked(meta, 'standard'), true);
  assert.equal(isUnlocked(meta, 'rumeur'), false);
  assert.equal(isUnlocked(meta, 'inconnue'), false);
  meta = recordGame(meta, finished('victory', 400)).meta;
  const rumeur = STRAINS.find((s) => s.id === 'rumeur');
  assert.equal(isUnlocked(meta, 'rumeur'), totalStars(meta) >= rumeur.unlockStars);
});

test('V7 méta : défi du jour, record par date, 30 derniers conservés', () => {
  let meta = createMeta();
  meta = recordGame(meta, finished('defeat', 300, 'normal', { dailyChallenge: true, seed: '2026-10-19' })).meta;
  assert.equal(meta.daily['2026-10-19'].won, false);
  const res = recordGame(meta, finished('victory', 480, 'normal', { dailyChallenge: true, seed: '2026-10-19' }));
  assert.equal(res.newRecord, true);
  assert.equal(res.meta.daily['2026-10-19'].day, 480);
  meta = res.meta;
  for (let d = 1; d <= 40; d++) {
    const seed = `2026-11-${String(d).padStart(2, '0')}`;
    meta = recordGame(meta, finished('defeat', 300, 'normal', { dailyChallenge: true, seed })).meta;
  }
  assert.ok(Object.keys(meta.daily).length <= 30);
});
