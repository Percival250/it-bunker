import eventlet
eventlet.monkey_patch()

# 2. Теперь импортируем все остальное
from flask import Flask, render_template, request, redirect, url_for
from flask_socketio import SocketIO, join_room, leave_room, emit
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv
from whitenoise import WhiteNoise # WhiteNoise тоже должен быть после патча
import os
import random
import string


load_dotenv()
app = Flask(__name__)

app.wsgi_app = WhiteNoise(app.wsgi_app, root='static/')
# Добавляем секретный ключ, он важен для работы сессий и SocketIO
app.config['SECRET_KEY'] = 'Nauka2.0' # Можете вписать сюда любую фразу

# --- НАСТРОЙКА БАЗЫ ДАННЫХ ---
db_uri = os.environ.get('DATABASE_URL')
app.config['SQLALCHEMY_DATABASE_URI'] = db_uri
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# --- ИНИЦИАЛИЗАЦИЯ SOCKETIO ---
# Мы "обертываем" наше приложение в SocketIO
socketio = SocketIO(app)


# --- МОДЕЛИ ДАННЫХ (остаются без изменений) ---
class Card(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    category = db.Column(db.String(50), nullable=False)
    title = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text, nullable=True)

    def __repr__(self):
        return f'<Card {self.title}>'

# Временное хранилище для комнат и игроков, пока не перенесли в БД
# Структура: {'КОД_КОМНАТЫ': {'players': ['Имя1', 'Имя2']}}
rooms = {}

# --- ОБЫЧНЫЕ HTTP-МАРШРУТЫ (FLASK) ---

@app.route('/')
def index():
    return render_template('index.html')

# Маршрут для создания комнаты теперь просто перенаправляет на страницу игры
@app.route('/create_room', methods=['POST'])
def create_room():
    room_code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=5))
    rooms[room_code] = {'players': []} # Создаем комнату во временном хранилище
    return redirect(url_for('game_room_page', room_code=room_code))

@app.route('/join_room', methods=['POST'])
def join_room_action(): # <--- ИЗМЕНЕНИЕ ЗДЕСЬ
    room_code = request.form.get('room_code').upper()
    if room_code not in rooms:
        return redirect(url_for('index'))
    return redirect(url_for('game_room_page', room_code=room_code))

@app.route('/game/<string:room_code>')
def game_room_page(room_code):
    # Эта страница теперь просто отображает HTML-шаблон
    return render_template('game.html', room_code=room_code)


# --- ОБРАБОТЧИКИ СОБЫТИЙ (SOCKET.IO) ---

# Этот обработчик срабатывает, когда игрок открывает страницу игры
@socketio.on('join')
def on_join(data):
    # Получаем данные от клиента (из JavaScript)
    username = data.get('username', 'Аноним')
    room_code = data['room_code']

    # Добавляем игрока в нашу "виртуальную комнату" на сервере
    join_room(room_code)
    
    # Добавляем игрока в наше временное хранилище
    if room_code in rooms and username not in rooms[room_code]['players']:
        rooms[room_code]['players'].append(username)

    # Отправляем ВСЕМ игрокам в этой комнате сообщение о том, что
    # к ним присоединился новый игрок, и обновленный список всех игроков.
    emit('player_joined', {'username': username, 'players': rooms[room_code]['players']}, to=room_code)
    print(f"Игрок {username} присоединился к комнате {room_code}")


# --- ЗАПУСК ПРИЛОЖЕНИЯ ---
if __name__ == '__main__':
    # Теперь мы запускаем приложение через socketio.run(), а не app.run()
    # allow_unsafe_werkzeug=True нужно для совместимости последней версии SocketIO
    socketio.run(app, debug=True, allow_unsafe_werkzeug=True)