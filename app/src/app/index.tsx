import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { libelleJour, maintenant, tranche } from '@/core/temps';
import { Ecran } from '@/ui/ecran';
import { couleurs, espaces, rayons, typo } from '@/ui/theme';

export default function Brief() {
  /* Le titre suit l'heure réelle. On le recalcule à chaque minute plutôt
     qu'une fois au montage : l'app reste ouverte des heures sur le siège
     passager, et « Ce soir » doit devenir « Cette nuit » sans relance. */
  const [h, setH] = useState(() => maintenant());
  useEffect(() => {
    const t = setInterval(() => setH(maintenant()), 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <Ecran fixe titre={tranche(h).libelle} sousTitre={libelleJour(h)}>
      <View style={s.corps}>
        <View style={s.chantier}>
          <Text style={s.etiquette}>LOT 0</Text>
          <Text style={s.titre}>Les fondations tiennent</Text>
          <Text style={s.texte}>
            Le titre au-dessus est calculé en heure de Paris et change de
            lui-même à 5h, 11h, 14h, 18h et minuit. Il n'est pas écrit en dur.
          </Text>
          <Text style={s.texte}>
            Viennent ensuite : le noyau et ses tests (lot 1), puis les données
            et le hors-ligne (lot 2), puis ce bloc devient le vrai brief.
          </Text>
        </View>
      </View>
    </Ecran>
  );
}

const s = StyleSheet.create({
  corps: { flex: 1, paddingHorizontal: espaces.pad },
  chantier: {
    backgroundColor: couleurs.surface,
    borderColor: couleurs.trait,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: rayons.carte,
    padding: espaces.pad,
    gap: 10,
  },
  etiquette: { ...typo.etiquette, color: couleurs.texteMuet },
  titre: { ...typo.carteTitre, color: couleurs.texte },
  texte: { ...typo.carteSous, color: couleurs.texteAtenue, lineHeight: 20 },
});
