/* ==========================================================================
   La fraîcheur des données.

   Le chauffeur doit toujours savoir si ce qu'il lit date de dix minutes ou de
   six heures. C'est une exigence du dossier, pas un ornement : un brief périmé
   qui ne dit pas qu'il l'est fait rouler pour rien.
   ========================================================================== */

import { DateTime } from 'luxon';

import { aParis, hhmm, maintenant } from './temps';

/** Au-delà, le point de fraîcheur passe au gris. */
export const PERIME_MIN = 180;

export interface Fraicheur {
  perime: boolean;
  texte: string;
  ageMin: number | null;
}

export function fraicheur(
  genereA: string | null | undefined,
  depuisLeCache = false,
  now: DateTime = maintenant(),
): Fraicheur {
  if (!genereA) return { perime: true, texte: 'données indisponibles', ageMin: null };

  const d = aParis(genereA);
  const ageMin = Math.round(now.diff(d, 'minutes').minutes);

  if (depuisLeCache) return { perime: true, texte: 'hors ligne · ' + hhmm(d), ageMin };
  if (ageMin > PERIME_MIN) return { perime: true, texte: 'mis à jour à ' + hhmm(d), ageMin };
  return { perime: false, texte: 'à jour · ' + hhmm(d), ageMin };
}
