/* ==========================================================================
   La demande : ce qui va créer des courses, et dans quel ordre le montrer.
   Transposé d'app.js.
   ========================================================================== */

import { DateTime } from 'luxon';

import { aParis, finDeJournee, finHorizon, hhmm, maintenant, minutesJusqua } from './temps';
import type { Demand, Kind } from './types';

/* ---- La note de demande : des flammes, jamais un chiffre ---------------
   L'application n'affiche AUCUN nombre de courses. Une version précédente
   écrivait « ~149 courses » : fausse précision, retirée. Des flammes disent
   la même chose sans mentir, et se lisent sans se lire — à un feu rouge, on
   compte des flammes, on ne déchiffre pas un nombre.

   Les seuils sont ici, côté client, et pas dans le générateur : les régler
   ne demande ni de régénérer les données ni d'attendre le robot.

   ⚠️ DÉCISION PRODUIT, PAS CHOIX GRAPHIQUE. À conserver.                 */

export const SEUIL_3 = 200; // 🔥🔥🔥 on y va
export const SEUIL_2 = 100; // 🔥🔥   ça vaut le détour
export const SEUIL_1 = 45; //  🔥     il y a de quoi faire

export type Flammes = 0 | 1 | 2 | 3;

export function flammes(volume: number | null | undefined): Flammes {
  if (!volume || volume < SEUIL_1) return 0;
  if (volume >= SEUIL_3) return 3;
  if (volume >= SEUIL_2) return 2;
  return 1;
}

/* ---- « 22h30 », oui, mais 22h30 de quoi ? -----------------------------
   Pour une gare ou un aéroport, l'heure affichée est celle des ARRIVÉES.
   Pour une salle, c'est celle de la SORTIE — le seul moment qui intéresse un
   chauffeur — et elle est estimée, pas officielle : la billetterie ne publie
   que l'heure du billet. Sans le mot « sortie » devant, on lit l'heure du
   concert, et un concert à 22h30 à Bercy, ça n'existe pas.                */

const SORTIE: Record<string, true> = { concert: true, sport: true, salon: true };

export function estSortie(d: Pick<Demand, 'kind'>): boolean {
  return !!SORTIE[d.kind];
}

/** Un seul horaire, ou une plage si c'est un groupe d'arrivées. */
export function libelleCreneau(d: Demand): string {
  if (d.end && d.end !== d.start) return hhmm(aParis(d.start)) + '–' + hhmm(aParis(d.end));
  return hhmm(aParis(d.start));
}

/* ---- Ce qui est encore devant soi -------------------------------------
   Fin utile d'une ligne. Un créneau d'arrivées porte sa fin — « 18h-20h »
   n'intéresse plus personne à 20h01. Un concert, lui, n'a pas d'heure de fin
   publiée, et c'est pourtant à la SORTIE que la demande arrive : on le garde
   affiché le temps qu'il dure, sans écrire nulle part une heure de fin qu'on
   ne connaît pas.                                                          */

const QUEUE_MIN: Partial<Record<Kind, number>> = { concert: 150, sport: 120 };

export function finDe(d: Demand): DateTime {
  if (d.end) return aParis(d.end);
  return aParis(d.start).plus({ minutes: QUEUE_MIN[d.kind] ?? 0 });
}

/** Trains et vols ne dépassent pas la journée en cours ; les événements, si. */
const DU_JOUR: Partial<Record<Kind, true>> = { flight: true, train: true };

/** Ce qui est encore d'actualité : ni passé, ni au-delà de l'horizon. */
export function enCours(items: Demand[], now: DateTime = maintenant()): Demand[] {
  const finJour = finDeJournee(now);
  const horizon = finHorizon(now);
  return (items ?? []).filter((it) => {
    if (finDe(it) <= now) return false;
    const debut = aParis(it.start);
    if (debut >= horizon) return false;
    if (DU_JOUR[it.kind] && debut >= finJour) return false;
    return true;
  });
}

/** Ce qui tombe dans une fenêtre, en minutes relatives à maintenant. */
export function aVenir(
  items: Demand[],
  deMin: number,
  aMin: number,
  now: DateTime = maintenant(),
): Demand[] {
  return (items ?? []).filter((it) => {
    const m = minutesJusqua(it.start, now);
    const mFin = it.end ? minutesJusqua(it.end, now) : m;
    if (mFin < deMin) return false;
    return m <= aMin;
  });
}

/* ---- Le score ----------------------------------------------------------
   Ce qui est gros et proche passe devant ce qui est gros et loin dans le
   temps. Sert à choisir LE bloc « Maintenant » de l'accueil : un gros
   événement dans trois heures ne doit pas masquer un événement moyen dans
   vingt minutes.                                                           */
export function score(d: Demand, now: DateTime = maintenant()): number {
  const m = minutesJusqua(d.start, now);
  if (m < -30) return -1;
  const vol = d.volume || 5;
  const declin = m <= 0 ? 1 : 1 / (1 + m / 45);
  return vol * declin;
}

/** La meilleure opportunité, ou rien s'il n'y a rien qui vaille le déplacement. */
export function meilleure(items: Demand[], now: DateTime = maintenant()): Demand | null {
  let best: Demand | null = null;
  let bs = 0;
  for (const it of enCours(items, now)) {
    const s = score(it, now);
    if (s > bs) {
      bs = s;
      best = it;
    }
  }
  return best;
}

/* ---- Les filtres par type ---------------------------------------------
   Concerts, sport et salons sont réunis sous « Événements » : sur trois
   jours il y a rarement les trois à la fois, et trois pastilles dont deux
   vides, c'est trois occasions de cliquer pour ne rien trouver. Les séparer
   avait été essayé, puis abandonné.                                       */

export interface Filtre {
  code: string;
  libelle: string;
  genres: Kind[];
}

export const FILTRES: Filtre[] = [
  { code: 'train', libelle: 'Trains', genres: ['train'] },
  { code: 'flight', libelle: 'Vols', genres: ['flight'] },
  { code: 'event', libelle: 'Événements', genres: ['concert', 'sport', 'salon'] },
];

export function dansFiltre(genre: Kind, code: string): boolean {
  if (code === 'all') return true;
  const f = FILTRES.find((x) => x.code === code);
  return f ? f.genres.includes(genre) : false;
}

/** Les départements, dans l'ordre où un chauffeur d'IDF les cherche. */
export const DEPTS = [
  { code: 'all', libelle: 'Toute l\u2019IDF' },
  { code: '75', libelle: 'Paris' },
  { code: '92', libelle: '92' },
  { code: '93', libelle: '93' },
  { code: '94', libelle: '94' },
  { code: '95', libelle: '95' },
  { code: '78', libelle: '78' },
  { code: '91', libelle: '91' },
  { code: '77', libelle: '77' },
] as const;

/**
 * L'heure s'accentue quand le créneau est chaud : soit il commence dans
 * l'heure et demie, soit il est EN TRAIN de se produire.
 *
 * Le second cas n'est pas théorique : le générateur groupe les arrivées par
 * créneaux de DEUX HEURES — et non de trente minutes comme l'annonce
 * 03-les-donnees.md. À 15h46, le créneau « 14h00 → 16h00 » est celui qui est
 * en cours ; l'afficher en gris le ferait lire comme passé.
 */
export function estImminent(
  d: Pick<Demand, 'start' | 'end'>,
  now: DateTime = maintenant(),
): boolean {
  const m = minutesJusqua(d.start, now);
  if (m <= 90 && m > -30) return true;
  if (!d.end) return false;
  return aParis(d.start) <= now && aParis(d.end) > now;
}
