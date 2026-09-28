import type { Route } from '../router';

const items = [
  { href: '#/', label: 'בית', icon: '🏠', match: ['home', 'region', 'country'] },
  { href: '#/plan', label: 'הטיול שלי', icon: '🧭', match: ['plan'] },
  { href: '#/checklist', label: 'צ׳קליסט', icon: '✅', match: ['checklist'] },
  { href: '#/tips', label: 'טיפים', icon: '💡', match: ['tips'] },
  { href: '#/phrases', label: 'שפות', icon: '💬', match: ['phrases'] },
];

export default function BottomNav({ route }: { route: Route }) {
  return (
    <nav className="bottom-nav" aria-label="ניווט ראשי">
      {items.map((item) => {
        const active = item.match.includes(route.name);
        return (
          <a key={item.href} href={item.href} className={active ? 'active' : undefined} aria-current={active ? 'page' : undefined}>
            <span className="nav-icon" aria-hidden="true">
              {item.icon}
            </span>
            <span>{item.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
