from flask import Flask, render_template, request, redirect, url_for
from flask_sqlalchemy import SQLAlchemy
import os
import random
import string

app = Flask(__name__)

# Временное хранилище для комнат. Позже мы заменим это базой данных.
rooms = {}

db_uri = 'postgresql://postgres.wqrbncvoonxhnswdsrgq:88E015A96A3E318BDB6956801CF65DC897D0A88D@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'
app.config['SQLALCHEMY_DATABASE_URI'] = db_uri
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# --- МОДЕЛЬ ДАННЫХ ДЛЯ КАРТОЧЕК ---
# Создаем шаблон для хранения карточек в будущем
class Card(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    category = db.Column(db.String(50), nullable=False)
    title = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text, nullable=True)

    def __repr__(self):
        return f'<Card {self.title}>'

# --- ЛОГИКА ПРИЛОЖЕНИЯ (пока без комнат) ---
@app.route('/')
def index():
    # Получаем все карточки из БД для проверки
    cards = Card.query.all()
    return render_template('index.html', cards=cards)

# --- ТЕСТОВЫЙ РУТ ДЛЯ ДОБАВЛЕНИЯ ДАННЫХ ---
# Этот код нужен только для первоначального наполнения.
# В будущем его можно будет удалить.
@app.route('/add_test_data')
def add_test_data():
    try:
        # Создаем таблицы, если их нет
        with app.app_context():
            db.create_all()

        # Добавляем тестовые карточки
        test_card1 = Card(category='Профессия', title='Backend-разработчик', description='Пишет логику на стороне сервера.')
        test_card2 = Card(category='Хобби', title='Собирает механические клавиатуры', description='Тратит много денег на кейкапы.')
        db.session.add(test_card1)
        db.session.add(test_card2)
        db.session.commit()
        return "Тестовые данные успешно добавлены!"
    except Exception as e:
        return f"Произошла ошибка: {e}"

@app.route('/create_room', methods=['POST'])
def create_room():
    # Генерируем случайный 5-значный код для комнаты
    room_code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=5))
    rooms[room_code] = {'players': []} # Создаем пустую комнату
    return redirect(url_for('game_room', room_code=room_code))

@app.route('/join_room', methods=['POST'])
def join_room():
    room_code = request.form.get('room_code').upper()
    if room_code in rooms:
        return redirect(url_for('game_room', room_code=room_code))
    else:
        # Здесь можно добавить сообщение об ошибке, но пока просто вернем на главную
        return redirect(url_for('index'))

@app.route('/game/<string:room_code>')
def game_room(room_code):
    room = rooms.get(room_code.upper())
    if not room:
        return redirect(url_for('index'))
    return render_template('game.html', room_code=room_code, players=room['players'])

if __name__ == '__main__':
    # Для локального запуска
    app.run(debug=True)