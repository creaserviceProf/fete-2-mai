const FOOD_CATEGORIES = [
    "Apéro", "Entrées", "Grillades", "Salades", 
    "Légumes / accompagnements", "Fromages", "Desserts", "Pain / sauces / divers"
];

const DRINK_CATEGORIES = [
    "Jus / softs", "Eau", "Vins", "Champagne / mousseux", 
    "Bières", "Boissons apéro", "Digestifs / autres"
];

let state = {
    participants: [],
    filterName: "",
    filterPresence: "all",
    filterFood: "all"
};

// ==========================
// INITIALISATION
// ==========================
document.addEventListener("DOMContentLoaded", async () => {
    document.getElementById("syncStatus").textContent = 
        window.APP_CONFIG.syncMode === 'firebase' ? 'Firebase (Cloud)' : 'LocalStorage (Local)';

    populateSelects();
    setupEventListeners();

    if (window.APP_CONFIG.syncMode === 'firebase') {
        window.API.subscribe((data) => {
            state.participants = data;
            renderAll();
        });
    }

    await loadData();
});

async function loadData() {
    state.participants = await window.API.getParticipants();
    renderAll();
}

function populateSelects() {
    const filterFood = document.getElementById("filterFood");
    FOOD_CATEGORIES.forEach(cat => {
        filterFood.add(new Option(cat, cat));
    });
}

function getFoodOptionsHtml(selectedVal = '') {
    return `<option value="">Rien (ou autre)</option>` + FOOD_CATEGORIES.map(c => 
        `<option value="${c}" ${c === selectedVal ? 'selected' : ''}>${c}</option>`
    ).join('');
}

function getDrinkOptionsHtml(selectedVal = '') {
    return `<option value="">Rien (ou autre)</option>` + DRINK_CATEGORIES.map(c => 
        `<option value="${c}" ${c === selectedVal ? 'selected' : ''}>${c}</option>`
    ).join('');
}

// ==========================
// RENDUS
// ==========================
function renderAll() {
    renderTable();
    renderDashboard();
}

function renderTable() {
    const tbody = document.getElementById("participantsBody");
    const emptyState = document.getElementById("emptyState");
    const tableEl = document.getElementById("participantsTable");
    
    tbody.innerHTML = "";

    const filtered = state.participants.filter(p => {
        const matchName = p.name.toLowerCase().includes(state.filterName.toLowerCase());
        const matchPresence = state.filterPresence === "all" || p.presence === state.filterPresence;
        
        let matchFood = false;
        if (state.filterFood === "all") {
            matchFood = true;
        } else {
            const fList = p.foods || [];
            matchFood = fList.some(f => f.category === state.filterFood);
            if (fList.length === 0 && state.filterFood === "all") matchFood = true;
        }
        
        return matchName && matchPresence && matchFood;
    });

    if (filtered.length === 0) {
        tableEl.style.display = "none";
        emptyState.style.display = "block";
    } else {
        tableEl.style.display = "table";
        emptyState.style.display = "none";

        filtered.forEach(p => {
            const tr = document.createElement("tr");

            let presenceLabel = p.presence === 'oui' ? 'Confirmé' : (p.presence === 'non' ? 'Absent' : 'En attente');
            let guestsText = p.accompagne ? `<br><small class="text-muted">+${p.guestsCount} acc.</small>` : '';

            // Nourriture
            let foodHtml = `<span class="text-muted">Rien / Non précisé</span>`;
            if (p.foods && p.foods.length > 0) {
                const mapped = p.foods.filter(f => f.category || f.detail).map(f => {
                    return `<div class="item-list">
                        ${f.category ? `<span class="item-chip">${f.category}</span>` : ''}
                        <span>${f.detail || ''} <strong style="color:var(--primary-color)">(x${f.qty || 1})</strong></span>
                    </div>`;
                });
                if (mapped.length > 0) foodHtml = mapped.join('');
            }

            // Boissons
            let drinkHtml = `<span class="text-muted">Rien / Non précisé</span>`;
            if (p.drinks && p.drinks.length > 0) {
                const mapped = p.drinks.filter(d => d.category || d.detail).map(d => {
                    return `<div class="item-list">
                        ${d.category ? `<span class="item-chip">${d.category}</span>` : ''}
                        <span>${d.detail || ''} <strong style="color:var(--primary-color)">(x${d.qty || 1})</strong></span>
                    </div>`;
                });
                if (mapped.length > 0) drinkHtml = mapped.join('');
            }

            tr.innerHTML = `
                <td><strong>${p.name}</strong>${guestsText}</td>
                <td><span class="badge ${p.presence}">${presenceLabel}</span></td>
                <td>${foodHtml}</td>
                <td>${drinkHtml}</td>
                <td><small>${p.comment || '-'}</small></td>
                <td>
                    <button class="btn-icon" onclick="editParticipant('${p.id}')" title="Modifier">✏️</button>
                    <button class="btn-icon" style="color:var(--danger)" onclick="deleteParticipant('${p.id}')" title="Supprimer">🗑️</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
}

function renderDashboard() {
    let totalExpected = 0;
    let countOui = 0;
    let countAttente = 0;
    let countNon = 0;

    state.participants.forEach(p => {
        if (p.presence === 'oui') {
            countOui++;
            totalExpected += 1 + (p.accompagne ? parseInt(p.guestsCount || 0) : 0);
        } else if (p.presence === 'attente') {
            countAttente++;
            totalExpected += 1 + (p.accompagne ? parseInt(p.guestsCount || 0) : 0);
        } else {
            countNon++;
        }
    });

    document.getElementById("statTotalPersons").textContent = totalExpected;
    document.getElementById("statConfirmes").textContent = countOui;
    document.getElementById("statAttente").textContent = countAttente;
    document.getElementById("statAbsents").textContent = countNon;

    const foodMap = aggregateCategory(FOOD_CATEGORIES, 'foods');
    renderSummaryList("foodSummaryList", FOOD_CATEGORIES, foodMap);

    const drinksMap = aggregateCategory(DRINK_CATEGORIES, 'drinks');
    renderSummaryList("drinksSummaryList", DRINK_CATEGORIES, drinksMap);

    generateAlerts(foodMap, drinksMap, totalExpected);
}

function aggregateCategory(categoriesList, listKey) {
    let map = {};
    categoriesList.forEach(c => map[c] = { totalItems: 0, details: [] });

    state.participants.forEach(p => {
        if (p.presence === 'non') return;
        
        const items = p[listKey] || [];
        items.forEach(item => {
            const c = item.category;
            if (c && map[c]) {
                const parsedQty = parseInt(item.qty || 1);
                let detailStr = item.detail ? `${item.detail} (x${parsedQty})` : `Quantité: ${parsedQty}`;
                map[c].totalItems += parsedQty;
                map[c].details.push({ name: p.name, desc: detailStr });
            }
        });
    });
    return map;
}

function renderSummaryList(containerId, catList, mapData) {
    const container = document.getElementById(containerId);
    container.innerHTML = "";

    catList.forEach(cat => {
        const data = mapData[cat];
        const el = document.createElement("div");
        el.className = "cat-summary";
        
        if (data.totalItems === 0) {
            el.innerHTML = `
                <span class="cat-name">${cat}</span>
                <span class="cat-empty">Rien prévu</span>
            `;
        } else {
            let detailsHtml = data.details.map(d => `• ${d.desc} <small>(${d.name})</small>`).join('<br>');
            el.innerHTML = `
                <div>
                    <div class="cat-name">${cat}</div>
                    <div class="cat-items">${detailsHtml}</div>
                </div>
                <div class="cat-count">${data.totalItems}</div>
            `;
        }
        container.appendChild(el);
    });
}

function generateAlerts(foodMap, drinksMap, totalExpected) {
    const list = document.getElementById("alertsList");
    const section = document.getElementById("alertsSection");
    list.innerHTML = "";
    let alerts = [];

    if (totalExpected === 0) {
        alerts.push("Personne n'est encore inscrit.");
    } else {
        if (foodMap["Desserts"].totalItems === 0) alerts.push("Il n'y a aucun <strong>Dessert</strong> prévu pour le moment !");
        if (drinksMap["Eau"].totalItems < (totalExpected / 4)) alerts.push("Attention, très peu d'<strong>Eau</strong> de prévue par rapport au nombre d'invités.");
        if (foodMap["Apéro"].totalItems === 0) alerts.push("Pensez à prendre de quoi faire l'<strong>Apéritif</strong>.");
        if (drinksMap["Jus / softs"].totalItems === 0) alerts.push("Aucune <strong>Boisson sans alcool (Soft)</strong> n'a été ajoutée.");
        if (foodMap["Pain / sauces / divers"].totalItems === 0) alerts.push("N'oubliez pas le <strong>Pain</strong> ! Personne n'en a prévu.");
    }

    if (alerts.length === 0) {
        section.style.display = "none";
    } else {
        section.style.display = "block";
        alerts.forEach(a => {
            const li = document.createElement("li");
            li.innerHTML = a;
            list.appendChild(li);
        });
    }
}

// ==========================
// MODAL DYNAMIC ROWS
// ==========================

function addFoodRow(data = {category: '', detail: '', qty: 1}) {
    const container = document.getElementById('foodItemsContainer');
    const row = document.createElement('div');
    row.className = 'form-row food-item-row';
    row.innerHTML = `
        <div class="form-group flex-1">
            <label>Catégorie</label>
            <select class="food-category-select">${getFoodOptionsHtml(data.category)}</select>
        </div>
        <div class="form-group flex-2">
            <label>Détail</label>
            <input type="text" class="food-detail-input" value="${data.detail}">
        </div>
        <div class="form-group flex-small">
            <label>Qté</label>
            <input type="number" class="food-qty-input" min="1" value="${data.qty}">
        </div>
        <div class="form-group" style="align-items: center; justify-content: flex-end;">
            <button type="button" class="btn-icon row-remove-btn" title="Retirer" style="margin-top:24px; color:var(--danger);">&times;</button>
        </div>
    `;
    row.querySelector('.row-remove-btn').addEventListener('click', () => row.remove());
    container.appendChild(row);
}

function addDrinkRow(data = {category: '', detail: '', qty: 1}) {
    const container = document.getElementById('drinkItemsContainer');
    const row = document.createElement('div');
    row.className = 'form-row drink-item-row';
    row.innerHTML = `
        <div class="form-group flex-1">
            <label>Catégorie</label>
            <select class="drink-category-select">${getDrinkOptionsHtml(data.category)}</select>
        </div>
        <div class="form-group flex-2">
            <label>Détail</label>
            <input type="text" class="drink-detail-input" value="${data.detail}">
        </div>
        <div class="form-group flex-small">
            <label>Qté</label>
            <input type="number" class="drink-qty-input" min="1" value="${data.qty}">
        </div>
        <div class="form-group" style="align-items: center; justify-content: flex-end;">
            <button type="button" class="btn-icon row-remove-btn" title="Retirer" style="margin-top:24px; color:var(--danger);">&times;</button>
        </div>
    `;
    row.querySelector('.row-remove-btn').addEventListener('click', () => row.remove());
    container.appendChild(row);
}

// ==========================
// INTERACTIONS & MODALE
// ==========================
function setupEventListeners() {
    document.getElementById("searchInput").addEventListener("input", (e) => {
        state.filterName = e.target.value;
        renderTable();
    });
    document.getElementById("filterPresence").addEventListener("change", (e) => {
        state.filterPresence = e.target.value;
        renderTable();
    });
    document.getElementById("filterFood").addEventListener("change", (e) => {
        state.filterFood = e.target.value;
        renderTable();
    });

    document.getElementById("addBtn").addEventListener("click", () => openModal());
    document.getElementById("closeModalBtn").addEventListener("click", closeModal);
    document.getElementById("cancelBtn").addEventListener("click", closeModal);
    
    document.getElementById("partAccompagne").addEventListener("change", (e) => {
        document.getElementById("guestsCountGroup").style.display = e.target.checked ? "block" : "none";
    });

    // Boutons d'ajout dynamique
    document.getElementById("addFoodBtn").addEventListener("click", () => addFoodRow());
    document.getElementById("addDrinkBtn").addEventListener("click", () => addDrinkRow());

    document.getElementById("participantForm").addEventListener("submit", async (e) => {
        e.preventDefault();

        // Récupérer les listes
        let foods = [];
        document.querySelectorAll('.food-item-row').forEach(row => {
            const cat = row.querySelector('.food-category-select').value;
            const det = row.querySelector('.food-detail-input').value.trim();
            const qty = row.querySelector('.food-qty-input').value;
            if (cat || det) {
                foods.push({ category: cat, detail: det, qty: parseInt(qty) || 1 });
            }
        });

        let drinks = [];
        document.querySelectorAll('.drink-item-row').forEach(row => {
            const cat = row.querySelector('.drink-category-select').value;
            const det = row.querySelector('.drink-detail-input').value.trim();
            const qty = row.querySelector('.drink-qty-input').value;
            if (cat || det) {
                drinks.push({ category: cat, detail: det, qty: parseInt(qty) || 1 });
            }
        });
        
        const partData = {
            name: document.getElementById("partName").value.trim(),
            presence: document.getElementById("partPresence").value,
            accompagne: document.getElementById("partAccompagne").checked,
            guestsCount: document.getElementById("partGuests").value,
            foods: foods,
            drinks: drinks,
            comment: document.getElementById("partComment").value.trim(),
        };

        const id = document.getElementById("partId").value;
        if (id) {
            await window.API.updateParticipant(id, partData);
        } else {
            await window.API.addParticipant(partData);
        }

        closeModal();
        await loadData();
    });

    document.getElementById("resetBtn").addEventListener("click", async () => {
        const code = prompt("Action irréversible. Veuillez entrer le code de sécurité pour réinitialiser :");
        if (code === "1234") {
            await window.API.reset();
            await loadData();
        } else if (code !== null) {
            alert("Code incorrect. Réinitialisation annulée.");
        }
    });

    document.getElementById("copyBtn").addEventListener("click", () => {
        const txt = generateSummaryText();
        navigator.clipboard.writeText(txt).then(() => {
            alert("Résumé copié dans le presse-papier !");
        });
    });

    document.getElementById("exportCsvBtn").addEventListener("click", exportToCsv);
}

window.editParticipant = function(id) {
    const p = state.participants.find(x => x.id === id);
    if (p) openModal(p);
};

window.deleteParticipant = async function(id) {
        const code = prompt("Veuillez entrer le code de sécurité pour supprimer ce participant :");
        if (code === "1234") {
            await window.API.deleteParticipant(id);
            await loadData();
        } else if (code !== null) {
            alert("Code incorrect. Suppression annulée.");
        }
};

function openModal(participant = null) {
    const form = document.getElementById("participantForm");
    form.reset();
    
    document.getElementById("foodItemsContainer").innerHTML = '';
    document.getElementById("drinkItemsContainer").innerHTML = '';

    if (participant) {
        document.getElementById("modalTitle").textContent = "Modifier le participant";
        document.getElementById("partId").value = participant.id;
        document.getElementById("partName").value = participant.name;
        document.getElementById("partPresence").value = participant.presence;
        
        document.getElementById("partAccompagne").checked = participant.accompagne;
        document.getElementById("guestsCountGroup").style.display = participant.accompagne ? "block" : "none";
        document.getElementById("partGuests").value = participant.guestsCount || 1;
        
        if (participant.foods && participant.foods.length > 0) {
            participant.foods.forEach(f => addFoodRow(f));
        } else {
            addFoodRow();
        }

        if (participant.drinks && participant.drinks.length > 0) {
            participant.drinks.forEach(d => addDrinkRow(d));
        } else {
            addDrinkRow();
        }
        
        document.getElementById("partComment").value = participant.comment || "";
    } else {
        document.getElementById("modalTitle").textContent = "Ajouter un participant";
        document.getElementById("partId").value = "";
        document.getElementById("guestsCountGroup").style.display = "none";
        
        addFoodRow();
        addDrinkRow();
    }

    document.getElementById("modalOverlay").classList.add("active");
}

function closeModal() {
    document.getElementById("modalOverlay").classList.remove("active");
}

// ==========================
// UTILITAIRES (Export & Copie)
// ==========================
function generateSummaryText() {
    let txt = "🍽️ Organisation Repas du 2 Mai 🥂\n\n";
    txt += "👤 PRESENCE :\n";
    txt += `- Confirmés: ${document.getElementById("statConfirmes").textContent}\n`;
    txt += `- En attente: ${document.getElementById("statAttente").textContent}\n`;
    txt += `- Total estimé: ${document.getElementById("statTotalPersons").textContent} pers.\n\n`;
    
    txt += "🥘 NOURRITURE :\n";
    state.participants.forEach(p => {
        if (p.presence !== 'non' && p.foods && p.foods.length > 0) {
            const pTxt = p.foods.filter(f => f.category || f.detail).map(f => `${f.category ? f.category+' ' : ''}${f.detail ? '('+f.detail+') ' : ''}[x${f.qty}]`).join(', ');
            if (pTxt) txt += `- ${p.name}: ${pTxt}\n`;
        }
    });

    txt += "\n🍾 BOISSONS :\n";
    state.participants.forEach(p => {
        if (p.presence !== 'non' && p.drinks && p.drinks.length > 0) {
            const pTxt = p.drinks.filter(d => d.category || d.detail).map(d => `${d.category ? d.category+' ' : ''}${d.detail ? '('+d.detail+') ' : ''}[x${d.qty}]`).join(', ');
            if (pTxt) txt += `- ${p.name}: ${pTxt}\n`;
        }
    });
    
    return txt;
}

function exportToCsv() {
    const headers = ["Nom", "Presence", "Accompagne", "NbAccompagnants", "Nourritures", "Boissons", "Commentaire"];
    const rows = [headers];

    state.participants.forEach(p => {
        const foodStr = (p.foods || []).filter(f => f.category || f.detail).map(f => `${f.category || 'N/A'}: ${f.detail || 'N/A'} (x${f.qty})`).join(' | ');
        const drinkStr = (p.drinks || []).filter(d => d.category || d.detail).map(d => `${d.category || 'N/A'}: ${d.detail || 'N/A'} (x${d.qty})`).join(' | ');

        rows.push([
            `"${p.name || ''}"`,
            `"${p.presence || ''}"`,
            `"${p.accompagne ? 'Oui' : 'Non'}"`,
            p.guestsCount || 0,
            `"${foodStr}"`,
            `"${drinkStr}"`,
            `"${p.comment || ''}"`
        ]);
    });

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "organisation_2mai.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
