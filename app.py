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
player_to_room = {}
hands = {}
votes = {}
voting_active = {}
# --- ОБЫЧНЫЕ HTTP-МАРШРУТЫ (FLASK) ---

@app.route('/')
def index():
    return render_template('index.html')

# Маршрут для создания комнаты теперь просто перенаправляет на страницу игры
@app.route('/create_room', methods=['POST'])
def create_room():
    room_code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=5))
    # ВАЖНО: Пока мы не знаем sid хоста. Мы назначим его, когда хост подключится через WebSocket.
    rooms[room_code] = {'host_sid': None, 'players': {}}
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
    # Отправляем список доступных модулей при подключении
    with app.app_context():
        modules = db.session.query(Card.module).distinct().all()
        module_names = [m[0] for m in modules if m[0] is not None]
        emit('available_modules', {'modules': module_names})

@socketio.on('join')
def on_join(data):
    username = data.get('username', 'Аноним')
    room_code = data['room_code']
    sid = request.sid
    
    player_to_room[sid] = room_code
    
    if room_code not in rooms:
        return
    
    # --- ЛОГИКА НАЗНАЧЕНИЯ ХОСТА ---
    # Если хост еще не назначен (это первый игрок в комнате), делаем его хостом.
    if rooms[room_code]['host_sid'] is None:
        rooms[room_code]['host_sid'] = sid
        print(f"Игрок {username} (sid: {sid}) назначен хостом комнаты {room_code}")
        # Отправляем ЛИЧНО ему сообщение, что он хост
        emit('you_are_host', {'is_host': True}, to=sid)
    else:
        # Всем остальным сообщаем, что они не хосты
        emit('you_are_host', {'is_host': False}, to=sid)

    join_room(room_code)
    
    rooms[room_code]['players'][sid] = username
    
    print(f"Игрок {username} (sid: {sid}) присоединился к {room_code}")
    
    player_names = list(rooms[room_code]['players'].values())
    emit('player_update', {'players': player_names}, to=room_code)

@socketio.on('disconnect')
def on_disconnect():
    sid = request.sid
    # Удаляем связь игрок -> комната
    if sid in player_to_room:
        player_to_room.pop(sid)
        
    for room_code, room_data in list(rooms.items()):
        if sid in room_data.get('players', {}):
            username = room_data['players'].pop(sid)
            print(f"Игрок {username} (sid: {sid}) отключился от {room_code}")
            
            if not room_data['players']:
                rooms.pop(room_code)
                print(f"Комната {room_code} пуста и удалена.")
            else:
                player_names = list(room_data['players'].values())
                emit('player_update', {'players': player_names}, to=room_code)
            break

@socketio.on('start_game')
def on_start_game(data):
    room_code = data['room_code']
    sid = request.sid

    if room_code in rooms and rooms[room_code]['host_sid'] == sid:
        if rooms[room_code].get('game_started', False):
            return
        
        # Инициализируем новые поля состояния игры
        rooms[room_code]['game_started'] = True
        rooms[room_code]['hands'] = {} # <-- Сохраняем руки игроков здесь
        rooms[room_code]['votes'] = {}
        rooms[room_code]['voting_active'] = False

        players_in_room = rooms[room_code]['players']
        
        with app.app_context():
            # ... (код для получения и перемешивания карт остается таким же) ...
            all_cards_in_module = Card.query.filter_by(module=data['module']).all()
            # ... (группировка и перемешивание) ...
            cards_by_category = {}
            for card in all_cards_in_module:
                if card.category not in cards_by_category:
                    cards_by_category[card.category] = []
                cards_by_category[card.category].append(card)
            for category in cards_by_category:
                random.shuffle(cards_by_category[category])

            for player_sid, username in players_in_room.items():
                player_hand = []
                # ... (логика раздачи карт через pop() остается такой же) ...
                for category, cards in cards_by_category.items():
                    if cards: player_hand.append(cards.pop())

                # Конвертируем карты в словари
                cards_data = [{'title': c.title, 'description': c.description, 'category': c.category} for c in player_hand]
                
                # ГЛАВНОЕ: Сохраняем руку игрока на сервере
                rooms[room_code]['hands'][player_sid] = cards_data
                
                # Отправляем карты лично игроку
                emit('deal_cards', {'cards': cards_data}, to=player_sid)
                print(f"Игроку {username} (sid: {player_sid}) розданы и сохранены карты.")

        emit('game_started', {'message': f"Игра началась! Карты розданы."}, to=room_code)

    else:
        print(f"Попытка начать игру не от хоста в комнате {room_code} от sid {sid}")

# НОВЫЙ ОБРАБОТЧИК ДЛЯ РАСКРЫТИЯ КАРТЫ
@socketio.on('reveal_card')
def on_reveal_card(data):
    sid = request.sid
    if sid in player_to_room:
        room_code = player_to_room[sid]
        
        if room_code in rooms and sid in rooms[room_code]['players']:
            username = rooms[room_code]['players'][sid]
            card_data = data['card']
            
            print(f"Игрок {username} в комнате {room_code} раскрыл карту: {card_data['title']}")
            
            # Отправляем всем в комнате информацию о раскрытой карте
            emit('new_card_revealed', {
                'username': username,
                'card': card_data
            }, to=room_code)

@socketio.on('start_voting')
def on_start_voting():
    sid = request.sid
    if sid in player_to_room:
        room_code = player_to_room[sid]
        # Только хост может начать голосование
        if room_code in rooms and rooms[room_code]['host_sid'] == sid:
            rooms[room_code]['voting_active'] = True
            rooms[room_code]['votes'] = {} # Очищаем старые голоса
            
            # Сообщаем всем, что голосование началось
            emit('voting_started', {'players': rooms[room_code]['players']}, to=room_code)
            print(f"В комнате {room_code} началось голосование.")

@socketio.on('cast_vote')
def on_cast_vote(data):
    voter_sid = request.sid
    voted_for_username = data['username']
    
    if voter_sid in player_to_room:
        room_code = player_to_room[voter_sid]
        
        if rooms[room_code].get('voting_active', False):
            # Находим sid того, за кого проголосовали
            voted_for_sid = None
            for sid, username in rooms[room_code]['players'].items():
                if username == voted_for_username:
                    voted_for_sid = sid
                    break
            
            if voted_for_sid:
                votes = rooms[room_code]['votes']
                # Логика "включить/выключить" голос
                if votes.get(voter_sid) == voted_for_sid:
                    votes.pop(voter_sid) # Убираем голос, если нажал повторно
                else:
                    votes[voter_sid] = voted_for_sid # Засчитываем голос

                # Отправляем всем обновленную информацию о голосах
                emit('vote_update', {'votes': votes}, to=room_code)

@socketio.on('end_voting')
def on_end_voting():
    sid = request.sid
    if sid in player_to_room:
        room_code = player_to_room[sid]
        if room_code in rooms and rooms[room_code]['host_sid'] == sid:
            rooms[room_code]['voting_active'] = False
            
            votes = rooms[room_code]['votes']
            if not votes: # Если никто не голосовал
                emit('voting_ended', {'kicked_player': None, 'message': 'Никто не был исключен.'}, to=room_code)
                return

            # Считаем голоса
            vote_counts = {}
            for voted_for_sid in votes.values():
                vote_counts[voted_for_sid] = vote_counts.get(voted_for_sid, 0) + 1
            
            # Находим, за кого больше всего голосов
            max_votes = max(vote_counts.values())
            kicked_sids = [sid for sid, count in vote_counts.items() if count == max_votes]
            
            # Если ничья, никого не исключаем (можно усложнить позже)
            if len(kicked_sids) != 1:
                emit('voting_ended', {'kicked_player': None, 'message': 'Ничья! Никто не был исключен.'}, to=room_code)
                return

            kicked_sid = kicked_sids[0]
            kicked_player_username = rooms[room_code]['players'][kicked_sid]
            kicked_player_hand = rooms[room_code]['hands'].get(kicked_sid, [])
            
            # Удаляем игрока
            rooms[room_code]['players'].pop(kicked_sid)
            rooms[room_code]['hands'].pop(kicked_sid, None)
            
            # Отправляем всем результат
            emit('voting_ended', {
                'kicked_player': kicked_player_username,
                'revealed_cards': kicked_player_hand
            }, to=room_code)
            
            # Обновляем список игроков
            player_names = list(rooms[room_code]['players'].values())
            emit('player_update', {'players': player_names}, to=room_code)
            print(f"В комнате {room_code} исключен игрок {kicked_player_username}.")