/**
 * DynamicFormRenderer - Renders form fields dynamically from JSON config
 *
 * All form content is driven entirely by the JSON game configuration.
 * No hardcoded field names or game-specific components.
 */
import React, { useLayoutEffect, useRef, useState, useCallback } from 'react';
import Header from './Header';
import SubHeader from './SubHeader';
import TextInput from './TextInput';
import NumericInput from './NumericInput';
import Checkbox from './Checkbox';
import CommentBox from './CommentBox';
import SingleSelect from './SingleSelect';
import MultiSelect from './MultiSelect';
import Qualitative from './Qualitative';
import HoldTimerInput from './HoldTimerInput';
import ImageSelect from './ImageSelect';
import styles from '../page.module.css';

function InlineTimerGroup({ fields, groupKey }) {
  const buttonWrapRefs = useRef([]);
  const [syncedHeight, setSyncedHeight] = useState(0);

  useLayoutEffect(() => {
    const heights = buttonWrapRefs.current.map(r => r?.getBoundingClientRect().height ?? 0);
    const maxH = Math.max(...heights);
    setSyncedHeight(prev => (prev !== maxH ? maxH : prev));
  });

  return (
    <div className={styles.holdTimerRow}>
      {fields.map((f, gi) => (
        <HoldTimerInput
          key={f.name || gi}
          visibleName={f.label || f.name}
          internalName={f.name}
          buttonLabel={f.buttonLabel}
          buttonColor={f.buttonColor}
          precision={f.precision}
          min={f.min}
          max={f.max}
          inline
          minButtonHeight={syncedHeight}
          buttonWrapRef={el => { buttonWrapRefs.current[gi] = el; }}
        />
      ))}
    </div>
  );
}

export default function DynamicFormRenderer({
  config,
  noShow,
  setNoShow,
  breakdown,
  setBreakdown,
  defense,
  setDefense,
  gameId,
  afterBasicsSlot,
}) {
  // Generic state for any collapsible whose trigger isn't a named prop above
  const [collapsibleStates, setCollapsibleStates] = useState({});
  const setCollapsibleState = useCallback((name, value) => {
    setCollapsibleStates((prev) => ({ ...prev, [name]: value }));
  }, []);
  if (!config) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
        No game configuration loaded
      </div>
    );
  }

  // Helper to check if a section should be visible
  const shouldShowSection = (section) => {
    // Hidden sections should never render on the scouting form
    if (section.hidden) return false;

    if (!section.showWhen) return true;

    const { field, equals } = section.showWhen;

    if (field === 'noshow') return noShow === equals;
    if (field === 'breakdown') return breakdown === equals;
    if (field === 'defense') return defense === equals;

    return true;
  };

  // Render a single field based on its type
  const renderField = (field, index) => {
    if (!field) return null;

    const key = field.name || field.id || `field-${index}`;

    switch (field.type) {
      case 'checkbox': {
        let changeListener = undefined;
        if (field.name === 'noshow') {
          changeListener = (e) => setNoShow(e.target.checked);
        } else if (field.name === 'breakdown') {
          changeListener = (e) => setBreakdown(e.target.checked);
        } else if (field.name === 'defense') {
          changeListener = (e) => setDefense(e.target.checked);
        } else if (field._isCollapsibleTrigger) {
          changeListener = (e) => setCollapsibleState(field.name, e.target.checked);
        }

        return (
          <Checkbox
            key={key}
            visibleName={field.label}
            internalName={field.name}
            changeListener={changeListener}
            errorStyle={field.errorStyle}
          />
        );
      }

      case 'counter':
      case 'number':
        return (
          <div key={key}>
            {field.subHeader && <SubHeader subHeaderName={field.subHeader} />}
            <NumericInput
              visibleName={field.label}
              internalName={field.name}
              pieceType={field.variant || 'Counter'}
              min={field.min}
              max={field.max}
              quickButtons={field.quickButtons}
            />
          </div>
        );

      case 'holdTimer':
        return (
          <HoldTimerInput
            key={key}
            visibleName={field.label || field.name}
            internalName={field.name}
            buttonLabel={field.buttonLabel}
            buttonColor={field.buttonColor}
            precision={field.precision}
            min={field.min}
            max={field.max}
          />
        );

      case 'text':
        return (
          <TextInput
            key={key}
            visibleName={field.label}
            internalName={field.name}
            type={field.inputType || 'text'}
          />
        );

      case 'comment':
        return (
          <CommentBox
            key={key}
            visibleName={field.label}
            internalName={field.name}
          />
        );

      case 'singleSelect':
        return (
          <div key={key}>
            {field.subHeader && <SubHeader subHeaderName={field.subHeader} />}
            <SingleSelect
              options={field.options}
              internalName={field.name}
            />
          </div>
        );

      case 'imageSelect':
        return (
          <div key={key}>
            {field.subHeader && <SubHeader subHeaderName={field.subHeader} />}
            <ImageSelect
              options={field.options}
              internalName={field.name}
              imageTag={field.imageTag}
              optionLayout={field.optionLayout}
              required={field.required}
              gameId={gameId}
            />
          </div>
        );

      case 'multiSelect':
        return (
          <div key={key}>
            {field.subHeader && <SubHeader subHeaderName={field.subHeader} />}
            <MultiSelect
              options={field.options}
            />
          </div>
        );

      case 'starRating':
      case 'qualitative':
        return (
          <Qualitative
            key={key}
            visibleName={field.label}
            internalName={field.name}
            description={field.description}
            minWhenVisible={field.minWhenVisible}
            max={field.max || 6}
            zeroLabel={field.zeroLabel}
            ratingLabels={field.ratingLabels}
          />
        );

      case 'table':
        return renderTable(field, key);

      case 'collapsible':
        return renderCollapsible(field, key);

      default:
        console.warn(`Unknown field type: ${field.type}`);
        return null;
    }
  };

  // Render a list of fields, grouping consecutive inline holdTimers into a flex row
  const renderSectionFields = (fields, prefix = 'field') => {
    const result = [];
    let i = 0;
    while (i < fields.length) {
      const field = fields[i];
      if (field?.type === 'holdTimer' && field.inline) {
        const group = [];
        while (i < fields.length && fields[i]?.type === 'holdTimer' && fields[i].inline) {
          group.push(fields[i]);
          i++;
        }
        result.push(
          <InlineTimerGroup
            key={`${prefix}-inline-group-${i}`}
            fields={group}
            groupKey={`${prefix}-inline-group-${i}`}
          />
        );
      } else {
        result.push(renderField(field, `${prefix}-${i}`));
        i++;
      }
    }
    return result;
  };

  // Render a table structure
  const renderTable = (tableField, key) => {
    if (!tableField.rows) return null;

    return (
      <div key={key}>
        {tableField.subHeader && <SubHeader subHeaderName={tableField.subHeader} />}
        <table className={styles.Table}>
          <thead>
            <tr>
              {tableField.columns?.map((col, i) => (
                <th key={i}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableField.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <td>{row.label}</td>
                {row.fields?.map((field, fieldIndex) => (
                  <td key={fieldIndex}>
                    {renderField(field, `${key}-${rowIndex}-${fieldIndex}`)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // Render a collapsible section
  const renderCollapsible = (collapsibleField, key) => {
    const trigger = collapsibleField.trigger;
    const content = collapsibleField.content || [];

    let isExpanded = false;
    if (trigger?.name === 'defense') isExpanded = defense;
    else if (trigger?.name === 'breakdown') isExpanded = breakdown;
    else if (trigger?.name) isExpanded = !!collapsibleStates[trigger.name];

    // Tag the trigger so its checkbox handler knows to update collapsibleStates
    const taggedTrigger = trigger && trigger.name !== 'defense' && trigger.name !== 'breakdown' && trigger.name !== 'noshow'
      ? { ...trigger, _isCollapsibleTrigger: true }
      : trigger;

    const collapsibleClass = `${styles.collapsibleBox}${trigger?.errorStyle && isExpanded ? ` ${styles.collapsibleBoxError}` : ''}`;

    return (
      <div key={key} className={collapsibleClass}>
        {taggedTrigger && renderField(taggedTrigger, `${key}-trigger`)}
        {isExpanded && content.map((field, i) => renderField(field, `${key}-content-${i}`))}
      </div>
    );
  };

  return (
    <>
      {/* Render basics section (No Show, etc.) — always accessible */}
      {config.basics?.fields && (
        <div className={styles.BasicsSection}>
          {config.basics.fields.map((field, i) => renderField(field, `basics-${i}`))}
        </div>
      )}

      {/* Slot between basics and sections (used for MatchPrediction) */}
      {afterBasicsSlot}

      <div>
      {config.sections?.map((section, sectionIndex) => {
        if (!shouldShowSection(section)) return null;

        return (
          <div key={section.id || `section-${sectionIndex}`} className={styles.SectionWrapper}>
            {section.header && <Header headerName={section.header} />}
            <div className={styles.SectionContent}>
              {renderSectionFields(section.fields || [], section.id || `section-${sectionIndex}`)}
            </div>
          </div>
        );
      })}
      </div>
    </>
  );
}
