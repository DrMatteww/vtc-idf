/* ==========================================================================
   L'état des données, partagé par les quatre onglets.

   `lieux.json` (860 Ko) n'est chargé QUE lorsqu'on ouvre « Sur la route » :
   le brief s'affiche en quelques dizaines de kilo-octets, et le chauffeur qui
   ne consulte que son brief ne paie jamais les 860 Ko.
   ========================================================================== */

import { create } from 'zustand';

import type { Brief, Lieux, Zones } from '@/core/types';
import { chargerBrief, chargerLieux, chargerZones } from './source';

type Erreur = 'reseau' | 'delai' | 'illisible' | null;

interface EtatDonnees {
  brief: Brief | null;
  briefDepuisCache: boolean;
  briefErreur: Erreur;
  briefEnCours: boolean;

  lieux: Lieux | null;
  lieuxDepuisCache: boolean;
  lieuxEnCours: boolean;

  zones: Zones | null;

  rafraichirBrief: () => Promise<void>;
  assurerLieux: () => Promise<void>;
  assurerZones: () => Promise<void>;
}

export const useDonnees = create<EtatDonnees>((set, get) => ({
  brief: null,
  briefDepuisCache: false,
  briefErreur: null,
  briefEnCours: false,

  lieux: null,
  lieuxDepuisCache: false,
  lieuxEnCours: false,

  zones: null,

  async rafraichirBrief() {
    if (get().briefEnCours) return;
    set({ briefEnCours: true });
    const r = await chargerBrief();
    set({
      /* On ne REMPLACE jamais des données valides par rien : si le réseau
         tombe alors qu'on avait déjà un brief, on garde celui qu'on a. */
      brief: r.donnees ?? get().brief,
      briefDepuisCache: r.depuisCache,
      briefErreur: r.erreur,
      briefEnCours: false,
    });
  },

  async assurerLieux() {
    if (get().lieux || get().lieuxEnCours) return;
    set({ lieuxEnCours: true });
    const r = await chargerLieux();
    set({
      lieux: r.donnees ?? get().lieux,
      lieuxDepuisCache: r.depuisCache,
      lieuxEnCours: false,
    });
  },

  async assurerZones() {
    if (get().zones) return;
    const r = await chargerZones();
    if (r.donnees) set({ zones: r.donnees });
  },
}));
