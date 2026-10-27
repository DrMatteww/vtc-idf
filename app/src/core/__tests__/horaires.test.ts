import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';

import { estToiletteDeParc, etatHoraire, indexJour, minutesEnInstant, ouvert24 } from '../horaires';
import { ZONE } from '../temps';

const t = (iso: string) => DateTime.fromISO(iso, { zone: ZONE });

/* 2026-10-26 est un LUNDI. Les tableaux o/f vont de lundi (0) à dimanche (6). */
const LUNDI = '2026-10-26';

describe('minutes depuis minuit → instant', () => {
  const base = t(LUNDI + 'T00:00');

  it('540 = 9h00 le jour même', () => {
    const d = minutesEnInstant(base, 540);
    expect(d.day).toBe(26);
    expect(d.hour).toBe(9);
  });

  it('1440 = minuit le LENDEMAIN, pas minuit le jour même', () => {
    const d = minutesEnInstant(base, 1440);
    expect(d.day).toBe(27);
    expect(d.hour).toBe(0);
  });

  it('1500 = 1h du matin le lendemain — un % 1440 donnerait 1h AUJOURD’HUI', () => {
    const d = minutesEnInstant(base, 1500);
    expect(d.day).toBe(27);
    expect(d.hour).toBe(1);
    expect(d.day).not.toBe(26); // l'erreur de 24 h que le dossier annonce
  });

  it('2879 existe dans la donnée réelle : 23h59 le lendemain', () => {
    const d = minutesEnInstant(base, 2879);
    expect(d.day).toBe(27);
    expect(d.hour).toBe(23);
    expect(d.minute).toBe(59);
  });

  it('garde l’heure murale au changement d’heure', () => {
    /* Nuit du 24 au 25 octobre 2026 : on recule d'une heure. Un lieu qui
       ferme à 1 h doit fermer à 1 h, pas à minuit. */
    const samedi = t('2026-10-24T00:00');
    const d = minutesEnInstant(samedi, 1500);
    expect(d.day).toBe(25);
    expect(d.hour).toBe(1);
  });

  it('lundi vaut 0', () => {
    expect(indexJour(t(LUNDI + 'T12:00'))).toBe(0);
    expect(indexJour(t('2026-11-01T12:00'))).toBe(6); // dimanche
  });
});

describe('« est-ce ouvert maintenant ? »', () => {
  /* Ouvert 9h → 1h du matin tous les jours. */
  const tardif = {
    o: [540, 540, 540, 540, 540, 540, 540],
    f: [1500, 1500, 1500, 1500, 1500, 1500, 1500],
    h24: false,
  };

  it('à 0h30 mardi, le lieu qui ferme à 1 h est ENCORE OUVERT', () => {
    /* La nuit a commencé lundi 21 h : c'est l'horaire de LUNDI qui compte. */
    const e = etatHoraire(tardif, t('2026-10-27T00:30'));
    expect(e).not.toBeNull();
    expect(e!.ouvert).toBe(true);
    expect(e!.fin.day).toBe(27);
    expect(e!.fin.hour).toBe(1);
  });

  it('à 1h30 mardi, il a fermé', () => {
    expect(etatHoraire(tardif, t('2026-10-27T01:30'))).toBeNull();
  });

  it('à 22 h lundi, il est ouvert', () => {
    const e = etatHoraire(tardif, t('2026-10-26T22:00'));
    expect(e!.ouvert).toBe(true);
  });

  it('à 8 h lundi, il est connu mais pas encore ouvert', () => {
    const e = etatHoraire(tardif, t('2026-10-26T08:00'));
    expect(e).not.toBeNull();
    expect(e!.ouvert).toBe(false);
    expect(e!.debut.hour).toBe(9);
  });

  it('un jour à null, c’est fermé ce jour-là', () => {
    const ferme = {
      o: [540, 540, 540, 540, 540, 540, null],
      f: [1320, 1320, 1320, 1320, 1320, 1320, null],
      h24: false,
    };
    expect(etatHoraire(ferme, t('2026-11-01T12:00'))).toBeNull(); // dimanche
  });

  it('une fiche sans horaires ne plante pas', () => {
    // @ts-expect-error fiche saisie à la main, sans o/f
    expect(etatHoraire({ h24: false }, t('2026-10-26T12:00'))).toBeNull();
  });
});

describe('les stations : la boutique ferme, l’automate non', () => {
  it('une station à pompes 24h/24 est toujours « ouverte »', () => {
    expect(ouvert24({ h24: false, pompes24: true })).toBe(true);
  });
  it('sans automate ni 24h/24, non', () => {
    expect(ouvert24({ h24: false, pompes24: false })).toBe(false);
  });
});

describe('les toilettes de parc', () => {
  it('se reconnaissent à leur libellé', () => {
    expect(estToiletteDeParc({ open_label: 'Horaires du parc' })).toBe(true);
    expect(estToiletteDeParc({ open_label: '06h00 - 22h00' })).toBe(false);
    expect(estToiletteDeParc({ open_label: '24/24h' })).toBe(false);
  });
});
