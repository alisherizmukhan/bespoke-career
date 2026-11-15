# 5. Фронтенд: страницы и компоненты

Фронтенд — приложение Next.js 15 (App Router) в папке `frontend`. Каждая папка в `app/` становится адресом страницы: `app/pricing/page.tsx` открывается по `/pricing`. Все страницы — клиентские компоненты. Данные они берут из API через TanStack Query.

## 5.1. Все страницы (36)

### Публичные
| Адрес | Файл | Что на странице |
|---|---|---|
| `/` | `app/page.tsx` | Лендинг: тёмный блок с живой гистограммой зарплат, карточки продукта, функции, источники, блок для студентов, цены, призыв к действию |
| `/jobs`, `/jobs/[id]` | `app/jobs/…` | Публичный поиск вакансий и страница вакансии |
| `/pricing` | `app/pricing/page.tsx` | Тарифы, калькулятор окупаемости, сравнение, FAQ |
| `/login`, `/register` | | Вход и регистрация (`components/auth-forms.tsx`) |
| `/verify-email`, `/forgot-password`, `/reset-password` | | Подтверждение email, сброс пароля |
| `/privacy`, `/terms` | | Политика конфиденциальности и условия (`components/legal.tsx`) |

### Приложение пользователя (`/app`, нужен вход)
| Адрес | Что на странице |
|---|---|
| `/app` | Главная (dashboard) |
| `/app/onboarding` | 4 шага заполнения профиля |
| `/app/jobs`, `/app/jobs/[id]` | Вакансии с действиями: сохранить, в трекер, проверить совпадение |
| `/app/tracker` | Трекер откликов |
| `/app/resumes`, `/app/resumes/[id]` | Список резюме и редактор с вкладками Content, Generate, ATS check, Versions, Cover letter |
| `/app/salary` | Зарплаты (4 вкладки) |
| `/app/assistant` | ИИ-ассистент |
| `/app/profile` | Профиль |
| `/app/billing` | План и оплата: сводка заказа, отмена с удержанием, история платежей |
| `/app/settings` | Пароль, ИИ, экспорт данных, удаление аккаунта |

### Админ-панель (`/admin`, только роль admin)
| Адрес | Что на странице |
|---|---|
| `/admin` | Метрики |
| `/admin/crm`, `/admin/crm/[id]` | CRM: список клиентов и карточка клиента |
| `/admin/tasks` | Задачи |
| `/admin/users` | Пользователи |
| `/admin/content` | Тексты сайта |
| `/admin/jobs` | Модерация вакансий |
| `/admin/plans` | Тарифы и лимиты |
| `/admin/knowledge` | База знаний |
| `/admin/sources` | Источники вакансий |
| `/admin/ai` | Расход ИИ |
| `/admin/audit` | Журнал аудита |
| `/admin/exports` | Экспорт в Excel и CSV |

## 5.2. Ключевые компоненты

| Файл | За что отвечает |
|---|---|
| `components/ui.tsx` | Базовые элементы: `Button` (варианты primary, secondary, soft, ghost, danger), `Card`, `Badge`, `Field`, `Input`, `Select`, `Textarea`, `Modal`, `Tabs`, `EmptyState`, `ErrorState`, `InlineError`, `UpgradeNotice` (плашка при исчерпании лимита), `PageHeader`, `ScoreRing`, `Logo`, `RangeMarker` (метка «You» на шкале зарплат — фирменная деталь дизайна) |
| `components/shell.tsx` | Каркас приложения и админки. Проверяет вход: без входа отправляет на `/login`, не-админа уводит из `/admin`, незаполненный профиль — на онбординг |
| `components/public.tsx` | Шапка и подвал публичных страниц, плашка объявления из админки |
| `components/pricing.tsx` | Переключатель Monthly/Yearly, `PlanPrice` и `PlanCard`, `PricingGrid`, `CompareTable`, `PayoffCalculator`, `PricingFaq`, расчёты (`annualMath`, `perResume`), запоминание выбранного плана до регистрации |
| `components/admin-tools.tsx` | Кнопки экспорта Excel/CSV (скачивание с токеном), блоки показателей, цвета и названия этапов CRM |
| `components/jobs.tsx`, `job-detail.tsx` | Поиск с фильтрами и страница вакансии (общие для публичной части и приложения) |
| `components/resume-editor.tsx` | Редактор полей резюме |
| `components/profile-form.tsx` | Форма профиля |
| `components/icons.tsx` | Все иконки (Phosphor) подключаются здесь. Чтобы сменить набор иконок, достаточно поменять один файл |
| `lib/api.ts` | Единственная точка запросов к API: подставляет токен, разбирает ошибки, при истёкшей сессии отправляет на вход |
| `lib/auth.tsx` | Контекст авторизации: текущий пользователь, `signIn`, `signOut` |
| `lib/content.ts` | Хук `useContent()` загружает тексты из админки. Если запрос не удался, остаются тексты по умолчанию, и страница не ломается |
| `lib/format.ts` | Деньги и даты в американском формате (`en-US`) |

## 5.3. Как фронт работает с API

```ts
const q = useQuery({ queryKey: ["plans"], queryFn: () => api("/billing/plans") });   // чтение
const m = useMutation({ mutationFn: (v) => api("/billing/checkout", { body: v }) });  // действие
```

- **Токен** хранится в `localStorage` (ключ `bespoke_token`) и добавляется в заголовок `Authorization`.
- **Ошибки** приходят в едином формате `{"detail": {"code", "message"}}` и показываются компонентом `InlineError`. Ошибка 402 (лимит) превращается в плашку апгрейда с ценой Pro.
- **Кэш**: TanStack Query кэширует ответы (например, тарифы) и обновляет их после действий через `invalidateQueries`.

## 5.4. Настройки сборки (`next.config.mjs`)

- `output: "standalone"` — компактная сборка.
- `poweredByHeader: false` — не раскрываем технологию в заголовках.
- `productionBrowserSourceMaps: false` — исходный код не публикуется. В браузере виден только минифицированный бандл.
- Заголовки безопасности на всех страницах: Content Security Policy, запрет встраивания во фрейм, HSTS и другие (раздел 6).
