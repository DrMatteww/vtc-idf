import { Pressable, StyleSheet, Text } from 'react-native';

import { NOMS, ouvrirNav } from '@/reglages/navigation';
import { usePrefs } from '@/reglages/preferences';
import { couleurs, espaces, polices, rayons } from './theme';

/* Un seul bouton, toujours : celui de l'application que le chauffeur a
   choisie. Blanc, parce que le blanc veut dire « c'est ici qu'on appuie ». */
export function BoutonGps({ lat, lon }: { lat: number; lon: number }) {
  const nav = usePrefs((e) => e.nav);
  return (
    <Pressable
      onPress={() => ouvrirNav(lat, lon, nav)}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={'Ouvrir ' + NOMS[nav]}
      style={({ pressed }) => [s.btn, pressed && s.presse]}>
      <Text style={s.texte}>{NOMS[nav]}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  btn: {
    backgroundColor: couleurs.accent,
    borderRadius: rayons.petit,
    paddingHorizontal: 14,
    /* La cible fait 48 px de haut : on tape au pouce, d'une main, parfois en
       roulant au pas. */
    height: espaces.tap - 12,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presse: { opacity: 0.7 },
  texte: { fontFamily: polices.gras, fontSize: 14, color: couleurs.accentEncre },
});

/* La version des listes : un lien, pas un pavé blanc. Vingt lignes avec
   vingt boutons pleins, l'écran ne dit plus où appuyer. */
export function LienGps({ lat, lon }: { lat: number; lon: number }) {
  const nav = usePrefs((e) => e.nav);
  return (
    <Pressable
      onPress={() => ouvrirNav(lat, lon, nav)}
      hitSlop={14}
      accessibilityRole="button"
      accessibilityLabel={'Y aller avec ' + NOMS[nav]}
      style={({ pressed }) => [l.lien, pressed && l.presse]}>
      <Text style={l.texte}>Y aller</Text>
    </Pressable>
  );
}

const l = StyleSheet.create({
  lien: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: couleurs.trait,
    borderRadius: rayons.petit,
    paddingHorizontal: 10,
    height: 32,
    justifyContent: 'center',
  },
  presse: { opacity: 0.6 },
  texte: { fontFamily: polices.demi, fontSize: 12, color: couleurs.texte },
});
