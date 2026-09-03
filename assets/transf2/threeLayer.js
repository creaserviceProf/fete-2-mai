import { store } from '../store.js';
import { getVehicleById } from '../config/vehicles.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export function createThreeLayer(mapInstance) {

    const layerId = '3d-vehicles-layer';
    let camera, scene, renderer;
    let map = mapInstance;

    const meshes = new Map();
    const mixers = new Map(); // Stocker les AnimationMixers
    const animationStates = new Map(); // Stocker l'état (sens) de chaque animation
    const clock = new THREE.Clock();
    const loader = new GLTFLoader();

    // Point d'ancrage pour la précision
    let anchorLngLat = null;
    let anchorMercator = null;
    let active = true; // Flag pour désactiver ce layer si un nouveau est créé

    const customLayer = {
        id: layerId,
        type: 'custom',
        renderingMode: '3d',

        onAdd: function (map, gl) {
            this.map = map;

            camera = new THREE.Camera();
            scene = new THREE.Scene();

            renderer = new THREE.WebGLRenderer({
                canvas: map.getCanvas(),
                context: gl,
                antialias: true
            });
            renderer.autoClear = false;
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;

            const light = new THREE.DirectionalLight(0xffffff, 2.0);
            light.position.set(200, 200, 500);
            light.castShadow = true;

            // Rétablissement des paramètres de la caméra d'ombre pour couvrir une zone large
            light.shadow.camera.left = -500;
            light.shadow.camera.right = 500;
            light.shadow.camera.top = 500;
            light.shadow.camera.bottom = -500;
            light.shadow.camera.near = 1;
            light.shadow.camera.far = 1500;

            light.shadow.mapSize.width = 2048;
            light.shadow.mapSize.height = 2048;
            light.shadow.bias = -0.0005; // Ajustement du biais
            scene.add(light);

            const light2 = new THREE.DirectionalLight(0xadd8e6, 1.0);
            light2.position.set(-200, -200, 300);
            scene.add(light2);

            // Lumière d'ambiance plus riche
            scene.add(new THREE.AmbientLight(0xffffff, 0.3));
            scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.5));

            // PointLight intense pour créer le point de réflexion "Glass"
            const pointLight = new THREE.PointLight(0xffffff, 1000, 0, 2);
            pointLight.position.set(0, 0, 1000);
            scene.add(pointLight);

            store.subscribe('placedVehicles', (vehicles) => {
                if (!active) return; // Layer remplacé : ignorer
                if (vehicles.length === 0) {
                    anchorLngLat = null;
                    anchorMercator = null;
                } else if (!anchorLngLat) {
                    anchorLngLat = [vehicles[0].lng, vehicles[0].lat];
                    anchorMercator = mapboxgl.MercatorCoordinate.fromLngLat(anchorLngLat, 0);
                }
                this.syncVehicles(vehicles);
                this.map.triggerRepaint();
            });

            store.subscribe('terrainExaggeration', () => {
                if (!active) return;
                const state = store.getState();
                this.syncVehicles(state.placedVehicles);
                this.map.triggerRepaint();
            });

            // Synchronisation immédiate si des véhicules existent déjà dans le store
            // (utile après un changement de style ou rechargement de layer)
            const initVehicles = store.getState().placedVehicles;
            if (initVehicles.length > 0) {
                anchorLngLat = [initVehicles[0].lng, initVehicles[0].lat];
                anchorMercator = mapboxgl.MercatorCoordinate.fromLngLat(anchorLngLat, 0);
                this.syncVehicles(initVehicles);
                setTimeout(() => this.map.triggerRepaint(), 100);
            }
        },

        onRemove: function () {
            active = false;
            meshes.clear();
        },

        render: function (gl, matrix) {
            if (!anchorMercator) return;

            // Mise à jour des animations
            const delta = clock.getDelta();
            for (const mixer of mixers.values()) {
                mixer.update(delta);
            }

            // Mettre à jour les animations des cercles de portée à chaque frame
            const selectedIds = store.getState().selectedPlacedIds;
            for (const [id, group] of meshes.entries()) {
                const rangeGroup = group.getObjectByName("rangeGroup");
                const modelGroup = group.getObjectByName("modelGroup");
                const catalogItem = getVehicleById(group._catalogId);

                if (selectedIds.includes(id)) {
                    // Highlight 3D (Effet émissif)
                    if (modelGroup) {
                        modelGroup.traverse(child => {
                            if (child.isMesh && child.material && child.material.emissive) {
                                if (child._origEmissive === undefined) child._origEmissive = child.material.emissive.getHex();
                                child.material.emissive.setHex(0x333333);
                            }
                        });
                    }

                    if (rangeGroup && !rangeGroup.visible) {
                        rangeGroup.visible = true;
                        rangeGroup._startTime = performance.now();
                    }

                    if (rangeGroup) {
                        const elapsed = performance.now() - rangeGroup._startTime;
                        const duration = 3200;
                        const progress = Math.min(elapsed / duration, 1);
                        const animFactor = progress === 1 ? 1 : 1 - Math.pow(1 - progress, 5);
                        const targetScale = (catalogItem?.rangeKm || 0) * 1000;

                        rangeGroup.scale.set(targetScale * animFactor, targetScale * animFactor, targetScale * animFactor);
                        if (progress < 1) this.map.triggerRepaint();
                    }
                } else {
                    if (modelGroup) {
                        modelGroup.traverse(child => {
                            if (child.isMesh && child.material && child.material.emissive && child._origEmissive !== undefined) {
                                child.material.emissive.setHex(child._origEmissive);
                            }
                        });
                    }
                    if (rangeGroup) {
                        rangeGroup.visible = false;
                        rangeGroup._startTime = null;
                    }
                }

                // Sauvegarder la référence à la map sur le groupe pour les repaints asynchrones
                group._threeLayerMapRef = this.map;

                // Animation du missile
                const missileSimGroup = group.getObjectByName("missileSimGroup");
                const vData = store.getState().placedVehicles.find(v => v.instanceId === id);

                if (vData && vData.targetLng && vData.targetLat && vData.isLaunching && group._missileCurve) {
                    if (missileSimGroup) {
                        missileSimGroup.visible = true;
                    }

                    // Récupérer ou créer le groupe pivot du missile
                    let missilePivot = missileSimGroup.getObjectByName("missilePivot");
                    if (!missilePivot && missileSimGroup) {
                        missilePivot = new THREE.Group();
                        missilePivot.name = "missilePivot";
                        missilePivot.raycast = () => { };

                        // Missile : pyramide triangulaire à 3 faces (triangle tactique)
                        // Le cône pointe vers +Y en géométrie Three.js native.
                        // On le bascule pour qu'il pointe vers +Z (axe "avant" du pivot).
                        const missileGeom = new THREE.ConeGeometry(1.0, 1.6, 4);
                        missileGeom.rotateX(-Math.PI / 2); // pointe vers +Z local du pivot
                        const missileMat = new THREE.MeshBasicMaterial({
                            color: 0xff2200,
                            side: THREE.DoubleSide
                        });
                        const missileMesh = new THREE.Mesh(missileGeom, missileMat);
                        missileMesh.name = "missileMesh";
                        missileMesh.raycast = () => { };

                        // Traîné de combustion (petit cône orange derrière)
                        const trailGeom = new THREE.ConeGeometry(0.5, 1, 3);
                        trailGeom.rotateX(-Math.PI / 2); // pointe vers -Z (arrière)
                        const trailMat = new THREE.MeshBasicMaterial({
                            color: 0xff9900,
                            transparent: true,
                            opacity: 0.6,
                            side: THREE.DoubleSide
                        });
                        const trailMesh = new THREE.Mesh(trailGeom, trailMat);
                        trailMesh.position.z = 1; // décalé vers l'arrière
                        trailMesh.raycast = () => { };

                        // Lumière de combustion
                        const light = new THREE.PointLight(0xff6600, 12, 40);
                        light.position.z = 2;

                        missilePivot.add(missileMesh);
                        missilePivot.add(trailMesh);
                        missilePivot.add(light);
                        missileSimGroup.add(missilePivot);
                    }

                    if (missilePivot) {
                        missilePivot.visible = true;

                        if (!group._launchStartTime) {
                            group._launchStartTime = performance.now();
                        }

                        // Vitesse réaliste Mach 3 (~1000 m/s) — durée basée sur longueur réelle de l'arc
                        const speedMps = 1000;
                        const curveLength = group._missileCurveLength || group._missileCurve.getLength();
                        const duration = Math.max(1000, (curveLength / speedMps) * 1000);

                        // Taille du triangle proportionnelle à la longueur de la trajectoire
                        // ≈ 2.5% de la longueur de l'arc → toujours visible à l'écran
                        const missileScale = Math.max(20, curveLength * 0.025);
                        missilePivot.scale.setScalar(missileScale);


                        const elapsed = performance.now() - group._launchStartTime;
                        const progress = Math.min(elapsed / duration, 1);

                        const pos = group._missileCurve.getPointAt(progress);
                        missilePivot.position.copy(pos);

                        // Orientation du pivot : son axe +Z pointe dans le sens de la tangente
                        // lookAt positionne -Z vers la cible dans Three.js, donc on utilise
                        // la position opposée pour orienter +Z dans le bon sens.
                        const tangent = group._missileCurve.getTangentAt(progress);
                        // On crée un up vector stable non aligné avec la tangente
                        const up = Math.abs(tangent.z) > 0.95
                            ? new THREE.Vector3(1, 0, 0)
                            : new THREE.Vector3(0, 0, 1);
                        const quaternion = new THREE.Quaternion();
                        const orientMatrix = new THREE.Matrix4();
                        orientMatrix.lookAt(
                            new THREE.Vector3(0, 0, 0),
                            tangent,
                            up
                        );
                        quaternion.setFromRotationMatrix(orientMatrix);
                        missilePivot.setRotationFromQuaternion(quaternion);

                        if (progress >= 1) {
                            // Impact !
                            triggerImpactExplosion(group, pos);
                            store.updatePlacedVehicle(id, { isLaunching: false });
                            group._launchStartTime = null;
                            missilePivot.visible = false;
                        } else {
                            // Repaint forcé pour continuer l'animation de frame en frame
                            this.map.triggerRepaint();
                        }
                    }
                } else {
                    // Si pas de tir en cours, masquer le pivot
                    if (missileSimGroup) {
                        const missilePivot = missileSimGroup.getObjectByName("missilePivot");
                        if (missilePivot) {
                            missilePivot.visible = false;
                        }
                    }
                    group._launchStartTime = null;
                }
            }

            // FACTEUR DE SCALE : Nombre de "Mercator units" pour 1 mètre à cette latitude
            const mPerUnit = anchorMercator.meterInMercatorCoordinateUnits();

            // MATRICE DE TRANSFORMATION RTC (Relative to Center)
            // On veut transformer le repère Three.js (mètres) vers le repère Mapbox (Mercator [0,1])
            // X: Est (+), Y: Nord (+), Z: Haut (+)
            const rtcMatrix = new THREE.Matrix4()
                .makeTranslation(anchorMercator.x, anchorMercator.y, anchorMercator.z)
                .scale(new THREE.Vector3(mPerUnit, -mPerUnit, mPerUnit)); // -mPerUnit car Mapbox Y est vers le Sud

            // On combine la matrice de projection Mapbox avec notre transformation locale
            const m = new THREE.Matrix4().fromArray(matrix);
            camera.projectionMatrix.copy(m.multiply(rtcMatrix));
            camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

            renderer.resetState();
            renderer.render(scene, camera);
            this.map.triggerRepaint();
        },

        // Méthode pour jouer une animation
        playAnimation: function (id, index) {
            const mixer = mixers.get(id);
            const group = meshes.get(id);
            if (mixer && group && group._animations && group._animations[index]) {
                const anim = group._animations[index];
                const action = mixer.clipAction(anim);
                
                // Clé unique pour cet état d'animation : instanceId_index
                const stateKey = `${id}_${index}`;
                const lastDir = animationStates.get(stateKey) || -1; // -1 pour commencer par Forward
                const newDir = lastDir === 1 ? -1 : 1; // Toggle
                animationStates.set(stateKey, newDir);

                action.paused = false;
                action.setLoop(THREE.LoopOnce);
                action.clampWhenFinished = true;
                
                if (newDir === 1) {
                    // Play Forward
                    action.timeScale = 1;
                    if (action.time === anim.duration || action.time === 0) action.reset();
                } else {
                    // Play Reverse
                    action.timeScale = -1;
                    if (action.time === 0 || action.time === anim.duration) {
                        action.time = anim.duration;
                        action.paused = false;
                    }
                }
                
                action.play();
                this.map.triggerRepaint();
            }
        },

        // Méthode de Raycasting pour la sélection au clic sur les modèles 3D
        raycast: function (point) {
            if (!anchorMercator || !meshes.size) return null;

            const mouse = new THREE.Vector2();
            mouse.x = (point.x / map.getCanvas().clientWidth) * 2 - 1;
            mouse.y = -(point.y / map.getCanvas().clientHeight) * 2 + 1;

            const raycaster = new THREE.Raycaster();

            // Calculer le rayon de la caméra vers le monde (en utilisant la matrice inverse)
            // On projette du Near Plane (-1) vers le Far Plane (1)
            const vNear = new THREE.Vector3(mouse.x, mouse.y, -1).unproject(camera);
            const vFar = new THREE.Vector3(mouse.x, mouse.y, 1).unproject(camera);

            raycaster.ray.origin.copy(vNear);
            raycaster.ray.direction.copy(vFar).sub(vNear).normalize();

            // Intersecter tous les groupes de véhicules
            const intersects = raycaster.intersectObjects(Array.from(meshes.values()), true);

            if (intersects.length > 0) {
                // Filtrer pour n'accepter que les hits dans le 'modelGroup'
                const validHit = intersects.find(hit => {
                    let parent = hit.object;
                    while (parent) {
                        if (parent.name === "modelGroup") return true;
                        parent = parent.parent;
                    }
                    return false;
                });

                if (validHit) {
                    let obj = validHit.object;
                    while (obj && !meshes.has(obj._instanceId) && obj.parent) {
                        obj = obj.parent;
                    }

                    if (obj && obj._instanceId) {
                        return obj._instanceId;
                    }
                }
            }
            return null;
        },

        syncVehicles: function (vehiclesData) {
            if (!anchorMercator) return;

            const currentIds = new Set(vehiclesData.map(v => v.instanceId));

            for (const [id, group] of meshes.entries()) {
                if (!currentIds.has(id)) {
                    scene.remove(group);
                    meshes.delete(id);
                }
            }

            vehiclesData.forEach(vData => {
                const catalogItem = getVehicleById(vData.catalogId);
                if (!catalogItem) return;

                if (!meshes.has(vData.instanceId)) {
                    const group = new THREE.Group();

                    // Sous-groupe pour le modèle (qui subit les rotations X, Y, Z)
                    const modelGroup = new THREE.Group();
                    modelGroup.name = "modelGroup";
                    group.add(modelGroup);

                    // ON TRAVAILLE EN MÈTRES RÉELS (1 unit = 1 meter)
                    const geom = new THREE.BoxGeometry(
                        catalogItem.dimensions.width,
                        catalogItem.dimensions.length,
                        catalogItem.dimensions.height
                    );
                    const mat = new THREE.MeshStandardMaterial({ color: catalogItem.fallbackColor, side: THREE.DoubleSide });
                    const mesh = new THREE.Mesh(geom, mat);
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    modelGroup.add(mesh);

                    const noseGeom = new THREE.BoxGeometry(
                        catalogItem.dimensions.width * 0.5,
                        catalogItem.dimensions.length * 0.2,
                        catalogItem.dimensions.height * 0.2
                    );
                    const noseMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
                    const nose = new THREE.Mesh(noseGeom, noseMat);
                    nose.position.y = catalogItem.dimensions.length / 2;
                    nose.castShadow = true;
                    modelGroup.add(nose);

                    // PLAN DE RÉCEPTION D'OMBRE (ShadowMaterial - non interactif)
                    const shadowGeom = new THREE.PlaneGeometry(catalogItem.dimensions.width * 20, catalogItem.dimensions.length * 20);
                    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.4 });
                    const shadowPlane = new THREE.Mesh(shadowGeom, shadowMat);
                    shadowPlane.position.z = 0.1;
                    shadowPlane.receiveShadow = true;
                    shadowPlane.raycast = () => { }; // Exclure du raycasting
                    group.add(shadowPlane);

                    // CERCLE DE PORTÉE 3D (Animé)
                    const rangeGroup = new THREE.Group();
                    rangeGroup.name = "rangeGroup";
                    rangeGroup.visible = false;
                    group.add(rangeGroup);
                    group._catalogId = vData.catalogId; // Sauvegarder pour l'anim
                    group._instanceId = vData.instanceId; // Sauvegarder pour le raycast

                    // Remplissage transparent
                    const rangeFillGeom = new THREE.CircleGeometry(1, 64);
                    const rangeFillMat = new THREE.MeshBasicMaterial({
                        color: catalogItem.fallbackColor,
                        transparent: true,
                        opacity: 0.05,
                        side: THREE.DoubleSide
                    });
                    const rangeFill = new THREE.Mesh(rangeFillGeom, rangeFillMat);
                    rangeFill.raycast = () => { }; // Non interactif
                    rangeGroup.add(rangeFill);

                    // SPHÈRE DE PORTÉE (Dôme 3D - Effet Verre Réel)
                    const rangeSphereGeom = new THREE.SphereGeometry(1, 64, 64, 0, Math.PI * 2, 0, Math.PI / 2);
                    const rangeSphereMat = new THREE.MeshStandardMaterial({
                        color: catalogItem.fallbackColor,
                        transparent: true,
                        opacity: 0.22, // Légèrement plus opaque
                        roughness: 0.05,
                        metalness: 0.4,
                        emissive: catalogItem.fallbackColor,
                        emissiveIntensity: 0.3, // Plus de lueur
                        side: THREE.DoubleSide,
                        depthWrite: false
                    });
                    const rangeSphere = new THREE.Mesh(rangeSphereGeom, rangeSphereMat);
                    rangeSphere.rotation.x = Math.PI / 2;
                    rangeSphere.renderOrder = 10;
                    rangeSphere.raycast = () => { }; // Non interactif
                    rangeGroup.add(rangeSphere);

                    // GRILLE TACTIQUE (Subtile)
                    const gridGeom = new THREE.SphereGeometry(1.001, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2);
                    const gridMat = new THREE.MeshBasicMaterial({
                        color: catalogItem.fallbackColor,
                        wireframe: true,
                        transparent: true,
                        opacity: 0.08, // Très léger
                        side: THREE.DoubleSide,
                        depthWrite: false
                    });
                    const rangeGrid = new THREE.Mesh(gridGeom, gridMat);
                    rangeGrid.rotation.x = Math.PI / 2;
                    rangeGrid.renderOrder = 11;
                    rangeGrid.raycast = () => { }; // Non interactif
                    rangeGroup.add(rangeGrid);

                    // Bordure opaque (Onde)
                    const rangeStrokeGeom = new THREE.RingGeometry(0.99, 1, 64);
                    const rangeStrokeMat = new THREE.MeshBasicMaterial({
                        color: catalogItem.fallbackColor,
                        side: THREE.DoubleSide
                    });
                    const rangeStroke = new THREE.Mesh(rangeStrokeGeom, rangeStrokeMat);
                    rangeGroup.add(rangeStroke);

                    rangeGroup.position.z = 0.15; // Légèrement au dessus de l'ombre

                    scene.add(group);
                    meshes.set(vData.instanceId, group);

                    if (catalogItem.modelUrl) {
                        loader.load(catalogItem.modelUrl, (gltf) => {
                            const model = gltf.scene;
                            model.rotation.x = Math.PI / 2;

                            // Correction de la visibilité des faces (DoubleSide) et activation des ombres
                            model.traverse(child => {
                                if (child.isMesh) {
                                    child.material.side = THREE.DoubleSide;
                                    child.castShadow = true;
                                    child.receiveShadow = true;
                                }
                            });

                            model.scale.set(catalogItem.scale || 1, catalogItem.scale || 1, catalogItem.scale || 1);
                            modelGroup.add(model);

                            // Animations
                            if (gltf.animations && gltf.animations.length > 0) {
                                const mixer = new THREE.AnimationMixer(model);
                                mixers.set(vData.instanceId, mixer);
                                group._animations = gltf.animations;
                                                             
                                // Notifier le store du nombre d'animations (asynchrone car dans loader)
                                setTimeout(() => {
                                    store.updatePlacedVehicle(vData.instanceId, { animationsCount: gltf.animations.length });
                                }, 100);
                            }

                            // Cacher le cube si modèle chargé
                            mesh.visible = false;
                            nose.visible = false;
                        });
                    }
                }

                const group = meshes.get(vData.instanceId);
                const modelGroup = group.getObjectByName("modelGroup");
                const rangeGroup = group.getObjectByName("rangeGroup");

                // CALCUL DE LA POSITION RELATIVE À L'ANCRE EN MÈTRES
                const coord = mapboxgl.MercatorCoordinate.fromLngLat([vData.lng, vData.lat]);
                const metersPerUnit = 1 / anchorMercator.meterInMercatorCoordinateUnits();

                const dx = (coord.x - anchorMercator.x) * metersPerUnit + (vData.offsetX || 0);
                const dy = (anchorMercator.y - coord.y) * metersPerUnit + (vData.offsetY || 0);

                const currentExag = store.getState().terrainExaggeration;
                const effectiveTerrainAlt = vData.terrainAltitude * currentExag;
                const dz = effectiveTerrainAlt + (vData.altitudeOffset || 0);
                group.position.set(dx, dy, dz);

                // Application des rotations seulement au modelGroup
                const rotX = currentExag > 0 ? (vData.rotationX || 0) : 0;
                const rotY = currentExag > 0 ? (vData.rotationY || 0) : 0;

                modelGroup.rotation.set(
                    rotX * Math.PI / 180,
                    rotY * Math.PI / 180,
                    -(vData.heading || 0) * Math.PI / 180
                );

                // Mise à jour de la trajectoire et de la cible 3D
                const missileSimGroup = group.getObjectByName("missileSimGroup");
                if (vData.targetLng && vData.targetLat) {
                    const targetCoord = mapboxgl.MercatorCoordinate.fromLngLat([vData.targetLng, vData.targetLat]);
                    const tax = (targetCoord.x - anchorMercator.x) * metersPerUnit;
                    const tay = (anchorMercator.y - targetCoord.y) * metersPerUnit;
                    const effectiveTargetTerrainAlt = vData.targetAltitude * currentExag;
                    const taz = effectiveTargetTerrainAlt;

                    updateTrajectoryMesh(group, vData, dx, dy, dz, tax, tay, taz);
                } else {
                    if (missileSimGroup) {
                        missileSimGroup.visible = false;
                    }
                }
            });
        }
    };

    return customLayer;
}

function updateTrajectoryMesh(group, vData, dx, dy, dz, tax, tay, taz) {
    let missileSimGroup = group.getObjectByName("missileSimGroup");
    if (!missileSimGroup) {
        missileSimGroup = new THREE.Group();
        missileSimGroup.name = "missileSimGroup";
        group.add(missileSimGroup);
    }

    missileSimGroup.visible = true;

    const endRelX = tax - dx;
    const endRelY = tay - dy;
    const endRelZ = taz - dz;

    const cacheKey = `${endRelX.toFixed(2)}_${endRelY.toFixed(2)}_${endRelZ.toFixed(2)}_${vData.missileRangeKm || 20}`;
    if (group._lastCacheKey === cacheKey) {
        return;
    }
    group._lastCacheKey = cacheKey;

    const oldTube = missileSimGroup.getObjectByName("trajectoryTube");
    if (oldTube) {
        missileSimGroup.remove(oldTube);
        oldTube.geometry.dispose();
        oldTube.material.dispose();
    }
    const oldTarget = missileSimGroup.getObjectByName("targetMarker");
    if (oldTarget) {
        oldTarget.traverse(child => {
            if (child.isMesh) {
                child.geometry.dispose();
                child.material.dispose();
            }
        });
        missileSimGroup.remove(oldTarget);
    }

    const startPt = new THREE.Vector3(0, 0, 0);
    const endPt = new THREE.Vector3(endRelX, endRelY, endRelZ);

    const distance = Math.sqrt(endRelX * endRelX + endRelY * endRelY);
    const peakHeight = Math.max(50, distance * 0.2); // arc parabolique

    const controlPt = new THREE.Vector3(
        endRelX / 2,
        endRelY / 2,
        Math.max(0, endRelZ) + peakHeight
    );

    const curve = new THREE.QuadraticBezierCurve3(startPt, controlPt, endPt);
    group._missileCurve = curve;
    // Stocker la longueur pour ne pas la recalculer à chaque frame de rendu
    group._missileCurveLength = curve.getLength();

    // Tailles TOUTES proportionnelles à la distance horizontale réelle
    // → visibles à n'importe quel niveau de zoom de la carte
    const tubeRadius = Math.max(10, distance * 0.003);  // ex. 30 m pour 10 km

    // Tube 3D de trajectoire - Utilisation d'une ligne avec épaisseur constante
    const linePoints = curve.getPoints(64); // 64 segments pour la courbe
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(linePoints);

    // Créer un material pour la ligne
    const lineMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        linewidth: 8, // Épaisseur fixe
        transparent: true,
        opacity: 0.9
    });

    // Créer la ligne
    const trajectoryLine = new THREE.Line(lineGeometry, lineMaterial);
    trajectoryLine.name = "trajectoryTube";
    trajectoryLine.raycast = () => { };
    missileSimGroup.add(trajectoryLine);

    // Cible — anneaux + faisceau laser vertical, tailles proportionnelles
    const targetGroup = new THREE.Group();
    targetGroup.name = "targetMarker";
    targetGroup.position.copy(endPt);

    // Calculer les tailles proportionnelles à la distance
    const sizeMultiplier = Math.max(1, distance / 10000); // Normaliser en fonction d'une distance de référence
    const ringInner = Math.max(20, distance * 0.006 * sizeMultiplier);
    const ringOuter = Math.max(35, distance * 0.010 * sizeMultiplier);
    const laserW = Math.max(5, distance * 0.002 * sizeMultiplier);
    const laserH = Math.max(500, distance * 0.25 * sizeMultiplier);

    const innerRGeom = new THREE.RingGeometry(ringInner * 0.05, ringInner, 64);
    const innerRMat = new THREE.MeshBasicMaterial({ color: 0xe74c3c, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
    const innerR = new THREE.Mesh(innerRGeom, innerRMat);
    targetGroup.add(innerR);

    const outerRGeom = new THREE.RingGeometry(ringInner * 1.4, ringOuter, 64);
    const outerRMat = new THREE.MeshBasicMaterial({ color: 0xe74c3c, side: THREE.DoubleSide, transparent: true, opacity: 0.75 });
    const outerR = new THREE.Mesh(outerRGeom, outerRMat);
    targetGroup.add(outerR);


    // Replace cylinder with a red vector line
    const lineMaterial2 = new THREE.LineBasicMaterial({ color: 0xe74c3c });
    const linePoints2 = [];
    linePoints2.push(new THREE.Vector3(0, 0, 0)); // Start point
    linePoints2.push(new THREE.Vector3(0, 0, 100000)); // End point (along Z-axis, same length as laserH)
    const lineGeometry2 = new THREE.BufferGeometry().setFromPoints(linePoints2);
    const laser2 = new THREE.Line(lineGeometry2, lineMaterial2);
    laser2.position.z = 0  ; // Center the line like the cylinder was
    laser2.raycast = () => {}; // Preserve raycast override
    targetGroup.add(laser2);

    const laserGeom = new THREE.CylinderGeometry(laserW, laserW, laserH, 8);
    const laserMat = new THREE.MeshBasicMaterial({ color: 0xe74c3c, transparent: true, opacity: 0.3 });
    const laser = new THREE.Mesh(laserGeom, laserMat);
    laser.rotation.x = Math.PI / 2;
    laser.position.z = laserH / 2;
    laser.raycast = () => { };
    targetGroup.add(laser);

    targetGroup.raycast = () => { };
    missileSimGroup.add(targetGroup);
}

 // fonction pour l'animation d'explosion sphere en degradé rouge/jaune 
function triggerImpactExplosion(group, position) {
    const missileSimGroup = group.getObjectByName("missileSimGroup");
    if (!missileSimGroup) return;

    const explGeom = new THREE.SphereGeometry(1, 32, 32);
    const explMat = new THREE.ShaderMaterial({
        uniforms: {
            color1: { value: new THREE.Color(0xff3c00) }, // Rouge
            color2: { value: new THREE.Color(0xffff00) }  // Jaune
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 color1;
            uniform vec3 color2;
            varying vec2 vUv;

            void main() {
                // Dégradé vertical sur une sphère (pôle Sud = rouge, pôle Nord = jaune)
                float low = 0.4;   // Pôle Sud (bas)
                float high = 1.0;  // Pôle Nord (haut)
                float t = smoothstep(low, high, vUv.y);

                vec3 color = mix(color1, color2, t);
                gl_FragColor = vec4(color, 0.9);
            }
        `,
        transparent: true,
        side: THREE.DoubleSide
    });
    const explMesh = new THREE.Mesh(explGeom, explMat);
    explMesh.position.copy(position);
    explMesh.rotation.set(1.5708, 0, 0);
    explMesh.raycast = () => { };
    missileSimGroup.add(explMesh);

    const startTime = performance.now();
    const duration = 800;

    function animateExplosion() {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        const scale = 1 + progress * 240;
        explMesh.scale.set(scale, scale, scale);

        explMat.opacity = 0.9 * (1 - progress);

        if (progress < 1) {
            requestAnimationFrame(animateExplosion);
            if (group._threeLayerMapRef) {
                group._threeLayerMapRef.triggerRepaint();
            }
        } else {
            missileSimGroup.remove(explMesh);
            explGeom.dispose();
            explMat.dispose();
        }
    }
    animateExplosion();
}
