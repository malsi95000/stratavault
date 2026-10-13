# Aspect légal — à faire avant la mise en ligne

Stratavault est un projet étudiant non commercial édité par une personne physique (aucune société).
Les pages `/mentions-legales`, `/confidentialite`, `/cookies` et `/conditions` lisent toutes leurs
informations dans **une seule source** :

| Fichier | Contenu |
|---|---|
| `src/lib/legal.ts` | éditeur, contact et fournisseur de sa messagerie, hébergeur (et région des fonctions), prestataire des données, article de la LCEN, CNIL, âge minimum, date de mise à jour, liste des points non vérifiés (`UNVERIFIED`) |
| `src/features/legal/processing.ts` | traitements de données (page Confidentialité, et `docs/registre-traitements.md`) |
| `src/features/legal/storageInventory.ts` | inventaire exact des cookies et stockages du navigateur (page Cookies) |
| `src/features/legal/credits.ts` | données et bibliothèques, avec leur licence (page Mentions légales) |

Les tests (`npm test`) vérifient que l’inventaire correspond au code (noms, durées, options des
cookies ; aucun cookie, canal ou stockage du code absent de la page), que les licences annoncées
sont celles des paquets installés, que les liens du pied de page et des pages légales mènent à des
pages existantes, et que les informations légales (y compris la mention du pied de page et les
liens des formulaires de compte) ne sont écrites nulle part ailleurs que dans `src/lib/legal.ts`. Après une modification du code qui ajoute un cookie ou un stockage, mettez à
jour l’inventaire : le test échoue tant que ce n’est pas fait.

Changez `LEGAL_UPDATED_ON` dans `src/lib/legal.ts` à chaque modification des textes.

**Garde-fou** : `next.config.ts` appelle `assertLegalReadyForProduction()` (`src/lib/legalReadiness.ts`).
Sur un déploiement Vercel de production (`VERCEL_ENV=production`), le build échoue tant que
`CONTACT_IS_PLACEHOLDER` vaut `true`, que `CONTACT_PROVIDER` n’est pas renseigné, qu’aucun contrat
de sous-traitance n’est établi avec Vercel (`HOST.dpaApplies`, point 7) ou que « Model Training »
n’est pas désactivé chez Vercel (`VERCEL_MODEL_TRAINING_DISABLED`, point 16), ou que l’éditeur n’a
pas déclaré avoir communiqué son identité à Vercel (`PUBLISHER_IDENTIFIED_TO_HOST`, point 2). Les
builds locaux et les déploiements de prévisualisation ne sont pas bloqués.

## Points non vérifiés (repris de `UNVERIFIED` dans `src/lib/legal.ts`)

- Identification de l’éditeur auprès de Vercel (LCEN art. 1-1, II) : les mentions légales ne publient ni le domicile ni le téléphone de l’éditeur, ce qui suppose qu’il ait communiqué à Vercel son nom, ses prénoms, son domicile et son numéro de téléphone ; rien ne le vérifie automatiquement (PUBLISHER_IDENTIFIED_TO_HOST) ; la mise en production est bloquée tant que ce n’est pas fait.
- Adresse de contact : exemple@gmail.com est une valeur provisoire ; son fournisseur de messagerie (CONTACT_PROVIDER) est à renseigner.
- Téléphone de Vercel Inc. : absent des pages officielles consultées (conditions, politique de confidentialité, DPA, page de contact).
- Offre Vercel et Supabase utilisée (durées des journaux pour les offres gratuites : 1 heure chez Vercel ; chez Supabase, 1 jour pour les journaux de l’API et de la base et 1 heure pour les journaux d’authentification).
- Contrat de sous-traitance avec Vercel en offre Hobby : les sections 1 et 4.1 du DPA de Vercel le limitent aux offres Pro et Enterprise, mais la section 10.1 des conditions de Vercel, communes à toutes les offres, dit que Vercel traite les données conformément à ce DPA, « incorporated by reference ». Les deux textes se contredisent : sans l’offre Pro ou une confirmation écrite de Vercel que le DPA s’applique au compte Hobby (VERCEL_HOBBY_DPA_CONFIRMED_IN_WRITING), l’existence d’un contrat conforme à l’article 28 du RGPD n’est pas établie, et la mise en production est bloquée.
- « Model Training » de Vercel (conditions, section 3) : en offre Hobby, Vercel peut utiliser le contenu du compte pour entraîner ses modèles d’IA et le partager à cette fin, sauf désactivation dans les réglages de l’équipe (VERCEL_MODEL_TRAINING_DISABLED) ; la mise en production est bloquée tant que ce n’est pas fait.
- Inscription active de Vercel Inc. sur la liste officielle du Data Privacy Framework (dataprivacyframework.gov) : déclarée dans la politique de confidentialité de Vercel, non vérifiée sur la liste.
- Modèles d’e-mail de Supabase Auth : vérifier que les modèles « token_hash » sont en place (docs/supabase.md) ; avec les modèles par défaut, le lien reçu par e-mail passe d’abord par Supabase, qui reçoit alors l’adresse IP et le navigateur de la personne (cas signalé sur /confidentialite).
- Région d’exécution des fonctions Vercel du projet (à choisir dans les réglages du projet, puis à renseigner dans HOST.functionRegion). Le proxy (src/proxy.ts) s’exécute, lui, dans toutes les régions de Vercel quel que soit ce réglage (HOST.proxyLocation, d’après la documentation de Vercel) ; la page consultée indique moins de régions en offre Hobby sans en donner la liste.
- Prestataire d’envoi des e-mails de Supabase et sa localisation (liste des sous-traitants de Supabase, au format PDF).

## Sources consultées (7 octobre 2026)

- Vercel : [politique de confidentialité](https://vercel.com/legal/privacy-policy) (Vercel Inc., 440 N
  Barranca Avenue #4133, Covina, CA 91723 ; adhésion au Data Privacy Framework UE–États-Unis),
  [conditions](https://vercel.com/legal/terms) (mises à jour le 1er juin 2026 : section 3, « Model
  Training » en offre Hobby sauf désactivation ; section 10.1, traitement « in accordance with » le
  DPA, « incorporated by reference » ; section 10.4, « System Data » : données de trafic,
  télémétrie, journaux, utilisables par Vercel « for any business purposes », pendant et après le
  contrat, divulgation seulement agrégée ou dépersonnalisée), [DPA](https://vercel.com/legal/dpa) (mis à jour le
  17 mars 2026 ; clauses contractuelles types 2021/914 ; sections 1 et 4.1 : ne s’applique qu’aux
  clients des offres Pro et Enterprise), [journaux d’exécution](https://vercel.com/docs/logs/runtime)
  (conservation : 1 heure en Hobby, 1 jour en Pro),
  [régions des fonctions](https://vercel.com/docs/functions/configuring-functions/region) (page
  mise à jour le 11 août 2026 : par défaut Washington, D.C., `iad1`, pour tout nouveau projet ;
  Paris = `cdg1` ; « Vercel deploys Routing Middleware to all regions by default, regardless of
  your region settings », moins de régions en offre Hobby). Aucun numéro de téléphone sur ces pages ni sur
  la page de contact. Des sites tiers citent des numéros différents : aucun n’est repris.
- Supabase : [conditions](https://supabase.com/terms) (cocontractant sans place de marché :
  Supabase Pte. Ltd., 65 Chulia Street #38-02/03, OCBC Centre, Singapour 049513 ; avec une place
  de marché : Supabase, Inc., Delaware), [DPA](https://supabase.com/legal/dpa) (version du
  1er août 2026, clauses contractuelles types module 2, sous-traitants listés sur
  [cette page](https://supabase.com/legal/customer-resources/subprocessor-list)),
  [confidentialité](https://supabase.com/privacy), [tarifs](https://supabase.com/pricing)
  (consultée le 10 octobre 2026 : ligne « Log retention (API & Database) », 1 jour en offre
  gratuite, 7 jours en Pro ; ligne « Auth Audit Logs » du tableau Auth, 1 heure en offre gratuite,
  7 jours en Pro, 28 jours en Team),
  [sauvegardes](https://supabase.com/docs/guides/platform/backups) (sauvegardes quotidiennes pour
  les offres payantes seulement, conservées 7 jours en Pro),
  [journaux d’audit Auth](https://supabase.com/docs/guides/auth/audit-logs) (exemple d’entrée :
  `timestamp`, `user_id`, `action`, `ip_address`, `user_agent`, `metadata` ; aucune durée indiquée),
  [FAQ « Data Residency and Transfers »](https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq)
  (version 1 du 6 octobre 2026, consultée le 10 octobre 2026 : « Logs are ingested and stored at
  EU-based data centers » ; « Telemetry, logs, and service metadata are processed outside your
  region to operate and secure the platform » ; durées de conservation propres de Supabase non chiffrées).
- LCEN : article 48 de la [loi n° 2024-449 du 21 mai 2024 (SREN)](https://www.legifrance.gouv.fr/jorf/article_jo/JORFARTI000049563632),
  qui crée l’article 1-1 de la LCEN (I : mentions de l’éditeur, dont l’identité de l’hébergeur ;
  II : éditeur non professionnel, qui peut ne publier que le nom et l’adresse de l’hébergeur s’il
  lui a communiqué son identité). L’article 6 ne traite plus que des services intermédiaires.
- CNIL : [adresser une plainte](https://www.cnil.fr/fr/adresser-une-plainte) (service des plaintes,
  3 place de Fontenoy, 75007 Paris).
- Licences : champ `license` et fichier LICENSE de chaque paquet dans `node_modules` ; Natural Earth
  (domaine public) d’après le README de `world-atlas` (Natural Earth 4.1.0).

## À faire avant la mise en ligne

1. **Contact** : remplacez `CONTACT_EMAIL` par une adresse réelle que vous consultez, passez
   `CONTACT_IS_PLACEHOLDER` à `false` et renseignez `CONTACT_PROVIDER` (nom du fournisseur de la
   messagerie, lieu de stockage et mécanisme de transfert éventuel : par exemple, pour Gmail,
   Google, avec un transfert possible vers les États-Unis). Le traitement « Demandes envoyées par
   e-mail » de `/confidentialite` le reprend. Ajoutez aussi ce fournisseur au registre. Le build de
   production échoue tant que ce n’est pas fait (garde-fou ci-dessus).
2. **Identification auprès de l’hébergeur** (LCEN art. 1-1, II) : `/mentions-legales` publie votre
   nom, mais ni votre domicile ni votre téléphone. Un éditeur non professionnel ne peut s’en dispenser
   que s’il a communiqué à l’hébergeur ses éléments d’identification personnelle (art. 1-1, I, 1° :
   nom, prénoms, domicile et numéro de téléphone). **Renseignez votre identité réelle** (nom,
   prénoms, adresse de votre domicile, téléphone) dans les réglages de votre compte Vercel ; si le
   compte n’a pas de champ pour l’adresse ou le téléphone (offre Hobby sans facturation),
   communiquez-les par écrit au support de Vercel. Gardez-en une preuve (capture datée ou e-mail),
   puis passez `PUBLISHER_IDENTIFIED_TO_HOST` à `true` dans `src/lib/legal.ts` : le build de
   production échoue tant que ce n’est pas fait (garde-fou ci-dessus). Sans cette démarche, la
   dispense ne s’applique pas : les mentions légales doivent alors publier votre domicile, votre
   téléphone, et le téléphone de l’hébergeur (art. 1-1, I) ; le manquement est pénalement sanctionné par la LCEN.
   La page énonce la condition sans affirmer qu’elle est remplie.
3. **Téléphone de Vercel** : non exigé pour un éditeur non professionnel (LCEN art. 1-1, II : nom
   et adresse de l’hébergeur), à ajouter s’il est obtenu. Il n’est publié sur aucune page
   officielle consultée ; si vous l’obtenez du support de Vercel, renseignez `HOST.phone`. La page
   indique d’ici là qu’il n’est pas publié.
4. **Offres et durées des journaux** : l’offre Vercel se règle par `VERCEL_PLAN` dans
   `src/lib/legal.ts` (`"hobby"` par défaut) : `HOST.logRetention`, `HOST.transfers` et le lien du
   DPA sur `/confidentialite` en découlent. Si Supabase n’est pas en offre gratuite, corrigez
   `DATA_PROVIDER.logRetention` (journaux de l’API et de la base), `DATA_PROVIDER.authLogRetention`
   (journaux d’authentification) et `DATA_PROVIDER.backupRetention` (sauvegardes de la base).
   L’offre Hobby de Vercel est réservée à un usage personnel non commercial.
5. **Région Vercel** : choisissez la région des fonctions `cdg1` (Paris) dans les réglages du projet
   Vercel, au plus près de la base Supabase (eu-west-3), puis renseignez `HOST.functionRegion`
   (par exemple « Paris, France (cdg1) »). Tant qu’il vaut `null`, `/confidentialite` indique la
   région par défaut de Vercel (Washington, D.C., États-Unis) pour les traitements « Compte »,
   « Cartes » et « Sécurité », dont toutes les données passent par le serveur de l’application.
   Les transferts vers les États-Unis (Vercel Inc., société américaine) restent décrits dans tous
   les cas. Le proxy (`src/proxy.ts` : renouvellement de session à partir des cookies, compteur de
   renouvellement par adresse IP) n’est pas concerné par ce réglage : Vercel le déploie dans toutes
   ses régions, y compris hors de l’Union européenne (`HOST.proxyLocation`, repris sur
   `/confidentialite`). Si la documentation de Vercel évolue, mettez `HOST.proxyLocation` à jour.
6. **Journaux d’authentification de Supabase** : Vérifié le 10 octobre 2026 dans la base du
   projet : la table `auth.audit_log_entries` est vide (0 ligne, aucune adresse IP) alors que des
   connexions ont eu lieu ; le service Auth hébergé n’y écrit pas. Les événements d’authentification
   (identifiant du compte, adresse IP et navigateur à l’origine de la requête — ceux du serveur de
   l’application, ou ceux de la personne à l’ouverture d’un lien au format par défaut — et d’autres
   métadonnées, dont le cas échéant l’adresse e-mail, d’après l’exemple d’entrée de la page « Auth
   Audit Logs ») ne sont que dans les journaux de la plateforme Supabase, hors de la base du
   projet : consultables 1 heure en offre gratuite (7 jours en Pro) d’après la ligne « Auth Audit
   Logs » de la page des tarifs (`DATA_PROVIDER.authLogRetention` ; durée documentée, non constatée
   depuis le projet ; les journaux de l’API et de la base, eux, restent 1 jour, `DATA_PROVIDER.logRetention`),
   stockés dans l’Union européenne et traités hors de la région du projet pour exploiter et
   sécuriser la plateforme d’après la FAQ « Data Residency and Transfers » (`DATA_PROVIDER.logLocation`). C’est ce que décrit `/confidentialite` (traitement « Journaux
   d’hébergement »). Contrôle périodique (et après tout changement d’offre ou de réglage
   **Authentication → Audit Logs**) : `select count(*) from auth.audit_log_entries;`. Si des lignes
   apparaissent (option « Write audit logs to the database » activée), désactivez l’option ou
   décrivez ce journal dans `processing.ts` avec une durée et une purge, et mettez à jour ce point.
7. **DPA et contrat de sous-traitance** (RGPD art. 28) : les textes de Vercel se contredisent pour
   l’offre gratuite Hobby. Le DPA (sections 1 et 4.1) dit ne s’appliquer qu’aux offres **Pro et
   Enterprise** ; les conditions de Vercel (section 10.1), communes à toutes les offres, disent que
   Vercel traite les données « in accordance with » ce DPA, « incorporated by reference ». Tant que ce
   point n’est pas levé, l’existence d’un contrat de sous-traitance conforme à l’article 28 n’est pas
   établie. Or l’article 28 exige un contrat (paragraphe 3) et des garanties suffisantes
   (paragraphe 1) : documenter ce manque ne suffit pas (art. 5, paragraphe 2, et art. 24). Avant la
   mise en ligne, **une des deux solutions est obligatoire** :
   - passer en offre **Pro**, accepter le DPA et en garder une copie, puis `VERCEL_PLAN = "pro"` ;
   - ou obtenir de Vercel une **confirmation écrite** que son DPA (avec ses clauses contractuelles
     types) s’applique au compte Hobby du projet, la conserver, puis
     `VERCEL_HOBBY_DPA_CONFIRMED_IN_WRITING = true`.

   Le build de production échoue tant que ni l’un ni l’autre n’est fait (garde-fou ci-dessus).
   Le transfert vers les États-Unis repose en outre sur l’adhésion déclarée de Vercel Inc. au Data
   Privacy Framework (décision d’adéquation (UE) 2023/1795 du 10 juillet 2023) : vérifiez son
   inscription sur [la liste officielle](https://www.dataprivacyframework.gov/list). Pour Supabase,
   le DPA (version du 1er août 2026) complète ses conditions sans restriction d’offre ; gardez-en une
   copie.
8. **E-mails** : si vous configurez un SMTP personnalisé (recommandé dans `docs/supabase.md`), son
   fournisseur devient un sous-traitant : ajoutez-le aux traitements « Compte utilisateur »
   (`processing.ts`), aux mentions légales et au registre.
9. **Durée des sessions** : l’application plafonne les cookies de Supabase Auth à 30 jours
   (`SESSION_COOKIE_MAX_AGE`, `src/lib/supabase/cookies.ts`, au lieu des 400 jours de
   `@supabase/ssr`), durée qui repart à chaque renouvellement de la session. Vous pouvez en plus
   fixer une durée maximale de session ou un délai d’inactivité côté serveur dans
   **Authentication → Sessions** de Supabase ; mettez alors à jour `processing.ts` et la page
   Cookies si les durées annoncées changent.
10. **Comptes inactifs** : les textes engagent l’éditeur à supprimer manuellement les comptes sans
    connexion depuis 3 ans, après un e-mail de prévenance. Prévoyez un rappel annuel. La colonne
    *Last sign in* de **Authentication → Users** (`last_sign_in_at`) ne suffit pas : elle change à
    l’ouverture d’une session (mot de passe, lien reçu par e-mail), pas forcément au renouvellement
    automatique de la session, alors que le cookie de session repart pour 30 jours à chaque
    renouvellement et que Supabase ne fait pas expirer les sessions par défaut ; une personne qui
    utilise régulièrement le service pourrait y paraître inactive (comportement de Supabase Auth non
    vérifié dans son code). Avant toute suppression, croisez avec la dernière activité des sessions
    (`auth.sessions`, colonnes `refreshed_at` et `updated_at`) et la dernière modification des
    cartes (`public.maps.updated_at`) ; ne retenez que les comptes inactifs selon toutes ces dates.
    Puis e-mail de prévenance, et suppression. Fixer une durée maximale de session (point 9) rend
    aussi `last_sign_in_at` plus fiable.
11. **Droits des personnes** : la page `/compte` permet de télécharger les données du compte
    (fiche du compte et toutes ses cartes, JSON) et de supprimer le compte (immédiat et
    définitif) ; en mode démo, `/espace` permet d’effacer les données du navigateur. Avant la mise
    en ligne, appliquez la migration `20261009120000_delete_my_account.sql` (`docs/supabase.md`,
    section 3) et vérifiez une suppression de bout en bout avec un compte de test : le compte
    disparaît de **Authentication → Users**, ses cartes de `public.maps`. La fonction exige un
    mot de passe saisi depuis moins de 5 minutes : un appel direct à l’API avec un jeton plus ancien
    doit être refusé. Restent à traiter par
    e-mail : changement d’adresse e-mail, limitation, opposition, et copie des données que le
    fichier ne contient pas (sessions, journaux). Répondez dans le délai d’un mois (RGPD art. 12).
    La suppression n’efface ni les sauvegardes de la base (offre Pro) ni les journaux des
    prestataires, qui suivent leurs durées (point 6) ; `/compte` le signale avant la suppression.
12. **Nom de domaine** : activez la protection des données du titulaire (WHOIS) chez le
    registraire, pour ne pas publier votre adresse par ce biais.
13. **Registre** : tenez `docs/registre-traitements.md` à jour à chaque nouveau traitement.
14. **Modèles d’e-mail de Supabase Auth** : mettez en place les modèles « token_hash » de
    `docs/supabase.md` (section 5). Avec les modèles par défaut, le lien reçu par e-mail s’ouvre
    d’abord sur `https://<réf>.supabase.co/auth/v1/verify` : Supabase reçoit alors l’adresse IP et
    le navigateur de la personne et les journalise (journaux de la plateforme Supabase, point 6).
    `/confidentialite` le signale ; les modèles « token_hash » évitent cet accès direct.
15. **Messages reçus** : les textes engagent l’éditeur à supprimer les messages et leurs réponses un
    an après la dernière réponse, et les demandes d’exercice de droits (avec la réponse) cinq ans
    après la réponse (`CONTACT_RETENTION`, `src/features/legal/processing.ts`). Prévoyez un tri
    annuel de la messagerie de contact, en même temps que celui des comptes inactifs (point 10).

16. **Entraînement d’IA de Vercel** : dans les réglages de l’équipe Vercel, désactivez « Model
    Training ». En offre Hobby (et Pro d’essai), les conditions de Vercel (section 3) l’autorisent
    sinon à utiliser le contenu du compte pour entraîner ses modèles d’IA et à le partager avec des
    tiers à cette fin. Puis `VERCEL_MODEL_TRAINING_DISABLED = true` dans `src/lib/legal.ts` (le build
    de production échoue tant que ce n’est pas fait).
17. **Comptes des prestataires** : activez l’authentification à deux facteurs sur les comptes Vercel
    et Supabase de l’éditeur et sur la messagerie de contact (registre, mesures de sécurité des
    traitements 4 et 6).
18. **Information des titulaires d’un compte** : `/conditions` et `/confidentialite` promettent de
    prévenir les titulaires d’un compte avant un changement important des textes, et `/conditions`
    avant une fermeture du service. Aucun code ne le fait : envoyez vous-même un e-mail à la liste des
    comptes (**Authentication → Users**), avant l’entrée en vigueur du changement ou la fermeture, et
    mettez à jour `LEGAL_UPDATED_ON`.

## Ce qui déclencherait d’autres obligations

- Outil de mesure d’audience, publicité, vidéo ou police chargée depuis un autre site, bouton de
  réseau social : consentement préalable (bandeau) sauf exemption précise de la CNIL ; la CSP
  (`src/lib/security/headers.ts`) les bloque aujourd’hui.
- Protection du pare-feu Vercel (Attack Challenge Mode, protection anti-robots) : elle pose dans le
  navigateur un cookie de défi que le code de l’application ne voit pas (nom cité ailleurs :
  `_vcrcs`, absent de la documentation de Vercel consultée, à vérifier), donc que le test
  d’inventaire ne peut pas détecter. Exempté de consentement au titre de la sécurité, il doit quand
  même être décrit : ajoutez-le à `src/features/legal/storageInventory.ts` avec sa durée avant
  d’activer la protection.
- Activité commerciale (dons, abonnement, publicité) : mentions d’un éditeur professionnel
  (adresse, statut, numéro d’immatriculation le cas échéant), conditions générales de vente.
- Contenus publics ou partagés entre utilisateurs : obligations de l’hébergeur de contenus
  (signalement, retrait), modération, mise à jour des conditions.
