/* ==========================================================================
   Les préférences du chauffeur : favoris, véhicule, GPS.

   Tout tient SUR LE TÉLÉPHONE. Rien n'est envoyé, rien n'est partagé, et
   l'app n'a pas de compte. Voir reglages/stockage.ts.
   ========================================================================== */

import { create } from 'zustand';

import type { Vehicule } from '@/core/lieux';
import { ecrire, lire, lireParmi } from './stockage';
import type { Nav } from './navigation';

const CLE_FAV = 'vtc_favoris';
const CLE_VEHICULE = 'vtc_vehicule';
const CLE_NAV = 'vtc_nav';

function favorisLus(): string[] {
  try {
    const v = JSON.parse(lire(CLE_FAV) ?? '[]');
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

interface EtatPrefs {
  /**
   * On ne garde que des IDENTIFIANTS, pas des fiches : le jour où un fast-food
   * change d'horaires dans OpenStreetMap, le favori suit. Et si une fiche
   * disparaît de la base, son identifiant reste dans la liste sans rien
   * casser — il ne correspond simplement plus à rien.
   */
  favoris: string[];
  vehicule: Vehicule;
  nav: Nav;
  basculeFavori: (id: string) => void;
  setVehicule: (v: Vehicule) => void;
  setNav: (n: Nav) => void;
}

export const usePrefs = create<EtatPrefs>((set, get) => ({
  favoris: favorisLus(),
  vehicule: lireParmi<Vehicule>(CLE_VEHICULE, ['carburant', 'electrique'], 'carburant'),
  nav: lireParmi<Nav>(CLE_NAV, ['waze', 'gmaps'], 'waze'),

  basculeFavori(id) {
    const s = String(id);
    const avant = get().favoris;
    const apres = avant.includes(s) ? avant.filter((x) => x !== s) : [...avant, s];
    ecrire(CLE_FAV, JSON.stringify(apres));
    set({ favoris: apres });
  },

  setVehicule(v) {
    ecrire(CLE_VEHICULE, v);
    set({ vehicule: v });
  },

  setNav(n) {
    ecrire(CLE_NAV, n);
    set({ nav: n });
  },
}));
