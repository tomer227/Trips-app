import { Suspense, lazy, useEffect, useState } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import { useRoute } from './router';
import { usePersistentState } from './storage';
import { emptyPlan, type TripPlan } from './budget';
import BottomNav from './components/BottomNav';
import Home from './pages/Home';
import { AuthProvider, useAuth } from './cloud/AuthContext';

// Only the home page ships in the first download; the rest load on demand (and are fetched in the
// background after start-up so they also work offline, see main.tsx).
const pageLoaders = {
  RegionPage: () => import('./pages/RegionPage'),
  CountryPage: () => import('./pages/CountryPage'),
  PlanPage: () => import('./pages/PlanPage'),
  ChecklistPage: () => import('./pages/ChecklistPage'),
  TipsPage: () => import('./pages/TipsPage'),
  PhrasesPage: () => import('./pages/PhrasesPage'),
  CurrencyPage: () => import('./pages/CurrencyPage'),
  JournalPage: () => import('./pages/JournalPage'),
  MorePage: () => import('./pages/MorePage'),
  MapPage: () => import('./pages/MapPage'),
  HotPage: () => import('./pages/HotPage'),
  FaqPage: () => import('./pages/FaqPage'),
  AboutPage: () => import('./pages/AboutPage'),
  AccountPage: () => import('./pages/AccountPage'),
  SafetyPage: () => import('./pages/SafetyPage'),
  ShabbatPage: () => import('./pages/ShabbatPage'),
  MoneyPage: () => import('./pages/MoneyPage'),
  PartnersPage: () => import('./pages/PartnersPage'),
  BookPage: () => import('./pages/BookPage'),
  ModerationPage: () => import('./pages/ModerationPage'),
};
const RegionPage = lazy(pageLoaders.RegionPage);
const CountryPage = lazy(pageLoaders.CountryPage);
const PlanPage = lazy(pageLoaders.PlanPage);
const ChecklistPage = lazy(pageLoaders.ChecklistPage);
const TipsPage = lazy(pageLoaders.TipsPage);
const PhrasesPage = lazy(pageLoaders.PhrasesPage);
const CurrencyPage = lazy(pageLoaders.CurrencyPage);
const JournalPage = lazy(pageLoaders.JournalPage);
const MorePage = lazy(pageLoaders.MorePage);
const MapPage = lazy(pageLoaders.MapPage);
const HotPage = lazy(pageLoaders.HotPage);
const FaqPage = lazy(pageLoaders.FaqPage);
const AboutPage = lazy(pageLoaders.AboutPage);
const AccountPage = lazy(pageLoaders.AccountPage);
const SafetyPage = lazy(pageLoaders.SafetyPage);
const ShabbatPage = lazy(pageLoaders.ShabbatPage);
const MoneyPage = lazy(pageLoaders.MoneyPage);
const PartnersPage = lazy(pageLoaders.PartnersPage);
const BookPage = lazy(pageLoaders.BookPage);
const ModerationPage = lazy(pageLoaders.ModerationPage);

export function preloadPages() {
  for (const load of Object.values(pageLoaders)) void load().catch(() => undefined);
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

function AppShell() {
  const route = useRoute();
  const { updateAvailable } = useAuth();
  const online = useOnline();
  const [plan, setPlan] = usePersistentState<TripPlan>('trip-plan', emptyPlan);

  const addToTrip = (countryId: string, days: number) =>
    setPlan((p) =>
      p.stops.some((s) => s.countryId === countryId) ? p : { ...p, stops: [...p.stops, { countryId, days }] },
    );

  let page;
  switch (route.name) {
    case 'region':
      page = <RegionPage regionId={route.id} />;
      break;
    case 'country':
      page = <CountryPage key={route.id} countryId={route.id} plan={plan} onAdd={addToTrip} />;
      break;
    case 'plan':
      page = <PlanPage plan={plan} setPlan={setPlan} />;
      break;
    case 'checklist':
      page = <ChecklistPage />;
      break;
    case 'tips':
      page = <TipsPage />;
      break;
    case 'phrases':
      page = <PhrasesPage />;
      break;
    case 'currency':
      page = <CurrencyPage key={route.code ?? ''} initialCode={route.code} plan={plan} />;
      break;
    case 'journal':
      page = <JournalPage plan={plan} />;
      break;
    case 'more':
      page = <MorePage />;
      break;
    case 'map':
      page = <MapPage key={route.id ?? ''} initialPlaceId={route.id} plan={plan} />;
      break;
    case 'hot':
      page = <HotPage />;
      break;
    case 'faq':
      page = <FaqPage />;
      break;
    case 'about':
      page = <AboutPage />;
      break;
    case 'account':
      page = <AccountPage />;
      break;
    case 'safety':
      page = <SafetyPage plan={plan} />;
      break;
    case 'shabbat':
      page = <ShabbatPage plan={plan} />;
      break;
    case 'money':
      page = <MoneyPage plan={plan} />;
      break;
    case 'partners':
      page = <PartnersPage plan={plan} />;
      break;
    case 'book':
      page = <BookPage />;
      break;
    case 'moderation':
      page = <ModerationPage />;
      break;
    default:
      page = <Home plan={plan} />;
  }

  return (
    <div className="app">
      {updateAvailable && (
        <div className="update-banner" role="status">
          <span>יש עדכון מהענן ממכשיר אחר.</span>
          <button className="btn btn-small" onClick={() => window.location.reload()}>
            רענון
          </button>
        </div>
      )}
      {!online && (
        <div className="offline-banner" role="status">
          אין חיבור לאינטרנט. מה ששמרתם במכשיר זמין, וחיפוש מקומות וסנכרון יחזרו כשהחיבור יחזור.
        </div>
      )}
      <main className="content">
        <ErrorBoundary key={window.location.hash}>
          <Suspense fallback={<p className="muted page-loading">טוען…</p>}>{page}</Suspense>
        </ErrorBoundary>
      </main>
      <BottomNav route={route} />
    </div>
  );
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}
