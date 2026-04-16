'use client';
import styles from "./VBox.module.css"

export default function VBox({title, value, color1, color2, titleColor, valueColor}) {
    return (
      <div style={{backgroundColor: color2}} className={styles.VBox}>
        <div className={styles.VBoxTitle} style={{backgroundColor: color1, ...(titleColor ? {color: titleColor} : {})}}>{title}</div>
        <div className={styles.VBoxValue} style={valueColor ? {color: valueColor} : undefined}>{value}</div>
      </div>
    )
}