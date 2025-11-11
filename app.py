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
            # Эта команда создает таблицы или добавляет новые столбцы, если их нет
            db.create_all()

            # --- Создаем новый "Тестовый" модуль ---
            module_name = "Тестовый"
            
            # Удаляем старые тестовые карты, чтобы избежать дубликатов при перезапуске
            Card.query.filter_by(module=module_name).delete()
            db.session.commit()

            # Создаем по 2 экземпляра карт каждой категории
            test_cards = [
                # Профессии
                Card(module=module_name, category='Профессия', title='Frontend-разработчик'),
                Card(module=module_name, category='Профессия', title='Backend-разработчик'),
                # Хобби
                Card(module=module_name, category='Хобби', title='Играет в настолки'),
                Card(module=module_name, category='Хобби', title='Смотрит аниме'),
                # Здоровье
                Card(module=module_name, category='Здоровье', title='Идеальное зрение'),
                Card(module=module_name, category='Здоровье', title='Туннельный синдром'),
                # Биология (Пол)
                Card(module=module_name, category='Биология', title='Пол: Мужской'),
                Card(module=module_name, category='Биология', title='Пол: Женский'),
                # Биология (Возраст) - просто как еще один тип
                Card(module=module_name, category='Возраст', title='Возраст: 25 лет'),
                Card(module=module_name, category='Возраст', title='Возраст: 35 лет'),
                # Факт
                Card(module=module_name, category='Факт', title='Может выйти из Vim'),
                Card(module=module_name, category='Факт', title='Отцентровал div с первого раза'),
                # Багаж
                Card(module=module_name, category='Багаж', title='Ноутбук MacBook Pro'),
                Card(module=module_name, category='Багаж', title='Резиновая уточка для дебага'),
                # Особое условие
                Card(module=module_name, category='Особое условие', title='Может украсть чужой Багаж'),
                Card(module=module_name, category='Особое условие', title='Может обменяться картой Здоровья')
            ]
            
            db.session.add_all(test_cards)
            db.session.commit()
            
            return f"Тестовый модуль '{module_name}' успешно создан/обновлен!"
    except Exception as e:
        db.session.rollback() # Откатываем изменения в случае ошибки
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
        # Блокируем повторное начало игры
        if rooms[room_code].get('game_started', False):
            return
        rooms[room_code]['game_started'] = True

        players_in_room = rooms[room_code]['players'] # Словарь {sid: username}
        
        with app.app_context():
            # 1. Вытаскиваем ВСЕ карты из выбранного модуля и группируем по категориям
            all_cards_in_module = Card.query.filter_by(module=selected_module).all()
            
            cards_by_category = {}
            for card in all_cards_in_module:
                if card.category not in cards_by_category:
                    cards_by_category[card.category] = []
                cards_by_category[card.category].append(card)

            # 2. Перемешиваем карты внутри каждой категории
            for category in cards_by_category:
                random.shuffle(cards_by_category[category])

            # 3. Раздаем карты игрокам
            for sid, username in players_in_room.items():
                player_hand = []
                
                # Пробегаемся по всем категориям и выдаем по одной карте, если они есть
                for category, cards in cards_by_category.items():
                    if cards: # Проверяем, что карты в этой категории еще остались
                        # Берем последнюю карту из перемешанного списка и удаляем ее,
                        # чтобы она не досталась другому игроку
                        card_to_deal = cards.pop()
                        player_hand.append(card_to_deal)

                # 4. Отправляем руку лично игроку
                cards_to_send = [
                    {'title': c.title, 'description': c.description, 'category': c.category}
                    for c in player_hand
                ]
                
                emit('deal_cards', {'cards': cards_to_send}, to=sid)
                print(f"Игроку {username} (sid: {sid}) раздали {len(cards_to_send)} карт(ы)")

        # 5. Сообщаем всем в комнате, что игра началась
        emit('game_started', {'message': f"Игра началась! Модуль: {selected_module}. Карты розданы."}, to=room_code)