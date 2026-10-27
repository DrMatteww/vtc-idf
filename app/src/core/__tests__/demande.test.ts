import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';

import { enCours, estSortie, finDe, flammes, meilleure, score } from '../demande';
import { ZONE } from '../temps';
import type { Demand, Kind } from '../types';

const t = (iso: string) => DateTime.fromISO(iso, { zone: ZONE });

let n = 0;
function d(p: Partial<Demand> & { start: string }): Demand {
  return {
    id: 'x' + n++,
    kind: 'train',
    title: '4 arrivées',
    venue: 'Montparnasse',
    dept: '75',
    lat: 48.84,
    lon: 2.32,
    end: null,
    count: 4,
    volume: 120,
    note: null,
    ...p,
  } as Demand;
}

describe('les flammes, jamais un chiffre', () => {
  const cas: [number | null, number][] = [
    [null, 0], [0, 0], [44, 0],
    [45, 1], [99, 1],
    [100, 2], [199, 2],
    [200, 3], [1000, 3],
  ];
  for (const [vol, attendu] of cas) {
    it('volume ' + vol + ' → ' + attendu + ' flamme(s)', () => {
      expect(flammes(vol)).toBe(attendu);
    });
  }
});

describe('arrivée ou sortie', () => {
  it('un concert, un match, un salon : c’est la SORTIE qui compte', () => {
    for (const k of ['concert', 'sport', 'salon'] as Kind[]) {
      expect(estSortie({ kind: k })).toBe(true);
    }
  });
  it('un train ou un vol : c’est l’arrivée', () => {
    expect(estSortie({ kind: 'train' })).toBe(false);
    expect(estSortie({ kind: 'flight' })).toBe(false);
  });
  it('un concert sans fin publiée reste affiché 2h30', () => {
    const c = d({ kind: 'concert', start: '2026-10-28T20:00+01:00' });
    expect(finDe(c).hour).toBe(22);
    expect(finDe(c).minute).toBe(30);
  });
});

describe('ce qui est encore devant soi', () => {
  const now = t('2026-10-28T23:00'); // mercredi 23 h

  it('à 23 h, un TGV de 8 h demain n’est PAS affiché', () => {
    const l = enCours([d({ kind: 'train', start: '2026-10-29T08:00+01:00' })], now);
    expect(l).toHaveLength(0);
  });

  it('mais un concert de demain soir, OUI — ça se prépare la veille', () => {
    const l = enCours([d({ kind: 'concert', start: '2026-10-29T20:00+01:00' })], now);
    expect(l).toHaveLength(1);
  });

  it('un match dans six jours est hors horizon', () => {
    const l = enCours([d({ kind: 'sport', start: '2026-11-03T20:00+01:00' })], now);
    expect(l).toHaveLength(0);
  });

  it('un créneau d’arrivées terminé disparaît', () => {
    const l = enCours(
      [d({ start: '2026-10-28T18:00+01:00', end: '2026-10-28T20:00+01:00' })],
      now,
    );
    expect(l).toHaveLength(0);
  });
});

describe('le score : le proche bat le gros', () => {
  const now = t('2026-10-28T20:00');

  it('un événement moyen dans 20 min passe devant un gros dans 3 h', () => {
    const gros = d({ volume: 300, start: '2026-10-28T23:00+01:00' });
    const proche = d({ volume: 120, start: '2026-10-28T20:20+01:00' });
    expect(score(proche, now)).toBeGreaterThan(score(gros, now));
  });

  it('ce qui est fini depuis plus de 30 min ne score plus', () => {
    expect(score(d({ start: '2026-10-28T19:00+01:00' }), now)).toBe(-1);
  });

  it('meilleure() choisit un seul bloc', () => {
    const gros = d({ volume: 300, start: '2026-10-28T23:00+01:00' });
    const proche = d({ volume: 120, start: '2026-10-28T20:20+01:00' });
    expect(meilleure([gros, proche], now)?.id).toBe(proche.id);
  });

  it('et ne renvoie rien quand il n’y a rien', () => {
    expect(meilleure([], now)).toBeNull();
  });
});
