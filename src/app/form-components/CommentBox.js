"use client";
import styles from './CommentBox.module.css'
import { useRef, useEffect, useState } from 'react';

export default function CommentBox ({ visibleName, internalName}) {
    const textareaRef = useRef(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const [charCount, setCharCount] = useState(0);
    const MAX_CHARS = 255;
    
    // Function to auto-resize the textarea
    const autoResize = () => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        
        // Reset height to get the correct scrollHeight
        textarea.style.height = 'auto';
        
        // Calculate new height
        const newHeight = Math.max(120, textarea.scrollHeight);
        const maxHeight = window.innerWidth <= 768 ? 300 : 400;
        
        // Check if the content would expand beyond max height
        if (newHeight >= maxHeight) {
            textarea.style.height = maxHeight + 'px';
            if (!isExpanded) setIsExpanded(true);
        } else {
            textarea.style.height = newHeight + 'px';
            if (isExpanded) setIsExpanded(false);
        }
    };
    
    // Update character count
    const handleInput = (e) => {
        setCharCount(e.target.value.length);
        autoResize();
    };
    
    // Set up the resize on input and window resize
    useEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        
        // Initialize the height
        autoResize();
        
        // Add event listeners
        window.addEventListener('resize', autoResize);
        
        // Cleanup
        return () => {
            window.removeEventListener('resize', autoResize);
        };
    }, [isExpanded]);
    
    return (
        <div className={styles.commentBoxContainer}>
            <label htmlFor={internalName} className={styles.commentLabel}>{visibleName}:</label>
            <textarea 
                ref={textareaRef}
                className={`${styles.textarea} ${isExpanded ? styles.expanded : ''}`}
                id={internalName} 
                name={internalName}
                placeholder="Enter your comments here..."
                rows="3"
                maxLength={MAX_CHARS}
                onInput={handleInput}
                onFocus={autoResize}
            ></textarea>
            <div className={styles.charCounter}>
                {charCount}/{MAX_CHARS} characters
            </div>
        </div>
    )
}