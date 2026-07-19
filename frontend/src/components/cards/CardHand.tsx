import type { TodayView } from '../../contracts/generated/today-view';
import { COMPONENT_IDS } from '../../design-system/generated/component-ids';
import { KnowledgeCard } from './KnowledgeCard';

type Card = TodayView['cards'][number];
export function CardHand({ cards, onAcknowledge }: { cards: Card[]; onAcknowledge?: (cardId: string) => void }) {
  return <div className="ilka-card-grid" data-ui-id={COMPONENT_IDS.card_hand}>
    {cards.map((card) => <KnowledgeCard key={card.card_id} card={card} onAcknowledge={onAcknowledge ? () => onAcknowledge(card.card_id) : undefined} />)}
  </div>;
}
