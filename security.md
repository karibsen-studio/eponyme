# Audit de sécurité Eponyme

Date du constat : 8 août 2026

Dernière mise à jour des correctifs : 8 août 2026

Périmètre : module Nuxt `@karibsen/eponyme`, API Nitro/H3, authentification, rendu public, formulaires, collections, Prisma/PostgreSQL, package `packages/storage`, CLI, playground, dépendances et CI.

## Statut de ce document

Ce fichier est le registre central des risques de sécurité identifiés dans le dépôt. Les constats détaillés conservent l'état initial de l'audit ; les blocs **Correction appliquée** et le tableau de synthèse indiquent l'état actuel après remédiation.

Les statuts utilisés sont :

- **Confirmé** : le chemin vulnérable est démontré dans le code actuel.
- **Conditionnel** : le code ou la version vulnérable est présent, mais l'exploitation dépend de la configuration du site hôte, de son volume de données ou de son exposition réseau.
- **À vérifier en production** : impossible à conclure depuis le dépôt seul.
- **Protection existante** : contrôle déjà correctement présent, conservé ici pour éviter de le casser.
- **Corrigé** : le chemin vulnérable identifié par l'audit a été fermé dans le dépôt et couvert par un contrôle automatisé.

Limite importante : un audit statique ne peut pas prouver l'absence totale de faille. Les règles du reverse proxy, du CDN/WAF, le TLS, les droits PostgreSQL, les sauvegardes, le bucket objet, l'IAM, les variables d'environnement et les en-têtes réellement servis doivent encore être vérifiés sur chaque déploiement.

## Résumé exécutif

Les huit priorités haute/critique du constat initial sont corrigées dans le dépôt :

1. `@nuxt/devtools` est résolu en `3.4.1` et Nuxt en `4.5.2`.
2. Toutes les mutations passent par un lecteur de flux borné avant parsing.
3. Le RichText stocké est désinfecté au démarrage et défensivement à chaque lecture/restauration.
4. Les registres sont sans prototype et leurs lookups utilisent `Object.hasOwn`.
5. Le login et les formulaires utilisent des rate limits atomiques partagés, avec PostgreSQL comme fallback sûr.
6. Les PUT présignés lient la signature au `Content-Length` exact.

| ID | Sévérité | Statut | Constat |
|---|---|---|---|
| SEC-001 | Haute | Corrigé le 8 août 2026 | Lecture, restauration et backfill RichText désinfectés |
| SEC-002 | Haute | Corrigé le 8 août 2026 | Lecteur borné qui annule le flux au seuil sur toutes les mutations |
| SEC-003 | Haute | Corrigé le 8 août 2026 | Rate limits atomiques partagés, quota et rétention des formulaires |
| SEC-004 | Haute | Corrigé le 8 août 2026 | Limites IP/compte/global atomiques sans hard lockout ciblable |
| SEC-005 | Haute | Corrigé le 8 août 2026 | Registres sans prototype et lookups `Object.hasOwn` |
| SEC-006 | Haute | Corrigé le 8 août 2026 | `Content-Length` exact inclus dans la signature PUT |
| SEC-007 | Critique | Corrigé le 8 août 2026 | DevTools résolu en `3.4.1`, serveur vulnérable arrêté |
| SEC-008 | Haute | Corrigé le 8 août 2026 | Nuxt résolu en `4.5.2`, compatibilité minimale `4.5.1` |
| SEC-009 | Moyenne | Confirmé | Requêtes publiques de collection pouvant lire/trier un ensemble entier |
| SEC-010 | Moyenne | Conditionnel | Preview publique same-origin dans une iframe non sandboxée |
| SEC-011 | Moyenne | Confirmé | Un lien déclaré interne peut naviguer vers une origine externe |
| SEC-012 | Moyenne | Conditionnel | Protection clickjacking et en-têtes de sécurité non fournis |
| SEC-013 | Moyenne | Confirmé | Cycle de vie des sessions incomplet et secret bootstrap journalisé |
| SEC-014 | Moyenne | Confirmé | Tout viewer peut lire toutes les soumissions et tout editor peut tout exporter |
| SEC-015 | Moyenne | Confirmé | Historique, sessions, corbeille et soumissions sans politique de rétention |
| SEC-016 | Moyenne | Conditionnel | Médias distants et contenus uploadés insuffisamment contraints |
| SEC-017 | Moyenne | Confirmé | Une dépublication n'est pas une révocation immédiate des caches |
| SEC-018 | Moyenne | Conditionnel | ReDoS possible via un validateur regex configuré sur un formulaire public |
| SEC-019 | Moyenne | Conditionnel | Contrôle CSRF incomplet quand l'en-tête `Origin` est absent |
| SEC-020 | Moyenne | Conditionnel | Contexte HTML et attributs RichText insuffisamment verrouillés |
| SEC-021 | Faible | Confirmé | Options numériques sensibles non validées |
| SEC-022 | Faible | Confirmé | URL mal encodée transformée en erreur 500 |
| SEC-023 | Faible | Confirmé | Actions GitHub référencées par tag mutable |
| SEC-024 | Faible | Conditionnel | CLI dangereux sur un workspace non fiable ou contenant des symlinks |
| SEC-025 | Moyenne | Partiellement corrigé le 8 août 2026 | Audit ramené à 0 critique/haute ; restent 1 modérée et 1 faible dans la chaîne docs/dev |
| SEC-026 | Moyenne | Confirmé | Journal d'audit et alertes de sécurité incomplets |

## Validation de la remédiation haute

- `pnpm test` : **312 tests réussis sur 312 exécutés**, dont le serveur d'intégration Nitro, les formulaires, l'authentification, la sanitation et les registres ; 7 tests Redis live ignorés faute d'URL Redis dédiée.
- `pnpm test:types` et `pnpm lint` : réussis.
- `@eponyme/storage` : **35 tests réussis**, 1 test live explicitement ignoré sans credentials provider ; typecheck réussi.
- `@eponyme/cli` : **5 tests réussis**, typecheck et build réussis.
- test PostgreSQL réel : les 15 migrations passent sur une base neuve puis sur une base legacy ; **9 modèles, 9 tables et version de schéma 2** vérifiés.
- `pnpm audit --json` après régénération des lockfiles : **0 critique, 0 haute, 1 modérée, 1 faible**.
- `git diff --check` : réussi.

## Constats détaillés

### SEC-001: XSS stockée dans les anciennes lignes RichText

- **Sévérité : haute**
- **Statut : corrigé le 8 août 2026**
- **Surface : pages publiques utilisant `EponymeRichText`**

Le sanitizer actuel est strict et est bien exécuté sur les nouvelles écritures : `src/runtime/utils/sanitize-rich-text.ts:14-56`, puis `src/runtime/utils/normalize-eponyme-values.ts:21-35`.

En revanche, `rowToState()` réconcilie les valeurs lues sans les normaliser (`src/runtime/server/services/eponyme-store.ts:610-625`). La validation RichText ne contrôle alors que la longueur (`src/runtime/utils/validate-eponyme-data.ts:315-318`). Les lignes existantes sont donc renvoyées telles quelles, puis injectées via `innerHTML` dans `src/runtime/components/EponymeRichText.ts:18-26`.

`syncAll()` ne traite que les singletons et ne désinfecte pas les collections (`src/runtime/server/services/eponyme-store.ts:519-522`). Aucune migration/backfill de contenu RichText n'a été trouvée. Une ancienne valeur malveillante, une modification manuelle de la DB ou une donnée écrite par une version antérieure reste donc active.

**Impact :** exécution JavaScript persistante sur l'origine du site, actions API avec la session d'un owner/editor qui consulte la page, exfiltration des données accessibles au navigateur et défiguration du site.

**Correction attendue :**

- migrer toutes les colonnes `draft` et `published` de tous les singletons et toutes les collections ;
- considérer aussi l'historique si une version historique peut être prévisualisée ;
- désinfecter à la lecture avant tout `innerHTML`, en défense en profondeur ;
- stocker une version de politique de sanitation pour rendre les futures migrations détectables ;
- tester la migration sur une copie de production et tracer les contenus modifiés.

**Correction appliquée :** `rowToState()` et les lectures/restaurations de versions historiques passent désormais `draft` et `published` dans `normalizeEponymeValues()`. `syncAll()` parcourt aussi toutes les lignes de collections, y compris celles en corbeille, persiste les valeurs désinfectées et invalide leur cache. La régression est couverte dans `test/eponyme-store.test.ts` avec une ancienne charge RichText dangereuse, sa réécriture en base et une ligne de collection supprimée.

### SEC-002: Déni de service mémoire par corps HTTP bufferisé

- **Sévérité : haute**
- **Statut : corrigé le 8 août 2026**
- **Surface : routes publiques de login et de formulaire ; import et mutations authentifiées**

Le login appelle directement `readBody()` sans limite (`src/runtime/server/api/eponyme-auth/login.post.ts:6-9`). La route de formulaire vérifie `Content-Length`, puis appelle `readRawBody()` et ne contrôle la taille réelle qu'après chargement complet (`src/runtime/server/api/eponyme-forms/[path].post.ts:22-28`). L'import reproduit le même schéma (`src/runtime/server/api/eponyme-import.post.ts:15-21`).

H3 matérialise le corps complet pour ces helpers. Un transfert chunked sans `Content-Length`, un header mensonger ou simplement un corps très volumineux force donc le worker à tout garder en mémoire avant le `413`.

**Impact :** saturation mémoire, garbage collection extrême, crash du process et indisponibilité avec une requête non authentifiée sur le login ou un formulaire public.

**Correction attendue :** imposer la limite au reverse proxy/edge et dans un lecteur de stream qui interrompt réellement la lecture au seuil ; définir un plafond distinct pour chaque route ; ajouter timeouts, concurrence maximale et rate limiting. La comparaison après `readRawBody()` ne constitue pas une protection mémoire.

**Correction appliquée :** toutes les routes de mutation utilisent `readEponymeBody()` ou `readEponymeRawBody()` dans `src/runtime/server/utils/body.ts`. Le lecteur vérifie le header quand il existe, compte réellement les octets du stream et annule le reader dès le dépassement. Le login est limité à 4 Kio, les mutations authentifiées à 1 Mio, les imports à leur plafond dédié et chaque formulaire à `maxBodyBytes`. `test/eponyme-body.test.ts` couvre le flux accepté et le `413` avant retour d'une valeur bufferisée. Une limite edge reste requise en production comme première couche.

### SEC-003: Abus illimité des formulaires publics

- **Sévérité : haute**
- **Statut : corrigé le 8 août 2026**
- **Surface : `POST /api/eponyme-forms/**`**

Il s'agit explicitement d'une écriture non authentifiée (`src/runtime/server/api/eponyme-forms/[path].post.ts:7-18`). Le honeypot (`:39-42`) est trivial à omettre et chaque soumission valide crée une ligne PostgreSQL (`src/runtime/server/services/eponyme-form-store.ts:106-115`). Aucun rate limit IP/formulaire/global, quota, CAPTCHA, déduplication, rétention ni limite totale n'est présent.

Les hooks `eponyme:form:beforeSubmit` et `eponyme:form:submitted` peuvent en outre déclencher des emails ou webhooks, ce qui amplifie le coût de l'abus.

**Impact :** spam, croissance DB, coûts email/webhook, surcharge CPU et indisponibilité.

**Correction attendue :** rate limits en edge et côté application, quota par formulaire, rétention automatique, mécanisme anti-bot optionnel, idempotency key ou empreinte de duplication, limites d'appels des hooks et métriques d'abus.

**Correction appliquée :** les formulaires `managed` consomment maintenant deux fenêtres atomiques avant lecture et exécution des hooks : client/formulaire et global/formulaire. Un mount Redis configuré pour le cache est réutilisé quand il expose `INCR`/`PEXPIRE`; PostgreSQL reste le fallback atomique et fail-closed. `submission.maxStored` (10 000 par défaut) borne les lignes et `submission.retentionDays` (365 par défaut) supprime les anciennes données ; le nettoyage s'exécute au démarrage et avant chaque insertion. Le honeypot et la limite de stream restent actifs. La migration `EponymeRateLimit`, les tests d'intégration du quota et les tests unitaires des fenêtres persistantes couvrent ces contrôles. CAPTCHA et limite edge restent des couches optionnelles du site hôte, documentées pour le mode `custom`.

### SEC-004: Brute force et verrouillage de compte fragiles

- **Sévérité : haute**
- **Statut : corrigé le 8 août 2026**
- **Surface : authentification**

Le seuil est de cinq échecs et quinze minutes (`src/runtime/server/services/eponyme-auth-store.ts:7-10`). Les identifiants inexistants ne sont jamais comptés et aucun rate limit IP/global n'existe (`:103-127`). La mise à jour du compteur est un read-modify-write non atomique (`:287-296`) : des requêtes concurrentes peuvent écraser des incréments.

À l'inverse, un attaquant peut volontairement verrouiller un compte connu toutes les quinze minutes. La longueur du mot de passe n'est pas bornée avant le KDF sur le login, ce qui amplifie SEC-002.

**Impact :** password spraying sans limite, contournement du seuil par concurrence et déni de service ciblé sur un owner.

**Correction attendue :** compteurs atomiques/transactionnels, token buckets IP + compte + global, backoff progressif, plafond de longueur avant le KDF, alertes et mécanisme de récupération. Éviter qu'un hard lockout soit lui-même une primitive de DoS.

**Correction appliquée :** le hard lockout ciblable a été retiré. Le login applique des compteurs atomiques partagés par IP et globaux avant le KDF, puis un compteur d'échecs par compte après vérification des identifiants afin qu'un attaquant ne puisse pas empêcher le vrai owner de se connecter. Redis est utilisé lorsqu'il est configuré et joignable, sinon PostgreSQL compte la requête plutôt que de l'autoriser sans contrôle. Les mots de passe de plus de 128 caractères sont rejetés avant `scrypt`. `test/eponyme-auth.test.ts` vérifie qu'une série d'échecs ne verrouille plus un mot de passe valide et que l'entrée démesurée est bornée ; `test/eponyme-rate-limit.test.ts` couvre les compteurs atomiques, le fallback et les fenêtres.

### SEC-005: Clés héritées de `Object.prototype` acceptées comme registres

- **Sévérité : haute**
- **Statut : corrigé le 8 août 2026**
- **Surface : noms de contenu, collections, formulaires et champs JSON**

Les registres sont créés avec `Object.fromEntries()` et conservent `Object.prototype` (`src/runtime/utils/get-eponyme-schemas.ts:16-39`). Les lookups font ensuite `this.schemas[name]`, `this.collections[name]` ou `this.forms[name]` sans `Object.hasOwn` (`src/runtime/server/services/eponyme-store.ts:502-507`, `:851-865`, `src/runtime/server/services/eponyme-form-store.ts:53-55`).

Ainsi `toString`, `constructor` ou `__proto__` renvoient une propriété héritée truthy. Un GET public de singleton peut atteindre `loadSingletonRow()` et créer une ligne DB non configurée (`src/runtime/server/services/eponyme-store.ts:633-642`, `:664-683`, `:811-818`). Les variantes collection/formulaire déclenchent des erreurs 500 en déréférençant une fonction ou un objet qui n'est pas une définition valide.

Le même défaut existe dans la validation de champs (`src/runtime/utils/validate-eponyme-data.ts:85-110`, `:164-168`, `:388-391`) et dans le test `key in definition.fields` des formulaires (`src/runtime/server/services/eponyme-form-store.ts:83-89`).

**Impact :** écriture persistante non autorisée pour un ensemble fini de noms hérités, erreurs 500 répétables, pollution logique des index/configurations et fragilité de validation.

**Correction attendue :** utiliser `Map` ou `Object.create(null)` pour tous les registres, `Object.hasOwn()` pour chaque lookup/membership check et rejeter les clés réservées à la construction de la configuration. Ajouter des tests sur `__proto__`, `prototype`, `constructor`, `toString`, `valueOf` et les variantes imbriquées.

**Correction appliquée :** les registres de schémas, collections et formulaires sont créés avec `Object.create(null)`. Les contrôles de présence du store, de la validation, des formulaires et de la normalisation utilisent `Object.hasOwn()`. Les tests couvrent les prototypes nuls et les charges JSON `constructor`, `toString` et `__proto__`, y compris dans les champs imbriqués, sans écriture DB ni erreur 500.

### SEC-006: Taille non imposée dans les PUT présignés

- **Sévérité : haute**
- **Statut : corrigé le 8 août 2026**
- **Surface : `packages/storage`**

`presignPut(key, meta)` valide `meta.size`, mais ne signe que `content-type` (`packages/storage/src/internal.ts:307-321`). La taille n'est ni incluse dans les headers signés, ni transformée en condition vérifiée par le stockage.

Un client disposant d'une URL présignée peut donc envoyer un objet bien plus gros que la taille déclarée.

**Impact :** contournement des quotas applicatifs, coûts et épuisement du stockage.

**Correction attendue :** préférer un POST présigné avec policy et condition `content-length-range`, ou un endpoint de téléchargement contrôlé qui compte réellement les octets. Si le fournisseur garantit la signature de `Content-Length`, le signer et tester explicitement les transferts chunked ; ne pas considérer le seul `meta.size` comme une limite.

**Correction appliquée :** `presignPut()` signe maintenant `content-length` avec `content-type` et retourne la taille exacte attendue dans les headers. Une requête de taille différente – ou chunked sans le header signé – ne correspond plus à la signature fournisseur. `packages/storage/test/storage.test.ts` vérifie la présence de `content-length` dans `X-Amz-SignedHeaders` et prouve que changer seulement `meta.size` change la signature.

### SEC-007: `@nuxt/devtools@3.2.4` permet une RCE RPC

- **Sévérité : critique**
- **Statut : corrigé le 8 août 2026**
- **Surface : serveur de développement accessible sur le réseau**

Le lock contient `@nuxt/devtools@3.2.4`, déclaré en devDependency (`package.json:89-100`) et activé dans le playground (`playground/nuxt.config.ts:6-11`). L'avis `GHSA-279x-mwfv-vcqv` décrit une exécution de commande arbitraire via RPC sans authentification. La version corrigée est `>= 3.3.1`.

**Impact :** prise de contrôle de la machine du développeur si `nuxt dev` est joignable depuis un réseau non fiable.

**Correction attendue :** mise à jour immédiate, écoute sur loopback uniquement, pare-feu local, désactivation des DevTools hors besoin et interdiction d'exposer un serveur de dev sur Internet/LAN hostile.

**Correction appliquée :** la contrainte passe à `@nuxt/devtools >= 3.3.1` et le lock résout `3.4.1`. Le serveur de développement encore lancé avec `3.2.4` pendant la remédiation a été arrêté ; une relance utilise le lock corrigé. Aucun `@nuxt/devtools@3.2.4` ne reste dans les lockfiles.

### SEC-008: Nuxt `4.4.8` affecté par plusieurs avis de sécurité

- **Sévérité : haute**
- **Statut : corrigé le 8 août 2026**
- **Surface : playground et applications hôtes restant sur la version affectée**

Le playground résout Nuxt `4.4.8` (`playground/package.json:13-18`, `pnpm-lock.yaml`). La version corrigée commune est `>= 4.5.1`.

Avis remontés par l'audit :

| Avis | Niveau npm | Risque | Condition principale |
|---|---|---|---|
| `GHSA-hxcr-hm88-mpq6` | haute | OOM via rendu `v-for` d'island | server islands actifs |
| `GHSA-hxvh-4h3w-prp9` | haute | bypass de route rule/app middleware avec casse mixte | sécurité reposant sur appMiddleware |
| `GHSA-wm8w-6qjm-cv43` | haute | payload SSR d'un utilisateur servi à un autre | page authentifiée sous cache/SWR/ISR |
| `GHSA-9pgf-384g-p7mv` | haute | épuisement CPU avant validation du hash | endpoint server island actif |
| `GHSA-9473-5f9j-94wq` | haute | RCE par template d'island | runtime compiler + sink dynamique |
| `GHSA-48hr-524c-v5w3` | modérée | instanciation de composant non autorisée | server island vulnérable |
| `GHSA-7c4v-fwgw-9rf7` | modérée | fuite du chemin projet/UUID | serveur de dev exposé |

Aucun composant `.server.vue`, aucune activation `componentIslands` et aucun `vue.runtimeCompiler: true` n'ont été trouvés dans le dépôt audité. Les préconditions des avis islands/RCE ne sont donc pas satisfaites par le playground actuel. Cela ne justifie pas de garder la version vulnérable : un consommateur du module peut avoir une configuration différente.

**Correction appliquée :** les dépendances Nuxt, Kit et Schema exigent au moins `4.5.1`, le lock résout Nuxt `4.5.2`, et la compatibilité déclarée du module refuse un hôte antérieur à `4.5.1`. Un override workspace empêche la documentation de réintroduire transitivement `4.4.8`, et le lockfile autonome du playground a été régénéré. `pnpm audit --json` ne remonte plus aucune vulnérabilité haute ou critique après la mise à jour et les overrides transitifs corrigés.

### SEC-009: Coût non borné des listes de collections publiques

- **Sévérité : moyenne**
- **Statut : confirmé ; impact dépendant du volume**
- **Surface : `GET /api/eponyme-collections/**` et sitemap**

`take` est limité à 200, mais `skip` monte jusqu'à `Number.MAX_SAFE_INTEGER` (`src/runtime/server/api/eponyme-collections/[path].get.ts:94-100`). Pour les tris sur titre ou champ JSON, toute la collection correspondante est chargée puis triée avant découpe (`src/runtime/server/services/eponyme-store.ts:903-914`, `:922-934`). Les filtres répétés peuvent aussi construire de grands ensembles `IN`.

Le sitemap charge tous les noms d'une collection (`src/runtime/server/services/eponyme-store.ts:969-1001`). Un `take=1` ne borne donc pas toujours le travail réellement effectué.

**Impact :** scans/offsets coûteux, mémoire et CPU élevés, contention PostgreSQL sous requêtes publiques répétées.

**Correction attendue :** pagination par curseur, plafond raisonnable sur `skip`, limite du nombre/volume de filtres, tris publics uniquement sur colonnes/index SQL ou plafond explicite de lignes scannées, rate limit et métriques de requêtes lentes.

### SEC-010: Iframe de preview same-origin non sandboxée

- **Sévérité : moyenne**
- **Statut : conditionnel**
- **Surface : dashboard**

La preview charge une route publique du site dans une iframe sans `sandbox` (`src/runtime/components/editor/EponymePreviewPanel.vue:115-120`). Elle est same-origin avec le dashboard. Tout script compromis sur la page publique – XSS, script tiers ou composant hôte – peut donc accéder à `window.parent`, au DOM du dashboard et émettre des appels API avec la session courante.

**Impact :** transformation d'une compromission de la page publique en compromission du dashboard.

**Correction attendue :** isoler la preview sur une origine distincte sans cookie d'administration, ou appliquer un `sandbox` minimal et une communication `postMessage` avec validation stricte d'origine. Tester les fonctions nécessaires avant d'ajouter `allow-same-origin` et `allow-scripts`, car leur combinaison sur une page same-origin annule une grande partie de l'isolation.

### SEC-011: Contournement de la frontière lien interne/externe

- **Sévérité : moyenne**
- **Statut : confirmé**
- **Surface : champ `field.url()`**

Un lien interne est accepté dès que sa chaîne commence par `/` ou `#` (`src/runtime/utils/validate-eponyme-data.ts:201-226`). Or `//evil.example`, `///evil.example` et certaines variantes avec backslash sont résolues par `new URL(value, origin)` vers une origine externe. C'est exactement le mécanisme utilisé par l'éditeur (`src/runtime/components/ui/EPLinkEditor.vue:43-48`). Le playground rend ensuite le `href` stocké (`playground/app/pages/index.vue:98-103`).

**Impact :** redirection/phishing et contournement de la politique éditoriale « interne ».

**Correction attendue :** parser relativement à une origine de confiance puis exiger `url.origin === base.origin`, rejeter URLs protocol-relative, backslashes, caractères de contrôle et espaces ambigus, et stocker une forme canonique.

### SEC-012: En-têtes de sécurité et clickjacking non pris en charge

- **Sévérité : moyenne**
- **Statut : conditionnel au site hôte**
- **Surface : dashboard et pages publiques**

Aucun CSP, `frame-ancestors`, `X-Frame-Options`, HSTS, `X-Content-Type-Options`, `Referrer-Policy` ou `Permissions-Policy` n'est posé par le module/playground. Une politique peut exister en infrastructure, mais elle n'est ni garantie ni testée ici.

Le dashboard peut donc être encadré par une origine same-site malveillante ; les cookies `SameSite=Lax` peuvent être envoyés dans ce cas. Le contrôle `Origin` ne bloque pas les clics d'un utilisateur sur l'interface légitime encadrée.

Le module injecte aussi un script inline de bootstrap du thème (`src/module.ts:369-373`) sans mécanisme de nonce. Un host doit alors autoriser l'inline, maintenir un hash exact ou réécrire l'intégration, ce qui complique le déploiement d'une CSP stricte.

**Correction attendue :** `frame-ancestors 'none'` ou allowlist explicite pour le dashboard, HSTS sur HTTPS, `nosniff`, referrer/permissions policy, puis CSP noncée et adaptée aux assets/media réellement nécessaires. Fournir un nonce au bootstrap ou le livrer comme ressource statique. Documenter clairement ce qui relève du module et ce qui relève du host.

### SEC-013: Cycle de vie des sessions et secret bootstrap

- **Sévérité : moyenne**
- **Statut : confirmé**
- **Surface : authentification**

Points positifs : token aléatoire de 32 octets, hash SHA-256 stocké, cookie `HttpOnly`, `SameSite=Lax`, `Secure` en production (`src/runtime/server/utils/auth.ts:33-40`).

Lacunes :

- durée fixe de sept jours sans expiration d'inactivité ni rotation (`src/runtime/server/services/eponyme-auth-store.ts:273-284`) ;
- aucune limite du nombre de sessions par utilisateur ;
- sessions expirées supprimées uniquement si le token expiré est réutilisé (`:129-145`) ;
- cookie au nom générique, sans préfixe `__Host-`, sur tout le chemin `/` ;
- `Secure` dépend de `NODE_ENV === 'production'`, ce qui est fragile pour un staging HTTPS mal configuré ;
- le mot de passe temporaire du premier owner est écrit en clair dans les logs (`:73-100`).

**Impact :** fenêtre longue après vol de token, croissance des sessions et exposition du secret initial aux lecteurs/collecteurs de logs.

**Correction attendue :** rotation, idle timeout, plafond de sessions, job de purge, révocation visible, cookie `__Host-eponyme_session` lorsque possible, option Secure explicite et canal bootstrap à usage unique qui ne traverse pas les logs centralisés.

### SEC-014: Permissions trop larges sur les données sensibles

- **Sévérité : moyenne**
- **Statut : confirmé, peut être un choix produit**
- **Surface : rôles viewer/editor**

Tout utilisateur authentifié, y compris `viewer`, peut lire toutes les soumissions de tous les formulaires (`src/runtime/server/api/eponyme-forms/[path].get.ts:7-25`). Celles-ci peuvent contenir email, téléphone et message. Tout `editor` peut exporter tous les drafts et toutes les collections (`src/runtime/server/api/eponyme-export.get.ts:5-12`). Il n'existe pas de permission par formulaire, collection, entrée ou type de donnée.

**Impact :** exfiltration complète par un compte peu privilégié mais valide, contraire au moindre privilège dans les équipes compartimentées.

**Correction attendue :** formaliser si `viewer` doit voir la PII ; sinon ajouter permissions/scopes, masquer par défaut les soumissions, journaliser consultation/export et exiger éventuellement owner pour l'export intégral.

### SEC-015: Croissance de données sans rétention

- **Sévérité : moyenne**
- **Statut : confirmé**
- **Surface : PostgreSQL**

Chaque sauvegarde ajoute une version (`src/runtime/server/services/eponyme-store.ts:1340-1354`). Les soumissions publiques, sessions, versions, entrées en corbeille et index n'ont pas de durée de rétention automatique dans le schéma (`packages/cli/prisma/schema.prisma:42-98`).

**Impact :** épuisement progressif du stockage, sauvegardes plus lourdes et conservation de PII plus longue que nécessaire.

**Correction attendue :** politiques de rétention configurables, purge planifiée et bornée, limites par site/formulaire/entrée, métriques de croissance et documentation RGPD.

### SEC-016: Médias distants et type de contenu insuffisamment contraints

- **Sévérité : moyenne**
- **Statut : conditionnel**
- **Surface : image, RichText, media player et storage**

Le champ image vérifie seulement le préfixe `http(s)://` (`src/runtime/utils/validate-eponyme-data.ts:19`, `:262-263`). Le sanitizer RichText accepte toute image HTTP(S) (`src/runtime/utils/sanitize-rich-text.ts:33-52`). Le media player accepte une vidéo HTTP(S) de n'importe quel hôte (`src/runtime/utils/media-player.ts:51-56`). Ces ressources sont chargées dans le navigateur : tracking pixel, fuite de referrer/origine, mixed content HTTP et ressources géantes sont possibles.

Le package storage fait confiance au `contentType` fourni. Sans validation des magic bytes, allowlist de MIME et origine asset séparée, un HTML/SVG actif servi inline depuis la même origine peut devenir une XSS stockée dans certaines intégrations.

`normalizeBaseUrl()` autorise également `http:` pour endpoint/public URL (`packages/storage/src/internal.ts:95-107`) : une mauvaise configuration peut exposer requêtes signées et objets en clair.

**Correction attendue :** HTTPS obligatoire par défaut, allowlist d'hôtes optionnelle, referrer policy, proxy d'images si nécessaire, limites de taille, contrôle magic bytes, types dangereux servis en attachment et domaine assets sans cookie ni scripts.

### SEC-017: Dépublication non équivalente à une révocation

- **Sévérité : moyenne**
- **Statut : confirmé**
- **Surface : cache navigateur/CDN**

Les réponses publiées peuvent être conservées par le navigateur et le CDN, avec `stale-while-revalidate` douze fois supérieur à la fenêtre CDN (`src/runtime/server/utils/eponyme-cache.ts:6-45`). Le navigateur ne peut pas être purgé et un purge CDN peut échouer.

**Impact :** un contenu accidentellement publié, secret, diffamatoire ou juridiquement urgent peut rester disponible après dépublication.

**Correction attendue :** documenter que la publication est irréversible pendant `max-age`, proposer un mode sensible à cache nul, rendre les purges observables/retryables et tester chaque CDN. Ne jamais publier de secret en comptant sur une dépublication ultérieure.

### SEC-018: ReDoS via regex configurée

- **Sévérité : moyenne**
- **Statut : conditionnel à une regex vulnérable**
- **Surface : validations personnalisées, notamment formulaires publics**

Une `definition.options.regex` est exécutée directement sur la valeur reçue (`src/runtime/utils/validate-eponyme-data.ts:321-323`). Si un développeur configure une expression catastrophique et n'impose pas un `maxLength` très bas, un visiteur peut bloquer l'event loop avec une chaîne adversariale.

**Correction attendue :** exiger un `maxLength` sur tout champ public avec regex, documenter/tester les regex sûres, éventuellement utiliser un moteur sans backtracking ou refuser les constructions dangereuses.

### SEC-019: Contrôle CSRF incomplet sans `Origin`

- **Sévérité : moyenne**
- **Statut : conditionnel**
- **Surface : mutations authentifiées**

Toutes les mutations privées inspectées appellent correctement `assertEponymeMutationOrigin()`. Mais la fonction autorise explicitement les requêtes qui n'ont pas d'en-tête `Origin` (`src/runtime/server/utils/auth.ts:47-52`). `SameSite=Lax` réduit fortement le risque dans les navigateurs modernes, sans constituer une preuve suffisante pour tous les clients, proxies et scénarios same-site.

**Correction attendue :** sur les requêtes avec cookie, refuser un `Origin` absent sauf canal machine explicitement authentifié ; compléter avec `Sec-Fetch-Site`, origine publique configurée et éventuellement token CSRF. Valider les forwarded headers au proxy.

### SEC-020: Contexte de rendu RichText insuffisamment verrouillé

- **Sévérité : moyenne**
- **Statut : conditionnel**
- **Surface : composant public RichText**

Le sanitizer autorise l'attribut `target` sans limiter sa valeur. Une requête API peut donc stocker `_top` ou `_parent`; seul `_blank` reçoit automatiquement `noopener noreferrer` (`src/runtime/utils/sanitize-rich-text.ts:35-55`, `:76-79`). Cela permet notamment de sortir d'une preview encadrée.

Le composant accepte par ailleurs n'importe quelle chaîne dans la prop `as` puis l'utilise avec `innerHTML` (`src/runtime/components/EponymeRichText.ts:20-25`). Un host qui passe `as="script"` ou `as="style"` place une chaîne pourtant sanitizée dans un contexte actif différent du HTML normal.

**Correction attendue :** allowlist de tags conteneurs inertes (`div`, `section`, `article`, etc.), allowlist de targets (`_self`, `_blank`) et normalisation/rejet serveur des autres valeurs.

### SEC-021: Options numériques sensibles non validées

- **Sévérité : faible**
- **Statut : confirmé, erreur de configuration**
- **Surface : configuration du module et formulaires**

`sessionDurationDays`, `cacheSeconds`, `browserCacheSeconds` et `cdnCacheSeconds` sont copiés vers le runtime sans validation (`src/module.ts:326-334`). `maxBodyBytes` est également accepté tel quel (`src/config/form.ts:22-34`). `NaN`, `Infinity`, valeurs négatives ou démesurées produisent cookies/dates/headers invalides, cache permanent ou limite de formulaire désactivée.

**Correction attendue :** validation au build avec bornes documentées et erreur explicite ; tests sur `NaN`, infini, zéro, négatif et maximum.

### SEC-022: Encodage URI invalide transformé en 500

- **Sévérité : faible**
- **Statut : confirmé**
- **Surface : routes dynamiques**

Plusieurs routes appellent `decodeURIComponent()` directement sur le pathname, par exemple `src/runtime/server/api/eponyme-collections/[path].get.ts:69-71` et les routes history/trash. Un `%` mal formé lève une exception et devient une erreur serveur.

**Impact :** bruit de logs, métriques faussées et petite amplification de disponibilité.

**Correction attendue :** helper de décodage partagé qui renvoie `400`, limite de longueur de chemin et tests de malformed percent encoding.

### SEC-023: Actions GitHub non épinglées par SHA

- **Sévérité : faible**
- **Statut : confirmé**
- **Surface : supply chain CI**

Le workflow utilise `actions/checkout@v6`, `pnpm/action-setup@v4` et `actions/setup-node@v6` par tags majeurs mutables (`.github/workflows/ci.yml:16-20` et répétitions). Aucune permission explicite minimale n'est déclarée.

**Correction attendue :** épingler chaque action sur un commit SHA vérifié, utiliser Dependabot/Renovate pour les mises à jour et déclarer `permissions: contents: read` au niveau workflow, plus les exceptions minimales par job.

### SEC-024: CLI sur workspace non fiable

- **Sévérité : faible**
- **Statut : conditionnel, comportement local**
- **Surface : `@eponyme/cli`**

`check` importe et exécute le module Prisma du projet via Jiti (`packages/cli/src/check.ts:72-79`). C'est attendu pour une CLI de projet, mais équivaut à exécuter du code arbitraire si le dépôt n'est pas fiable.

`init` lit et écrit les chemins fournis et suit les symlinks (`packages/cli/src/init.ts:150-168`). Un workspace malveillant peut rediriger une écriture vers un fichier accessible hors du répertoire attendu.

**Correction attendue :** avertir de ne jamais lancer la CLI sur un dépôt non fiable, refuser les destinations résolues hors `cwd` par défaut et vérifier les symlinks avant écriture, avec un flag explicite pour sortir du projet.

### SEC-025: Dépendances transitives vulnérables

- **Sévérité : moyenne**
- **Statut : partiellement corrigé le 8 août 2026**
- **Surface : installation, build, documentation et playground**

Audit live du 8 août 2026 :

- `pnpm audit --prod --json` : **1 critique, 10 hautes, 4 modérées** sur 1 016 instances de dépendances ;
- `pnpm audit --json` : **3 critiques, 16 hautes, 11 modérées, 2 faibles** sur 1 687 instances.

Ces nombres comptent les chemins/instances, pas uniquement les avis uniques. SEC-007 et SEC-008 couvrent les avis Nuxt/DevTools. Les autres sont :

| Package/version | Avis | Niveau | Version corrigée | Chemin/usage principal |
|---|---|---|---|---|
| `tar@7.5.20` | `GHSA-r292-9mhp-454m` | modérée | `>=7.5.21` | build Nitro/playground |
| `brace-expansion@2.1.2` | `GHSA-mh99-v99m-4gvg` | haute | `>=2.1.3` | glob build |
| `brace-expansion@5.0.7` | `GHSA-mh99-v99m-4gvg` | haute | `>=5.0.8` | glob build |
| `brace-expansion@2.1.2` | `GHSA-rgw5-rvv9-x895` | haute | `>=2.1.4` | glob build |
| `brace-expansion@5.0.7` | `GHSA-rgw5-rvv9-x895` | haute | `>=5.0.9` | glob build |
| `postcss@8.5.19` | `GHSA-fxqj-rqcc-2cmp` | modérée | `>=8.5.23` | chaîne `@karibsen/ui`/Vite |
| `nanoid@3.3.16` | `GHSA-2v37-7h3g-55p8` | haute | `>=3.3.17` | chaîne PostCSS/Vite |
| `esbuild@0.27.7` | `GHSA-g7r4-m6w7-qqqr` | faible | `>=0.28.1` | docs/dev Windows |
| `js-yaml@4.3.0` | `GHSA-5p4m-2wfm-xmqj` | haute | `>=4.3.1` | documentation |
| `dompurify@3.4.12` | `GHSA-55q2-fjhq-7xh7` | modérée | `>=3.4.13` | docs/Mermaid |
| `mermaid@11.16.0` | `GHSA-c4c3-pg64-4m4v` | faible | `>=11.16.1` | documentation |
| `mermaid@11.16.0` | `GHSA-6x64-9x62-f2gx` | modérée | `>=11.16.1` | documentation |
| `mermaid@11.16.0` | `GHSA-3rrr-jr9j-h3q3` | modérée | `>=11.16.1` | documentation |
| `mermaid@11.16.0` | `GHSA-2v8p-3f2j-5mp7` | modérée | `>=11.16.1` | documentation |
| `mermaid@11.16.0` | `GHSA-rhh3-jpg6-66xh` | modérée | `>=11.16.1` | documentation |

Les packages de build ne sont pas automatiquement exploitables à distance dans le serveur publié. Ils restent importants : CI, machine développeur, documentation et applications hôtes peuvent traiter des entrées non fiables.

**Correction attendue :** mettre à jour les dépendances directes, régénérer le lockfile, relancer les deux audits, examiner chaque override nécessaire et ne jamais masquer un avis uniquement parce qu'il est transitif.

**État après remédiation :** Nuxt, DevTools, `tar`, `brace-expansion`, `nanoid`, `js-yaml`, `dompurify` et `mermaid` sont résolus sur des versions corrigées dans les lockfiles. L'audit complet est passé de 3 critiques/16 hautes/11 modérées/2 faibles à **0 critique/0 haute/1 modérée/1 faible**. Les deux avis restants concernent `postcss` dans la chaîne DevTools et `esbuild` dans la documentation sous Windows ; ils restent suivis dans cette entrée moyenne et n'empêchent pas la clôture des sévérités hautes.

### SEC-026: Journal d'audit et alertes incomplets

- **Sévérité : moyenne**
- **Statut : confirmé**
- **Surface : détection et réponse à incident**

Les versions de contenu conservent l'acteur pour certaines écritures, mais il n'existe pas de journal de sécurité complet pour connexions, échecs, lockouts, exports, consultation/suppression de soumissions, création/modification d'utilisateurs, changements de rôle, purge et import. Il n'existe pas non plus d'alerte intégrée sur le brute force, la croissance anormale des formulaires ou une vague d'erreurs 413/429/500.

**Impact :** incident difficile à détecter, investiguer et attribuer ; absence de preuve sur les accès à la PII.

**Correction attendue :** événements structurés sans secret ni contenu sensible, identifiant de requête, acteur, action, cible, résultat et origine réseau hachée/retentie selon politique ; alertes et durée de conservation séparée du contenu métier.

## Protections déjà présentes à préserver

- Toutes les mutations privées inspectées vérifient la session côté serveur et appellent le contrôle d'origine.
- Les rôles editor/owner sont contrôlés sur le serveur ; le dernier owner actif est protégé transactionnellement.
- Les tokens de session sont aléatoires, seuls leurs hashes sont stockés, et les cookies sont `HttpOnly`/`SameSite=Lax` avec `Secure` en production.
- Les mots de passe utilisent scrypt, une comparaison timing-safe et un hash factice pour réduire l'oracle d'existence ; un changement/reset révoque les sessions.
- Drafts, historique, utilisateurs, soumissions et preview reçoivent par défaut `Cache-Control: no-store` via `src/runtime/server/middleware/eponyme-no-store.ts:5-28`.
- Les pages publiques ne reçoivent pas les colonnes draft dans les listes publiées.
- Les nouvelles écritures RichText sont sanitizées côté serveur avec une allowlist stricte ; les variables injectées dans le RichText sont échappées (`src/runtime/utils/variables.ts:80-104`).
- Le registre d'erreurs de validation a un prototype nul (`src/runtime/utils/validate-eponyme-data.ts:24-30`).
- Les URLs de storage rejettent credentials, query et fragment ; les expirations présignées sont bornées.
- Les requêtes SQL brutes trouvées dans la CLI sont des constantes et aucun input utilisateur n'y est interpolé.
- Aucun `.env`, fichier PEM, clé privée ou secret réel versionné n'a été trouvé dans l'état et l'historique Git inspectés ; seules des valeurs d'exemple ont été observées.
- Aucun chemin SSRF distant contrôlé par un visiteur n'a été trouvé dans le serveur Eponyme ; les médias HTTP(S) sont chargés par le navigateur. Le `endpoint` storage est une configuration développeur.

## Vérifications runtime restant obligatoires

Ces points ne peuvent pas être déclarés sûrs depuis ce dépôt :

- limite de corps et timeouts réellement imposés par proxy/CDN/serverless ;
- rate limits WAF/edge existants sur login, formulaires, collections et islands ;
- en-têtes finaux de chaque page/API, CSP effective et comportement iframe ;
- exposition réseau réelle des serveurs de développement ;
- version réellement déployée de Nuxt/DevTools et purge des caches après mise à jour ;
- présence de RichText historique dangereux dans chaque base existante ;
- TLS/HSTS, forwarded headers et origine canonique derrière proxy ;
- rôle PostgreSQL minimal, chiffrement disque/backups, rotation des credentials et accès aux logs ;
- CORS au niveau du host/proxy ;
- politiques IAM/bucket, blocage public, CORS storage, chiffrement et quotas ;
- MIME et `Content-Disposition` réellement servis par le domaine d'assets ;
- secrets éventuellement présents dans les variables CI/CD, anciennes releases npm, images Docker ou artefacts externes ;
- dépendances et headers propres à chaque application consommatrice du module.

## Ordre de remédiation restant

### P0: clôturé dans le dépôt le 8 août 2026

- SEC-001 à SEC-008 : corrections applicatives, migrations, dépendances et tests terminés.
- Restent à confirmer par déploiement : limites edge/WAF, versions réellement déployées et configuration provider des uploads.

### P1: avant montée en charge ou ouverture à une équipe élargie

- SEC-009, SEC-010, SEC-011, SEC-012, SEC-013, SEC-014, SEC-015, SEC-016, SEC-019, SEC-020 et SEC-026.

### P2: durcissement continu

- SEC-017, SEC-018, SEC-021, SEC-022, SEC-023, SEC-024 et SEC-025.

## Commandes et méthode utilisées

- cartographie de toutes les routes `src/runtime/server/api` et classification public/authentifié/rôle ;
- recherche des sinks `innerHTML`, URLs, fetch, imports exécutables, raw SQL, filesystem et process ;
- suivi des chemins lecture/écriture/normalisation RichText et draft/published/history ;
- inspection des modèles Prisma, services, cache, formulaire, auth, storage, CLI et workflow CI ;
- scan du dépôt et de l'historique pour `.env`, clés privées et secrets évidents ;
- `pnpm audit --prod --json` ;
- `pnpm audit --json` ;
- vérifications ciblées de résolution URL et des propriétés héritées de `Object.prototype`.

Après chaque correction, ajouter un test de non-régression correspondant et mettre à jour le statut de l'entrée dans ce fichier sans supprimer l'historique du constat.
