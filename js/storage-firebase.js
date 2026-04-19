// Fichier d'implémentation : Firebase Firestore (Version Collaborative)
// ! Ce code est un template prêt à être utilisé si vous choisissez l'option Firebase !

/*
POUR ACTIVER FIREBASE :
1. Dans le header de index.html, ajoutez (avant vos scripts) :
   <script type="module">
     import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
     import { getFirestore, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, onSnapshot } 
     from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

     const firebaseConfig = {
       apiKey: "VOTRE_API_KEY",
       authDomain: "VOTRE_PROJET.firebaseapp.com",
       projectId: "VOTRE_PROJET",
       // ... autres clés
     };

     const app = initializeApp(firebaseConfig);
     window.db = getFirestore(app);
   </script>

2. Dans app.js, changez APP_CONFIG.syncMode = 'firebase';
*/

window.StorageFirebase = {
    async getParticipants() {
        if (!window.db) {
            console.warn("Firebase non initialisé. Retour fictif.");
            return [];
        }
        // const querySnapshot = await window.getDocs(window.collection(window.db, "participants"));
        // return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return [];
    },

    async addParticipant(participant) {
        if (!window.db) return { ...participant, id: 'temp' };
        // const docRef = await window.addDoc(window.collection(window.db, "participants"), participant);
        // return { id: docRef.id, ...participant };
        return { ...participant, id: 'temp' };
    },

    async updateParticipant(id, updatedData) {
        if (!window.db) return { id, ...updatedData };
        // const docRef = window.doc(window.db, "participants", id);
        // await window.updateDoc(docRef, updatedData);
        return { id, ...updatedData };
    },

    async deleteParticipant(id) {
        if (!window.db) return id;
        // const docRef = window.doc(window.db, "participants", id);
        // await window.deleteDoc(docRef);
        return id;
    },

    async reset() {
        console.warn("La réinitialisation globale sur Firebase doit être gérée avec précaution.");
        return [];
    },

    // Méthode spécifique Firebase : écoute en temps réel
    subscribe(callback) {
        if (!window.db) return;
        // window.onSnapshot(window.collection(window.db, "participants"), (snapshot) => {
        //     const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        //     callback(data);
        // });
    }
};
