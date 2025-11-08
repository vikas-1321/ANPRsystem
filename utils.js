// Utility Functions
export function updateStatus(message, isError = false) {
    const statusText = document.getElementById('status-text');
    const statusContainer = document.getElementById('status-container');
    if (statusText && statusContainer) {
        statusText.textContent = message;
        statusContainer.classList.remove('hidden', 'error', 'success');
        
        // Apply appropriate styling class
        if (isError) {
            statusContainer.classList.add('error');
            statusText.style.color = 'var(--red)';
        } else {
            statusContainer.classList.add('success');
            statusText.style.color = 'var(--green)';
        }
    }
}

export function updateRegStatus(message, isError = false) {
    const regStatus = document.getElementById('reg-status');
    if (regStatus) {
        regStatus.textContent = message;
        regStatus.classList.remove('hidden');
        regStatus.style.color = isError ? 'var(--red)' : 'var(--green)';
    }
}

export function updateLoginStatus(message, isError = false) {
    const loginStatus = document.getElementById('login-status');
    if (loginStatus) {
        loginStatus.textContent = message;
        loginStatus.classList.remove('hidden');
        loginStatus.style.color = isError ? 'var(--red)' : 'var(--green)';
    }
}

export function updateZoneCreatorStatus(message, isError = false) {
    const zoneCreatorStatus = document.getElementById('zone-creator-status');
    if (zoneCreatorStatus) {
        zoneCreatorStatus.textContent = message;
        zoneCreatorStatus.classList.remove('hidden');
        zoneCreatorStatus.style.color = isError ? 'var(--red)' : 'var(--green)';
    }
}

export function updatePathwayStatus(message, isError = false) {
    const pathwayStatus = document.getElementById('pathway-status');
    if (pathwayStatus) {
        pathwayStatus.textContent = message;
        pathwayStatus.classList.remove('hidden');
        pathwayStatus.style.color = isError ? 'var(--red)' : 'var(--green)';
    }
}

export function haversineDistance(coords1, coords2) {
    const R = 6371; // km
    const dLat = (coords2.lat - coords1.lat) * (Math.PI / 180);
    const dLng = (coords2.lng - coords1.lng) * (Math.PI / 180);
    const a = Math.sin(dLat / 2)**2 + Math.cos(coords1.lat * (Math.PI / 180)) * Math.cos(coords2.lat * (Math.PI / 180)) * Math.sin(dLng / 2)**2;
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

