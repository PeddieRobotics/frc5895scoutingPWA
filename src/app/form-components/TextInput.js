import styles from './TextInput.module.css'

// Supports both controlled (value + onChange) and uncontrolled (defaultValue) usage
export default function TextInput ({
    visibleName,
    internalName,
    type = "text",
    pattern,
    className,
    changeListener, // optional
    value,          // optional
    defaultValue    // optional
}) {
    // Build props to avoid React warning: value without onChange
    const inputProps = {
        className: className || "",
        type,
        id: internalName,
        name: internalName,
        pattern
    };

    if (typeof changeListener === 'function') {
        inputProps.onChange = changeListener;
    }

    if (value !== undefined) {
        // Controlled usage
        inputProps.value = value;
        // If a consumer accidentally forgets onChange, keep the field editable by not forcing readOnly.
        // React will warn only when value is present without onChange; we expect changeListener when value is used.
    } else if (defaultValue !== undefined) {
        // Uncontrolled usage
        inputProps.defaultValue = defaultValue;
    }

    return (
        <div className={styles.TextInput}>
            <label htmlFor={internalName}>{visibleName}</label>
            <input {...inputProps}></input>
        </div>
    )
}
