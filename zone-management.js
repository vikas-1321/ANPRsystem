// Zone Management Functions
import { getFirestore, collection, getDocs, addDoc, doc, getDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { db } from "./firebase-init.js";
import { geohashForLocation } from 'https://cdn.skypack.dev/geofire-common';
import { updateRegStatus, updateZoneCreatorStatus } from "./utils.js";
import { displayZoneOnMap } from "./map-functions.js";

let loadedTollZones = [];
let newZoneCoordinates = null;
let currentPolygon = null;

export function getLoadedTollZones() { return loadedTollZones; }
export function getNewZoneCoordinates() { return newZoneCoordinates; }
export function setNewZoneCoordinates(coords) { newZoneCoordinates = coords; }
export function setCurrentPolygon(polygon) { currentPolygon = polygon; }

export async function loadTollZones() {
    try {
        const zonesSnapshot = await getDocs(collection(db, "tollZones"));
        const tollZoneSelect = document.getElementById('toll-zone-select');
        const pathwayTollZoneSelect = document.getElementById('pathway-toll-zone-select');
        
        if (tollZoneSelect) tollZoneSelect.innerHTML = '<option value="">Select a zone</option>';
        if (pathwayTollZoneSelect) pathwayTollZoneSelect.innerHTML = '<option value="">Select a zone</option>';
        loadedTollZones = []; 
        
        if (zonesSnapshot.empty) {
            const msg = '<option value="">No zones found. Create one first.</option>';
            if (tollZoneSelect) tollZoneSelect.innerHTML = msg;
            if (pathwayTollZoneSelect) pathwayTollZoneSelect.innerHTML = msg;
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
                if (tollZoneSelect) tollZoneSelect.appendChild(option);
                if (pathwayTollZoneSelect) pathwayTollZoneSelect.appendChild(option.cloneNode(true));
            }
        });
        if (loadedTollZones.length > 0) {
            if (tollZoneSelect) tollZoneSelect.dispatchEvent(new Event('change'));
            if (pathwayTollZoneSelect) pathwayTollZoneSelect.dispatchEvent(new Event('change'));
        }
    } catch (err) {
        console.error("Error loading toll zones: ", err);
        updateRegStatus("Error loading toll zones.", true);
    }
}

export function setupZoneCreator(drawingManager) {
    google.maps.event.addListener(drawingManager, 'polygoncomplete', (polygon) => {
        // Clear previous polygon if it exists
        if (currentPolygon) {
            currentPolygon.setMap(null);
        }
        currentPolygon = polygon;
        
        newZoneCoordinates = [];
        polygon.getPath().getArray().forEach(vertex => {
            newZoneCoordinates.push({ lat: vertex.lat(), lng: vertex.lng() });
        });
        drawingManager.setDrawingMode(null);
        updateZoneCreatorStatus('Polygon drawn. Enter a name and click save.', false);
    });
}

export async function saveZone() {
    const zoneNameInput = document.getElementById('zone-name-input');
    const zoneName = zoneNameInput?.value.trim();
    
    if (!zoneName) {
        updateZoneCreatorStatus('Error: Toll zone name cannot be empty.', true);
        return;
    }
    if (!newZoneCoordinates || newZoneCoordinates.length < 3) {
        updateZoneCreatorStatus('Error: Please draw a valid polygon on the map (at least 3 points).', true);
        return;
    }

    // Calculate the center of the polygon
    const bounds = new google.maps.LatLngBounds();
    newZoneCoordinates.forEach(coord => {
        bounds.extend(new google.maps.LatLng(coord.lat, coord.lng));
    });
    const center = bounds.getCenter().toJSON();
    
    // Calculate the geohash from the new center
    const hash = geohashForLocation([center.lat, center.lng], 7);

    try {
        const newZoneData = {
            name: zoneName,
            type: "polygon",
            coordinates: newZoneCoordinates,
            center: center,
            geohash: hash
        };
        
        await addDoc(collection(db, "tollZones"), newZoneData);
        updateZoneCreatorStatus(`Success! Zone "${zoneName}" saved.`, false);
        
        // Reset the form and reload the dropdowns
        if (zoneNameInput) zoneNameInput.value = '';
        newZoneCoordinates = null;
        // Clear the polygon from the map
        if (currentPolygon) {
            currentPolygon.setMap(null);
            currentPolygon = null;
        }
        loadTollZones(); // Refresh dropdowns in other tools

    } catch (e) {
        console.error("Error saving new zone:", e);
        updateZoneCreatorStatus('Error saving zone to Firebase.', true);
    }
}

export function setupZoneSelectListener(map) {
    const tollZoneSelect = document.getElementById('toll-zone-select');
    if (!tollZoneSelect) return;
    
    tollZoneSelect.addEventListener('change', () => {
        const selectedZoneId = tollZoneSelect.value;
        const selectedZone = loadedTollZones.find(zone => zone.id === selectedZoneId);
        if (selectedZone && map) {
            map.panTo(selectedZone.center);
            map.setZoom(14);
            displayZoneOnMap(selectedZone); 
        }
    });
}

export async function getCameraLocation(cameraId, tollZoneId) {
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

