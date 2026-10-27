import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';

import {
  ZONE, aParis, compteARebours, finDeJournee, finDeTranche, finHorizon,
  hhmm, libellePeriode, nuitEnCours, titreNuit, tranche,
} from '../temps';

const t = (iso: string) => DateTime.fromISO(iso, { zone: ZONE });

describe('le fuseau, quoi que dise le téléphone', () => {
  /* Toute la suite tourne sous TZ=America/New_York (voir package.json).
     Ces tests échouent si une règle retombe sur l'heure de l'appareil. */

  it("l'appareil n'est PAS à Paris, c'est voulu", () => {
    expect(DateTime.now().zoneName).not.toBe(ZONE);
  });

  it('lit une heure parisienne comme parisienne', () => {
    expect(aParis('2026-10-28T22:47:00+01:00').hour).toBe(22);
  });

  it('résout un fuseau nommé, pas un décalage figé', () => {
    expect(aParis('2026-07-15T12:00:00+02:00').offset).toBe(120); // été
    expect(aParis('2026-01-15T12:00:00+01:00').offset).toBe(60); // hiver
  });

  it('passe le changement d’heure d’octobre sans broncher', () => {
    /* Le 25 octobre 2026, 3h CEST devient 2h CET. L'instant pivot est
       01:00 UTC : juste avant on est à +2, juste après à +1. */
    expect(aParis('2026-10-25T00:30:00Z').offset).toBe(120);
    expect(aParis('2026-10-25T01:30:00Z').offset).toBe(60);
  });
});

describe('les tranches de la journée', () => {
  const cas: [string, string][] = [
    ['2026-10-28T04:59', 'Cette nuit'],
    ['2026-10-28T05:00', 'Ce matin'],
    ['2026-10-28T10:59', 'Ce matin'],
    ['2026-10-28T11:00', 'Ce midi'],
    ['2026-10-28T13:59', 'Ce midi'],
    ['2026-10-28T14:00', 'Cet après-midi'],
    ['2026-10-28T17:59', 'Cet après-midi'],
    ['2026-10-28T18:00', 'Ce soir'],
    ['2026-10-28T23:59', 'Ce soir'],
    ['2026-10-28T00:00', 'Cette nuit'],
  ];
  for (const [iso, libelle] of cas) {
    it(iso.slice(11) + ' → ' + libelle, () => {
      expect(tranche(t(iso)).libelle).toBe(libelle);
    });
  }

  it('la fin de tranche tombe sur la borne suivante', () => {
    expect(finDeTranche(t('2026-10-28T19:30')).hour).toBe(0);
    expect(finDeTranche(t('2026-10-28T12:00')).hour).toBe(14);
  });
});

describe('la journée du chauffeur finit à 6 h, pas à minuit', () => {
  it('à 23 h, la journée court jusqu’à 6 h DEMAIN', () => {
    const f = finDeJournee(t('2026-10-28T23:00'));
    expect(f.day).toBe(29);
    expect(f.hour).toBe(6);
  });

  it('à 3 h du matin, on est encore dans la journée de la veille', () => {
    const f = finDeJournee(t('2026-10-29T03:00'));
    expect(f.day).toBe(29);
    expect(f.hour).toBe(6);
  });
});

describe("l'horizon s'arrête à la fin de demain", () => {
  it('à 23 h le 28, l’horizon va au 30 à 6 h', () => {
    const h = finHorizon(t('2026-10-28T23:00'));
    expect(h.day).toBe(30);
    expect(h.hour).toBe(6);
  });

  it('à 2 h le 29, on compte depuis le 28 : horizon au 30', () => {
    const h = finHorizon(t('2026-10-29T02:00'));
    expect(h.day).toBe(30);
    expect(h.hour).toBe(6);
  });
});

describe('la nuit en cours n’est pas le jour calendaire', () => {
  it('à 3 h du matin un vendredi, la nuit est celle de JEUDI à vendredi', () => {
    const n = nuitEnCours(t('2026-10-30T03:00')); // vendredi
    expect(n.debut.day).toBe(29); // jeudi 21 h
    expect(n.debut.hour).toBe(21);
    expect(n.fin.day).toBe(30);
    expect(n.fin.hour).toBe(6);
    expect(titreNuit(n)).toBe('Nuit de jeudi à vendredi, 21h → 6h');
  });

  it('à 22 h un vendredi, la nuit est celle de vendredi à samedi', () => {
    const n = nuitEnCours(t('2026-10-30T22:00'));
    expect(n.debut.day).toBe(30);
    expect(n.fin.day).toBe(31);
  });

  it('à 18 h, la nuit « en cours » est celle du soir qui vient', () => {
    const n = nuitEnCours(t('2026-10-30T18:00'));
    expect(n.debut.day).toBe(30);
    expect(n.debut.hour).toBe(21);
  });
});

describe('les libellés', () => {
  it('écrit les heures à la française', () => {
    expect(hhmm(t('2026-10-28T22:47'))).toBe('22h47');
    expect(hhmm(t('2026-10-28T07:05'))).toBe('07h05');
  });

  it('compte à rebours', () => {
    const now = t('2026-10-28T20:00');
    expect(compteARebours('2026-10-28T20:20+01:00', now)).toBe('dans 20 min');
    expect(compteARebours('2026-10-28T22:30+01:00', now)).toBe('dans 2 h 30');
    expect(compteARebours('2026-10-28T19:30+01:00', now)).toBe('en cours');
    expect(compteARebours('2026-10-28T17:00+01:00', now)).toBe('terminé');
  });

  it('une nuit s’écrit en heures, un chantier en date', () => {
    expect(libellePeriode('2026-10-28T21:00+01:00', '2026-10-29T06:00+01:00'))
      .toBe('21h00 → 06h00');
    expect(libellePeriode('2026-08-22T12:00+02:00', '2026-10-23T12:00+02:00'))
      .toBe('jusqu’au 23/10');
  });
});
