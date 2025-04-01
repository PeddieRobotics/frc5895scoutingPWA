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

    return (
        <div 
            className={`${styles.endPossibilities} ${className || ""}`} 
            style={goldContainerStyle}
        >
            <div className={styles.option} onClick={(e) => {
                const input = e.currentTarget.querySelector("input");
                if (input) input.click();
            }}>
                <input 
                    type="checkbox" 
                    id="coralgrndintake" 
                    name="coralgrndintake" 
                    checked={intakeOptions.coralgrndintake}
                    onChange={handleChange}
                />
                <label htmlFor="coralgrndintake">Coral Ground</label>
            </div>
            <div className={styles.option} onClick={(e) => {
                const input = e.currentTarget.querySelector("input");
                if (input) input.click();
            }}>
                <input 
                    type="checkbox" 
                    id="coralstationintake" 
                    name="coralstationintake" 
                    checked={intakeOptions.coralstationintake}
                    onChange={handleChange}
                />
                <label htmlFor="coralstationintake">Coral Station</label>
            </div>
            <div className={styles.option} onClick={(e) => {
                const input = e.currentTarget.querySelector("input");
                if (input) input.click();
            }}>
                <input 
                    type="checkbox" 
                    id="algaegrndintake" 
                    name="algaegrndintake" 
                    checked={intakeOptions.algaegrndintake}
                    onChange={handleChange}
                />
                <label htmlFor="algaegrndintake">Algae Ground</label>
            </div>
            <div className={styles.option} onClick={(e) => {
                const input = e.currentTarget.querySelector("input");
                if (input) input.click();
            }}>
                <input 
                    type="checkbox" 
                    id="algaehighreefintake" 
                    name="algaehighreefintake" 
                    checked={intakeOptions.algaehighreefintake}
                    onChange={handleChange}
                />
                <label htmlFor="algaehighreefintake">Algae High Reef</label>
            </div>
            <div className={styles.option} onClick={(e) => {
                const input = e.currentTarget.querySelector("input");
                if (input) input.click();
            }}>
                <input 
                    type="checkbox" 
                    id="algaelowreefintake" 
                    name="algaelowreefintake" 
                    checked={intakeOptions.algaelowreefintake}
                    onChange={handleChange}
                />
                <label htmlFor="algaelowreefintake">Algae Low Reef</label>
            </div>
        </div>
    );
} 