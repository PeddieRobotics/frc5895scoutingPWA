"use client";
import styles from "./TextInput.module.css";

export default function SelectInput({ visibleName, internalName, options = [], value = "", changeListener }) {
  return (
    <div className={styles.InputDiv}>
      <label htmlFor={internalName}>{visibleName}</label>
      <select
        id={internalName}
        name={internalName}
        value={value}
        onChange={changeListener}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}
