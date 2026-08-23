"use client";

// A short curated set beats a full emoji keyboard here: the list is scannable,
// and every glyph is one that reads at 20px on a phone.
const CHOICES = [
  "🍜", "☕", "🍺", "🛒", "🚕", "🚆", "⛽", "🅿️",
  "🏠", "💡", "📱", "🛍️", "👕", "💊", "🏥", "🎬",
  "🎮", "✈️", "🎁", "📚", "🐶", "💇", "🧾", "📦",
  "💰", "💻", "🏦", "📈",
];

export function EmojiPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (emoji: string) => void;
}) {
  return (
    <div className="grid grid-cols-8 gap-1">
      {CHOICES.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onChange(emoji)}
          aria-label={emoji}
          aria-pressed={value === emoji}
          className={`aspect-square rounded-lg text-lg transition ${
            value === emoji
              ? "bg-neutral-900 dark:bg-neutral-100"
              : "bg-neutral-100 dark:bg-neutral-800"
          }`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
