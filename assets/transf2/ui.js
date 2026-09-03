import { store } from '../store.js';
import { vehiclesCatalog, enemyVehiclesCatalog, getVehicleById } from '../config/vehicles.js';
import { saveScene, loadScene } from './persistence.js';
import { getThreeLayer } from './map.js';

export function initUI() {
    initCatalog(vehiclesCatalog, 'vehicle-list', 'btn-toggle-catalog', 'panel-catalog', 'btn-add-vehicle');
    initCatalog(enemyVehiclesCatalog, 'enemy-vehicle-list', 'btn-toggle-catalog-enemy', 'panel-catalog-enemy', 'btn-add-vehicle-enemy');
    initHeaderControls();
    initPanelInteraction();

    // Subscribe to state changes
    store.subscribe('mode', updateModeIndicator);
    store.subscribe('selectedCatalogId', updateCatalogSelection);
    store.subscribe('selectedPlacedIds', updateEditorPanel);
    store.subscribe('placedVehicles', () => updateEditorPanel(store.getState().selectedPlacedIds));
}

function initPanelInteraction() {
    const panels = document.querySelectorAll('.ui-panel');
    panels.forEach(panel => {
        const header = panel.querySelector('.panel-header');
        const btnMin = panel.querySelector('.btn-minimize');
        
        if (header) makeDraggable(panel, header);
        if (btnMin) {
            btnMin.addEventListener('click', () => {
                panel.classList.toggle('minimized');
                btnMin.innerText = panel.classList.contains('minimized') ? '▢' : '_';
            });
        }
    });
}

function makeDraggable(el, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    
    handle.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        e = e || window.event;
        // Don't drag if clicking buttons
        if (e.target.closest('button')) return;
        
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
        
        // Bring to front
        document.querySelectorAll('.ui-panel').forEach(p => p.style.zIndex = 10);
        el.style.zIndex = 11;
    }

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        
        // Calculer les nouvelles positions
        let top = el.offsetTop - pos2;
        let left = el.offsetLeft - pos1;
        
        // Contraintes pour rester dans la fenêtre (optionnel)
        top = Math.max(0, Math.min(window.innerHeight - 50, top));
        left = Math.max(0, Math.min(window.innerWidth - el.offsetWidth, left));

        el.style.top = top + "px";
        el.style.left = left + "px";
        el.style.bottom = "auto";
        el.style.right = "auto";
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
}

function initCatalog(catalog, listId, toggleId, panelId, addBtnId) {
    const list = document.getElementById(listId);
    catalog.forEach(v => {
        const li = document.createElement('li');
        li.className = 'vehicle-item';
        li.dataset.id = v.id;

        const colorHex = '#' + v.fallbackColor.toString(16).padStart(6, '0');
        const imgHtml = v.image ? `<img src="${v.image}" style="width: 100%; height: 100%; object-fit: cover;">` : '';

        li.innerHTML = `
            <div class="vehicle-icon" style="background-color: ${colorHex}; overflow: hidden;">${imgHtml}</div>
            <div class="vehicle-info">
                <h4>${v.name}</h4>
                <p>Portée: ${v.rangeKm} km</p>
            </div>
        `;

        li.addEventListener('click', () => {
            store.setState({ selectedCatalogId: v.id });
        });

        list.appendChild(li);
    });

    // Toggle panel
    const btnToggle = document.getElementById(toggleId);
    const panel = document.getElementById(panelId);
    btnToggle.addEventListener('click', () => {
        panel.classList.toggle('hidden');
        panel.classList.toggle('open');
    });

    // Add button
    const btnAdd = document.getElementById(addBtnId);
    btnAdd.addEventListener('click', () => {
        const state = store.getState();
        if (state.selectedCatalogId) {
            store.setState({ mode: state.mode === 'placement' ? 'idle' : 'placement' });
        }
    });
}

function initHeaderControls() {
    document.getElementById('btn-save').addEventListener('click', saveScene);

    const fileInput = document.getElementById('file-input');
    document.getElementById('btn-load').addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            loadScene(e.target.files[0]);
            fileInput.value = ''; // Reset
        }
    });

    document.getElementById('btn-reset').addEventListener('click', () => {
        if (confirm("Voulez-vous vraiment supprimer tous les véhicules ?")) {
            store.clearAll();
        }
    });

    const btnTerrain = document.getElementById('btn-terrain');
    btnTerrain.addEventListener('click', () => {
        const current = store.getState().terrainExaggeration;
        const next = current === 0 ? 1.5 : 0;
        store.setState({ terrainExaggeration: next });
    });

    store.subscribe('terrainExaggeration', (exag) => {
        btnTerrain.innerText = `Terrain 3D: ${exag > 0 ? 'ON' : 'OFF'}`;
        btnTerrain.className = exag > 0 ? 'btn btn-primary' : 'btn';
    });

    document.getElementById('btn-close-editor').addEventListener('click', () => {
        store.setState({ selectedPlacedIds: [] });
    });

    const btnToggleDots = document.getElementById('btn-toggle-dots');
    btnToggleDots.addEventListener('click', () => {
        const current = store.getState().showDots;
        store.setState({ showDots: !current });
    });
    
    store.subscribe('showDots', (show) => {
        btnToggleDots.innerText = show ? '👁️' : '🙈';
    });
}

function updateEditorPanel(selectedIds) {
    const panel = document.getElementById('panel-editor');
    const container = document.getElementById('editor-container');
    
    if (!selectedIds || selectedIds.length === 0) {
        panel.classList.add('hidden');
        container.innerHTML = '';
        return;
    }

    panel.classList.remove('hidden');
    
    // Pour éviter de tout reconstruire et perdre le focus/état des sliders, 
    // on pourrait faire un diffing, mais pour simplifier ici on reconstruit
    // tout en essayant de garder une trace des éléments ouverts.
    
    // Mémoriser quels réglages étaient ouverts
    const expandedIds = new Set();
    container.querySelectorAll('.settings-toggle:not(.collapsed)').forEach(el => {
        expandedIds.add(el.dataset.id);
    });

    container.innerHTML = '';
    
    selectedIds.forEach(id => {
        const vData = store.getState().placedVehicles.find(v => v.instanceId === id);
        if (vData) {
            const card = createEditorCard(vData, expandedIds.has(id));
            container.appendChild(card);
        }
    });
}

function createEditorCard(vData, initiallyExpanded) {
    const catalogItem = getVehicleById(vData.catalogId);
    const card = document.createElement('div');
    card.className = 'editor-card';
    card.dataset.id = vData.instanceId;

    const currentExag = store.getState().terrainExaggeration;
    const rotXValue = currentExag > 0 ? (vData.rotationX || 0) : 0;
    const rotYValue = currentExag > 0 ? (vData.rotationY || 0) : 0;

    const displayName = vData.customName || (catalogItem ? catalogItem.name : vData.catalogId);
    
    // Thumbnail logic
    const imgHtml = catalogItem?.image ? `<img src="${catalogItem.image}">` : '';

    // Navigation logic (only if 1 vehicle is selected)
    const selectedIds = store.getState().selectedPlacedIds;
    const isSingleSelection = selectedIds.length === 1;
    let navHtml = '';
    
    if (isSingleSelection) {
        navHtml = `
            <div class="nav-arrows-overlay">
                <button class="nav-arrow prev" title="Précédent">‹</button>
                <button class="nav-arrow next" title="Suivant">›</button>
            </div>
        `;
    }

    card.innerHTML = `
        <div class="editor-card-header">
            <input type="text" class="input-card-name" value="${displayName}" placeholder="Nom du véhicule...">
            <button class="btn-icon btn-small btn-remove-card" title="Désélectionner">×</button>
        </div>
        
        <div class="editor-card-body">
            <div class="altitude-info">
                <label>Altitude (Terrain):</label>
                <span class="altitude-value">${vData.terrainAltitude.toFixed(1)} m</span>
            </div>
            <div class="vehicle-image-container">
                ${imgHtml}
                ${navHtml}
            </div>
        </div>

        <div class="settings-toggle ${initiallyExpanded ? '' : 'collapsed'}" data-id="${vData.instanceId}">
            <span>Réglages Avancés</span>
            <span class="arrow">▶</span>
        </div>
        
        <div class="settings-content ${initiallyExpanded ? '' : 'collapsed'}">
            <div class="prop-group">
                <label>Position X Offset: <b>${(vData.offsetX || 0)}m</b></label>
                <div class="slider-container">
                    <button class="btn-step minus">-</button>
                    <input type="range" class="input-posX" min="-100" max="100" step="0.1" value="${vData.offsetX || 0}">
                    <button class="btn-step plus">+</button>
                </div>
            </div>
            <div class="prop-group">
                <label>Position Y Offset: <b>${(vData.offsetY || 0)}m</b></label>
                <div class="slider-container">
                    <button class="btn-step minus">-</button>
                    <input type="range" class="input-posY" min="-100" max="100" step="0.1" value="${vData.offsetY || 0}">
                    <button class="btn-step plus">+</button>
                </div>
            </div>
            <div class="prop-group">
                <label>Rotation Z (Cap): <b>${(vData.heading || 0)}°</b></label>
                <div class="slider-container">
                    <button class="btn-step minus">-</button>
                    <input type="range" class="input-heading" min="0" max="360" value="${vData.heading || 0}">
                    <button class="btn-step plus">+</button>
                </div>
            </div>
            <div class="prop-group">
                <label>Rotation X: <b>${rotXValue}°</b></label>
                <div class="slider-container">
                    <button class="btn-step minus" ${currentExag === 0 ? 'disabled' : ''}>-</button>
                    <input type="range" class="input-rotationX" min="-180" max="180" value="${rotXValue}" ${currentExag === 0 ? 'disabled' : ''}>
                    <button class="btn-step plus" ${currentExag === 0 ? 'disabled' : ''}>+</button>
                </div>
            </div>
            <div class="prop-group">
                <label>Rotation Y: <b>${rotYValue}°</b></label>
                <div class="slider-container">
                    <button class="btn-step minus" ${currentExag === 0 ? 'disabled' : ''}>-</button>
                    <input type="range" class="input-rotationY" min="-180" max="180" value="${rotYValue}" ${currentExag === 0 ? 'disabled' : ''}>
                    <button class="btn-step plus" ${currentExag === 0 ? 'disabled' : ''}>+</button>
                </div>
            </div>
            <div class="prop-group">
                <label>Offset Altitude: <b>${(vData.altitudeOffset || 0)}m</b></label>
                <div class="slider-container">
                    <button class="btn-step minus">-</button>
                    <input type="range" class="input-offset" min="-10" max="50" step="0.1" value="${vData.altitudeOffset || 0}">
                    <button class="btn-step plus">+</button>
                </div>
            </div>
        </div>

        ${vData.catalogId === 'v_armor' ? renderMissileSection(vData) : ''}

        <div class="card-actions">
            <button class="btn btn-focus">Cibler</button>
            <button class="btn btn-focus-range">Bulle</button>
            <button class="btn btn-danger btn-delete">Suppr.</button>
        </div>

        <div class="card-actions" style="margin-top: 8px;">
            <button class="btn btn-anim-1" ${!(vData.animationsCount > 0) ? 'disabled' : ''}>Action 1</button>
            <button class="btn btn-anim-2" ${!(vData.animationsCount > 1) ? 'disabled' : ''}>Action 2</button>
        </div>
    `;

    // Listeners
    const id = vData.instanceId;

    // Navigation (Arrows)
    if (isSingleSelection) {
        const placed = store.getState().placedVehicles;
        const currentIndex = placed.findIndex(v => v.instanceId === id);

        card.querySelector('.nav-arrow.prev')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const nextIndex = (currentIndex - 1 + placed.length) % placed.length;
            store.setState({ selectedPlacedIds: [placed[nextIndex].instanceId] });
        });

        card.querySelector('.nav-arrow.next')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const nextIndex = (currentIndex + 1) % placed.length;
            store.setState({ selectedPlacedIds: [placed[nextIndex].instanceId] });
        });
    }

    // Renommage
    card.querySelector('.input-card-name').addEventListener('change', (e) => {
        store.updatePlacedVehicle(id, { customName: e.target.value });
    });
    
    card.querySelector('.btn-remove-card').addEventListener('click', () => {
        store.toggleSelection(id, true);
    });

    card.querySelector('.settings-toggle').addEventListener('click', (e) => {
        const toggle = e.currentTarget;
        const content = card.querySelector('.settings-content');
        const isCollapsed = toggle.classList.toggle('collapsed');
        content.classList.toggle('collapsed', isCollapsed);
    });

    // Helper for slider + buttons
    const setupSlider = (inputClass, propName) => {
        const container = card.querySelector(`.${inputClass}`).parentElement;
        const input = container.querySelector('input');
        const minus = container.querySelector('.minus');
        const plus = container.querySelector('.plus');
        const step = parseFloat(input.step) || 1;

        const updateStore = (val) => {
            const updates = {};
            updates[propName] = val;
            store.updatePlacedVehicle(id, updates);
        };

        input.addEventListener('input', (e) => updateStore(parseFloat(e.target.value)));
        
        minus.addEventListener('click', () => {
            const val = Math.max(parseFloat(input.min), parseFloat(input.value) - step);
            updateStore(parseFloat(val.toFixed(2))); // Fix floating point precision
        });
        
        plus.addEventListener('click', () => {
            const val = Math.min(parseFloat(input.max), parseFloat(input.value) + step);
            updateStore(parseFloat(val.toFixed(2)));
        });
    };

    setupSlider('input-posX', 'offsetX');
    setupSlider('input-posY', 'offsetY');
    setupSlider('input-heading', 'heading');
    setupSlider('input-rotationX', 'rotationX');
    setupSlider('input-rotationY', 'rotationY');
    setupSlider('input-offset', 'altitudeOffset');

    card.querySelector('.btn-focus').addEventListener('click', () => store.notify('focus_camera', id));
    card.querySelector('.btn-focus-range').addEventListener('click', () => store.notify('focus_range', id));
    card.querySelector('.btn-delete').addEventListener('click', () => store.removePlacedVehicle(id));

        card.querySelector('.btn-anim-1').addEventListener('click', () => {
            const tl = getThreeLayer();
            if (tl) tl.playAnimation(id, 0);
        });
        card.querySelector('.btn-anim-2').addEventListener('click', () => {
            const tl = getThreeLayer();
            if (tl) tl.playAnimation(id, 1);
        });

    // Missile simulation listeners (only for v_armor)
    if (vData.catalogId === 'v_armor') {
        const rangeInput = card.querySelector('.input-missile-range');
        const rangeMinus = card.querySelector('.minus-range');
        const rangePlus = card.querySelector('.plus-range');

        const updateRangeStore = (val) => {
            store.updatePlacedVehicle(id, { missileRangeKm: val });
        };

        rangeInput.addEventListener('input', (e) => updateRangeStore(parseInt(e.target.value)));
        
        rangeMinus.addEventListener('click', () => {
            const val = Math.max(5, parseInt(rangeInput.value) - 1);
            updateRangeStore(val);
        });

        rangePlus.addEventListener('click', () => {
            const val = Math.min(50, parseInt(rangeInput.value) + 1);
            updateRangeStore(val);
        });

        card.querySelector('.btn-designate-target').addEventListener('click', () => {
            store.setState({ mode: 'target_designation' });
        });

        card.querySelector('.btn-clear-target').addEventListener('click', () => {
            store.updatePlacedVehicle(id, {
                targetLng: null,
                targetLat: null,
                targetAltitude: null,
                isLaunching: false
            });
        });

        const launchBtn = card.querySelector('.btn-launch-missile');
        if (launchBtn) {
            launchBtn.addEventListener('click', () => {
                store.updatePlacedVehicle(id, { isLaunching: true });
            });
        }
    }

    return card;
}

function updateModeIndicator(mode) {
    const indicator = document.getElementById('mode-indicator');
    indicator.innerText = mode === 'placement' ? 'Mode: Placement (Double-Clic)' : 'Mode: Idle';
    indicator.className = mode === 'placement' ? 'badge placement' : 'badge';
    
    const btnAdd = document.getElementById('btn-add-vehicle');

    if (mode === 'placement') {
        indicator.innerText = 'Mode: Placement (Double-Clic)';
        indicator.className = 'badge placement';
        btnAdd.innerText = 'Annuler Placement';
    } else if (mode === 'target_designation') {
        indicator.innerText = 'Mode: Désignation Cible (Clic Carte)';
        indicator.className = 'badge designation';
        btnAdd.innerText = 'Activer Placement';
    } else {
        indicator.innerText = 'Mode: Idle';
        indicator.className = 'badge';
        btnAdd.innerText = 'Activer Placement';
    }
}

function renderMissileSection(vData) {
    const missileRange = vData.missileRangeKm || 20;
    const hasTarget = vData.targetLng && vData.targetLat;
    let targetHtml = '';

    if (hasTarget) {
        // Compute distance using Haversine
        const dist = getHaversineDistance(vData.lat, vData.lng, vData.targetLat, vData.targetLng);
        const inRange = dist <= missileRange;
        const speedMps = 1000; // ~ Mach 3 (1000 m/s)
        const flightTimeSec = (dist * 1000) / speedMps;
        
        targetHtml = `
            <div class="target-status ${inRange ? 'in-range' : 'out-of-range'}">
                <div class="status-row">
                    <span class="status-label">Cible Lat :</span>
                    <span class="status-value">${vData.targetLat.toFixed(5)}</span>
                </div>
                <div class="status-row">
                    <span class="status-label">Cible Lng :</span>
                    <span class="status-value">${vData.targetLng.toFixed(5)}</span>
                </div>
                <div class="status-row">
                    <span class="status-label">Distance :</span>
                    <span class="status-value">${dist.toFixed(2)} km</span>
                </div>
                <div class="status-row">
                    <span class="status-label">Tps de vol :</span>
                    <span class="status-value">${flightTimeSec.toFixed(1)} s</span>
                </div>
                <div class="status-row">
                    <span class="status-label">Statut :</span>
                    <span class="status-value" style="color: ${inRange ? '#2ecc71' : '#e74c3c'}">
                        ${inRange ? '✓ En Portée' : '⚠ Hors Portée'}
                    </span>
                </div>
            </div>
            <button class="btn btn-primary btn-launch-missile btn-full" 
                style="background: #e67e22; border-color: #e67e22; margin-top: 5px;" 
                ${inRange && !vData.isLaunching ? '' : 'disabled'}>
                ${vData.isLaunching ? '🚀 Tir en cours...' : '🚀 Lancer le Missile'}
            </button>
        `;
    } else {
        targetHtml = `
            <div style="text-align: center; font-size: 0.8rem; color: #888; padding: 10px 0;">
                Aucune cible désignée
            </div>
        `;
    }

    return `
        <div class="missile-section">
            <div class="missile-title">
                <span>🚀 Simulation Missile</span>
            </div>
            <div class="prop-group" style="margin-bottom: 10px;">
                <label>Portée du missile: <b>${missileRange} km</b></label>
                <div class="slider-container">
                    <button class="btn-step minus-range">-</button>
                    <input type="range" class="input-missile-range" min="5" max="50" step="1" value="${missileRange}">
                    <button class="btn-step plus-range">+</button>
                </div>
            </div>
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                <button class="btn btn-primary btn-designate-target" style="flex: 1; font-size: 0.85rem; padding: 6px;">
                    🎯 Cible
                </button>
                <button class="btn btn-danger btn-clear-target" style="font-size: 0.85rem; padding: 6px;" ${hasTarget ? '' : 'disabled'}>
                    Effacer
                </button>
            </div>
            ${targetHtml}
        </div>
    `;
}

function getHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function updateCatalogSelection(id) {
    document.querySelectorAll('.vehicle-item').forEach(el => {
        if (el.dataset.id === id) el.classList.add('selected');
        else el.classList.remove('selected');
    });

    const vData = getVehicleById(id);
    const btnAddFriend = document.getElementById('btn-add-vehicle');
    const btnAddEnemy = document.getElementById('btn-add-vehicle-enemy');

    if (vData) {
        if (vData.side === 'friend') {
            btnAddFriend.disabled = false;
            btnAddEnemy.disabled = true;
        } else {
            btnAddFriend.disabled = true;
            btnAddEnemy.disabled = false;
        }
    } else {
        btnAddFriend.disabled = true;
        btnAddEnemy.disabled = true;
    }
}
