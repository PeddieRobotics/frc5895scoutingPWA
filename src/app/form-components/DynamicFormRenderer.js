/**
 * DynamicFormRenderer - Renders form fields dynamically from JSON config
 */
import React from 'react';
import Header from './Header';
import SubHeader from './SubHeader';
import TextInput from './TextInput';
import NumericInput from './NumericInput';
import Checkbox from './Checkbox';
import CommentBox from './CommentBox';
import EndPlacement from './EndPlacement';
import IntakeOptions from './IntakeOptions';
import Qualitative from './Qualitative';
import styles from '../page.module.css';

export default function DynamicFormRenderer({
  config,
  noShow,
  setNoShow,
  breakdown,
  setBreakdown,
  defense,
  setDefense
}) {
  if (!config) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
        No game configuration loaded
      </div>
    );
  }

  // Helper to check if a section should be visible
  const shouldShowSection = (section) => {
    if (!section.showWhen) return true;

    const { field, equals } = section.showWhen;

    // Map field names to their state values
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
      case 'checkbox':
        // Create change listener for state-tracked checkboxes
        let changeListener = undefined;
        if (field.name === 'noshow') {
          changeListener = (e) => setNoShow(e.target.checked);
        } else if (field.name === 'breakdown') {
          changeListener = (e) => setBreakdown(e.target.checked);
        } else if (field.name === 'defense') {
          changeListener = (e) => setDefense(e.target.checked);
        }

        return (
          <Checkbox
            key={key}
            visibleName={field.label}
            internalName={field.name}
            changeListener={changeListener}
          />
        );

      case 'counter':
      case 'number':
        return (
          <NumericInput
            key={key}
            internalName={field.name}
            pieceType={field.variant || 'Counter'}
            min={field.min}
            max={field.max}
            quickButtons={field.quickButtons}
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
        // For singleSelect, use EndPlacement component or create a generic one
        if (field.name === 'endlocation' || field.formName === 'stageplacement') {
          return <EndPlacement key={key} />;
        }
        // For other single selects, we'd need a generic component
        return null;

      case 'multiSelect':
        // Handle multiSelect - use IntakeOptions or create generic
        if (field.name === 'intakeOptions') {
          return <IntakeOptions key={key} />;
        }
        // For generic multiSelect, render as checkboxes
        return (
          <div key={key}>
            {field.subHeader && <SubHeader subHeaderName={field.subHeader} />}
            {field.options?.map((opt, i) => (
              <Checkbox
                key={opt.name}
                visibleName={opt.label}
                internalName={opt.name}
              />
            ))}
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
            max={field.max || 6}
            minWhenVisible={field.minWhenVisible}
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

    // Determine which state to use based on trigger field name
    let isExpanded = false;
    if (trigger?.name === 'defense') isExpanded = defense;
    if (trigger?.name === 'breakdown') isExpanded = breakdown;

    return (
      <div key={key}>
        {trigger && renderField(trigger, `${key}-trigger`)}
        {isExpanded && (
          <div className={styles.collapsibleContent}>
            {content.map((field, i) => renderField(field, `${key}-content-${i}`))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Render basics section */}
      {config.basics?.fields && (
        <div className={styles.BasicsSection}>
          {config.basics.fields.map((field, i) => renderField(field, `basics-${i}`))}
        </div>
      )}

      {/* Render all sections */}
      {config.sections?.map((section, sectionIndex) => {
        if (!shouldShowSection(section)) return null;

        return (
          <div key={section.id || `section-${sectionIndex}`} className={styles.SectionWrapper}>
            {section.header && <Header headerName={section.header} />}
            <div className={styles.SectionContent}>
              {section.fields?.map((field, fieldIndex) =>
                renderField(field, `${section.id}-${fieldIndex}`)
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
