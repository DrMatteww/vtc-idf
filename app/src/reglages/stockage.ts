/* ==========================================================================
   Les réglages du chauffeur, sur le téléphone et nulle part ailleurs.

   Département choisi, préférence GPS, favoris, type de véhicule, échéances :
   tout vit ici. Rien ne part vers un serveur. Ce n'est pas une commodité
   d'implémentation, c'est une promesse faite dans l'application et dans la
   politique de confidentialité — les synchroniser romprait l'engagement et
   imposerait des obligations légales qui n'existent pas aujourd'hui.

   Lecture SYNCHRONE : « est-ce un favori ? » se calcule pendant le rendu
   d'une ligne de liste. Un stockage asynchrone imposerait un état
   intermédiaire par ligne, pour une valeur déjà sur le disque.
   ========================================================================== */

import Storage from 'expo-sqlite/kv-store';
import { Platform } from 'react-native';

export function lire(cle: string): string | null {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(cle) ?? null;
    return Storage.getItemSync(cle);
  } catch {
    return null;
  }
}

export function ecrire(cle: string, valeur: string): void {
  try {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(cle, valeur);
      return;
    }
    Storage.setItemSync(cle, valeur);
  } catch {
    /* Un réglage qu'on n'arrive pas à écrire n'empêche pas de s'en servir
       pendant cette session : on ne casse jamais l'écran pour ça. */
  }
}

/** Lit une valeur contrainte à une liste, avec repli sur la valeur par défaut. */
export function lireParmi<T extends string>(cle: string, valides: readonly T[], defaut: T): T {
  const v = lire(cle);
  return v && (valides as readonly string[]).includes(v) ? (v as T) : defaut;
}
