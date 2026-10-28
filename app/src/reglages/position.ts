/* ==========================================================================
   La position.

   Elle AMÉLIORE — tri par distance, brief local, météo du bon département —
   mais ne bloque JAMAIS. Chaque écran doit fonctionner sans elle, et le dire.

   Elle sert uniquement à trier des lieux et à choisir un secteur, SUR
   L'APPAREIL. Elle n'est envoyée nulle part, et les trajets ne sont pas
   enregistrés.
   ========================================================================== */

import * as Location from 'expo-location';
import { Linking, Platform } from 'react-native';
import { create } from 'zustand';

import type { Position } from '@/core/types';
import { ecrire, lire } from './stockage';

export type EtatGeo = 'inconnu' | 'attente' | 'ok' | 'refuse' | 'indisponible';

/* Retenu dès qu'une position arrive. C'est ce qui permettra au brief de
   s'ouvrir directement sur « Autour de moi » : si le chauffeur a déjà
   autorisé la localisation, son secteur est ce qu'il veut voir en premier,
   pas toute l'Île-de-France. */
const CLE = 'vtc_geo';

export function geoDejaAccordee(): boolean {
  return lire(CLE) === 'ok';
}

/* Les codes techniques sont traduits une seule fois, ici, pour que chaque
   onglet dise exactement la même chose. */
export function messageGeo(etat: EtatGeo): string {
  switch (etat) {
    case 'refuse':
      return 'Tu as refusé la position. Autorise-la pour avoir le brief autour de toi.';
    case 'indisponible':
      return 'Position introuvable pour le moment — ça arrive en souterrain ou en parking.';
    default:
      return 'Position indisponible.';
  }
}

/**
 * On ne renvoie vers les réglages QUE si c'est bien une autorisation qui
 * manque : « position introuvable » dans un parking souterrain n'a rien à
 * voir avec les réglages, et y envoyer le chauffeur le ferait chercher pour
 * rien.
 *
 * En WebView, il n'existait aucun moyen d'ouvrir les réglages : l'app
 * affichait le chemin à suivre, en toutes lettres, par système. En natif,
 * `Linking.openSettings()` le fait vraiment. C'est un des petits gains du
 * portage : quatre mots justes remplacés par un bouton qui marche.
 */
export function peutOuvrirReglages(etat: EtatGeo): boolean {
  return etat === 'refuse';
}

export function ouvrirReglages(): void {
  Linking.openSettings().catch(() => {});
}

interface EtatPosition {
  pos: Position | null;
  etat: EtatGeo;
  /** `fraiche` force une mesure neuve : voir le commentaire ci-dessous. */
  demander: (fraiche?: boolean) => Promise<void>;
}

export const usePosition = create<EtatPosition>((set, get) => ({
  pos: null,
  etat: 'inconnu',

  async demander(fraiche = false) {
    if (get().etat === 'attente') return;
    set({ etat: 'attente' });

    try {
      /* Sur le web, expo-location passe par le navigateur : même logique,
         mêmes refus possibles. */
      let perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) {
        perm = await Location.requestForegroundPermissionsAsync();
      }
      if (!perm.granted) {
        ecrire(CLE, 'ko');
        set({ etat: 'refuse', pos: null });
        return;
      }

      /* Une position déjà connue du téléphone fait l'affaire pour trier une
         liste par distance : deux minutes suffisent. Mais pour le brief
         « autour de moi », on en exige une NEUVE — on peut fermer l'app à
         Orly et la rouvrir dans Paris, et le secteur n'est alors plus du
         tout le même. */
      let p = fraiche
        ? null
        : await Location.getLastKnownPositionAsync({ maxAge: 120_000 });

      if (!p) {
        p = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Low,
        });
      }

      if (!p) {
        set({ etat: 'indisponible' });
        return;
      }

      ecrire(CLE, 'ok');
      set({
        pos: { lat: p.coords.latitude, lon: p.coords.longitude },
        etat: 'ok',
      });
    } catch {
      set({ etat: 'indisponible' });
    }
  },
}));

/** Pour les messages d'aide spécifiques à la plateforme, si besoin plus tard. */
export const estIOS = Platform.OS === 'ios';
