"use client";
import { useEffect, useState } from 'react'
import styles from './Qualitative.module.css'

export default function Qualitative ({ visibleName, internalName, description, symbol="★", forcedMinRating = 0 }) {
    const [rating, setRating] = useState(forcedMinRating);

    // Update rating if forcedMinRating changes
    useEffect(() => {
        if (forcedMinRating > 0 && rating < forcedMinRating) {
            setRating(forcedMinRating);
        } else if (forcedMinRating === 0 && rating > 0) {
            setRating(0);
        }
    }, [forcedMinRating, rating]);

    const ratingDescriptions = [
        "",
        "Low ",
        "Relatively Low ",
        "Just Below Average ",
        "Just Above Average ",
        "Relatively High ",
        "High "
    ];

    return (
        <div className={styles.qual}>
            <label htmlFor={internalName}>{visibleName}</label>
            <input type="hidden" name={internalName} value={rating}/>
            <hr></hr>
            <div className={styles.ratings}>
                {[1,2,3,4,5,6].map(ratingValue => {
                    return <div className={styles.symbol + (ratingValue <= rating ? " " + styles.selected : "")} key={ratingValue} onClick={() => setRating(ratingValue)}>{symbol}</div>
                })}
            </div>
            
            {rating === 0 && (description == "Coral Speed" || description == "Processor Speed" || description == "Net Speed") && (
                <div>
                    Not Applicable
                </div>
            )}

            {rating === 0 && description == "Algae Removal Speed" && (
                <div>
                    Did Not Try to Remove Algae
                </div>
            )}

            {rating === 0 && description == "Climb Speed" && (
                <div>
                    Did Not Try to Climb
                </div>
            )}

            {rating === 0 && description == "Maneuverability" && (
                <div>
                    Did Not Move
                </div>
            )}

            {rating === 0 && description == "Ability to Play Defense" && (
                <div>
                    Did Not Defend
                </div>
            )}

            {rating === 0 && description == "Defense Evasion Ability" && (
                <div>
                    Was Not Defended Against
                </div>
            )}

            {rating === 0 && description == "Aggression" && (
                <div>
                    Did Not Move
                </div>
            )}

            {rating === 0 && description == "Cage Hazard" && (
                <div>
                    Did Not Interact With Teammates in the Barge
                </div>
            )}

            {rating > 0 && (
                <div>
                    {ratingDescriptions[rating]} {description}
                </div>
            )}
        </div>
    )
}



