import styles from './TextInput.module.css'
export default function TextInput ({ visibleName, internalName, defaultValue, type="text", pattern, className, onChange, disabled }) {
    return (
        <div className={styles.TextInput}>
            <label htmlFor={internalName}>{visibleName}</label>
            <input
                className={className || ""}
                type={type}
                id={internalName}
                name={internalName}
                defaultValue={defaultValue}
                pattern={pattern}
                onChange={onChange}
                disabled={disabled}
            ></input>
        </div>
    )
}