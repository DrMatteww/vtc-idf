/* ==========================================================================
   Les fermetures de route : les pièges de la nuit.

   Seuls les GRANDS AXES sont retenus par le générateur — une rue fermée
   n'intéresse personne, le GPS la contourne tout seul. Ce qui compte, ce sont
   les fermetures d'autoroute et de tunnel, typiquement de 21 h à 5 h du lundi
   au vendredi, que les GPS annoncent mal à l'avance.
   ========================================================================== */

import { DateTime } from 'luxon';

import { aParis, libellePeriode, maintenant, type Nuit } from './temps';
import type { Closure } from './types';

/* ---- Deux natures de fermeture ----------------------------------------
   Celle qui ne vaut que cette nuit — « A86 extérieur, 21h → 6h » — et celle
   qui dure : bretelle coupée 24h/24, chantier de plusieurs semaines.

   Les mélanger donnait deux faux : un bandeau « 21h00 → 06h00 » sur une
   bretelle fermée en permanence, et un écran vide le week-end, puisque la
   DiRIF ne ferme presque rien la nuit du vendredi au dimanche — ces soirs-là,
   tout ce qu'elle publie est justement du 24h/24.

   ⚠️ `continu` est absent du document de passation mais bien présent dans la
   donnée. C'est lui qui fait le tri ici.                                   */
export function estPermanente(c: Closure): boolean {
  return !!c.continu || c.kind === 'chantier';
}

/** Vrai si la fermeture concerne cette nuit-là : soit elle s'y inscrit, soit
    c'est un chantier qui la recouvre. */
export function toucheLaNuit(c: Closure, nuit: Nuit): boolean {
  const a = aParis(c.from);
  const b = aParis(c.to);
  return a < nuit.fin && b > nuit.debut;
}

export function fermeturesDeLaNuit(liste: Closure[], nuit: Nuit): Closure[] {
  return (liste ?? [])
    .filter((c) => !estPermanente(c) && toucheLaNuit(c, nuit))
    .sort((a, b) => aParis(a.from).toMillis() - aParis(b.from).toMillis());
}

/**
 * Les fermetures permanentes ne sont affichées nulle part — décision du
 * terrain : une bretelle coupée 24h/24, un chantier déjà en place, Waze et
 * Google Maps les connaissent et dévient tout seuls. Ce qu'un GPS ne sait pas
 * dire, c'est qu'à 21 h CE SOIR l'A86 ferme : c'est cela, et cela seulement,
 * que l'app annonce.
 *
 * La fonction reste, et renvoie une liste vide, parce que le jour où l'on
 * changerait d'avis le filtre tient en trois lignes. `estPermanente`, lui,
 * sert toujours : c'est lui qui écarte ces fermetures de la nuit en cours.
 *
 * Conséquence assumée : le week-end, la DiRIF ne publiant presque que du
 * 24h/24, le brief n'a plus de carte rouge et Trafic affiche « rien de fermé
 * cette nuit ». C'est la vérité du terrain, pas un écran cassé.
 */
export function fermeturesPermanentes(): Closure[] {
  return [];
}

/**
 * L'étiquette rouge. Une fermeture permanente n'a pas de date de fin —
 * Sytadin n'en publie aucune — et en inventer une serait pire que de le dire :
 * on écrit « en continu ».
 */
export function badgeFermeture(c: Closure): string {
  if (c.continu) return 'en continu';
  return libellePeriode(c.from, c.to);
}

/** Ce qui est en cours ou va l'être dans l'horizon donné (3 h par défaut). */
export function fermeturesActives(
  liste: Closure[],
  horizonMin = 180,
  now: DateTime = maintenant(),
): Closure[] {
  return (liste ?? []).filter((c) => {
    const de = aParis(c.from);
    const a = aParis(c.to);
    if (a < now) return false;
    return de <= now.plus({ minutes: horizonMin });
  });
}
