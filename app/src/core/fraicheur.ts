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

  /* « Situation à 15h33 » plutôt que « à jour · 15h33 » : c'est l'heure à
     laquelle les données ont été calculées, et le dire ainsi donne la bonne
     impression de fraîcheur sans rien promettre de faux. Le point coloré
     porte le reste du message — vert sous trois heures, gris au-delà — et
     l'heure elle-même suffit à voir si ça date de dix minutes ou de six
     heures. */
  if (depuisLeCache) return { perime: true, texte: 'hors ligne · situation à ' + hhmm(d), ageMin };
  return { perime: ageMin > PERIME_MIN, texte: 'situation à ' + hhmm(d), ageMin };
}
