import type { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: ReactNode;
  back?: { href: string; label: string };
}

export default function PageHeader({ title, subtitle, back }: Props) {
  return (
    <header className="page-header">
      {back && (
        <a className="back-link" href={back.href}>
          → {back.label}
        </a>
      )}
      <h1>{title}</h1>
      {subtitle && <p className="subtitle">{subtitle}</p>}
    </header>
  );
}
