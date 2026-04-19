import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getFirestore, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCFB3dYcxPryD4_y5NJNpgV6Ux-GPCEeQM",
    authDomain: "fete-2-mai-330f1.firebaseapp.com",
    projectId: "fete-2-mai-330f1",
    storageBucket: "fete-2-mai-330f1.firebasestorage.app",
    messagingSenderId: "13623708450",
    appId: "1:13623708450:web:8153fdf2a4dff6c9d9737b",
    measurementId: "G-X50B9KT2QJ"
};

let db = null;
try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
} catch (e) {
    console.warn("⚠️ Attention, Firebase n'est pas encore configuré correctement.");
}

// Implémentation collaborative
window.StorageFirebase = {
    async getParticipants() {
        if (!db) return [];
        try {
            const querySnapshot = await getDocs(collection(db, "participants"));
            return querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) {
            console.error("Erreur lecture Firebase. Avez-vous mis la base en 'Mode Test' ?", e);
            return [];
        }
    },

    async addParticipant(participant) {
        if (!db) { alert("Base de données non configurée"); return participant; }
        const docRef = await addDoc(collection(db, "participants"), participant);
        return { id: docRef.id, ...participant };
    },

    async updateParticipant(id, updatedData) {
        if (!db) return;
        const docRef = doc(db, "participants", id);
        await updateDoc(docRef, updatedData);
        return { id, ...updatedData };
    },

    async deleteParticipant(id) {
        if (!db) return;
        const docRef = doc(db, "participants", id);
        await deleteDoc(docRef);
        return id;
    },

    async reset() {
        if (!db) return [];
        const snapshot = await getDocs(collection(db, "participants"));
        for (const document of snapshot.docs) {
            await deleteDoc(doc(db, "participants", document.id));
        }
        return [];
    },

    subscribe(callback) {
        if (!db) return;
        onSnapshot(collection(db, "participants"), (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(data);
        });
    }
};
