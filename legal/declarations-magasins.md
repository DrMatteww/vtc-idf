# Déclarations de confidentialité — App Store et Google Play

Les réponses à cocher dans les deux consoles, avec la raison de chacune.

> ⚠️ **Une déclaration fausse est un motif de retrait**, parfois des mois
> après la publication. Ces réponses décrivent l'application telle qu'elle est
> au 29 octobre 2026. **Si on ajoute un SDK — mesure d'audience, suivi des
> plantages, régie différente — il faut revenir ici AVANT de soumettre.**

---

## Le point de départ

Deux choses sont vraies en même temps, et c'est ce qui rend ces formulaires
piégeux :

1. **L'éditeur ne collecte rien.** Pas de compte, pas de serveur, pas de base.
2. **La régie publicitaire collecte**, avec consentement.

Les deux magasins demandent de déclarer ce que collecte **l'application dans
son ensemble, SDK tiers compris**. Donc on déclare la collecte de la régie,
même si elle ne nous revient jamais. Répondre « aucune collecte » serait faux.

---

## Apple — App Privacy

*App Store Connect → ton app → App Privacy*

### « Do you or your third-party partners collect data from this app? »

**Oui.** À cause de la régie, pas de nous.

### Les catégories à déclarer

| Donnée | Déclarer ? | Usage | Liée à l'identité | Suivi |
|---|---|---|---|---|
| **Identifiers → Device ID** | oui | Third-Party Advertising | non | **oui** |
| **Usage Data → Advertising Data** | oui | Third-Party Advertising | non | **oui** |
| **Diagnostics** | oui si la régie le fait | Analytics | non | non |
| **Location → Coarse Location** | oui | Third-Party Advertising | non | **oui** |
| Location → Precise Location | **NON** | — | — | — |
| Contact Info, Health, Financial, Contacts, Photos | **NON** | — | — | — |
| User Content, Search History, Purchases | **NON** | — | — | — |

**Le point qui compte : la position précise ne se déclare PAS.** Elle est
utilisée uniquement sur l'appareil, pour trier des lieux, et ne sort jamais du
téléphone. Apple ne demande de la déclarer que si elle est *collectée*,
c'est-à-dire transmise. Ce n'est pas le cas.

La position *approximative* se déclare parce que la régie la déduit de la
connexion réseau.

### App Tracking Transparency

L'application **doit** afficher la fenêtre ATT avant toute publicité
personnalisée, puisqu'elle déclare du suivi. Sans ATT, le refus est
automatique au moment de la revue.

Texte proposé pour la fenêtre :

> QLN est gratuite grâce à la publicité. Ton autorisation permet d'afficher
> des annonces pertinentes. Tu peux refuser : l'application fonctionne
> exactement pareil.

### Privacy Policy URL

Obligatoire. À héberger publiquement — par exemple sur la même GitHub Pages
que les données : `https://drmatteww.github.io/vtc-idf/confidentialite/`.

---

## Google — Data safety

*Play Console → ton app → Sécurité des données*

### Section « Collecte et partage »

| Question | Réponse |
|---|---|
| L'app collecte-t-elle des données ? | **Oui** (la régie) |
| Les données sont-elles chiffrées en transit ? | **Oui** |
| L'utilisateur peut-il demander la suppression ? | **Oui** — désinstallation et réglages de la régie |
| Les données sont-elles partagées avec des tiers ? | **Oui** — la régie publicitaire |

### Les types à déclarer

| Type | Collecté | Partagé | Finalité | Obligatoire |
|---|---|---|---|---|
| **Identifiants → ID publicitaire** | oui | oui | Publicité | non, consentement |
| **Position → Position approximative** | oui | oui | Publicité | non, consentement |
| Position → Position exacte | **non** | — | — | — |
| **Infos sur l'app → Interactions** | oui | oui | Publicité | non |
| Infos personnelles, Fichiers, Messages, Contacts, Santé | **non** | — | — | — |

### Consentement en Europe

Google exige une plateforme de gestion du consentement (CMP) certifiée pour
diffuser des annonces personnalisées dans l'EEE. Sans elle, les annonces
retombent automatiquement en non personnalisé.

---

## Ce qui reste vrai, et qu'on peut dire sur les fiches

Ces trois promesses survivent à la publicité personnalisée et méritent d'être
écrites dans la description des magasins — elles sont rares et vérifiables :

- **aucune inscription** : ni nom, ni numéro, ni plaque ;
- **aucun serveur de l'éditeur** : rien ne remonte du téléphone ;
- **la position ne sort pas** : le tri se fait sur l'appareil.

---

## Avant de soumettre — la liste

- [ ] Politique de confidentialité complétée, relue par un juriste, publiée à une adresse stable
- [ ] Raison sociale, SIREN, adresse et e-mail de contact renseignés
- [ ] Régie publicitaire choisie, et sa politique liée dans le texte
- [ ] Fenêtre ATT intégrée et testée sur appareil
- [ ] CMP intégrée et testée depuis la France
- [ ] Déclarations Apple et Google remplies comme ci-dessus
- [ ] **Captures refaites depuis l'app native** — celles du dossier montrent l'ancienne interface GoodBarber
- [ ] Textes des fiches relus avec le nom QLN
- [ ] Build de production signé, déposé en TestFlight et en test interne Play
- [ ] Une semaine de conduite réelle avant la soumission publique
