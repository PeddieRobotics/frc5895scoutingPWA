import { useState } from 'react';
import styles from './EndPlacement.module.css';
import pageStyles from '../page.module.css';

export default function IntakeOptions({ className }) {
    const [intakeOptions, setIntakeOptions] = useState({
        coralgrndintake: false,
        coralstationintake: false,
        algaegrndintake: false,
        algaehighreefintake: false,
        algaelowreefintake: false
    });

    const handleChange = (e) => {
        const { name, checked } = e.target;
        setIntakeOptions(prev => ({
            ...prev,
            [name]: checked
        }));
    };

    // Create a style object to override the background color
    const goldContainerStyle = {
        backgroundColor: '#bd9748',
    };

    // Handle click on the entire option box
    const handleOptionClick = (name) => {
        setIntakeOptions(prev => ({
            ...prev,
            [name]: !prev[name]
        }));
    };

    // Label style to ensure it doesn't block clicks
    const labelStyle = {
        pointerEvents: 'none', // Make label transparent to mouse events
        width: '100%',         // Expand to fill the container
        cursor: 'pointer'      // Show pointer cursor on hover
    };

    return (
        <div 
            className={`${styles.endPossibilities} ${className || ""}`} 
            style={goldContainerStyle}
        >
            <div 
                className={styles.option} 
                onClick={() => handleOptionClick('coralgrndintake')}
            >
                <input 
                    type="checkbox" 
                    id="coralgrndintake" 
                    name="coralgrndintake" 
                    checked={intakeOptions.coralgrndintake}
                    onChange={handleChange}
                    onClick={(e) => e.stopPropagation()} // Prevent double-triggering
                />
                <label 
                    htmlFor="coralgrndintake"
                    style={labelStyle}
                >Coral Ground</label>
            </div>
            <div 
                className={styles.option} 
                onClick={() => handleOptionClick('coralstationintake')}
            >
                <input 
                    type="checkbox" 
                    id="coralstationintake" 
                    name="coralstationintake" 
                    checked={intakeOptions.coralstationintake}
                    onChange={handleChange}
                    onClick={(e) => e.stopPropagation()} // Prevent double-triggering
                />
                <label 
                    htmlFor="coralstationintake"
                    style={labelStyle}
                >Coral Station</label>
            </div>
            <div 
                className={styles.option} 
                onClick={() => handleOptionClick('algaegrndintake')}
            >
                <input 
                    type="checkbox" 
                    id="algaegrndintake" 
                    name="algaegrndintake" 
                    checked={intakeOptions.algaegrndintake}
                    onChange={handleChange}
                    onClick={(e) => e.stopPropagation()} // Prevent double-triggering
                />
                <label 
                    htmlFor="algaegrndintake"
                    style={labelStyle}
                >Algae Ground</label>
            </div>
            <div 
                className={styles.option} 
                onClick={() => handleOptionClick('algaehighreefintake')}
            >
                <input 
                    type="checkbox" 
                    id="algaehighreefintake" 
                    name="algaehighreefintake" 
                    checked={intakeOptions.algaehighreefintake}
                    onChange={handleChange}
                    onClick={(e) => e.stopPropagation()} // Prevent double-triggering
                />
                <label 
                    htmlFor="algaehighreefintake"
                    style={labelStyle}
                >Algae High Reef</label>
            </div>
            <div 
                className={styles.option} 
                onClick={() => handleOptionClick('algaelowreefintake')}
            >
                <input 
                    type="checkbox" 
                    id="algaelowreefintake" 
                    name="algaelowreefintake" 
                    checked={intakeOptions.algaelowreefintake}
                    onChange={handleChange}
                    onClick={(e) => e.stopPropagation()} // Prevent double-triggering
                />
                <label 
                    htmlFor="algaelowreefintake"
                    style={labelStyle}
                >Algae Low Reef</label>
            </div>
        </div>
    );
} 