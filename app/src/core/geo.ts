/* ==========================================================================
   Distances, proximité, département.

   Tout se calcule DANS LE TÉLÉPHONE. La position sert à trier des lieux et
   ne part nulle part : c'est une promesse faite au chauffeur dans
   l'application et dans la politique de confidentialité, pas une commodité
   d'implémentation.
   ========================================================================== */

import type { Commune, Dept, Position } from './types';

/** Rayon par défaut du « autour de moi ». */
export const RAYON_KM = 10;

/** En deçà, un lieu connu impose son département. Voir `departementA`. */
export const DEPT_LIEU_KM = 3;

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const p = Math.PI / 180;
  const dLat = (lat2 - lat1) * p;
  const dLon = (lon2 - lon1) * p;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(km: number): string {
  if (km < 1) return Math.round(km * 1000) + ' m';
  return (km < 10 ? km.toFixed(1) : String(Math.round(km))) + ' km';
}

interface AvecCoord {
  lat?: number | null;
  lon?: number | null;
}

/** Ajoute la distance à chaque élément et trie du plus proche au plus loin. */
export function parDistance<T extends AvecCoord>(
  items: T[],
  pos: Position | null,
): (T & { km?: number })[] {
  if (!pos) return items ?? [];
  return (items ?? [])
    .map((it) => {
      if (it.lat == null || it.lon == null) return it;
      return { ...it, km: distanceKm(pos.lat, pos.lon, it.lat, it.lon) };
    })
    .sort((a, b) => {
      const ka = (a as { km?: number }).km;
      const kb = (b as { km?: number }).km;
      if (ka == null) return 1;
      if (kb == null) return -1;
      return ka - kb;
    });
}

export interface Proches<T> {
  liste: T[];
  /** Combien ont été écartés faute de coordonnées. L'écran le dit. */
  ecartes: number;
}

/**
 * Ne garde que ce qui est à portée. Un élément sans coordonnées est écarté
 * plutôt que supposé proche : mieux vaut en montrer moins que faire rouler
 * quelqu'un pour rien.
 */
export function proches<T extends AvecCoord>(
  items: T[],
  pos: Position | null,
  km: number = RAYON_KM,
): Proches<T> {
  if (!pos) return { liste: items ?? [], ecartes: 0 };
  const liste: T[] = [];
  let ecartes = 0;
  for (const it of items ?? []) {
    if (it.lat == null || it.lon == null) {
      ecartes++;
      continue;
    }
    if (distanceKm(pos.lat, pos.lon, it.lat, it.lon) <= km) liste.push(it);
  }
  return { liste, ecartes };
}

/**
 * Dans quel département suis-je ?
 *
 * On compare la position au centre des communes franciliennes, chargées
 * depuis zones.json. Hors ligne, instantané, et rien ne sort du téléphone —
 * contrairement à ce que ferait un géocodage inverse.
 *
 * Une exception utile : si un lieu connu de l'application est à moins de
 * trois kilomètres, c'est SON département qui gagne. Les terminaux d'Orly
 * sont administrativement dans l'Essonne, mais un chauffeur posté là veut la
 * pastille sous laquelle sont rangés les vols d'Orly.
 */
export function departementA(
  pos: Position | null,
  communes: Commune[],
  lieux: { lat?: number | null; lon?: number | null; dept?: Dept }[] = [],
): Dept | null {
  if (!pos) return null;

  let proche: Dept | null = null;
  let nd = DEPT_LIEU_KM;
  for (const it of lieux ?? []) {
    if (it.lat == null || it.lon == null || !it.dept) continue;
    const d = distanceKm(pos.lat, pos.lon, it.lat, it.lon);
    if (d < nd) {
      nd = d;
      proche = it.dept;
    }
  }
  if (proche) return proche;

  let best: Dept | null = null;
  let bd = Infinity;
  for (const z of communes ?? []) {
    const dlat = z[0] - pos.lat;
    /* 0.66 corrige grossièrement la convergence des méridiens à la latitude
       de Paris. On compare des carrés : pas de racine, pas de trigonométrie,
       1 266 communes à chaque ouverture d'écran. */
    const dlon = (z[1] - pos.lon) * 0.66;
    const d = dlat * dlat + dlon * dlon;
    if (d < bd) {
      bd = d;
      best = z[2];
    }
  }
  return best;
}
