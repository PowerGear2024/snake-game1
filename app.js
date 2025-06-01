// Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;
tg.expand();

// API URLs - используем относительный путь, так как API будет на том же домене
const API_BASE_URL = '/api';

// Инициализация карты
const map = L.map('map').setView([55.7558, 37.6173], 13);

// Добавление слоя OpenStreetMap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Получение текущей геолокации
navigator.geolocation.getCurrentPosition(
    (position) => {
        const { latitude, longitude } = position.coords;
        map.setView([latitude, longitude], 13);
    },
    (error) => {
        console.error('Ошибка получения геолокации:', error);
    }
);

// Модальное окно
const modal = document.getElementById('addPartyModal');
const addPartyBtn = document.getElementById('addPartyBtn');
const closeBtn = document.querySelector('.close');
const addPartyForm = document.getElementById('addPartyForm');

// Открытие модального окна
addPartyBtn.onclick = () => {
    modal.style.display = 'block';
};

// Закрытие модального окна
closeBtn.onclick = () => {
    modal.style.display = 'none';
};

// Закрытие модального окна при клике вне его
window.onclick = (event) => {
    if (event.target === modal) {
        modal.style.display = 'none';
    }
};

// Хранение точек
let parties = [];

// Загрузка точек из Telegram
async function loadParties() {
    try {
        // Отправляем запрос боту на получение точек
        const response = await fetch(`${API_BASE_URL}/get_parties`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                user_id: tg.initDataUnsafe.user.id
            })
        });
        
        if (response.ok) {
            parties = await response.json();
            displayParties();
        }
    } catch (error) {
        console.error('Ошибка загрузки точек:', error);
    }
}

// Отображение существующих точек
function displayParties() {
    // Очищаем все маркеры
    map.eachLayer((layer) => {
        if (layer instanceof L.Marker) {
            map.removeLayer(layer);
        }
    });

    // Добавляем новые маркеры
    parties.forEach(party => {
        if (!party.expired) {
            addMarkerToMap(party);
        }
    });
}

// Добавление маркера на карту
function addMarkerToMap(party) {
    const marker = L.marker([party.latitude, party.longitude])
        .addTo(map)
        .bindPopup(`
            <div class="party-popup">
                <h3>${party.name}</h3>
                <p>${party.description}</p>
                <p>⏰ До: ${new Date(party.end_time).toLocaleString()}</p>
                <p>👥 Участников: ${party.participants || 0}</p>
                ${party.is_private ? '<p>🔒 Приватная</p>' : ''}
                <button onclick="joinParty(${party.id})" class="btn">🍻 Пойду!</button>
            </div>
        `);
}

// Обработка добавления новой точки
addPartyForm.onsubmit = async (e) => {
    e.preventDefault();

    const name = document.getElementById('partyName').value;
    const description = document.getElementById('partyDescription').value;
    const duration = parseInt(document.getElementById('partyDuration').value);
    const isPrivate = document.getElementById('isPrivate').checked;

    // Получение координат центра карты
    const center = map.getCenter();
    
    const party = {
        name,
        description,
        latitude: center.lat,
        longitude: center.lng,
        duration,
        is_private: isPrivate,
        creator_id: tg.initDataUnsafe.user.id
    };

    try {
        // Отправляем данные боту
        const response = await fetch(`${API_BASE_URL}/create_party`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(party)
        });

        if (response.ok) {
            const newParty = await response.json();
            parties.push(newParty);
            addMarkerToMap(newParty);
            modal.style.display = 'none';
            addPartyForm.reset();
            
            // Отправляем сообщение в Telegram
            tg.sendData(JSON.stringify({
                action: 'party_created',
                party_id: newParty.id
            }));
        }
    } catch (error) {
        console.error('Ошибка создания точки:', error);
    }
};

// Функция для присоединения к точке
async function joinParty(partyId) {
    try {
        const response = await fetch(`${API_BASE_URL}/join_party`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                party_id: partyId,
                user_id: tg.initDataUnsafe.user.id
            })
        });

        if (response.ok) {
            // Обновляем информацию о точке
            const updatedParty = await response.json();
            const partyIndex = parties.findIndex(p => p.id === partyId);
            if (partyIndex !== -1) {
                parties[partyIndex] = updatedParty;
                displayParties();
            }
        }
    } catch (error) {
        console.error('Ошибка присоединения к точке:', error);
    }
}

// Загрузка точек при запуске
loadParties();

// Обновление точек каждые 30 секунд
setInterval(loadParties, 30000);

// Обработка сообщений от Telegram
tg.onEvent('message', (event) => {
    if (event.data) {
        try {
            const data = JSON.parse(event.data);
            if (data.action === 'update_parties') {
                parties = data.parties;
                displayParties();
            }
        } catch (error) {
            console.error('Ошибка обработки сообщения:', error);
        }
    }
}); 