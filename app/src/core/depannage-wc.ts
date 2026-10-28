/* ==========================================================================
   Quand il n'y a pas de toilettes publiques à côté.

   Le générateur ne retient plus que les toilettes EXPLICITEMENT ouvertes à
   tous : les autres envoyaient le chauffeur au cimetière ou à la
   bibliothèque. La contrepartie, c'est qu'en banlieue il arrive qu'il n'y ait
   rien dans les parages — et un écran qui dit « rien » à quelqu'un qui a
   besoin de toilettes maintenant ne sert à rien.

   On propose donc le meilleur repli que la donnée permette, et on dit
   lequel des deux on est en train de proposer :

   1. UNE STATION DONT LES TOILETTES SONT CONFIRMÉES. 186 stations portent
      l'attribut `wc` dans la base. Ce n'est pas une supposition, c'est écrit.
      Et une station à pompes automatiques est ouverte la nuit.

   2. À DÉFAUT, UNE CHAÎNE OUVERTE. OpenStreetMap ne dit presque jamais si un
      fast-food a des toilettes — 26 fiches sur 1 133, toutes des aires
      d'autoroute. Mais tout chauffeur sait qu'un McDonald's en a. On le
      propose donc en le présentant pour ce que c'est : probable, pas
      confirmé. Mieux vaut une quasi-certitude utile qu'un silence exact.
   ========================================================================== */

import { DateTime } from 'luxon';

import { distanceKm } from './geo';
import { etatHoraire, ouvert24 } from './horaires';
import { maintenant } from './temps';
import type { Manger, Position, Service, Toilette } from './types';

/** Au-delà, on considère qu'il n'y a « rien à côté » et on propose un repli. */
export const TROP_LOIN_KM = 1.2;

export interface Depannage {
  /** `sure` : toilettes écrites dans la donnée. `probable` : une chaîne. */
  certitude: 'sure' | 'probable';
  nom: string;
  adresse: string;
  lat: number;
  lon: number;
  km: number;
  /** Ce qui rassure : « pompes 24h/24 », « jusqu'à 2h00 »… */
  detail: string;
}

function plusProche<T extends { lat: number; lon: number }>(
  liste: T[],
  pos: Position,
): { item: T; km: number } | null {
  let best: { item: T; km: number } | null = null;
  for (const it of liste) {
    if (it.lat == null || it.lon == null) continue;
    const km = distanceKm(pos.lat, pos.lon, it.lat, it.lon);
    if (!best || km < best.km) best = { item: it, km };
  }
  return best;
}

/**
 * Renvoie un dépannage quand les toilettes publiques sont trop loin — ou
 * `null` quand il y en a une à portée, auquel cas il n'y a rien à proposer.
 */
export function depannageToilettes(o: {
  toilettes: (Toilette & { km?: number })[];
  services: Service[];
  manger: Manger[];
  pos: Position | null;
  now?: DateTime;
}): Depannage | null {
  const now = o.now ?? maintenant();
  if (!o.pos) return null;

  /* Y a-t-il déjà quelque chose à portée ? Si oui, on se tait : une
     suggestion par-dessus une bonne réponse, c'est du bruit. */
  const laPlusProche = plusProche(o.toilettes, o.pos);
  if (laPlusProche && laPlusProche.km <= TROP_LOIN_KM) return null;

  /* 1. Une station dont les toilettes sont ÉCRITES dans la donnée, et qui
        est ouverte maintenant — un automate ne donne pas accès aux WC, donc
        c'est la boutique qui compte ici, pas les pompes. */
  const stations = o.services.filter((s) => s.wc && (s.h24 || etatHoraire(s, now)?.ouvert));
  const st = plusProche(stations, o.pos);
  if (st) {
    const e = etatHoraire(st.item, now);
    return {
      certitude: 'sure',
      nom: st.item.name,
      adresse: st.item.address,
      lat: st.item.lat,
      lon: st.item.lon,
      km: st.km,
      detail: st.item.h24
        ? 'ouverte 24h/24'
        : e?.fin
          ? 'boutique ouverte jusqu’à ' + e.fin.toFormat("HH'h'mm")
          : ouvert24(st.item)
            ? 'pompes 24h/24'
            : 'ouverte',
    };
  }

  /* 2. À défaut, une chaîne ouverte : ce n'est pas écrit dans la donnée, mais
        un chauffeur sait ce qu'il y trouve. */
  const chaines = o.manger.filter((m) => m.t === 'chaine' && etatHoraire(m, now)?.ouvert);
  const ch = plusProche(chaines, o.pos);
  if (ch) {
    const e = etatHoraire(ch.item, now);
    return {
      certitude: 'probable',
      nom: ch.item.name,
      adresse: ch.item.address,
      lat: ch.item.lat,
      lon: ch.item.lon,
      km: ch.km,
      detail: e?.h24
        ? 'ouvert 24h/24'
        : e?.fin
          ? 'ouvert jusqu’à ' + e.fin.toFormat("HH'h'mm")
          : 'ouvert',
    };
  }

  return null;
}
