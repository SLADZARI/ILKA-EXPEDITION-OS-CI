import { Button } from '../components/primitives/Button';
import { ScreenHeader } from '../components/primitives/ScreenHeader';
import { SectionHeader } from '../components/primitives/SectionHeader';
import { previewHref, type PreviewSelection } from './preview-bootstrap';

function openPreview(selection: PreviewSelection) {
  window.location.assign(previewHref(selection));
}

export function PreviewLauncher() {
  return <div>
    <ScreenHeader eyebrow="Static prototype · Day 1" title="Choose a canonical projection" sync="synced" />
    <p className="ilka-card-caption">
      Preview mode renders schema-valid projections. It does not run an Engine reducer or apply server-confirmed outcomes in the browser.
    </p>
    <section>
      <SectionHeader title="Participant App" />
      <div className="ilka-card-grid">
        <article className="ilka-card">
          <p className="ilka-eyebrow">DAY 1 · ONBOARDING</p>
          <h2>Participant 01</h2>
          <p>Product Captain + Navigation. Open cards and queue the Team Agreement task offline.</p>
          <Button onClick={() => openPreview({ mode: 'participant', state: 'initial' })}>Open Participant App</Button>
        </article>
      </div>
    </section>
    <section>
      <SectionHeader title="Captain Console" />
      <div className="ilka-card-grid">
        <article className="ilka-card">
          <p className="ilka-eyebrow">AUTHORITATIVE PROJECTION</p>
          <h2>Day 1 · Initial</h2>
          <p>Five assignments are active. Required cards, tasks and outputs are still incomplete.</p>
          <Button variant="secondary" onClick={() => openPreview({ mode: 'captain', state: 'initial' })}>Open initial overview</Button>
        </article>
        <article className="ilka-card">
          <p className="ilka-eyebrow">AUTHORITATIVE PROJECTION</p>
          <h2>Day 1 · After sync</h2>
          <p>Participant 01 cards and task are represented as accepted. Outputs remain blockers.</p>
          <Button variant="secondary" onClick={() => openPreview({ mode: 'captain', state: 'after_sync' })}>Open after-sync overview</Button>
        </article>
      </div>
    </section>
  </div>;
}
