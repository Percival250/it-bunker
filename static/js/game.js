// static/js/game.js

// --- 1. Устанавливаем соединение ---
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

    if (!roomCodeElement) return; // Выходим, если это не страница игры

    const roomCode = roomCodeElement.innerText;
    const username = prompt("Введите ваше имя:");
    let isHost = false; // Сохраняем статус хоста

    // --- 2.2. Отправляем события НА СЕРВЕР (действия пользователя) ---
    
    // Присоединение к комнате
    if (username && roomCode) {
        socket.emit('join', { username: username, room_code: roomCode });
    }

    // Нажатие "Начать игру"
    startGameBtn.addEventListener('click', () => {
        socket.emit('start_game', { room_code: roomCode, module: moduleSelect.value });
    });

    // Нажатие на свою карту для раскрытия
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

    // Нажатия на кнопки голосования (только для хоста)
    startVotingBtn.addEventListener('click', () => socket.emit('start_voting'));
    endVotingBtn.addEventListener('click', () => socket.emit('end_voting'));


    // --- 2.3. Слушаем события от СЕРВЕРА (обновление интерфейса) ---

    // Сервер сообщает нам, являемся ли мы хостом
    socket.on('you_are_host', (data) => {
        isHost = data.is_host;
        if (!isHost) {
            moduleSelect.disabled = true;
            startGameBtn.disabled = true;
        }
    });

    // Сервер присылает список модулей
    socket.on('available_modules', (data) => {
        moduleSelect.innerHTML = '';
        data.modules.forEach(module => {
            const option = document.createElement('option');
            option.value = module;
            option.textContent = module;
            moduleSelect.appendChild(option);
        });
        if (isHost) {
            moduleSelect.disabled = false;
            startGameBtn.disabled = false;
        }
    });

    // Сервер присылает обновленный список игроков
    socket.on('player_update', (data) => {
        const players = data.players;
        playersList.innerHTML = '';
        players.forEach(player => {
            const li = document.createElement('li');
li.textContent = player;
            playersList.appendChild(li);
        });

        // Синхронизируем доски игроков на общем столе
        const currentPlayerBoards = new Set(players.map(p => `board-for-${p.replace(/\s+/g, '-')}`));
        Array.from(revealedCardsArea.querySelectorAll('.player-board')).forEach(board => {
            if (!currentPlayerBoards.has(board.id)) board.remove();
        });

        players.forEach(player => {
            const playerBoardID = `board-for-${player.replace(/\s+/g, '-')}`;
            if (!document.getElementById(playerBoardID)) {
                const playerBoard = document.createElement('div');
                playerBoard.classList.add('player-board');
                playerBoard.id = playerBoardID;
                playerBoard.innerHTML = `<h3>${player}</h3><div class="cards-on-board"><p>Карты не раскрыты</p></div>`;
                if (revealedCardsArea.innerText.includes('Ожидание')) revealedCardsArea.innerHTML = '';
                revealedCardsArea.appendChild(playerBoard);
            }
        });

        if (players.length === 0) revealedCardsArea.innerHTML = '<p>Ожидание игроков...</p>';
    });

    // Сервер присылает нам наши карты
    socket.on('deal_cards', (data) => {
        myCardsDiv.innerHTML = '';
        data.cards.forEach(card => {
            myCardsDiv.innerHTML += `
                <div class="card-item" data-category="${card.category}" data-title="${card.title}" data-description="${card.description || ''}">
                    <strong>${card.category}: ${card.title}</strong>
                    <p>${card.description || ''}</p>
                </div>`;
        });
    });

    // Сервер сообщает, что игра началась
    socket.on('game_started', (data) => {
        startGameBtn.disabled = true;
        moduleSelect.disabled = true;
        if (isHost) {
            hostVotingControls.style.display = 'block';
        }
    });

    // Сервер сообщает, что кто-то раскрыл карту
    socket.on('new_card_revealed', (data) => {
        const playerBoardID = `board-for-${data.username.replace(/\s+/g, '-')}`;
        const playerBoard = document.getElementById(playerBoardID);
        if (playerBoard) {
            const cardsOnBoardDiv = playerBoard.querySelector('.cards-on-board');
            if (cardsOnBoardDiv.innerText.includes('Карты не раскрыты')) cardsOnBoardDiv.innerHTML = '';
            cardsOnBoardDiv.innerHTML += `<div class="revealed-card"><p><strong>${data.card.category}: ${data.card.title}</strong></p></div>`;
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
                const usernameToVoteFor = board.querySelector('h3').innerText;
                if (usernameToVoteFor !== username) { // Нельзя голосовать за себя
                    socket.emit('cast_vote', { 'username': usernameToVoteFor });
                    // Подсвечиваем свой выбор
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
        document.querySelectorAll('.player-board').forEach(board => {
            board.style.cursor = 'default';
            board.style.border = '1px solid var(--border-color)'; // Сбрасываем подсветку
            board.onclick = null;
        });

        if (data.kicked_player) {
            alert(`Игрок ${data.kicked_player} исключен!`);
            const boardId = `board-for-${data.kicked_player.replace(/\s+/g, '-')}`;
            const kickedPlayerBoard = document.getElementById(boardId);
            if (kickedPlayerBoard) {
                const cardsArea = kickedPlayerBoard.querySelector('.cards-on-board');
                cardsArea.innerHTML = '<h4>Карты изгнанного:</h4>';
                data.revealed_cards.forEach(card => {
                     cardsArea.innerHTML += `<p><small>${card.category}: ${card.title}</small></p>`;
                });
                kickedPlayerBoard.style.backgroundColor = 'var(--danger-color)';
                kickedPlayerBoard.style.opacity = '0.5';
            }
        } else {
            alert(data.message); // Показываем сообщение о ничьей
        }
    });

});