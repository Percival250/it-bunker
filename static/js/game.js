// static/js/game.js

// --- 1. Устанавливаем соединение и получаем элементы ---
const socket = io();
const roomCodeElement = document.getElementById('room-code');
const moduleSelect = document.getElementById('module-select');
const startGameBtn = document.getElementById('start-game-btn');
const playersListDiv = document.getElementById('players-list'); // Теперь это div, а не ul
const myCardsDiv = document.getElementById('my-cards');
const revealedCardsArea = document.getElementById('revealed-cards-area');

const roomCode = roomCodeElement ? roomCodeElement.innerText : null;
const username = prompt("Введите ваше имя:");

// --- 2. Отправка событий НА СЕРВЕР ---

document.addEventListener('DOMContentLoaded', () => {
    if (username && roomCode) {
        socket.emit('join', { username: username, room_code: roomCode });
    }
});

startGameBtn.addEventListener('click', () => {
    const selectedModule = moduleSelect.value;
    socket.emit('start_game', { room_code: roomCode, module: selectedModule });
});

myCardsDiv.addEventListener('click', (event) => {
    const cardElement = event.target.closest('.card-item');
    if (cardElement && !cardElement.classList.contains('disabled')) {
        const cardData = {
            category: cardElement.dataset.category,
            title: cardElement.dataset.title,
            description: cardElement.dataset.description
        };
        socket.emit('reveal_card', { card: cardData });
        cardElement.classList.add('disabled'); // Используем класс вместо стилей
        cardElement.style.opacity = '0.5';
    }
});

// --- 3. Слушаем события от СЕРВЕРА и ОБНОВЛЯЕМ ИНТЕРФЕЙС ---

socket.on('available_modules', (data) => {
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

// ГЛАВНОЕ ИЗМЕНЕНИЕ: Теперь это событие управляет отображением всех игроков
socket.on('player_update', (data) => {
    console.log("Обновление игроков:", data.players);
    const players = data.players;

    // --- Обновляем простой список имен в теге <ul> ---
    playersList.innerHTML = ''; // playersList теперь это наш <ul>
    players.forEach(player => {
        const li = document.createElement('li'); // Создаем элемент списка
        li.textContent = player;
        playersList.appendChild(li); // Добавляем в список
    });

    // --- Создаем и обновляем персональные столы игроков ---
    
    // Получаем текущие отображаемые доски
    const existingBoards = new Set(Array.from(revealedCardsArea.querySelectorAll('.player-board')).map(board => board.id));
    
    // Добавляем новые доски
    players.forEach(player => {
        const playerBoardID = `board-for-${player.replace(/\s+/g, '-')}`;
        
        // Если доски для такого игрока еще нет, создаем ее
        if (!document.getElementById(playerBoardID)) {
            const playerBoard = document.createElement('div');
            playerBoard.classList.add('player-board');
            playerBoard.id = playerBoardID;
            
            playerBoard.innerHTML = `
                <h3>${player}</h3>
                <div class="cards-on-board">
                    <p>Карты не раскрыты</p>
                </div>
            `;
            
            // Если это первая доска, очищаем "Ожидание игроков"
            if (revealedCardsArea.innerText.includes('Ожидание игроков')) {
                revealedCardsArea.innerHTML = '';
            }
            revealedCardsArea.appendChild(playerBoard);
        }
        
        // Удаляем ID из набора, чтобы найти тех, кто отключился
        existingBoards.delete(playerBoardID);
    });

    // Удаляем доски отключившихся игроков
    existingBoards.forEach(boardIdToRemove => {
        const boardToRemove = document.getElementById(boardIdToRemove);
        if (boardToRemove) {
            boardToRemove.remove();
        }
    });

    // Если игроков не осталось, показываем сообщение
    if (players.length === 0) {
        revealedCardsArea.innerHTML = '<p>Ожидание игроков...</p>';
    }
});


socket.on('deal_cards', (data) => {
    myCardsDiv.innerHTML = '';
    data.cards.forEach(card => {
        myCardsDiv.innerHTML += `
            <div class="card-item" 
                 data-category="${card.category}" 
                 data-title="${card.title}" 
                 data-description="${card.description || ''}"
                 style="/* ... стили ... */ cursor: pointer;">
                <strong>${card.category}: ${card.title}</strong>
                <p>${card.description || ''}</p>
            </div>
        `;
    });
});

socket.on('game_started', (data) => {
    startGameBtn.disabled = true;
    moduleSelect.disabled = true;
});

// ГЛАВНОЕ ИЗМЕНЕНИЕ: Теперь это событие добавляет карту на стол конкретного игрока
socket.on('new_card_revealed', (data) => {
    console.log(`Игрок ${data.username} раскрыл карту:`, data.card);

    // Находим ID стола нужного игрока
    const playerBoardID = `board-for-${data.username.replace(/\s+/g, '-')}`;
    const playerBoard = document.getElementById(playerBoardID);

    if (playerBoard) {
        const cardsOnBoardDiv = playerBoard.querySelector('.cards-on-board');
        // Если это первая карта, очищаем "Карты не раскрыты"
        if (cardsOnBoardDiv.innerText.includes('Карты не раскрыты')) {
            cardsOnBoardDiv.innerHTML = '';
        }

        // Добавляем новую раскрытую карту
        cardsOnBoardDiv.innerHTML += `
            <div class="revealed-card" style="border: 1px solid #007bff; padding: 5px; margin-top: 5px; border-radius: 4px;">
                <p style="margin: 0;"><strong>${data.card.category}: ${data.card.title}</strong></p>
            </div>
        `;
    }
});


// --- 4. Служебные события ---
socket.on('connect', () => {
    console.log('Успешно подключено к серверу!');
});