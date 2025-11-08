// Pathway Management Functions
import { getFirestore, doc, getDoc, updateDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { db } from "./firebase-init.js";
import { updatePathwayStatus } from "./utils.js";
import { getLoadedTollZones } from "./zone-management.js";

let currentPathways = [];

export function getCurrentPathways() { return currentPathways; }
export function setCurrentPathways(pathways) { currentPathways = pathways; }

export function renderCurrentPathways() {
    const pathwaysListDiv = document.getElementById('pathways-list-div');
    if (!pathwaysListDiv) return;
    
    pathwaysListDiv.innerHTML = '';
    
    if (currentPathways.length === 0) { 
        pathwaysListDiv.textContent = 'No pathways defined yet. Add one above.'; 
        return; 
    }
    
    currentPathways.forEach((path, index) => {
        const pathElement = document.createElement('div');
        pathElement.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; background-color: var(--light-gray); border-radius: 0.25rem; margin-bottom: 0.5rem;";
        
        // Read the 'path' property from the object
        pathElement.textContent = path.path.join(' -> ');

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Remove';
        deleteBtn.className = 'btn btn-small btn-red';
        
        deleteBtn.onclick = () => { 
            currentPathways.splice(index, 1); 
            renderCurrentPathways(); 
        };
        
        pathElement.appendChild(deleteBtn);
        pathwaysListDiv.appendChild(pathElement);
    });
}

export function setupPathwayManager() {
    const pathwayTollZoneSelect = document.getElementById('pathway-toll-zone-select');
    const availableCamerasList = document.getElementById('available-cameras-list');
    const pathwayInput = document.getElementById('pathway-input');
    const addPathwayBtn = document.getElementById('add-pathway-btn');
    const savePathwaysBtn = document.getElementById('save-pathways-btn');
    
    if (pathwayTollZoneSelect) {
        pathwayTollZoneSelect.addEventListener('change', async () => {
            const selectedZoneId = pathwayTollZoneSelect.value;
            if (!selectedZoneId) {
                if (availableCamerasList) availableCamerasList.textContent = '';
                currentPathways = [];
                renderCurrentPathways();
                return;
            }
            try {
                const zoneDoc = await getDoc(doc(db, "tollZones", selectedZoneId));
                if (zoneDoc.exists()) {
                    const data = zoneDoc.data();
                    const operators = data.operators || {};
                    if (availableCamerasList) {
                        availableCamerasList.textContent = Object.keys(operators).join(', ') || 'No cameras registered.';
                    }
                    currentPathways = data.operatorPathways || [];
                    renderCurrentPathways();
                }
            } catch (e) { 
                updatePathwayStatus('Error fetching zone details.', true); 
            }
        });
    }

    if (addPathwayBtn) {
        addPathwayBtn.addEventListener('click', () => {
            if (!pathwayInput) return;
            const pathText = pathwayInput.value.trim();
            if (!pathText) return;
            
            const newPath = pathText.split(',').map(id => id.trim().toUpperCase());
            currentPathways.push({ path: newPath }); 
            
            renderCurrentPathways();
            pathwayInput.value = '';
            updatePathwayStatus('Pathway added. Click "Save" to commit changes.', false);
        });
    }

    if (savePathwaysBtn) {
        savePathwaysBtn.addEventListener('click', async () => {
            const selectedZoneId = pathwayTollZoneSelect?.value;
            
            console.log('Attempting to save pathways for zone:', selectedZoneId);
            console.log('Data to save:', currentPathways);

            if (!selectedZoneId) { 
                updatePathwayStatus('Please select a toll zone first.', true); 
                return; 
            }
            
            try {
                await updateDoc(doc(db, "tollZones", selectedZoneId), { 
                    operatorPathways: currentPathways 
                });
                
                updatePathwayStatus('Success! Pathways have been saved to Firebase.', false);
                console.log('Save successful!');

            } catch (e) {
                console.error("FIREBASE SAVE ERROR:", e); 
                updatePathwayStatus('Error saving pathways to Firebase. Check console for details.', true);
            }
        });
    }
}

