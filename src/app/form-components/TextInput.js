import styles from './TextInput.module.css'
export default function TextInput ({ visibleName, internalName, type="text", pattern, className, changeListener, value = "" }) {
    return (
        <div className={styles.TextInput}>
            <label htmlFor={internalName}>{visibleName}</label>
            <input 
                className={className || ""} 
                type={type} 
                id={internalName} 
                name={internalName} 
                value={value}
                pattern={pattern}
                onChange={changeListener}
            ></input>
        </div>
    )
}