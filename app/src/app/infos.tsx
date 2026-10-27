import Constants from 'expo-constants';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { diagnosticFuseau, hhmm, maintenant } from '@/core/temps';
import { Ecran } from '@/ui/ecran';
import { couleurs, espaces, polices, rayons, tabulaire, typo } from '@/ui/theme';

function Ligne({ cle, valeur, ok }: { cle: string; valeur: string; ok?: boolean }) {
  return (
    <View style={s.ligne}>
      <Text style={s.cle}>{cle}</Text>
      <Text style={[s.valeur, ok === false && s.valeurKo, ok === true && s.valeurOk]}>
        {valeur}
      </Text>
    </View>
  );
}

export default function Infos() {
  /* Le diagnostic de fuseau est ici pendant le développement, et pas dans un
     test : Hermes n'est pas Node, et c'est sur l'appareil que la question
     « Intl connaît-il Europe/Paris ? » se tranche pour de bon. Ce bloc
     disparaît au lot 6, quand l'écran Infos reçoit son vrai contenu. */
  const d = diagnosticFuseau();

  return (
    <Ecran titre="Infos" sousTitre="la confiance">
      <View style={s.corps}>
        <View style={s.bloc}>
          <Text style={s.etiquette}>VÉRIFICATION DU FUSEAU</Text>
          <Ligne cle="Intl présent" valeur={d.intlPresent ? 'oui' : 'non'} ok={d.intlPresent} />
          <Ligne cle="Fuseau demandé" valeur="Europe/Paris" />
          <Ligne cle="Fuseau résolu" valeur={d.zone} ok={d.ok} />
          <Ligne cle="Fuseau de l'appareil" valeur={d.zoneAppareil} />
          <Ligne cle="Heure de Paris" valeur={hhmm(maintenant())} />
          <Ligne cle="Décalage" valeur={d.decalageMin + ' min (UTC+' + d.decalageMin / 60 + ')'} />
          <Ligne cle="Verdict" valeur={d.detail} ok={d.ok} />
        </View>

        <View style={s.bloc}>
          <Text style={s.etiquette}>ENVIRONNEMENT</Text>
          <Ligne cle="Plateforme" valeur={Platform.OS + ' ' + String(Platform.Version)} />
          <Ligne cle="Moteur JS" valeur={
            // @ts-expect-error HermesInternal n'est pas typé
            global.HermesInternal ? 'Hermes' : 'autre'
          } />
          <Ligne cle="Version de l'app" valeur={Constants.expoConfig?.version ?? '—'} />
        </View>

        <Text style={s.note}>
          Pourquoi c'est gratuit, pas de compte ni de fichage, la boîte à
          suggestions, les sources et les échéances : lot 6.
        </Text>
      </View>
    </Ecran>
  );
}

const s = StyleSheet.create({
  corps: { paddingHorizontal: espaces.pad, gap: 12 },
  bloc: {
    backgroundColor: couleurs.surface,
    borderColor: couleurs.trait,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: rayons.carte,
    padding: espaces.pad,
    gap: 6,
  },
  etiquette: { ...typo.etiquette, color: couleurs.texteMuet, marginBottom: 4 },
  ligne: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  cle: { ...typo.ligneSous, color: couleurs.texteAtenue, flexShrink: 0 },
  valeur: {
    ...typo.ligneSous,
    ...tabulaire,
    fontFamily: polices.demi,
    color: couleurs.texte,
    flexShrink: 1,
    textAlign: 'right',
  },
  valeurOk: { color: couleurs.ok },
  valeurKo: { color: couleurs.alerte },
  note: { ...typo.ligneSous, color: couleurs.texteMuet, lineHeight: 18 },
});
