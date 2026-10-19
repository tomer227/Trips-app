# חיבור Google Places API (New)

האפליקציה מציגה מקומות אמיתיים מ־Google (חיפוש, "באזור שלי", השלמה אוטומטית, פרטי מקום ותמונות) **מעל** המקומות של הקהילה והצוות. אם Google לא מוגדר, האפליקציה ממשיכה לעבוד כרגיל עם המקומות הקיימים, ובמקום תוצאות Google מוצגת הודעה שהחיפוש לא זמין.

> חשוב: מפתח ה־API **לעולם לא** נכנס לקוד, ל־GitHub או לחבילת הלקוח. הוא נשמר כמשתנה סביבה בשרת בלבד.

## איך זה בנוי

```
React PWA  ──►  /api/places/{nearby,search,details,autocomplete,photo}
                     │   (Serverless Function – server/places.ts)
                     ▼
              Google Places API (New)
```

- `server/places.ts` – הליבה: ולידציה, Field Mask קבוע לכל בקשה (אף פעם לא `*`), מיפוי קטגוריות ל־`includedTypes` בצד השרת, מטמון בזיכרון, הגבלת קצב לפי IP, ובדיקת מקור (Origin) אופציונלית.
- `api/places/[action].ts` – מתאם ל־Vercel. `netlify/functions/places.ts` – מתאם ל־Netlify.
- `server/vitePlugin.ts` – מגיש את אותו `/api/places/*` בזמן `npm run dev` / `npm run preview`.
- בצד הלקוח: `src/places/` (מודל, מיפוי, לקוח API עם מטמון בזיכרון, סינון).

## 1. Google Cloud – הגדרה חד־פעמית

1. היכנסו ל־[Google Cloud Console](https://console.cloud.google.com) וצרו פרויקט (למשל `big-trip-app`).
2. חברו **חשבון חיוב** לפרויקט (Billing). Google Maps Platform דורש חיוב פעיל גם כדי להשתמש במכסה החינמית.
3. **APIs & Services → Library** → הפעילו **Places API (New)**. (לא "Places API" הישן – Legacy.) אין צורך בשום API נוסף.
4. **APIs & Services → Credentials → Create credentials → API key**. תנו למפתח שם ברור, למשל `big-trip-places-server`.
5. הגבלת המפתח (**Edit API key**):
   - **API restrictions → Restrict key → Places API (New)** בלבד.
   - **Application restrictions:** מפתח שרת על Vercel/Netlify רץ מכתובות IP משתנות, ולכן הגבלת IP לא מעשית שם. במקומה: הגבלת ה־API למעלה, מכסות (סעיף 2), ו־`ALLOWED_ORIGINS` (סעיף 3). אם תארחו על שרת עם IP קבוע, הוסיפו הגבלת IP.
6. **אל תשתמשו במפתח הזה בדפדפן.** אם בעתיד תרצו גם Maps JavaScript API בצד הלקוח, צרו לו מפתח נפרד עם הגבלת HTTP referrer.

## 2. מכסות והתראות (חשוב מאוד לעלויות)

- **APIs & Services → Places API (New) → Quotas & System Limits**: הגדירו תקרה ליום ולדקה (Requests per day / per minute) כדי שבקשות זדוניות או באג לא יריצו חשבון.
- **Billing → Budgets & alerts**: צרו תקציב חודשי עם התראות ב־50%, 90% ו־100%.
- Places API (New) מחויב לפי הקבוצה הגבוהה ביותר של שדות ב־Field Mask. הדירוג, רמת המחיר ושעות הפתיחה הם שדות ברמת חיוב גבוהה יותר משם ומיקום. הבקשות כאן כבר מבקשות רק את הנדרש, ותמונות נטענות רק בפתיחת מקום. **בדקו את הרמות והמחירים המדויקים ב־[Places API usage and billing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing)** – הם משתנים.

## 3. משתני סביבה

| משתנה | חובה | תיאור |
| --- | --- | --- |
| `GOOGLE_MAPS_API_KEY` | כן | מפתח השרת. **בלי קידומת `VITE_`** כדי שלא ייכנס לחבילת הלקוח. |
| `ALLOWED_ORIGINS` | מומלץ | רשימה מופרדת בפסיקים של כתובות שמותר להן לקרוא ל־`/api/places`, למשל `https://big-trip.vercel.app`. ריק = ללא הגבלה. |
| `VITE_PLACES_API_BASE` | לא | כתובת בסיס אחרת ל־API (למשל אם האתר מתארח בנפרד מהפונקציות). ברירת מחדל: אותו דומיין. |

הקובץ `.env.example` מראה את הפורמט. **אל תעלו `.env.local` ל־Git** (הוא ב־`.gitignore`).

## 4. הרצה מקומית

```bash
cp .env.example .env.local
# ערכו את .env.local והוסיפו: GOOGLE_MAPS_API_KEY=...
npm install
npm run dev
```

פתחו את המפה, התקרבו לעיר, בחרו קטגוריה (למשל ☕ קפה) ולחצו "חפש באזור הזה". בלי מפתח תראו "החיפוש ב־Google לא זמין" – זה תקין.

## 5. פריסה

### Vercel (מומלץ)
1. ייבאו את המאגר ב־Vercel (Framework preset: Vite – מתגלה אוטומטית).
2. **Settings → Environment Variables**: הוסיפו `GOOGLE_MAPS_API_KEY` (ו־`ALLOWED_ORIGINS`) לסביבת Production (ול־Preview אם צריך).
3. Deploy. התיקייה `api/` הופכת אוטומטית ל־Serverless Functions.

### Netlify
1. ייבאו את המאגר. הקובץ `netlify.toml` כבר מגדיר `npm run build` ותיקיית `dist`.
2. **Site configuration → Environment variables**: הוסיפו `GOOGLE_MAPS_API_KEY` (ו־`ALLOWED_ORIGINS`).
3. Deploy. הפונקציה `netlify/functions/places.ts` מוגשת ב־`/api/places/*`.

> המתאמים ל־Vercel ו־Netlify נכתבו לפי התיעוד אבל **לא נבדקו על הפלטפורמות עצמן** (בסביבת הפיתוח אין גישה אליהן ואל Google). הליבה עצמה נבדקת בבדיקות אוטומטיות עם `fetch` מדומה. אחרי הפריסה הראשונה בדקו ידנית שחיפוש מחזיר תוצאות.

## 6. מה מותר לשמור מ־Google

תנאי השימוש של Google Maps Platform מגבילים שמירה ארוכת טווח של תוכן Places. לכן:
- **מטמון בזיכרון בלבד** (לקוח: עד 10–30 דקות; שרת: עד 30–60 דקות). שום דבר מתוכן Google לא נכתב ל־`localStorage`.
- כשמשתמש שומר מקום ("רוצה להגיע") נשמר **רק ה־Place ID**. בפתיחת הרשימה הפרטים נטענים מחדש מ־Google.
- ביקורות ומידע קהילתי נשמרים בנפרד ומסומנים אחרת ("🇮🇱 קהילה" מול "Google").
- כל מקום מ־Google מוצג עם התווית "מידע חיצוני מ־Google" ועם "Powered by Google"; תמונות מוצגות עם שם המצלם.

**בדקו את התנאים העדכניים** לפני שמשנים את מדיניות השמירה: [Google Maps Platform Terms](https://cloud.google.com/maps-platform/terms), [Places API policies](https://developers.google.com/maps/documentation/places/web-service/policies).

## 7. מה נשאר לפעולה ידנית שלכם

- [ ] ליצור פרויקט Google Cloud, לחבר חיוב, להפעיל Places API (New).
- [ ] ליצור מפתח שרת ולהגביל אותו ל־Places API (New).
- [ ] להגדיר מכסות והתראות תקציב.
- [ ] להגדיר `GOOGLE_MAPS_API_KEY` (ו־`ALLOWED_ORIGINS`) ב־Vercel/Netlify, ולפרוס.
- [ ] לוודא בפועל שחיפוש מחזיר תוצאות ושהעלות תואמת לציפיות (מומלץ להתחיל במכסה נמוכה).
- [ ] לעבור על תנאי Google (סעיף 6) ולהחליט על מדיניות שמירה סופית.

## הערות
- ברירת המחדל לשפת התוצאות היא עברית (`he`).
- האפליקציה לא שולחת לשרת את המיקום שלכם אלא רק כשאתם לוחצים "קרוב אליי" או "חפש באזור הזה"; אין מעקב.
- ה־Place ID של Google יכול להשתנות עם הזמן. אם מקום שמור לא נטען, האפליקציה מציגה "טוען מקום שמור…" ולא מוחקת אותו.
