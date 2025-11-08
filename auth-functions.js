// Authentication and Registration Functions
import { getFirestore, collection, getDocs, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { db } from "./firebase-init.js";
import { geohashForLocation } from 'https://cdn.skypack.dev/geofire-common';
import { updateRegStatus, updateLoginStatus } from "./utils.js";
import { getSelectedLocation, setSelectedLocation } from "./map-functions.js";
import { getLoadedTollZones } from "./zone-management.js";
import { showView } from "./navigation.js";

let loggedInOperator = null;

export function getLoggedInOperator() { return loggedInOperator; }
export function setLoggedInOperator(operator) { loggedInOperator = operator; }

export async function registerCamera() {
    const password = document.getElementById('register-password')?.value;
    const cameraID = document.getElementById('register-camera-id')?.value;
    const cameraType = document.getElementById('register-camera-type')?.value; 
    const tollZoneSelect = document.getElementById('toll-zone-select');
    const tollZoneId = tollZoneSelect?.value;
    const selectedLocation = getSelectedLocation();
    
    if (!password || !cameraID || !tollZoneId || !selectedLocation) {
        updateRegStatus("Error: All fields and a selected map location are required.", true); 
        return;
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

export async function login() {
    const cameraID = document.getElementById('login-cameraid')?.value;
    const password = document.getElementById('login-password')?.value;
    
    if (!cameraID || !password) {
        updateLoginStatus("Error: All fields are required.", true); 
        return;
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
        if (header) {
            header.textContent = `Logged in as: ${loggedInOperator.cameraID}`;
            header.style.color = loggedInOperator.cameraType === 'EDGE' ? "var(--green)" : "var(--blue)";
        }
        const loginCameraIdInput = document.getElementById('login-cameraid');
        const loginPasswordInput = document.getElementById('login-password');
        if (loginCameraIdInput) loginCameraIdInput.value = '';
        if (loginPasswordInput) loginPasswordInput.value = '';
        const loginStatus = document.getElementById('login-status');
        if (loginStatus) loginStatus.classList.add('hidden');
    } catch (e) {
        updateLoginStatus(e.message, true);
    }
}

export function logout(cameraStream, autoScanInterval) {
    if (cameraStream) cameraStream.getTracks().forEach(track => track.stop());
    if (autoScanInterval) clearInterval(autoScanInterval);
    loggedInOperator = null;
    const startCameraBtn = document.getElementById('start-camera-btn');
    if (startCameraBtn) startCameraBtn.textContent = "Start Auto-Scanner";
    showView('main-menu-card');
    return { cameraStream: null, autoScanInterval: null };
}

export function setupAuthListeners() {
    const registerBtn = document.getElementById('register-camera-btn');
    const loginBtn = document.getElementById('login-btn');
    
    if (registerBtn) {
        registerBtn.addEventListener('click', registerCamera);
    }
    if (loginBtn) {
        loginBtn.addEventListener('click', login);
    }
}

