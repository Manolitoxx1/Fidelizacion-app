/**
 * Buen Día Café - Club de Fidelización
 * Lógica completa de cliente: Tarjeta instantánea, QR, Mi Café Habitual,
 * Sistema de Rangos (Bronce/Plata/Oro), Estrellas, Cumpleaños, Referidos,
 * Geolocalización y Notificaciones.
 */

// 1. CONFIGURACIÓN DE FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyBYaaBUK-Y4q60d7xALpv9Oo1iB-LjdDzI",
    authDomain: "buen-dia-cafe.firebaseapp.com",
    databaseURL: "https://buen-dia-cafe-default-rtdb.firebaseio.com",
    projectId: "buen-dia-cafe",
    storageBucket: "buen-dia-cafe.firebasestorage.app",
    messagingSenderId: "1030229835388",
    appId: "1:1030229835388:web:d4d190818804f3ca8353f9",
    measurementId: "G-X2J17RETEE"
};

// Inicializar Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

// Coordenadas configurables de Buen Día Café (para geolocalización por proximidad)
// Coordenadas centrales por defecto; el barista o dueño puede ajustarlas si lo requiere
const CAFE_LOCATION = {
    lat: -33.4372,
    lng: -70.6506,
    radiusMeters: 300 // Radio de activación: 300 metros a la redonda
};

// ==========================================================
// SISTEMA DE RANGOS / NIVELES
// ==========================================================
const TIER_CONFIG = {
    1: {
        name: 'Senda Bronce',
        icon: '🥉',
        color: '#CD7F32',
        cssClass: '',
        reward: 'Café gratis',
        rewardFull: '¡Café de la casa GRATIS!'
    },
    2: {
        name: 'Senda Plata',
        icon: '🥈',
        color: '#C0C0C0',
        cssClass: 'tier-silver',
        reward: 'Café + Galleta',
        rewardFull: '¡Café + Galleta artesanal GRATIS!'
    },
    3: {
        name: 'Senda Oro',
        icon: '🥇',
        color: '#FFD700',
        cssClass: 'tier-gold',
        reward: 'Specialty + Postre',
        rewardFull: '¡Café Specialty + Postre GRATIS!'
    }
};

// Imagen del sello BDC para usar en la grilla de sellos
const GRANO_SOL_SVG = `<img src="sello.png" alt="Sello" style="width: 100%; height: 100%; object-fit: contain;">`;

const GRANO_VACIO_SVG = `<img src="grano_sol.png" alt="Sello Vacío" style="width: 100%; height: 100%; object-fit: contain;">`;

// Estado Global
let currentCustomerId = localStorage.getItem('buendia_customer_id') || null;
let currentCustomerData = null;
let customerRefListener = null;
let qrCodeInstance = null;
let proximityWatchId = null;

// ELEMENTOS DEL DOM
const cafeOpenPill = document.getElementById('cafe-open-pill');
const cafeStatusText = document.getElementById('cafe-status-text');
const birthdayBanner = document.getElementById('birthday-banner');

// Tarjeta
const cardMemberName = document.getElementById('card-member-name');
const cardMemberBadge = document.getElementById('card-member-badge');
// Tier indicator removed from UI
const qrCodeContainer = document.getElementById('qr-code');

// Café habitual
const habitualDrinkDisplay = document.getElementById('habitual-drink-display');
const habitualSpecsDisplay = document.getElementById('habitual-specs-display');
const btnOpenHabitualModal = document.getElementById('btn-open-habitual-modal');
const modalHabitual = document.getElementById('modal-habitual');
const btnCloseHabitualModal = document.getElementById('btn-close-habitual-modal');
const formHabitual = document.getElementById('form-habitual');
const inputHabitualDrink = document.getElementById('habitual-drink');
const inputHabitualShot = document.getElementById('habitual-shot');
const inputHabitualDessert = document.getElementById('habitual-dessert');
const inputHabitualNotes = document.getElementById('habitual-notes');

// Sellos y metas
const stampsProgressMessage = document.getElementById('stamps-progress-message');
const stampsCountLabel = document.getElementById('stamps-count-label');
const stampsGridContainer = document.getElementById('stamps-grid-container');

// Referidos
const btnOpenReferralModal = document.getElementById('btn-open-referral-modal');
const modalReferral = document.getElementById('modal-referral');
const btnCloseReferralModal = document.getElementById('btn-close-referral-modal');
const referralCodeDisplay = document.getElementById('referral-code-display');
const btnShareWhatsapp = document.getElementById('btn-share-whatsapp');
const btnCopyReferralLink = document.getElementById('btn-copy-referral-link');

// Proximidad y Notificaciones
const btnToggleProximity = document.getElementById('btn-toggle-proximity');
const proximityIcon = document.getElementById('proximity-icon');
const proximityTitle = document.getElementById('proximity-title');
const proximityStatus = document.getElementById('proximity-status');

// Registro
const modalRegister = document.getElementById('modal-register');
const formRegister = document.getElementById('form-register');
const inputRegName = document.getElementById('reg-name');
const inputRegPhone = document.getElementById('reg-phone');
const inputRegBirthday = document.getElementById('reg-birthday');
const btnSwitchAccount = document.getElementById('btn-switch-account');

// Toast
const appToast = document.getElementById('app-toast');
const toastTitle = document.getElementById('toast-title');
const toastDesc = document.getElementById('toast-desc');
const toastIcon = document.getElementById('toast-icon');
const toastCloseBtn = document.getElementById('toast-close-btn');

// ==========================================================
// INICIALIZACIÓN
// ==========================================================
window.addEventListener('DOMContentLoaded', () => {
    // 1. Calcular estado en vivo del local (Abierto / Cerrado)
    updateLiveCafeStatus();
    setInterval(updateLiveCafeStatus, 60000); // Actualizar cada minuto

    // 2. Comprobar parámetros URL (?id=... o ?ref=...)
    const urlParams = new URLSearchParams(window.location.search);
    const urlId = urlParams.get('id') || urlParams.get('cliente');
    const referralParam = urlParams.get('ref');

    if (referralParam) {
        sessionStorage.setItem('buendia_referral_referrer', referralParam);
    }

    if (urlId) {
        currentCustomerId = urlId;
        localStorage.setItem('buendia_customer_id', urlId);
    }

    // 3. Renderizado instantáneo desde Caché Local (Cero latencia)
    const cachedData = localStorage.getItem('buendia_cached_customer');
    if (cachedData) {
        try {
            const parsed = JSON.parse(cachedData);
            if (parsed && (!currentCustomerId || parsed.id === currentCustomerId)) {
                currentCustomerData = parsed;
                currentCustomerId = parsed.id;
                renderCustomerUI(parsed);
            }
        } catch (e) {
            console.warn('Error leyendo caché local:', e);
        }
    }

    // 4. Conectar a Firebase en tiempo real
    if (currentCustomerId) {
        loadCustomerRealtime(currentCustomerId);
    } else {
        openModal(modalRegister);
    }

    // 5. Inicializar eventos y proximidad guardada
    initEventListeners();
    checkProximityPreference();
    initServiceWorker();
    
    // Sync config from POS
    db.ref('settings/appConfig').on('value', (snap) => {
        window.APP_CONFIG = snap.val() || { storeStatus: 'auto', tiers: {} };
        updateLiveCafeStatus();
        // Re-render stamps if we already have customer data
        if (currentCustomerData) {
            renderStampsGrid(currentCustomerData.stamps || 0, currentCustomerData.tier || 1);
        }
    });
});

// ==========================================================
// ESTADO EN VIVO DEL CAFÉ (Lunes a Sábado 08:00 - 20:00)
// ==========================================================
function updateLiveCafeStatus() {
    const now = new Date();
    const day = now.getDay(); // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
    const hour = now.getHours();
    const minutes = now.getMinutes();
    const timeNum = hour + minutes / 60;

    // Horario: Lun a Vie 08:00 - 19:00, Sáb 09:00 - 19:00, Dom cerrado
    let isOpen = false;
    let closesAt = "19:00";

    if (day >= 1 && day <= 5) {
        isOpen = timeNum >= 8.0 && timeNum < 19.0;
        closesAt = "19:00";
    } else if (day === 6) {
        isOpen = timeNum >= 9.0 && timeNum < 19.0;
        closesAt = "19:00";
    }

    // Apply manual override from POS settings
    if (window.APP_CONFIG) {
        if (window.APP_CONFIG.storeStatus === 'open') isOpen = true;
        else if (window.APP_CONFIG.storeStatus === 'closed') isOpen = false;
        
        const cafeSemanaText = window.APP_CONFIG.cafeSemana;
        const cafeSemanaContainer = document.getElementById('cafe-semana-container');
        const cafeSemanaTextEl = document.getElementById('cafe-semana-text');
        
        if (cafeSemanaContainer && cafeSemanaTextEl) {
            if (cafeSemanaText) {
                cafeSemanaTextEl.textContent = cafeSemanaText;
                cafeSemanaContainer.style.display = 'block';
            } else {
                cafeSemanaContainer.style.display = 'none';
            }
        }

        const granoSemanaObj = window.APP_CONFIG.granoSemana;
        const beanOfWeekEl = document.getElementById('bean-of-week-text');
        if (beanOfWeekEl && granoSemanaObj) {
            let nombre = '';
            let desc = '';
            
            // Handle both legacy string format and new object format
            if (typeof granoSemanaObj === 'string') {
                nombre = granoSemanaObj;
            } else {
                nombre = granoSemanaObj.nombre || '';
                desc = granoSemanaObj.desc || '';
            }
            
            if (nombre) {
                let html = `<strong>${nombre}</strong>`;
                if (desc) {
                    html += `<br>${desc}`;
                }
                beanOfWeekEl.innerHTML = html;
            }
        }
    }

    if (isOpen) {
        cafeOpenPill.classList.remove('closed');
        cafeStatusText.textContent = `Abierto hasta las ${closesAt}`;
    } else {
        cafeOpenPill.classList.add('closed');
        cafeStatusText.textContent = `Cerrado • Abrimos 08:00`;
    }
}

// ==========================================================
// FIREBASE REALTIME SYNC
// ==========================================================
function loadCustomerRealtime(customerId) {
    if (customerRefListener) {
        db.ref('customers/' + customerId).off('value');
    }

    customerRefListener = db.ref('customers/' + customerId).on('value', (snap) => {
        const data = snap.val();
        if (!data) {
            // Si el cliente no existe en la base de datos
            localStorage.removeItem('buendia_customer_id');
            localStorage.removeItem('buendia_cached_customer');
            currentCustomerId = null;
            openModal(modalRegister);
            return;
        }

        // Si es la primera vez que se carga en esta sesión y aumentaron sellos, podemos animar
        if (currentCustomerData && (data.stamps || 0) > (currentCustomerData.stamps || 0)) {
            triggerStampCelebration(data.stamps, data.tier || 1);
        }

        // Detect tier up
        if (currentCustomerData && (data.tier || 1) > (currentCustomerData.tier || 1)) {
            triggerTierUpCelebration(data.tier);
        }

        currentCustomerData = data;
        localStorage.setItem('buendia_cached_customer', JSON.stringify(data));
        closeModal(modalRegister);
        renderCustomerUI(data);

        // Comprobar reenganche semanal
        checkReengagementNotification(data);
    });
}

// ==========================================================
// RENDERIZADO VISUAL DE LA TARJETA
// ==========================================================
function renderCustomerUI(data) {
    const stamps = data.stamps || 0;
    const name = data.name || 'Socio';
    const tier = data.tier || 1;
    const starsEarned = data.starsEarned || 0;

    // 1. Saludo y Nombre
    cardMemberName.textContent = `¡Hola, ${name.split(' ')[0]}!`;

    // 2. Tier / Nivel indicator
    // Tier indicator updating removed // 3. Estrellas en el badge (esquina superior derecha)
    renderStarsBadge(starsEarned);

    // 4. Código QR Dinámico
    renderQRCode(data.id || currentCustomerId);

    // 5. "Mi Café Habitual"
    const fav = data.favoriteCoffee || {
        drink: "Flat White",
        shot: "Sin shot",
        dessert: "Sin postre ni sándwich",
        notes: ""
    };
    habitualDrinkDisplay.textContent = fav.drink || 'Flat White';
    
    let specsHtml = '';
    if (fav.shot && fav.shot !== 'Sin shot') {
        specsHtml += `<span class="habitual-spec-tag">${fav.shot}</span>`;
    }
    if (fav.dessert && fav.dessert !== 'Sin postre ni sándwich') {
        specsHtml += `<span class="habitual-spec-tag">${fav.dessert}</span>`;
    }
    if (fav.notes) {
        specsHtml += `<span class="habitual-spec-tag">${fav.notes}</span>`;
    }
    if (!specsHtml) {
        specsHtml = `<span class="habitual-spec-tag">Solo café</span>`;
    }
    habitualSpecsDisplay.innerHTML = specsHtml;

    // Precargar modal de habitual
    inputHabitualDrink.value = fav.drink || "Flat White";
    inputHabitualShot.value = fav.shot || "Sin shot";
    inputHabitualDessert.value = fav.dessert || "Sin postre ni sándwich";
    inputHabitualNotes.value = fav.notes || "";

    // 6. Grilla de 10 Sellos con Grano-Sol
    renderStampsGrid(stamps, tier);

    // 7. Mensajes de progreso según tier
    renderProgressMessages(stamps, tier);

    // 8. Detección de Cumpleaños
    checkBirthdayBanner(data.birthdate);

    // 9. Código de Referido
    setupReferralUI(data);
}

// ==========================================================
// RENDERIZADO DE ESTRELLAS (BADGE SUPERIOR DERECHO)
// ==========================================================
function renderStarsBadge(starsEarned) {
    let starsHtml = '';
    for (let i = 1; i <= 3; i++) {
        if (i <= starsEarned) {
            starsHtml += `<span class="star-filled">★</span>`;
        } else {
            starsHtml += `<span class="star-empty">☆</span>`;
        }
    }
    cardMemberBadge.innerHTML = starsHtml;
}

// Renderizar Código QR
function renderQRCode(text) {
    qrCodeContainer.innerHTML = '';
    if (typeof QRCode !== 'undefined') {
        qrCodeInstance = new QRCode(qrCodeContainer, {
            text: text,
            width: 114,
            height: 114,
            colorDark: "#1A1A1A",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M
        });
    } else {
        qrCodeContainer.innerHTML = `<span style="font-family:monospace;font-size:12px;font-weight:700;color:#1A1A1A;">${text}</span>`;
    }
}

// ==========================================================
// RENDERIZAR GRILLA DE 10 SELLOS
// ==========================================================
function renderStampsGrid(stamps, tier) {
    stampsGridContainer.innerHTML = '';
    
    // Get tier configuration from POS appConfig
    let tierConfig = {};
    if (window.APP_CONFIG && window.APP_CONFIG.tiers && window.APP_CONFIG.tiers[tier]) {
        tierConfig = window.APP_CONFIG.tiers[tier];
    } else {
        // Default config if none set
        tierConfig = { 10: "Premio" };
    }

    for (let i = 1; i <= 10; i++) {
        const slot = document.createElement('div');
        const isActive = i <= stamps;
        let milestoneClass = '';
        let tagHtml = '';
        let badgeLabel = `${i}`;
        
        let prizeDesc = tierConfig[i];
        let hasPrize = prizeDesc !== undefined && prizeDesc !== null && prizeDesc !== '';

        if (hasPrize) {
            milestoneClass = ' milestone-' + i;
            if (i === 10) milestoneClass = ' milestone-10'; // Keep milestone-10 class for 10th stamp special styling
            badgeLabel = '🎁';
            tagHtml = `<span class="stamp-reward-tag" title="${prizeDesc}">PREMIO</span>`;
            if (i !== 10) {
                // If it's a sub-milestone, add a small description
                tagHtml = `<span class="stamp-reward-tag" style="font-size:0.5rem;" title="${prizeDesc}">${String(prizeDesc).substring(0, 8)}...</span>`;
            }
        }

        slot.className = `stamp-slot${isActive ? ' active' : ''}${milestoneClass}`;

        if (isActive) {
            // Sello activo: muestra grano_sol.png en negro
            slot.innerHTML = `
                ${tagHtml}
                <span class="stamp-icon">${GRANO_VACIO_SVG}</span>
            `;
        } else {
            // Sello vacío: muestra grano_sol.png en gris (grano de café sol sin letras)
            slot.innerHTML = `
                ${tagHtml}
                <span class="stamp-icon">${GRANO_VACIO_SVG}</span>
            `;
        }
        stampsGridContainer.appendChild(slot);
    }
}

// Mensajes de progreso adaptados al tier
function renderProgressMessages(stamps, tier) {
    const tierInfo = TIER_CONFIG[tier] || TIER_CONFIG[1];
    stampsCountLabel.textContent = `${Math.min(stamps, 10)} / 10`;

    if (stamps >= 10) {
        stampsProgressMessage.textContent = `🎉 ¡${tierInfo.rewardFull} Listo para canjear!`;
    } else {
        const remaining = 10 - stamps;
        stampsProgressMessage.textContent = `Te falta${remaining > 1 ? 'n' : ''} ${remaining} sello${remaining > 1 ? 's' : ''} para: ${tierInfo.reward}`;
    }
}

// ==========================================================
// CUMPLEAÑOS AUTOMÁTICO (SEMANA DE CUMPLEAÑOS)
// ==========================================================
function checkBirthdayBanner(birthdateStr) {
    if (!birthdateStr) {
        birthdayBanner.classList.add('hidden');
        return;
    }

    try {
        const bdate = new Date(birthdateStr + 'T00:00:00');
        const now = new Date();
        const currentYear = now.getFullYear();

        // Crear fecha de cumpleaños para este año
        const bdayThisYear = new Date(currentYear, bdate.getMonth(), bdate.getDate());
        
        // Calcular diferencia en días
        const diffMs = bdayThisYear.getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        // Si el cumpleaños fue hace menos de 4 días o es en los próximos 4 días (semana de cumpleaños)
        if (diffDays >= -4 && diffDays <= 4) {
            birthdayBanner.classList.remove('hidden');
        } else {
            birthdayBanner.classList.add('hidden');
        }
    } catch (err) {
        birthdayBanner.classList.add('hidden');
    }
}

// ==========================================================
// REFERIDOS: INVITA A UN AMIGO
// ==========================================================
function setupReferralUI(data) {
    let referralCode = data.referralCode;
    if (!referralCode) {
        // Generar código único para el socio
        const cleanName = (data.name || 'SOCIO').split(' ')[0].toUpperCase().replace(/[^A-Z]/g, '');
        referralCode = `BUENDIA-${cleanName || 'SOCIO'}-${(data.id || '').slice(-3).toUpperCase()}`;
        // Guardar en Firebase sin sobreescribir todo
        db.ref('customers/' + data.id + '/referralCode').set(referralCode);
    }

    referralCodeDisplay.textContent = referralCode;

    // Enlace de invitación
    const appBaseUrl = window.location.origin + window.location.pathname;
    const inviteUrl = `${appBaseUrl}?ref=${referralCode}`;

    const whatsappMessage = encodeURIComponent(
        `¡Hola! Te invito a Buen Día Café ☕ Únete a su club de fidelización con mi enlace y cuando tomes tu primer café, ¡ambos ganamos un sello de regalo!\nRegístrate aquí: ${inviteUrl}`
    );

    btnShareWhatsapp.href = `https://api.whatsapp.com/send?text=${whatsappMessage}`;

    btnCopyReferralLink.onclick = () => {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(inviteUrl).then(() => {
                showToast('📋 ¡Enlace copiado!', 'Pégalo en tus redes o chats para invitar a tus amigos.', '✨');
            });
        } else {
            prompt('Copia tu enlace de invitación:', inviteUrl);
        }
    };
}

// ==========================================================
// NOTIFICACIÓN POR PROXIMIDAD (GEOLOCALIZACIÓN)
// ==========================================================
function checkProximityPreference() {
    const isEnabled = localStorage.getItem('buendia_proximity_enabled') === 'true';
    if (isEnabled) {
        activateProximityTracking(false);
    }
}

function activateProximityTracking(showAlert = true) {
    if (!('geolocation' in navigator)) {
        if (showAlert) alert('Tu navegador no soporta geolocalización.');
        return;
    }

    // Solicitar permiso de notificaciones si no está concedido
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }

    proximityStatus.textContent = 'Buscando cafetería...';
    proximityIcon.textContent = '📡';

    proximityWatchId = navigator.geolocation.watchPosition(
        (position) => {
            const userLat = position.coords.latitude;
            const userLng = position.coords.longitude;
            const distance = calculateHaversineDistance(userLat, userLng, CAFE_LOCATION.lat, CAFE_LOCATION.lng);

            localStorage.setItem('buendia_proximity_enabled', 'true');
            proximityStatus.textContent = 'Activo • Avisará al pasar';
            proximityIcon.textContent = '✅';

            // Si está a menos de 300 metros
            if (distance <= CAFE_LOCATION.radiusMeters) {
                triggerProximityAlert();
            }
        },
        (error) => {
            console.warn('Error de geolocalización:', error);
            proximityStatus.textContent = 'Permiso denegado';
            proximityIcon.textContent = '📍';
            localStorage.setItem('buendia_proximity_enabled', 'false');
        },
        { enableHighAccuracy: true, maximumAge: 30000, timeout: 27000 }
    );
}

function triggerProximityAlert() {
    const lastNotified = localStorage.getItem('buendia_last_proximity_notification');
    const now = Date.now();

    // Solo notificar como máximo 1 vez cada 12 horas para no ser intrusivos
    if (lastNotified && now - parseInt(lastNotified) < 12 * 60 * 60 * 1000) {
        return;
    }

    localStorage.setItem('buendia_last_proximity_notification', now.toString());

    // Mostrar Toast in-app
    showToast(
        '☕ ¡Estás cerca de Buen Día Café!',
        'Pasa por tu café favorito y suma tu sello del día.',
        '📍'
    );

    // Lanzar notificación nativa del sistema si hay permiso
    if ('Notification' in window && Notification.permission === 'granted') {
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'SHOW_NOTIFICATION',
                title: '☕ ¿Un café? Estás cerca de Buen Día Café',
                body: 'Pasa por tu favorito y suma tu sello de hoy en tu tarjeta.'
            });
        } else {
            new Notification('☕ ¿Un café? Estás cerca de Buen Día Café', {
                body: 'Pasa por tu favorito y suma tu sello de hoy en tu tarjeta.',
                icon: 'icon.svg'
            });
        }
    }
}

// Cálculo de distancia en metros (Fórmula de Haversine)
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Radio de la tierra en metros
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// ==========================================================
// NOTIFICACIÓN PERIÓDICA DE REENGANCHE (SEMANAS)
// ==========================================================
function checkReengagementNotification(data) {
    const lastVisit = data.lastVisit || data.createdAt;
    if (!lastVisit) return;

    const lastVisitDate = new Date(lastVisit);
    const now = new Date();
    const diffDays = Math.floor((now - lastVisitDate) / (1000 * 60 * 60 * 24));

    // Si lleva más de 14 días (2 semanas) sin visitar
    if (diffDays >= 14) {
        const lastReengagePrompt = localStorage.getItem('buendia_last_reengage_prompt');
        const nowMs = Date.now();

        // Mostrar como máximo una vez por semana
        if (!lastReengagePrompt || nowMs - parseInt(lastReengagePrompt) > 7 * 24 * 60 * 60 * 1000) {
            localStorage.setItem('buendia_last_reengage_prompt', nowMs.toString());
            setTimeout(() => {
                showToast(
                    '🥐 ¡Te extrañamos en Buen Día Café!',
                    `Han pasado ${diffDays} días desde tu última visita. Tu próximo premio te espera.`,
                    '✨'
                );
            }, 3000);
        }
    }
}

// ==========================================================
// CELEBRACIÓN DE SELLOS Y SUBIDA DE NIVEL
// ==========================================================
function triggerStampCelebration(newStamps, tier) {
    const tierInfo = TIER_CONFIG[tier] || TIER_CONFIG[1];
    if (newStamps >= 10) {
        showToast(
            `🎉 ¡${tierInfo.rewardFull}`,
            `¡Completaste la ${tierInfo.name}! Muestra tu QR al barista para canjear.`,
            '🏆'
        );
    } else {
        showToast(
            '🎉 ¡Nuevo sello acreditado!',
            `¡Excelente! Ya tienes ${newStamps} sello${newStamps > 1 ? 's' : ''} en tu ${tierInfo.name}.`,
            '☀️'
        );
    }
}

function triggerTierUpCelebration(newTier) {
    const tierInfo = TIER_CONFIG[newTier] || TIER_CONFIG[1];
    showToast(
        `⭐ ¡Subiste a ${tierInfo.name}!`,
        `Has ganado una nueva estrella. Ahora tus premios son mejores: ${tierInfo.reward}`,
        tierInfo.icon
    );
}

// ==========================================================
// MANEJADORES DE EVENTOS
// ==========================================================
function initEventListeners() {
    // 1. Guardar Café Habitual
    formHabitual.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!currentCustomerId) return;

        const updatedHabitual = {
            drink: inputHabitualDrink.value,
            shot: inputHabitualShot.value,
            dessert: inputHabitualDessert.value,
            notes: inputHabitualNotes.value.trim()
        };

        db.ref(`customers/${currentCustomerId}/favoriteCoffee`).set(updatedHabitual)
            .then(() => {
                closeModal(modalHabitual);
                showToast('☀️ Café Habitual guardado', 'El barista lo verá cada vez que escanee tu tarjeta.', '✅');
            })
            .catch((err) => {
                console.error('Error guardando café habitual:', err);
                alert('No se pudo guardar. Intenta nuevamente.');
            });
    });

    // 2. Registro de nuevo cliente / Ingreso
    formRegister.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = inputRegName.value.trim();
        const phone = inputRegPhone.value.trim();
        const birthday = inputRegBirthday.value;

        if (!name || !phone) return;

        // Buscar si el cliente ya existe por teléfono
        db.ref('customers').once('value').then((snap) => {
            const data = snap.val() || {};
            let existingId = null;

            Object.keys(data).forEach((key) => {
                if (data[key] && data[key].phone === phone) {
                    existingId = key;
                }
            });

            if (existingId) {
                // Iniciar sesión con cliente existente
                currentCustomerId = existingId;
                localStorage.setItem('buendia_customer_id', existingId);

                // Si proporcionó cumpleaños y no lo tenía
                if (birthday && !data[existingId].birthdate) {
                    db.ref(`customers/${existingId}/birthdate`).set(birthday);
                }

                loadCustomerRealtime(existingId);
            } else {
                // Crear nuevo socio
                const newId = 'c_' + Math.random().toString(36).substr(2, 7);
                const referrer = sessionStorage.getItem('buendia_referral_referrer') || null;

                const newCustomer = {
                    id: newId,
                    name: name,
                    phone: phone,
                    birthdate: birthday || null,
                    stamps: 0,
                    tier: 1,
                    starsEarned: 0,
                    rewardsClaimed: 0,
                    createdAt: new Date().toISOString(),
                    lastVisit: new Date().toISOString(),
                    referredBy: referrer,
                    favoriteCoffee: {
                        drink: "Flat White",
                        shot: "Sin shot",
                        dessert: "Sin postre ni sándwich",
                        notes: ""
                    }
                };

                db.ref(`customers/${newId}`).set(newCustomer).then(() => {
                    currentCustomerId = newId;
                    localStorage.setItem('buendia_customer_id', newId);
                    loadCustomerRealtime(newId);
                    showToast('🎉 ¡Bienvenido a Buen Día Café!', 'Tu tarjeta ya está lista. ¡Comienza tu Senda Bronce!', '☀️');
                });
            }
        });
    });

    // 3. Abrir / Cerrar Modales
    btnOpenHabitualModal.addEventListener('click', () => openModal(modalHabitual));
    btnCloseHabitualModal.addEventListener('click', () => closeModal(modalHabitual));

    btnOpenReferralModal.addEventListener('click', () => openModal(modalReferral));
    btnCloseReferralModal.addEventListener('click', () => closeModal(modalReferral));

    // Menú modal
    const btnOpenMenuModal = document.getElementById('btn-open-menu-modal');
    const modalMenu = document.getElementById('modal-menu');
    const btnCloseMenuModal = document.getElementById('btn-close-menu-modal');

    btnOpenMenuModal.addEventListener('click', () => {
        openModal(modalMenu);
        initMenuModal();
    });
    btnCloseMenuModal.addEventListener('click', () => closeModal(modalMenu));

    // Cerrar tocando el fondo oscuro
    [modalHabitual, modalReferral, modalMenu].forEach((modal) => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(modal);
        });
    });

    // 4. Activar / Desactivar Proximidad
    btnToggleProximity.addEventListener('click', () => {
        const isEnabled = localStorage.getItem('buendia_proximity_enabled') === 'true';
        if (isEnabled) {
            if (proximityWatchId) navigator.geolocation.clearWatch(proximityWatchId);
            localStorage.setItem('buendia_proximity_enabled', 'false');
            proximityStatus.textContent = 'Toca para activar';
            proximityIcon.textContent = '📍';
            showToast('Avisos desactivados', 'Ya no recibirás alertas al pasar cerca del café.', 'ℹ️');
        } else {
            activateProximityTracking(true);
        }
    });

    // 5. Cambiar de cuenta
    btnSwitchAccount.addEventListener('click', () => {
        if (confirm('¿Deseas cerrar la tarjeta en este teléfono o ingresar con otro número?')) {
            localStorage.removeItem('buendia_customer_id');
            localStorage.removeItem('buendia_cached_customer');
            if (customerRefListener) {
                db.ref('customers/' + currentCustomerId).off('value');
            }
            currentCustomerId = null;
            currentCustomerData = null;
            openModal(modalRegister);
        }
    });

    // 6. Cerrar Toast
    toastCloseBtn.addEventListener('click', () => {
        appToast.classList.remove('visible');
    });
}

// Auxiliares de modal
function openModal(modalEl) {
    modalEl.classList.add('active');
}

function closeModal(modalEl) {
    modalEl.classList.remove('active');
}

// Auxiliar de Toast in-app
function showToast(title, desc, icon = '☀️') {
    toastTitle.textContent = title;
    toastDesc.textContent = desc;
    toastIcon.textContent = icon;
    appToast.classList.add('visible');

    setTimeout(() => {
        appToast.classList.remove('visible');
    }, 6000);
}

// ==========================================================
// SERVICE WORKER REGISTRATION (PWA)
// ==========================================================
function initServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js', { scope: './' })
                .then((reg) => {
                    console.log('SW Buen Día registrado con éxito:', reg.scope);
                })
                .catch((err) => {
                    console.warn('Error registrando SW:', err);
                });
        });
    }
}

// ==========================================================
// MENÚ / CARTA INTERACTIVA
// ==========================================================

const MENU_DATA = [
    {
        category: '☕ Café',
        items: [
            { name: 'Espresso', desc: '30 ml', price: '$2.000' },
            { name: 'Espresso Doble', desc: '50 ml', price: '$2.600' },
            { name: 'Americano', desc: 'Espresso y agua caliente • 150 ml', price: '$2.400' },
            { name: 'Americano Doble', desc: 'Espresso doble y agua caliente • 200 ml', price: '$3.000' },
            { name: 'Cortado', desc: 'Espresso y leche • 90 ml', price: '$2.500' },
            { name: 'Cortado Doble', desc: 'Espresso doble y leche • 200 ml', price: '$3.200' },
            { name: 'Flat White', desc: 'Espresso doble y leche • 150 ml', price: '$3.000' },
            { name: 'Capuccino', desc: 'Espresso y leche • 150 ml', price: '$2.700' },
            { name: 'Capuccino Doble', desc: 'Espresso doble y leche • 270 ml', price: '$3.400' },
            { name: 'Latte', desc: 'Espresso y leche • 270 ml', price: '$3.000' },
            { name: 'Mocca', desc: 'Espresso, cacao y leche • 200 ml', price: '$2.900' },
            { name: 'Mocca Doble', desc: 'Espresso doble, cacao y leche • 270 ml', price: '$3.600' },
            { name: 'Dirty Chai', desc: 'Espresso, chai y leche • 200 ml', price: '$3.500' },
            { name: 'Filtrado', desc: 'Colombia Caturra / Brasil Santa Lucia • 250 ml', price: '$3.000' }
        ]
    },
    {
        category: '🍵 Té & Chocolate',
        items: [
            { name: 'Té / Té de Hierbas', desc: '200 ml', price: '$2.000' },
            { name: 'Té Cortado', desc: 'Té y leche texturizada • 90 ml', price: '$2.500' },
            { name: 'Té Cortado Doble', desc: 'Té y leche texturizada • 200 ml', price: '$3.200' },
            { name: 'Infusión', desc: 'Earl Grey / Acai Piña / Chai Masala / Rooibos • 200 ml', price: '$2.600' },
            { name: 'Chai Latte', desc: 'Chai y leche texturizada • 270 ml', price: '$3.500' },
            { name: 'Matcha Latte', desc: 'Matcha puro / arándano y leche • 270 ml', price: '$3.800' },
            { name: 'Chocolate', desc: 'Cacao y leche texturizada • 200 ml', price: '$2.800' },
            { name: 'Chocolate Grande', desc: 'Cacao y leche texturizada • 270 ml', price: '$3.400' }
        ]
    },
    {
        category: '🧊 Bebidas Frías',
        items: [
            { name: 'Latte Frío', desc: 'Espresso, leche y hielo • 290 ml', price: '$3.200' },
            { name: 'Capu Frío', desc: 'Espresso doble, leche y hielo • 290 ml', price: '$3.600' },
            { name: 'Mocca Frío', desc: 'Espresso doble, cacao, leche y hielo • 290 ml', price: '$3.800' },
            { name: 'Café Helado', desc: 'Espresso doble, helado y crema chantilly • 290 ml', price: '$4.500' },
            { name: 'Espresso Tonic', desc: 'Espresso doble y bebida tónica • 290 ml', price: '$3.500' },
            { name: 'Espresso Cítrico Tonic', desc: 'Espresso doble, naranja o limón y tónica • 290 ml', price: '$3.800' },
            { name: 'Espresso Naranja Ginger', desc: '¡NUEVO! Espresso doble, naranja y ginger beer • 290 ml', price: '$4.200' },
            { name: 'Matcha Frío', desc: 'Matcha, leche y hielo • 290 ml', price: '$4.000' },
            { name: 'Chai Frío', desc: 'Chai, leche y hielo • 290 ml', price: '$3.800' },
            { name: 'Té Tonic', desc: 'Té, limón y tónica • 290 ml', price: '$3.500' }
        ]
    },
    {
        category: '🥪 Salados',
        items: [
            { name: 'Crema de Zapallo', desc: 'Crema de zapallo, pollo picado, semillas y rebanada de focaccia', price: '$5.800' },
            { name: 'Napolitano', desc: 'Jamón de pierna y queso ranco, salsa pomodoro, aceitunas y tomate cherry en focaccia', price: '$6.000' },
            { name: 'Cazador', desc: 'Pollo en salsa BBQ ahumada, queso ranco y orégano en focaccia', price: '$6.000' },
            { name: 'Pesto', desc: 'Jamón de pierna, queso ranco, salsa pesto y aceitunas en focaccia', price: '$6.000' },
            { name: 'Ave Pimentón', desc: 'Pollo con mayonesa especial y pimentón en pan de molde', price: '$3.800' },
            { name: 'Ave Nuez', desc: 'Pollo, mayonesa especial y nueces picadas en pan de molde', price: '$3.600' },
            { name: 'Ave Mayo', desc: 'Pollo y mayonesa especial en pan de molde', price: '$3.400' },
            { name: 'Queso Jamón / Queso Champiñón', desc: 'Queso fundido sin lactosa y jamón o champiñón en pan de molde', price: '$3.000' }
        ]
    },
    {
        category: '🍰 Dulces',
        items: [
            { name: 'Galletón de Avena', desc: '', price: '$1.500' },
            { name: 'Queque Marmolado', desc: '', price: '$1.800' },
            { name: 'Pie de Limón', desc: '', price: '$3.200' },
            { name: 'Kuchen', desc: 'Manzana nuez', price: '$3.200' },
            { name: 'Cheesecake de Maracuyá', desc: '', price: '$3.800' },
            { name: 'Arroz con Leche', desc: 'Tarta de arroz con leche, manjar de campo y crema diplomática', price: '$4.200' },
            { name: 'Flor de Café', desc: 'Profiterol relleno con galleta y crema pastelera de café', price: '$4.200' },
            { name: 'Tarta Vasca', desc: 'Tarta de queso crema horneada, mermelada artesanal y pistachos', price: '$4.500' },
            { name: 'Picarones', desc: '¡NUEVO! Tres picarones bañados en almíbar de la casa', price: '$4.500' }
        ]
    },
    {
        category: '🧃 Jugos',
        items: [
            { name: 'Jugo Natural', desc: 'Mango, piña, frambuesa o arándano • 290 ml', price: '$3.000' },
            { name: 'Limonada', desc: 'Jugo de limón, menta y jengibre • 290 ml', price: '$3.500' },
            { name: 'Vitamina Naranja', desc: 'Jugo de naranja recién prensado • 290 ml', price: '$3.500' },
            { name: 'Duo Naranja', desc: 'Jugo de naranja y zanahoria o plátano o piña o mango • 290 ml', price: '$3.800' },
            { name: 'Detox Verde', desc: 'Jugo de manzana, apio, limón y jengibre • 290 ml', price: '$4.200' },
            { name: 'Smoothies', desc: 'Batido de leche y fruta a elección • 290 ml', price: '$3.500' },
            { name: 'Milkshakes', desc: 'Batido de leche, helado y fruta a elección • 290 ml', price: '$4.000' }
        ]
    },
    {
        category: '🥤 Otros',
        items: [
            { name: 'Kombucha', desc: 'Naranja jengibre / Manzana zanahoria / Frutilla menta • 355 ml', price: '$3.000' },
            { name: 'Ginger Beer Salvaje', desc: '¡NUEVO! 330 ml', price: '$3.000' },
            { name: 'Ginger Beer Malalcura', desc: '¡NUEVO! 330 ml', price: '$2.500' },
            { name: 'Coca Cola', desc: 'Original / Zero • 350 ml', price: '$2.000' },
            { name: 'Schweppes', desc: 'Tónica / Ginger Ale • 310 ml', price: '$1.800' },
            { name: 'Mineral', desc: 'Con gas / Sin gas • 330 ml', price: '$1.600' }
        ]
    }
];

let menuSelection = { drink: null, food: null };
let menuInitialized = false;

function initMenuModal() {
    if (menuInitialized) return;
    menuInitialized = true;

    // Carousel de carta
    const cartaPages = document.querySelectorAll('.carta-page');
    const cartaPrev = document.getElementById('carta-prev');
    const cartaNext = document.getElementById('carta-next');
    const cartaIndicator = document.getElementById('carta-indicator');
    let currentPage = 0;

    function showCartaPage(idx) {
        cartaPages.forEach(p => p.classList.remove('visible'));
        cartaPages[idx].classList.add('visible');
        cartaIndicator.textContent = `${idx + 1} / ${cartaPages.length}`;
    }

    showCartaPage(0);

    cartaPrev.addEventListener('click', () => {
        currentPage = (currentPage - 1 + cartaPages.length) % cartaPages.length;
        showCartaPage(currentPage);
    });

    cartaNext.addEventListener('click', () => {
        currentPage = (currentPage + 1) % cartaPages.length;
        showCartaPage(currentPage);
    });

    // Tabs
    const menuTabs = document.querySelectorAll('.menu-tab');
    const tabCarta = document.getElementById('tab-carta');
    const tabInteractivo = document.getElementById('tab-interactivo');

    menuTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            menuTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            if (tab.dataset.tab === 'carta') {
                tabCarta.classList.add('active');
                tabInteractivo.classList.remove('active');
            } else {
                tabCarta.classList.remove('active');
                tabInteractivo.classList.add('active');
            }
        });
    });

    // Render menú interactivo
    renderInteractiveMenu();
}

function renderInteractiveMenu() {
    const container = document.getElementById('menu-interactive-container');
    container.innerHTML = '';

    // Drink categories (first 3: café, té, bebidas frías, jugos, otros)
    const drinkCategories = ['☕ Café', '🍵 Té & Chocolate', '🧊 Bebidas Frías', '🧃 Jugos', '🥤 Otros'];
    const foodCategories = ['🥪 Salados', '🍰 Dulces'];

    MENU_DATA.forEach(cat => {
        const catDiv = document.createElement('div');
        catDiv.className = 'menu-category';

        const isDrinkCategory = drinkCategories.includes(cat.category);
        const isFoodCategory = foodCategories.includes(cat.category);
        const selectionType = isDrinkCategory ? 'drink' : 'food';

        catDiv.innerHTML = `<div class="menu-category-title">${cat.category}</div>`;

        cat.items.forEach(item => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'menu-item-btn';
            btn.innerHTML = `
                <div class="menu-item-info">
                    <span class="menu-item-name">${item.name}</span>
                    ${item.desc ? `<span class="menu-item-desc">${item.desc}</span>` : ''}
                </div>
                <span class="menu-item-price">${item.price}</span>
            `;

            btn.addEventListener('click', () => {
                // Toggle selection
                if (btn.classList.contains('selected')) {
                    btn.classList.remove('selected');
                    menuSelection[selectionType] = null;
                } else {
                    // Deselect others in same type
                    const allBtns = container.querySelectorAll('.menu-item-btn');
                    allBtns.forEach(b => {
                        const bCat = b.closest('.menu-category').querySelector('.menu-category-title').textContent;
                        const bType = drinkCategories.includes(bCat) ? 'drink' : 'food';
                        if (bType === selectionType) {
                            b.classList.remove('selected');
                        }
                    });
                    btn.classList.add('selected');
                    menuSelection[selectionType] = item.name;
                }
                updateSelectionSummary();
            });

            catDiv.appendChild(btn);
        });

        container.appendChild(catDiv);
    });
}

function updateSelectionSummary() {
    const summary = document.getElementById('menu-selection-summary');
    const itemsDiv = document.getElementById('menu-selection-items');

    if (!menuSelection.drink && !menuSelection.food) {
        summary.style.display = 'none';
        return;
    }

    summary.style.display = 'flex';
    let html = '';

    if (menuSelection.drink) {
        html += `<span class="selection-item-tag">☕ ${menuSelection.drink} <span class="remove-selection" data-type="drink">✕</span></span>`;
    }
    if (menuSelection.food) {
        html += `<span class="selection-item-tag">🍽️ ${menuSelection.food} <span class="remove-selection" data-type="food">✕</span></span>`;
    }

    itemsDiv.innerHTML = html;

    // Remove buttons
    itemsDiv.querySelectorAll('.remove-selection').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const type = btn.dataset.type;
            menuSelection[type] = null;

            // Deselect in menu
            const container = document.getElementById('menu-interactive-container');
            const drinkCategories = ['☕ Café', '🍵 Té & Chocolate', '🧊 Bebidas Frías', '🧃 Jugos', '🥤 Otros'];
            container.querySelectorAll('.menu-item-btn.selected').forEach(b => {
                const bCat = b.closest('.menu-category').querySelector('.menu-category-title').textContent;
                const bType = drinkCategories.includes(bCat) ? 'drink' : 'food';
                if (bType === type) b.classList.remove('selected');
            });

            updateSelectionSummary();
        });
    });

    // Save button
    const btnSave = document.getElementById('btn-save-menu-selection');
    btnSave.onclick = () => {
        if (!currentCustomerId) return;

        const updatedHabitual = {
            drink: menuSelection.drink || (currentCustomerData?.favoriteCoffee?.drink || 'Flat White'),
            shot: currentCustomerData?.favoriteCoffee?.shot || 'Sin shot',
            dessert: menuSelection.food || (currentCustomerData?.favoriteCoffee?.dessert || 'Sin postre ni sándwich'),
            notes: currentCustomerData?.favoriteCoffee?.notes || ''
        };

        // Update habitual form selects if the item exists as an option
        if (menuSelection.drink) {
            const drinkSelect = document.getElementById('habitual-drink');
            const matchOption = Array.from(drinkSelect.options).find(o => o.value === menuSelection.drink);
            if (matchOption) {
                drinkSelect.value = menuSelection.drink;
            } else {
                // Add the item as a new option
                const newOpt = document.createElement('option');
                newOpt.value = menuSelection.drink;
                newOpt.textContent = menuSelection.drink;
                drinkSelect.appendChild(newOpt);
                drinkSelect.value = menuSelection.drink;
            }
            updatedHabitual.drink = menuSelection.drink;
        }

        if (menuSelection.food) {
            const dessertSelect = document.getElementById('habitual-dessert');
            const matchOption = Array.from(dessertSelect.options).find(o => o.value === menuSelection.food);
            if (matchOption) {
                dessertSelect.value = menuSelection.food;
            } else {
                const newOpt = document.createElement('option');
                newOpt.value = menuSelection.food;
                newOpt.textContent = menuSelection.food;
                dessertSelect.appendChild(newOpt);
                dessertSelect.value = menuSelection.food;
            }
            updatedHabitual.dessert = menuSelection.food;
        }

        db.ref(`customers/${currentCustomerId}/favoriteCoffee`).set(updatedHabitual)
            .then(() => {
                closeModal(document.getElementById('modal-menu'));
                showToast('☀️ Pedido habitual actualizado', 'Tu selección del menú se guardó como favorito.', '✅');
            })
            .catch((err) => {
                console.error('Error guardando desde menú:', err);
                alert('No se pudo guardar. Intenta nuevamente.');
            });
    };
}

// ==========================================================
// LÓGICA DE INSTALACIÓN (PWA & SAFARI)
// ==========================================================

let deferredPrompt;
const pwaBanner = document.getElementById('pwa-install-banner');
const btnPwaInstall = document.getElementById('btn-pwa-install');
const btnPwaClose = document.getElementById('btn-pwa-close');

const modalInstallIos = document.getElementById('modal-install-ios');
const btnCloseInstallIos = document.getElementById('btn-close-install-ios');
const btnUnderstoodInstallIos = document.getElementById('btn-understood-install-ios');

window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent Chrome 67 and earlier from automatically showing the prompt
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = e;
    // Show the custom install banner if not dismissed before
    if (!localStorage.getItem('buendia_pwa_dismissed') && pwaBanner) {
        pwaBanner.style.display = 'flex';
    }
});

if (btnPwaInstall) {
    btnPwaInstall.addEventListener('click', () => {
        pwaBanner.style.display = 'none';
        if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then((choiceResult) => {
                if (choiceResult.outcome === 'accepted') {
                    console.log('User accepted the install prompt');
                }
                deferredPrompt = null;
            });
        }
    });
}

if (btnPwaClose) {
    btnPwaClose.addEventListener('click', () => {
        pwaBanner.style.display = 'none';
        localStorage.setItem('buendia_pwa_dismissed', 'true');
    });
}

// Lógica para Safari (iOS)
const isIos = () => {
    const userAgent = window.navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(userAgent);
};

// isInStandaloneMode detecta si ya se está ejecutando como app instalada (PWA)
const isInStandaloneMode = () => ('standalone' in window.navigator) && (window.navigator.standalone);

if (isIos() && !isInStandaloneMode()) {
    if (!localStorage.getItem('buendia_ios_install_dismissed')) {
        // Mostrar el modal después de 2 segundos de cargar la app
        setTimeout(() => {
            if (modalInstallIos) openModal(modalInstallIos);
        }, 2000);
    }
}

if (btnCloseInstallIos) {
    btnCloseInstallIos.addEventListener('click', () => {
        closeModal(modalInstallIos);
        localStorage.setItem('buendia_ios_install_dismissed', 'true');
    });
}
if (btnUnderstoodInstallIos) {
    btnUnderstoodInstallIos.addEventListener('click', () => {
        closeModal(modalInstallIos);
        localStorage.setItem('buendia_ios_install_dismissed', 'true');
    });
}
