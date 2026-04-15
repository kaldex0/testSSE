# Architecture détaillée du site

Ce document explique le fonctionnement du site Test Accueil SSE, son architecture logicielle et les flux principaux.

## 1. Vue d'ensemble

Le projet est une application web complète composée de :
- un frontend Next.js (parcours candidat, résultats, interface admin),
- un backend Django REST (enregistrement, consultation, mise à jour, génération PDF),
- une base PostgreSQL (stockage persistant des soumissions),
- des assets statiques (images, fichier CSV des questions QCM).

Objectif métier :
- faire passer un test d'accueil SSE,
- évaluer les réponses (QCM + questions libres),
- permettre une relecture admin avec signatures,
- produire un PDF final de traçabilité.

## 2. Architecture fonctionnelle

### 2.1 Parcours candidat

1. Saisie du code d'accès.
2. Saisie identité (nom, prénom).
3. Réponse au questionnaire :
   - QCM chargé depuis reponseQCM.csv,
   - questions libres,
   - question pictogrammes.
4. Signature candidat.
5. Vérification finale (résumé des réponses).
6. Envoi de la soumission au backend.
7. Consultation des résultats et téléchargement PDF.

### 2.2 Parcours admin

1. Connexion via JWT (token + refresh token).
2. Consultation de la liste des tests avec :
   - recherche,
   - filtres,
   - tri,
   - pagination.
3. Ouverture d'un dossier candidat.
4. Relecture et décision pédagogique (validé / non validé).
5. Gestion workflow (À relire, En cours, Clôturé).
6. Signature animateur + observations.
7. Preview PDF puis génération du PDF final.

## 3. Architecture technique

### 3.1 Frontend (Next.js App Router)

Répertoire principal : frontend/src/app

Pages :
- / : questionnaire candidat
- /resultats : affichage résultat + téléchargement PDF
- /admin : interface de revue admin

Composants notables :
- SignaturePad (admin) : saisie signature sur canvas
- PdfPreviewPanel (admin) : iframe de prévisualisation PDF

Principes frontend :
- composants client React,
- état local pour le parcours utilisateur,
- persistance locale ponctuelle (localStorage) pour thème/tokens/résultat,
- appels HTTP vers le backend Django.

### 3.2 Backend (Django + DRF)

Application : backend/formulaire

Responsabilités :
- exposition des endpoints REST,
- validation des payloads,
- persistance en base,
- génération PDF avec ReportLab,
- authentification JWT (SimpleJWT).

Routes principales :
- GET / : endpoint racine API (status + index des endpoints)
- POST /api/tests : création d'une soumission
- GET /api/admin/tests : liste admin (auth requise)
- GET/PATCH /api/admin/tests/<id> : détail et mise à jour admin
- GET /api/admin/tests/<id>/pdf : génération PDF admin
- POST /api/pdf : génération PDF depuis payload direct
- POST /api/token : obtention JWT
- POST /api/token/refresh : refresh JWT

### 3.3 Base de données

Modèle principal : TestSubmission
- participant_nom
- participant_prenom
- participant_date
- score20
- stats (JSON)
- qcm_results (JSON)
- free_results (JSON)
- pdf_payload (JSON)
- created_at / updated_at

Le choix JSON permet de conserver la structure métier complète telle qu'utilisée par le frontend et le PDF.

## 4. Flux de données

### 4.1 Soumission candidat

Frontend questionnaire -> POST /api/tests -> table TestSubmission.

Données stockées :
- identité,
- score calculé,
- détails QCM/libres,
- payload PDF initial (signatures, observations, résultat).

### 4.2 Revue admin

Frontend admin :
- lit la liste via GET /api/admin/tests,
- lit un dossier via GET /api/admin/tests/<id>,
- met à jour via PATCH /api/admin/tests/<id>.

Le workflow admin est stocké dans pdf_payload.workflow :
- status: to_review | in_progress | validated
- validatedAt
- validatedBy

Règle métier critique :
- fermeture workflow interdite sans signature animateur.

### 4.3 PDF

Deux usages :
- candidat/résultats : POST /api/pdf (payload fourni)
- admin : GET /api/admin/tests/<id>/pdf (payload depuis DB)

Optimisations présentes :
- compression PDF ReportLab (pageCompression=1),
- mode preview inline via query preview=1,
- cache preview frontend + invalidation sur mise à jour.

## 5. Authentification et sécurité

Auth admin :
- JWT access + refresh,
- relance automatique sur expiration,
- stockage local des tokens côté frontend.

Permissions backend :
- endpoints admin protégés (IsAuthenticated),
- endpoints candidat ouverts (AllowAny) pour passation.

Points de vigilance production :
- sortir les secrets/credentials du code,
- durcir CORS et ALLOWED_HOSTS,
- forcer HTTPS,
- activer logs/monitoring.

## 6. Performance et expérience utilisateur

Optimisations UX/perf déjà en place :
- chargement différé de blocs lourds en admin (dynamic import),
- pagination côté admin,
- prévisualisation PDF optimisée (cache + abort requêtes),
- responsive mobile renforcé sur pages principales.

## 7. Limites actuelles et évolutions recommandées

Limites :
- couverture de tests encore partielle (backend de base, pas encore de suite E2E frontend),
- observabilité encore minimale (logs console sans agrégation ni alerting),
- configuration frontend encore partiellement figée (API base URL en dur côté client).

Évolutions conseillées :
1. ajouter une suite E2E frontend (Playwright/Cypress) sur les parcours candidat et admin,
2. connecter les logs à une stack centralisée (ex: Sentry + agrégation),
3. externaliser aussi la configuration frontend (API URL) via variables d'environnement Next.js,
4. ajouter une CI (lint + tests backend + build frontend),
5. renforcer la sécurité production (rotation secrets, hardening CORS/hosts, monitoring).
