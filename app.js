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

// Imagen del logo (grano-sol) para usar en la grilla de sellos
const GRANO_SOL_SVG = `<img src="logo.png" alt="Sello" style="width: 100%; height: 100%; object-fit: contain;">`;

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
const inputHabitualMilk = document.getElementById('habitual-milk');
const inputHabitualSweetener = document.getElementById('habitual-sweetener');
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

    // Horario: Lun a Vie 08:00 - 20:00, Sáb 09:00 - 19:00, Dom cerrado
    let isOpen = false;
    let closesAt = "20:00";

    if (day >= 1 && day <= 5) {
        isOpen = timeNum >= 8.0 && timeNum < 20.0;
        closesAt = "20:00";
    } else if (day === 6) {
        isOpen = timeNum >= 9.0 && timeNum < 19.0;
        closesAt = "19:00";
    }

    if (isOpen) {
        cafeOpenPill.classList.remove('closed');
        cafeStatusText.textContent = `Abierto • Cierra a las ${closesAt}`;
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
    renderQRCode(data.id);

    // 5. "Mi Café Habitual"
    const fav = data.favoriteCoffee || {
        drink: "Flat White",
        milk: "Leche de Avena",
        sweetener: "Sin azúcar",
        notes: ""
    };
    habitualDrinkDisplay.textContent = fav.drink || 'Flat White';
    
    let specsHtml = `<span class="habitual-spec-tag">${fav.milk || 'Leche de Avena'}</span>`;
    specsHtml += `<span class="habitual-spec-tag">${fav.sweetener || 'Sin azúcar'}</span>`;
    if (fav.notes) {
        specsHtml += `<span class="habitual-spec-tag">${fav.notes}</span>`;
    }
    habitualSpecsDisplay.innerHTML = specsHtml;

    // Precargar modal de habitual
    inputHabitualDrink.value = fav.drink || "Flat White";
    inputHabitualMilk.value = fav.milk || "Leche de Avena";
    inputHabitualSweetener.value = fav.sweetener || "Sin azúcar";
    inputHabitualNotes.value = fav.notes || "";

    // 6. Grilla de 10 Sellos con Grano-Sol
    renderStampsGrid(stamps);

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
// RENDERIZAR GRILLA DE 10 SELLOS CON GRANO-SOL
// ==========================================================
function renderStampsGrid(stamps) {
    stampsGridContainer.innerHTML = '';

    for (let i = 1; i <= 10; i++) {
        const slot = document.createElement('div');
        const isActive = i <= stamps;
        let milestoneClass = '';
        let tagHtml = '';
        let badgeLabel = `${i}`;

        if (i === 10) {
            milestoneClass = ' milestone-10';
            badgeLabel = '🎁';
            tagHtml = '<span class="stamp-reward-tag">PREMIO</span>';
        }

        slot.className = `stamp-slot${isActive ? ' active' : ''}${milestoneClass}`;
        slot.innerHTML = `
            ${tagHtml}
            <span class="stamp-icon">${GRANO_SOL_SVG}</span>
            <span class="stamp-badge-label">${badgeLabel}</span>
        `;
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
            milk: inputHabitualMilk.value,
            sweetener: inputHabitualSweetener.value,
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
                        milk: "Leche de Avena",
                        sweetener: "Sin azúcar",
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

    // Cerrar tocando el fondo oscuro
    [modalHabitual, modalReferral].forEach((modal) => {
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
