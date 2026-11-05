import { useNow } from "../lib/hooks";
import { splitDuration, pad } from "../lib/format";

export default function Countdown({ to, compact = false }) {
  const now = useNow();
  const { days, hours, mins, secs } = splitDuration((to || 0) - now);
  const parts = [
    ["hari", days],
    ["jam", hours],
    ["mnt", mins],
    ["dtk", secs],
  ];
  if (compact) {
    return (
      <span className="mono">
        {days > 0 ? `${days}h ` : ""}
        {pad(hours)}:{pad(mins)}:{pad(secs)}
      </span>
    );
  }
  return (
    <div className="countdown mono" role="timer" aria-label="Hitung mundur">
      {parts.map(([label, v]) => (
        <div key={label} className="countdown__cell">
          <b>{pad(v)}</b>
          <small>{label}</small>
        </div>
      ))}
    </div>
  );
}
