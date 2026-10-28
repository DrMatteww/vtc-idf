import { Image, StyleSheet, Text, View } from 'react-native';

import { marque } from './marque';
import { couleurs, polices } from './theme';

/* La barre de marque, en haut des quatre écrans. Elle existait dans la
   version GoodBarber et le chauffeur la connaît : on la garde.

   Un filet en bas, et rien d'autre — pas de bouton, pas de retour. Les quatre
   onglets sont en bas, à portée de pouce ; mettre quoi que ce soit de
   cliquable tout en haut d'un écran qu'on tape d'une main au volant, c'est
   demander une acrobatie. */
export function BarreTitre() {
  return (
    <View style={s.barre}>
      {marque.logo ? (
        <Image source={{ uri: marque.logo }} style={s.logo} resizeMode="contain" />
      ) : (
        <Text style={[s.nom, { color: marque.couleur }]}>{marque.nom}</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  barre: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: couleurs.trait,
  },
  nom: { fontFamily: polices.gras, fontSize: 22, letterSpacing: 0.5 },
  logo: { height: 26, width: 140 },
});
