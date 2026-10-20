import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import type { Meetup } from './types';
import type { Place } from '../data/places';

export type MeetupsState = { state: 'off' } | { state: 'loading' } | { state: 'error' } | { state: 'ok'; meetups: Meetup[] };

/** Upcoming meetups for signed-in users; 'off' when accounts are not available or the user is out. */
export function useMeetups() {
  const { status, backend } = useAuth();
  const [view, setView] = useState<MeetupsState>({ state: status === 'in' ? 'loading' : 'off' });

  const reload = useCallback(async () => {
    if (!backend || status !== 'in') return setView({ state: 'off' });
    try {
      setView({ state: 'ok', meetups: await backend.listMeetups() });
    } catch {
      setView({ state: 'error' });
    }
  }, [backend, status]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { view, reload };
}

export const MEETUP_PREFIX = 'meetup-';

/** "יום שישי 24.10 · 19:00" in the traveller's own time zone. */
export function formatMeetupTime(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString('he-IL', { weekday: 'long' });
  const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  return `${day} ${d.getDate()}.${d.getMonth() + 1} · ${time}`;
}

/** Meetups as map pins (category "gathering"); the id prefix tells the map to open a meetup card. */
export function meetupPlaces(meetups: Meetup[]): Place[] {
  return meetups.map((m) => ({
    id: `${MEETUP_PREFIX}${m.id}`,
    countryId: m.countryId,
    name: m.title,
    category: 'gathering',
    lat: m.lat,
    lng: m.lng,
    desc: `${m.placeLabel} · ${formatMeetupTime(m.startsAt)}`,
  }));
}
