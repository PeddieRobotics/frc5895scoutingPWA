import styles from './SubHeader.module.css'

export default function SubHeader ({ subHeaderName, className }) {
    return (
        <div className={`${styles.subHeader} ${className || ""}`}>
            <span>{subHeaderName}</span>
            <hr></hr>
        </div>
    )
}