import styles from './CommentBox.module.css'

export default function CommentBox ({ visibleName, internalName}) {
    return (
        <div className={styles.commentBoxContainer}>
            <label htmlFor={internalName} className={styles.commentLabel}>{visibleName}:</label>
            <textarea 
                className={styles.textarea} 
                id={internalName} 
                name={internalName}
                placeholder="Enter your comments here..."
            ></textarea>
        </div>
    )
}