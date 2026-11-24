# 9. Деплой и запуск

## 9.1. Где что работает

| Часть | Платформа | Адрес | Тариф |
|---|---|---|---|
| Сайт (Next.js) | **Vercel**, команда `BC2`, проект `bespoke-careers` | https://bespoke-careers.vercel.app | Бесплатный (Hobby) |
| API (FastAPI, Docker) | **Railway**, проект `bespoke`, сервис `bespoke-api` | https://bespoke-api-production-6091256b.up.railway.app | Пробный период Railway, дальше по использованию |
| База данных | **Railway PostgreSQL 18**, сервис `Postgres` в том же проекте | доступна только API по внутренней сети Railway | Входит в проект Railway |
| Код | **GitHub**, публичный `tokkisun/bespoke`, ветка `main` | https://github.com/tokkisun/bespoke | Бесплатный |

## 9.2. Как происходит деплой

```
git push в main ──▶ GitHub tokkisun/bespoke
                       └──▶ Railway (сервис bespoke-api подключён к репозиторию):
                              собирает Docker-образ из backend/Dockerfile → запускает:
                                alembic upgrade head   (миграции базы)
                                python -m app.seed     (тарифы, админ, демо-данные; идемпотентно)
                                uvicorn app.main:app   (сервер)
                              проверка /health → переключение трафика без простоя

Сайт:   cd bespoke  →  npx vercel deploy --prod   (Vercel собирает frontend/ за ~1 минуту)
```

Бэкенд обновляется сам после `git push`. Сайт выкладывается командой `npx vercel deploy --prod` из корня репозитория: в проекте Vercel указан Root Directory = `frontend`. Чтобы сайт тоже обновлялся после `git push`, достаточно один раз подключить репозиторий в Vercel → проект `bespoke-careers` → Settings → Git (нужен доступ приложения Vercel к GitHub-аккаунту `tokkisun`).

**Настройки сервиса `bespoke-api` на Railway** (заданы при создании проекта, хранятся в Railway):

| Настройка | Значение |
|---|---|
| Source | GitHub `tokkisun/bespoke`, ветка `main` |
| Root Directory | `/backend` |
| Сборка | `backend/Dockerfile` (Railway находит его сам) |
| Health check | `GET /health`, ожидание до 300 секунд (первый старт выполняет миграции и сид) |
| Перезапуск | при падении, до 5 попыток |
| Публичный адрес | `bespoke-api-production-6091256b.up.railway.app` (домен Railway) |

**Railway не засыпает.** В отличие от бесплатных тарифов других хостингов, сервис на Railway работает постоянно. Поэтому пинг раз в час не нужен: планировщик внутри сервера сам собирает вакансии из источников раз в 60 минут.

## 9.3. Переменные окружения бэкенда (Railway → bespoke → bespoke-api → Variables)

| Переменная | Значение | Секрет |
|---|---|---|
| `ENV` | `production`: выключает документацию API, включает HSTS | |
| `DATABASE_URL` | ссылка `${{Postgres.DATABASE_URL}}`: Railway подставляет адрес базы сам | 🔒 |
| `JWT_SECRET` | случайная строка, сгенерирована при создании; подпись токенов и ссылок на файлы | 🔒 |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | `admin@bespoke.app` / случайный пароль, сгенерирован при создании | 🔒 пароль |
| `SEED_DEMO_DATA` | `true`: создать демо и тестовых пользователей | |
| `AI_PROVIDER` | `openai` | |
| `OPENAI_MODEL` / `OPENAI_MODEL_FAST` | `gpt-5.5` / `gpt-5.4-mini` | |
| `OPENAI_API_KEY` | ключ OpenAI; вводится вручную, **нигде больше не хранится**. Без него ИИ работает на запасной логике | 🔒 |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | не заданы (тестовый режим), заполняются для оплаты через Stripe | 🔒 |
| `INGEST_ENABLED` / `INGEST_INTERVAL_MINUTES` | `true` / `60` | |
| `LOCAL_UPLOAD_DIR` | `/tmp/uploads` | |
| `FRONTEND_URL` | `https://bespoke-careers.vercel.app` (ссылки в письмах, возврат из Stripe) | |
| `CORS_ORIGINS` | `https://bespoke-careers.vercel.app,https://bespoke-careers-bc-3.vercel.app` | |
| `PUBLIC_API_URL` | `https://bespoke-api-production-6091256b.up.railway.app` (подписанные ссылки на файлы) | |

Посмотреть или поменять значения: панель Railway → проект `bespoke` → сервис `bespoke-api` → вкладка **Variables**, или в терминале `railway variables --service bespoke-api`. После изменения Railway сам перезапускает сервис.

На Vercel одна переменная: `NEXT_PUBLIC_API_URL` = адрес API. Она публичная по определению: браузер всё равно туда обращается.

Ни одного секрета нет в коде, в репозитории и в документации. Пример переменных без значений лежит в `backend/.env.example`.

## 9.4. Как развернуть с нуля (повторить деплой)

Нужны аккаунты GitHub, Railway, Vercel и CLI: `gh`, `railway`, `npx vercel`.

1. **GitHub:** `gh repo create <ник>/bespoke --public --source=. --push`.
2. **Railway:**
   - `railway init --name bespoke` — создать проект;
   - `railway add --database postgres` — добавить PostgreSQL;
   - `railway add --service bespoke-api` с переменными из таблицы 9.3 (`DATABASE_URL=${{Postgres.DATABASE_URL}}`, свои `JWT_SECRET` и `ADMIN_PASSWORD`);
   - в настройках сервиса: Source = репозиторий, Root Directory = `/backend`, Healthcheck Path = `/health`;
   - `railway domain --service bespoke-api` — получить публичный адрес API. Проверка: `curl https://<api>/health` → `{"ok": true, ...}`.
3. **Vercel:**
   - `npx vercel project create bespoke-careers`, затем `npx vercel project update bespoke-careers --root-directory frontend --framework nextjs`;
   - `npx vercel link --project bespoke-careers` в корне репозитория;
   - `npx vercel env add NEXT_PUBLIC_API_URL production` — адрес API;
   - `npx vercel project protection disable bespoke-careers --sso` — иначе сайт закрыт для посторонних;
   - `npx vercel deploy --prod`.
4. **Связать:** в Railway задать `FRONTEND_URL`, `CORS_ORIGINS` (адрес сайта) и `PUBLIC_API_URL` (адрес API).

## 9.5. Локальный запуск (Windows, macOS, Linux)

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

## 9.6. Почему такой хостинг

1. **Railway** для бэкенда и базы — по ТЗ сервер и база должны жить на Railway. Railway собирает Docker-образ прямо из репозитория, даёт управляемый PostgreSQL в том же проекте и не усыпляет сервис, поэтому сбор вакансий идёт без внешних «будильников».
2. **Vercel** для сайта — лучший хостинг для Next.js: сборка за минуту, CDN, бесплатный тариф.
3. Проблемы по ходу и как решили:
   - Vercel заблокировал сборку из-за уязвимости в Next.js 15.1.6 → обновили до 15.5.29 и React 19.3.1.
   - Сборка падала на загрузке Google Fonts → шрифты подключены локально через `@fontsource`.
   - Новый проект Vercel по умолчанию закрыт SSO-защитой команды → защиту отключили для публичного доступа.
   - Railway перестал поддерживать файл `railway.json` → настройки сборки и health check заданы прямо в сервисе (таблица в 9.2).
   - Строка подключения Railway начинается с `postgresql://`, а у некоторых хостингов с `postgres://` → `config.py` приводит оба варианта к формату SQLAlchemy.
