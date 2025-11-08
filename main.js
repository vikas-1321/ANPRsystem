// Main Entry Point
import { GOOGLE_MAPS_API_KEY } from "./config.js";
import { loadTollZones, setupZoneSelectListener, setupZoneCreator, saveZone } from "./zone-management.js";
import { initMap, initZoneCreatorMap, getMap, getZoneCreatorMap } from "./map-functions.js";
import { showView } from "./navigation.js";
import { setupAuthListeners, logout } from "./auth-functions.js";
import { setupANPRListeners, getCameraStream, getAutoScanInterval } from "./anpr-functions.js";
import { setupPathwayManager } from "./pathway-management.js";
import { setupTripListener } from "./trip-listener.js";

// --- Global Variables ---
const mainMenuCard = document.getElementById('main-menu-card');
const zoneCreatorCard = document.getElementById('zone-creator-card');
const registrationCard = document.getElementById('registration-card');
const loginCard = document.getElementById('login-card');
const operatorCard = document.getElementById('operator-card');
const pathwayManagerCard = document.getElementById('pathway-manager-card');

let zoneCreatorDrawingManager = null;

// --- View Navigation (Enhanced) ---
function enhancedShowView(cardId) {
    [mainMenuCard, zoneCreatorCard, registrationCard, loginCard, operatorCard, pathwayManagerCard].forEach(card => {
        card.classList.toggle('hidden', card.id !== cardId);
    });
    // Init maps on-demand
    if (cardId === 'zone-creator-card' && !zoneCreatorDrawingManager) {
        const result = initZoneCreatorMap();
        zoneCreatorDrawingManager = result.drawingManager;
        setupZoneCreator(zoneCreatorDrawingManager);
    }
    if (cardId === 'registration-card' && !getMap()) {
        initMap();
        setupZoneSelectListener(getMap());
    }
}
// Override the showView from navigation.js
window.showView = enhancedShowView;

// --- Main Initialization Function ---
export function initPage() {
    if (window.google && window.google.maps) {
        // This is the single starting point for loading data.
        loadTollZones(); 
    } else {
        console.error("Google Maps API failed to load.");
    }
}

// Expose the initPage function to the global scope
window.initPage = initPage;

// Setup all event listeners
export function initializeApp() {
    setupAuthListeners();
    setupANPRListeners();
    setupPathwayManager();
    setupTripListener();
    
    // Setup zone creator save button
    const saveZoneBtn = document.getElementById('save-zone-btn');
    if (saveZoneBtn) {
        saveZoneBtn.addEventListener('click', saveZone);
    }
    
    // Setup logout button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            const cameraStream = getCameraStream();
            const autoScanInterval = getAutoScanInterval();
            logout(cameraStream, autoScanInterval);
        });
    }
    
}

// Initialize the app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

// --- Load Google Maps Script ---
(function loadGoogleMapsScript() {
    const script = document.createElement('script');
    // We use 'initPage' as the callback, which we defined and exposed to 'window'
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=geometry,drawing&callback=initPage`;
    script.async = true;
    document.head.appendChild(script);
})();

