import { describe, expect, it } from 'vitest';

import {
  RAYON_HORS_IDF, departementA, distanceKm, formatDistance, proches, rayonPour,
} from '../geo';
import type { Commune } from '../types';

describe('les distances', () => {
  it('Châtelet → Orly, une quinzaine de kilomètres', () => {
    const km = distanceKm(48.8584, 2.3470, 48.7262, 2.3652);
    expect(km).toBeGreaterThan(13);
    expect(km).toBeLessThan(16);
  });

  it('s’écrivent en mètres sous le kilomètre', () => {
    expect(formatDistance(0.4)).toBe('400 m');
    expect(formatDistance(1.54)).toBe('1.5 km');
    expect(formatDistance(12.3)).toBe('12 km');
  });
});

describe('ce qui est à portée', () => {
  const pos = { lat: 48.8584, lon: 2.347 };

  it('écarte ce qui n’a pas de coordonnées, et le compte', () => {
    const r = proches(
      [
        { lat: 48.86, lon: 2.35 },
        { lat: null, lon: null },
        { lat: 48.72, lon: 2.36 }, // Orly, hors rayon de 10 km
      ],
      pos,
      10,
    );
    expect(r.liste).toHaveLength(1);
    expect(r.ecartes).toBe(1);
  });

  it('sans position, rien n’est filtré', () => {
    const r = proches([{ lat: 1, lon: 1 }], null);
    expect(r.liste).toHaveLength(1);
    expect(r.ecartes).toBe(0);
  });
});

describe('dans quel département suis-je', () => {
  const communes: Commune[] = [
    [48.8566, 2.3522, '75'],
    [48.7233, 2.3794, '91'], // Orly est administrativement dans l'Essonne
    [48.7904, 2.3588, '94'],
  ];

  it('un lieu connu à moins de 3 km impose SON département', () => {
    /* Le terminal d'Orly est rangé sous le 94 dans l'app : un chauffeur posté
       là veut la pastille sous laquelle sont rangés les vols d'Orly, pas
       celle de la commune. */
    const pos = { lat: 48.7262, lon: 2.3652 };
    const dept = departementA(pos, communes, [
      { lat: 48.7262, lon: 2.3652, dept: '94' },
    ]);
    expect(dept).toBe('94');
  });

  it('sinon, la commune la plus proche gagne', () => {
    const pos = { lat: 48.7262, lon: 2.3652 };
    expect(departementA(pos, communes, [])).toBe('91');
  });

  it('sans position, on ne devine pas', () => {
    expect(departementA(null, communes, [])).toBeNull();
  });
});

describe('le rayon dépend de là où tu es', () => {
  it('3 km dans Paris — dix km traverseraient la ville', () => {
    expect(rayonPour('75')).toBe(3);
  });

  it('10 km en proche couronne, de quoi toucher Paris', () => {
    expect(rayonPour('92')).toBe(10);
    expect(rayonPour('93')).toBe(10);
    expect(rayonPour('94')).toBe(10);
  });

  it('15 km en grande couronne, de quoi atteindre Paris, Orly ou Roissy', () => {
    for (const d of ['77', '78', '91', '95'] as const) {
      expect(rayonPour(d)).toBe(15);
    }
  });

  it('hors Île-de-France, on raisonne comme en grande couronne', () => {
    expect(rayonPour(null)).toBe(RAYON_HORS_IDF);
    expect(rayonPour(undefined)).toBe(RAYON_HORS_IDF);
  });

  it('La Chapelle → Montparnasse sort du rayon parisien', () => {
    /* C'est le cas qui a motivé la règle : 10 km mettaient Montparnasse dans
       la liste d'un chauffeur posté à La Chapelle. */
    const chapelle = { lat: 48.8846, lon: 2.3601 };
    const montparnasse = { lat: 48.8417, lon: 2.3209 };
    const km = distanceKm(chapelle.lat, chapelle.lon, montparnasse.lat, montparnasse.lon);
    expect(km).toBeGreaterThan(rayonPour('75'));
    expect(km).toBeLessThan(10); // d'où le piège : 10 km l'incluait
  });
});
