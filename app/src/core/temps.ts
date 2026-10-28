/* ==========================================================================
   Le temps. Transposé d'app.js.

   RÈGLE ABSOLUE DE CE FICHIER : tout est en Europe/Paris, par un fuseau
   NOMMÉ, jamais un décalage fixe. Le changement d'heure a déjà causé un bug
   dans ce projet (passation/04-architecture-et-portage.md § 4.5), et un
   téléphone réglé sur un autre fuseau ne doit rien changer à ce qu'affiche
   l'application : un chauffeur qui roule à Roissy lit des heures de Roissy.
   ========================================================================== */

import { DateTime } from 'luxon';

export const ZONE = 'Europe/Paris';

/** Maintenant, en heure de Paris. Le seul point d'entrée du temps. */
export function maintenant(): DateTime {
  return DateTime.now().setZone(ZONE);
}

/** Convertit un instant quelconque en heure de Paris. */
export function aParis(t: string | Date | number): DateTime {
  if (typeof t === 'string') return DateTime.fromISO(t, { zone: ZONE });
  if (t instanceof Date) return DateTime.fromJSDate(t, { zone: ZONE });
  return DateTime.fromMillis(t, { zone: ZONE });
}

/* ---- Les tranches de la journée ---------------------------------------
   Le titre de l'écran suit l'heure réelle d'ouverture de l'app. Ce détail
   fait énormément pour la sensation que l'app parle de maintenant.        */

export type CleTranche = 'matin' | 'midi' | 'aprem' | 'soir' | 'nuit';

export interface Tranche {
  cle: CleTranche;
  libelle: string;
}

export function tranche(d: DateTime = maintenant()): Tranche {
  const h = d.hour;
  if (h >= 5 && h < 11) return { cle: 'matin', libelle: 'Ce matin' };
  if (h >= 11 && h < 14) return { cle: 'midi', libelle: 'Ce midi' };
  if (h >= 14 && h < 18) return { cle: 'aprem', libelle: 'Cet après-midi' };
  if (h >= 18) return { cle: 'soir', libelle: 'Ce soir' };
  return { cle: 'nuit', libelle: 'Cette nuit' };
}

/** Fin de la tranche courante : sépare « maintenant » du « plus tard ». */
export function finDeTranche(d: DateTime = maintenant()): DateTime {
  for (const b of [5, 11, 14, 18, 24]) {
    if (d.hour < b) return d.startOf('day').plus({ hours: b });
  }
  return d.startOf('day').plus({ hours: 24 });
}

/* ---- La journée du chauffeur finit à 6 h ------------------------------
   Les arrivées de demain n'apparaissent qu'à partir de 6 h demain : à 23 h,
   personne ne va se placer pour un TGV de 8 h du matin, et ces lignes-là
   poussaient le reste hors de l'écran. Les événements échappent à la règle :
   un match ou un salon de demain, ça se prépare la veille.                */

export const JOURNEE_FINIT_A = 6;

export function finDeJournee(now: DateTime = maintenant()): DateTime {
  const f = now.startOf('day').plus({ hours: JOURNEE_FINIT_A });
  return now.hour >= JOURNEE_FINIT_A ? f.plus({ days: 1 }) : f;
}

/* ---- L'horizon : aujourd'hui et demain, pas plus ----------------------
   La billetterie publie jusqu'à dix jours à l'avance. Affichés tels quels,
   les concerts de la semaine suivante poussaient la soirée en cours hors de
   l'écran, pour une information sans usage au volant : personne ne se place
   pour un match dans six jours. On coupe à la fin de la journée de DEMAIN,
   la journée étant celle du chauffeur — elle finit à 6 h, pas à minuit. À
   2 h, « aujourd'hui » est donc encore la nuit qu'on est en train de faire. */

export const HORIZON_JOURS = 2;

export function finHorizon(now: DateTime = maintenant()): DateTime {
  const base = now.hour < JOURNEE_FINIT_A ? now.minus({ days: 1 }) : now;
  return base
    .startOf('day')
    .plus({ hours: JOURNEE_FINIT_A })
    .plus({ days: HORIZON_JOURS });
}

/* ---- La nuit en cours --------------------------------------------------
   Une « nuit » va de 21 h à 6 h. Avant 6 h du matin on est encore dans celle
   de la veille ; à partir de 6 h, c'est celle du soir qui vient. La bascule
   se fait toute seule à la première ouverture après 6 h, sans rien attendre
   du serveur : c'est l'heure du téléphone qui décide.

   Conséquence voulue : la liste ne montre qu'une nuit, jamais toute la
   semaine. Et comme il n'y en a qu'une, inutile d'écrire le jour sur chaque
   ligne.                                                                   */

export const NUIT_DE = 21;
export const NUIT_A = 6;

export interface Nuit {
  debut: DateTime;
  fin: DateTime;
}

export function nuitEnCours(now: DateTime = maintenant()): Nuit {
  let debut = now.startOf('day').plus({ hours: NUIT_DE });
  if (now.hour < NUIT_A) debut = debut.minus({ days: 1 });
  const fin = debut.plus({ days: 1 }).startOf('day').plus({ hours: NUIT_A });
  return { debut, fin };
}

export function dansLaNuit(now: DateTime = maintenant()): boolean {
  return now.hour >= NUIT_DE || now.hour < NUIT_A;
}

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

export function titreNuit(n: Nuit): string {
  return (
    'Nuit de ' + JOURS[n.debut.weekday - 1] + ' à ' + JOURS[n.fin.weekday - 1] +
    ', ' + NUIT_DE + 'h → ' + NUIT_A + 'h'
  );
}

/* ---- Libellés ---------------------------------------------------------
   Écrits à la main plutôt que délégués au formatage local : la casse et la
   forme (« mercredi 28 octobre », sans l'année) sont des choix de lecture,
   et ils ne doivent pas changer avec la langue du téléphone.              */

export function libelleJour(d: DateTime = maintenant()): string {
  return JOURS[d.weekday - 1] + ' ' + d.day + ' ' + MOIS[d.month - 1];
}

/** « 22h47 ». Jamais « 22:47 » : le h est ce qu'on lit en France. */
export function hhmm(d: DateTime): string {
  return d.toFormat("HH'h'mm");
}

/**
 * Vrai si l'instant tombe APRÈS la fin de la journée de travail en cours.
 *
 * Sans ça, deux jours du même salon — « Porte de Versailles, 14h00 » le 28 et
 * le 29 — s'affichent à l'identique dans le brief, et rien ne dit lequel est
 * aujourd'hui. La journée de référence est celle du chauffeur : elle finit à
 * 6 h, pas à minuit.
 */
export function estLeLendemain(iso: string, now: DateTime = maintenant()): boolean {
  return aParis(iso) >= finDeJournee(now);
}

/**
 * L'étiquette de section de la timeline : où l'on en est dans la journée,
 * pour que la liste reste lisible quand elle court sur vingt-quatre heures.
 *
 * Le découpage est CALENDAIRE ici, contrairement à `finDeJournee` : « Demain »
 * veut dire demain, pas « après 6 h ». Un chauffeur lit une date, pas une
 * convention de service.
 */
export function sectionDe(iso: string, now: DateTime = maintenant()): string {
  const d = aParis(iso);
  if (d.hasSame(now, 'day')) return tranche(d).libelle;
  if (d.hasSame(now.plus({ days: 1 }), 'day')) return 'Demain';
  return libelleJour(d);
}

export function minutesJusqua(iso: string, now: DateTime = maintenant()): number {
  return Math.round(aParis(iso).diff(now, 'minutes').minutes);
}

export function compteARebours(iso: string, now: DateTime = maintenant()): string {
  const m = minutesJusqua(iso, now);
  if (m < -120) return 'terminé';
  if (m < 0) return 'en cours';
  if (m === 0) return 'maintenant';
  if (m < 60) return 'dans ' + m + ' min';
  const h = Math.floor(m / 60);
  const r = m % 60;
  return 'dans ' + h + ' h' + (r ? ' ' + String(r).padStart(2, '0') : '');
}

/* Une fermeture de nuit tient dans une soirée, et le JOUR compte autant que
   l'heure : toutes affichent « 21h00 → 06h00 », donc sans la nuit concernée
   on ne sait pas si c'est ce soir ou mardi prochain. Une perturbation de
   chantier, elle, dure des semaines : on écrit alors la date de fin.      */
export function libellePeriode(de: string, a: string): string {
  const d = aParis(de);
  const f = aParis(a);
  if (f.diff(d, 'hours').hours <= 20) return hhmm(d) + ' → ' + hhmm(f);
  return 'jusqu’au ' + f.day + '/' + f.month;
}

/* ---- Le fuseau fonctionne-t-il vraiment ? -----------------------------
   Luxon s'appuie sur Intl pour résoudre un fuseau nommé. Selon le moteur
   JavaScript embarqué, Intl peut être tronqué et `setZone` échouer
   silencieusement — on se retrouve alors sur l'heure de l'appareil sans
   aucune erreur. On vérifie donc, au lieu de supposer.                    */

export interface DiagnosticFuseau {
  ok: boolean;
  zone: string;
  zoneAppareil: string;
  heureParis: string;
  decalageMin: number;
  intlPresent: boolean;
  detail: string;
}

export function diagnosticFuseau(): DiagnosticFuseau {
  const intlPresent =
    typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function';
  const d = DateTime.now().setZone(ZONE);
  const valide = d.isValid && d.zoneName === ZONE;
  return {
    ok: intlPresent && valide,
    zone: d.zoneName ?? '—',
    zoneAppareil: DateTime.now().zoneName ?? '—',
    heureParis: d.toFormat("HH'h'mm"),
    decalageMin: d.offset,
    intlPresent,
    detail: valide
      ? 'fuseau nommé résolu'
      : (d.invalidReason ?? 'setZone a échoué sans erreur'),
  };
}
