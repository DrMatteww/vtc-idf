import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';

import { DEPTS, dansFiltre, estImminent } from '../demande';
import { ZONE, sectionDe } from '../temps';

const t = (iso: string) => DateTime.fromISO(iso, { zone: ZONE });

describe('les filtres par type', () => {
  it('« Tout » laisse tout passer', () => {
    expect(dansFiltre('train', 'all')).toBe(true);
    expect(dansFiltre('salon', 'all')).toBe(true);
  });

  it('concerts, sport et salons sont réunis sous « Événements »', () => {
    expect(dansFiltre('concert', 'event')).toBe(true);
    expect(dansFiltre('sport', 'event')).toBe(true);
    expect(dansFiltre('salon', 'event')).toBe(true);
    expect(dansFiltre('train', 'event')).toBe(false);
  });

  it('trains et vols restent séparés', () => {
    expect(dansFiltre('train', 'train')).toBe(true);
    expect(dansFiltre('flight', 'train')).toBe(false);
  });

  it('les huit départements, plus « toute l’IDF »', () => {
    expect(DEPTS).toHaveLength(9);
    expect(DEPTS[0].code).toBe('all');
    expect(DEPTS[1].libelle).toBe('Paris');
  });
});

describe('les sections de la timeline', () => {
  const now = t('2026-10-28T15:30');

  it('aujourd’hui : la tranche de la journée', () => {
    expect(sectionDe('2026-10-28T16:00+01:00', now)).toBe('Cet après-midi');
    expect(sectionDe('2026-10-28T20:00+01:00', now)).toBe('Ce soir');
    expect(sectionDe('2026-10-28T23:30+01:00', now)).toBe('Ce soir');
  });

  it('le lendemain s’appelle « Demain »', () => {
    expect(sectionDe('2026-10-29T14:00+01:00', now)).toBe('Demain');
  });

  it('au-delà, la date en toutes lettres', () => {
    expect(sectionDe('2026-10-30T14:00+01:00', now)).toBe('vendredi 30 octobre');
  });
});

describe('ce qui est chaud s\u2019accentue', () => {
  const now = t('2026-10-28T15:46');

  it('ce qui commence dans l\u2019heure et demie', () => {
    expect(estImminent({ start: '2026-10-28T16:00+01:00', end: null }, now)).toBe(true);
  });

  it('ce qui vient de commencer', () => {
    expect(estImminent({ start: '2026-10-28T15:30+01:00', end: null }, now)).toBe(true);
  });

  it('un créneau de DEUX HEURES encore en cours — le cas réel du générateur', () => {
    /* 14h00 → 16h00 à 15h46 : c'est le créneau du moment, pas du passé. */
    expect(
      estImminent({ start: '2026-10-28T14:00+01:00', end: '2026-10-28T16:00+01:00' }, now),
    ).toBe(true);
  });

  it('mais un créneau terminé, non', () => {
    expect(
      estImminent({ start: '2026-10-28T12:00+01:00', end: '2026-10-28T14:00+01:00' }, now),
    ).toBe(false);
  });

  it('et ce qui est loin, non plus', () => {
    expect(estImminent({ start: '2026-10-28T20:00+01:00', end: null }, now)).toBe(false);
  });
});
