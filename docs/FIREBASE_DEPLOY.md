# העלאה לאוויר ב־Firebase

Firebase Hosting מגיש את האפליקציה, ו־Cloud Function אחת (`places`, באזור `europe-west1`) משמשת כשרת הביניים ל־Google. כך החיפוש עובד למשתמשים והמפתח נשאר בשרת בלבד. הכתובת תהיה `https://<project-id>.web.app`.

> נבדק: הפונקציה נבנית, נטענת עם `firebase-functions`, ועונה על בקשה אמיתית ל־Google. **לא נבדק:** הפריסה עצמה, כי היא דורשת התחברות לחשבון Firebase שלכם.

## מה צריך (חד־פעמי)
1. **פרויקט Firebase** ב־[console.firebase.google.com](https://console.firebase.google.com) (אפשר לבחור את פרויקט ה־Google Cloud שכבר יצרתם).
2. **תוכנית Blaze** (תשלום לפי שימוש, עם מכסה חינמית). Cloud Functions ושימוש בסודות דורשים אותה. הוסיפו התראת תקציב ב־Billing.
3. **מפתח Places חדש.** המפתח הישן נחשף בצ'אט, לכן צרו חדש (או Regenerate) והגבילו אותו ל־Places API (New).

## פקודות (במחשב שלכם, בתיקיית הפרויקט)
```bash
npm install
npx firebase-tools login
npx firebase-tools use --add                           # בחירת הפרויקט
npx firebase-tools functions:secrets:set GOOGLE_MAPS_API_KEY   # מדביקים את המפתח בהנחיה
npx firebase-tools deploy
```
בפריסה הראשונה תישאלו על `ALLOWED_ORIGINS`. הזינו את כתובת האתר, למשל `https://<project-id>.web.app,https://<project-id>.firebaseapp.com`.

הפריסה בונה את האתר (`npm run build`) ואת הפונקציה (`npm run build:functions`) לבד, ומדפיסה את הכתובת.

## בדיקה אחרי הפריסה
פתחו את הכתובת, היכנסו ל"מפה", לחצו "קרוב אליי" או התקרבו לעיר ובחרו "קפה". אם מופיעה ההודעה "החיפוש ב־Google לא זמין", בדקו:
- שהסוד הוגדר: `npx firebase-tools functions:secrets:access GOOGLE_MAPS_API_KEY`
- שיומני הפונקציה נקיים משגיאות: `npx firebase-tools functions:log`

## ומה עם Supabase?
לא נדרש עכשיו. ל־Supabase אין אירוח לאתרים סטטיים. הוא מתאים לשלב הבא (חשבונות משתמשים, ביקורות משותפות, "אני כאן" בין חברים). הקוד כבר מפריד בין הממשק לאחסון (`src/repositories`), כדי שיהיה קל לחבר אותו אחר כך.

## עלויות ובטיחות
- `maxInstances: 3` מגביל את מספר המופעים של הפונקציה, ולכן גם את העלות במקרה של הצפה.
- בקשות מוגבלות ל־90 לדקה לכל כתובת IP, ויש מטמון של 30–60 דקות בשרת.
- מכסות והתראות ב־Google Cloud הן ההגנה האמיתית על החיוב. הגדירו אותן.
