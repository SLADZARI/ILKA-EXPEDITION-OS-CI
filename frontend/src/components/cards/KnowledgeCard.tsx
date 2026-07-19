import { COMPONENT_IDS } from '../../design-system/generated/component-ids';
import type { TodayView } from '../../contracts/generated/today-view';
import { StatusBadge } from '../primitives/StatusBadge';
import { Icon } from '../primitives/Icon';
import { Button } from '../primitives/Button';
import { CardShell } from './CardShell';

type Card = TodayView['cards'][number];
export function KnowledgeCard({ card, onAcknowledge }: { card: Card; onAcknowledge?: () => void }) {
  return (
    <CardShell id={COMPONENT_IDS.knowledge_card} className="ilka-knowledge-card" state={card.acknowledged ? 'acknowledged' : 'available'}>
      <div className="ilka-card-icon"><Icon name="book" /></div>
      <p className="ilka-eyebrow">KNOWLEDGE CARD</p>
      <h3>{card.title}</h3>
      <div className="ilka-badge-row">
        <StatusBadge label={card.acknowledged ? 'Прочитана' : card.required ? 'Обязательная' : 'Доступна'}
          tone={card.acknowledged ? 'success' : card.required ? 'warning' : 'neutral'} />
        {card.pending_sync && <StatusBadge label="Pending sync" tone="sync_pending" icon="clock" />}
      </div>
      {!card.acknowledged && onAcknowledge && <Button variant="secondary" onClick={onAcknowledge}>Подтвердить прочтение</Button>}
    </CardShell>
  );
}
