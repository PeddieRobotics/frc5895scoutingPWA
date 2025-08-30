"use client";
import styles from "./TextInput.module.css";

// Supports both controlled (value + onChange) and uncontrolled (defaultValue) usage
export default function SelectInput({
  visibleName,
  internalName,
  options = [],
  value,
  defaultValue,
  changeListener
}) {
  const selectProps = {
    id: internalName,
    name: internalName
  };

  if (typeof changeListener === 'function') {
    selectProps.onChange = changeListener;
  }

  if (value !== undefined) {
    selectProps.value = value;
  } else if (defaultValue !== undefined) {
    selectProps.defaultValue = defaultValue;
  }

  return (
    <div className={styles.InputDiv}>
      <label htmlFor={internalName}>{visibleName}</label>
      <select {...selectProps}>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}
