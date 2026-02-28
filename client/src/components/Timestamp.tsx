export type TimestampVariant = 'datetime' | 'date' | 'time';

const toDate = (value: string | number | Date) => {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);

  // SQLite `datetime('now')` format: "YYYY-MM-DD HH:MM:SS" (UTC, no timezone marker).
  // Make it unambiguous for JS Date parsing by converting to ISO and appending "Z".
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)) {
    return new Date(value.replace(' ', 'T') + 'Z');
  }

  return new Date(value);
};

export function Timestamp(props: {
  value: string | number | Date;
  variant?: TimestampVariant;
  className?: string;
  title?: string;
}) {
  const variant = props.variant ?? 'datetime';
  const date = toDate(props.value);
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
