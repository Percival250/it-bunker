// static/js/game.js

// --- 1. Устанавливаем соединение и получаем элементы ---
const socket = io();
const roomCodeElement = document.getElementById('room-code');
const moduleSelect = document.getElementById('module-select');
const startGameBtn = document.getElementById('start-game-btn');
const playersList = document.getElementById('players-list');
const myCardsDiv = document.getElementById('my-cards');

// Получаем код комнаты со страницы
const roomCode = roomCodeElement ? roomCodeElement.innerText : null;

// Запрашиваем имя пользователя ОДИН РАЗ при загрузке
const username = prompt("Введите ваше имя:");

// --- 2. Отправляем событие 'join' при подключении ---
document.addEventListener('DOMContentLoaded', () => {
    if (username && roomCode) {
        console.log(`Отправляем 'join'. Имя: ${username}, Комната: ${roomCode}`);
        socket.emit('join', { username: username, room_code: roomCode });
    } else {
        console.error("Не удалось получить имя пользователя или код комнаты.");
    }
});

// --- 3. Навешиваем событие на кнопку "Начать игру" ---
startGameBtn.addEventListener('click', () => {
    const selectedModule = moduleSelect.value;
    if (selectedModule) {
        console.log(`Начинаем игру с модулем: ${selectedModule}`);
        // Отправляем событие 'start_game' на сервер
        socket.emit('start_game', { room_code: roomCode, module: selectedModule });
    }
});


// --- 4. Слушаем события от СЕРВЕРА ---

// Событие: Сервер прислал список доступных модулей
socket.on('available_modules', (data) => {
    console.log("Получены доступные модули:", data.modules);
    moduleSelect.innerHTML = ''; // Очищаем "Загрузка..."
    data.modules.forEach(module => {
        const option = document.createElement('option');
        option.value = module;
        option.textContent = module;
        moduleSelect.appendChild(option);
    });
    moduleSelect.disabled = false;
    startGameBtn.disabled = false;
});

// Событие: Сервер прислал обновленный список игроков в комнате
socket.on('player_update', (data) => {
    console.log("Получен обновленный список игроков:", data.players);
    playersList.innerHTML = ''; // Очищаем старый список
    data.players.forEach(player => {
        const li = document.createElement('li');
        li.textContent = player;
        playersList.appendChild(li);
    });
});

// Событие: Сервер прислал ЛИЧНО нам наши карты
socket.on('deal_cards', (data) => {
    console.log("Получены личные карты:", data.cards);
    myCardsDiv.innerHTML = ''; // Очищаем "Игра не началась..."
    data.cards.forEach(card => {
        // Создаем красивую карточку и добавляем на страницу
        myCardsDiv.innerHTML += `
            <div class="card-item" style="border: 1px solid #ccc; padding: 10px; margin-top: 10px; border-radius: 5px;">
                <strong>${card.category}: ${card.title}</strong>
                <p style="margin-top: 5px; margin-bottom: 0;">${card.description || ''}</p>
            </div>
        `;
    });
});

// Событие: Сервер сообщил, что игра началась
socket.on('game_started', (data) => {
    console.log("Сервер сообщил о начале игры:", data.message);
    // Блокируем кнопку "Начать игру", чтобы ее нельзя было нажать снова
    startGameBtn.disabled = true;
    moduleSelect.disabled = true;
    // Можно показать какое-то уведомление, но alert не будем использовать,
    // чтобы не мешать. Просто выведем сообщение в блок карт.
    if (myCardsDiv.innerHTML.includes("Игра еще не началась")) {
        myCardsDiv.innerHTML = `<p>${data.message}</p>`;
    }
});

// --- 5. Служебные события для отладки ---
socket.on('connect', () => {
    console.log('Успешно подключено к серверу! ID сокета:', socket.id);
});

socket.on('disconnect', () => {
    console.warn('Отключено от сервера.');
});