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
    module = db.Column(db.String(50), nullable=False, default='base') # <-- ДОБАВЛЯЕМ ЭТУ СТРОКУ
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

@app.route('/add_test_data')
def add_test_data():
    try:
        with app.app_context():
            db.create_all() # Эта команда теперь также добавит новое поле 'module' в таблицу

            # Добавляем карточки для БАЗОВОГО модуля
            if not Card.query.filter_by(title='Backend-разработчик').first():
                cards_base = [
                    Card(module='Базовый IT', category='Профессия', title='Backend-разработчик', description='Пишет логику на стороне сервера.'),
                    Card(module='Базовый IT', category='Хобби', title='Собирает механические клавиатуры', description='Тратит много денег на кейкапы.')
                ]
                db.session.add_all(cards_base)

            # Добавляем карточки для нового, Gamedev модуля
            if not Card.query.filter_by(title='Unity разработчик').first():
                cards_gamedev = [
                    Card(module='GameDev', category='Профессия', title='Unity разработчик', description='Знает все о префабах.'),
                    Card(module='GameDev', category='Хобби', title='Создает моды для Skyrim', description='"Это не баг, а фича!"')
                ]
                db.session.add_all(cards_gamedev)
            
            db.session.commit()
            return "Тестовые данные для модулей 'Базовый IT' и 'GameDev' успешно добавлены/обновлены!"
    except Exception as e:
        return f"Произошла ошибка: {e}"

# --- ОБРАБОТЧИКИ СОБЫТИЙ (SOCKET.IO) ---

@socketio.on('connect')
def on_connect():
    # Когда игрок подключается, отправим ему список доступных модулей
    with app.app_context():
        # Находим все уникальные названия модулей в базе
        modules = db.session.query(Card.module).distinct().all()
        # Преобразуем результат в простой список строк
        module_names = [m[0] for m in modules]
        emit('available_modules', {'modules': module_names})

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

@socketio.on('start_game')
def on_start_game(data):
    room_code = data['room_code']
    selected_module = data['module']
    
    if room_code in rooms:
        players_in_room = rooms[room_code]['players']
        
        with app.app_context():
            # Вытаскиваем ВСЕ карты из выбранного модуля
            all_cards_in_module = Card.query.filter_by(module=selected_module).all()

            for player in players_in_room:
                # --- ЗДЕСЬ ЛОГИКА РАЗДАЧИ КАРТ ---
                # Для примера, раздадим каждому по 1 случайной профессии
                
                # Фильтруем карты профессий
                professions = [c for c in all_cards_in_module if c.category == 'Профессия']
                
                # Выбираем одну случайную профессию
                if professions:
                    card_to_deal = random.choice(professions)
                    
                    # Формируем данные для отправки
                    card_data = {
                        'title': card_to_deal.title,
                        'description': card_to_deal.description,
                        'category': card_to_deal.category
                    }
                    # Отправляем карту ЛИЧНО этому игроку
                    # Для этого нам нужен его sid (уникальный ID сессии),
                    # но пока для простоты будем отправлять всем одинаковую карту для демонстрации.
                    # В будущем мы это усложним.
                    
                    # Отправляем событие ВСЕМ в комнате с информацией, кто какую карту получил
                    # (в реальной игре так делать нельзя, но для теста сойдет)
                    emit('game_update', {'message': f'Игроку {player} раздали карту: {card_data["title"]}'}, to=room_code)
                    
                    # Отправляем личное событие с картой (ЭТО ПРАВИЛЬНЫЙ СПОСОБ)
                    # Чтобы это работало, нам нужно хранить sid игроков. Пока пропустим.
                    # emit('deal_card', card_data, to=player_sid)

        print(f"Игра в комнате {room_code} началась с модулем '{selected_module}'!")
        
# --- ЗАПУСК ПРИЛОЖЕНИЯ ---
if __name__ == '__main__':
    # Теперь мы запускаем приложение через socketio.run(), а не app.run()
    # allow_unsafe_werkzeug=True нужно для совместимости последней версии SocketIO
    socketio.run(app, debug=True, allow_unsafe_werkzeug=True)