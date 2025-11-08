// View Navigation
export function showView(cardId) {
    const mainMenuCard = document.getElementById('main-menu-card');
    const zoneCreatorCard = document.getElementById('zone-creator-card');
    const registrationCard = document.getElementById('registration-card');
    const loginCard = document.getElementById('login-card');
    const operatorCard = document.getElementById('operator-card');
    const pathwayManagerCard = document.getElementById('pathway-manager-card');
    
    [mainMenuCard, zoneCreatorCard, registrationCard, loginCard, operatorCard, pathwayManagerCard].forEach(card => {
        card.classList.toggle('hidden', card.id !== cardId);
    });
}

// Expose to global scope for HTML onclick handlers
window.showView = showView;

