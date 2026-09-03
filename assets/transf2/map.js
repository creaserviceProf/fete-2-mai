import { store } from '../store.js';
import { getVehicleById } from '../config/vehicles.js';
import { createThreeLayer } from './threeLayer.js';

let mapInstance = null;
let threeLayer = null; // Référence globale pour reconstruction après changement de style
let isGlobeMode = false;

export function getThreeLayer() {
    return threeLayer;
}

export function initMap(token) {
    mapboxgl.accessToken = token;

    mapInstance = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/kikistef/cm6f5p5a600b801qx7s6cctkq',
        center: [2.3522, 48.8566],
        zoom: 12,
        pitch: 60,
        bearing: 0,
        antialias: true
    });

    mapInstance.on('load', () => {
        // Ajouter le relief 3D seulement s'il n'existe pas déjà dans le style
        if (!mapInstance.getSource('mapbox-dem')) {
            mapInstance.addSource('mapbox-dem', {
                'type': 'raster-dem',
                'url': 'mapbox://mapbox.mapbox-terrain-dem-v1',
                'tileSize': 512,
                'maxzoom': 20
            });
        }

        // Activer le terrain si pas déjà activé
        if (!mapInstance.getTerrain()) {
            mapInstance.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': 0 });
        }

        // Initialiser la couche Three.js
        threeLayer = createThreeLayer(mapInstance);
        mapInstance.addLayer(threeLayer);

        // Initialiser la couche GeoJSON proxy pour la sélection et portée
        initProxyLayer();

        // Gérer le placement
        mapInstance.on('dblclick', handleMapDoubleClick);

        // Gérer la sélection (Consolidée pour 2D et 3D)
        mapInstance.on('click', (e) => {
            const state = store.getState();
            if (state.mode === 'placement') return;

            if (state.mode === 'target_designation') {
                const selectedIds = state.selectedPlacedIds;
                if (selectedIds.length > 0) {
                    const activeId = selectedIds[0];
                    const lngLat = e.lngLat;
                    const elev = mapInstance.queryTerrainElevation(lngLat) || 0;
                    const currentExag = state.terrainExaggeration || 1.0;
                    const rawAlt = (state.terrainExaggeration > 0) ? (elev / state.terrainExaggeration) : 0;
                    
                    store.updatePlacedVehicle(activeId, {
                        targetLng: lngLat.lng,
                        targetLat: lngLat.lat,
                        targetAltitude: rawAlt
                    });
                }
                store.setState({ mode: 'idle' });
                return;
            }

            // 1. Détection 2D (Points sur la carte)
            const features = mapInstance.queryRenderedFeatures(e.point, { layers: ['vehicle-markers-dot'] });
            
            // 2. Détection 3D (Modèles Three.js)
            const hitId = threeLayer.raycast(e.point);

            const isMulti = e.originalEvent.ctrlKey || e.originalEvent.shiftKey;
            
            if (features.length > 0) {
                // Priorité au clic 2D
                const id = features[0].properties.instanceId;
                store.toggleSelection(id, isMulti);
            } else if (hitId) {
                // Clic 3D si pas de clic 2D
                store.toggleSelection(hitId, isMulti);
            } else {
                // Clic à côté -> Désélectionner tout (sauf si multi-selection en cours)
                if (!isMulti) {
                    store.setState({ selectedPlacedIds: [] });
                }
            }
        });

        // Change cursor
        mapInstance.on('mouseenter', 'vehicle-markers-dot', () => {
            mapInstance.getCanvas().style.cursor = 'pointer';
        });
        mapInstance.on('mouseleave', 'vehicle-markers-dot', () => {
            mapInstance.getCanvas().style.cursor = '';
        });

        // Sync placed vehicles to proxy layer
        store.subscribe('placedVehicles', updateProxyLayer);
        store.subscribe('selectedPlacedIds', updateProxyLayerSelection);
        
        // Gérer la visibilité des points
        store.subscribe('showDots', updateDotsVisibility);

        // Changer le curseur en mode désignation de cible
        store.subscribe('mode', (mode) => {
            if (mapInstance) {
                if (mode === 'target_designation') {
                    mapInstance.getCanvas().style.cursor = 'crosshair';
                } else {
                    mapInstance.getCanvas().style.cursor = '';
                }
            }
        });

        // Gérer l'exagération du terrain
        store.subscribe('terrainExaggeration', (exag) => {
            if (mapInstance && mapInstance.getSource('mapbox-dem')) {
                mapInstance.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': exag });

                // Si on active le relief, on doit recalculer les altitudes des véhicules
                if (exag > 0) {
                    // On attend que la carte ait fini de charger les nouvelles tuiles de relief
                    mapInstance.once('idle', () => {
                        const state = store.getState();
                        const updatedVehicles = state.placedVehicles.map(v => {
                            const elev = mapInstance.queryTerrainElevation([v.lng, v.lat]) || 0;
                            // On stocke l'altitude brute (elev / exag)
                            return { ...v, terrainAltitude: elev / exag };
                        });
                        store.setPlacedVehicles(updatedVehicles);
                        console.log("Altitudes synchronisées avec le relief.");
                    });
                }
            }
        });

        store.subscribe('focus_camera', (id) => {
            const vData = store.getState().placedVehicles.find(v => v.instanceId === id);
            if (vData && mapInstance) {
                mapInstance.flyTo({
                    center: [vData.lng, vData.lat],
                    zoom: 20,
                    speed: 1.2
                });
            }
        });

        store.subscribe('focus_range', (id) => {
            const state = store.getState();
            const vData = state.placedVehicles.find(v => v.instanceId === id);
            if (vData && mapInstance) {
                const catalog = getVehicleById(vData.catalogId);
                const rangeKm = catalog ? catalog.rangeKm : 0;
                
                if (rangeKm > 0) {
                    // Calcul approximatif des bornes pour englober la bulle (cercle)
                    const lat = vData.lat;
                    const lng = vData.lng;
                    const kmPerDegreeLat = 111.32;
                    const kmPerDegreeLng = 40075 * Math.cos(lat * Math.PI / 180) / 360;
                    
                    // On ajoute 15% de marge pour la visibilité
                    const dLat = (rangeKm * 1.15) / kmPerDegreeLat;
                    const dLng = (rangeKm * 1.15) / kmPerDegreeLng;
                    
                    mapInstance.fitBounds([
                        [lng - dLng, lat - dLat],
                        [lng + dLng, lat + dLat]
                    ], { 
                        padding: 40, 
                        duration: 1500,
                        pitch: mapInstance.getPitch() // Garder l'inclinaison actuelle
                    });
                } else {
                    // Fallback sur un zoom classique si pas de portée définie
                    mapInstance.flyTo({
                        center: [vData.lng, vData.lat],
                        zoom: 18,
                        speed: 1.2
                    });
                }
            }
        });

        // Chargement d'une scène JSON : focus caméra + repaint forcé
        store.subscribe('scene_loaded', (vehicles) => {
            if (!vehicles || vehicles.length === 0 || !mapInstance) return;

            // 1. Forcer le repaint pour que Three.js rende les véhicules immédiatement
            mapInstance.triggerRepaint();

            // 2. Calculer la bounding box de tous les véhicules
            const lngs = vehicles.map(v => v.lng);
            const lats = vehicles.map(v => v.lat);
            const minLng = Math.min(...lngs);
            const maxLng = Math.max(...lngs);
            const minLat = Math.min(...lats);
            const maxLat = Math.max(...lats);

            if (vehicles.length === 1) {
                // Un seul véhicule : flyTo simple
                mapInstance.flyTo({
                    center: [lngs[0], lats[0]],
                    zoom: 17,
                    pitch: 60,
                    speed: 1.2
                });
            } else {
                // Plusieurs véhicules : fitBounds
                mapInstance.fitBounds(
                    [[minLng, minLat], [maxLng, maxLat]],
                    { padding: 120, pitch: 60, duration: 2000 }
                );
            }

            // 3. Re-forcer le repaint après la fin de l'animation
            mapInstance.once('idle', () => mapInstance.triggerRepaint());
        });

        console.log("Map chargée.");

        // Mettre à jour l'overlay du zoom
        const updateZoomOverlay = () => {
            document.getElementById('val-zoom').innerText = mapInstance.getZoom().toFixed(2);
        };

        mapInstance.on('zoom', updateZoomOverlay);
        updateZoomOverlay();
        
        // Initialiser la visibilité des points au chargement
        updateDotsVisibility(store.getState().showDots);
        
        // S'abonner aux changements de zoom pour mettre à jour les trajectoires
        mapInstance.on('zoom', updateTrajectoryVisibilityAndSize);
        
        // Initialiser au chargement
        updateTrajectoryVisibilityAndSize();

        // Geocoder search
        initGeocoder();

        // Style switcher
        initStyleSwitcher();

        // Globe toggle
        initGlobeToggle();
    });
}
function applyMapProjection() {
    if (!mapInstance) return;
    if (isGlobeMode) {
        mapInstance.setProjection('globe');
        mapInstance.setFog({
            'color': 'rgb(186, 210, 235)',
            'high-color': 'rgb(36, 92, 223)',
            'horizon-blend': 0.02,
            'space-color': 'rgb(11, 11, 25)',
            'star-intensity': 0.6
        });
    } else {
        mapInstance.setProjection('mercator');
        mapInstance.setFog(null);
    }
}
function initGlobeToggle() {
    const btn = document.getElementById('btn-globe-toggle');
    if (!btn) return;
    const updateBtn = () => {
        btn.innerText = isGlobeMode ? 'Globe: ON' : 'Globe: OFF';
        btn.className = isGlobeMode ? 'btn btn-primary' : 'btn';
        btn.title = isGlobeMode ? 'Passer en mode Mercator' : 'Passer en mode Globe';
    };
    btn.addEventListener('click', () => {
        isGlobeMode = !isGlobeMode;
        applyMapProjection();
        updateBtn();
        mapInstance.triggerRepaint();
    });
    updateBtn();
}

function initGeocoder() {
    const input = document.getElementById('geocoder-input');
    const btn = document.getElementById('btn-geocoder');

    const doSearch = () => {
        const query = input.value.trim();
        if (!query || !mapInstance) return;

        const token = mapboxgl.accessToken;
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&limit=1&language=fr`;

        fetch(url)
            .then(r => r.json())
            .then(data => {
                if (data.features && data.features.length > 0) {
                    const [lng, lat] = data.features[0].center;
                    mapInstance.flyTo({ center: [lng, lat], zoom: 14, pitch: 60, speed: 1.2 });
                } else {
                    alert('Lieu introuvable : ' + query);
                }
            })
            .catch(() => alert('Erreur lors de la recherche.'));
    };

    btn.addEventListener('click', doSearch);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
}

function initStyleSwitcher() {
    const buttons = document.querySelectorAll('.style-btn');

    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            const newStyle = btn.dataset.style;
            if (!newStyle || !mapInstance) return;

            // Marquer le bouton actif
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Mémoriser la caméra actuelle
            const center = mapInstance.getCenter();
            const zoom = mapInstance.getZoom();
            const bearing = mapInstance.getBearing();
            const pitch = mapInstance.getPitch();

            // Changer le style
            mapInstance.setStyle(newStyle);

            // Réinitialiser les sources et couches après le chargement du nouveau style
            mapInstance.once('style.load', () => {
                if (!mapInstance.getSource('mapbox-dem')) {
                    mapInstance.addSource('mapbox-dem', {
                        'type': 'raster-dem',
                        'url': 'mapbox://mapbox.mapbox-terrain-dem-v1',
                        'tileSize': 512,
                        'maxzoom': 20
                    });
                }

                const state = store.getState();
                if (state.terrainExaggeration > 0) {
                    mapInstance.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': state.terrainExaggeration });
                }

                // Restaurer la caméra
                mapInstance.jumpTo({ center, zoom, bearing, pitch });

                applyMapProjection();
                // Recréer le layer Three.js (détruit par setStyle)
                // Note: setStyle le supprime automatiquement, mais onRemove n'est pas appelé
                // On appelle manuellement onRemove pour désactiver l'ancien layer
                if (threeLayer && threeLayer.onRemove) threeLayer.onRemove();
                threeLayer = createThreeLayer(mapInstance);
                mapInstance.addLayer(threeLayer);

                // Recréer les couches proxy GeoJSON
                initProxyLayer();
                store.notify('placedVehicles', store.getState().placedVehicles);

                // Forcer repaint pour afficher les véhicules 3D
                mapInstance.once('idle', () => mapInstance.triggerRepaint());
            });
        });
    });
}

function handleMapDoubleClick(e) {
    const state = store.getState();
    if (state.mode === 'placement' && state.selectedCatalogId) {
        e.preventDefault(); // Prevent default map double-click zoom

        const lngLat = e.lngLat;
        let alt = 0;

        // Requête altitude
        const elevation = mapInstance.queryTerrainElevation(lngLat) || 0;
        const currentExag = state.terrainExaggeration || 1.0;
        const rawAlt = (state.terrainExaggeration > 0) ? (elevation / state.terrainExaggeration) : 0;

        const newVehicle = {
            instanceId: 'v_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            catalogId: state.selectedCatalogId,
            lng: lngLat.lng,
            lat: lngLat.lat,
            terrainAltitude: rawAlt,
            altitudeOffset: 0,
            heading: 0,
            rotationX: 0,
            rotationY: 0,
            offsetX: 0,
            offsetY: 0,
            timestamp: Date.now()
        };

        store.addPlacedVehicle(newVehicle);

        // Revenir en mode idle
        store.setState({ mode: 'idle' });
    }
}



function initProxyLayer() {
    mapInstance.addSource('vehicles-geojson', {
        type: 'geojson',
        data: {
            type: 'FeatureCollection',
            features: []
        }
    });

    // On garde uniquement les ronds rouges pour l'interaction 2D
    mapInstance.addLayer({
        id: 'vehicle-markers-dot',
        type: 'circle',
        source: 'vehicles-geojson',
        paint: {
            'circle-radius': [
                'case',
                ['==', ['coalesce', ['get', 'selected'], false], true],
                10,
                6
            ],
            'circle-color': ['coalesce', ['get', 'color'], '#e74c3c'],
            'circle-stroke-width': [
                'case',
                ['==', ['coalesce', ['get', 'selected'], false], true],
                3,
                2
            ],
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 0.9
        }
    });

    // Couche pour le clic (hitbox plus grosse)
    mapInstance.addLayer({
        id: 'vehicle-points',
        type: 'circle',
        source: 'vehicles-geojson',
        paint: {
            'circle-radius': 15,
            'circle-color': '#000000',
            'circle-opacity': 0 // Invisible mais cliquable
        }
    });

    // Source et calque pour la cible de missile
    mapInstance.addSource('missile-targets-geojson', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
    });
    
    // Ajouter l'image de la croix à la map avant d'ajouter la couche
    // Utilisation d'une URL locale vers /images/target.svg
    mapInstance.loadImage(
        './images/target.svg',
        (error, image) => {
            if (error) throw error;
            if (!mapInstance.hasImage('missile-target-icon')) {
                mapInstance.addImage('missile-target-icon', image);
            }

            // Ajouter la couche de symbole avec l'icône de croix
            if (!mapInstance.getLayer('missile-targets-layer')) {
                mapInstance.addLayer({
                    id: 'missile-targets-layer',
                    type: 'symbol',
                    source: 'missile-targets-geojson',
                    layout: {
                        'icon-image': 'missile-target-icon',
                        'icon-size': 0.5,
                        'icon-allow-overlap': true
                    }
                });
            }
        }
    );

    // Supprimer l'ancienne couche de cercle si elle existe
    if (mapInstance.getLayer('missile-targets-layer-circle')) {
        mapInstance.removeLayer('missile-targets-layer-circle');
    }

    // Source et calque pour le vecteur de trajectoire 2D
    mapInstance.addSource('missile-trajectories-geojson', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
    });

    mapInstance.addLayer({
        id: 'missile-trajectories-layer',
        type: 'line',
        source: 'missile-trajectories-geojson',
        paint: {
            'line-color': '#ffffff',
            'line-width': 3,
            'line-dasharray': [2, 2],
            'line-opacity': 0.8
        }
    });
}

let hoveredStateId = null;

function updateProxyLayer(vehicles) {
    if (!mapInstance || !mapInstance.getSource('vehicles-geojson')) return;

    const features = vehicles.map(v => {
        const catalog = getVehicleById(v.catalogId);
        const colorStr = catalog ? '#' + catalog.fallbackColor.toString(16).padStart(6, '0') : '#e74c3c';

        // Calcul de la position avec offsets
        const coord = mapboxgl.MercatorCoordinate.fromLngLat([v.lng, v.lat]);
        const unitsPerMeter = coord.meterInMercatorCoordinateUnits();
        coord.x += (v.offsetX || 0) * unitsPerMeter;
        coord.y -= (v.offsetY || 0) * unitsPerMeter; // Inversion Nord/Sud
        const finalLngLat = coord.toLngLat();

        // Générer un ID numérique court pour Mapbox feature-state
        const numericId = parseInt(v.instanceId.split('_')[1]) || 0;

        return {
            type: 'Feature',
            id: numericId,
            properties: {
                instanceId: v.instanceId,
                rangeKm: catalog ? catalog.rangeKm : 0,
                color: colorStr
            },
            geometry: {
                type: 'Point',
                coordinates: [finalLngLat.lng, finalLngLat.lat]
            }
        };
    });

    mapInstance.getSource('vehicles-geojson').setData({
        type: 'FeatureCollection',
        features: features
    });

    updateMissileLayers(vehicles);
}

function updateProxyLayerSelection(selectedIds) {
    if (!mapInstance || !mapInstance.getSource('vehicles-geojson')) return;
    
    const state = store.getState();
    const source = mapInstance.getSource('vehicles-geojson');

    const features = state.placedVehicles.map(v => {
        const catalog = getVehicleById(v.catalogId);
        const colorStr = catalog ? '#' + catalog.fallbackColor.toString(16).padStart(6, '0') : '#e74c3c';
        const isSelected = selectedIds.includes(v.instanceId);
        
        const coord = mapboxgl.MercatorCoordinate.fromLngLat([v.lng, v.lat]);
        const unitsPerMeter = coord.meterInMercatorCoordinateUnits();
        coord.x += (v.offsetX || 0) * unitsPerMeter;
        coord.y -= (v.offsetY || 0) * unitsPerMeter; // Inversion pour match Three.js (Nord = positif)
        const finalPos = coord.toLngLat();

        return {
            type: 'Feature',
            id: parseInt(v.instanceId.split('_')[1]) || 0,
            properties: {
                instanceId: v.instanceId,
                rangeKm: catalog ? catalog.rangeKm : 0,
                color: colorStr,
                selected: isSelected
            },
            geometry: {
                type: 'Point',
                coordinates: [finalPos.lng, finalPos.lat]
            }
        };
    });

    source.setData({
        type: 'FeatureCollection',
        features: features
    });

    updateMissileLayers(state.placedVehicles);
}

// Fonction pour gérer la visibilité des points de positionnement
function updateDotsVisibility(show) {
    if (!mapInstance) return;
    
    if (show) {
        // Montrer les points
        if (mapInstance.getLayer('vehicle-markers-dot')) {
            mapInstance.setLayoutProperty('vehicle-markers-dot', 'visibility', 'visible');
        }
    } else {
        // Masquer les points
        if (mapInstance.getLayer('vehicle-markers-dot')) {
            mapInstance.setLayoutProperty('vehicle-markers-dot', 'visibility', 'none');
        }
    }
    
    // Mettre à jour les trajectoires après un changement de visibilité
    updateTrajectoryVisibilityAndSize();
}

// Fonction pour gérer la visibilité et la taille constante des lignes de trajectoire
function updateTrajectoryVisibilityAndSize() {
    if (!mapInstance) return;
    
    const zoom = mapInstance.getZoom();
    const threeLayer = getThreeLayer();
    
    // Taille de ligne constante en pixels écran (visible à tous les niveaux de zoom)
    const lineWidth = 3;
    
    if (threeLayer) {
        // Parcourir tous les groupes de véhicules pour mettre à jour les lignes
        const meshes = threeLayer.meshes || new Map();
        meshes.forEach((group, id) => {
            const missileSimGroup = group.getObjectByName("missileSimGroup");
            if (missileSimGroup) {
                const trajectoryLine = missileSimGroup.getObjectByName("trajectoryTube");
                if (trajectoryLine) {
                    // Appliquer une taille de ligne constante
                    trajectoryLine.material.linewidth = lineWidth;
                }
            }
        });
    }
}

function updateMissileLayers(vehicles) {
    if (!mapInstance || !mapInstance.getSource('missile-targets-geojson') || !mapInstance.getSource('missile-trajectories-geojson')) return;
    
    const targetFeatures = [];
    const trajectoryFeatures = [];
    
    vehicles.forEach(v => {
        if (v.targetLng && v.targetLat) {
            targetFeatures.push({
                type: 'Feature',
                properties: { instanceId: v.instanceId },
                geometry: {
                    type: 'Point',
                    coordinates: [v.targetLng, v.targetLat]
                }
            });
            
            // Calculer les coordonnées réelles du véhicule avec les offsets
            const coord = mapboxgl.MercatorCoordinate.fromLngLat([v.lng, v.lat]);
            const unitsPerMeter = coord.meterInMercatorCoordinateUnits();
            coord.x += (v.offsetX || 0) * unitsPerMeter;
            coord.y -= (v.offsetY || 0) * unitsPerMeter;
            const finalLngLat = coord.toLngLat();
            
            trajectoryFeatures.push({
                type: 'Feature',
                properties: { instanceId: v.instanceId },
                geometry: {
                    type: 'LineString',
                    coordinates: [
                        [finalLngLat.lng, finalLngLat.lat],
                        [v.targetLng, v.targetLat]
                    ]
                }
            });
        }
    });
    
    mapInstance.getSource('missile-targets-geojson').setData({
        type: 'FeatureCollection',
        features: targetFeatures
    });
    
    mapInstance.getSource('missile-trajectories-geojson').setData({
        type: 'FeatureCollection',
        features: trajectoryFeatures
    });
}
