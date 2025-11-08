// ANPR Functions
import { getFirestore, collection, query, where, getDocs, doc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js";
import { db, storage } from "./firebase-init.js";
import { PLATE_RECOGNIZER_API_KEY } from "./config.js";
import { updateStatus } from "./utils.js";
import { getLoggedInOperator } from "./auth-functions.js";

let finalizedPlates = new Set();
let candidatePlates = new Map();
let autoScanInterval = null;
let cameraStream = null;

export function getCameraStream() { return cameraStream; }
export function setCameraStream(stream) { cameraStream = stream; }
export function getAutoScanInterval() { return autoScanInterval; }
export function setAutoScanInterval(interval) { autoScanInterval = interval; }

export async function startCamera() {
    const btn = document.getElementById('start-camera-btn');
    const videoFeed = document.getElementById('video-feed');
    
    if (cameraStream) return; // Already running, do nothing

    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        videoFeed.srcObject = cameraStream;
        await videoFeed.play();
        if (btn) btn.textContent = "Stop Scanner"; // Set button text to "Stop"
        updateStatus("Scanner active. Aim at a license plate.", false);
        finalizedPlates.clear();
        candidatePlates.clear();
        startAutoScanner();
    } catch (err) {
        updateStatus("Error: Could not access camera.", true);
    }
}

export function startAutoScanner() {
    const videoFeed = document.getElementById('video-feed');
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    
    autoScanInterval = setInterval(async () => {
        if (!cameraStream || !videoFeed) return;
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
        } catch (error) { 
            console.error("Frame processing error:", error); 
        }
    }, 1000); 
}

export async function processSighting(plateNumber, vehicleType, compressedFile) {
    const loggedInOperator = getLoggedInOperator();
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
            // Find the user ID associated with this license plate
            const usersRef = collection(db, "users");
            const userQuery = query(usersRef, where("vehicleNumber", "==", plateNumber.replace(/-/g, '')));
            const userSnapshot = await getDocs(userQuery);
            const vehicleOwnerId = userSnapshot.empty ? null : userSnapshot.docs[0].id;
            const isVehicleRegistered = !userSnapshot.empty;
            
            // Check if vehicle is registered and display appropriate message
            if (!isVehicleRegistered) {
                updateStatus(`⚠️ Vehicle not registered: ${plateNumber}`, true);
            }
            
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
                lastGpsUpdateTimestamp: null,
                isRegistered: isVehicleRegistered // Flag to indicate if vehicle is registered
            };
            await setDoc(tripDocRef, tripData);
            
            // Show success message for registered vehicles only
            if (isVehicleRegistered) {
                updateStatus(`✅ Registered vehicle detected: ${plateNumber}. Trip started at ${cameraID}.`, false);
            } else {
                // Keep the warning message visible for unregistered vehicles
                // Message already displayed above
            }
        
        } else {
            // An active trip exists. Just update the last checkpoint.
            // The backend function will handle the toll calculation.
            tripDocRef = querySnapshot.docs[0].ref; 
            const tripData = querySnapshot.docs[0].data();

            if (tripData.lastCheckpoint === cameraID) {
                throw new Error("Vehicle already scanned at this checkpoint.");
            }

            // Check registration status (use existing flag if available, otherwise check again)
            let isVehicleRegistered = tripData.isRegistered !== undefined ? tripData.isRegistered : null;
            
            // If registration status is not set in trip data, check it now
            if (isVehicleRegistered === null || isVehicleRegistered === undefined) {
                const usersRef = collection(db, "users");
                const userQuery = query(usersRef, where("vehicleNumber", "==", plateNumber.replace(/-/g, '')));
                const userSnapshot = await getDocs(userQuery);
                isVehicleRegistered = !userSnapshot.empty;
            }

            const updateData = {
                lastSightingTimestamp: serverTimestamp(),
                lastCheckpoint: cameraID,
                isRegistered: isVehicleRegistered // Ensure registration status is always set
            };
            
            // Only an 'EDGE' camera can complete a trip
            if (cameraType === 'EDGE') {
                updateData.status = 'completed';
            }
            
            await updateDoc(tripDocRef, updateData);
            
            // Display appropriate message based on registration status
            if (updateData.status === 'completed') {
                if (!isVehicleRegistered) {
                    updateStatus(`⚠️ Unregistered vehicle ${plateNumber} trip COMPLETED at ${cameraID}.`, true);
                } else {
                    updateStatus(`✅ Trip for ${plateNumber} COMPLETED at ${cameraID}.`, false);
                }
            } else {
                // For intermediate checkpoints, show registration status
                if (!isVehicleRegistered) {
                    updateStatus(`⚠️ Vehicle not registered: ${plateNumber} (Checkpoint: ${cameraID})`, true);
                } else {
                    updateStatus(`✅ Trip for ${plateNumber} updated at ${cameraID}.`, false);
                }
            }
        }
        
        // Upload image
        const storageRef = ref(storage, `uploads/${tripDocRef.id}/${cameraID}.jpg`);
        await uploadBytes(storageRef, compressedFile);

    } catch (error) {
        updateStatus(error.message, true);
    }
}

export function setupANPRListeners() {
    const startCameraBtn = document.getElementById('start-camera-btn');
    if (startCameraBtn) {
        startCameraBtn.addEventListener('click', async () => {
            if (cameraStream) {
                // Stop scanner
                if (cameraStream) cameraStream.getTracks().forEach(track => track.stop());
                if (autoScanInterval) clearInterval(autoScanInterval);
                cameraStream = null;
                autoScanInterval = null;
                const { logout } = await import("./auth-functions.js");
                logout(null, null);
            } else {
                startCamera(); // If not running, start it
            }
        });
    }
}

