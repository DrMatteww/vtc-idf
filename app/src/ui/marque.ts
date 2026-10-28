/* ==========================================================================
   La marque.

   UN SEUL ENDROIT, volontairement. Le back office viendra l'alimenter : nom,
   couleur, et un logo à la place du texte. Tant qu'il n'existe pas, les
   valeurs sont écrites ici — mais aucun écran ne doit jamais coder le nom en
   dur ailleurs, sinon le jour où il devient modifiable il faudra le chasser
   dans dix fichiers.
   ========================================================================== */

import { couleurs } from './theme';

export interface Marque {
  /** Affiché en haut de chaque écran. */
  nom: string;
  couleur: string;
  /** URL d'un logo qui remplacera le texte. Null tant qu'il n'y en a pas. */
  logo: string | null;
  /**
   * Où arrivent les suggestions des chauffeurs. Null tant que le back office
   * n'existe pas : la carte explique alors que le canal n'est pas encore
   * ouvert, plutôt que d'afficher un bouton qui ne mène nulle part.
   *
   * La version GoodBarber ouvrait la messagerie du chauffeur avec un message
   * préparé ; elle a été retirée pour ne pas exposer d'adresse. Le back
   * office fera mieux : les retours arrivent au même endroit.
   */
  suggestions: string | null;
}

export const marque: Marque = {
  nom: 'QLN',
  couleur: couleurs.texte,
  logo: null,
  suggestions: null,
};
