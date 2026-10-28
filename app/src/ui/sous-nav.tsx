import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { couleurs, espaces, polices } from './theme';

interface Item<T extends string> {
  code: T;
  libelle: string;
}

/* La sous-barre des cinq sections. Elle se distingue des pastilles de filtre
   en dessous — filet blanc et texte plein pour l'active, texte grisé pour les
   autres — parce que deux rangées de pastilles identiques ne diraient pas
   laquelle navigue et laquelle filtre. */
export function SousNav<T extends string>({
  liste, actif, onChoisir,
}: {
  liste: readonly Item<T>[];
  actif: T;
  onChoisir: (c: T) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.rangee}>
      {liste.map((i) => {
        const on = i.code === actif;
        return (
          <Pressable
            key={i.code}
            onPress={() => onChoisir(i.code)}
            hitSlop={8}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={s.item}>
            <View style={[s.filet, on && s.filetActif]} />
            <Text style={[s.texte, on && s.texteActif]}>{i.libelle}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  rangee: { paddingRight: espaces.pad, gap: 18 },
  item: { paddingBottom: 8 },
  filet: { height: 2, backgroundColor: 'transparent', marginBottom: 8 },
  filetActif: { backgroundColor: couleurs.accent },
  texte: { fontFamily: polices.moyen, fontSize: 14, color: couleurs.texteMuet },
  texteActif: { fontFamily: polices.demi, color: couleurs.texte },
});
