/** The four pictures of the overall mood, from the angriest to the happiest. */
export type MoodLevel = "furious" | "unhappy" | "neutral" | "happy";

export const MOOD_LEVEL_LABELS: Record<MoodLevel, string> = {
  furious: "Користувачі розлючені",
  unhappy: "Користувачі незадоволені",
  neutral: "Настрій нейтральний",
  happy: "Користувачі задоволені",
};

/**
 * Average mood on a scale from −3 (furious) to +3 (delighted) → one of the four pictures.
 * The thresholds are a judgement call, kept in one place.
 */
export function moodLevel(average: number): MoodLevel {
  if (average <= -1.5) return "furious";
  if (average <= -0.4) return "unhappy";
  if (average < 0.6) return "neutral";
  return "happy";
}

const FACE_COLOR: Record<MoodLevel, string> = {
  furious: "#f0553f",
  unhappy: "#f7a93b",
  neutral: "#f9cf45",
  happy: "#f9cf45",
};

const INK = "#3b2a1a";

/** A 200×200 hand-drawn face. Pure SVG: no image files and no image-generating model needed. */
export function MoodFace({ level }: { level: MoodLevel }) {
  const stroke = { stroke: INK, strokeWidth: 7, strokeLinecap: "round" as const, fill: "none" };

  return (
    <svg viewBox="0 0 200 200" width="200" height="200" role="img" aria-label={MOOD_LEVEL_LABELS[level]}>
      <circle cx="100" cy="104" r="84" fill={FACE_COLOR[level]} />
      <circle cx="100" cy="104" r="84" fill="none" stroke={INK} strokeOpacity="0.18" strokeWidth="4" />

      {level === "furious" && (
        <>
          {/* Steam, slanted brows, clenched teeth. */}
          {/* The steam sits outside the face, on the page: it takes the text color to stay visible in dark mode. */}
          <path d="M30 34 q-10 -12 2 -22 M46 24 q-8 -12 4 -20" {...stroke} stroke="currentColor" strokeWidth={5} />
          <path d="M170 34 q10 -12 -2 -22 M154 24 q8 -12 -4 -20" {...stroke} stroke="currentColor" strokeWidth={5} />
          <path d="M48 66 L88 84 M152 66 L112 84" {...stroke} />
          <circle cx="72" cy="98" r="9" fill={INK} />
          <circle cx="128" cy="98" r="9" fill={INK} />
          <rect x="62" y="130" width="76" height="26" rx="8" fill="#fff" stroke={INK} strokeWidth="6" />
          <path d="M81 131 v24 M100 131 v24 M119 131 v24 M63 143 h74" stroke={INK} strokeWidth="4" />
        </>
      )}

      {level === "unhappy" && (
        <>
          {/* Worried brows and a frown. */}
          <path d="M52 78 L86 70 M148 78 L114 70" {...stroke} />
          <circle cx="72" cy="98" r="9" fill={INK} />
          <circle cx="128" cy="98" r="9" fill={INK} />
          <path d="M66 152 Q100 122 134 152" {...stroke} />
        </>
      )}

      {level === "neutral" && (
        <>
          <circle cx="72" cy="94" r="9" fill={INK} />
          <circle cx="128" cy="94" r="9" fill={INK} />
          <path d="M68 142 H132" {...stroke} />
        </>
      )}

      {level === "happy" && (
        <>
          {/* Smiling eyes, rosy cheeks, an open smile. */}
          <path d="M58 96 Q72 78 86 96 M114 96 Q128 78 142 96" {...stroke} />
          <circle cx="50" cy="122" r="12" fill="#f0553f" fillOpacity="0.35" />
          <circle cx="150" cy="122" r="12" fill="#f0553f" fillOpacity="0.35" />
          <path d="M60 124 Q100 176 140 124 Z" fill="#fff" stroke={INK} strokeWidth="7" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}
