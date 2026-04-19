// Abstraction du Store (Pattern Repository)

window.APP_CONFIG = {
    // Choisir 'local' pour GitHub Pages / Utilisation Personnelle
    // Choisir 'firebase' pour une vraie collaboration multi-device
    syncMode: 'local' 
};

window.API = {
    storage() {
        return window.APP_CONFIG.syncMode === 'firebase' 
            ? window.StorageFirebase 
            : window.StorageLocal;
    },

    async getParticipants() {
        return this.storage().getParticipants();
    },
    async addParticipant(p) {
        return this.storage().addParticipant(p);
    },
    async updateParticipant(id, p) {
        return this.storage().updateParticipant(id, p);
    },
    async deleteParticipant(id) {
        return this.storage().deleteParticipant(id);
    },
    async reset() {
        return this.storage().reset();
    },
    subscribe(callback) {
        if (this.storage().subscribe) {
            this.storage().subscribe(callback);
        }
    }
};
