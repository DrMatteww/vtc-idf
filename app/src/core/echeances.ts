/* ==========================================================================
   Mes échéances.

   Carte VTC, visite médicale, formation continue : des dates qu'on oublie et
   qui ARRÊTENT L'ACTIVITÉ le jour où elles tombent. Tout reste dans le
   téléphone — rien n'est envoyé, rien n'est partagé : ce sont des papiers
   personnels, pas des données d'application.
   ========================================================================== */

import { DateTime } from 'luxon';

import { ZONE, maintenant } from './temps';

export interface Echeance {
  code: string;
  libelle: string;
  duree: string;
  /**
   * Combien de jours avant on commence à prévenir. La carte VTC a le sien,
   * bien plus long — le renouvellement prend environ deux mois en préfecture,
   * alors prévenir un mois avant, c'est prévenir trop tard.
   */
  rappel: number;
}

export const ECHEANCES: Echeance[] = [
  { code: 'carte', libelle: 'Carte VTC', duree: '5 ans', rappel: 90 },
  { code: 'medical', libelle: 'Visite médicale', duree: '5 ans, 2 ans après 60 ans', rappel: 30 },
  { code: 'formation', libelle: 'Formation continue', duree: '5 ans', rappel: 30 },
  { code: 'assurance', libelle: 'Assurance', duree: '1 an', rappel: 30 },
  { code: 'technique', libelle: 'Contrôle technique', duree: '1 an', rappel: 30 },
];

/** Les dates saisies, par code. Format « 2027-03-14 ». */
export type Saisies = Record<string, string>;

/**
 * Jours restants, en jours PLEINS : une échéance à 23 h ce soir, c'est
 * « aujourd'hui », pas « dans 0,4 jour ».
 */
export function joursAvant(date: string, now: DateTime = maintenant()): number | null {
  const d = DateTime.fromISO(date, { zone: ZONE });
  if (!d.isValid) return null;
  return Math.round(d.startOf('day').diff(now.startOf('day'), 'days').days);
}

export type EtatEcheance = 'vide' | 'ok' | 'bientot' | 'depasse';

export interface EcheanceLue extends Echeance {
  date: string;
  jours: number | null;
  etat: EtatEcheance;
}

export function etatDe(e: Echeance, jours: number | null): EtatEcheance {
  if (jours === null) return 'vide';
  if (jours < 0) return 'depasse';
  return jours <= e.rappel ? 'bientot' : 'ok';
}

export function lireEcheances(
  saisies: Saisies,
  now: DateTime = maintenant(),
): EcheanceLue[] {
  return ECHEANCES.map((e) => {
    const date = saisies[e.code] ?? '';
    const jours = date ? joursAvant(date, now) : null;
    return { ...e, date, jours, etat: etatDe(e, jours) };
  });
}

/**
 * La plus urgente, si elle mérite d'apparaître dans le brief. Chacune a son
 * propre délai : trois mois pour la carte VTC, un mois pour les autres.
 */
export function echeanceUrgente(
  saisies: Saisies,
  now: DateTime = maintenant(),
): EcheanceLue | null {
  let pire: EcheanceLue | null = null;
  for (const e of lireEcheances(saisies, now)) {
    if (e.jours === null || e.jours > e.rappel) continue;
    if (!pire || e.jours < pire.jours!) pire = e;
  }
  return pire;
}

/** « dans 12 jours », « demain », « dépassée depuis 3 jours ». */
export function libelleEcheance(jours: number | null): string {
  if (jours === null) return 'non renseignée';
  if (jours < -1) return 'dépassée depuis ' + -jours + ' jours';
  if (jours === -1) return 'dépassée depuis hier';
  if (jours === 0) return 'aujourd’hui';
  if (jours === 1) return 'demain';
  if (jours < 60) return 'dans ' + jours + ' jours';
  return 'dans ' + Math.round(jours / 30) + ' mois';
}
