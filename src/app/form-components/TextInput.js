import styles from './TextInput.module.css'
import { useRef, useState } from 'react'

export default function TextInput ({ visibleName, internalName, defaultValue, type="text", pattern, className }) {
    // Add state to properly handle input value changes
    const [inputValue, setInputValue] = useState(defaultValue || "");
    const inputRef = useRef(null);
    
    // Handle input changes in a controlled way
    const handleChange = (e) => {
        setInputValue(e.target.value);
    };
    
    return (
        <div className={styles.TextInput}>
            <label htmlFor={internalName}>{visibleName}</label>
            <br></br>
            <input 
                ref={inputRef}
                className={className || ""} 
                type={type} 
                id={internalName} 
                name={internalName} 
                value={inputValue}
                onChange={handleChange}
                pattern={pattern}
                data-noshift="true" // Add data attribute for iOS fixes
            ></input>
            <br></br>
        </div>
    )
}