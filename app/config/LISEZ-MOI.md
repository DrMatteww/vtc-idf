# Les deux fichiers de configuration Firebase

Ce dossier attend deux fichiers que seule la console Firebase peut produire.
Ils ne sont pas secrets — ils identifient le projet, ils n'autorisent rien —
mais sans eux l'application ne compile pas avec Firebase.

| Fichier | D'où il vient | Pour quoi |
|---|---|---|
| `google-services.json` | Console Firebase → app Android `fr.vtcidf.app` | build Android |
| `GoogleService-Info.plist` | Console Firebase → app iOS `fr.vtcidf.app` | build iOS |

Dépose-les ici, sans les renommer.

## Ce qui N'EST PAS ici

La **clé de compte de service** (Paramètres du projet → Comptes de service →
Générer une nouvelle clé privée). Celle-là est un vrai secret : elle permet
d'envoyer des notifications à tous les utilisateurs. Elle ne doit JAMAIS
entrer dans le dépôt ni dans l'application, qui est décompilable une fois
publiée. Elle va dans les secrets GitHub, sous le nom `FCM_SERVICE_ACCOUNT`,
et c'est l'Action `notifier.yml` qui s'en sert.
