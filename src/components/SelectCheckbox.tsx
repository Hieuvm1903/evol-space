import React from "react";
import { Check } from "lucide-react";
import "./SelectCheckbox.css";

/** Drop at the start of a row when `longPress.selectMode` is true. */
export default function SelectCheckbox({ checked }: { checked: boolean }) {
  return (
    <span className={`select-checkbox${checked ? " checked" : ""}`}>
      {checked && <Check size={12} strokeWidth={3} />}
    </span>
  );
}