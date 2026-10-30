# Aspect légal — à faire avant la mise en ligne

Stratavault est un projet étudiant non commercial édité par une personne physique (aucune société).
Il a deux auteurs, Islam et Léo Velard ; l’éditeur et directeur de la publication déclaré est
aujourd’hui Léo Velard. Le statut juridique du projet est à revoir (point 23).
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
pas déclaré avoir communiqué son identité à Vercel (`PUBLISHER_IDENTIFIED_TO_HOST`, point 2), ou
que l’examen juridique demandé avant d’ouvrir la carte collective au public n’est pas fait
(`COLLECTIVE_LEGAL_REVIEW_DONE`, points 22 à 25), ou que la date d’entrée en vigueur des textes
changés n’est pas fixée (`TERMS_CHANGE.inForceOn`, point 18). Les builds locaux et les déploiements de
prévisualisation ne sont pas bloqués.

**Contournement accepté par l’éditeur (13 octobre 2026)** : le site a été publié avant que ces points
soient réglés, à la demande expresse de l’éditeur, qui en accepte le risque. La variable
d’environnement Vercel `LEGAL_LAUNCH_OVERRIDE=accepted` (production) fait passer le build en
rappelant chaque point non réglé dans ses journaux, au lieu de le faire échouer. **Supprimez cette
variable dès que les points ci-dessous sont réglés** : le garde-fou redevient alors bloquant.
**Adresse de contact (bêta 2.1)** : le contournement couvre toujours l’adresse provisoire
(exemple@gmail.com, choisie par l’éditeur), comme décidé le 13 octobre 2026. Mais, avec les profils,
les cartes partagées et la carte collective, cette adresse est le point de contact unique, la voie de
signalement et la voie de contestation (DSA, art. 11, 12, 16 et 17) : tant qu’elle n’est pas
remplacée par une adresse que l’éditeur lit (point 1), ces voies ne fonctionnent pas, et les
signalements envoyés par e-mail (qui peuvent contenir des données personnelles) arrivent dans une
boîte qui n’est pas la sienne. Le build le rappelle dans ses journaux. La remplacer est le premier
point à régler avant d’ouvrir les fonctions communautaires au public.
**Carte collective** : `LEGAL_LAUNCH_OVERRIDE=accepted`, déjà actif en production, couvre aussi
`COLLECTIVE_LEGAL_REVIEW_DONE` (le build le rappelle dans ses journaux). Déployer la bêta 2.1 avec
cette variable revient donc à **ouvrir la carte collective à tous les comptes avant l’examen
juridique** des points 22 à 25 : c’est une décision de l’éditeur, à prendre en connaissance de
cause. Pour attendre cet examen, retirez la variable (le build échoue alors tant que les points
listés ne sont pas réglés) ou ne déployez pas la carte collective. Passez
`COLLECTIVE_LEGAL_REVIEW_DONE` à `true` dans `src/lib/legal.ts` seulement une fois l’examen fait.
**Information des comptes** : `LEGAL_LAUNCH_OVERRIDE=accepted` couvre aussi `TERMS_CHANGE.inForceOn`
(le build le rappelle dans ses journaux), mais le garde-fou ne sait pas si l’e-mail est parti.
Déployer la bêta 2.1 avec cette variable sans avoir suivi le point 18 (e-mail à chaque compte au moins
quinze jours avant, avec le texte intégral et la date d’entrée en vigueur) revient donc à **manquer à
la promesse des CGU** (section « Modification des conditions ») : c’est une décision de l’éditeur, à
prendre en connaissance de cause. Pour tenir cette promesse, envoyez l’e-mail, attendez le délai
annoncé, puis déployez à la date annoncée.

## Points non vérifiés (repris de `UNVERIFIED` dans `src/lib/legal.ts`)

- Identification de l’éditeur auprès de Vercel (LCEN art. 1-1, II) : les mentions légales ne publient ni le domicile ni le téléphone de l’éditeur, ce qui suppose qu’il ait communiqué à Vercel son nom, ses prénoms, son domicile et son numéro de téléphone ; rien ne le vérifie automatiquement (PUBLISHER_IDENTIFIED_TO_HOST) ; la mise en production est bloquée tant que ce n’est pas fait.
- Adresse de contact : exemple@gmail.com est une valeur provisoire choisie par l’éditeur ; son fournisseur de messagerie (CONTACT_PROVIDER) est à renseigner. Elle est le point de contact unique et la voie de signalement et de contestation des profils, des cartes partagées et de la carte collective : tant qu’elle n’est pas remplacée par une adresse que l’éditeur lit, ces voies ne fonctionnent pas. La mise en production est bloquée, sauf acceptation explicite par LEGAL_LAUNCH_OVERRIDE (rappelée à chaque build).
- Téléphone de Vercel Inc. : absent des pages officielles consultées (conditions, politique de confidentialité, DPA, page de contact).
- Offre Vercel et Supabase utilisée (durées des journaux pour les offres gratuites : 1 heure chez Vercel ; chez Supabase, 1 jour pour les journaux de l’API et de la base et 1 heure pour les journaux d’authentification).
- Contrat de sous-traitance avec Vercel en offre Hobby : les sections 1 et 4.1 du DPA de Vercel le limitent aux offres Pro et Enterprise, mais la section 10.1 des conditions de Vercel, communes à toutes les offres, dit que Vercel traite les données conformément à ce DPA, « incorporated by reference ». Les deux textes se contredisent : sans l’offre Pro ou une confirmation écrite de Vercel que le DPA s’applique au compte Hobby (VERCEL_HOBBY_DPA_CONFIRMED_IN_WRITING), l’existence d’un contrat conforme à l’article 28 du RGPD n’est pas établie, et la mise en production est bloquée.
- « Model Training » de Vercel (conditions, section 3) : en offre Hobby, Vercel peut utiliser le contenu du compte pour entraîner ses modèles d’IA et le partager à cette fin, sauf désactivation dans les réglages de l’équipe (VERCEL_MODEL_TRAINING_DISABLED) ; la mise en production est bloquée tant que ce n’est pas fait.
- Inscription active de Vercel Inc. sur la liste officielle du Data Privacy Framework (dataprivacyframework.gov) : déclarée dans la politique de confidentialité de Vercel, non vérifiée sur la liste.
- Modèles d’e-mail de Supabase Auth : vérifier que les modèles « token_hash » sont en place (docs/supabase.md) ; avec les modèles par défaut, le lien reçu par e-mail passe d’abord par Supabase, qui reçoit alors l’adresse IP et le navigateur de la personne (cas signalé sur /confidentialite).
- Régions du proxy (src/proxy.ts) : les fonctions du projet s’exécutent à Paris (cdg1, réglage du projet Vercel), mais le proxy s’exécute dans toutes les régions de Vercel quel que soit ce réglage (HOST.proxyLocation, d’après la documentation de Vercel) ; la page consultée indique moins de régions en offre Hobby sans en donner la liste.
- Prestataire d’envoi des e-mails de Supabase et sa localisation (liste des sous-traitants de Supabase, au format PDF).
- Statut juridique du projet : Stratavault a deux auteurs, Islam et Léo Velard ; l’éditeur et directeur de la publication déclaré est Léo Velard, personne physique ; la titularité des droits d’auteur, la répartition des responsabilités entre les deux auteurs et la forme juridique du projet (personne physique, association…) restent à arrêter.
- Application du règlement sur les services numériques (DSA) et de l’article 6 de la LCEN à un projet gratuit et non commercial édité par un particulier : non tranchée (un service de la société de l’information est un service « normalement fourni contre rémunération ») ; le site en applique par prudence les obligations de tout hébergeur (point de contact, signalement, exposé des motifs, information des autorités), à faire confirmer par un juriste.
- Conservation des données d’identification des auteurs de contenus (article 6, V de la LCEN et décret n° 2021-1362 du 20 octobre 2021) : l’application garde le compte de l’auteur de chaque contribution et sa date, mais aucune adresse IP ; à examiner avec un juriste avant d’ouvrir la carte collective au public.
- Examen juridique de la carte collective (statut du projet, données d’identification des auteurs, plateforme en ligne et comptage des destinataires actifs, DSA art. 24.3, réseau social en ligne et moins de 15 ans) : la mise en production est bloquée tant que COLLECTIVE_LEGAL_REVIEW_DONE vaut false, sauf acceptation explicite par LEGAL_LAUNCH_OVERRIDE, rappelée à chaque build.
- Lieu de stockage des avatars (Supabase Storage, compartiment privé « avatars ») : la documentation de Supabase consultée le 29 octobre 2026 donne aux accès S3 de Storage la région du projet (« project_region ») mais ne dit pas expressément que les fichiers sont gardés dans la région de la base (eu-west-3) ; à confirmer dans le tableau de bord (Storage → S3, région affichée) ou auprès de Supabase.
- Réseau social en ligne et moins de 15 ans : avec les profils, les contacts, le partage et la carte collective, le service pourrait être qualifié de « service de réseaux sociaux en ligne » au sens de la loi n° 2023-566 du 7 juillet 2023 (majorité numérique), qui renvoie à la définition du règlement (UE) 2022/1925, article 2, point 7 ; l’entrée en vigueur de son obligation de refuser l’inscription des moins de 15 ans sans autorisation parentale (et de vérifier l’âge), et l’existence d’une loi postérieure sur les réseaux sociaux et les mineurs, n’ont pas été vérifiées sur Légifrance (docs/legal.md, point 25).
- Article 6, IV de la LCEN (version en vigueur relue le 28 octobre 2026) : le relevé confirme l’information des autorités sur les activités illicites signalées, mais pas que l’obligation de rendre publics les moyens consacrés à la lutte contre ces activités (ancien article 6, I, 7) y figure encore ; les mentions légales décrivent ces moyens par prudence, sans affirmer l’obligation.

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
- LCEN, version en vigueur consultée sur [Légifrance](https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000801164)
  le 28 octobre 2026 : article 6 (I : définitions des fournisseurs de services intermédiaires, dont
  l’hébergeur, par renvoi au règlement (UE) 2022/2065 ; IV : obligations des hébergeurs, dont
  l’information prompte des autorités sur les activités illicites qui leur sont signalées, pour une
  liste d’infractions, et, au C, l’information prévue à l’article 18 du DSA ; V : conservation des
  données permettant d’identifier quiconque a contribué à la création d’un contenu, selon un décret
  en Conseil d’État ; VII : signalement abusif, un an d’emprisonnement et 15 000 euros d’amende).
  Article 6 « en vigueur depuis le 26 août 2026 », d’après la page consultée : relisez-le avant la
  mise en ligne, sa numérotation a changé deux fois depuis 2024.
- Règlement (UE) 2022/2065 (DSA) : EUR-Lex n’a pas pu être lu par l’outil utilisé ; articles 16
  (notification et action : éléments a à d d’une notification, accusé de réception, décision et voies
  de recours, traitement diligent et non arbitraire, mention des moyens automatisés), 17 (exposé des
  motifs : mesure, durée, faits et circonstances dont l’origine — notification ou initiative propre —,
  moyens automatisés, fondement légal ou contractuel, voies de recours) et 19 (section 3, propre aux
  plateformes en ligne, inapplicable aux micro et petites entreprises au sens de la recommandation
  2003/361/CE, sauf l’article 24, paragraphe 3) relus sur une reproduction non officielle
  (eu-digital-services-act.com). À vérifier sur [EUR-Lex](https://eur-lex.europa.eu/eli/reg/2022/2065/oj).
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
   production échoue tant que ce n’est pas fait (garde-fou ci-dessus), sauf avec
   `LEGAL_LAUNCH_OVERRIDE=accepted` ; depuis la bêta 2.1, l’adresse est aussi la voie de signalement
   et de contestation : c’est le premier point à régler.
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
    **Toute suppression d’un compte par l’éditeur** (compte inactif, demande reçue par e-mail,
    sanction prévue par les CGU, section « Suspension et suppression ») suit cet ordre, car SQL ne peut
    pas effacer un fichier de Storage et la suppression en cascade ne touche que la base :
    1. retrouvez les fichiers d’avatar du compte (éditeur SQL) :
       `select name from storage.objects where bucket_id = 'avatars' and owner_id = '<uuid>';` ;
    2. supprimez-les depuis **Storage → avatars** dans le tableau de bord (ou par l’API Storage) ;
    3. supprimez l’utilisateur dans **Authentication → Users** : profil, compteurs, autorisations
       d’affichage, contacts, demandes de contact, blocages, partages (membres, invitations, liens,
       usages de liens et verrous de ses cartes, et sa place dans les cartes des autres), éléments de
       la carte collective, signalements (les siens et ceux qui visent ses éléments, avec leurs
       copies : déclencheur `collective_item_ids_author_gone`), avis de modération, suspension,
       désignation de modérateur et cartes partent en cascade ; les décisions de modération (un an)
       et les identifiants d’éléments restent, l’auteur et le modérateur mis à null ;
    4. vérifiez qu’il ne reste aucun fichier orphelin avec la requête de `docs/supabase.md`
       (section 3, « avatars »).
    Sur un projet ancien où la contrainte `storage.objects_owner_fkey` existe encore, l’étape 3
    échoue tant que l’étape 2 n’est pas faite : c’est un garde-fou, pas une panne.
11. **Droits des personnes** : la page `/compte` permet de télécharger les données du compte
    (JSON : fiche du compte, profil avec l’image de l’avatar en base64, autres fichiers d’avatar en
    attente d’effacement, autorisations d’affichage d’avatars, jeton d’envoi d’avatar, contacts,
    demandes de contact et blocages (`contacts`, `contactRequests`, `blockedMembers`), partages de
    cartes (`sharedWithMe`, `mapInvitations`, `mapShares`, `mapLocks`, `mapLinkUses` ; jamais le
    jeton d’un lien), carte collective (`collectiveItems`, `collectiveReports`,
    `collectiveNotices`, `collectiveDecisions`, `collectiveAccount`, `collectiveItemIds`,
    `moderationDecisions`),
    compteurs anti-abus de la base
    `securityCounters`, toutes les cartes) et de supprimer le compte (immédiat et définitif : avatar
    supprimé par l’API Storage, puis profil, contacts, demandes, blocages, partages, éléments,
    signalements (les siens et ceux qui visent ses éléments), avis, suspension et désignation de
    modérateur de la carte collective, compteurs
    et cartes en cascade avec le compte ; ses décisions de modération et ses identifiants
    d’éléments restent, sans son identifiant de compte) ; `/profil` permet de modifier et supprimer le profil et l’avatar ; `/contacts` permet
    d’annuler, de refuser, de retirer, de bloquer et de débloquer ; « Partager » (`/espace/partage/<id>`)
    permet de changer le rôle d’un membre, de le retirer, d’annuler une invitation et de révoquer un
    lien, et « Partagées avec moi » (`/espace`) de refuser une invitation et de quitter une carte ; en mode démo, `/espace` permet d’effacer les
    données du navigateur. Avant la mise
    en ligne, appliquez la migration `20261009120000_delete_my_account.sql` (`docs/supabase.md`,
    section 3). Avant de déployer la bêta 2.1, appliquez aussi, dans cet ordre,
    `20261014120000_maps_doc_v2.sql` puis `20261014120100_maps_cover.sql` : sans la colonne `cover`,
    la banque du mode compte et le téléchargement des données (qui contient le logo de chaque carte)
    échouent ; puis `20261017120000_rate_limits.sql`, `20261017120100_profiles.sql`,
    `20261017120200_avatars.sql` et `20261017120300_delete_my_account_avatars.sql` (profils et
    avatars ; sans eux, « Mon profil » et le téléchargement des données échouent ; le dernier fait
    refuser par la base la suppression d’un compte dont un fichier d’avatar reste dans le
    compartiment), puis `20261018120000_contacts.sql` (contacts ; sans lui, « Contacts »
    échoue), puis `20261019120000_map_sharing.sql` (partage ; sans lui, « Partager », « Partagées
    avec moi » et l’éditeur coopératif échouent), puis `20261020120000_collective_map.sql` (carte
    collective et modération ; sans lui, la carte collective, la section de l’espace et le
    téléchargement des données échouent). Vérifiez une suppression de bout en bout avec un compte de test qui a un
    profil et un avatar : le compte disparaît de **Authentication → Users**, ses cartes de
    `public.maps`, son profil de `public.profiles`, ses compteurs de `public.rate_limits`, ses
    relations de `public.contacts`, `public.contact_requests` et `public.contact_blocks`, ses
    partages de `public.map_members`, `public.map_invitations`, `public.map_links`,
    `public.map_link_uses` et `public.map_locks` (y compris les membres de ses cartes), ses
    éléments, signalements, avis et suspension de la carte collective (`public.collective_items`,
    `public.collective_reports`, `public.collective_notices`, `public.collective_suspensions` ; ses
    décisions et ses identifiants d’éléments restent, sans son identifiant de compte), et aucun
    fichier ne reste à son nom dans le compartiment `avatars` (requête des orphelins de
    `docs/supabase.md`, section 3). La fonction exige un
    mot de passe saisi depuis moins de 5 minutes : un appel direct à l’API avec un jeton plus ancien
    doit être refusé, de même qu’un appel direct (même avec un jeton récent) pour un compte dont un
    fichier d’avatar reste dans le compartiment. Restent à traiter par
    e-mail : changement d’adresse e-mail, limitation, opposition, et copie des données que le
    fichier ne contient pas (sessions, journaux). Répondez dans le délai d’un mois (RGPD art. 12).
    Exceptions au droit d’accès (RGPD art. 15.4), annoncées sur `/confidentialite` : ne communiquez
    jamais les blocages dont le compte fait l’objet (point 20). Les décisions de modération sur ses
    éléments qui révèlent un signalement (classement, retrait par lui-même d’un élément signalé,
    lien signalé supprimé avec son élément) ne sont pas dans l’export, mais se communiquent sur
    demande après examen au cas par cas (point 22). Les signalements qui visent ses éléments
    (`collective_reports`, `collective_report_copies`, y compris le contenu modifié ou retiré depuis)
    ne sont pas non plus dans l’export, et se communiquent de même, sans ce qui identifie la personne
    qui a signalé (marche à suivre au point 22). Les invitations et les liens échus, en attente
    d’effacement (`map_invitations` et `map_links` dont `expires_at` est passé, invisibles dans
    `mapInvitations` et `mapShares`), se lisent dans l’éditeur SQL et se communiquent sur demande (sans
    l’empreinte du jeton d’un lien). Toutes les autres décisions qui visent ses éléments
    sont dans l’export (`collectiveDecisions`, fonction `my_collective_decisions`), même quand leur
    avis a été effacé par la limite de 100 avis : y compris le retrait par lui-même d’un élément
    masqué et la suppression d’un de ses liens masqués avec l’élément auquel il était rattaché.
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
    mettez à jour `LEGAL_UPDATED_ON`. Les CGU (section « Modification des conditions ») annoncent
    l’e-mail **à l’avance**, puis un avis dans l’espace du compte.
    **Bêta 2.1 (textes du 30 octobre 2026)** : les CGU et la politique de confidentialité changent de
    façon importante (profils, contacts, partage, carte collective, signalement et modération). Le
    règlement sur les services numériques (art. 14, paragraphe 2) demande aussi d’informer les
    utilisateurs de tout changement important des conditions, s’il s’applique au service (point 24).
    Procédure :
    1. **fixez la date d’entrée en vigueur** (jour du déploiement de la bêta 2.1 en production, au
       moins quinze jours après l’e-mail : délai choisi, raisonnable pour un service gratuit, à
       confirmer avec le point 23) et inscrivez-la dans `TERMS_CHANGE.inForceOn`
       (`src/features/legal/termsChange.ts`, AAAA-MM-JJ). Tant qu’elle manque, le build de production
       le rappelle (bloquant sans `LEGAL_LAUNCH_OVERRIDE`). Elle s’affiche alors sur `/conditions`
       et `/confidentialite` (« Version du 30 octobre 2026 en vigueur depuis le … ») et dans l’avis de
       l’étape 4. La renseigner ne change pas les textes : `LEGAL_UPDATED_ON` reste au 30 octobre 2026 ;
    2. **avant de déployer**, envoyez depuis l’adresse de contact (point 1) un e-mail à chaque compte
       existant (en copie cachée, ou un par un : jamais les adresses en clair), au moins quinze jours
       avant la date d’entrée en vigueur, avec : cette date ; le résumé des changements (fonctions
       entre membres facultatives, règles de publication, signalement et modération, nouveaux
       traitements de données) ; **le texte intégral des nouvelles conditions d’utilisation et de la
       nouvelle politique de confidentialité**, en pièces jointes (PDF des pages `/conditions` et
       `/confidentialite` de la bêta 2.1, imprimées depuis un build local ou un déploiement de
       prévisualisation, avec la date d’entrée en vigueur renseignée). Jusqu’au déploiement, les
       liens `/conditions` et `/confidentialite` mènent encore aux textes de la v2.0 : l’e-mail le
       précise, et donne ces liens comme adresse des textes à partir de la date d’entrée en vigueur.
       Rappelez enfin qu’on peut télécharger ses données et supprimer son compte depuis `/compte` ;
    3. gardez une preuve de l’envoi (copie du message, pièces jointes comprises, et date), avec la
       liste des comptes prévenus ; déployez à la date annoncée (si elle change, prévenez de nouveau) ;
    4. au déploiement, l’avis « Conditions d’utilisation et politique de confidentialité mises à
       jour » s’affiche dans `/espace` pour les comptes créés avant la fin du jour d’entrée en
       vigueur (date de création lue auprès de l’API Auth ; un compte créé ensuite a accepté les
       nouveaux textes à l’inscription), jusqu’au 31 janvier 2027 inclus
       (`src/features/legal/termsChange.ts`, `TermsChangeNotice`) ; tant que la date d’entrée en
       vigueur n’est pas renseignée, ou si la date de création est inconnue, il s’affiche à tout
       compte connecté. Si le déploiement a lieu après la fin novembre 2026, repoussez `showUntil`
       pour garder deux mois d’affichage au moins. Pour un prochain changement important,
       remplacez son texte et ses dates. Mettez aussi la date de l’entrée Bêta 2.1 de
       `src/data/changelog.ts` (30 octobre 2026 pour l’instant, et son test
       `src/data/changelog.test.ts`) au jour du déploiement ;
    5. si un compte écrit qu’il refuse les nouvelles conditions, rappelez-lui l’export et la
       suppression du compte (ou supprimez-le à sa demande, point 10).
19. **Profils (bêta 2.1)** : les profils (identifiant, nom affiché, présentation, avatar) sont des
    contenus publiés par les membres et visibles des autres comptes connectés. `/confidentialite`
    (traitement « Profil d’un compte ») et le registre les décrivent ; `/conditions` (section « Votre
    profil ») fixe les règles d’un profil (licence limitée à l’affichage aux membres, interdiction de
    l’usurpation d’identité et des contenus illicites), le signalement par e-mail à l’adresse de
    contact et le retrait par l’éditeur avec information du titulaire et motif (par e-mail, voir
    `/conditions#signalement`). La page d’un profil porte un lien « Signaler ce profil », qui ouvre
    un e-mail prérempli à l’adresse de contact (emplacement et éléments d’une notification, DSA
    art. 16.2 : `src/features/legal/reportContent.ts`) ; « Partagées avec moi » et l’éditeur d’une
    carte partagée portent de même « Signaler cette carte ». Le signalement dans l’interface et la
    modération existent pour la carte collective (point 22) ; les obligations d’hébergeur et le statut juridique sont aux points
    23 et 24. Tant que l’adresse de contact est provisoire, le signalement par e-mail n’arrive pas
    à l’éditeur (point 1) : le build de production le rappelle, et échoue sans `LEGAL_LAUNCH_OVERRIDE`. Le crédit de sharp (Apache-2.0, avec libvips sous LGPL-3.0-or-later) figure dans
    les mentions légales : vérifiez qu’il convient à votre lecture des licences.
20. **Contacts (bêta 2.1)** : demandes de contact, contacts et blocages entre membres
    (`/contacts`). `/confidentialite` (traitement « Contacts entre membres ») et le registre les
    décrivent ; `/conditions` (section « Contacts entre membres ») en donne les règles (pas de
    harcèlement ni de sollicitation en masse, blocage sans que l’autre soit averti, signalement par
    e-mail). Rien n’est envoyé par e-mail ni notifié : un membre découvre une demande en ouvrant
    « Contacts ». Un signalement de harcèlement reçu par e-mail se traite comme pour un profil
    (point 19) : l’éditeur peut supprimer le compte en cause (point 10). Pour consulter les relations
    d’un compte à la demande de son titulaire, utilisez l’éditeur SQL (tables `contact_requests`,
    `contacts`, `contact_blocks`) : elles ne sont lisibles par aucun compte par l’API. **Ne révélez
    jamais au titulaire les blocages dont il fait l’objet** (lignes de `contact_blocks` où son compte
    est `blocked_id`) : ni l’export ni l’interface ne les montrent, pour protéger les droits et la
    sécurité du membre qui bloque (RGPD, article 15, paragraphe 4) ; répondez seulement sur ses propres
    blocages (`blocker_id`), et indiquez-lui cette exception (`/confidentialite` l’annonce). Un
    blocage rend les deux profils invisibles l’un à l’autre, sous tout identifiant, et garde seulement
    l’identifiant public du bloqué au moment du blocage, s’il était visible pour le bloqueur
    (`blocked_handle`, sinon vide) : le bloqueur ne voit ni son nouvel identifiant ni un profil
    recréé, et ses recherches, demandes et blocages par identifiant répondent pour le compte bloqué
    comme pour un identifiant inconnu (aucune balise).
    **Blocage depuis la carte collective** : « Bloquer l’auteur », sur la fiche de l’élément d’un autre
    membre (`block_collective_author`, migration `20261020120000_collective_map.sql`), bloque son
    auteur par l’élément, sans passer par son identifiant : il fonctionne même si son profil n’est
    visible que de ses contacts, car l’élément est signé de son identifiant public. C’est le même
    blocage (`contacts_block`) que depuis « Contacts » ou un profil, avec la même limite (50 par jour,
    1 000 au total) ; l’identifiant public de l’auteur, déjà montré avec l’élément, est gardé dans
    `blocked_handle`. Un élément inconnu, masqué, d’un auteur sans profil ou d’un compte avec qui un
    blocage existe donne la même réponse (« not-found »), et l’essai est compté avant la recherche :
    on ne peut pas s’en servir pour savoir qui a bloqué qui. `/conditions` et `/confidentialite`
    (traitement « Contacts entre membres ») le décrivent.
21. **Partage de cartes et coopération (bêta 2.1)** : un membre peut partager une de ses cartes avec
    d’autres comptes (invitation d’un contact ou lien d’invitation, rôle d’éditeur ou de lecteur),
    et plusieurs membres la modifient tour à tour (verrou d’édition). `/confidentialite` (traitement
    « Partage de cartes et coopération ») et le registre (section 2 quater) les décrivent ;
    `/conditions` (section « Cartes partagées ») en donne les règles : le propriétaire reste
    responsable du contenu de ses cartes, chaque membre de ce qu’il y ajoute ; pas de contenu illicite
    ni d’usage pour importuner ; un lien ne se confie qu’à des personnes de confiance ; signalement par
    e-mail. Une carte partagée n’est visible que de ses membres : ce n’est pas une publication au
    public, mais l’éditeur héberge alors des contenus échangés entre tiers ; un signalement reçu se
    traite comme pour un profil (point 19 : information de l’auteur, motif du retrait). Pour consulter
    les partages d’un compte à la demande de son titulaire, utilisez l’éditeur SQL (tables
    `map_members`, `map_invitations`, `map_links`, `map_link_uses`, `map_locks`), aucune n’étant
    lisible par l’API ; un lien ne sert qu’une fois à chaque compte (un membre retiré ne revient pas
    par le lien qu’il a déjà utilisé : seule une nouvelle invitation ou un autre lien le fait revenir) ;
    le jeton d’un lien n’est **jamais** conservé (seule son empreinte), il ne peut donc pas être
    communiqué : le propriétaire révoque le lien et en crée un autre. Le contenu d’une carte partagée
    appartient au compte de son propriétaire : il figure dans **son** export, pas dans celui des
    membres (qui peuvent l’exporter depuis l’éditeur). Supprimer le compte ou le profil du
    propriétaire arrête tous les partages de ses cartes, sans prévenir les membres. Rien n’est
    envoyé par e-mail : une invitation apparaît dans « Partagées avec moi » ; un lien se transmet par
    vos propres moyens.

22. **Carte collective et modération (bêta 2.1)** : une carte commune aux comptes connectés, où
    chaque membre publie des éléments signés de son nom affiché et de son identifiant public
    (unique : le nom affiché peut être porté par plusieurs membres). C’est une **publication à
    destination de tous les membres** : l’éditeur devient hébergeur de contenus de tiers (LCEN,
    art. 6, qui renvoie aux définitions du règlement européen sur les services numériques ; DSA,
    art. 16 et 17 ; voir le point 24). L’inscription étant ouverte à tous sans sélection, la carte
    collective diffuse probablement ces contenus « au public » au sens du DSA (art. 3, i et k,
    considérant 14) : elle relèverait alors de la **plateforme en ligne**, et n’échapperait aux
    obligations de la section 3 (art. 20 à 28) que par l’exemption des micro et petites entreprises
    (art. 19), qui laisse applicable l’art. 24, paragraphe 3 (point 24) ; à faire confirmer par un
    juriste. À faire avant la mise en ligne :
    - **remplacer le texte provisoire de l’avertissement** (COM-02), écrit dans un seul fichier :
      `src/features/collective/warning.ts` (contenus non vérifiés, règles de publication,
      signalement, modération) ; garder `/conditions` (section « Carte collective, signalement et
      modération ») cohérent avec lui ;
    - **désigner les modérateurs** dans l’éditeur SQL (voir `docs/supabase.md`, « Carte collective ») :
      au moins l’éditeur lui-même ; un modérateur ne peut pas décider sur ses propres éléments,
      prévoir donc un second compte pour traiter les signalements visant les vôtres ;
    - **charte des modérateurs** (RGPD art. 29 et 32.4) : un modérateur autre que l’éditeur agit
      sous son autorité et voit des données personnelles (éléments masqués, identifiant public et nom
      affiché des auteurs signalés, même s’ils l’ont bloqué, précisions des signalements, qui
      peuvent contenir des données de tiers, journal avec le nom affiché du modérateur de chaque
      décision). Avant de l’inscrire dans `public.moderators`, faites-lui signer des instructions
      écrites : usage des données pour la seule modération, confidentialité (y compris après la
      fin de la mission), aucune extraction ni copie hors de l’application, aucune décision sur un
      élément où il a un intérêt personnel, signalement à l’éditeur de tout incident ; retrait de la
      désignation en cas de manquement. Conservez la charte signée avec la date de désignation ;
      `/confidentialite` dit aux membres que les modérateurs agissent sous l’autorité de l’éditeur,
      et aux modérateurs que leur nom affiché apparaît au journal vu des autres modérateurs ;
    - **point de contact et signalement** : l’adresse de contact (point 1) sert de point de contact
      unique et de voie de signalement hors application ; un signalement dans l’application arrive
      dans la file `/carte-collective/moderation` (aucune alerte par e-mail : la consulter
      régulièrement ; un contenu manifestement illicite doit être retiré promptement dès qu’il est
      connu) ;
    - **information de l’auteur et motif** : un masquage ou une suppression exige la règle en
      cause, choisie dans la liste des « Motifs de retrait » de `/conditions`
      (`src/features/collective/decisionGrounds.ts`), puis les faits retenus ; pour un **contenu
      illicite**, le formulaire et la Server Action exigent en plus le **texte de loi en cause**
      (5 à 100 caractères, « Fondement légal : … » dans le motif, DSA art. 17.3.d), et les faits
      doivent dire en quoi le contenu y contrevient ; un rétablissement ou un classement porte la
      mention « Aucun manquement aux conditions d’utilisation retenu », suivie des faits retenus. Le
      motif complet est inscrit au journal (un an) et transmis à l’auteur dans l’application
      (« Avis de modération », dont le nombre non lu s’affiche aussi dans `/espace` ; pour une
      suppression, l’avis dit que les liens de l’auteur rattachés à l’élément sont supprimés avec
      lui), ainsi qu’aux membres qui avaient signalé l’élément (décision, motif, titre et sorte de
      l’élément, sans la suspension ; annoncé sur `/confidentialite` et dans les CGU). Exception,
      annoncée dans les CGU, sur `/confidentialite` et dans le formulaire de signalement : si
      l’auteur **supprime son compte** avant la décision, ses éléments et les signalements qui les
      visent partent avec lui (déclencheur `collective_item_ids_author_gone`), sans décision ni avis
      pour les membres qui avaient signalé. Un élément masqué n’est plus montré aux autres membres,
      mais son auteur le voit encore (« Vos éléments masqués », dans « Avis de modération ») et peut
      le supprimer. L’avis d’auteur dit aussi si la décision suit des signalements (et
      combien) ou l’initiative de la modération, qu’elle a été prise par une personne sans
      traitement automatisé, et donne les voies de recours (contestation par e-mail, juridictions
      françaises) ;
    - **récidive** : un masquage ou une suppression peut s’accompagner d’une suspension de 30 jours
      des contributions de l’auteur (CGU, section « Carte collective ») ; un élément modéré ne peut
      pas être recréé sous le même identifiant, et son retrait par l’auteur reste au journal ; mais
      l’auteur peut republier le même contenu sous un autre identifiant tant qu’il n’est pas
      suspendu : surveiller la file et suspendre en cas de récidive ; un auteur qui modifie son
      élément après un signalement ne fait pas disparaître le contenu signalé (la file le montre à
      côté du contenu actuel : décider aussi sur lui), ni en le retirant (il reste dans la file,
      « retiré par son auteur », avec le contenu signalé : le supprimer retient les signalements et
      permet de suspendre l'auteur), et un signalement traité peut être refait si l'élément est
      modifié ensuite ; un élément dont l'auteur a supprimé son profil n'est plus montré aux autres
      membres (jamais de contenu non signé) ;
    - **conservation** : journal des décisions et signalements traités : un an ; suspensions
      échues : effacées. L’effacement est fait par `collective_purge`, appelée à chaque décision et
      à chaque rafraîchissement de la carte (`collective_map_state`, toutes les 30 secondes pour
      tout membre qui l’a ouverte) : sans aucune tâche planifiée, une donnée échue part au premier
      usage de la carte collective qui suit (les textes le disent ; si la carte n’est plus du tout
      utilisée, une tâche `pg_cron` appelant la même purge serait à ajouter) ;
      identifiants d’éléments « modérés » : sans limite (seule façon d’empêcher de republier un
      élément modéré sous le même identifiant ; ni motif ni date) ; à revoir si un avocat recommande
      une autre durée (preuve en cas de litige) ;
    - **statut juridique du projet à revoir** : voir le point 23.
    Pour consulter les données de la carte collective d’un compte à la demande de son titulaire,
    utilisez l’éditeur SQL (`collective_items`, `collective_reports`, `collective_notices`,
    `collective_decisions`, `collective_suspensions`, `collective_item_ids`, `moderators`), aucune
    table n’étant lisible par l’API. L’export du compte contient ses éléments, ses signalements,
    ses avis, sa suspension et sa désignation comme modérateur (`collectiveAccount`), ses
    identifiants d’éléments (`collectiveItemIds`), les décisions qui visent ses éléments
    (`collectiveDecisions`, même si leur avis a été effacé) et, pour un modérateur, ses décisions ;
    il ne contient pas les décisions qui révéleraient un signalement (classement, retrait par
    l’auteur d’un élément signalé, lien signalé supprimé avec son élément). Sur demande par e-mail,
    communiquez-les après un examen au cas par cas (RGPD art. 15.4 ; lignes directrices 01/2022 du
    CEPD : la limitation se pèse pour chaque demande et ne justifie pas de tout refuser quand il
    suffit d’occulter ce qui nuit à autrui) : retirez seulement ce qui permettrait d’identifier la
    personne qui a signalé (faits retenus qui la désignent, date ou contexte si un seul membre a pu
    signaler) ; la table ne contient que le nombre de signalements, jamais leur auteur. Annoncé sur
    `/confidentialite`. Un signalant n’est jamais
    nommé à l’auteur dans l’application, ni le modérateur dans les avis ; pour un signalement par
    e-mail, ne nommez la personne qui signale que si c’est strictement nécessaire (atteinte à ses
    propres droits), comme le disent les CGU.
    **Signalements qui visent les éléments du compte** (`collective_reports`,
    `collective_report_copies`, y compris le contenu modifié ou retiré depuis) : ce sont des données
    sur l’auteur (RGPD art. 15.1), mais ils ne sortent jamais de l’export, qui ne contient que les
    signalements **faits** par le compte ; l’exception est annoncée sur `/confidentialite` et dans le
    fichier. Sur demande par e-mail :
    1. vérifiez que la demande vient de l’adresse du compte, puis relevez l’identifiant du compte
       (**Authentication → Users**) ;
    2. lisez ces signalements dans l’éditeur SQL (ne sélectionnez pas `reporter_id`, sauf pour écarter
       ceux du compte lui-même) :
       ```sql
       select r.item_id, r.item_kind, r.reason, r.details, r.status, r.created_at, r.resolved_at, c.data
       from public.collective_reports as r
       join public.collective_item_ids as u on u.id = r.item_id
       left join public.collective_report_copies as c on c.id = r.copy_id
       where u.author_id = '<identifiant du compte>' and r.reporter_id <> u.author_id;
       ```
    3. examinez chaque ligne (art. 15.4 ; lignes directrices 01/2022 du CEPD) : communiquez le motif,
       l’état, les précisions et le contenu signalé, en retirant seulement ce qui permettrait
       d’identifier la personne qui a signalé (son identifiant de compte, jamais communiqué ;
       précisions ou faits qui la désignent ; date ou contexte si un seul membre a pu signaler) ;
    4. répondez dans le délai d’un mois (art. 12) et gardez une trace de la réponse et de ce qui a été
       retiré, avec son motif. Un signalement traité n’a plus de copie (elle est effacée à la décision) :
       le contenu visé se lit alors, s’il existe encore, dans `collective_items`.

23. **Statut juridique du projet et auteurs (à revoir)** : Stratavault a **deux auteurs, Islam et
    Léo Velard**. Les textes publiés désignent aujourd’hui **Léo Velard**, personne physique, comme
    éditeur, directeur de la publication et responsable du traitement (`PUBLISHER`,
    `src/lib/legal.ts`) ; Islam n’y est pas nommé (son nom complet et son accord pour être publié ne
    sont pas connus). Points à arrêter, de préférence avec un juriste (clinique juridique de
    l’école, par exemple), avant d’ouvrir la carte collective au public :
    - **droits d’auteur** : un code, des textes et un logo créés à deux sont en principe une œuvre de
      collaboration, propriété commune de leurs auteurs (Code de la propriété intellectuelle,
      articles L. 113-2 et L. 113-3) ; les pages légales disent désormais « au profit de leurs
      auteurs », sans nommer personne. Convenez par écrit de qui détient les droits et de qui peut
      autoriser une réutilisation ;
    - **éditeur et directeur de la publication** : une personne physique éditrice répond
      personnellement des obligations de la LCEN et d’hébergeur (point 24) ; si les deux auteurs
      éditent ensemble, ou si une association est créée (elle deviendrait éditrice et responsable du
      traitement), changez `PUBLISHER`, les mentions légales, `/confidentialite` et le registre, et
      prévenez les titulaires d’un compte (point 18) ;
    - **responsable du traitement** : en cas d’édition à deux, une co-responsabilité (RGPD,
      article 26) suppose un accord entre les deux auteurs et son information aux personnes ;
    - **accès d’Islam aux données** : à inventorier par écrit (tableaux de bord Supabase et Vercel,
      messagerie de contact, rôle de modérateur, éditeur SQL). S’il en a, il agit sous l’autorité
      du responsable (RGPD art. 29) : instructions écrites et engagement de confidentialité, comme
      la charte des modérateurs (point 22), et ajout au registre (« Personnes autorisées »).
      `/confidentialite` dit déjà que « l’éditeur » désigne aussi les personnes qu’il autorise, sous
      son autorité. En cas de co-responsabilité (art. 26), l’accord entre les deux auteurs et
      l’information des personnes (art. 26.2) sont à ajouter aux pages ;
    - **examen avant l’ouverture de la carte collective** : une fois ces points et ceux des points 24 et 25
      examinés, passez `COLLECTIVE_LEGAL_REVIEW_DONE` à `true` (garde-fou, en tête de ce document) ;
    - **non commercial** : dons, publicité ou offre payante changeraient le statut (section « Ce qui
      déclencherait d’autres obligations ») et l’offre Hobby de Vercel (point 4).
24. **Obligations d’un hébergeur de contenus de tiers** (profils, cartes partagées, carte
    collective). Le site applique par prudence les obligations de tout hébergeur ; leur application
    exacte à un projet gratuit et non commercial édité par un particulier n’est pas tranchée (le DSA
    vise les services « normalement fournis contre rémunération ») : à faire confirmer. Ce qui est en
    place et ce qui reste à faire :
    - **point de contact unique** (DSA art. 11 et 12) : l’adresse de contact, publiée sur
      `/mentions-legales#signalement`, en **français ou anglais** (`CONTACT_LANGUAGES`) : l’art. 11.3
      exige pour les autorités une langue officielle de l’État d’établissement (le français) et une
      langue « largement comprise par le plus grand nombre possible de citoyens de l’Union »
      (l’anglais) ; il faut donc pouvoir répondre en anglais. L’art. 12 (utilisateurs) n’impose pas
      de langue ; la même adresse sert aux deux. Elle doit être réelle (point 1) ;
    - **notification des contenus illicites** (DSA art. 16) : dans l’application pour la carte
      collective (motif d’une liste fermée ; avec le motif « Contenu illicite », explication d’au
      moins 20 caractères et déclaration de bonne foi exigées par le formulaire, la Server Action et
      la base — contrainte `collective_reports_illegal_details` pour l’explication ; la déclaration
      n’est pas enregistrée à part —, art. 16.2.a et d ; les autres motifs signalent un manquement aux conditions). Ce signalement
      est rattaché au compte, donc à son adresse e-mail, mais **à aucun nom** (art. 16.2.c) : un
      compte n’en contient pas et le formulaire n’en demande pas. Les textes publiés ne le
      présentent donc pas comme une notification complète : ils renvoient à l’e-mail pour une
      notification qui comporte le nom. Traitez-le néanmoins avec diligence (un contenu
      manifestement illicite signalé ainsi est connu). Ajouter un champ « Nom et prénom » au
      formulaire (sauf directive 2011/93/UE) le rendrait complet, à décrire alors dans
      `processing.ts` et le registre ; par e-mail pour tout
      le reste, avec les éléments demandés sur `/mentions-legales` et `/conditions#signalement`
      (nom et adresse e-mail facultatifs pour les contenus des articles 3 à 7 de la directive
      2011/93/UE, art. 16.2.c) ; les liens « Signaler ce profil » et « Signaler cette carte »,
      placés à côté de ces contenus, ouvrent ce message prérempli (art. 16.1 : mécanisme facile
      d’accès). Pour chaque e-mail de
      signalement : **accusé de réception** sans délai, examen diligent et objectif, **décision
      envoyée** à son auteur avec les voies de recours (rien n’est automatisé : c’est à faire à la
      main) ; un contenu manifestement illicite est retiré promptement. **Un e-mail sans nom** (ou
      sous un pseudonyme) n’est pas une notification complète (art. 16.2.c), mais il est examiné
      de même et reçoit **lui aussi** l’accusé de réception et la décision : l’art. 16.5 les lie aux
      coordonnées électroniques de l’expéditeur, que tout e-mail contient ; ne refusez jamais d’y
      répondre faute de nom (les textes publiés le promettent) ;
    - **exposé des motifs** (DSA art. 17) : les avis de modération de la carte collective donnent la
      décision, la durée de la suspension, la règle en cause (liste fermée ; pour un contenu
      illicite, le texte de loi en cause, art. 17.3.d) et les faits retenus,
      l’origine (nombre de signalements ou initiative de la modération), la mention d’une décision
      humaine sans traitement automatisé, l’adresse de contestation et le recours aux juridictions ;
      un classement n’est pas notifié à l’auteur (son élément ne change pas). Pour un profil, une
      carte partagée ou un compte,
      envoyez l’exposé par e-mail à l’adresse du compte (**Authentication → Users**), au plus tard quand
      la mesure prend effet ;
    - **recours** : contestation par e-mail, réexamen par l’éditeur (`/conditions#signalement`).
      Le système interne de réclamation de six mois de l’article 20 (plateformes en ligne) ne
      s’applique pas aux micro et petites entreprises (art. 19) ; si le projet n’en est pas une au
      sens de la recommandation 2003/361/CE, prévoyez-le ;
    - **information des autorités** : infraction pénale qui menace la vie ou la sécurité de personnes
      (DSA art. 18) et activités illicites signalées dans les cas de l’article 6, IV de la LCEN :
      prévenir les autorités compétentes (plateforme PHAROS du ministère de l’Intérieur pour les
      contenus illicites en ligne, ou police et gendarmerie) et consigner la communication dans le
      registre (« Communication aux autorités ») ;
    - **conservation des données d’identification** (LCEN art. 6, V ; décret n° 2021-1362 du
      20 octobre 2021) : l’application garde le compte de l’auteur et la date de chaque contribution
      de la carte collective, mais **aucune adresse IP** ; à examiner avec un juriste avant
      d’ouvrir la carte collective au public (une conservation d’adresses IP serait un nouveau
      traitement, à décrire sur `/confidentialite` et dans le registre) ;
    - **moyens consacrés à la lutte contre les activités illicites** (ancien article 6, I, 7 de la
      LCEN : les rendre publics) : la relecture du 28 octobre 2026 (sources ci-dessus) a confirmé
      l’information des autorités au IV, mais **n’a pas établi** que l’obligation de publier ces
      moyens y figure encore (point non vérifié, `UNVERIFIED`). Ils sont décrits par prudence sur
      `/mentions-legales#signalement` (signalement dans l’application et par e-mail, examen humain,
      modérateurs bénévoles, journal, limites anti-abus), sans affirmer l’obligation : relisez le IV
      sur Légifrance et retirez ce point des non vérifiés une fois tranché ;
    - **rapports de transparence** (DSA art. 15) : non exigés des micro et petites entreprises ;
      à revoir avec le statut (point 23) ;
    - **nombre de destinataires actifs** (DSA art. 24, paragraphe 3) : si la carte collective est une
      plateforme en ligne (point 22), cette obligation reste applicable malgré l’exemption de
      l’art. 19 : communiquer ce nombre au coordinateur (Arcom) ou à la Commission s’ils le
      demandent. Aucun relevé n’existe aujourd’hui (`public.rate_limits` ne garde que la fenêtre en
      cours) : prévoyez une méthode de comptage avant d’ouvrir la carte collective au public
      (`COLLECTIVE_LEGAL_REVIEW_DONE`) ;
    - **mesures sur un profil, une carte partagée ou un compte** : procédures (éditeur SQL et
      tableau de bord) dans `docs/supabase.md`, « Mesures de modération hors carte collective ».
      C’est un traitement à part entière, décrit sur `/confidentialite` (« Modération des profils,
      des cartes partagées et des comptes », `processing.ts`) et au registre (traitement 6 bis) :
      la trace de chaque décision est l’exposé des motifs envoyé, gardé dans la messagerie de
      contact un an après la décision ou la dernière réponse (tri annuel, point 15) ; la décision
      est aussi envoyée à la personne qui a signalé. Le droit d’opposition ne vaut que pour sa part
      fondée sur l’intérêt légitime, pas pour les obligations d’hébergeur (`/confidentialite`,
      « Droit d’opposition ») ;
    - **signalement abusif** : puni par la LCEN (art. 6, VII), rappelé sur `/mentions-legales` ;
    - **coordinateur pour les services numériques** en France : l’Arcom (`DSA.coordinator`).
25. **Réseau social en ligne et moins de 15 ans (bêta 2.1, à examiner avec le point 23)** :
    - **qualification possible** : la loi n° 2023-566 du 7 juillet 2023 (« majorité numérique »)
      vise les « services de réseaux sociaux en ligne », par renvoi à la définition du règlement
      (UE) 2022/1925 (DMA), article 2, point 7 : une plateforme qui permet aux utilisateurs de se
      connecter et de communiquer entre eux, de partager des contenus et de découvrir d’autres
      utilisateurs et contenus. Avant la bêta 2.1, Stratavault n’en était pas un (cartes privées).
      Avec les profils, les contacts, le partage de cartes et surtout la carte collective (contenus
      signés, visibles de tous les membres, qui font découvrir d’autres membres), la qualification
      **devient plausible**, même sans messagerie, fil ni recommandation, et sans annuaire (un
      profil ne se trouve que par son identifiant exact). Par prudence, traitez le service comme
      s’il pouvait en relever ;
    - **ce que cette loi demande** (d’après sa rédaction d’origine, article 6-7 de la LCEN, **non
      vérifiée sur Légifrance**, comme son entrée en vigueur, subordonnée à un décret et à l’avis de
      la Commission européenne, et toute loi postérieure sur les réseaux sociaux et les moins de
      15 ans) : refuser l’inscription d’un mineur de moins de 15 ans sans l’autorisation d’un
      titulaire de l’autorité parentale, vérifier l’âge et cette autorisation par des moyens
      conformes à un référentiel, permettre à ce titulaire de demander la suspension du compte, et
      informer le mineur et ses parents des risques ;
    - **ce qui est en place** : les CGU (« Compte ») et `/confidentialite` (« Âge minimum ») réservent
      le service aux 15 ans et plus, ou avec l’autorisation d’un titulaire de l’autorité parentale
      (`MINIMUM_AGE`), et permettent depuis le 30 octobre 2026 à ce titulaire de demander par e-mail
      la suspension ou la suppression du compte d’un mineur de moins de 15 ans (procédures de
      suspension et de suppression : `docs/supabase.md` et point 10 ; vérifiez raisonnablement la
      qualité du demandeur, sans demander plus que nécessaire). L’âge n’est **pas vérifié** ;
    - **ce qui manque si la loi s’applique** : la vérification de l’âge et de l’autorisation
      parentale, et l’information sur les risques ; si une loi interdit les réseaux sociaux aux
      moins de 15 ans, il faudrait au minimum réserver les fonctions entre membres (profil,
      contacts, partage, carte collective) aux 15 ans et plus, et le dire dans les CGU ;
    - **DSA** : la protection des mineurs sur les plateformes en ligne (art. 28) fait partie de la
      section 3, dont les micro et petites entreprises sont exemptées (art. 19, point 22) ;
    - **RGPD** : l’âge de 15 ans de l’article 45 de la loi Informatique et Libertés vaut pour le
      consentement ; les traitements des comptes reposent sur le contrat (art. 6.1.b), pas sur le
      consentement, mais l’information des mineurs doit rester claire et adaptée (art. 12) ;
    - à trancher avant d’ouvrir la carte collective au public (`COLLECTIVE_LEGAL_REVIEW_DONE`) ;
      point non vérifié repris dans `UNVERIFIED`.

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
- Plateforme en ligne : la carte collective en relève probablement déjà (diffusion à tout membre,
  inscription ouverte : point 22). Elle n’échappe aux obligations de la section 3 du DSA (système
  interne de réclamation, transparence, protection des mineurs…) que par l’exemption des micro et
  petites entreprises (art. 19), qui laisse applicable l’art. 24, paragraphe 3 (point 24). Perdre
  cette exemption (forte audience, statut du projet), rendre des contenus visibles de personnes non
  connectées ou ouvrir une messagerie entre membres imposerait ces obligations et la mise à jour
  des conditions (point 24).
