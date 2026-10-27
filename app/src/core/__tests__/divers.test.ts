import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';

import { fraicheur } from '../fraicheur';
import { chercher, sansAccent } from '../recherche';
import { ZONE } from '../temps';

const t = (iso: string) => DateTime.fromISO(iso, { zone: ZONE });

describe('la fraîcheur est toujours visible', () => {
  const now = t('2026-10-28T23:00');

  it('frais sous trois heures', () => {
    const f = fraicheur('2026-10-28T22:45+01:00', false, now);
    expect(f.perime).toBe(false);
    expect(f.texte).toBe('à jour · 22h45');
  });

  it('périmé au-delà', () => {
    const f = fraicheur('2026-10-28T18:00+01:00', false, now);
    expect(f.perime).toBe(true);
    expect(f.texte).toBe('mis à jour à 18h00');
  });

  it('le hors-ligne se dit', () => {
    expect(fraicheur('2026-10-28T22:45+01:00', true, now).texte)
      .toBe('hors ligne · 22h45');
  });

  it('pas de date du tout : on ne prétend pas', () => {
    expect(fraicheur(null, false, now).texte).toBe('données indisponibles');
  });
});

describe('chercher comme on parle au volant', () => {
  const liste = [
    { name: "McDonald's Vélizy", address: 'Vélizy-Villacoublay', t: 'chaine' },
    { name: 'Chez Momo', address: 'Pantin', t: 'sandwich' },
    { name: 'Pizza Roma', address: 'Créteil', t: 'pizza' },
    { name: 'Total Access', address: 'A4', t: 'station' },
  ];

  it('« macdo » trouve McDonald’s', () => {
    expect(chercher(liste, 'macdo')).toHaveLength(1);
  });

  it('« mac do » en deux mots aussi', () => {
    expect(chercher(liste, 'mac do')).toHaveLength(1);
  });

  it('« grec » ramène les sandwicheries, pas un nom', () => {
    const r = chercher(liste, 'grec');
    expect(r).toHaveLength(1);
    expect(r[0].t).toBe('sandwich');
  });

  it('les accents ne bloquent pas', () => {
    expect(chercher(liste, 'velizy')).toHaveLength(1);
  });

  it('une recherche vide ne filtre rien', () => {
    expect(chercher(liste, '  ')).toHaveLength(4);
  });

  it('sansAccent écrase accents, casse et ponctuation', () => {
    expect(sansAccent("O'Tacos")).toBe('o tacos');
    expect(sansAccent('Vélizy-Villacoublay')).toBe('velizy villacoublay');
  });
});
