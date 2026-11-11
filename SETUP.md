# راه‌اندازی کو

سه بخش دارد و هر سه اختیاری‌اند؛ برنامه بدون هیچ‌کدام هم آفلاین کار می‌کند:

1. [انتشار روی GitHub Pages](#۱-انتشار) — لازم برای استفادهٔ واقعی
2. [کلید Gemini و پل ورسل](#۲-هوش-مصنوعی) — برای تشخیص وسیله از عکس
3. [ورکر کلودفلر و OAuth گوگل](#۳-همگامسازی-گوگل-درایو) — برای بکاپ و همگام‌سازی

---

## ۱. انتشار

مخزن `koo-app.github.io` را در GitHub Pages منتشر کن (Settings → Pages → Deploy from branch: `main` / root).
آدرس: `https://koo-app.github.io`

فایل‌ها استاتیک‌اند؛ هیچ build لازم نیست.

---

## ۲. هوش مصنوعی

### الف) کلید کاربر

کاربر خودش از [aistudio.google.com/apikey](https://aistudio.google.com/apikey) کلید رایگان می‌سازد و در تنظیمات برنامه می‌گذارد.
کلید در `localStorage` گوشی می‌ماند و مستقیم برای گوگل یا پل ورسل فرستاده می‌شود.
راهنمای کاربر: `help-gemini.html`.

> در ایران، سرویس Gemini به دلیل محدودیت منطقه‌ای گوگل بدون فیلترشکن جواب نمی‌دهد. ورود گوگل و Drive این محدودیت را ندارند.

### ب) پل ورسل (اختیاری ولی توصیه‌شده)

پل، درخواست را از سرور ورسل به گوگل می‌فرستد تا کاربر بدون فیلترشکن هم بتواند عکس را تشخیص دهد.

1. یک مخزن جدا بساز، مثلاً `koo-api`.
2. فایل [`tools/api-gemini.js`](tools/api-gemini.js) را در آن مخزن به مسیر `api/gemini.js` کپی کن.
3. در بالای فایل، `ALLOWED_ORIGIN` را با دامنهٔ خودت هم‌خوان کن (پیش‌فرض `https://koo-app.github.io`).
4. در Vercel ایمپورت کن و دیپلوی بزن. آدرس نهایی: `https://<project>.vercel.app/api/gemini`.
5. اگر آدرس فرق داشت، در `js/scan.js` مقدار `GEMINI_PROXY` را عوض کن.

پل هیچ کلید، عکس یا متنی را ذخیره یا لاگ نمی‌کند؛ فقط عبوردهنده است. سقف بدنه ۴.۵ مگابایت (محدودیت Vercel) و تایم‌اوت ۲۵ ثانیه دارد.

---

## ۳. همگام‌سازی گوگل درایو

جریان کار:

```
برنامه ──(۱) ورود گوگل──▶ OAuth Client
   ▲                          │
   └──(۲) کد + state ◀── /callback ورکر
                              │
   ┌──────────────────────────┘
   ▼
برنامه توکن کوتاه‌عمر می‌گیرد + refresh token «مهروموم‌شده» را روی گوشی نگه می‌دارد
   │
   └─(۳) هر بار لازم شد ──▶ POST /refresh ورکر ──▶ access_token تازه
```

### الف) OAuth Client در Google Cloud

1. [console.cloud.google.com](https://console.cloud.google.com) → یک پروژه بساز.
2. **APIs & Services → Library** → «Google Drive API» را Enable کن.
3. **OAuth consent screen**: نوع External، نام «کو»، scope `.../auth/drive.file` را اضافه کن. در حالت Testing، ایمیل خودت را Test user بگذار.
4. **Credentials → Create credentials → OAuth client ID → Web application**:
   - Authorized JavaScript origins: `https://koo-app.github.io`
   - Authorized redirect URIs: `https://<worker>.workers.dev/callback`
5. `Client ID` و `Client Secret` را کپی کن.

### ب) ورکر کلودفلر

1. Workers & Pages → Create → Worker، نام `koo-sync`.
2. محتوای [`worker/koo-sync.js`](worker/koo-sync.js) را جای کد پیش‌فرض بگذار و Deploy کن.
3. در **Settings → Variables**:
   - Secret `GOOGLE_CLIENT_ID`
   - Secret `GOOGLE_CLIENT_SECRET`
   - Secret `SEAL_KEY` (هر رشتهٔ تصادفی ≥۱۶ کاراکتر؛ این کلید رمزنگاری refresh token است)
   - Variable `ALLOWED_APP` = `https://koo-app.github.io`
4. آدرس worker را در `js/sync.js` بگذار: `SYNC_WORKER`.

مسیرها: `GET /health`، `GET /start`، `GET /callback`، `POST /refresh`، `POST /revoke`.

نکته‌های امنیتی همان الگوی تراز:

- refresh token با AES-GCM (کلید مشتق‌شده از `SEAL_KEY` با SHA-256) مهر و موم می‌شود و **فقط روی گوشی** ذخیره می‌شود؛ ورکر آن را نگه نمی‌دارد.
- `state` هم مهر و موم شده و ۱۵ دقیقه اعتبار دارد؛ `n` (nonce) جلوی CSRF را می‌گیرد.
- scope فقط `drive.file` است، یعنی برنامه فقط به فایلی که خودش ساخته دسترسی دارد.
- توکن‌ها در URL fragment برمی‌گردند، نه query (در لاگ سرورها نمی‌نشیند).

### ج) برنامه

در `js/sync.js`:

```js
export const GOOGLE_CLIENT_ID = '....apps.googleusercontent.com';
const SYNC_WORKER = 'https://koo-sync.<account>.workers.dev';
```

### د) پل ورسل برای همگام‌سازی (اختیاری)

اگر worker در دسترس نبود، `SYNC_ROUTES` در `js/sync.js` مسیر دوم را امتحان می‌کند:
`https://koo-api.vercel.app` با مسیرهای `/ping`، `/auth/start`، `/token/refresh`، `/token/revoke`.
این مسیرها باید همان قرارداد ورکر را پیاده کنند (همان بدنه‌های JSON و همان `sealed`).
اگر این پل را نمی‌سازی، `SYNC_ROUTES` را به فقط `cf` کوتاه کن.

---

## داده‌ها

`localStorage` کلید `koo_app_v1`:

```json
{
  "version": 1,
  "bookId": "id_...",
  "updatedAt": 1730000000000,
  "rev": 12,
  "spaces": [
    { "id": "id_...", "name": "آشپزخانه", "icon": "🍳", "color": "#f97316",
      "places": [{ "id": "id_...", "name": "کابینت بالا" }] }
  ],
  "items": [
    { "id": "id_...", "name": "کابل تایپ‌سی", "category": "cable",
      "spaceId": "id_...", "placeId": "id_...", "note": "", "photo": "data:image/jpeg;base64,...",
      "createdAt": 1730000000000, "updatedAt": 1730000000000 }
  ]
}
```

- **مرج:** اول `bookId`؛ اگر یکی بود، فضاها و وسایل با `id` مرج می‌شوند و `updatedAt` جدیدتر برنده است.
- **اثر انگشت:** برای تشخیص «تغییری هست یا نه»؛ به `updatedAt`/`rev` و ترتیب لیست‌ها حساس نیست.
- **درایو:** فایل `koo-data.json`. اگر پیدا نشد ساخته می‌شود؛ اگر محلی داده باشد و ابری خالی، اول push می‌شود.
- **بکاپ:** «بکاپ آرشیو» یک فایل `koo-backup-YYYY-MM-DD.json` در درایو می‌سازد.
- **فاز ۲:** عکس‌ها به‌جای data URI، فایل جدا در پوشهٔ `koo/` و JSON فقط ارجاع نگه می‌دارد (برای وقتی حجم از حد localStorage گذشت).
