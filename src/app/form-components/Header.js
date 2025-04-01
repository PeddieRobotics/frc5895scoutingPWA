import styles from "./Header.module.css";

export default function Header ({ headerName, className }) {
    return (
        <div className={`${styles.header} ${className || ""}`}>
            <span>{headerName}</span>
            <hr></hr>
            
        </div>
    )
}