import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
import { Icon, type IconName } from "@repo/ui/components/icon";

/** Labels a native input and connects optional help text to its accessible description. */
export function Field({
  label,
  help,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  help?: string;
  id: string;
}) {
  return (
    <div className="scout-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="scout-input"
        aria-describedby={help ? `${id}-help` : undefined}
        {...props}
      />
      {help && (
        <span id={`${id}-help`} className="scout-field-help">
          {help}
        </span>
      )}
    </div>
  );
}

/** Keeps native select behavior while placing a decorative chevron consistently within the control. */
export function SelectInput({
  children,
  className = "",
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="scout-select">
      <select className={`scout-input ${className}`} {...props}>
        {children}
      </select>
      <Icon name="chevronDown" size={18} />
    </span>
  );
}

/** Presents one native radio option with a visible selected state and keyboard focus. */
export function Choice({
  name,
  value,
  title,
  description,
  icon,
  selected,
  onSelect,
}: {
  name: string;
  value: string;
  title: string;
  description?: string;
  icon?: IconName;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <label className="scout-choice" data-selected={selected}>
      <input
        className="sr-only"
        type="radio"
        name={name}
        value={value}
        checked={selected}
        onChange={onSelect}
      />
      {icon && (
        <span className="scout-choice-icon">
          <Icon name={icon} size={23} />
        </span>
      )}
      <span className="scout-choice-copy">
        <strong>{title}</strong>
        {description && <span>{description}</span>}
      </span>
      <span className="scout-radio-mark">{selected && <span />}</span>
    </label>
  );
}

/** Announces inline errors; an optional ID links a field's accessible description to the message. */
export function FormError({
  children,
  id,
}: {
  children: ReactNode;
  id?: string;
}) {
  if (!children) return null;
  return (
    <p id={id} className="scout-error" role="alert">
      <Icon name="help" size={17} />
      {children}
    </p>
  );
}

/** Shows editable summary data without treating omitted information as confirmed. */
export function SummaryRow({
  label,
  value,
  unknown = false,
}: {
  label: string;
  value: string;
  unknown?: boolean;
}) {
  return (
    <div className="scout-summary-row">
      <dt>{label}</dt>
      <dd data-unknown={unknown}>{value}</dd>
    </div>
  );
}
