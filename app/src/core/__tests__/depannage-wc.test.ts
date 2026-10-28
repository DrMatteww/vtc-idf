import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';

import { TROP_LOIN_KM, depannageToilettes } from '../depannage-wc';
import { ZONE } from '../temps';
import type { Manger, Service, Toilette } from '../types';

const now = DateTime.fromISO('2026-10-28T03:00', { zone: ZONE }); // nuit du mardi
const CHOISY = { lat: 48.7656, lon: 2.4106 };

/* Ouvert en continu, les sept jours.
   ⚠️ f = 2880 et non 1440 : à 1440, l'endroit ferme à MINUIT et n'est donc
   pas ouvert à 3 h du matin. C'est le piège du format o/f, et le fait qu'il
   m'ait eu en écrivant ces fixtures dit bien qu'il fallait des tests. */
const TOUJOURS = { o: [0, 0, 0, 0, 0, 0, 0], f: [2880, 2880, 2880, 2880, 2880, 2880, 2880] };
/* Fermé la nuit : 9h → 20h. */
const EN_JOURNEE = { o: [540, 540, 540, 540, 540, 540, 540], f: [1200, 1200, 1200, 1200, 1200, 1200, 1200] };

const station = (p: Partial<Service>): Service => ({
  id: 's' + Math.random(), name: 'Station', address: 'Créteil', dept: '94',
  lat: 48.78, lon: 2.44, h24: false, t: 'station', ...TOUJOURS, ...p,
} as Service);

const chaine = (p: Partial<Manger>): Manger => ({
  id: 'm' + Math.random(), name: 'McDonald’s', address: 'Thiais', dept: '94',
  lat: 48.77, lon: 2.40, h24: false, t: 'chaine', ...TOUJOURS, ...p,
} as Manger);

const wc = (km: number): Toilette => ({
  id: 'wc1', name: 'Toilettes publiques', address: 'Choisy', dept: '94',
  /* ~0.009° de latitude par kilomètre. */
  lat: CHOISY.lat + km * 0.009, lon: CHOISY.lon, h24: true,
  open_label: '24/24h', pmr: true, bebe: false,
} as Toilette);

describe('on ne propose rien quand il y a déjà des toilettes à côté', () => {
  it('une toilette à 500 m suffit', () => {
    const d = depannageToilettes({
      toilettes: [wc(0.5)], services: [station({ wc: true })], manger: [], pos: CHOISY, now,
    });
    expect(d).toBeNull();
  });

  it('mais pas une à deux kilomètres', () => {
    const d = depannageToilettes({
      toilettes: [wc(2)], services: [station({ wc: true })], manger: [], pos: CHOISY, now,
    });
    expect(d).not.toBeNull();
    expect(2).toBeGreaterThan(TROP_LOIN_KM);
  });
});

describe('la station confirmée passe avant tout', () => {
  it('une station dont les toilettes sont écrites dans la donnée', () => {
    const d = depannageToilettes({
      toilettes: [], services: [station({ wc: true, h24: true })], manger: [chaine({})],
      pos: CHOISY, now,
    });
    expect(d?.certitude).toBe('sure');
    expect(d?.detail).toBe('ouverte 24h/24');
  });

  it('une station SANS toilettes ne compte pas', () => {
    const d = depannageToilettes({
      toilettes: [], services: [station({ wc: false })], manger: [chaine({})],
      pos: CHOISY, now,
    });
    expect(d?.certitude).toBe('probable');
  });

  it('une station fermée la nuit ne compte pas non plus : les WC sont dans la boutique', () => {
    const d = depannageToilettes({
      toilettes: [], services: [station({ wc: true, ...EN_JOURNEE })], manger: [chaine({})],
      pos: CHOISY, now,
    });
    expect(d?.certitude).toBe('probable');
  });
});

describe('à défaut, une chaîne ouverte — et on le dit', () => {
  it('elle est annoncée comme probable, jamais comme sûre', () => {
    const d = depannageToilettes({
      toilettes: [], services: [], manger: [chaine({})], pos: CHOISY, now,
    });
    expect(d?.certitude).toBe('probable');
    expect(d?.nom).toBe('McDonald’s');
  });

  it('une chaîne fermée ne dépanne personne', () => {
    const d = depannageToilettes({
      toilettes: [], services: [], manger: [chaine({ ...EN_JOURNEE })], pos: CHOISY, now,
    });
    expect(d).toBeNull();
  });

  it('une supérette n’est pas une chaîne de restauration', () => {
    const d = depannageToilettes({
      toilettes: [], services: [], manger: [chaine({ t: 'super' })], pos: CHOISY, now,
    });
    expect(d).toBeNull();
  });
});

describe('sans position, on ne devine pas', () => {
  it('aucune suggestion', () => {
    const d = depannageToilettes({
      toilettes: [], services: [station({ wc: true })], manger: [], pos: null, now,
    });
    expect(d).toBeNull();
  });
});
