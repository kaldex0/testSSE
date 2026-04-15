# Guide utilisateur

Ce guide explique le fonctionnement de l'application côté utilisateur final, ainsi que le parcours complet côté candidat et côté administrateur.

## 1. À quoi sert l'application ?

L'application permet de :
- faire passer un test d'accueil SSE à un candidat,
- enregistrer ses réponses,
- visualiser son résultat,
- permettre à un administrateur de relire, signer et valider le dossier,
- générer un PDF de suivi.

## 2. Parcours candidat (utilisateur)

## 2.1 Accéder au test

1. Ouvrir l'application dans le navigateur.
2. Saisir le code d'accès.
3. Cliquer sur Accéder au test.

## 2.2 Renseigner son identité

Avant de commencer les questions, le candidat doit renseigner :
- son nom,
- son prénom.

Ensuite, il clique sur Commencer le questionnaire.

## 2.3 Répondre aux questions

Le test contient :
- des questions QCM,
- des réponses libres,
- une question pictogrammes.

Pendant le test :
- la barre de progression affiche l'avancement,
- la navigation permet de passer d'une question à l'autre,
- toutes les questions doivent être renseignées avant validation.

## 2.4 Vérification finale

À la fin, le candidat clique sur Vérification finale.

Un écran de résumé s'affiche avec :
- son identité,
- toutes ses réponses.

Le candidat peut :
- revenir au questionnaire pour corriger,
- confirmer et envoyer pour terminer.

## 2.5 Signature candidat

Avant l'envoi final, une signature est demandée.

Le candidat peut :
- signer dans la zone prévue,
- effacer et recommencer,
- utiliser la signature pour valider.

## 2.6 Résultats

Après envoi :
- la page Résultats affiche le score,
- le détail QCM et réponses libres est visible,
- un bouton permet de télécharger le PDF.

## 3. Parcours administrateur

## 3.1 Connexion

1. Aller sur la page admin de l'application.
2. Se connecter avec les identifiants administrateur.

## 3.2 Liste des dossiers

L'administrateur peut :
- rechercher un candidat,
- filtrer par date, score et statut,
- trier la liste,
- naviguer avec la pagination.

## 3.3 Relecture et décision

Sur un dossier sélectionné, l'administrateur peut :
- consulter les informations,
- poser une décision pédagogique (validé / non validé),
- renseigner des observations,
- signer en tant qu'animateur,
- faire évoluer le workflow (À relire / En cours / Clôturer).

Important : la clôture du workflow nécessite la signature animateur.

## 3.4 Prévisualisation et PDF

L'administrateur peut :
- prévisualiser le PDF,
- actualiser la prévisualisation,
- générer le PDF final.

## 4. Règles importantes à retenir

- Un test ne peut pas être envoyé s'il manque des réponses.
- La vérification finale permet de relire avant envoi.
- La signature candidat est nécessaire pour valider la passation.
- Côté admin, la signature animateur est requise pour clôturer le workflow.

## 5. Conseils d'utilisation

- Sur mobile, utiliser les boutons de navigation bas pour avancer/reculer.
- En cas d'erreur de connexion admin, vérifier la session et se reconnecter.
- Si la prévisualisation PDF est vide, utiliser le bouton Actualiser.

## 6. Problèmes fréquents

## 6.1 Je ne peux pas valider le test

Causes possibles :
- au moins une question non renseignée,
- signature candidat non appliquée,
- identité incomplète.

## 6.2 Je ne peux pas clôturer côté admin

Cause probable :
- signature animateur manquante.

## 6.3 Le PDF ne se génère pas

Vérifier :
- que le backend Django est démarré,
- que la connexion API est fonctionnelle,
- que la session admin est encore valide.
