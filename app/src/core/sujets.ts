/* ==========================================================================
   Les sujets de notification.

   On diffuse vers des SUJETS, pas vers des personnes. L'appareil s'abonne
   lui-même ; nous ne conservons aucun jeton d'appareil, aucune base
   d'utilisateurs, et personne n'est identifiable. Un chauffeur qui se
   désabonne n'a jamais existé pour nous.

   C'est à la fois le plus simple, le moins cher et le plus respectueux — les
   trois alignés pour une fois.
   ========================================================================== */

import type { Dept } from './types';

export const SUJET_TOUS = 'tous';

export const DEPTS_IDF: Dept[] = ['75', '77', '78', '91', '92', '93', '94', '95'];

export function sujetDept(dept: Dept): string {
  return 'dept-' + dept;
}

/**
 * ⚠️ Cette liste doit rester identique à celle de `scripts/notifier.py`.
 * Un sujet mal orthographié ne provoque aucune erreur côté Firebase : il crée
 * un sujet vide, et la notification part dans le vide sans que personne ne le
 * sache.
 */
export const SUJETS_CONNUS: string[] = [SUJET_TOUS, ...DEPTS_IDF.map(sujetDept)];

/**
 * Ce à quoi l'appareil DEVRAIT être abonné.
 *
 * « tous » toujours — c'est le canal des annonces qui concernent tout le
 * monde. Le département seulement si on sait où est le chauffeur : hors
 * Île-de-France, ou position refusée, il ne reçoit que le général.
 */
export function sujetsPour(dept: Dept | null | undefined): string[] {
  const l = [SUJET_TOUS];
  if (dept && DEPTS_IDF.includes(dept)) l.push(sujetDept(dept));
  return l;
}

export interface Bascule {
  abonner: string[];
  desabonner: string[];
}

/**
 * Ce qu'il faut changer pour passer de l'état actuel à l'état voulu.
 *
 * C'est le point où l'on se trompe : un chauffeur qui déménage du 93 au 94, ou
 * qui roule simplement d'un département à l'autre, resterait abonné au 93
 * pour toujours si l'on se contentait d'ajouter. Il recevrait alors les
 * annonces de deux départements sans comprendre pourquoi — et, n'ayant aucun
 * compte, sans aucun moyen de s'en défaire.
 */
export function basculeSujets(actuels: string[], voulus: string[]): Bascule {
  const a = new Set(actuels);
  const v = new Set(voulus);
  return {
    abonner: voulus.filter((s) => !a.has(s)),
    desabonner: actuels.filter((s) => !v.has(s)),
  };
}
