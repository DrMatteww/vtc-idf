/* ==========================================================================
   Waze ou Google Maps ?

   Un chauffeur a son GPS et il n'en change pas. Lui proposer les deux à
   chaque ligne, c'est un bouton sur deux qui ne servira jamais, et deux fois
   moins de place pour ce qu'il doit lire. Le choix se fait une fois dans
   Infos et tient dans le téléphone — il ne part nulle part.

   On passe des COORDONNÉES, jamais une adresse : ça évite les erreurs de
   géocodage, fréquentes sur les sanisettes.
   ========================================================================== */

import { Linking } from 'react-native';

export type Nav = 'waze' | 'gmaps';

export const NOMS: Record<Nav, string> = { waze: 'Waze', gmaps: 'Maps' };

/** Le plus répandu chez les chauffeurs. Réglable dans Infos au lot 6. */
export const NAV_DEFAUT: Nav = 'waze';

export function urlWaze(lat: number, lon: number): string {
  return 'https://waze.com/ul?ll=' + lat + '%2C' + lon + '&navigate=yes';
}

export function urlGmaps(lat: number, lon: number): string {
  return (
    'https://www.google.com/maps/dir/?api=1&destination=' +
    lat + ',' + lon + '&travelmode=driving'
  );
}

export function urlNav(lat: number, lon: number, nav: Nav = NAV_DEFAUT): string {
  return nav === 'gmaps' ? urlGmaps(lat, lon) : urlWaze(lat, lon);
}

export function ouvrirNav(lat: number, lon: number, nav: Nav = NAV_DEFAUT): void {
  Linking.openURL(urlNav(lat, lon, nav)).catch(() => {
    /* GPS absent du téléphone : on tente l'autre plutôt que de ne rien faire. */
    Linking.openURL(urlNav(lat, lon, nav === 'waze' ? 'gmaps' : 'waze')).catch(() => {});
  });
}
