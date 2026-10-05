import { useState } from "react";

const PREVIEW_CHARS = 240;

/** Long review text: a preview with a button to read it in full. */
export function ExpandableText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (text.length <= PREVIEW_CHARS) return <>{text}</>;

  return (
    <>
      {open ? text : `${text.slice(0, PREVIEW_CHARS).trimEnd()}…`}{" "}
      <button type="button" className="link" onClick={() => setOpen(!open)}>
        {open ? "Згорнути" : "Показати повністю"}
      </button>
    </>
  );
}
