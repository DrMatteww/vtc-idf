import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';

import {
  ECHEANCES, echeanceUrgente, etatDe, joursAvant, libelleEcheance, lireEcheances,
} from '../echeances';
import { ZONE } from '../temps';

const t = (iso: string) => DateTime.fromISO(iso, { zone: ZONE });
const now = t('2026-10-28T15:00');

describe('les jours restants', () => {
  it('se comptent en jours PLEINS', () => {
    /* Une échéance à 23 h ce soir, c'est « aujourd'hui », pas 0,4 jour. */
    expect(joursAvant('2026-10-28', now)).toBe(0);
    expect(joursAvant('2026-10-29', now)).toBe(1);
    expect(joursAvant('2026-10-27', now)).toBe(-1);
  });

  it('une date illisible ne plante pas', () => {
    expect(joursAvant('pas une date', now)).toBeNull();
  });
});

describe('la carte VTC prévient trois mois avant', () => {
  it('parce que son renouvellement prend deux mois en préfecture', () => {
    const carte = ECHEANCES.find((e) => e.code === 'carte')!;
    expect(carte.rappel).toBe(90);
    for (const e of ECHEANCES.filter((x) => x.code !== 'carte')) {
      expect(e.rappel).toBe(30);
    }
  });

  it('à 80 jours, la carte alerte déjà', () => {
    const carte = ECHEANCES.find((e) => e.code === 'carte')!;
    expect(etatDe(carte, 80)).toBe('bientot');
  });

  it('à 80 jours, l’assurance non', () => {
    const assurance = ECHEANCES.find((e) => e.code === 'assurance')!;
    expect(etatDe(assurance, 80)).toBe('ok');
  });

  it('une date passée est dépassée', () => {
    expect(etatDe(ECHEANCES[0], -3)).toBe('depasse');
  });

  it('non renseignée reste vide', () => {
    expect(etatDe(ECHEANCES[0], null)).toBe('vide');
  });
});

describe('la plus urgente, pour le brief', () => {
  it('chacune a son propre délai, et c’est la plus proche qui gagne', () => {
    const u = echeanceUrgente(
      { carte: '2027-01-10', assurance: '2026-11-10' }, // 74 j et 13 j
      now,
    );
    expect(u?.code).toBe('assurance');
  });

  it('la carte VTC passe devant si elle est plus proche', () => {
    const u = echeanceUrgente({ carte: '2026-11-05', assurance: '2026-11-20' }, now);
    expect(u?.code).toBe('carte');
  });

  it('rien d’urgent, rien à dire', () => {
    expect(echeanceUrgente({ assurance: '2027-06-01' }, now)).toBeNull();
  });

  it('aucune saisie, rien à dire non plus', () => {
    expect(echeanceUrgente({}, now)).toBeNull();
  });

  it('une échéance dépassée reste urgente', () => {
    expect(echeanceUrgente({ technique: '2026-10-01' }, now)?.code).toBe('technique');
  });
});

describe('les libellés', () => {
  it('parlent comme on parle', () => {
    expect(libelleEcheance(null)).toBe('non renseignée');
    expect(libelleEcheance(0)).toBe('aujourd’hui');
    expect(libelleEcheance(1)).toBe('demain');
    expect(libelleEcheance(12)).toBe('dans 12 jours');
    expect(libelleEcheance(90)).toBe('dans 3 mois');
    expect(libelleEcheance(-1)).toBe('dépassée depuis hier');
    expect(libelleEcheance(-5)).toBe('dépassée depuis 5 jours');
  });
});

describe('la lecture complète', () => {
  it('renvoie les cinq, saisies ou non', () => {
    const l = lireEcheances({ carte: '2026-11-05' }, now);
    expect(l).toHaveLength(5);
    expect(l.find((e) => e.code === 'carte')?.etat).toBe('bientot');
    expect(l.find((e) => e.code === 'medical')?.etat).toBe('vide');
  });
});
