import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';

import {
  badgeFermeture, estPermanente, fermeturesActives, fermeturesDeLaNuit,
  fermeturesPermanentes,
} from '../fermetures';
import { ZONE, nuitEnCours } from '../temps';
import type { Closure } from '../types';

const t = (iso: string) => DateTime.fromISO(iso, { zone: ZONE });

let n = 0;
function c(p: Partial<Closure>): Closure {
  return {
    id: 'dx-' + n++,
    kind: 'nuit',
    title: 'A86 extérieur',
    detail: '',
    dept: '94',
    days: 'lun-ven',
    lat: 48.8,
    lon: 2.4,
    severity: 'high',
    from: '2026-10-28T21:00+01:00',
    to: '2026-10-29T06:00+01:00',
    ...p,
  } as Closure;
}

describe('deux natures de fermeture', () => {
  it('« continu » est permanent — et ce champ manque au document de passation', () => {
    expect(estPermanente(c({ continu: true }))).toBe(true);
  });

  it('un chantier est permanent', () => {
    expect(estPermanente(c({ kind: 'chantier' }))).toBe(true);
  });

  it('une fermeture de nuit ne l’est pas', () => {
    expect(estPermanente(c({ kind: 'nuit' }))).toBe(false);
  });
});

describe('la nuit en cours', () => {
  const nuit = nuitEnCours(t('2026-10-28T23:00'));

  it('ne retient que les fermetures de cette nuit-là', () => {
    const l = fermeturesDeLaNuit(
      [
        c({}), // cette nuit
        c({ from: '2026-11-04T21:00+01:00', to: '2026-11-05T06:00+01:00' }), // la semaine prochaine
      ],
      nuit,
    );
    expect(l).toHaveLength(1);
  });

  it('écarte les permanentes, même si elles recouvrent la nuit', () => {
    const l = fermeturesDeLaNuit(
      [c({ continu: true, from: '2026-08-01T00:00+02:00', to: '2026-12-01T00:00+01:00' })],
      nuit,
    );
    expect(l).toHaveLength(0);
  });

  it('trie par heure de début', () => {
    const tard = c({ from: '2026-10-28T23:00+01:00' });
    const tot = c({ from: '2026-10-28T21:00+01:00' });
    expect(fermeturesDeLaNuit([tard, tot], nuit)[0].id).toBe(tot.id);
  });
});

describe('les permanentes ne s’affichent nulle part', () => {
  it('la liste est vide, par décision du terrain', () => {
    expect(fermeturesPermanentes()).toHaveLength(0);
  });
});

describe("l'étiquette", () => {
  it('dit « en continu » plutôt que d’inventer une date de fin', () => {
    expect(badgeFermeture(c({ continu: true }))).toBe('en continu');
  });

  it('donne les heures pour une nuit', () => {
    expect(badgeFermeture(c({}))).toBe('21h00 → 06h00');
  });
});

describe('ce qui est actif', () => {
  it('écarte ce qui est fini', () => {
    const now = t('2026-10-29T10:00');
    expect(fermeturesActives([c({})], 180, now)).toHaveLength(0);
  });

  it('garde ce qui commence dans l’horizon', () => {
    const now = t('2026-10-28T19:00'); // 2 h avant 21 h
    expect(fermeturesActives([c({})], 180, now)).toHaveLength(1);
  });

  it('écarte ce qui commence trop tard', () => {
    const now = t('2026-10-28T12:00'); // 9 h avant
    expect(fermeturesActives([c({})], 180, now)).toHaveLength(0);
  });
});
