import { ALL_LANGUAGES } from "../../src/types";

/** Empty string means "auto": taken from the link (hl), otherwise the server default. */
export type LocaleChoice = { lang: string };

const LANGUAGES = [
  ["uk", "Українська"],
  ["en", "English"],
  ["pl", "Polski"],
  ["de", "Deutsch"],
  ["es", "Español"],
  ["fr", "Français"],
] as const;

export const languageName = (code: string) =>
  code === ALL_LANGUAGES ? "усі" : (LANGUAGES.find(([lang]) => lang === code)?.[1] ?? code);

type Props = { value: LocaleChoice; onChange: (value: LocaleChoice) => void };

export function LocaleFields({ value, onChange }: Props) {
  return (
    <div className="locale">
      <label>
        Мова відгуків
        <select value={value.lang} onChange={(e) => onChange({ lang: e.target.value })}>
          <option value="">Авто (з посилання)</option>
          <option value={ALL_LANGUAGES}>Усі мови</option>
          {LANGUAGES.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
