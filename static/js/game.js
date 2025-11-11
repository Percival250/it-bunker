const socket = io();

// --- 2. Весь остальной код должен ждать, пока страница загрузится ---
document.addEventListener('DOMContentLoaded', () => {
    
    // --- 2.1. Теперь ищем элементы ЗДЕСЬ, внутри обработчика ---
    const roomCodeElement = document.getElementById('room-code');
    const moduleSelect = document.getElementById('module-select');
    const startGameBtn = document.getElementById('start-game-btn');
    const playersList = document.getElementById('players-list');
    const myCardsDiv = document.getElementById('my-cards');
    const revealedCardsArea = document.getElementById('revealed-cards-area');

    // Если мы не на странице игры, выходим, чтобы не было ошибок
    if (!roomCodeElement) {
        return;
    }

    const roomCode = roomCodeElement.innerText;
    const username = prompt("Введите ваше имя:");

    // --- 2.2. Отправляем события НА СЕРВЕР ---
    if (username && roomCode) {
        console.log(`Отправляем 'join'. Имя: ${username}, Комната: ${roomCode}`);
        socket.emit('join', { username: username, room_code: roomCode });
    }

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
            cardElement.classList.add('disabled');
            cardElement.style.opacity = '0.5';
        }
    });


    // --- 2.3. Слушаем события от СЕРВЕРА ---

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

    socket.on('player_update', (data) => {
        const players = data.players;
        
        // Обновляем список игроков
        playersList.innerHTML = '';
        players.forEach(player => {
            const li = document.createElement('li');
            li.textContent = player;
            playersList.appendChild(li);
        });

        // Синхронизируем доски игроков
        const currentPlayerBoards = new Set(players.map(p => `board-for-${p.replace(/\s+/g, '-')}`));
        const displayedBoards = Array.from(revealedCardsArea.querySelectorAll('.player-board'));

        // Удаляем доски отключившихся
        displayedBoards.forEach(board => {
            if (!currentPlayerBoards.has(board.id)) {
                board.remove();
            }
        });

        // Добавляем доски новых игроков
        players.forEach(player => {
            const playerBoardID = `board-for-${player.replace(/\s+/g, '-')}`;
            if (!document.getElementById(playerBoardID)) {
                const playerBoard = document.createElement('div');
                playerBoard.classList.add('player-board');
                playerBoard.id = playerBoardID;
                playerBoard.innerHTML = `<h3>${player}</h3><div class="cards-on-board"><p>Карты не раскрыты</p></div>`;
                revealedCardsArea.appendChild(playerBoard);
            }
        });

        if (players.length > 0 && revealedCardsArea.innerText.includes('Ожидание')) {
             revealedCardsArea.innerHTML = '';
             // Повторно добавляем доски, если это первый игрок
             players.forEach(player => {
                const playerBoardID = `board-for-${player.replace(/\s+/g, '-')}`;
                if (!document.getElementById(playerBoardID)) {
                    const playerBoard = document.createElement('div');
                    playerBoard.classList.add('player-board');
                    playerBoard.id = playerBoardID;
                    playerBoard.innerHTML = `<h3>${player}</h3><div class="cards-on-board"><p>Карты не раскрыты</p></div>`;
                    revealedCardsArea.appendChild(playerBoard);
                }
             });
        } else if (players.length === 0) {
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
                     style="border: 1px solid #ccc; padding: 10px; margin-top: 10px; border-radius: 5px; cursor: pointer;">
                    <strong>${card.category}: ${card.title}</strong>
                    <p style="margin-top: 5px; margin-bottom: 0;">${card.description || ''}</p>
                </div>
            `;
        });
    });

    socket.on('game_started', (data) => {
        startGameBtn.disabled = true;
        moduleSelect.disabled = true;
    });

    socket.on('new_card_revealed', (data) => {
        const playerBoardID = `board-for-${data.username.replace(/\s+/g, '-')}`;
        const playerBoard = document.getElementById(playerBoardID);
        if (playerBoard) {
            const cardsOnBoardDiv = playerBoard.querySelector('.cards-on-board');
            if (cardsOnBoardDiv.innerText.includes('Карты не раскрыты')) {
                cardsOnBoardDiv.innerHTML = '';
            }
            cardsOnBoardDiv.innerHTML += `
                <div class="revealed-card" style="border: 1px solid #007bff; padding: 5px; margin-top: 5px; border-radius: 4px;">
                    <p style="margin: 0;"><strong>${data.card.category}: ${data.card.title}</strong></p>
                </div>
            `;
        }
    });
    socket.on('you_are_host', (data) => {
        if (data.is_host) {
            console.log("Этот клиент - хост. Кнопки управления активны.");
            // Кнопки и так активны по умолчанию, ничего не меняем
            moduleSelect.disabled = false;
            startGameBtn.disabled = false;
        } else {
            console.log("Этот клиент - гость. Кнопки управления заблокированы.");
            // Если мы не хост, блокируем кнопки
            moduleSelect.disabled = true;
            startGameBtn.disabled = true;
        }
    });
    
    socket.on('available_modules', (data) => {
        console.log("Получены доступные модули:", data.modules);
        moduleSelect.innerHTML = '';
        data.modules.forEach(module => {
            const option = document.createElement('option');
            option.value = module;
            option.textContent = module;
            moduleSelect.appendChild(option);
        });
        // Убираем разблокировку отсюда, теперь это контролирует событие 'you_are_host'
        // moduleSelect.disabled = false; 
        // startGameBtn.disabled = false;
    });
});

// --- 4. Служебные события ---
socket.on('connect', () => {
    console.log('Успешно подключено к серверу!');
});