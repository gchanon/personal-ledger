"use client";

// A short curated set for the common cases, plus a free input for everything
// else — the phone keyboard already has every emoji, so the grid only needs to
// cover the ones worth not hunting for.
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
  const custom = value !== "" && !CHOICES.includes(value);

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-8 gap-1">
        {custom && <Swatch emoji={value} selected onSelect={onChange} />}
        {CHOICES.map((emoji) => (
          <Swatch
            key={emoji}
            emoji={emoji}
            selected={value === emoji}
            onSelect={onChange}
          />
        ))}
      </div>

      <label className="flex items-center gap-3 rounded-xl border border-neutral-200 px-3 py-2 dark:border-neutral-800">
        <span className="flex-1 text-xs text-neutral-500">
          หรือพิมพ์เอง — แตะช่องนี้แล้วกดปุ่ม 🙂 บนแป้นพิมพ์
        </span>
        <input
          value={value}
          onChange={(e) => {
            const picked = lastGrapheme(e.target.value);
            // Empty means the field was cleared; keep the current icon rather
            // than leaving the category without one.
            if (picked) onChange(picked);
          }}
          aria-label="ไอคอนของหมวดหมู่"
          className="w-12 rounded-lg bg-neutral-100 py-1.5 text-center text-xl outline-none dark:bg-neutral-800"
        />
      </label>
    </div>
  );
}

function Swatch({
  emoji,
  selected,
  onSelect,
}: {
  emoji: string;
  selected: boolean;
  onSelect: (emoji: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(emoji)}
      aria-label={emoji}
      aria-pressed={selected}
      className={`aspect-square rounded-lg text-lg transition ${
        selected
          ? "bg-neutral-900 dark:bg-neutral-100"
          : "bg-neutral-100 dark:bg-neutral-800"
      }`}
    >
      {emoji}
    </button>
  );
}

/**
 * Emoji are grapheme clusters, not code points: 👨‍👩‍👧 is five code points joined
 * by zero-width joiners and 👍🏽 is a base plus a skin-tone modifier, so
 * [...str].pop() would slice either one in half. Taking the *last* cluster means
 * a fresh tap replaces whatever was there.
 */
function lastGrapheme(input: string): string {
  if (input === "") return "";

  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const clusters = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(input)];
    return clusters.at(-1)?.segment ?? "";
  }
  return [...input].at(-1) ?? "";
}
