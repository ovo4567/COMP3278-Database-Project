export type TimestampVariant = 'datetime' | 'date' | 'time';

export function Timestamp(props: {
  value: string | number | Date;
  variant?: TimestampVariant;
  className?: string;
  title?: string;
}) {
  const variant = props.variant ?? 'datetime';
  const date = props.value instanceof Date ? props.value : new Date(props.value);
  const isValid = !Number.isNaN(date.getTime());

  const formatted = (() => {
    if (!isValid) return String(props.value);
    if (variant === 'date') return date.toLocaleDateString();
    if (variant === 'time') return date.toLocaleTimeString();
    return date.toLocaleString();
  })();

  const className = ['ui-system', props.className].filter(Boolean).join(' ');

  return (
    <span className={className} title={props.title}>
      {formatted}
    </span>
  );
}
