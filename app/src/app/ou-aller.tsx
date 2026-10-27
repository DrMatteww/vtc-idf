import { StyleSheet, Text, View } from 'react-native';

import { Ecran } from '@/ui/ecran';
import { couleurs, espaces, typo } from '@/ui/theme';

export default function OuAller() {
  return (
    <Ecran titre="Où aller" sousTitre="la demande à venir">
      <View style={s.corps}>
        <Text style={s.texte}>
          La timeline, les filtres par type et par département, le département
          mémorisé : lot 4.
        </Text>
      </View>
    </Ecran>
  );
}

const s = StyleSheet.create({
  corps: { paddingHorizontal: espaces.pad },
  texte: { ...typo.carteSous, color: couleurs.texteAtenue, lineHeight: 20 },
});
