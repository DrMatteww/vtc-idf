import { StyleSheet, Text, View } from 'react-native';

import { Ecran } from '@/ui/ecran';
import { couleurs, espaces, typo } from '@/ui/theme';

export default function SurLaRoute() {
  return (
    <Ecran titre="Sur la route" sousTitre="survivre à la nuit">
      <View style={s.corps}>
        <Text style={s.texte}>
          Toilettes, Manger, Services, Trafic, Astuces — avec tri par distance
          et favoris : lot 5.
        </Text>
      </View>
    </Ecran>
  );
}

const s = StyleSheet.create({
  corps: { paddingHorizontal: espaces.pad },
  texte: { ...typo.carteSous, color: couleurs.texteAtenue, lineHeight: 20 },
});
