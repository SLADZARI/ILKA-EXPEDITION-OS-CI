import { COMPONENT_IDS } from '../../design-system/generated/component-ids';

export function BallotOption({ optionId, title, selected, disabled, onSelect }: {
  optionId: string;
  title: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: (optionId: string) => void;
}) {
  return <button type="button" className="ilka-ballot-option" data-ui-id={COMPONENT_IDS.ballot_option}
    data-selected={selected} disabled={disabled} onClick={() => onSelect(optionId)}>
    <span className="ilka-ballot-option__radio" aria-hidden="true" /><span>{title}</span>
  </button>;
}
