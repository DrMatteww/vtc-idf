/* ==========================================================================
   Les notifications.

   DEUX RÈGLES, et elles comptent plus que le code :

   1. L'autorisation n'est JAMAIS demandée au lancement. Elle part quand le
      chauffeur active les notifications depuis Infos, et pas avant. On a
      déjà payé cette leçon avec la géolocalisation : réclamer avant d'avoir
      rien donné, c'est la pire entrée en matière.

   2. On s'abonne à des SUJETS, jamais à des personnes. Aucun jeton
      d'appareil n'est conservé, aucune base d'utilisateurs n'existe, et
      personne n'est identifiable. Un chauffeur qui se désabonne n'a jamais
      existé pour nous.

   Tant que Firebase n'est pas dans le build natif, ce module se met en
   « indisponible » au lieu de planter : l'application continue de marcher
   exactement comme avant.
   ========================================================================== */

import { create } from 'zustand';

import { basculeSujets, sujetsPour } from '@/core/sujets';
import type { Dept } from '@/core/types';
import { ecrire, lire } from './stockage';

const CLE_ACTIF = 'vtc_notifs_actif';
const CLE_SUJETS = 'vtc_notifs_sujets';

export type EtatNotifs =
  | 'inconnu'      // on n'a encore rien demandé
  | 'indisponible' // Firebase n'est pas dans ce build
  | 'refuse'       // le chauffeur a dit non au système
  | 'actif'        // abonné
  | 'inactif';     // le chauffeur les a coupées

/* Chargement paresseux : si le module natif n'est pas là — build sans
   Firebase, Expo Go — on le dit au lieu de faire tomber l'écran. */
async function firebase() {
  try {
    const m = await import('@react-native-firebase/messaging');
    return { m, messaging: m.getMessaging() };
  } catch {
    return null;
  }
}

function sujetsLus(): string[] {
  try {
    const v = JSON.parse(lire(CLE_SUJETS) ?? '[]');
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

interface EtatStore {
  etat: EtatNotifs;
  /** Ce à quoi l'appareil est réellement abonné, d'après nous. */
  sujets: string[];
  enCours: boolean;

  /** Demande l'autorisation puis abonne. À n'appeler que sur action du chauffeur. */
  activer: (dept: Dept | null) => Promise<void>;
  /** Désabonne de tout. */
  desactiver: () => Promise<void>;
  /** Réaligne les abonnements quand le département change. Silencieux. */
  synchroniser: (dept: Dept | null) => Promise<void>;
}

export const useNotifs = create<EtatStore>((set, get) => ({
  etat: lire(CLE_ACTIF) === '1' ? 'actif' : 'inconnu',
  sujets: sujetsLus(),
  enCours: false,

  async activer(dept) {
    if (get().enCours) return;
    set({ enCours: true });

    const f = await firebase();
    if (!f) {
      set({ etat: 'indisponible', enCours: false });
      return;
    }

    try {
      const statut = await f.m.requestPermission(f.messaging);
      const accorde =
        statut === f.m.AuthorizationStatus.AUTHORIZED ||
        statut === f.m.AuthorizationStatus.PROVISIONAL;

      if (!accorde) {
        ecrire(CLE_ACTIF, '0');
        set({ etat: 'refuse', enCours: false });
        return;
      }

      await appliquer(f, get().sujets, sujetsPour(dept), set);
      ecrire(CLE_ACTIF, '1');
      set({ etat: 'actif', enCours: false });
    } catch {
      set({ etat: 'indisponible', enCours: false });
    }
  },

  async desactiver() {
    const f = await firebase();
    if (f) {
      try {
        await appliquer(f, get().sujets, [], set);
      } catch {
        /* Hors ligne au moment de couper : on enregistre quand même le choix
           du chauffeur. La resynchronisation se fera à la prochaine ouverture. */
      }
    }
    ecrire(CLE_ACTIF, '0');
    set({ etat: 'inactif' });
  },

  async synchroniser(dept) {
    if (get().etat !== 'actif') return;
    const f = await firebase();
    if (!f) return;
    try {
      await appliquer(f, get().sujets, sujetsPour(dept), set);
    } catch {
      /* Un échec de resynchronisation n'est pas une panne : on réessaiera à
         la prochaine ouverture, et entre-temps le chauffeur reçoit l'ancien
         département. Mieux vaut une notification de trop qu'un écran cassé. */
    }
  },
}));

type Set = (p: Partial<EtatStore>) => void;

async function appliquer(
  f: NonNullable<Awaited<ReturnType<typeof firebase>>>,
  actuels: string[],
  voulus: string[],
  set: Set,
) {
  const { abonner, desabonner } = basculeSujets(actuels, voulus);
  if (!abonner.length && !desabonner.length) return;

  /* On désabonne AVANT d'abonner : si l'opération est interrompue au milieu,
     mieux vaut ne plus rien recevoir que recevoir deux départements sans
     comprendre pourquoi. */
  for (const s of desabonner) await f.m.unsubscribeFromTopic(f.messaging, s);
  for (const s of abonner) await f.m.subscribeToTopic(f.messaging, s);

  ecrire(CLE_SUJETS, JSON.stringify(voulus));
  set({ sujets: voulus });
}
