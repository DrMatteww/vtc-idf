/* ==========================================================================
   La météo du brief. Transposé d'app.js.

   Il pleut, tout le monde commande. Une icône et une température en haut à
   droite : ça se lit sans lire. Cinq états seulement — au-delà, une icône de
   vingt pixels ne veut plus rien dire.
   ========================================================================== */

import { DateTime } from 'luxon';

import { distanceKm } from './geo';
import { maintenant } from './temps';
import type { Meteo, Position } from './types';

const ICONES: Record<string, string> = {
  soleil: '☀️',
  soleil_nuageux: '⛅',
  nuageux: '☁️',
  pluie: '🌧️',
  neige: '🌨️',
};

/* La nuit, le soleil devient une lune : un grand soleil à deux heures du
   matin, ça décrédibilise tout l'écran. */
const ICONES_NUIT: Record<string, string> = {
  soleil: '🌙',
  soleil_nuageux: '🌙',
};

export interface MeteoMaintenant {
  ciel: string;
  deg: number;
  nuit: boolean;
  dept: string;
  icone: string;
}

/** Clé horaire du fichier : « 2026-10-28T19:00 », sans fuseau. */
function cleHeure(d: DateTime): string {
  return d.toFormat("yyyy-LL-dd'T'HH:00");
}

/**
 * Un point météo par département : avec une position on prend le plus proche,
 * sinon Paris — toujours le premier de la liste. Cette différence compte : il
 * peut pleuvoir à Melun pendant qu'il fait beau à Cergy.
 *
 * Pas de repli sur l'heure la plus proche : si le fichier ne contient pas
 * l'heure qu'il est, c'est qu'il date de plus d'un jour et demi. Afficher la
 * météo d'hier serait pire que de n'afficher aucune icône.
 */
export function meteoMaintenant(
  meteo: Meteo | null | undefined,
  pos: Position | null = null,
  now: DateTime = maintenant(),
): MeteoMaintenant | null {
  if (!meteo?.heures?.length || !meteo.points?.length) return null;

  const i = meteo.heures.indexOf(cleHeure(now));
  if (i < 0) return null;

  let p = meteo.points[0];
  if (pos) {
    let mieux = Infinity;
    for (const q of meteo.points) {
      const d = distanceKm(pos.lat, pos.lon, q.lat, q.lon);
      if (d < mieux) {
        mieux = d;
        p = q;
      }
    }
  }

  if (!p.ciel || i >= p.ciel.length) return null;

  const ciel = p.ciel[i];
  const nuit = !!p.nuit[i];
  const icone = (nuit && ICONES_NUIT[ciel]) || ICONES[ciel];
  if (!icone) return null;

  return { ciel, deg: p.deg[i], nuit, dept: p.dept, icone };
}
