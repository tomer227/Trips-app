import { countries, regions } from '../data/countries';

export default function CountrySelect({ value, onChange, label = 'מדינה' }: { value: string; onChange: (id: string) => void; label?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {regions.map((r) => (
        <optgroup key={r.id} label={r.name}>
          {countries
            .filter((c) => c.region === r.id)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.flag} {c.name}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}
