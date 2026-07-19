import type { ButtonHTMLAttributes } from 'react';
import { COMPONENT_IDS } from '../../design-system/generated/component-ids';

const cx = (...items: Array<string | false | null | undefined>) => items.filter(Boolean).join(' ');
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';

export function Button({ variant = 'primary', className, children, ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button {...props} className={cx('ilka-button', `ilka-button--${variant}`, className)}
      data-ui-id={COMPONENT_IDS.primary_button} data-variant={variant}>
      {children}
    </button>
  );
}
