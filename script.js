import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, collection, query, where, onSnapshot, serverTimestamp, orderBy, addDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js";
import { geohashForLocation } from 'https://cdn.skypack.dev/geofire-common';

const firebaseConfig = {
    apiKey: "AIzaSyBA7J827tCkWRs4NnKs03fKrlL_Aw7d1_Q",
    authDomain: "my-location-app-c3481.firebaseapp.com",
    databaseURL: "https://my-location-app-c3481-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "my-location-app-c3481",
    storageBucket: "my-location-app-c3481.appspot.com",
    messagingSenderId: "215068074496",
    appId: "1:215068074496:web:ed5214d71e02ac4215aee5"
};

const PLATE_RECOGNIZER_API_KEY = "d14843c5a49518d292466de3adf98a51a1561cd0";
const GOOGLE_MAPS_API_KEY = "AIzaSyANrvOGcFi2KjaHgt9wIn1Y90g0GDlSPOQ"; // Key is stored here now

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// --- Global Variables ---
const mainMenuCard = document.getElementById('main-menu-card');
const zoneCreatorCard = document.getElementById('zone-creator-card');
const registrationCard = document.getElementById('registration-card');
const loginCard = document.getElementById('login-card');
const operatorCard = document.getElementById('operator-card');
const pathwayManagerCard = document.getElementById('pathway-manager-card');
const statusText = document.getElementById('status-text');
const statusContainer = document.getElementById('status-container');
const resultsTable = document.getElementById('results-table');
const regStatus = document.getElementById('reg-status');
const loginStatus = document.getElementById('login-status');
const tollZoneSelect = document.getElementById('toll-zone-select');
const videoFeed = document.getElementById('video-feed');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const pathwayTollZoneSelect = document.getElementById('pathway-toll-zone-select');
const availableCamerasList = document.getElementById('available-cameras-list');
const pathwayInput = document.getElementById('pathway-input');
const addPathwayBtn = document.getElementById('add-pathway-btn');
const pathwaysListDiv = document.getElementById('pathways-list-div');
const savePathwaysBtn = document.getElementById('save-pathways-btn');
const pathwayStatus = document.getElementById('pathway-status');
const zoneNameInput = document.getElementById('zone-name-input');
const saveZoneBtn = document.getElementById('save-zone-btn');
const zoneCreatorStatus = document.getElementById('zone-creator-status');

let map, marker, zoneCreatorMap, newZoneCoordinates = null, cameraStream = null, loggedInOperator = null;
let autoScanInterval = null, loadedTollZones = [], currentMapPolygon = null, currentPathways = [];
let finalizedPlates = new Set(), candidatePlates = new Map();
let selectedLocation = null; // Declare selectedLocation in the global scope
const TOLL_RATE_PER_METER = 1;

// --- View Navigation ---
function showView(cardId) {
    [mainMenuCard, zoneCreatorCard, registrationCard, loginCard, operatorCard, pathwayManagerCard].forEach(card => {
        card.classList.toggle('hidden', card.id !== cardId);
    });
    // Init maps on-demand. This is fine because the data will already be loaded.
    if (cardId === 'zone-creator-card' && !zoneCreatorMap) initZoneCreatorMap();
    if (cardId === 'registration-card' && !map) initMap();
}
window.showView = showView;

// --- Main Initialization Function ---
function initPage() {
    if (window.google && window.google.maps) {
        // This is the single starting point for loading data.
        loadTollZones(); 
    } else {
        console.error("Google Maps API failed to load.");
    }
}
// Expose the initPage function to the global scope
window.initPage = initPage;

// --- Map Functions ---
function initMap() {
    const defaultPos = { lat: 12.9716, lng: 77.5946 };
    map = new google.maps.Map(document.getElementById("map"), { center: defaultPos, zoom: 12 });
    marker = new google.maps.Marker({ map: null, title: "Selected Location" });
    map.addListener("click", (e) => {
        const newPos = e.latLng;
        marker.setPosition(newPos); 
        marker.setMap(map); 
        if (currentMapPolygon && google.maps.geometry.poly.containsLocation(newPos, currentMapPolygon)) {
            selectedLocation = { lat: newPos.lat(), lng: newPos.lng() };
            updateRegStatus("Location selected. Ready to register.", false);
        } else {
            selectedLocation = null; 
            updateRegStatus("Error: Camera must be placed inside the selected toll zone.", true);
        }
    });
}

function initZoneCreatorMap() {
    const defaultPos = { lat: 12.9716, lng: 77.5946 };
    zoneCreatorMap = new google.maps.Map(document.getElementById('zone-creator-map'), { center: defaultPos, zoom: 12 });
    const drawingManager = new google.maps.drawing.DrawingManager({
        drawingMode: google.maps.drawing.OverlayType.POLYGON,
        drawingControl: true,
        drawingControlOptions: { position: google.maps.ControlPosition.TOP_CENTER, drawingModes: ['polygon'] },
        polygonOptions: { fillColor: '#0d6efd', fillOpacity: 0.2, strokeWeight: 2, strokeColor: '#0d6efd', editable: true },
    });
    drawingManager.setMap(zoneCreatorMap);

    google.maps.event.addListener(drawingManager, 'polygoncomplete', (polygon) => {
        newZoneCoordinates = [];
        polygon.getPath().getArray().forEach(vertex => {
            newZoneCoordinates.push({ lat: vertex.lat(), lng: vertex.lng() });
        });
        drawingManager.setDrawingMode(null);
        updateZoneCreatorStatus('Polygon drawn. Enter a name and click save.', false);
    });
}

async function loadTollZones() {
     try {
        const zonesSnapshot = await getDocs(collection(db, "tollZones"));
        tollZoneSelect.innerHTML = '<option value="">Select a zone</option>';
        pathwayTollZoneSelect.innerHTML = '<option value="">Select a zone</option>';
        loadedTollZones = []; 
        
        if (zonesSnapshot.empty) {
            const msg = '<option value="">No zones found. Create one first.</option>';
            tollZoneSelect.innerHTML = msg;
            pathwayTollZoneSelect.innerHTML = msg;
            return;
        }
        
        zonesSnapshot.forEach(doc => {
            const zone = doc.data();
            if (zone.name && zone.coordinates && zone.coordinates.length > 0) { 
                const bounds = new google.maps.LatLngBounds();
                const googleMapsCoords = zone.coordinates.map(p => {
                    const latLng = new google.maps.LatLng(p.lat, p.lng);
                    bounds.extend(latLng);
                    return latLng;
                });
                loadedTollZones.push({
                    id: doc.id, name: zone.name, coordinates: googleMapsCoords, 
                    center: bounds.getCenter().toJSON()
                });
                const option = document.createElement('option');
                option.value = doc.id; 
                option.textContent = zone.name; 
                tollZoneSelect.appendChild(option);
                pathwayTollZoneSelect.appendChild(option.cloneNode(true));
            }
        });
        if (loadedTollZones.length > 0) {
            tollZoneSelect.dispatchEvent(new Event('change'));
            pathwayTollZoneSelect.dispatchEvent(new Event('change'));
        }
    } catch (err) {
        console.error("Error loading toll zones: ", err);
        updateRegStatus("Error loading toll zones.", true);
    }
}

function displayZoneOnMap(zone) {
    if (!map) return;
    if (currentMapPolygon) currentMapPolygon.setMap(null);
    if (marker) marker.setMap(null); 
    selectedLocation = null; 
    currentMapPolygon = new google.maps.Polygon({
        paths: zone.coordinates, strokeColor: "#0d6efd", strokeOpacity: 0.8,
        strokeWeight: 2, fillColor: "#0d6efd", fillOpacity: 0.05, map: map, clickable: false 
    });
}

tollZoneSelect.addEventListener('change', () => {
    const selectedZoneId = tollZoneSelect.value;
    const selectedZone = loadedTollZones.find(zone => zone.id === selectedZoneId);
    if (selectedZone && map) {
        map.panTo(selectedZone.center);
        map.setZoom(14);
        displayZoneOnMap(selectedZone); 
    }
});

// --- Auth & Registration Functions ---

async function registerCamera() {
    const password = document.getElementById('register-password').value;
    const cameraID = document.getElementById('register-camera-id').value;
    const cameraType = document.getElementById('register-camera-type').value; 
    const tollZoneId = tollZoneSelect.value;
    if (!password || !cameraID || !tollZoneId || !selectedLocation) {
        updateRegStatus("Error: All fields and a selected map location are required.", true); return;
    }
    try {
        const zoneDocRef = doc(db, "tollZones", tollZoneId);
        const zoneSnap = await getDoc(zoneDocRef);
        if (!zoneSnap.exists()) throw new Error("Selected toll zone not found.");

        const zoneData = zoneSnap.data();
        const operators = zoneData.operators || {};
        if (operators[cameraID]) throw new Error(`Camera ID ${cameraID} is already registered.`);
        
        const newOperatorData = {
            password, cameraID, cameraType, tollZoneId, 
            tollZoneName: tollZoneSelect.options[tollZoneSelect.selectedIndex].text, 
            location: selectedLocation
        };

        const updateData = { [`operators.${cameraID}`]: newOperatorData };
        if (Object.keys(operators).length === 0) {
            updateData.geohash = geohashForLocation([selectedLocation.lat, selectedLocation.lng], 7);
        }
        await updateDoc(zoneDocRef, updateData);
        updateRegStatus(`Success: Operator ${cameraID} registered.`, false);
    } catch (e) {
        updateRegStatus(e.message, true);
    }
}
document.getElementById('register-camera-btn').addEventListener('click', registerCamera);

async function login() {
    const cameraID = document.getElementById('login-cameraid').value;
    const password = document.getElementById('login-password').value;
    if (!cameraID || !password) {
        updateLoginStatus("Error: All fields are required.", true); return;
    }
    try {
        const zonesSnapshot = await getDocs(collection(db, "tollZones"));
        if (zonesSnapshot.empty) throw new Error("No toll zones found.");

        let operatorData = null;
        for (const zoneDoc of zonesSnapshot.docs) {
            const operators = zoneDoc.data().operators || {};
            if (operators[cameraID]) {
                if (operators[cameraID].password === password) {
                    operatorData = operators[cameraID];
                    break; 
                } else {
                    throw new Error("Incorrect password.");
                }
            }
        }
        if (!operatorData) throw new Error("Camera ID not found.");

        loggedInOperator = operatorData;
        showView('operator-card');
        const header = document.getElementById('operator-header');
        header.textContent = `Logged in as: ${loggedInOperator.cameraID}`;
        header.style.color = loggedInOperator.cameraType === 'EDGE' ? "var(--green)" : "var(--blue)";
        document.getElementById('login-cameraid').value = '';
        document.getElementById('login-password').value = '';
        loginStatus.classList.add('hidden');
    } catch (e) {
        updateLoginStatus(e.message, true);
    }
}
document.getElementById('login-btn').addEventListener('click', login);

function logout() {
    if (cameraStream) cameraStream.getTracks().forEach(track => track.stop());
    if (autoScanInterval) clearInterval(autoScanInterval);
    cameraStream = null; autoScanInterval = null; loggedInOperator = null;
    document.getElementById('start-camera-btn').textContent = "Start Auto-Scanner";
    showView('main-menu-card');
}
document.getElementById('logout-btn').addEventListener('click', logout);

// --- Operator & ANPR Functions ---

document.getElementById('start-camera-btn').addEventListener('click', async () => {
    const btn = document.getElementById('start-camera-btn');
    if (cameraStream) return logout();
    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        videoFeed.srcObject = cameraStream;
        await videoFeed.play();
        btn.textContent = "Stop Scanner";
        updateStatus("Scanner active. Aim at a license plate.", false);
        finalizedPlates.clear(); candidatePlates.clear();
        startAutoScanner();
    } catch (err) {
        updateStatus("Error: Could not access camera.", true);
    }
});

function startAutoScanner() {
    autoScanInterval = setInterval(async () => {
        if (!cameraStream) return;
        canvas.width = videoFeed.videoWidth;
        canvas.height = videoFeed.videoHeight;
        ctx.drawImage(videoFeed, 0, 0, canvas.width, canvas.height);
        const capturedBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
        if (!capturedBlob) return;

        try {
            const compressedFile = await imageCompression(capturedBlob, { maxSizeMB: 0.5, maxWidthOrHeight: 1280 });
            const formData = new FormData();
            formData.append("upload", compressedFile, "frame.jpg");
            formData.append("regions", "in");
            const response = await fetch("https://api.platerecognizer.com/v1/plate-reader/", {
                method: "POST", headers: { "Authorization": `Token ${PLATE_RECOGNIZER_API_KEY}` }, body: formData,
            });
            const resultData = await response.json();
            if (!resultData.results || resultData.results.length === 0) return;
                
            const bestResult = resultData.results[0];
            const newPlate = bestResult.plate.toUpperCase();
            if (bestResult.score < 0.88 || newPlate.length < 8 || finalizedPlates.has(newPlate)) return;

            const count = (candidatePlates.get(newPlate) || 0) + 1;
            candidatePlates.set(newPlate, count);

            if (count >= 2) { 
                finalizedPlates.add(newPlate);
                candidatePlates.delete(newPlate);
                updateStatus(`Plate ${newPlate} detected! Processing...`, false);
                await processSighting(newPlate, bestResult.vehicle?.type || "N/A", compressedFile);
                setTimeout(() => finalizedPlates.delete(newPlate), 10000); // 10s cooldown
            }
        } catch (error) { console.error("Frame processing error:", error); }
    }, 1000); 
}

async function processSighting(plateNumber, vehicleType, compressedFile) {
            if (!loggedInOperator) return;

            try {
                const tripsRef = collection(db, "vehicle_trips");
                const q = query(tripsRef, 
                    where("plate", "==", plateNumber), 
                    where("status", "==", "active"), 
                    where("tollZoneId", "==", loggedInOperator.tollZoneId)
                );
                const querySnapshot = await getDocs(q);
                const isNewTrip = querySnapshot.empty;
                const { location, cameraType, cameraID } = loggedInOperator;

                let tripDocRef;

                if (isNewTrip) {
                    // --- This part is unchanged ---
                    // Find the user ID associated with this license plate
                    const usersRef = collection(db, "users");
                    const userQuery = query(usersRef, where("vehicleNumber", "==", plateNumber.replace(/-/g, '')));
                    const userSnapshot = await getDocs(userQuery);
                    const vehicleOwnerId = userSnapshot.empty ? null : userSnapshot.docs[0].id;
                    
                    const newTripId = Date.now().toString();
                    tripDocRef = doc(db, "vehicle_trips", newTripId);

                    const tripData = {
                        plate: plateNumber,
                        userId: vehicleOwnerId,
                        vehicleType: vehicleType,
                        status: 'active',
                        tollZoneId: loggedInOperator.tollZoneId,
                        tollZoneName: loggedInOperator.tollZoneName,
                        entryTimestamp: serverTimestamp(),
                        entryLocation: location, // This is the first camera's location
                        lastSightingTimestamp: serverTimestamp(),
                        lastCheckpoint: cameraID,
                        calculationMethod: 'ANPR', // Default to ANPR
                        totalToll: 0,
                        lastKnownGpsLocation: null,
                        lastGpsUpdateTimestamp: null
                    };
                    await setDoc(tripDocRef, tripData);
                    updateStatus(`New trip for ${plateNumber} started at ${cameraID}.`);
                
                } else {
                    // --- THIS IS THE SIMPLIFIED PART ---
                    // An active trip exists. Just update the last checkpoint.
                    // The backend function will handle the toll calculation.
                    tripDocRef = querySnapshot.docs[0].ref; 
                    const tripData = querySnapshot.docs[0].data();

                    if (tripData.lastCheckpoint === cameraID) {
                        throw new Error("Vehicle already scanned at this checkpoint.");
                    }

                    const updateData = {
                        lastSightingTimestamp: serverTimestamp(),
                        lastCheckpoint: cameraID,
                    };
                    
                    // Only an 'EDGE' camera can complete a trip
                    if (cameraType === 'EDGE') {
                        updateData.status = 'completed';
                    }
                    
                    await updateDoc(tripDocRef, updateData);
                    
                    if (updateData.status === 'completed') {
                        updateStatus(`Trip for ${plateNumber} COMPLETED at ${cameraID}.`);
                    } else {
                        updateStatus(`Trip for ${plateNumber} updated at ${cameraID}.`);
                    }
                }
                
                // Upload image (no change)
                const storageRef = ref(storage, `uploads/${tripDocRef.id}/${cameraID}.jpg`);
                await uploadBytes(storageRef, compressedFile);

            } catch (error) {
                updateStatus(error.message, true);
            }
        }

// --- Helper & Utility Functions ---

async function getCameraLocation(cameraId, tollZoneId) {
    if (!tollZoneId) {
        const zonesSnapshot = await getDocs(collection(db, "tollZones"));
        for (const zoneDoc of zonesSnapshot.docs) {
            const operators = zoneDoc.data().operators || {};
            if (operators[cameraId]) return operators[cameraId].location;
        }
    } else {
        const zoneDoc = await getDoc(doc(db, "tollZones", tollZoneId));
        if (zoneDoc.exists()) {
            const operators = zoneDoc.data().operators || {};
            if (operators[cameraId]) return operators[cameraId].location;
        }
    }
    throw new Error(`Camera ${cameraId} not registered.`);
}

function updateStatus(message, isError = false) { statusText.textContent = message; statusContainer.classList.remove('hidden'); statusText.style.color = isError ? 'var(--red)' : 'var(--green)'; }
function updateRegStatus(message, isError = false) { regStatus.textContent = message; regStatus.classList.remove('hidden'); regStatus.style.color = isError ? 'var(--red)' : 'var(--green)'; }
function updateLoginStatus(message, isError = false) { loginStatus.textContent = message; loginStatus.classList.remove('hidden'); loginStatus.style.color = isError ? 'var(--red)' : 'var(--green)'; }

function haversineDistance(coords1, coords2) {
    const R = 6371; // km
    const dLat = (coords2.lat - coords1.lat) * (Math.PI / 180);
    const dLng = (coords2.lng - coords1.lng) * (Math.PI / 180);
    const a = Math.sin(dLat / 2)**2 + Math.cos(coords1.lat * (Math.PI / 180)) * Math.cos(coords2.lat * (Math.PI / 180)) * Math.sin(dLng / 2)**2;
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// --- Firestore Live Listener ---
const q = query(collection(db, "vehicle_trips"), orderBy("lastSightingTimestamp", "desc"));
onSnapshot(q, (snapshot) => {
    resultsTable.innerHTML = '';
    snapshot.forEach((doc) => {
        const trip = doc.data();
        const date = trip.lastSightingTimestamp ? trip.lastSightingTimestamp.toDate().toLocaleString('en-IN') : '...';
        const row = document.createElement('tr');
        row.innerHTML = `<td>${date}</td><td class="plate-mono">${trip.plate}</td><td>${trip.vehicleType || 'N/A'}</td><td class="${trip.status === 'active' ? 'status-active' : 'status-completed'}">${trip.status}</td><td>${trip.tollZoneName || 'N/A'}</td><td>${trip.lastCheckpoint || 'N/A'}</td><td>${trip.totalToll ? `₹${trip.totalToll.toFixed(2)}` : '₹0.00'}</td>`;
        resultsTable.appendChild(row);
    });
}, (error) => {
     console.error("Firestore query failed: ", error);
     if (error.code === 'failed-precondition') { updateStatus("Error: Database index is missing. Check browser console for a link to create it.", true); }
});

// --- Zone & Pathway Management ---

function updateZoneCreatorStatus(message, isError = false) { zoneCreatorStatus.textContent = message; zoneCreatorStatus.classList.remove('hidden'); zoneCreatorStatus.style.color = isError ? 'var(--red)' : 'var(--green)'; }

// --- Replace your old 'saveZoneBtn.addEventListener' with this ---
        saveZoneBtn.addEventListener('click', async () => {
            const zoneName = zoneNameInput.value.trim();
            if (!zoneName) {
                updateZoneCreatorStatus('Error: Toll zone name cannot be empty.', true);
                return;
            }
            if (!newZoneCoordinates || newZoneCoordinates.length < 3) {
                updateZoneCreatorStatus('Error: Please draw a valid polygon on the map (at least 3 points).', true);
                return;
            }

            // --- THIS IS THE FIX ---
            // 1. Calculate the center of the polygon
            const bounds = new google.maps.LatLngBounds();
            newZoneCoordinates.forEach(coord => {
                bounds.extend(new google.maps.LatLng(coord.lat, coord.lng));
            });
            const center = bounds.getCenter().toJSON(); // e.g., { lat: 12.34, lng: 77.12 }

            // 2. Calculate the geohash from the new center
            // We use a precision of 7 (good for city areas)
            const hash = geohashForLocation([center.lat, center.lng], 7);
            // --- END FIX ---

            try {
                const newZoneData = {
                    name: zoneName,
                    type: "polygon",
                    coordinates: newZoneCoordinates,
                    center: center, // <-- Save the center
                    geohash: hash   // <-- Save the geohash
                };
                
                await addDoc(collection(db, "tollZones"), newZoneData);
                updateZoneCreatorStatus(`Success! Zone "${zoneName}" saved.`, false);
                
                // Reset the form and reload the dropdowns
                zoneNameInput.value = '';
                newZoneCoordinates = null;
                initZoneCreatorMap(); // Re-initializes the map to clear the old polygon
                loadTollZones(); // Refresh dropdowns in other tools

            } catch (e) {
                console.error("Error saving new zone:", e);
                updateZoneCreatorStatus('Error saving zone to Firebase.', true);
            }
        });


function updatePathwayStatus(message, isError = false) { pathwayStatus.textContent = message; pathwayStatus.classList.remove('hidden'); pathwayStatus.style.color = isError ? 'var(--red)' : 'var(--green)'; }

function renderCurrentPathways() {
    pathwaysListDiv.innerHTML = '';
    if (currentPathways.length === 0) { pathwaysListDiv.textContent = 'No pathways defined yet. Add one above.'; return; }
    currentPathways.forEach((path, index) => {
        const pathElement = document.createElement('div');
        pathElement.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; background-color: var(--light-gray); border-radius: 0.25rem; margin-bottom: 0.5rem;";
        pathElement.textContent = path.join(' -> ');
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Remove';
        deleteBtn.className = 'btn btn-small btn-red';
        deleteBtn.onclick = () => { currentPathways.splice(index, 1); renderCurrentPathways(); };
        pathElement.appendChild(deleteBtn);
        pathwaysListDiv.appendChild(pathElement);
    });
}

pathwayTollZoneSelect.addEventListener('change', async () => {
    const selectedZoneId = pathwayTollZoneSelect.value;
    if (!selectedZoneId) {
        availableCamerasList.textContent = '';
        currentPathways = [];
        renderCurrentPathways();
        return;
    }
    try {
        const zoneDoc = await getDoc(doc(db, "tollZones", selectedZoneId));
        if (zoneDoc.exists()) {
            const data = zoneDoc.data();
            const operators = data.operators || {};
            availableCamerasList.textContent = Object.keys(operators).join(', ') || 'No cameras registered.';
            currentPathways = data.operatorPathways || [];
            renderCurrentPathways();
        }
    } catch (e) { updatePathwayStatus('Error fetching zone details.', true); }
});

addPathwayBtn.addEventListener('click', () => {
    const pathText = pathwayInput.value.trim();
    if (!pathText) return;
    const newPath = pathText.split(',').map(id => id.trim().toUpperCase());
    currentPathways.push(newPath);
    renderCurrentPathways();
    pathwayInput.value = '';
    updatePathwayStatus('Pathway added. Click "Save" to commit changes.', false);
});

savePathwaysBtn.addEventListener('click', async () => {
    const selectedZoneId = pathwayTollZoneSelect.value;
    if (!selectedZoneId) { updatePathwayStatus('Please select a toll zone first.', true); return; }
    try {
        await updateDoc(doc(db, "tollZones", selectedZoneId), { operatorPathways: currentPathways });
        updatePathwayStatus('Success! Pathways have been saved to Firebase.', false);
    } catch (e) {
        console.error("Error saving pathways:", e);
        updatePathwayStatus('Error saving pathways to Firebase.', true);
    }
});

// --- Load Google Maps Script ---
(function loadGoogleMapsScript() {
    const script = document.createElement('script');
    // We use 'initPage' as the callback, which we defined and exposed to 'window'
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=geometry,drawing&callback=initPage`;
    script.async = true;
    document.head.appendChild(script);
})();