# מסמך העברה מלא – "הטיול הגדול"

מסמך זה נכתב כדי שחשבון חדש (או סוכן חדש, Claude Code וכדומה) יבין **מה נבנה, איך זה בנוי, מה נבדק, ומה עוד לא נעשה**, ויוכל להמשיך בדיוק מהנקודה שבה עצרנו. אפשר לתת אותו לסוכן חדש כהוראה ראשונה: "קרא את docs/HANDOFF.md ואת CLAUDE.md והמשך".

> **המשתמש אינו מפתח.** מדברים איתו בעברית, בצעדים פשוטים, פקודה אחת בכל פעם, ואומרים בדיוק איפה ללחוץ.

---

## 1. מה זה
אפליקציית ווב (PWA), בעברית, מימין לשמאל, מותאמת לטלפון, לצעירים ישראלים שאחרי הצבא ב"טיול הגדול" (מזרח אסיה, דרום אמריקה, מרכז אמריקה).

### פיצ'רים
- **21 מדינות** (`src/data/countries.ts`): ויזה לישראלים, עונה, תקציב יומי, מטבע, שקעים, חירום, חב"ד, מקומות חובה, טיפים.
- **מפה ציורית "שביל החומוס"**: d3-geo + world-atlas, עובדת אופליין, ~100 מקומות (אטרקציות, אוכל, לינה, מסיבות, פסטיבלים, נקודות מפגש, מוקדים ישראליים, אזהרות), קיבוץ סיכות, סינון לפי קטגוריה ועונה, הוספת מקומות אישיים. זום עד רמת עיר.
- **ביקורות בעין ישראלית**: כוכבים, טקסט, תמונה (נשארת במכשיר), מתי, עלות, תגיות.
- **מה חם עכשיו** (פסטיבלים ונקודות מפגש לפי עונה), **"אני כאן"** (צ'ק־אין ושיתוף קישור), **שאלות נפוצות** ו**על הפרויקט** (חזון, ניתוח שוק, SWOT).
- **הטיול שלי**: מסלול, ימים, הערכת תקציב.
- **יומן והוצאות**, **ממיר מטבע** (ExchangeRate-API עם שערים משוערים אופליין), **צ'קליסט**, **טיפים**, **מדריך שפות** עם הגייה והשמעה.
- **גיבוי ושחזור** לקובץ JSON.
- **Google Places (New)**: חיפוש, "קרוב אליי", השלמה אוטומטית, פרטים ותמונות מעל מקומות הקהילה.
- **חשבונות (Supabase)**: הרשמה, כניסה, איפוס סיסמה, סנכרון פרטי בין מכשירים, ביקורות משותפות, דיווח ואיסתור אוטומטי.
- **עדכון שבועי** של מקומות (GitHub Actions) שנפתח כ־Issue.

## 2. טכנולוגיה
React 19 + TypeScript + Vite 8, ראוטר האש (`src/router.ts`), `usePersistentState` (localStorage עם התראות שינוי), Service Worker (`public/sw.js`), d3-geo/d3-zoom/topojson, Vitest (154 בדיקות), Playwright לבדיקות דפדפן. Supabase (Auth + Postgres + RLS). Firebase Hosting + Cloud Function (אזור europe-west1).

## 3. פקודות
```
npm install
npm run dev              # שרת פיתוח; /api/places מוגש ע"י server/vitePlugin.ts (דורש GOOGLE_MAPS_API_KEY ב-.env.local)
npm test                 # vitest
npx tsc -b               # בדיקת טיפוסים
npm run build            # tsc -b && vite build -> dist/
npm run build:single     # קובץ HTML יחיד (vite.artifact.config.ts)
npm run build:functions  # אורז את פונקציית Firebase ל-functions/index.js (esbuild)
npm run weekly-places    # דוח שבועי (דורש GOOGLE_MAPS_API_KEY)
```
**לפני כל commit:** `npx tsc -b`, `npm test`, `npm run build`. ענף העבודה: `claude/travel-app-user-friendly-n8gmzm`. יש PR #1 פתוח.

## 4. מבנה הקוד
| נתיב | תפקיד |
|---|---|
| `src/pages/*`, `src/components/*` | מסכים ורכיבים (Home, Region, Country, Plan, Checklist, Tips, Phrases, Currency, Journal, More, Map, Hot, Faq, About, Account; WorldMap, PlaceSheet, PlacesPanel, BottomNav, PageHeader) |
| `src/styles.css` | הסגנון "עבה ומשחקי" – לשמור עליו |
| `src/data/*` | תוכן: countries, places, tips, checklist, about, types. נכתב מידע כללי, **לא אומת** מול מקורות רשמיים, וה־UI אומר זאת (ויזה, חירום, בטיחות) |
| `src/repositories/` | הפשטת שכבת הנתונים (מקומי כרגע) |
| `src/community.ts`, `src/storage.ts`, `src/budget.ts`, `src/journal.ts`, `src/currency.ts` | לוגיקה + בדיקות |
| `src/places/` | שכבת Google: `api.ts` (לקוח, מטמון בזיכרון בלבד), `mapping.ts` (מיפוי ל־`Place`), `categories.ts`, `search.ts`, `usePlaces.ts`, `hotspot.ts` |
| `server/places.ts` | פרוקסי חסר־פריימוורק ל־Google Places: המפתח רק בשרת, field masks קבועים, ולידציה, מטמון TTL, הגבלת קצב, בדיקת origin, session tokens, תמונה כ־JSON URL |
| מתאמים | `api/places/[action].ts` (Vercel), `netlify/functions/places.ts`, `functions/src/index.ts` (Firebase), `server/vitePlugin.ts` (dev/preview) |
| `src/cloud/*` | `CloudBackend` (ממשק), מימוש Supabase ומימוש בזיכרון, מנוע סנכרון `sync.ts`, `AuthContext.tsx`, `useCloudReviews.ts` |
| `supabase/migrations/0001_init.sql` | סכימה + RLS (profiles, user_data, reviews, reports, `delete_my_account`); `supabase/rls.test.ts` מריץ אותה על Postgres אמיתי (PGlite) |
| `scripts/` | `weekly-places.ts`, `weeklyLogic.ts`, `build-functions.mjs`, `deploy.ps1` |
| `.github/workflows/weekly-places.yml` | עבודה שבועית; מצב נשמר בענף `weekly-places-state` (מזהי מקום בלבד) |
| `docs/` | `FIREBASE_DEPLOY`, `SUPABASE_SETUP`, `GOOGLE_PLACES_SETUP`, `WEEKLY_PLACES`, `BROWSER_TASKS`, וזה |
| `.claude/skills/google-fonts/` | סקיל מ־sliday/google-fonts-skill (MIT) |

## 5. כללים מחייבים
1. **לעולם לא לעשות commit או להדפיס סודות.** `.env*` ב־gitignore (חוץ מ־`.env.example`). מפתח Supabase `anon` וה־URL ציבוריים בכוונה. **מפתח `service_role` – אסור לבקש, להדביק או להשתמש בו.** המשתמש מדביק סודות בעצמו בטרמינל או בדשבורד, לא בצ'אט.
2. **תוכן Google:** אסור לשמור שמות, דירוגים, שעות, תמונות או קואורדינטות של Google בריפו, ב־localStorage או במסד. מותר רק place IDs. תמיד להציג "מידע חיצוני מ־Google" ו־"Powered by Google".
3. דירוג Google ודירוג קהילה מוצגים **תמיד בנפרד**. מקום Google לא נקרא "מוקד ישראלי" בלי דיווחי קהילה.
4. כל הטקסטים בעברית ו־RTL.
5. **לשאול את המשתמש לפני** כל דבר שמשנה חיוב, מוחק מידע, יוצר או מחליף סוד, או קשה לביטול.

## 6. מצב נוכחי – מה נבדק ומה לא
### נבדק
- 154 בדיקות יחידה, בנייה, וריצות דפדפן אמיתיות בגודל טלפון.
- פרוקסי Google מול ה־API האמיתי (nearby, search, details, photo, autocomplete).
- דוח שבועי בריצה אמיתית.
- ה־SQL של Supabase על Postgres אמיתי (PGlite), כולל RLS ואיסתור אוטומטי אחרי 3 מדווחים.
- סנכרון וחשבונות מול backend בזיכרון.

### **לא נעשה / לא נבדק על שירותים אמיתיים**
1. **שום דבר לא פרוס.** היעד: Firebase Hosting + הפונקציה `places` (תוכנית Blaze כבר פעילה). ראו `docs/FIREBASE_DEPLOY.md`.
2. **פרויקט Supabase לא הוגדר:** להריץ את ה־SQL, להגדיר Site URL ו־Redirect URLs, לשים `VITE_SUPABASE_URL` ו־`VITE_SUPABASE_ANON_KEY` ב־`.env.local`. אחרי זה לבדוק **ידנית** אימייל אימות הרשמה ואימייל איפוס סיסמה.
3. **מפתח Google נחשף בצ'אט ולכן נחשב פרוץ.** ליצור חדש, מוגבל ל־Places API (New) בלבד, עם מכסות והתראת תקציב, למחוק או לבצע Regenerate לישן, ולהגדיר: `npx firebase-tools functions:secrets:set GOOGLE_MAPS_API_KEY` (המשתמש מדביק).
4. **עבודת GitHub השבועית:** צריכה סוד ריפו `GOOGLE_MAPS_API_KEY` והרשאות workflow "Read and write". טרם רצה ב־GitHub.
5. **מגבלות ידועות:** מחיקה במכשיר אחד יכולה להתבטל ממכשיר אחר (אין חותמות זמן לכל פריט); תמונות ביקורת נשארות במכשיר; אין כניסה עם Google; אין מסך מודרציה (ביקורות מוסתרות מנוהלות בדשבורד של Supabase).

## 7. איך להמשיך – שלבים
1. **סביבה:** התקן Node (LTS) ו־git; `git clone` של `tomer227/trips-app`; `git checkout claude/travel-app-user-friendly-n8gmzm`; `npm install`; `npm test` צריך להיות ירוק.
2. **מפתח Google חדש** (Google Cloud → APIs & Services → Credentials): הגבלה ל־Places API (New), מכסה יומית נמוכה (למשל 1,000), תקציב חודשי עם התראות 50/90/100%, מחיקת הישן. ראו `docs/GOOGLE_PLACES_SETUP.md` ו־`docs/BROWSER_TASKS.md` סעיף ב'.
3. **Supabase:** `docs/SUPABASE_SETUP.md` ו־`docs/BROWSER_TASKS.md` סעיף א'. להעתיק רק URL ו־anon.
4. **פריסה ל־Firebase:** בחלונות – `powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1` (login, בחירת פרויקט, סוד Google, ערכי Supabase, deploy). או ידנית:
   ```
   npx firebase-tools login
   npx firebase-tools use --add
   npx firebase-tools functions:secrets:set GOOGLE_MAPS_API_KEY
   npx firebase-tools deploy
   ```
   `ALLOWED_ORIGINS` = `https://<project-id>.web.app,https://<project-id>.firebaseapp.com`. הסקריפט `deploy.ps1` טרם נבדק על Windows אמיתי.
5. **אחרי הפריסה:** להגדיר ב־Supabase את אותה כתובת כ־Site URL ו־Redirect URL (עם `/` בסוף, ובנוסף `http://localhost:5173/`).
6. **בדיקת האתר החי:** הרשמה עם אימייל אמיתי ואימות; כניסה; הוספת מדינה ל"הטיול שלי", התנתקות והתחברות – הנתונים חוזרים; ביקורת משותפת ("פרסום לקהילה"); מפה → "קרוב אליי" / חיפוש / קטגוריה "קפה"; איפוס סיסמה. לדווח למשתמש בעברית מה עבד ומה לא, עם ציטוט השגיאות.
7. **GitHub Actions השבועי:** הגדרת הסוד וההרשאות, ואז הרצה ידנית אחת (`docs/WEEKLY_PLACES.md`).

## 8. החלטות ובאגים שנפתרו (כדי לא לחזור עליהם)
- רשימת ההשלמה האוטומטית הופיעה שוב אחרי בחירה → נוספו `skipNext/pick/dismiss`.
- זום המפה היה רדוד מדי לחיפוש ברמת עיר → `MAX_ZOOM 1200`, `FOCUS_ZOOM 250`, רדיוס קיבוץ 14.
- האיסתור האוטומטי של ביקורות בוטל ע"י טריגר → תוקן ב־SQL (מאפס `hidden` רק עבור anon/authenticated).
- קישור איפוס סיסמה **לא יכול להכיל hash** (Supabase מוסיף `?code=`) → כתובת ההפניה היא שורש האתר, והאפליקציה עוברת ל־`#/account` באירוע `PASSWORD_RECOVERY`.
- התנתקות מבצעת סנכרון אחרון, מנקה נתונים מסונכרנים ועושה reload ל־`#/account`.
- הדוח השבועי הציף 20 מתוך 40 דגלי שווא → קטגוריות "אזור" נבדקות רק לסגירה, "לא נמצא" רק כש־Google לא מחזיר כלום, והצעות מוגבלות ל־25 ומפוזרות לפי אזור.
- בכל בדיקה שנכשלה שינינו את הבדיקה רק כשהייתה שגויה; באגים אמיתיים תוקנו בקוד.

## 9. עבודה עם סוכן ודפדפן (לקח מהשיחה)
- סשן ענן (claude.ai/code) **לא יכול** לשלוט בכרום של המשתמש: הוא רץ בשרת. שליטה בכרום אפשרית רק ב־Claude Code שרץ **על המחשב** עם התוסף Claude in Chrome (`claude --chrome`).
- להעברת סשן ענן למחשב: `claude --teleport <session-id> --chrome` (אותו חשבון claude.ai, git נקי, הענף נדחף). כדי לכתוב לסשן המקומי מהאפליקציה: `/remote-control`.
- בחשבון חדש: `claude --chrome` בתיקיית הפרויקט קורא את `CLAUDE.md` אוטומטית. את משימות הדשבורד אפשר להדביק מ־`docs/BROWSER_TASKS.md`.
- בחלונות: להריץ מתיקיית הבית (`cd $HOME`), לא מ־`C:\WINDOWS\system32`. אחרי התקנת git/node לפתוח PowerShell חדש.

## 10. פרומפט התחלה לסוכן חדש
> קרא את `CLAUDE.md` ואת `docs/HANDOFF.md`. המשתמש אינו מפתח ומדברים איתו בעברית. המטרה: להעלות את האפליקציה לאוויר ב־Firebase, לחבר Supabase, לבדוק את האתר החי ולדווח מה עובד ומה לא. עבוד צעד אחר צעד, הראה למשתמש מה אתה עומד לעשות, ועצור ושאל לפני כל דבר שקשור לחיוב, מחיקה או סודות. אל תבקש ואל תשתמש במפתח `service_role`, ואל תדפיס מפתחות.
