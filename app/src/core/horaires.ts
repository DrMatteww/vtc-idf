/* ==========================================================================
   « Est-ce ouvert maintenant ? »

   C'est le point le plus facile à mal reprendre de tout le projet, et le
   dossier le dit (§ 4.5) : un restaurant ouvert jusqu'à 1 h porte f = 1500,
   pas 60. À 0h30, c'est l'horaire DE LA VEILLE qu'il faut interroger.

   Sur la donnée réelle, 3 145 valeurs de `f` dépassent 1440 et la plus haute
   vaut 2879 — soit 23h59 le LENDEMAIN. Un `% 1440` quelque part dans ce
   fichier, et l'application se trompe de vingt-quatre heures sans rien dire.
   ========================================================================== */

import { DateTime } from 'luxon';

import { maintenant, nuitEnCours } from './temps';
import type { Horaires, LieuHoraire, Service, Toilette } from './types';

/**
 * Convertit « minutes depuis minuit » en instant, à partir d'un jour de base.
 *
 * Les jours sont ajoutés par `plus({ days })`, qui est calendaire chez Luxon
 * et conserve donc l'heure murale au passage d'un changement d'heure. Ajouter
 * 1500 minutes en bloc, comme le faisait la version WebView, décale d'une
 * heure la nuit du changement — deux fois par an, une fiche sur quatre.
 */
export function minutesEnInstant(base: DateTime, minutes: number): DateTime {
  const jours = Math.floor(minutes / 1440);
  const reste = minutes % 1440;
  return base.startOf('day').plus({ days: jours }).plus({ minutes: reste });
}

/** Lundi = 0, comme dans OpenStreetMap et comme dans les tableaux o/f. */
export function indexJour(d: DateTime): number {
  return d.weekday - 1;
}

export interface EtatHoraire {
  /** Vrai si c'est ouvert à l'instant demandé. */
  ouvert: boolean;
  debut: DateTime;
  fin: DateTime;
  h24: boolean;
}

/**
 * L'état d'un lieu à horaires, lu sur le jour où LA NUIT a commencé — pas sur
 * le jour courant. À trois heures du matin, le McDonald's qui ferme à 4 h
 * relève d'hier.
 *
 * Renvoie `null` quand le lieu est fermé ce jour-là, quand il a déjà fermé,
 * ou quand la fiche n'a pas d'horaires (saisie à la main).
 */
export function etatHoraire(
  lieu: Pick<LieuHoraire, 'o' | 'f' | 'h24'>,
  now: DateTime = maintenant(),
): EtatHoraire | null {
  if (!lieu || !lieu.o || !lieu.f) return null;

  const nuit = nuitEnCours(now);
  const base = nuit.debut.startOf('day');
  const i = indexJour(base);

  const o = lieu.o[i];
  const f = lieu.f[i];
  if (o === null || o === undefined) return null;
  if (f === null || f === undefined) return null; // fermé ce jour-là

  const debut = minutesEnInstant(base, o);
  const fin = minutesEnInstant(base, f);
  if (fin <= now) return null; // déjà fermé

  return { ouvert: now >= debut, debut, fin, h24: !!lieu.h24 };
}

/**
 * Pour une station, « ouvert » a deux sens, et le fichier officiel les
 * distingue : la BOUTIQUE a ses horaires, et l'AUTOMATE tourne souvent
 * 24h/24. Pour faire le plein de nuit, l'automate suffit — c'est même la
 * seule chose qui compte.
 */
export function ouvert24(s: Pick<Service, 'h24' | 'pompes24'>): boolean {
  return !!(s.h24 || s.pompes24);
}

/* ---- Les toilettes de parc, et celles qui n'en sont pas ---------------
   Deux relevés de terrain que la donnée ne porte pas, et qui vont en sens
   contraire :

   - les sanisettes dont l'horaire dit « Horaires du parc » sont DANS les
     parcs de la Ville. Les parcs ferment la nuit, donc elles ferment avec
     eux : les afficher à trois heures du matin, c'est envoyer un chauffeur
     contre une grille. On les masque pendant la nuit ;
   - celles qui affichent « 06h00 - 22h00 », en revanche, restent affichées :
     la porte arrière, côté urinoir, reste ouverte la nuit. L'information est
     partielle — elle ne vaut que pour les hommes — mais elle est juste, et
     utile à la quasi-totalité des chauffeurs.

   On ne masque donc QUE les parcs, et seulement entre 21 h et 6 h.        */

export function estToiletteDeParc(t: Pick<Toilette, 'open_label'>): boolean {
  return /parc/i.test(t?.open_label ?? '');
}

/** Les horaires sont-ils exploitables, ou la fiche est-elle muette ? */
export function aDesHoraires(h: Horaires | undefined | null): boolean {
  return Array.isArray(h) && h.length === 7;
}
