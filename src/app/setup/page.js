"use client";
import { useEffect, useState } from 'react';
import styles from '../page.module.css';

export default function SetupPage() {
  const [themes, setThemes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState({
    year: new Date().getFullYear(),
    themeName: '',
    eventCode: '',
    eventName: '',
    eventTable: '',
    config: ''
  });

  const exampleConfig = JSON.stringify({
    game: "reefscape2025",
    sections: { auto: true, tele: true },
    teamsCount: 3,
    autoFields: [
      { type: 'checkbox', label: 'Leave', name: 'leave' }
    ],
    teleFields: [],
    teamFields: [
      { type: 'number', label: 'Team Scouted', name: 'team' },
      { type: 'checkbox', label: 'No Show', name: 'noshow' },
      { type: 'comment', label: 'General Comments', name: 'generalcomments' }
    ],
    counters: {
      auto: [
        { title: 'Coral', rows: [
          { label: 'L4', success: 'autol4success', fail: 'autol4fail' },
          { label: 'L3', success: 'autol3success', fail: 'autol3fail' },
          { label: 'L2', success: 'autol2success', fail: 'autol2fail' },
          { label: 'L1', success: 'autol1success', fail: 'autol1fail' }
        ]},
        { title: 'Algae Removed', rows: [
          { label: '', success: 'autoalgaeremoved', fail: null }
        ]},
        { title: 'Processor', rows: [
          { label: '', success: 'autoprocessorsuccess', fail: 'autoprocessorfail' }
        ]},
        { title: 'Net', rows: [
          { label: '', success: 'autonetsuccess', fail: 'autonetfail' }
        ]}
      ],
      tele: [
        { title: 'Coral', rows: [
          { label: 'L4', success: 'telel4success', fail: 'telel4fail' },
          { label: 'L3', success: 'telel3success', fail: 'telel3fail' },
          { label: 'L2', success: 'telel2success', fail: 'telel2fail' },
          { label: 'L1', success: 'telel1success', fail: 'telel1fail' }
        ]},
        { title: 'Algae Removed', rows: [
          { label: '', success: 'telealgaeremoved', fail: null }
        ]},
        { title: 'Processor', rows: [
          { label: '', success: 'teleprocessorsuccess', fail: 'teleprocessorfail' }
        ]},
        { title: 'Net', rows: [
          { label: '', success: 'telenetsuccess', fail: 'telenetfail' }
        ]}
      ]
    },
    endgame: {
      type: 'singleSelect',
      label: 'Stage Placement',
      name: 'stageplacement',
      options: [
        { label: 'None', value: 0 },
        { label: 'Park', value: 1 },
        { label: 'Fail + Park', value: 2 },
        { label: 'Shallow Cage', value: 3 },
        { label: 'Deep Cage', value: 4 }
      ],
      default: 0
    },
    postMatchIntake: {
      type: 'multiSelect',
      label: 'Intake Capabilities',
      options: [
        { label: 'Coral Ground', name: 'coralgrndintake' },
        { label: 'Coral Station', name: 'coralstationintake' },
        { label: 'Algae Ground', name: 'algaegrndintake' },
        { label: 'Algae High Reef', name: 'algaehighreefintake' },
        { label: 'Algae Low Reef', name: 'algaelowreefintake' }
      ]
    },
    sortField: 'maneuverability',
    commentFields: ['breakdowncomments', 'defensecomments', 'generalcomments']
  }, null, 2);

  useEffect(() => {
    const init = async () => {
      try {
        await fetch('/api/themes/init', { method: 'POST' });
        await loadThemes();
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const loadThemes = async () => {
    const resp = await fetch('/api/themes');
    const json = await resp.json();
    setThemes(json.items || []);
    const active = (json.items || []).find(t => t.is_active);
    if (active) setSelectedId(active.id);
  };

  const handleCreate = async (activate=false) => {
    try {
      setError('');
      const payload = { ...form, activate };
      if (!payload.config) payload.config = exampleConfig;
      const resp = await fetch('/api/themes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!resp.ok) {
        try {
          const ct = resp.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            const j = await resp.json();
            throw new Error(j.error || `Failed to save theme (${resp.status})`);
          } else {
            const t = await resp.text();
            throw new Error(t || `Failed to save theme (${resp.status})`);
          }
        } catch (e) {
          throw new Error(e.message || 'Failed to save theme');
        }
      }
      await loadThemes();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleActivate = async () => {
    if (!selectedId) return;
    try {
      setError('');
      const resp = await fetch('/api/themes/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedId })
      });
      if (!resp.ok) {
        try {
          const ct = resp.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            const j = await resp.json();
            throw new Error(j.error || `Failed to activate theme (${resp.status})`);
          } else {
            const t = await resp.text();
            throw new Error(t || `Failed to activate theme (${resp.status})`);
          }
        } catch (e) {
          throw new Error(e.message || 'Failed to activate theme');
        }
      }
      await loadThemes();
    } catch (e) {
      setError(e.message);
    }
  };

  if (loading) return <div className={styles.MainDiv}><p>Loading setup…</p></div>;

  const cardStyle = {
    background: '#0e2a46',
    border: '1px solid #1f3e65',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    maxWidth: 920,
    width: '100%'
  };
  const labelStyle = { color: '#bd9748', fontSize: 16, marginBottom: 4 };
  const inputStyle = {
    background: '#092038',
    color: '#fff',
    border: '1px solid #244468',
    borderRadius: 6,
    padding: 10,
    outline: 'none'
  };
  const buttonPrimary = {
    backgroundColor: '#bd9748',
    border: '1px solid #ffa200',
    color: 'black',
    padding: '10px 16px',
    borderRadius: 6,
    cursor: 'pointer'
  };
  const buttonSecondary = {
    backgroundColor: '#1a9e8c',
    border: '1px solid #12766c',
    color: 'white',
    padding: '10px 16px',
    borderRadius: 6,
    cursor: 'pointer'
  };

  return (
    <div className={styles.MainDiv}>
      <h2>Setup</h2>
      {error && (
        <div style={{ ...cardStyle, borderColor: '#7a2b2b', background: '#2a0f0f' }}>
          <strong style={{ color: '#ffb3b3' }}>Error:</strong>
          <div style={{ color: '#ffd6d6' }}>{error}</div>
        </div>
      )}

      <section style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Active Theme</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            value={selectedId || ''}
            onChange={(e) => setSelectedId(Number(e.target.value))}
            style={{ ...inputStyle, minWidth: 420 }}
          >
            {(themes || []).map(t => (
              <option key={t.id} value={t.id}>
                {`${t.year || ''} ${t.theme_name} — ${t.event_name || t.event_code || ''} [${t.event_table}]${t.is_active ? ' (active)' : ''}`}
              </option>
            ))}
          </select>
          <button style={buttonPrimary} onClick={handleActivate}>Activate</button>
        </div>
      </section>

      <section style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Create Theme</h3>
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <div style={labelStyle}>Year</div>
            <input style={{ ...inputStyle, width: '100%' }} placeholder="Year" value={form.year} onChange={e => setForm({ ...form, year: e.target.value })} />
          </div>
          <div>
            <div style={labelStyle}>Theme Name</div>
            <input style={{ ...inputStyle, width: '100%' }} placeholder="Theme Name" value={form.themeName} onChange={e => setForm({ ...form, themeName: e.target.value })} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={labelStyle}>Event Code (TBA, e.g., 2025mil)</div>
              <input style={{ ...inputStyle, width: '100%' }} placeholder="2025mil" value={form.eventCode} onChange={e => setForm({ ...form, eventCode: e.target.value })} />
            </div>
            <div>
              <div style={labelStyle}>Event Name (Display only)</div>
              <input style={{ ...inputStyle, width: '100%' }} placeholder="Michigan Lake District" value={form.eventName} onChange={e => setForm({ ...form, eventName: e.target.value })} />
            </div>
          </div>
          <div>
            <div style={labelStyle}>Event Table (DB table to store/read match rows)</div>
            <input style={{ ...inputStyle, width: '100%' }} placeholder="cmptx2025" value={form.eventTable} onChange={e => setForm({ ...form, eventTable: e.target.value })} />
          </div>
          <div>
            <div style={labelStyle}>Form Config (JSON)</div>
            <textarea rows={14} style={{ ...inputStyle, width: '100%', fontFamily: 'monospace' }} placeholder="formConfig JSON" value={form.config || exampleConfig} onChange={e => setForm({ ...form, config: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={buttonSecondary} onClick={() => handleCreate(false)}>Save</button>
            <button style={buttonPrimary} onClick={() => handleCreate(true)}>Save and Activate</button>
          </div>
        </div>
      </section>
    </div>
  );
}
