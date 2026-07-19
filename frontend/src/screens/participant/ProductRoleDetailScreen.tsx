import type { TodayView } from '../../contracts/generated/today-view';
import { COMPONENT_IDS } from '../../design-system/generated/component-ids';
import { ScreenHeader } from '../../components/primitives/ScreenHeader';
import { ProductRoleCard } from '../../components/cards/ProductRoleCard';
import { ActionList } from '../../components/composites/ActionList';
import { CompletionChecklist } from '../../components/composites/CompletionChecklist';
import { EmptyState } from '../../components/system/EmptyState';

export function ProductRoleDetailScreen({ data }: { data: TodayView }) {
  if (!data.product_role) return <EmptyState title="Product Role не назначена" />;
  return <div data-ui-id={COMPONENT_IDS.screen_product_role_detail}>
    <ScreenHeader eyebrow={`Day ${data.day.number} · ${data.stage.stage_id}`} title="Product Role" sync={data.sync_status} />
    <ProductRoleCard assignment={data.product_role} />
    <section><p className="ilka-eyebrow">PROJECTED ACTIONS</p>
      <ActionList items={data.tasks.map((task) => task.title)} />
    </section>
    <section><p className="ilka-eyebrow">PROJECTED COMPLETION</p>
      <CompletionChecklist items={data.outputs.map((output) => ({ id: output.output_id, title: output.title, complete: output.confirmed }))} />
    </section>
  </div>;
}
