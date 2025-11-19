const socket = io();

// --- 2. Весь код ждет загрузки страницы ---
document.addEventListener('DOMContentLoaded', () => {
    
    // --- 2.1. Ищем все необходимые элементы на странице ---
    const roomCodeElement = document.getElementById('room-code');
    const moduleSelect = document.getElementById('module-select');
    const startGameBtn = document.getElementById('start-game-btn');
    const playersList = document.getElementById('players-list');
    const myCardsDiv = document.getElementById('my-cards');
    const revealedCardsArea = document.getElementById('revealed-cards-area');
    const hostVotingControls = document.getElementById('host-voting-controls');
    const startVotingBtn = document.getElementById('start-voting-btn');
    const endVotingBtn = document.getElementById('end-voting-btn');
    const disasterDeckDiv = document.getElementById('disaster-deck');
    const bonusDeckDiv = document.getElementById('bonus-deck');

    if (!roomCodeElement) return; // Выходим, если это не страница игры

    const roomCode = roomCodeElement.innerText;
    const username = prompt("Введите ваше имя:");
    let isHost = false;

    // --- 2.2. Отправляем события НА СЕРВЕР ---
    
    if (username && roomCode) {
        socket.emit('join', { username: username, room_code: roomCode });
    }

    startGameBtn.addEventListener('click', () => {
        socket.emit('start_game', { room_code: roomCode, module: moduleSelect.value });
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
        }
    });

    startVotingBtn.addEventListener('click', () => socket.emit('start_voting'));
    endVotingBtn.addEventListener('click', () => socket.emit('end_voting'));


    // --- 2.3. Слушаем события от СЕРВЕРА ---

    socket.on('you_are_host', (data) => {
        isHost = data.is_host;
        if (isHost) {
            moduleSelect.disabled = false;
            startGameBtn.disabled = false;
        } else {
            moduleSelect.disabled = true;
            startGameBtn.disabled = true;
        }
    });

    socket.on('available_modules', (data) => {
        moduleSelect.innerHTML = '';
        data.modules.forEach(module => {
            const option = document.createElement('option');
            option.value = module;
            option.textContent = module;
            moduleSelect.appendChild(option);
        });
    });

    socket.on('player_update', (data) => {
        // ... (этот код у вас правильный, оставляем без изменений)
        const players = data.players;
        playersList.innerHTML = '';
        players.forEach(player => {
            const li = document.createElement('li');
            li.textContent = player;
            playersList.appendChild(li);
        });
        const currentPlayerBoards = new Set(players.map(p => `board-for-${p.replace(/\s+/g, '-')}`));
        Array.from(revealedCardsArea.querySelectorAll('.player-board')).forEach(board => {
            if (!board.classList.contains('kicked')) board.remove();
        });
        players.forEach(player => {
            const playerBoardID = `board-for-${player.replace(/\s+/g, '-')}`;
            if (!document.getElementById(playerBoardID)) {
                const playerBoard = document.createElement('div');
                playerBoard.id = playerBoardID;
                playerBoard.classList.add('player-board');
                playerBoard.innerHTML = `<h3 data-username="${player}">${player} <span class="vote-count"></span></h3><div class="cards-on-board"><p>Карты не раскрыты</p></div>`;
                if (revealedCardsArea.innerText.includes('Ожидание')) revealedCardsArea.innerHTML = '';
                revealedCardsArea.appendChild(playerBoard);
            }
        });
        if (players.length === 0 && revealedCardsArea.querySelectorAll('.player-board.kicked').length === 0) {
            revealedCardsArea.innerHTML = '<p>Ожидание игроков...</p>';
        }
    });

    // --- ОБЪЕДИНЕННАЯ И ИСПРАВЛЕННАЯ ВЕРСИЯ 'game_started' ---
    socket.on('game_started', (data) => {
        startGameBtn.disabled = true;
        moduleSelect.disabled = true;
        if (isHost) {
            hostVotingControls.style.display = 'block';
        }

        // Логика отображения Катастрофы
        disasterDeckDiv.innerHTML = '<h4>Катастрофа (Компания)</h4>'; // Восстанавливаем заголовок
        const disasterCard = data.disaster_card;
        if (disasterCard) {
            disasterDeckDiv.innerHTML += `<div class="company-card-placeholder revealed"><strong>${disasterCard.title}</strong><p>${disasterCard.description || ''}</p></div>`;
        } else {
            disasterDeckDiv.innerHTML += `<div class="company-card-placeholder">Нет данных</div>`;
        }

        // Логика отрисовки "рубашек" бонусов
        bonusDeckDiv.innerHTML = '<h4>Плюсы Компании</h4>'; // Восстанавливаем заголовок
        const bonusPlaceholdersContainer = document.createElement('div');
        bonusPlaceholdersContainer.id = 'bonus-cards-placeholders';
        bonusDeckDiv.appendChild(bonusPlaceholdersContainer);

        for (let i = 0; i < data.bonus_card_count; i++) {
            const placeholder = document.createElement('div');
            placeholder.id = `bonus-card-${i}`;
            placeholder.classList.add('company-card-placeholder', 'bonus-card-placeholder');
            placeholder.innerText = 'Плюс Компании';
            
            if (isHost) {
                placeholder.classList.add('host-clickable');
                placeholder.onclick = () => {
                    if (!placeholder.classList.contains('revealed')) {
                        socket.emit('reveal_bonus_card', { 'index': i });
                    }
                };
            }
            bonusPlaceholdersContainer.appendChild(placeholder);
        }
    });
    
    socket.on('deal_cards', (data) => {
        myCardsDiv.innerHTML = '';
        data.cards.forEach(card => {
            // Сохраняем description в data-атрибут и отображаем его в <p>
            const descriptionHTML = card.description ? `<p>${card.description}</p>` : '';
            
            myCardsDiv.innerHTML += `
                <div class="card-item" 
                     data-category="${card.category}" 
                     data-title="${card.title}" 
                     data-description="${card.description || ''}">
                    <strong>${card.category}: ${card.title}</strong>
                    ${descriptionHTML}
                </div>`;
        });
    });

    socket.on('new_card_revealed', (data) => {
        const playerBoardID = `board-for-${data.username.replace(/\s+/g, '-')}`;
        const playerBoard = document.getElementById(playerBoardID);
        if (playerBoard) {
            const cardsOnBoardDiv = playerBoard.querySelector('.cards-on-board');
            if (cardsOnBoardDiv.innerText.includes('Карты не раскрыты')) {
                cardsOnBoardDiv.innerHTML = '';
            }
            
            // Точно так же добавляем проверку и вывод description
            const descriptionHTML = data.card.description ? `<p><small>${data.card.description}</small></p>` : '';
    
            cardsOnBoardDiv.innerHTML += `
                <div class="revealed-card">
                    <p><strong>${data.card.category}: ${data.card.title}</strong></p>
                    ${descriptionHTML}
                </div>`;
        }
    });
    socket.on('new_bonus_revealed', (data) => {
        // ... (этот код у вас правильный, оставляем без изменений)
        const placeholder = document.getElementById(`bonus-card-${data.index}`);
        if (placeholder) {
            placeholder.innerHTML = `<strong>${data.card.title}</strong><p>${data.card.description || ''}</p>`;
            placeholder.classList.remove('host-clickable');
            placeholder.classList.add('revealed');
            placeholder.onclick = null;
        }
    });
    // --- ЛОГИКА ГОЛОСОВАНИЯ ---
    
    // Голосование началось
    socket.on('voting_started', (data) => {
        alert('Голосование началось! Нажмите на доску игрока, чтобы проголосовать.');
        if (isHost) {
            startVotingBtn.style.display = 'none';
            endVotingBtn.style.display = 'block';
        }
        document.querySelectorAll('.player-board').forEach(board => {
            board.style.cursor = 'pointer';
            board.onclick = () => {
                // ИЗМЕНЕНИЕ ЗДЕСЬ: Берем "чистое" имя из data-атрибута
                const usernameToVoteFor = board.querySelector('h3').dataset.username;
                if (usernameToVoteFor !== username) {
                    socket.emit('cast_vote', { 'username': usernameToVoteFor });
                    // Подсветка своего выбора
                    document.querySelectorAll('.player-board').forEach(b => b.style.border = '1px solid var(--border-color)');
                    board.style.border = '2px solid var(--primary-color)';
                }
            };
        });
    });

    // Голосование завершено
    socket.on('voting_ended', (data) => {
        if (isHost) {
            startVotingBtn.style.display = 'block';
            endVotingBtn.style.display = 'none';
        }
        // Сбрасываем счетчики и стили
        document.querySelectorAll('.vote-count').forEach(span => span.textContent = '');
        document.querySelectorAll('.player-board').forEach(board => {
            board.style.cursor = 'default';
            board.style.border = '1px solid var(--border-color)';
            board.onclick = null;
        });
    
        if (data.kicked_player) {
            alert(`Игрок ${data.kicked_player} исключен!`);
            const boardId = `board-for-${data.kicked_player.replace(/\s+/g, '-')}`;
            const kickedPlayerBoard = document.getElementById(boardId);
            if (kickedPlayerBoard) {
                // --- НОВАЯ ЛОГИКА ОТОБРАЖЕНИЯ ВЫБЫВШЕГО ---
                kickedPlayerBoard.classList.add('kicked'); // Добавляем класс "выбывший"
                kickedPlayerBoard.style.backgroundColor = 'var(--danger-color)';
                kickedPlayerBoard.style.opacity = '0.7';
    
                const header = kickedPlayerBoard.querySelector('h3');
                header.innerHTML = `${data.kicked_player} [ВЫБЫЛ]`;
    
                const cardsArea = kickedPlayerBoard.querySelector('.cards-on-board');
                cardsArea.innerHTML = '<h4>Все карты игрока:</h4>';
                data.revealed_cards.forEach(card => {
                     cardsArea.innerHTML += `
                        <div class="revealed-card" style="background-color: #444; border-color: #666;">
                            <p style="margin: 0;"><strong>${card.category}:</strong> ${card.title}</p>
                        </div>`;
                });
            }
        } else {
            alert(data.message);
        }
    });

});