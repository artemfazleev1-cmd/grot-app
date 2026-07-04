# 📱 GROT в App Store и Google Play (нативная обёртка)

Приложение — веб (React). В сторы оно попадает через **Capacitor** — тонкую нативную
обёртку. Код НЕ переписывается. Обёртка загружает собранный фронтенд и общается с
бэкендом в облаке.

> ⚠️ Обязательное условие: **бэкенд должен быть размещён** (см. `DEPLOY.md` → Render).
> Нативное приложение обращается к серверу по адресу из `VITE_API_BASE`.

---

## 0. Что установить заранее (на этом Mac пока НЕ стоит)
- **Xcode** — Mac App Store (для iOS). ~7–15 ГБ.
- **CocoaPods** — `sudo gem install cocoapods` (для iOS).
- **Android Studio** + **JDK 17** — developer.android.com (для Android).
- Аккаунты: **Apple Developer** ($99/год), **Google Play Console** ($25 разово).

---

## 1. Установка Capacitor (в папке frontend)
```bash
cd grot-app/frontend
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
# сборка веба с адресом облачного сервера:
VITE_API_BASE="https://ВАШ-СЕРВЕР.onrender.com" npm run build
```

## 2. Добавить платформы
```bash
npx cap add ios
npx cap add android
npx cap sync
```

## 3. Иконки и сплэш
```bash
npm install -D @capacitor/assets
# положить квадратную иконку 1024×1024 в frontend/resources/icon.png
npx capacitor-assets generate
```
(Можно взять `public/logo.png` как основу — увеличить до 1024×1024.)

## 4. Android → Google Play
```bash
npx cap open android         # откроется Android Studio
```
В Android Studio: **Build → Generate Signed Bundle (.aab)** → загрузить в
**Google Play Console → Create app → Production**. Заполнить: иконка, скриншоты,
описание, политика конфиденциальности, возрастной рейтинг. Ревью ~1–3 дня.

## 5. iOS → App Store
```bash
npx cap open ios             # откроется Xcode
```
В Xcode: выбрать команду разработчика (Apple Developer), **Product → Archive** →
**Distribute App → App Store Connect**. В **App Store Connect** заполнить листинг,
скриншоты, приватность. Ревью ~1–7 дней.

---

## Важное про обновления
- **Контент** (меню, цены, акции) — меняется на сервере, в сторе-приложении обновляется
  мгновенно, без ревью.
- **Код/дизайн** — нужна новая сборка и повторная отправка в стор (ревью).

## Требования сторов (не пропустить)
- Политика конфиденциальности (URL) — обязательна для обоих.
- Скриншоты под размеры экранов.
- Apple: описание сбора данных (App Privacy). Тонкие «webview-обёртки» без ценности
  Apple отклоняет — у нас полноценный продукт, проходит.
