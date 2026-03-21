# VibeLoop — Guide de mise en ligne (GitHub + Supabase, 100% gratuit)

## Ce dont tu as besoin
- Un compte GitHub (gratuit) → https://github.com
- Un compte Supabase (gratuit) → https://supabase.com
- C'est tout. Zéro serveur, zéro autre outil.

---

## ÉTAPE 1 — Supabase (5 min)

1. Connecte-toi sur https://supabase.com
2. Clique **New project** → donne un nom → attends 1 min
3. Va dans **SQL Editor** → **New query**
4. Copie-colle tout le contenu de `supabase_setup.sql` → clique **Run**
5. Active pg_cron : **Database → Extensions → pg_cron → Enable**
6. Récupère tes clés dans **Project Settings → API** :
   - `Project URL` → copie cette valeur
   - `anon public` key → copie cette valeur

---

## ÉTAPE 2 — Colle tes clés dans index.html (1 min)

Ouvre `index.html` et remplace les 2 lignes au début du script :

```js
const SUPABASE_URL  = 'REMPLACE_PAR_TON_URL_SUPABASE'
const SUPABASE_ANON = 'REMPLACE_PAR_TA_CLE_ANON'
```

Par tes vraies valeurs, exemple :
```js
const SUPABASE_URL  = 'https://abcdefgh.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIs...'
```

---

## ÉTAPE 3 — GitHub Pages (3 min)

1. Va sur https://github.com → **New repository**
2. Donne un nom (ex: `vibeloop`)
3. Mets le repo en **Public**
4. Upload le fichier `index.html` dans le repo
5. Va dans **Settings → Pages**
6. Source : **Deploy from a branch** → branch `main` → dossier `/root`
7. Clique **Save**
8. Ton site est en ligne à : `https://ton-username.github.io/vibeloop`

---

## Ce qui est inclus

| Fonctionnalité | Détail |
|---|---|
| 🔞 Vérification d'âge | Bloque les moins de 18 ans à l'entrée |
| 🌍 Bilingue FR/EN | Bouton de langue sur la page d'accueil |
| 📹 Feed vidéo | Scroll vertical style TikTok |
| ⚡ Stories 24h | Expiration automatique + pg_cron |
| 🗜️ Compression locale | FFmpeg.wasm — tourne dans le navigateur |
| 🚫 Mots interdits | Liste noire FR+EN sur titres/descriptions |
| ⚑ Signalements | 3 signalements → vidéo cachée automatiquement |
| ❤️ Likes | Système de likes en temps réel |
| 👁️ Vues | Compteur de vues automatique |
| 👤 Auth | Inscription / Connexion email |
| 🗑️ Suppression | L'auteur peut supprimer sa propre vidéo |

---

## Limites du plan gratuit Supabase

| Ressource | Limite | Équivalent |
|---|---|---|
| Storage | 1 GB | ~300 vidéos compressées |
| DB | 500 MB | 100 000+ entrées |
| Bandwidth | 5 GB/mois | ~1000 visionnages/jour |
| Utilisateurs | Illimité | ✅ |

---

## Modifier les limites

**Changer la limite de vidéos** (défaut : 5) :
→ Dans `supabase_setup.sql`, cherche `>= 5` et change le chiffre
→ Dans `index.html`, cherche `count>=5` et change le chiffre

**Changer la durée des stories** (défaut : 24h) :
→ Dans `supabase_setup.sql`, cherche `INTERVAL '24 hours'`

**Changer la durée max des vidéos** (défaut : 60s) :
→ Dans `index.html`, cherche `maxSec = uploadMode==='story'?'10':'60'`

**Ajouter des mots interdits** :
→ Dans `index.html`, cherche `BANNED_WORDS` et ajoute à la liste

---

## En tant qu'admin — modérer manuellement

Va dans **Supabase → Table Editor → videos** pour :
- Voir toutes les vidéos
- Changer `status` à `flagged` pour cacher une vidéo
- Voir les signalements dans la table `reports`
