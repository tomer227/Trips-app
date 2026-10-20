# להעלות את האפליקציה לאוויר: 4 שלבים

כל מה שלא דורש את החשבונות שלך כבר מוכן ונבדק. נשארו רק דברים שרק אתה יכול לעשות, כי הם דורשים כניסה לחשבונות שלך.
בסוף תקבל קישור בצורה `https://<שם-הפרויקט>.web.app`.

---

## שלב 1: מפתח Google חדש (בערך 5 דקות)
המפתח הישן נחשף, אז מחליפים אותו.

1. פתח את [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials) (בחר למעלה את הפרויקט של האפליקציה).
2. לחץ **+ Create credentials** ואז **API key**. יופיע מפתח חדש. **אל תשלח אותו לאף אחד, גם לא אליי.** תשאיר את החלון פתוח.
3. לחץ על שם המפתח החדש. תחת **API restrictions** בחר **Restrict key**, סמן רק **Places API (New)** ולחץ **Save**.

ומומלץ באותו מקום, כדי להקשות על פריצה לחשבונות:
- **Authentication → Sign In / Providers → Email:** ודא ש־**Confirm email** מסומן.
- **Authentication → Policies** (או **Password settings**): **Minimum password length** = 8, וסמן **Prevent use of leaked passwords** אם האפשרות קיימת בחשבון שלך.
לחץ **Save**.
4. באותו עמוד, ליד המפתח **הישן**, לחץ על שלוש הנקודות ואז **Delete**.
5. מומלץ: [Billing → Budgets & alerts](https://console.cloud.google.com/billing/budgets) → **Create budget**, למשל 20$ בחודש, עם התראה למייל.

## שלב 2: Supabase, בשביל חשבונות משתמשים (בערך 5 דקות, אפשר לדלג)
בלי השלב הזה האתר עובד, רק בלי הרשמה, סנכרון, ביקורות משותפות ו"מי עוד שם".

1. היכנס ל־[supabase.com/dashboard](https://supabase.com/dashboard) ולחץ **New project**. תן שם, בחר סיסמה (שמור אותה אצלך) ואזור **Frankfurt** (Central EU).
2. בתפריט השמאלי: **SQL Editor** ואז **New query**.
3. פתח את הקובץ [`supabase/setup_all.sql`](https://github.com/tomer227/Trips-app/blob/claude/travel-app-user-friendly-n8gmzm/supabase/setup_all.sql), לחץ על כפתור ההעתקה (Copy raw file), הדבק בחלון ולחץ **Run**. צריך להופיע **Success**.
4. **Project Settings → API Keys**: תצטרך שני דברים בשלב 3: **Project URL**, והמפתח **anon public** (או **Publishable**).
   - **לעולם לא** את `service_role` או `secret`. הסקריפט גם יעצור אותך אם תדביק בטעות אחד כזה.

## שלב 3: פקודה אחת במחשב (Windows, בערך 10 דקות)
1. אם אין לך Node.js: הורד והתקן את גרסת **LTS** מ־[nodejs.org](https://nodejs.org) (Next, Next, Finish).
2. הורד את הקוד: [קובץ ZIP](https://github.com/tomer227/Trips-app/archive/refs/heads/claude/travel-app-user-friendly-n8gmzm.zip). חלץ אותו (קליק ימני → Extract All).
3. פתח את התיקייה שחולצה, ובתוכה את התיקייה `Trips-app-claude-...` (זו שיש בה `package.json`). לחץ על שורת הכתובת למעלה, כתוב `powershell` ולחץ Enter. ייפתח חלון כחול/שחור.
4. הדבק את השורה הזו ולחץ Enter:
   ```
   powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1
   ```
5. הסקריפט ישאל אותך כמה שאלות. מה לענות:
   | הוא שואל | אתה עונה |
   | --- | --- |
   | כניסה ל־Firebase (נפתח דפדפן) | נכנס עם חשבון Google שלך ומאשר |
   | בחירת פרויקט | בחצים בוחר את הפרויקט, Enter. כשהוא שואל alias כותב `default` |
   | Set / replace the GOOGLE_MAPS_API_KEY | `y`, ואז מדביק את המפתח מ־שלב 1 (הוא לא יוצג, זה תקין) ו־Enter |
   | Enable Secret Manager / APIs | `Y` |
   | VITE_SUPABASE_URL | ה־Project URL משלב 2 (או סתם Enter אם דילגת) |
   | VITE_SUPABASE_ANON_KEY | המפתח anon / publishable משלב 2 |
   | כמה ימים לשמור container images | Enter |
6. בסוף יופיע בירוק: **Your app: https://....web.app**. זה הקישור שלך.

## שלב 4: לחבר את הקישור ל־Supabase (דקה, רק אם עשית את שלב 2)
**Authentication → URL Configuration** ב־Supabase:
- **Site URL:** הקישור משלב 3.
- **Redirect URLs → Add URL:** אותו קישור עם `/` בסוף.
לחץ **Save**.

## שלב 5: להפוך את עצמך למנהל (דקה, רשות)
כך תוכל לטפל בביקורות ובמודעות שדווחו, ישר מהאפליקציה.
1. היכנס לאפליקציה והירשם עם האימייל שלך (אם עוד לא נרשמת).
2. ב־Supabase: **SQL Editor** ואז **New query**. הדבק את השורה הזו, **שים את האימייל שלך במקום** `you@example.com`, ולחץ **Run**:
   ```
   insert into public.moderators (user_id) select id from auth.users where email = 'you@example.com';
   ```
3. באפליקציה, בעמוד **החשבון שלי**, יופיע כפתור **🛡️ ניהול דיווחים**.

---

## אם משהו נתקע
העתק את כל מה שכתוב באדום בחלון ושלח לי. **בלי מפתחות.**
כדי להעלות שוב אחרי שינוי: אותה פקודה משלב 3. בפעם השנייה עונים `n` על המפתח.
