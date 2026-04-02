"use client";
import { useState, useEffect, useRef } from 'react';
import styles from './ImageSelect.module.css';
import SingleSelect from './SingleSelect';

export default function ImageSelect({ options, internalName, imageTag, optionLayout, required, gameId }) {
    const lsKey = `form_field_${internalName}`;
    const [selected, setSelected] = useState(() => {
        if (typeof window === 'undefined') return null;
        const stored = localStorage.getItem(lsKey);
        if (stored !== null) {
            const num = Number(stored);
            return Number.isNaN(num) ? stored : num;
        }
        return null;
    });

    const [confirmClear, setConfirmClear] = useState(false);
    const confirmTimerRef = useRef(null);

    const [imageData, setImageData] = useState(null);
    const [mimeType, setMimeType] = useState(null);
    const [imageLoading, setImageLoading] = useState(true);
    const [imageFailed, setImageFailed] = useState(false);

    // Cancel confirm state when selection is cleared
    useEffect(() => {
        if (selected === null) {
            setConfirmClear(false);
            clearTimeout(confirmTimerRef.current);
        }
    }, [selected]);

    const handleClearClick = () => {
        if (!confirmClear) {
            setConfirmClear(true);
            confirmTimerRef.current = setTimeout(() => setConfirmClear(false), 3000);
        } else {
            clearTimeout(confirmTimerRef.current);
            setConfirmClear(false);
            setSelected(null);
            localStorage.removeItem(lsKey);
        }
    };

    // Listen for form reset events
    useEffect(() => {
        const handleReset = () => {
            localStorage.removeItem(lsKey);
            setSelected(null);
        };

        window.addEventListener('reset_form_components', handleReset);
        window.addEventListener('reset_numeric_inputs', handleReset);

        return () => {
            window.removeEventListener('reset_form_components', handleReset);
            window.removeEventListener('reset_numeric_inputs', handleReset);
        };
    }, [lsKey]);

    // Fetch image
    useEffect(() => {
        if (!imageTag || !gameId) {
            setImageLoading(false);
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
                setImageLoading(false);
                return;
            } catch { /* ignore cache parse error */ }
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
                setImageLoading(false);
            })
            .catch(() => {
                setImageFailed(true);
                setImageLoading(false);
            });
    }, [imageTag, gameId]);

    if (!options || options.length === 0) return null;

    // Fallback to plain SingleSelect if image unavailable
    if (imageFailed) {
        return <SingleSelect options={options} internalName={internalName} />;
    }

    if (imageLoading) {
        return (
            <div className={styles.imageSelectContainer}>
                <div className={styles.loadingSkeleton} />
            </div>
        );
    }

    const overlayStyle = {
        top: optionLayout?.top || '50%',
    };

    return (
        <div className={styles.imageSelectContainer}>
            <div className={styles.imageWrapper}>
                <img
                    src={`data:${mimeType};base64,${imageData}`}
                    className={styles.backgroundImage}
                    alt="Field map"
                    draggable={false}
                />
                <div className={styles.optionsOverlay} style={overlayStyle}>
                    {options.map((opt) => {
                        const isSelected = selected === opt.value;
                        return (
                            <div
                                key={opt.value}
                                className={`${styles.optionMarker} ${isSelected ? styles.optionSelected : ''}`}
                                onClick={() => {
                                    setSelected(opt.value);
                                    localStorage.setItem(lsKey, String(opt.value));
                                }}
                            >
                                <input
                                    name={internalName}
                                    type="radio"
                                    value={opt.value}
                                    checked={isSelected}
                                    required={required}
                                    onChange={() => {
                                        setSelected(opt.value);
                                        localStorage.setItem(lsKey, String(opt.value));
                                    }}
                                    className={styles.hiddenRadio}
                                />
                                <span className={styles.optionLabel}>{opt.label}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
            {selected !== null && (
                <button
                    type="button"
                    className={`${styles.clearButton} ${confirmClear ? styles.clearConfirm : ''}`}
                    onClick={handleClearClick}
                >
                    {confirmClear ? 'Tap again to clear' : 'Clear'}
                </button>
            )}
        </div>
    );
}
