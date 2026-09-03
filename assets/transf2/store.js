// Pattern simple Pub/Sub pour le state management

const state = {
    mode: 'idle', // 'idle' ou 'placement'
    selectedCatalogId: null, // ID du véhicule sélectionné dans le panneau gauche
    placedVehicles: [], // Liste des véhicules placés sur la carte
    selectedPlacedIds: [], // IDs des véhicules sélectionnés sur la carte (pour édition)
    terrainExaggeration: 0, // 0 ou 1.5
    showDots: true // Visibilité des points 2D
};

const listeners = {};

export const store = {
    getState() {
        return state;
    },

    setState(newState) {
        let changed = false;
        for (const key in newState) {
            // Pour les tableaux, on fait une comparaison simple de référence ou de contenu si besoin
            // Ici, on remplace souvent le tableau complet
            if (state[key] !== newState[key]) {
                state[key] = newState[key];
                changed = true;
                this.notify(key, state[key]);
            }
        }
        if (changed) {
            this.notify('all', state);
        }
    },

    subscribe(key, callback) {
        if (!listeners[key]) {
            listeners[key] = [];
        }
        listeners[key].push(callback);
    },

    notify(key, value) {
        if (listeners[key]) {
            listeners[key].forEach(cb => cb(value));
        }
    },
    
    addPlacedVehicle(vehicle) {
        const newList = [...state.placedVehicles, vehicle];
        this.setState({ placedVehicles: newList });
    },
    
    setPlacedVehicles(vehicles) {
        this.setState({ placedVehicles: vehicles });
    },
    
    updatePlacedVehicle(id, updates) {
        const newList = state.placedVehicles.map(v => 
            v.instanceId === id ? { ...v, ...updates } : v
        );
        this.setState({ placedVehicles: newList });
    },
    
    removePlacedVehicle(id) {
        const newList = state.placedVehicles.filter(v => v.instanceId !== id);
        this.setState({ placedVehicles: newList });
        
        if (state.selectedPlacedIds.includes(id)) {
            const newSelection = state.selectedPlacedIds.filter(sid => sid !== id);
            this.setState({ selectedPlacedIds: newSelection });
        }
    },
    
    toggleSelection(id, isMulti) {
        let newSelection = [...state.selectedPlacedIds];
        if (isMulti) {
            if (newSelection.includes(id)) {
                newSelection = newSelection.filter(sid => sid !== id);
            } else {
                newSelection.push(id);
            }
        } else {
            newSelection = [id];
        }
        this.setState({ selectedPlacedIds: newSelection });
    },

    clearAll() {
        this.setState({
            placedVehicles: [],
            selectedPlacedIds: [],
            mode: 'idle'
        });
    }
};
