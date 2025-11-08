// Firestore Live Listener for Vehicle Trips
import { getFirestore, collection, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { db } from "./firebase-init.js";
import { updateStatus } from "./utils.js";

export function setupTripListener() {
    const resultsTable = document.getElementById('results-table');
    if (!resultsTable) return;
    
    const q = query(collection(db, "vehicle_trips"), orderBy("lastSightingTimestamp", "desc"));
    onSnapshot(q, (snapshot) => {
        resultsTable.innerHTML = '';
        snapshot.forEach((doc) => {
            const trip = doc.data();
            const date = trip.lastSightingTimestamp ? trip.lastSightingTimestamp.toDate().toLocaleString('en-IN') : '...';
            
            // Determine registration status
            const isRegistered = trip.isRegistered !== undefined ? trip.isRegistered : null;
            let registrationStatus = 'Unknown';
            let registrationClass = 'status-unknown';
            
            if (isRegistered === true) {
                registrationStatus = 'Registered';
                registrationClass = 'status-registered';
            } else if (isRegistered === false) {
                registrationStatus = 'Unregistered';
                registrationClass = 'status-unregistered';
            }
            
            const row = document.createElement('tr');
            row.innerHTML = `<td>${date}</td><td class="plate-mono">${trip.plate}</td><td>${trip.vehicleType || 'N/A'}</td><td class="${trip.status === 'active' ? 'status-active' : 'status-completed'}">${trip.status}</td><td class="${registrationClass}">${registrationStatus}</td><td>${trip.tollZoneName || 'N/A'}</td><td>${trip.lastCheckpoint || 'N/A'}</td><td>${trip.totalToll ? `₹${trip.totalToll.toFixed(2)}` : '₹0.00'}</td>`;
            resultsTable.appendChild(row);
        });
    }, (error) => {
         console.error("Firestore query failed: ", error);
         if (error.code === 'failed-precondition') { 
             updateStatus("Error: Database index is missing. Check browser console for a link to create it.", true); 
         }
    });
}

