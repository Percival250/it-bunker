// Устанавливаем соединение с сервером
// io() само поймет, к какому серверу подключаться
const socket = io();

// Получаем код комнаты и имя пользователя со страницы
const roomCode = document.getElementById('room-code').innerText;
// Пока что имя пользователя будем запрашивать через prompt
const username = prompt("Введите ваше имя:");

const moduleSelect = document.getElementById('module-select');
const startGameBtn = document.getElementById('start-game-btn');
const myCardsDiv = document.getElementById('my-cards');
// Как только страница загрузилась, отправляем серверу событие 'join'
document.addEventListener('DOMContentLoaded', () => {
    if (username && roomCode) {
        socket.emit('join', { username: username, room_code: roomCode });
    }
});

// Слушаем событие 'player_joined' от сервера
socket.on('player_joined', (data) => {
    console.log(`Игрок ${data.username} присоединился!`);
    
    // Находим на странице список игроков
    const playersList = document.getElementById('players-list');
    
    // Очищаем старый список
    playersList.innerHTML = '';

    // Обновляем список игроков на странице
    data.players.forEach(player => {
        const li = document.createElement('li');
        li.textContent = player;
        playersList.appendChild(li);
    });
});
socket.on('available_modules', (data) => {
    moduleSelect.innerHTML = ''; // Очищаем "Загрузка..."
    data.modules.forEach(module => {
        const option = document.createElement('option');
        option.value = module;
        option.textContent = module;
        moduleSelect.appendChild(option);
    });
    moduleSelect.disabled = false; // Делаем селект активным
    startGameBtn.disabled = false; // И кнопку тоже
});

// Навешиваем событие на кнопку "Начать игру"
startGameBtn.addEventListener('click', () => {
    const selectedModule = moduleSelect.value;
    if (selectedModule) {
        console.log(`Начинаем игру с модулем: ${selectedModule}`);
        socket.emit('start_game', { room_code: roomCode, module: selectedModule });
    }
});

// Слушаем общее игровое событие (пока для теста)
socket.on('game_update', (data) => {
    myCardsDiv.innerHTML = `<p>${data.message}</p>`; // Просто показываем сообщение от сервера
});
