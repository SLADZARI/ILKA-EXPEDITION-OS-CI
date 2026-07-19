import type { ButtonHTMLAttributes } from 'react';
import { COMPONENT_IDS } from '../../design-system/generated/component-ids';
import { Icon } from './Icon';

export function IconButton({ icon, label, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: string;
  label: string;
}) {
  return <button {...props} type={props.type ?? 'button'} aria-label={label}
    className={`ilka-icon-button ${className}`.trim()} data-ui-id={COMPONENT_IDS.icon_button}>
    <Icon name={icon} />
  </button>;
}
