import { useEffect, useState } from 'react';

/**
 * Tiny hash router: routes look like "#/country/peru".
 * Hash routing keeps the app working on any static host and offline.
 */
export type Route =
  | { name: 'home' }
  | { name: 'region'; id: string }
  | { name: 'country'; id: string }
  | { name: 'plan' }
  | { name: 'checklist' }
  | { name: 'tips' }
  | { name: 'phrases' }
  | { name: 'currency'; code?: string }
  | { name: 'journal' }
  | { name: 'more' }
  | { name: 'map'; id?: string }
  | { name: 'hot' }
  | { name: 'faq' }
  | { name: 'about' }
  | { name: 'account' };

export function parseRoute(hash: string): Route {
  const [page, id] = hash.replace(/^#\/?/, '').split('/');
  switch (page) {
    case 'region':
      return id ? { name: 'region', id } : { name: 'home' };
    case 'country':
      return id ? { name: 'country', id } : { name: 'home' };
    case 'map':
      return id ? { name: 'map', id } : { name: 'map' };
    case 'currency':
      return id ? { name: 'currency', code: id.toUpperCase() } : { name: 'currency' };
    case 'plan':
    case 'checklist':
    case 'tips':
    case 'phrases':
    case 'journal':
    case 'more':
    case 'hot':
    case 'faq':
    case 'about':
    case 'account':
      return { name: page };
    default:
      return { name: 'home' };
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parseRoute(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
