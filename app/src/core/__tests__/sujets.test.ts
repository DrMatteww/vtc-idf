import { describe, expect, it } from 'vitest';

import { SUJETS_CONNUS, SUJET_TOUS, basculeSujets, sujetDept, sujetsPour } from '../sujets';

describe('les sujets', () => {
  it('neuf en tout : le général plus les huit départements', () => {
    expect(SUJETS_CONNUS).toHaveLength(9);
    expect(SUJETS_CONNUS[0]).toBe('tous');
    expect(SUJETS_CONNUS).toContain('dept-93');
  });

  it('s’écrivent exactement comme dans notifier.py', () => {
    /* Un sujet mal orthographié ne lève aucune erreur côté Firebase : il crée
       un sujet vide et la notification part dans le vide. */
    expect(sujetDept('93')).toBe('dept-93');
  });
});

describe('à quoi l’appareil doit être abonné', () => {
  it('toujours au général', () => {
    expect(sujetsPour(null)).toEqual([SUJET_TOUS]);
  });

  it('plus son département quand on sait où il est', () => {
    expect(sujetsPour('94')).toEqual(['tous', 'dept-94']);
  });

  it('hors Île-de-France, rien de local', () => {
    // @ts-expect-error un département hors IDF n'est pas un Dept
    expect(sujetsPour('59')).toEqual([SUJET_TOUS]);
  });
});

describe('changer de département', () => {
  it('désabonne l’ancien ET abonne le nouveau', () => {
    /* Le bug qu'on évite : un chauffeur qui passe du 93 au 94 resterait
       abonné au 93 pour toujours. Sans compte, il n'aurait aucun moyen de
       s'en défaire. */
    const b = basculeSujets(['tous', 'dept-93'], ['tous', 'dept-94']);
    expect(b.abonner).toEqual(['dept-94']);
    expect(b.desabonner).toEqual(['dept-93']);
  });

  it('ne refait rien quand rien ne change', () => {
    const b = basculeSujets(['tous', 'dept-93'], ['tous', 'dept-93']);
    expect(b.abonner).toHaveLength(0);
    expect(b.desabonner).toHaveLength(0);
  });

  it('premier abonnement : tout à faire', () => {
    const b = basculeSujets([], ['tous', 'dept-75']);
    expect(b.abonner).toEqual(['tous', 'dept-75']);
    expect(b.desabonner).toHaveLength(0);
  });

  it('désactivation : tout à défaire', () => {
    const b = basculeSujets(['tous', 'dept-75'], []);
    expect(b.abonner).toHaveLength(0);
    expect(b.desabonner).toEqual(['tous', 'dept-75']);
  });

  it('perdre la position ne désabonne que du local', () => {
    const b = basculeSujets(['tous', 'dept-77'], ['tous']);
    expect(b.desabonner).toEqual(['dept-77']);
    expect(b.abonner).toHaveLength(0);
  });
});
