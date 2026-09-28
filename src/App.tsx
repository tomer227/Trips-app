import { useRoute } from './router';
import { usePersistentState } from './storage';
import { emptyPlan, type TripPlan } from './budget';
import BottomNav from './components/BottomNav';
import Home from './pages/Home';
import RegionPage from './pages/RegionPage';
import CountryPage from './pages/CountryPage';
import PlanPage from './pages/PlanPage';
import ChecklistPage from './pages/ChecklistPage';
import TipsPage from './pages/TipsPage';
import PhrasesPage from './pages/PhrasesPage';
import CurrencyPage from './pages/CurrencyPage';
import JournalPage from './pages/JournalPage';
import MorePage from './pages/MorePage';

export default function App() {
  const route = useRoute();
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
    default:
      page = <Home plan={plan} />;
  }

  return (
    <div className="app">
      <main className="content">{page}</main>
      <BottomNav route={route} />
    </div>
  );
}
