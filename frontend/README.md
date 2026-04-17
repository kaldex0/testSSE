# Frontend

La documentation complete d'installation et de deploiement du projet (frontend + backend) est disponible ici:

- [INSTALLATION_DEPLOIEMENT.md](../INSTALLATION_DEPLOIEMENT.md)

La documentation detaillee de l'architecture du site est disponible ici:

- [ARCHITECTURE_SITE.md](../ARCHITECTURE_SITE.md)

La documentation utilisateur (fonctionnement et parcours) est disponible ici:

- [GUIDE_UTILISATEUR.md](../GUIDE_UTILISATEUR.md)

Commandes rapides frontend:

```bash
npm install
npm run dev
```

Acces au menu admin applicatif (`/admin`):

- Le login utilise un compte utilisateur Django.
- Si aucun compte admin n'existe, creer un superuser cote backend:

```bash
cd ../backend
python manage.py createsuperuser
```
