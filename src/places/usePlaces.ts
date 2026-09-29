import { useEffect, useMemo, useRef, useState } from 'react';
import type { Place } from '../data/places';
import { newSessionToken, placesApi, type PlacesApi, type Suggestion } from './api';
import { debounce, runSearch, type SearchRequest, type SearchStatus } from './search';

/** Runs a Google search whenever `request` changes (null = idle). Stale responses are ignored. */
export function useGoogleSearch(request: SearchRequest | null, api: PlacesApi = placesApi): { status: SearchStatus; places: Place[] } {
  const [state, setState] = useState<{ status: SearchStatus; places: Place[] }>({ status: 'idle', places: [] });
  const key = request ? JSON.stringify(request) : null;
  const latest = useRef(0);

  useEffect(() => {
    if (!key) {
      setState({ status: 'idle', places: [] });
      return;
    }
    const id = ++latest.current;
    setState((s) => ({ status: 'loading', places: s.places }));
    void runSearch(api, JSON.parse(key) as SearchRequest).then((out) => {
      if (id === latest.current) setState(out);
    });
    return () => {
      latest.current++;
    };
  }, [key, api]);

  return state;
}

/**
 * Autocomplete with a billing session: every keystroke shares one token, which is passed to the
 * details call when a suggestion is picked; then a new token starts the next session.
 */
export function useAutocomplete(near: { lat: number; lng: number } | undefined, api: PlacesApi = placesApi) {
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [failed, setFailed] = useState(false);
  const token = useRef(newSessionToken());
  const nearRef = useRef(near);
  nearRef.current = near;
  // Filling the box after a pick must not trigger a new round of suggestions.
  const skipNext = useRef(false);

  const fetchSuggestions = useMemo(
    () =>
      debounce((text: string) => {
        api
          .autocomplete(text, token.current, nearRef.current)
          .then((s) => {
            setSuggestions(s);
            setFailed(false);
          })
          .catch(() => {
            setSuggestions([]);
            setFailed(true);
          });
      }, 300),
    [api],
  );

  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    const text = input.trim();
    if (text.length < 2) {
      fetchSuggestions.cancel();
      setSuggestions([]);
      return;
    }
    fetchSuggestions(text);
    return () => fetchSuggestions.cancel();
  }, [input, fetchSuggestions]);

  return {
    input,
    setInput,
    suggestions,
    failed,
    sessionToken: () => token.current,
    /** Ends the session (call after the details request for a picked suggestion). */
    endSession() {
      token.current = newSessionToken();
      setSuggestions([]);
    },
    /** Puts the chosen suggestion's text in the box without searching for more suggestions. */
    pick(text: string) {
      if (text !== input) skipNext.current = true;
      fetchSuggestions.cancel();
      setInput(text);
      setSuggestions([]);
    },
    dismiss() {
      fetchSuggestions.cancel();
      setSuggestions([]);
    },
  };
}

/** Lazily resolves a Google photo name to a displayable URL. */
export function useGooglePhoto(name: string | undefined, api: PlacesApi = placesApi): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    setUrl(undefined);
    if (!name) return;
    let alive = true;
    api
      .photo(name)
      .then((u) => alive && setUrl(u))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [name, api]);
  return url;
}
