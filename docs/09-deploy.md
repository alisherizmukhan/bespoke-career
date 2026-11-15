# 9. Деплой и запуск

## 9.1. Где что работает

| Часть | Платформа | Адрес | Тариф |
|---|---|---|---|
| Сайт (Next.js) | **Vercel**, команда `swe-farmers`, проект `bespoke-career` | https://bespoke-career.vercel.app | Бесплатный |
| API (FastAPI, Docker) | **Render**, сервис `bespoke-api`, регион Virginia | https://bespoke-api-sbc7.onrender.com | Бесплатный |
| База данных | **Render PostgreSQL 17**, `bespoke-db` | доступна только API | Бесплатная, **истекает 14.12.2026** (нужно продлить или перейти на платный) |
| Код | **GitHub**, приватный `alisherizmukhan/bespoke-career`, ветка `main` | | Бесплатный |
| Пинг раз в час | **GitHub Actions**, `.github/workflows/keepalive.yml` | | Бесплатный |

## 9.2. Как происходит деплой (автоматически)

```
git push в main ──▶ GitHub
                       ├──▶ Vercel: собирает frontend/ (npm install, next build) → публикует за ~1 минуту
                       └──▶ Render: собирает Docker-образ backend/ → запускает:
                              alembic upgrade head   (миграции базы)
                              python -m app.seed     (тарифы, админ, демо-данные; идемпотентно)
                              uvicorn app.main:app   (сервер)
                            проверка /health → переключение трафика без простоя
```

Ручных шагов нет: изменения попадают на прод после `git push`.

**Инфраструктура как код.** Файл `render.yaml` (Render Blueprint) описывает базу, сервис, Dockerfile, health check и все переменные окружения. Render синхронизирует их автоматически (`autoSync`). Базу и сервис можно воссоздать из этого файла.

### Зачем пинг раз в час
Бесплатный сервер Render засыпает после 15 минут без запросов, а сбор вакансий живёт внутри сервера. GitHub Actions в 7 минут каждого часа запрашивает `/health`, делает до 6 попыток (холодный старт до минуты). Сервер просыпается, и планировщик собирает вакансии из источников, у которых подошёл срок.

## 9.3. Переменные окружения бэкенда (Render → bespoke-api → Environment)

| Переменная | Значение | Секрет |
|---|---|---|
| `ENV` | `production`: выключает документацию API, включает HSTS | |
| `DATABASE_URL` | подставляется из `bespoke-db` автоматически | 🔒 |
| `JWT_SECRET` | сгенерирован Render случайно; подпись токенов и ссылок на файлы | 🔒 |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | `admin@bespoke.app` / сгенерирован Render | 🔒 пароль |
| `SEED_DEMO_DATA` | `true`: создать демо и тестовых пользователей | |
| `AI_PROVIDER` | `openai` | |
| `OPENAI_MODEL` / `OPENAI_MODEL_FAST` | `gpt-5.5` / `gpt-5.4-mini` | |
| `OPENAI_API_KEY` | ключ OpenAI заказчика; введён вручную, **нигде больше не хранится** | 🔒 |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | пусто (тестовый режим), заполняются для оплаты через Stripe | 🔒 |
| `INGEST_ENABLED` / `INGEST_INTERVAL_MINUTES` | `true` / `60` | |
| `LOCAL_UPLOAD_DIR` | `/tmp/uploads` | |
| `FRONTEND_URL` | `https://bespoke-career.vercel.app` (ссылки в письмах, возврат из Stripe) | |
| `CORS_ORIGINS` | адреса сайта, которым разрешено обращаться к API | |
| `PUBLIC_API_URL` | `https://bespoke-api-sbc7.onrender.com` (подписанные ссылки на файлы) | |

На Vercel одна переменная: `NEXT_PUBLIC_API_URL` = адрес API. Она публичная по определению: браузер всё равно туда обращается.

Ни одного секрета нет в коде, в репозитории и в документации. Пример переменных без значений лежит в `backend/.env.example`.

## 9.4. Локальный запуск (Windows, macOS, Linux)

Нужны Python 3.12 и Node.js 20+.

**Бэкенд:**
```bash
cd backend
python -m venv .venv
.venv/Scripts/activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head            # создаст SQLite-базу
python -m app.seed              # тарифы, админ, демо-пользователи
uvicorn app.main:app --port 8000
```
Документация API откроется на http://localhost:8000/api/docs.

**Фронтенд** (в другом терминале):
```bash
cd frontend
npm install
npm run dev
```
Сайт: http://localhost:3000. Без ключей OpenAI и Stripe всё работает в запасных режимах (раздел 3).

**Тесты:**
```bash
cd backend
pytest
```

## 9.5. История выбора хостинга

1. **Railway** — по ТЗ всё (фронт, бэк, база) должно было жить там. Деплой упёрся в окончание пробного периода (*trial expired*), бесплатно разместить не удалось.
2. **Render + Vercel** — переход согласовали с заказчиком. Render даёт бесплатный Docker и PostgreSQL, Vercel — лучший хостинг для Next.js.
3. Проблемы по ходу и как решили:
   - Render не показывает пароль базы через API → база подключена через Blueprint (`fromDatabase`), без ручного копирования строки подключения.
   - Vercel заблокировал сборку из-за уязвимости в Next.js 15.1.6 → обновили до 15.5.29 и React 19.3.1.
   - Сборка падала на загрузке Google Fonts → шрифты подключены локально через `@fontsource`.
   - Сайт на Vercel по умолчанию был закрыт SSO-защитой команды → защиту отключили для публичного доступа.
   - Бесплатный Render засыпает → пинг раз в час через GitHub Actions.
