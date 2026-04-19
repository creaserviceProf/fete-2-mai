# Organisation Repas & Boissons — 2 mai 🌿

Une petite web-app statique, chaleureuse et élégante pour gérer l'organisation d'un événement (repas partagé, barbecue, garden-party). Elle s'adapte parfaitement sur mobile.

## 🚀 Comment lancer en local

Puisque le projet est entièrement statique :
1. Téléchargez ou clonez le projet.
2. Ouvrez simplement le fichier `index.html` dans votre navigateur (Chrome, Safari, Firefox...).
3. *Alternative* : Utilisez une extension comme "Live Server" sur VSCode pour un auto-rechargement, ou lancez un petit serveur Python (`python -m http.server`) à la racine du projet.

## 🌐 Comment publier sur GitHub Pages (Option A : Simple & Rapide)

Le dépôt est conçu pour fonctionner directement sur GitHub Pages sans étape de "build" complexe.

1. Créez un nouveau dépôt public sur GitHub et envoyez-y les fichiers (`index.html`, dossier `assets`, dossier `js`, etc.).
2. Sur la page GitHub du dépôt, allez dans **Settings**.
3. Dans la barre latérale gauche, cliquez sur **Pages**.
4. Dans la section "Source", sélectionnez la branche **main** (ou master) et enregistrez.
5. Patientez quelques instants : votre site est déployé à l'adresse indiquée en haut.

> [!WARNING]
> Par défaut, l'application est en mode `local` (utilise le LocalStorage du navigateur). Si Alice se connecte sur son téléphone, elle ne verra pas ce que Bob a rentré sur le sien. 

## ⚡️ Comment activer la vraie version collaborative (Option B : Firebase)

Pour que la mise à jour soit en direct entre tous les invités, il faut passer sur Firebase.

1. Créez un projet gratuit sur [Firebase Console](https://console.firebase.google.com/).
2. Ajoutez une application "Web" `</>` et copiez les clés (`firebaseConfig`).
3. Allez dans *Firestore Database*, créez une nouvelle base de données et démarrez en "Mode Test" pour simplifier (règles de sécurité permissives pour 30 jours, suffisant pour un événement).
4. Suivez **les instructions dans l'en-tête du fichier `js/storage-firebase.js`** pour copier le code de connexion Firebase dans votre `index.html`. 
5. Modifier le fichier `js/storage-firebase.js` en dé-commentant les appels `window.getDocs(...)`, `window.addDoc(...)` etc (le code de base est là en commentaire).
6. Dans `js/store.js`, passez la ligne `syncMode: 'local'` à `syncMode: 'firebase'`.

Envoyez les modifications sur GitHub : l'application est maintenant collaborative et en temps-réel !
