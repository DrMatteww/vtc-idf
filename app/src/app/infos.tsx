import DateTimePicker from '@react-native-community/datetimepicker';
import Constants from 'expo-constants';
import { DateTime } from 'luxon';
import { ReactNode, useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { SEUIL_1, SEUIL_2, SEUIL_3 } from '@/core/demande';
import { type EcheanceLue, libelleEcheance, lireEcheances } from '@/core/echeances';
import type { Bloc, BlocTexte, Module } from '@/core/infos';
import type { Vehicule } from '@/core/lieux';
import { departementA } from '@/core/geo';
import { ZONE, maintenant } from '@/core/temps';
import type { Nav } from '@/reglages/navigation';
import { useDonnees } from '@/donnees/store';
import { ouvrirReglages } from '@/reglages/position';
import { useNotifs } from '@/reglages/notifications';
import { usePosition } from '@/reglages/position';
import { usePrefs } from '@/reglages/preferences';
import { Ecran } from '@/ui/ecran';
import { Etiquette, Flammes } from '@/ui/etiquettes';
import { marque } from '@/ui/marque';
import { Pastilles } from '@/ui/pastilles';
import { couleurs, espaces, polices, rayons, tabulaire, typo } from '@/ui/theme';

export default function Infos() {
  /* Le contenu vient d'un fichier, pas du code : corriger une formulation ne
     doit pas demander une republication et une revue Apple. Tant qu'il n'est
     pas chargé, le repli du noyau s'affiche — l'écran n'est jamais vide. */
  const infos = useDonnees((e) => e.infos);
  const assurerInfos = useDonnees((e) => e.assurerInfos);
  useEffect(() => {
    assurerInfos();
  }, [assurerInfos]);

  return (
    <Ecran titre="Infos" sousTitre="la confiance">
      <View style={s.corps}>
        {infos.blocs.map((b) => <Rendu key={b.id} b={b} />)}
      </View>
    </Ecran>
  );
}

function Rendu({ b }: { b: Bloc }) {
  if (b.type === 'texte') return <CarteTexte b={b} />;
  return <ModuleRendu nom={b.module} />;
}

function ModuleRendu({ nom }: { nom: Module }) {
  switch (nom) {
    case 'notifications': return <LesNotifications />;
    case 'echeances': return <MesEcheances />;
    case 'gps': return <TonGps />;
    case 'vehicule': return <TonVehicule />;
    case 'suggestions': return <Suggestions />;
    case 'flammes': return <LesFlammes />;
    case 'sources': return <DOuViennentLesInfos />;
    case 'version':
      return (
        <Text style={s.version}>
          Version {Constants.expoConfig?.version ?? '1.0'} — Île-de-France
        </Text>
      );
    /* Un module inconnu vient d'un back office plus récent que l'app : on
       l'ignore en silence plutôt que de casser la page. */
    default: return null;
  }
}

/* Les paragraphes acceptent **du gras** : c'est la seule mise en forme, et
   elle se tape sans rien connaître. Tout le reste serait un éditeur à
   maintenir pour une page qui en a huit. */
function Gras({ texte }: { texte: string }) {
  const morceaux = texte.split('**');
  return (
    <Text style={s.p}>
      {morceaux.map((m, i) =>
        i % 2 ? <Text key={i} style={s.gras}>{m}</Text> : <Text key={i}>{m}</Text>,
      )}
    </Text>
  );
}

function CarteTexte({ b }: { b: BlocTexte }) {
  return (
    <Carte label={b.titre}>
      {b.paragraphes.map((p, i) => <Gras key={i} texte={p} />)}
    </Carte>
  );
}

function Carte({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={s.carte}>
      <Text style={s.label}>{label}</Text>
      {children}
    </View>
  );
}

function P({ children }: { children: ReactNode }) {
  return <Text style={s.p}>{children}</Text>;
}

function Petit({ children }: { children: ReactNode }) {
  return <Text style={s.petit}>{children}</Text>;
}

const G = ({ children }: { children: ReactNode }) => (
  <Text style={s.gras}>{children}</Text>
);

/* ---- Les notifications -------------------------------------------------
   L'autorisation part d'ICI, sur un geste du chauffeur, et jamais au
   lancement. C'est aussi ici qu'on lui dit à quoi il est abonné : sans
   compte, il n'a aucun autre endroit où le vérifier.                      */
function LesNotifications() {
  const { etat, sujets, enCours, activer, desactiver } = useNotifs();
  const zones = useDonnees((e) => e.zones);
  const brief = useDonnees((e) => e.brief);
  const pos = usePosition((e) => e.pos);

  const dept = pos ? departementA(pos, zones?.communes ?? [], brief?.demand ?? []) : null;
  const actif = etat === 'actif';

  return (
    <Carte label="Les notifications">
      <P>
        Être prévenu qu’un concert finit dans quarante minutes à huit
        kilomètres, sans avoir à ouvrir l’appli. Dans ce métier, le geste
        gagnant est celui qu’on ne fait pas.
      </P>

      <View style={s.pastilles}>
        <Pastilles
          liste={[
            { code: 'off' as const, libelle: 'Coupées' },
            { code: 'on' as const, libelle: 'Activées' },
          ]}
          actif={actif ? 'on' : 'off'}
          onChoisir={(c) => (c === 'on' ? activer(dept) : desactiver())}
        />
      </View>

      {enCours ? <Petit>Un instant…</Petit> : null}

      {etat === 'indisponible' ? (
        <Petit>
          Indisponible dans cette version de l’app. Elles arriveront avec la
          prochaine mise à jour installée depuis le magasin.
        </Petit>
      ) : null}

      {etat === 'refuse' ? (
        <>
          <Petit>
            Tu as refusé les notifications au téléphone. Il faut les réautoriser
            dans les réglages.
          </Petit>
          <Pressable onPress={ouvrirReglages} hitSlop={10} style={s.lien}>
            <Text style={s.lienTexte}>Ouvrir les réglages</Text>
          </Pressable>
        </>
      ) : null}

      {actif ? (
        <>
          <View style={s.tags}>
            {sujets.map((x) => (
              <Etiquette key={x} texte={x === 'tous' ? 'Toute l’IDF' : 'Dept ' + x.slice(5)} ton="ok" />
            ))}
          </View>
          <Petit>
            Tu reçois le général et, quand on sait où tu es, ton département.
            L’abonnement suit ta position : change de secteur, il suit.
          </Petit>
        </>
      ) : null}

      <Petit>
        On diffuse vers des canaux, pas vers des personnes : ton téléphone
        s’abonne lui-même. Aucun identifiant d’appareil n’est conservé, et il
        n’existe aucune liste de destinataires.
      </Petit>
    </Carte>
  );
}

/* ---- Mes échéances ----------------------------------------------------- */
function MesEcheances() {
  const saisies = usePrefs((e) => e.echeances);
  const setEcheance = usePrefs((e) => e.setEcheance);
  const [ouvert, setOuvert] = useState<string | null>(null);

  const liste = lireEcheances(saisies, maintenant());

  return (
    <Carte label="Mes échéances">
      <P>
        Les dates qui arrêtent l’activité le jour où elles tombent. Saisis-les
        une fois, le <G>brief te prévient à temps</G> : un mois avant, et{' '}
        <G>trois mois</G> pour la carte VTC — son renouvellement prend environ
        deux mois.
      </P>

      {liste.map((e) => (
        <LigneEcheance
          key={e.code}
          e={e}
          onOuvrir={() => setOuvert(e.code)}
          onEffacer={() => setEcheance(e.code, null)}
        />
      ))}

      {ouvert ? (
        <DateTimePicker
          value={
            saisies[ouvert]
              ? DateTime.fromISO(saisies[ouvert], { zone: ZONE }).toJSDate()
              : new Date()
          }
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(evt, d) => {
            setOuvert(null);
            if (evt.type === 'dismissed' || !d) return;
            setEcheance(ouvert, DateTime.fromJSDate(d).toFormat('yyyy-LL-dd'));
          }}
        />
      ) : null}

      <Petit>
        Ces dates restent dans ce téléphone : rien n’est envoyé, rien n’est
        partagé. Ce sont tes papiers, pas des données d’application. Change de
        téléphone et il faudra les resaisir.
      </Petit>
    </Carte>
  );
}

function LigneEcheance({
  e, onOuvrir, onEffacer,
}: {
  e: EcheanceLue;
  onOuvrir: () => void;
  onEffacer: () => void;
}) {
  return (
    <View style={s.ligne}>
      <View style={s.ligneCorps}>
        <Text style={s.ligneTitre}>{e.libelle}</Text>
        <Text style={s.ligneSous}>{e.duree}</Text>
      </View>

      <Pressable onPress={onOuvrir} hitSlop={10} style={s.date}>
        {e.date ? (
          <>
            <Text style={s.dateTexte}>
              {DateTime.fromISO(e.date, { zone: ZONE }).toFormat('dd/LL/yyyy')}
            </Text>
            <Text
              style={[
                s.dateEtat,
                e.etat === 'bientot' && s.bientot,
                e.etat === 'depasse' && s.depasse,
              ]}>
              {libelleEcheance(e.jours)}
            </Text>
          </>
        ) : (
          <Text style={s.dateVide}>saisir</Text>
        )}
      </Pressable>

      {e.date ? (
        <Pressable onPress={onEffacer} hitSlop={12} style={s.croix}>
          <Text style={s.croixTexte}>✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ---- Les deux réglages ------------------------------------------------- */
function TonGps() {
  const nav = usePrefs((e) => e.nav);
  const setNav = usePrefs((e) => e.setNav);
  return (
    <Carte label="Ton GPS">
      <P>
        Choisis l’application qui s’ouvre quand tu appuies sur « Y aller ». Un
        seul bouton partout, celui que tu utilises vraiment.
      </P>
      <View style={s.pastilles}>
        <Pastilles
          liste={[
            { code: 'waze' as Nav, libelle: 'Waze' },
            { code: 'gmaps' as Nav, libelle: 'Google Maps' },
          ]}
          actif={nav}
          onChoisir={setNav}
        />
      </View>
    </Carte>
  );
}

function TonVehicule() {
  const vehicule = usePrefs((e) => e.vehicule);
  const setVehicule = usePrefs((e) => e.setVehicule);
  return (
    <Carte label="Ton véhicule">
      <P>
        Ce que tu conduis décide de ce qu’on te montre dans{' '}
        <G>Sur la route → Services</G>. En électrique, seules les stations qui
        rechargent apparaissent — les autres ne te servent à rien.
      </P>
      <View style={s.pastilles}>
        <Pastilles
          liste={[
            { code: 'carburant' as Vehicule, libelle: 'Carburant' },
            { code: 'electrique' as Vehicule, libelle: '⚡ Électrique' },
          ]}
          actif={vehicule}
          onChoisir={setVehicule}
        />
      </View>
    </Carte>
  );
}



function Suggestions() {
  const ouvrable = !!marque.suggestions;
  return (
    <Carte label="Un bon plan, une erreur ?">
      <P>
        Un lieu qui manque, un horaire faux, une entrée à éviter : c’est ce qui
        fait la valeur des fiches, et ça ne s’invente pas depuis un bureau.
      </P>
      {ouvrable ? (
        <Pressable
          onPress={() =>
            Linking.openURL(
              'mailto:' + marque.suggestions + '?subject=' +
                encodeURIComponent('Un bon plan pour ' + marque.nom),
            ).catch(() => {})
          }
          hitSlop={10}
          style={s.bouton}>
          <Text style={s.boutonTexte}>Envoyer une suggestion</Text>
        </Pressable>
      ) : (
        <Petit>
          Le canal de retour n’est pas encore ouvert : il arrive avec le back
          office, pour que tout atterrisse au même endroit plutôt que dans une
          boîte mail exposée.
        </Petit>
      )}
    </Carte>
  );
}

/* ---- Les flammes, expliquées ------------------------------------------- */
const BAREME = [
  { v: SEUIL_3, titre: 'On y va', sous: 'Un gros vol du matin à Roissy, un concert à l’Accor Arena, dix TGV à Montparnasse.' },
  { v: SEUIL_2, titre: 'Ça vaut le détour', sous: 'Une salle moyenne qui se vide, une bonne tranche dans une grande gare.' },
  { v: SEUIL_1, titre: 'Il y a de quoi faire', sous: 'Si tu es déjà dans le coin, ça se tente.' },
];

function LesFlammes() {
  return (
    <Carte label="Les flammes">
      <P>Elles notent la demande qu’un endroit peut générer.</P>

      {BAREME.map((b) => (
        <View key={b.titre} style={s.ligne}>
          <View style={s.colFlammes}>
            <Flammes volume={b.v} />
          </View>
          <View style={s.ligneCorps}>
            <Text style={s.ligneTitre}>{b.titre}</Text>
            <Text style={s.ligneSous}>{b.sous}</Text>
          </View>
        </View>
      ))}

      <View style={s.ligne}>
        <View style={s.colFlammes}>
          <Text style={s.tiret}>—</Text>
        </View>
        <View style={s.ligneCorps}>
          <Text style={s.ligneTitre}>Rien d’écrit</Text>
          <Text style={s.ligneSous}>
            Pas de quoi se déplacer exprès. La ligne reste affichée pour que tu
            voies ce qui se passe, c’est tout.
          </Text>
        </View>
      </View>

      <Petit>
        La note vient d’un calcul : places des trains, sièges réellement
        installés dans les avions, jauge des salles — puis la part des gens qui
        prennent une voiture plutôt que le métro. <G>Ce n’est pas ta demande à
        toi</G> : c’est ce que la zone peut générer, tous chauffeurs et tous
        taxis confondus. Trois flammes veut dire « c’est là qu’il faut être »,
        pas « tu vas enchaîner ».
      </Petit>
    </Carte>
  );
}

/* ---- Les sources ------------------------------------------------------- */
const SOURCES: [string, string][] = [
  ['Trains', 'horaires d’arrivée SNCF, en temps réel quand la clé est en place, sinon l’horaire théorique publié en données ouvertes.'],
  ['Vols', 'programme Air France, KLM et Transavia à Roissy et Orly. Horaires théoriques, sans retards.'],
  ['Événements', 'billetteries et agendas officiels des salles de plus de 5 000 places, Porte de Versailles et Villepinte, plus les matchs à domicile. La liste s’arrête à la fin de la journée de demain : au volant, un concert dans six jours n’est pas une information.'],
  ['Trafic', 'fermetures nocturnes des autoroutes, nationales et du périphérique, publiées par Sytadin et reprises avec son autorisation. Seulement celles de la nuit en cours : ce qui est coupé en permanence, Waze et Google Maps te dévient tout seuls.'],
  ['Toilettes', 'sanisettes de la Ville de Paris dans Paris, OpenStreetMap en banlieue (© les contributeurs OpenStreetMap, ODbL). Celles des parcs disparaissent la nuit : les parcs ferment.'],
  ['Manger', 'fast-foods, grecs et sandwicheries d’OpenStreetMap avec leurs horaires, plus les supérettes ouvertes tard et les aires d’autoroute qui ont une boutique.'],
  ['Services', 'stations-service du fichier officiel des prix des carburants : horaires de la boutique et des pompes, boutique, toilettes. L’étiquette Électrique vient du fichier consolidé des bornes de recharge. Lavages et pharmacies d’OpenStreetMap, complétés à la main.'],
  ['Météo', 'Open-Meteo, heure par heure, sur huit points : un par département. Le brief « autour de moi » prend le plus proche de toi, celui de toute l’Île-de-France prend Paris.'],
];

function DOuViennentLesInfos() {
  return (
    <Carte label="D’où viennent les infos">
      {SOURCES.map(([titre, texte]) => (
        <Text key={titre} style={s.source}>
          <Text style={s.gras}>{titre}</Text> — {texte}
        </Text>
      ))}
      <Petit>
        Tout vient de sources publiques et gratuites, reprises dans des
        conditions qui autorisent leur affichage. Aucune donnée ne vient d’une
        plateforme de VTC, et aucune ne part d’ici.
      </Petit>
      <View style={s.rappel}>
        <View style={s.rappelTag}>
          <Etiquette texte="Rappel" />
        </View>
        <Text style={[s.petit, s.rappelTexte]}>
          Les volumes affichés sont des estimations de capacité, pas des
          réservations. Ils servent à comparer deux créneaux entre eux, jamais
          à promettre des courses.
        </Text>
      </View>
    </Carte>
  );
}

const s = StyleSheet.create({
  corps: { paddingHorizontal: espaces.pad, gap: 10 },

  carte: {
    backgroundColor: couleurs.surface,
    borderColor: couleurs.trait,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: rayons.carte,
    padding: espaces.pad,
    gap: 8,
  },
  label: { ...typo.etiquette, color: couleurs.texteMuet, marginBottom: 2 },
  p: { ...typo.carteSous, color: couleurs.texteAtenue, lineHeight: 20 },
  petit: { ...typo.ligneSous, color: couleurs.texteMuet, lineHeight: 18 },
  gras: { fontFamily: polices.demi, color: couleurs.texte },
  source: { ...typo.ligneSous, color: couleurs.texteAtenue, lineHeight: 19 },

  pastilles: { marginTop: 4 },

  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: couleurs.traitDoux,
  },
  ligneCorps: { flex: 1 },
  ligneTitre: { ...typo.ligneTitre, color: couleurs.texte },
  ligneSous: { ...typo.ligneSous, color: couleurs.texteAtenue, marginTop: 1, lineHeight: 17 },
  /* Assez large pour que 🔥🔥🔥 tienne sur UNE ligne : à 48 px la
     troisième flamme passait à la ligne suivante. */
  colFlammes: { width: 62, alignItems: 'flex-start' },
  tiret: { ...typo.ligneSous, color: couleurs.texteMuet },

  date: { alignItems: 'flex-end', minHeight: 36, justifyContent: 'center' },
  dateTexte: { ...typo.ligneTitre, ...tabulaire, color: couleurs.texte },
  dateEtat: { ...typo.ligneSous, color: couleurs.texteMuet },
  dateVide: { ...typo.ligneSous, fontFamily: polices.demi, color: couleurs.texteAtenue },
  bientot: { color: couleurs.alerte },
  depasse: { color: couleurs.alerte, fontFamily: polices.demi },
  croix: { paddingLeft: 4 },
  croixTexte: { ...typo.ligneSous, color: couleurs.texteMuet },

  lien: { marginTop: 6, minHeight: 24, justifyContent: 'center' },
  lienTexte: { ...typo.ligneSous, fontFamily: polices.demi, color: couleurs.texte },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  bouton: {
    alignSelf: 'flex-start',
    marginTop: 4,
    backgroundColor: couleurs.accent,
    borderRadius: rayons.petit,
    paddingHorizontal: 14,
    height: 38,
    justifyContent: 'center',
  },
  boutonTexte: { fontFamily: polices.gras, fontSize: 14, color: couleurs.accentEncre },

  rappel: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: couleurs.traitDoux,
  },
  /* flexShrink: 0 sur l'étiquette, flex: 1 sur le texte : sans ça, la case
     « Rappel » s'étirait et le paragraphe débordait de la carte. */
  rappelTag: { flexShrink: 0 },
  rappelTexte: { flex: 1 },

  version: {
    ...typo.ligneSous,
    color: couleurs.texteMuet,
    textAlign: 'center',
    marginTop: 10,
  },
});
