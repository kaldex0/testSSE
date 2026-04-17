# Installation et deploiement (potentiel)

Documentation complementaire:
- [ARCHITECTURE_SITE.md](ARCHITECTURE_SITE.md)
- [GUIDE_UTILISATEUR.md](GUIDE_UTILISATEUR.md)

Ce document couvre l'installation locale et des options de deploiement pour le projet complet:
- Frontend: Next.js
- Backend: Django + DRF + JWT
- Base de donnees: PostgreSQL

## 1. Prerequis

- Node.js 20+
- npm 10+
- Python 3.11+
- PostgreSQL 14+

Verification rapide:

```powershell
node -v
npm -v
python --version
psql --version
```

## 2. Structure du projet

- frontend: application web Next.js
- backend: API Django
- reponseQCM.csv: source du QCM
- images: assets utilises dans le PDF

## 3. Installation locale

### 3.1 Backend (Django)

Depuis le dossier backend:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Initialiser la configuration d'environnement locale:

```powershell
Copy-Item .env.example .env
```

Creer la base PostgreSQL (exemple):

```sql
CREATE DATABASE test_accueil;
CREATE USER alexandre WITH PASSWORD 'alexdk1183';
GRANT ALL PRIVILEGES ON DATABASE test_accueil TO alexandre;
```

Appliquer les migrations et creer un compte admin:

```powershell
python manage.py migrate
python manage.py createsuperuser
```

Ce compte superuser sert a:
- se connecter au menu admin applicatif (`/admin` cote frontend),
- se connecter a l'admin Django natif (`http://localhost:8000/admin`) en local.

Demarrer l'API:

```powershell
python manage.py runserver 8000
```

API disponible sur:
- http://localhost:8000

### 3.2 Frontend (Next.js)

Depuis le dossier frontend:

```powershell
cd frontend
npm install
npm run dev
```

Frontend disponible sur:
- http://localhost:3000

## 4. Verification fonctionnelle

- Ouvrir http://localhost:3000
- Passer le questionnaire avec le code d'acces
- Verifier l'envoi vers l'API Django
- Se connecter a l'admin applicatif via /admin (page web du projet)
- Tester:
  - filtres admin (dont type de test)
  - consultation des tests
  - signature animateur
  - previsualisation PDF
  - generation PDF

## 5. Variables de configuration recommandees

Actuellement, la configuration DB Django est en dur dans backend/backend/settings.py.
Pour un deploiement propre, passer en variables d'environnement:

- DJANGO_SECRET_KEY
- DJANGO_DEBUG
- DJANGO_ALLOWED_HOSTS
- DB_NAME
- DB_USER
- DB_PASSWORD
- DB_HOST
- DB_PORT
- CORS_ALLOWED_ORIGINS

Un exemple est disponible dans `backend/.env.example`.

## 6. Deploiement potentiel

## Option A (simple):
- Frontend sur Vercel
- Backend Django sur Render/Railway/Fly.io
- PostgreSQL gere (Render Postgres, Neon, Supabase, Railway)

Etapes haut niveau:
1. Deployer PostgreSQL geree.
2. Deployer le backend Django avec variables d'environnement.
3. Configurer CORS_ALLOWED_ORIGINS avec l'URL du frontend.
4. Deployer le frontend et pointer ses appels API vers l'URL backend publique.

## Option B (classique serveur VPS):
- Nginx (reverse proxy + TLS)
- Gunicorn pour Django
- Next.js build + next start (ou export selon besoin)
- PostgreSQL sur serveur dedie ou managed

Etapes haut niveau:
1. Build frontend: npm run build
2. Lancer frontend: npm run start
3. Lancer backend via Gunicorn
4. Configurer Nginx:
   - / vers Next.js
   - /api vers Django
5. Configurer HTTPS (Let's Encrypt)

## 7. Checklist production minimale

- DEBUG=False
- SECRET_KEY non versionnee
- ALLOWED_HOSTS strict
- CORS strict (pas de wildcard)
- Compte admin fort
- Au moins 1 superuser Django actif (pour le menu admin applicatif)
- Sauvegardes DB automatiques
- Monitoring logs backend/frontend
- Rotation des tokens/credentials

## 8. Commandes utiles

Backend:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
Copy-Item .env.example .env
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver 8000
python manage.py test
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
npm run build
npm run start
```
