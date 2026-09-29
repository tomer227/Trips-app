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

## 10. הנקודה המדויקת שבה עצרנו
- **הקוד גמור ונבדק מקומית. אין בו משימת פיתוח פתוחה.** מה שנשאר הוא רק פעולות מול שירותים חיצוניים, שדורשות חשבונות ודפדפן של המשתמש.
- המשתמש ביקש ממני שוב ושוב "להשתלט על הכרום" ולפרוס בעצמי. בסשן ענן זה אינו אפשרי (סעיף 9). לכן הועבר הסשן למחשב שלו: הוא הריץ `claude --teleport session_01JGGEHvDiuRSr4CYHsLCnhh --chrome` ב־PowerShell, ופעל "Session resumed". הצעד הבא שהוצע: `/remote-control` בחלון הזה כדי לכתוב לסשן המקומי מהאפליקציה.
- **מה הוא רוצה עכשיו:** להעביר את הפרויקט לחשבון Claude חדש, ושהצ'אט החדש ימשיך בדיוק מכאן: לפרוס, לחבר Supabase, לבדוק את האתר החי ולדווח.
- **אף אחד מהשלבים הבאים לא בוצע:** מפתח Google חדש, הרצת ה־SQL ב־Supabase, Site URL, `firebase deploy`, סוד הריפו ב־GitHub, בדיקת האתר החי.
- **מה ידוע על הסביבה של המשתמש:** Windows + PowerShell. התקין git ו־Node (אחרי שהיו שגיאות "not recognized" שנפתרו בפתיחת חלון חדש), עבר לתיקיית הבית (`cd $HOME`) כי `C:\WINDOWS\system32` נתן Permission denied, שיכפל את הריפו ורץ `npm install`. Claude Code מותקן (הוצגה הודעת עדכון: `winget upgrade Anthropic.ClaudeCode`), והתוסף Claude in Chrome מותקן (גרסת כרום 154). `/chrome` הציג "Disabled" כל עוד Claude Code הופעל בלי `--chrome`.
- **מה נחשף / מה לא:** מפתח Google הישן נדבק בצ'אט (פרוץ, לא לחזור עליו ולא לשמור אותו). מפתחות Supabase עוד לא נוצרו או נמסרו. `.env.local` הישן היה רק בקונטיינר של הענן ולא בריפו, כך שבמחשב חדש לא יהיה `.env.local` וצריך ליצור אחד.
- **סטטוס Git:** PR #1 פתוח מהענף `claude/travel-app-user-friendly-n8gmzm` (הענף מסונכרן עם המסמך הזה). ה־PR לא קיבל ביקורות ולא היו לו בדיקות CI.

## 11. ציר זמן של מה שנבנה (לפי סדר ה־commits)
1. `Initial commit` + `Build Hebrew travel guide PWA` – מדריך המדינות, מסלול, צ'קליסט, טיפים, שפות.
2. `Add Central America region, Indonesia, currency converter and trip journal`.
3. `Add illustrated community map, Israeli-lens reviews, what's-hot and project vision` – המפה, הביקורות, "מה חם", "אני כאן", שאלות נפוצות, על הפרויקט (ניתוח שוק שהמשתמש סיפק הוכנס לאפליקציה).
4. `Add single-file build` – `npm run build:single` לאירוח עמוד יחיד.
5. `Prepare place model and storage boundary for external places` – מודל `Place` עם `source` (local/google), `src/repositories`.
6. `Add secure Google Places (New) proxy with tests` – `server/places.ts`.
7. `Add Google Places (New) layer to the map and places experience`.
8. `Add google-fonts skill` – לפי בקשת המשתמש.
9. `Add weekly places job (GitHub Actions)`.
10. `Add Firebase Hosting + Cloud Function deployment`.
11. `Add user accounts on Supabase` – חשבונות, סנכרון, ביקורות משותפות.
12. `Add CLAUDE.md`, `Add browser task checklist`, `Add one-command Windows deploy script`, ואז המסמך הזה.

היסטוריית הבקשות של המשתמש: אפליקציה ידידותית על הטיול הגדול → "תעשה את כל ההצעות חוץ מהראשונה" → הזנת ניתוח שוק → מסמך סיכום ל־GPT ותוכנית GPT (Google Places, repositories) → סקיל גופנים → מפתח Google (נדבק בצ'אט) → עדכון שבועי → "תעלה לאוויר דרך Firebase ו־Supabase" → סדרת בקשות לשלוט בכרום → העברת הסשן למחשב → בקשה למסמך העברה לחשבון חדש.

## 12. פרטים טכניים שכדאי להכיר
### נתיבי האפליקציה (`src/router.ts`)
`#/` בית, `#/region/<id>`, `#/country/<id>`, `#/plan`, `#/checklist`, `#/tips`, `#/phrases`, `#/currency[/<CODE>]`, `#/journal`, `#/more`, `#/map[/<placeId>]`, `#/hot`, `#/faq`, `#/about`, `#/account`.

### מדינות (21)
אסיה: תאילנד, וייטנאם, לאוס, קמבודיה, הודו, נפאל, סרי לנקה, הפיליפינים, יפן, אינדונזיה. דרום אמריקה: פרו, בוליביה, צ'ילה, ארגנטינה, ברזיל, קולומביה, אקוודור. מרכז אמריקה: מקסיקו, גואטמלה, קוסטה ריקה, פנמה. המזהים ב־`countries.ts` באנגלית (`thailand`, `costa-rica` וכו') ו־`isoNumeric` מתאים לגיאומטריה של המפה.

### פרוקסי Google
- פעולות: `nearby`, `search`, `details`, `photo`, `autocomplete`. ב־Firebase הכתובת `/api/places/**` מנותבת לפונקציה `places` באזור `europe-west1` (`firebase.json`).
- Field mask קבוע בשרת (חיפוש: id, שם, מיקום, כתובת, סוגים, דירוג, כמות דירוגים, רמת מחיר, `openNow`; פרטים: נוסף עוד, ותמונות רק בפרטים).
- מטמון TTL 30–60 דקות, 90 בקשות לדקה ל־IP, `maxInstances: 3`, בדיקת `ALLOWED_ORIGINS`, session tokens להשלמה אוטומטית.
- בצד הלקוח יש מטמון בזיכרון בלבד. מה ששמור מקומית הוא **מזהי מקום בלבד**.

### סנכרון (`src/cloud/sync.ts`)
מפתחות מסונכרנים: `tripPlan`, `checklist`, `journal`, `saved`, `customPlaces`. לכל מפתח חותמת זמן, והצד החדש יותר מנצח (last-writer-wins). בכניסה הראשונה של חשבון במכשיר, רשימות ממוזגות כדי לא לאבד נתונים שנכתבו לפני ההרשמה. "אני כאן" ותמונות לעולם לא עולים לענן. לאחר כניסה בפעם הראשונה מתבצע reload אחד כדי שהמסכים יטענו את נתוני הענן (`sessionStorage['sync-reloaded']`).

### Supabase – סכימה (`supabase/migrations/0001_init.sql`)
- `profiles` (שם תצוגה 2–30 תווים, נוצר בטריגר `handle_new_user`, קריאה לכולם, עריכה לבעלים).
- `user_data` (`jsonb` עד 2MB, פרטי לבעלים בלבד).
- `reviews` (עמודות: place_id, stars, body, visited, cost_usd, tags, hidden; אחת לכל משתמש+מקום; טריגר guard שמונע מלקוח לשנות `hidden`; טריגר הגבלת קצב; view ציבורי `reviews_public` עם `security_invoker`).
- `reports` (ללא קריאה דרך ה־API; אחרי 3 מדווחים שונים הביקורת מוסתרת אוטומטית).
- `delete_my_account()` (RPC למחיקת החשבון והנתונים).
- סיסמה מינימלית 8 תווים (`PASSWORD_MIN`). אימות אימייל נדרש. איפוס סיסמה: `redirectTo` הוא שורש האתר, בלי hash.

### הדוח השבועי
`.github/workflows/weekly-places.yml`: כל יום שני 06:00 UTC + הרצה ידנית. צריך סוד `GOOGLE_MAPS_API_KEY` והרשאות "Read and write". פותח Issue עם תווית `weekly-places` וסוגר את הקודם. המצב נשמר בענף `weekly-places-state` (קובץ `seen-place-ids.json`, מזהים בלבד). עלות משוערת ~180 בקשות לשבוע, תקרה `MAX_REQUESTS=220`.

### קבצים שאינם בריפו (וצריך ליצור במחשב חדש)
- `.env.local` עם `GOOGLE_MAPS_API_KEY` (לפיתוח מקומי בלבד), `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- `.firebaserc` (נוצר ב־`firebase use --add`).
- `functions/index.js` נוצר בבנייה (`npm run build:functions`) והוא ב־gitignore.

## 13. רשימת בדיקה מלאה לפני שמכריזים "הכל עובד"
- [ ] `npm install`, `npx tsc -b`, `npm test` (154 עוברות), `npm run build` בלי שגיאות.
- [ ] מפתח Google חדש הוגבל ל־Places API (New), מכסה ותקציב הוגדרו, הישן נמחק.
- [ ] `functions:secrets:set GOOGLE_MAPS_API_KEY` בוצע (המשתמש הדביק בעצמו).
- [ ] ה־SQL רץ ב־Supabase בלי שגיאה, Site URL ו־Redirect URLs הוגדרו, Email + Confirm email מופעלים.
- [ ] `.env.local` מכיל URL ו־anon בלבד, והאתר נבנה מחדש אחרי זה.
- [ ] `firebase deploy` הצליח והוחזרה כתובת Hosting; `ALLOWED_ORIGINS` הוגדר לכתובת הזאת.
- [ ] באתר החי: הרשמה + אימייל אימות + כניסה; סנכרון בין שני מכשירים או שני דפדפנים; ביקורת משותפת; דיווח על ביקורת; איפוס סיסמה; מחיקת חשבון בחשבון בדיקה.
- [ ] באתר החי: "קרוב אליי", חיפוש, קטגוריה "קפה", פרטי מקום עם "Powered by Google" ו"מידע חיצוני מ־Google".
- [ ] סוד ה־Actions והרשאות הוגדרו, והרצה ידנית אחת של הדוח השבועי הצליחה.
- [ ] דוח סופי בעברית למשתמש: מה עובד, מה לא, עם ציטוט שגיאות.

## 14. פרומפט התחלה לסוכן חדש
> קרא את `CLAUDE.md` ואת `docs/HANDOFF.md` (במיוחד סעיפים 6, 10 ו־13). המשתמש אינו מפתח ומדברים איתו בעברית. המטרה: להעלות את האפליקציה לאוויר ב־Firebase, לחבר Supabase, לבדוק את האתר החי ולדווח מה עובד ומה לא. עבוד צעד אחר צעד, הראה למשתמש מה אתה עומד לעשות, ועצור ושאל לפני כל דבר שקשור לחיוב, מחיקה או סודות. אל תבקש ואל תשתמש במפתח `service_role`, ואל תדפיס מפתחות.
