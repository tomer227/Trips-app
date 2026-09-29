# משימות בדפדפן (לכל סוכן שרץ בכרום של המשתמש)

מסמך זה נכתב כדי שסוכן שיש לו גישה לדפדפן (התוסף Claude in Chrome, או Claude Code עם `--chrome`) יבצע את שלבי הדשבורד, בלי לנחש.

## כללי בטיחות (חובה)
- עצור ושאל את המשתמש לפני כל פעולה שמשנה **חיוב**, **מוחקת** משהו, או **יוצרת/מחליפה סוד**.
- **אל תבקש, אל תקרא ואל תעתיק** את מפתח `service_role` של Supabase, ולעולם לא תדביק אותו בשום מקום.
- מפתחות שסודיים (מפתח Google) **המשתמש** מדביק בעצמו בטרמינל. אל תדפיס אותם בצ'אט.
- אם יש דף כניסה או CAPTCHA, עצור וחכה למשתמש.

## א. Supabase
1. פתח את הפרויקט. **SQL Editor → New query.**
2. הדבק את כל התוכן של `supabase/migrations/0001_init.sql` (בקובץ בפרויקט) ולחץ **Run**. המטרה: הודעת הצלחה, בלי שגיאה אדומה. אם יש שגיאה, עצור והראה אותה למשתמש.
3. **Authentication → URL Configuration:**
   - Site URL: כתובת האתר אחרי הפריסה (`https://<project-id>.web.app`). אם עוד אין, בצע את סעיף ג' קודם, או חזור אליו אחר כך.
   - Redirect URLs: אותה כתובת עם `/` בסוף, וגם `http://localhost:5173/`.
4. **Authentication → Providers → Email:** ודא שמופעל, ו־"Confirm email" מופעל.
5. **Project Settings → API:** קרא רק את **Project URL** ואת **anon public**, והצג למשתמש כדי שיעתיק ל־`.env.local`:
   ```
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   ```
   אל תיגע ב־`service_role`.

## ב. Google Cloud (מפתח Places חדש)
1. **APIs & Services → Credentials → Create credentials → API key.** תן שם `big-trip-places-server`.
2. **Restrict key → API restrictions → Restrict key → Places API (New)** בלבד. שמור.
3. **הצג את המפתח למשתמש רק במסך, לא בצ'אט.** המשתמש מעתיק אותו בעצמו.
4. **APIs & Services → Places API (New) → Quotas:** הגדר תקרה יומית ודקתית נמוכה (להתחלה, למשל 1,000 בקשות ליום).
5. **Billing → Budgets & alerts:** צור תקציב חודשי עם התראות ב־50%, 90%, 100%. שאל את המשתמש מה הסכום.
6. **מחק (או עשה Regenerate)** למפתח הישן שנחשף. שאל את המשתמש לפני המחיקה, ובדוק בתמונה איזה מפתח זה.

## ג. Firebase (חלק מהטרמינל, לא מהדפדפן)
את זה אי אפשר מהדפדפן. יש להריץ בטרמינל, בתיקיית הפרויקט:
```
npm install
npx firebase-tools login
npx firebase-tools use --add
npx firebase-tools functions:secrets:set GOOGLE_MAPS_API_KEY
npx firebase-tools deploy
```
ההסבר המלא: `docs/FIREBASE_DEPLOY.md`. אחרי שהמשתמש מעתיק ל־`.env.local` את `VITE_SUPABASE_URL` ו־`VITE_SUPABASE_ANON_KEY`, בונים מחדש ופורסים.

## ד. בדיקה אחרי הפריסה
פתח את `https://<project-id>.web.app` ובדוק:
1. **החשבון:** עוד → "החשבון שלי" → הרשמה עם אימייל אמיתי; ודא שהגיע אימייל אימות ושהקישור בו מחזיר לאפליקציה מחוברת.
2. **סנכרון:** הוסף מדינה ל"הטיול שלי", התנתק והתחבר: הנתונים חוזרים.
3. **ביקורת משותפת:** מפה → קסול → "כתבו חוויה ישראלית" ← "פרסום לקהילה"; ודא שהיא מופיעה עם שם התצוגה.
4. **Google:** מפה → "קרוב אליי" או התקרבות לעיר → קטגוריה "קפה" → מופיעות תוצאות.
5. דווח למשתמש מה עבד ומה לא, עם ציטוט ההודעה בשגיאות.

## פרומפט להדבקה בתוסף Claude in Chrome (חלונית הצד)
> אני מפעיל אפליקציית טיולים. עקוב אחרי המשימות בקובץ docs/BROWSER_TASKS.md (סעיפים א' וב' בלבד): הרץ ב-Supabase את ה-SQL, הגדר את ה-URL, וצור מפתח Google מוגבל ל-Places API (New) עם מכסות והתראת תקציב. עצור ושאל אותי לפני כל פעולה שמשנה חיוב, מוחקת או יוצרת סוד. אל תיגע במפתח service_role, ואל תציג לי מפתחות בצ'אט.
