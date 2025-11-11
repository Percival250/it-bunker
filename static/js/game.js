// static/js/game.js

// --- 1. Устанавливаем соединение и получаем элементы ---
const socket = io();
const roomCodeElement = document.getElementById('room-code');
const moduleSelect = document.getElementById('module-select');
const startGameBtn = document.getElementById('start-game-btn');
const playersList = document.getElementById('players-list');
const myCardsDiv = document.getElementById('my-cards');
const revealedCardsArea = document.getElementById('revealed-cards-area'); // Новый элемент

// Получаем код комнаты со страницы
const roomCode = roomCodeElement ? roomCodeElement.innerText : null;

// Запрашиваем имя пользователя ОДИН РАЗ при загрузке
const username = prompt("Введите ваше имя:");

// --- 2. Отправляем события НА СЕРВЕР ---

// Отправляем 'join' при подключении
document.addEventListener('DOMContentLoaded', () => {
    if (username && roomCode) {
        console.log(`Отправляем 'join'. Имя: ${username}, Комната: ${roomCode}`);
        socket.emit('join', { username: username, room_code: roomCode });
    } else {
        console.error("Не удалось получить имя пользователя или код комнаты.");
    }
});

// Отправляем 'start_game' по клику на кнопку
startGameBtn.addEventListener('click', () => {
    const selectedModule = moduleSelect.value;
    if (selectedModule) {
        console.log(`Начинаем игру с модулем: ${selectedModule}`);
        socket.emit('start_game', { room_code: roomCode, module: selectedModule });
    }
});

// НОВЫЙ ОБРАБОТЧИК: Отправляем 'reveal_card' по клику на карту
myCardsDiv.addEventListener('click', (event) => {
    const cardElement = event.target.closest('.card-item');
    if (cardElement) {
        const cardData = {
            category: cardElement.dataset.category,
            title: cardElement.dataset.title,
            description: cardElement.dataset.description
        };
        console.log("Отправляем 'reveal_card' на сервер:", cardData);
        socket.emit('reveal_card', { card: cardData });
        cardElement.style.opacity = '0.5';
        cardElement.style.pointerEvents = 'none';
    }
});

// --- 3. Слушаем события от СЕРВЕРА ---

// Событие: Сервер прислал список доступных модулей
socket.on('available_modules', (data) => {
    console.log("Получены доступные модули:", data.modules);
    moduleSelect.innerHTML = '';
    data.modules.forEach(module => {
        const option = document.createElement('option');
        option.value = module;
        option.textContent = module;
        moduleSelect.appendChild(option);
    });
    moduleSelect.disabled = false;
    startGameBtn.disabled = false;
});

// Событие: Сервер прислал обновленный список игроков
socket.on('player_update', (data) => {
    console.log("Получен обновленный список игроков:", data.players);
    playersList.innerHTML = '';
    data.players.forEach(player => {
        const li = document.createElement('li');
        li.textContent = player;
        playersList.appendChild(li);
    });
});

// Событие: Сервер прислал ЛИЧНО нам наши карты
socket.on('deal_cards', (data) => {
    console.log("Получены личные карты:", data.cards);
    myCardsDiv.innerHTML = '';
    data.cards.forEach(card => {
        myCardsDiv.innerHTML += `
            <div class="card-item" 
                 data-category="${card.category}" 
                 data-title="${card.title}" 
                 data-description="${card.description || ''}"
                 style="border: 1px solid #ccc; padding: 10px; margin-top: 10px; border-radius: 5px; cursor: pointer;">
                <strong>${card.category}: ${card.title}</strong>
                <p style="margin-top: 5px; margin-bottom: 0;">${card.description || ''}</p>
            </div>
        `;
    });
});

// Событие: Сервер сообщил, что игра началась
socket.on('game_started', (data) => {
    console.log("Сервер сообщил о начале игры:", data.message);
    startGameBtn.disabled = true;
    moduleSelect.disabled = true;
    if (myCardsDiv.innerHTML.includes("Игра еще не началась")) {
        myCardsDiv.innerHTML = `<p>${data.message}</p>`;
    }
});

// НОВОЕ СОБЫТИЕ: Сервер сообщил, что кто-то раскрыл карту
socket.on('new_card_revealed', (data) => {
    console.log(`Игрок ${data.username} раскрыл карту:`, data.card);
    if (revealedCardsArea.innerText.includes('Здесь будут появляться')) {
        revealedCardsArea.innerHTML = '';
    }
    revealedCardsArea.innerHTML += `
        <div class="revealed-card" style="border: 2px solid #007bff; padding: 10px; margin-top: 10px; border-radius: 5px;">
            <p style="margin: 0 0 5px 0;"><strong>${data.username}</strong> раскрывает:</p>
            <p style="margin: 0;"><strong>${data.card.category}: ${data.card.title}</strong></p>
            <p style="margin: 5px 0 0 0;">${data.card.description || ''}</p>
        </div>
    `;
});

// --- 4. Служебные события для отладки ---
socket.on('connect', () => {
    console.log('Успешно подключено к серверу! ID сокета:', socket.id);
});

socket.on('disconnect', () => {
    console.warn('Отключено от сервера.');
});