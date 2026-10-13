# Registre des activités de traitement (document interne)

Registre simplifié au sens de l’article 30 du RGPD. Il reprend les traitements décrits aux
utilisateurs sur `/confidentialite` (source : `src/features/legal/processing.ts`) : les deux doivent
rester identiques. Dernière mise à jour : 10 octobre 2026.

## Responsable du traitement

- Léo Velard, personne physique, étudiant à Sciences Po (campus de Menton), éditeur de Stratavault
  (projet étudiant indépendant, non commercial et gratuit).
- Contact : adresse de `CONTACT_EMAIL` dans `src/lib/legal.ts` (**provisoire** : exemple@gmail.com).
- Pas de délégué à la protection des données (non obligatoire ici).

## Sous-traitants

| Sous-traitant | Rôle | Localisation | Garanties |
|---|---|---|---|
| Supabase Pte. Ltd. (65 Chulia Street #38-02/03, OCBC Centre, Singapour 049513) | Authentification, base PostgreSQL, envoi des e-mails Auth | Projet chez AWS eu-west-3 (Paris) ; accès possibles depuis Singapour, les États-Unis et d’autres pays (liste des sous-traitants de Supabase) | DPA de Supabase (version du 1er août 2026), clauses contractuelles types module 2 |
| Vercel Inc. (440 N Barranca Avenue #4133, Covina, CA 91723, États-Unis) | Hébergement et exécution du serveur de l’application (toutes les données envoyées au service y transitent : e-mail et mot de passe, cartes, compteurs anti-abus), journaux d’exécution | Fonctions : région à fixer (`cdg1` recommandé ; par défaut Washington, D.C., `iad1`). Proxy (`src/proxy.ts`) : toutes les régions de Vercel, quel que soit ce réglage, y compris hors UE. Société américaine | Décision d’adéquation (UE) 2023/1795 du 10 juillet 2023 : Data Privacy Framework UE–États-Unis (adhésion déclarée par Vercel, inscription à vérifier). **Contrat art. 28 non établi en offre Hobby** : le DPA de Vercel (sections 1 et 4.1) se limite aux offres Pro et Enterprise, mais ses conditions (section 10.1, toutes offres) renvoient à ce DPA ; les deux textes se contredisent. Obligatoire avant la mise en ligne : offre Pro, ou confirmation écrite de Vercel que le DPA (et ses clauses contractuelles types 2021/914) s’applique au compte Hobby (`docs/legal.md` point 7 ; build de production bloqué sinon). Vercel utilise aussi les données techniques de trafic pour son propre compte (conditions, section 10.4, voir traitement 4) ; « Model Training » à désactiver (point 16) |
| Fournisseur de la messagerie de contact (`CONTACT_PROVIDER`) | Réception des demandes par e-mail | À compléter avec l’adresse définitive | À compléter |

## Traitements

### 1. Compte utilisateur
- **Finalité** : créer et gérer le compte, authentifier, envoyer les e-mails de confirmation et de réinitialisation.
- **Base légale** : exécution du contrat (art. 6.1.b).
- **Personnes concernées** : titulaires d’un compte.
- **Données** : adresse e-mail ; mot de passe (reçu en clair par le serveur de l’application, ni conservé ni journalisé, puis haché par Supabase Auth avec bcrypt) ; dates de création, de confirmation et de dernière connexion ; sessions (dates, adresse IP et user agent du serveur de l’application) enregistrées par Supabase Auth ; exception : un lien reçu par e-mail au format par défaut de Supabase s’ouvre d’abord chez Supabase, qui journalise alors l’adresse IP et le user agent du visiteur (`docs/legal.md` point 14).
- **Caractère obligatoire** : e-mail et mot de passe nécessaires à la création du compte ; sans eux, mode démo seulement.
- **Destinataires** : l’éditeur (tableau de bord Supabase) ; Supabase ; Vercel (exécution du serveur de l’application).
- **Transferts** : voir sous-traitants (Supabase : clauses contractuelles types ; Vercel : Data Privacy Framework, clauses contractuelles types si le DPA s’applique ; fonctions aux États-Unis tant que la région n’est pas fixée ; proxy, qui lit les cookies de session, dans toutes les régions de Vercel).
- **Durée** : jusqu’à la suppression du compte (par la personne sur `/compte`, effet immédiat, ou sur demande) ; suppression manuelle après 3 ans sans connexion, après un e-mail de prévenance. Cookies de session : 30 jours sans utilisation.
- **Journal d’audit Auth** : vérifié le 10 octobre 2026, `auth.audit_log_entries` est vide (le service Auth hébergé n’écrit pas dans la base du projet) ; les événements d’authentification sont dans les journaux de la plateforme Supabase (traitement 4). Contrôle périodique : `docs/legal.md` point 6.
- **Sécurité** : mots de passe jamais stockés en clair ni journalisés (12 à 72 caractères), cookies de session HttpOnly/Secure/SameSite=Lax, aucun client Supabase dans le navigateur, sessions vérifiées par `getUser()`, limites de tentatives.

### 2. Cartes enregistrées dans un compte
- **Finalité** : enregistrer et synchroniser les cartes du compte.
- **Base légale** : exécution du contrat (art. 6.1.b).
- **Personnes concernées** : titulaires d’un compte (et, le cas échéant, personnes citées dans leurs notes, sous leur responsabilité).
- **Données** : nom et contenu des cartes (table `public.maps`), statistiques, dates, version.
- **Destinataires** : l’éditeur (administration technique) ; Supabase ; Vercel (exécution du serveur de l’application).
- **Transferts** : voir sous-traitants.
- **Durée** : jusqu’à la suppression de la carte ou du compte (`on delete cascade`) ; sauvegardes de la base : aucune en offre gratuite de Supabase, 7 jours en Pro.
- **Sécurité** : RLS `auth.uid() = user_id`, droits par colonne, écritures par fonctions bornées, Server Actions authentifiées et validées (zod), copie locale cloisonnée par compte et effacée à la déconnexion et à la suppression du compte.

### 3. Sécurité et lutte contre les abus
- **Finalité** : limiter les tentatives de connexion, inscription, réinitialisation, nouveau mot de passe, confirmation de lien, rafraîchissement de session, déconnexion, suppression du compte et téléchargement des données ; limiter les téléchargements des données simultanés (un par compte, 2 par adresse IP, 4 par instance du serveur).
- **Base légale** : intérêt légitime (art. 6.1.f) : sécurité du service et des comptes.
- **Personnes concernées** : visiteurs qui utilisent les formulaires de compte.
- **Données** : adresse IP (préfixe /64 en IPv6), adresse e-mail saisie (connexion, mot de passe oublié), identifiant du compte connecté (suppression du compte, téléchargement des données), et, pendant un téléchargement en cours, identifiant du compte et adresse IP ; compteurs.
- **Caractère obligatoire** : adresse IP techniquement nécessaire pour accéder au site et utiliser les formulaires.
- **Destinataires** : Vercel uniquement, qui exécute le serveur de l’application (compteurs en mémoire, `src/features/auth/rateLimit.ts`) : compteur de renouvellement de session dans le proxy (toutes les régions de Vercel), autres compteurs dans les fonctions (région du projet, `docs/legal.md` point 5).
- **Durée** : fenêtres de 5 à 60 minutes ; entrées échues effacées lors de leur réutilisation, quand la limite de 10 000 clés est atteinte, ou à l’arrêt de l’instance. Téléchargement en cours oublié à sa fin, en cas d’échec ou quand le fichier n’est plus lu (10 secondes sans première lecture, 2 minutes entre deux lectures, `src/features/account/exportData.ts`), et au plus tard 15 minutes après son début, par une minuterie (`src/features/account/exportSlots.ts`). Rien n’est écrit sur disque.
- **Journaux de l’application** : uniquement l’action, le type et le code des erreurs (`logAuthFailure`, `[maps]`), sans donnée personnelle.

### 4. Journaux d’hébergement
- **Finalité** : fonctionnement, diagnostic, détection des abus.
- **Base légale** : intérêt légitime (art. 6.1.f).
- **Personnes concernées** : visiteurs du site.
- **Données** : adresse IP, user agent, chemin et paramètres de la requête, date, statut (Vercel) ; journaux des requêtes à l’API et à la base (Supabase), qui viennent du serveur de l’application, sauf l’ouverture d’un lien reçu par e-mail au format par défaut (adresse IP et user agent du visiteur) ; journaux d’authentification de Supabase (événements du compte : connexion, inscription, réinitialisation, déconnexion…, avec l’identifiant du compte, l’adresse IP et le user agent à l’origine de la requête — ceux du serveur de l’application, ou ceux du visiteur à l’ouverture d’un lien au format par défaut — et d’autres métadonnées, dont le cas échéant l’adresse e-mail), tenus par la plateforme Supabase et non dans la base du projet.
- **Localisation et transferts** : Vercel, voir sous-traitants. Supabase : journaux de la plateforme stockés dans des centres de données de l’Union européenne ; journaux, télémétrie et métadonnées du service traités hors de la région du projet pour exploiter et sécuriser la plateforme (FAQ « Data Residency and Transfers », version 1 du 6 octobre 2026) ; clauses contractuelles types du DPA.
- **Caractère obligatoire** : adresse IP techniquement nécessaire pour accéder au site.
- **Destinataires** : Vercel (sous-traitant pour le fonctionnement du site, et pour son propre compte, voir ci-dessous), Supabase ; consultation par l’éditeur.
- **Durée** : consultables 1 heure (Vercel Hobby) ; chez Supabase Free, 1 jour pour les journaux de l’API et de la base et 1 heure pour les journaux d’authentification (page des tarifs, lignes « Log retention (API & Database) » et « Auth Audit Logs », consultée le 10 octobre 2026), d’après la documentation des prestataires. Vercel se réserve en outre (conditions, section 10.4) le droit d’utiliser les « System Data » (données de trafic, télémétrie, journaux, statistiques d’usage) pour toutes ses finalités, pendant et après le contrat, sans durée annoncée, et de ne les divulguer que sous forme agrégée ou dépersonnalisée : pour cet usage, Vercel agit en responsable de traitement distinct (décrit sur `/confidentialite`). Conservation propre de Supabase selon sa politique.
- **Sécurité** : consultation réservée aux comptes Vercel et Supabase de l’éditeur (authentification à deux facteurs à activer, `docs/legal.md` point 17) ; l’application ne journalise ni mot de passe ni donnée personnelle (seulement l’action, le type et le code des erreurs).
- **Remarque** : les liens reçus par e-mail (`/auth/confirm?token_hash=…`) apparaissent dans les journaux de Vercel ; ils ne servent qu’une fois et pour une durée limitée.

### 5. Mode démo
- **Finalité** : utiliser l’éditeur sans compte.
- **Base légale** : exécution du contrat (art. 6.1.b).
- **Personnes concernées** : visiteurs qui utilisent le mode démo (et, le cas échéant, personnes citées dans leurs notes).
- **Données** : cartes dans la base IndexedDB `stratavault` du navigateur (jamais transmises) ; cookie `sv-demo` (valeur « 1 », 30 jours).
- **Destinataires** : aucun.
- **Durée** : jusqu’à leur suppression par l’utilisateur (banque, « Effacer les données de ce navigateur » sur `/espace`, ou réglages du navigateur) ; cookie `sv-demo` effacé à l’ouverture d’une session de compte et à la déconnexion.
- **Sécurité** : cartes jamais transmises au serveur ; base IndexedDB réservée par le navigateur à l’origine du site (règle de même origine) ; CSP qui bloque les scripts non autorisés et les connexions vers d’autres sites ; cookie `sv-demo` HttpOnly, Secure en production, SameSite=Lax.

### 6. Demandes envoyées par e-mail
- **Finalité** : répondre aux questions et aux demandes d’exercice de droits.
- **Base légale** : intérêt légitime (art. 6.1.f) ; obligation légale pour les demandes de droits (art. 6.1.c).
- **Personnes concernées** : personnes qui écrivent à l’adresse de contact (utilisateurs ou non).
- **Données** : adresse de l’expéditeur, contenu du message.
- **Destinataires** : l’éditeur ; fournisseur de la messagerie (`CONTACT_PROVIDER`, à renseigner).
- **Durée** : messages et réponses supprimés un an après la dernière réponse ; demandes d’exercice de droits et réponses conservées cinq ans après la réponse, comme preuve (prescription de droit commun, art. 2224 du Code civil), puis supprimées (`CONTACT_RETENTION`).
- **Sécurité** : à compléter avec l’adresse définitive ; messagerie accessible au seul éditeur, authentification à deux facteurs à activer (`docs/legal.md` point 17) ; tri annuel des messages (point 15).

## Exercice des droits

- Dans l’application (`/compte`, mode compte) : téléchargement des données (art. 15 et 20 : fiche du
  compte et toutes ses cartes, JSON), suppression du compte (art. 17 : immédiate, cartes, identités
  et sessions supprimées en cascade par `public.delete_my_account()`), lien de changement du mot de
  passe. Mode démo (`/espace`) : effacement des données du navigateur.
- Par e-mail : rectification de l’adresse, limitation, opposition, copie des données absentes du
  fichier (sessions, journaux), et toute autre demande ; réponse sous un mois (art. 12).
- La suppression n’atteint pas les sauvegardes de la base (aucune en offre gratuite de Supabase,
  7 jours en Pro) ni les journaux, qui suivent leurs propres durées (traitement 4).

## Cookies et stockages du navigateur

Inventaire exact dans `src/features/legal/storageInventory.ts` (page `/cookies`), tous strictement
nécessaires (art. 82 de la loi Informatique et Libertés) : cookies `sb-<réf>-auth-token…` (session
et vérificateurs PKCE de Supabase Auth, 30 jours au plus, plafond fixé par l’application), `sv-demo` (30 jours) ; bases IndexedDB
`stratavault` et `stratavault-u-<id>` ; localStorage `stratavault-vue` ; canaux BroadcastChannel
`stratavault-editeur` et `stratavault-comptes` (sans stockage).

## Violations de données

En cas de violation de données personnelles : la documenter ici (date, nature, données et personnes
concernées, mesures prises), la notifier à la CNIL dans les 72 heures si elle présente un risque pour
les personnes (art. 33), et informer les personnes concernées si le risque est élevé (art. 34).
