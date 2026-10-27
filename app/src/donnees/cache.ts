/* ==========================================================================
   Le cache sur disque.

   Le mode hors-ligne est UNE EXIGENCE, pas une optimisation : un chauffeur en
   parking souterrain est un cas d'usage quotidien, pas un cas limite. Si le
   réseau tombe, on réaffiche la dernière version connue plutôt qu'un écran
   vide.

   `lieux.json` pèse 860 Ko : il va sur le disque, jamais dans un magasin
   clé-valeur. C'est précisément ce que le natif améliore par rapport à la
   WebView, dont le stockage pouvait être vidé sans prévenir.
   ========================================================================== */

import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

function nomFichier(nom: string): string {
  return 'vtc-' + nom + '.json';
}

export function lireCache(nom: string): string | null {
  try {
    if (Platform.OS === 'web') {
      return globalThis.localStorage?.getItem(nomFichier(nom)) ?? null;
    }
    const f = new File(Paths.cache, nomFichier(nom));
    if (!f.exists) return null;
    return f.textSync();
  } catch {
    /* Un cache illisible n'est pas une panne : on repart du réseau. */
    return null;
  }
}

export function ecrireCache(nom: string, contenu: string): void {
  try {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(nomFichier(nom), contenu);
      return;
    }
    const f = new File(Paths.cache, nomFichier(nom));
    if (!f.exists) f.create({ intermediates: true, overwrite: true });
    f.writeSync(contenu);
  } catch {
    /* Écrire le cache est un confort : si ça échoue, l'app marche quand même,
       elle perd seulement le hors-ligne jusqu'au prochain chargement. */
  }
}
