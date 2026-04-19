// Fichier d'implémentation : LocalStorage (Mode par défaut)

const LOCAL_STORAGE_KEY = 'fete_2mai_participants';

const initialDemoData = [
    {
        id: '1',
        name: 'Alice Dupont',
        presence: 'oui',
        accompagne: true,
        guestsCount: 1,
        foods: [{ category: 'Desserts', detail: 'Tarte aux fraises', qty: 2 }],
        drinks: [{ category: 'Vins', detail: 'Bouteille rouge', qty: 2 }],
        comment: 'Je peux aider à installer.'
    },
    {
        id: '2',
        name: 'Bob Martin',
        presence: 'oui',
        accompagne: false,
        guestsCount: 0,
        foods: [{ category: 'Grillades', detail: 'Saucisses et merguez', qty: 10 }],
        drinks: [{ category: 'Bières', detail: 'Pack de 1664', qty: 1 }],
        comment: ''
    },
    {
        id: '3',
        name: 'Charlie (et Léa)',
        presence: 'attente',
        accompagne: true,
        guestsCount: 1,
        foods: [{ category: 'Apéro', detail: 'Chips et cacahuètes', qty: 3 }],
        drinks: [{ category: 'Jus / softs', detail: 'Coca Cola', qty: 2 }],
        comment: 'On confirmera la semaine prochaine.'
    }
];

window.StorageLocal = {
    async getParticipants() {
        const data = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (!data) {
            // Initialiser avec les données de démo
            this.saveAll(initialDemoData);
            return initialDemoData;
        }
        return JSON.parse(data);
    },

    async addParticipant(participant) {
        const participants = await this.getParticipants();
        const newPart = { ...participant, id: Date.now().toString() };
        participants.push(newPart);
        this.saveAll(participants);
        return newPart;
    },

    async updateParticipant(id, updatedData) {
        let participants = await this.getParticipants();
        participants = participants.map(p => p.id === id ? { ...p, ...updatedData, id } : p);
        this.saveAll(participants);
        return participants.find(p => p.id === id);
    },

    async deleteParticipant(id) {
        let participants = await this.getParticipants();
        participants = participants.filter(p => p.id !== id);
        this.saveAll(participants);
        return id;
    },

    async reset() {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
        // On remet la démo pour éviter le syndrome de la page blanche
        this.saveAll(initialDemoData);
        return initialDemoData;
    },

    saveAll(data) {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
    }
};
