// Устанавливаем соединение с сервером
// io() само поймет, к какому серверу подключаться
const socket = io();

// Получаем код комнаты и имя пользователя со страницы
const roomCode = document.getElementById('room-code').innerText;
// Пока что имя пользователя будем запрашивать через prompt
const username = prompt("Введите ваше имя:");

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