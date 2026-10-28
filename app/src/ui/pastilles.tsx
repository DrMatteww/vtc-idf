import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { couleurs, espaces, polices, rayons } from './theme';

export interface Pastille<T extends string> {
  code: T;
  libelle: string;
}

interface Props<T extends string> {
  liste: readonly Pastille<T>[];
  actif: T;
  onChoisir: (code: T) => void;
}

/* Les pastilles sont du TEXTE, sans émoji : trois couleurs vives alignées en
   haut de l'écran tiraient l'œil avant le contenu, et « Trains » se lit aussi
   vite qu'un train dessiné. */
export function Pastilles<T extends string>({ liste, actif, onChoisir }: Props<T>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.rangee}>
      {liste.map((p) => {
        const on = p.code === actif;
        return (
          <Pressable
            key={p.code}
            onPress={() => onChoisir(p.code)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[s.pastille, on && s.active]}>
            <Text style={[s.texte, on && s.texteActif]}>{p.libelle}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  rangee: { gap: 6, paddingRight: espaces.pad },
  pastille: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: couleurs.trait,
    borderRadius: rayons.petit,
    paddingHorizontal: 12,
    height: 34,
    justifyContent: 'center',
  },
  active: { backgroundColor: couleurs.accent, borderColor: couleurs.accent },
  texte: { fontFamily: polices.moyen, fontSize: 13, color: couleurs.texteAtenue },
  texteActif: { fontFamily: polices.demi, color: couleurs.accentEncre },
});
