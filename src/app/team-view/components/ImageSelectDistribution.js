"use client";
import { useState, useEffect } from 'react';
import styles from './ImageSelectDistribution.module.css';

export default function ImageSelectDistribution({ distribution, valueMapping, imageTag, optionLayout, gameId, sectionColors }) {
    const [imageData, setImageData] = useState(null);
    const [mimeType, setMimeType] = useState(null);
    const [imageFailed, setImageFailed] = useState(false);

    useEffect(() => {
        if (!imageTag || !gameId) {
            setImageFailed(true);
            return;
        }

        const cacheKey = `fieldimage_${gameId}_${imageTag}`;
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                setImageData(parsed.image_data);
                setMimeType(parsed.mime_type);
                return;
            } catch { /* ignore */ }
        }

        fetch(`/api/field-images?gameId=${gameId}&tag=${encodeURIComponent(imageTag)}`)
            .then(res => {
                if (!res.ok) throw new Error('Image not found');
                return res.json();
            })
            .then(data => {
                if (data.image) {
                    setImageData(data.image.image_data);
                    setMimeType(data.image.mime_type);
                    sessionStorage.setItem(cacheKey, JSON.stringify({
                        image_data: data.image.image_data,
                        mime_type: data.image.mime_type,
                    }));
                } else {
                    setImageFailed(true);
                }
            })
            .catch(() => setImageFailed(true));
    }, [imageTag, gameId]);

    const entries = Object.entries(distribution || {});
    if (entries.length === 0) return null;
    const total = entries.reduce((s, [, v]) => s + v, 0);

    const overlayStyle = {
        top: optionLayout?.top || '50%',
    };

    // Fallback: plain colored boxes if image unavailable
    if (imageFailed || !imageData) {
        return (
            <div className={styles.fallbackBoxes}>
                {entries.map(([label, count], j) => (
                    <div
                        key={label}
                        className={styles.fallbackBox}
                        style={{ backgroundColor: j % 2 === 0 ? sectionColors?.[2] : sectionColors?.[1] }}
                    >
                        <div className={styles.fallbackLabel}>{label}</div>
                        <div className={styles.fallbackValue}>
                            {total > 0 ? `${Math.round((count / total) * 100)}%` : '0%'}
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.imageWrapper}>
                <img
                    src={`data:${mimeType};base64,${imageData}`}
                    className={styles.backgroundImage}
                    alt="Field map"
                    draggable={false}
                />
                <div className={styles.optionsOverlay} style={overlayStyle}>
                    {entries.map(([label, count], j) => {
                        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                        return (
                            <div
                                key={label}
                                className={styles.optionPill}
                            >
                                <div className={styles.pillLabel}>{label}</div>
                                <div className={styles.pillValue}>{pct}%</div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
