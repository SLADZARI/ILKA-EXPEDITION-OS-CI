import { previewHref } from './preview-bootstrap';

const links = [
  { label: 'Scenarios', href: '?' },
  { label: 'Participant', href: previewHref({ mode: 'participant', state: 'initial' }) },
  { label: 'Captain', href: previewHref({ mode: 'captain', state: 'initial' }) },
  { label: 'After sync', href: previewHref({ mode: 'captain', state: 'after_sync' }) },
];

export function PreviewSwitcher() {
  const current = `${window.location.search || '?'}`;
  return <nav className="ilka-preview-switcher" aria-label="Preview scenarios">
    <strong>Preview</strong>
    {links.map((link) => <a key={link.label} href={link.href} data-active={current === link.href}>{link.label}</a>)}
  </nav>;
}
