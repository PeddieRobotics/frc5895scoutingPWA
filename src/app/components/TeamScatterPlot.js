'use client';

import { memo, useState, useMemo } from "react";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import styles from "./TeamScatterPlot.module.css";

const DOT_RADIUS = 18;
const BASE_COLOR = '#c48a0a';
const HIGHLIGHT_COLOR = '#2563eb';

const CustomTooltip = ({ active, payload, xLabel, yLabel }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className={styles.customTooltip}>
        <p className={styles.tooltipTeam}>{`Team: ${data.team}`}</p>
        <p>{`${xLabel}: ${typeof data.x === 'number' ? data.x.toFixed(3) : data.x}`}</p>
        <p>{`${yLabel}: ${typeof data.y === 'number' ? data.y.toFixed(3) : data.y}`}</p>
      </div>
    );
  }
  return null;
};

// Defined outside the component so the reference is stable across renders
function makeDotRenderer(highlightedTeams, handleTeamClick) {
  return function DotShape(props) {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null || isNaN(cx) || isNaN(cy)) return null;
    const isHighlighted = highlightedTeams.includes(String(payload.team));
    const fill = isHighlighted ? HIGHLIGHT_COLOR : BASE_COLOR;
    const teamStr = String(payload.team ?? '');
    // Shrink font slightly for longer team numbers
    const fontSize = teamStr.length > 4 ? 7 : teamStr.length > 3 ? 8 : 9;
    return (
      <g
        onClick={() => handleTeamClick(payload)}
        style={{ cursor: 'pointer' }}
      >
        <circle cx={cx} cy={cy} r={DOT_RADIUS} fill={fill} fillOpacity={0.88} />
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={fontSize}
          fontFamily="Montserrat, sans-serif"
          fontWeight="700"
          fill="#fff"
          pointerEvents="none"
        >
          {teamStr}
        </text>
      </g>
    );
  };
}

const TeamScatterPlot = memo(function TeamScatterPlot({ teamData, isAuthenticated, xLabel, yLabel }) {
  const [teamHighlight, setTeamHighlight] = useState('');

  const highlightedTeams = useMemo(() => {
    if (!teamHighlight.trim()) return [];
    return teamHighlight.split(',').map(v => v.trim()).filter(Boolean);
  }, [teamHighlight]);

  const handleTeamClick = (data) => {
    if (!isAuthenticated) return;
    if (window.innerWidth > 768) {
      window.open(`/team-view?team=${data.team}`, '_blank');
    }
  };

  // Stable shape renderer — recreated only when highlight list or click handler changes
  const dotShape = useMemo(
    () => makeDotRenderer(highlightedTeams, handleTeamClick),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [highlightedTeams]
  );

  const title = `${xLabel} vs ${yLabel}`;

  if (!isAuthenticated) {
    return (
      <div className={styles.container}>
        <h2 className={styles.title}>{title}</h2>
        <div className={styles.emptyState}>Authentication required to view this data</div>
      </div>
    );
  }

  if (!teamData || teamData.length === 0) {
    return (
      <div className={styles.container}>
        <h2 className={styles.title}>{title}</h2>
        <div className={styles.emptyState}>Loading team data…</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>{title}</h2>
      <div className={styles.filterRow}>
        <input
          type="text"
          placeholder="Highlight teams (comma separated)"
          value={teamHighlight}
          onChange={(e) => setTeamHighlight(e.target.value)}
          className={styles.filterInput}
        />
      </div>
      <ResponsiveContainer width="100%" height={400}>
        <ScatterChart margin={{ top: 24, right: 24, bottom: 36, left: 24 }}>
          <CartesianGrid stroke="rgba(160,124,48,0.15)" strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="x"
            name={xLabel}
            label={{ value: xLabel, position: 'bottom', offset: 0, fill: 'rgba(13,31,53,0.55)', fontFamily: 'Montserrat', fontSize: 12 }}
            tick={{ fill: 'rgba(13,31,53,0.55)', fontFamily: 'Montserrat', fontSize: 11 }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name={yLabel}
            label={{ value: yLabel, angle: -90, position: 'insideLeft', fill: 'rgba(13,31,53,0.55)', fontFamily: 'Montserrat', fontSize: 12 }}
            tick={{ fill: 'rgba(13,31,53,0.55)', fontFamily: 'Montserrat', fontSize: 11 }}
          />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            content={<CustomTooltip xLabel={xLabel} yLabel={yLabel} />}
          />
          <Scatter
            name="Teams"
            data={teamData}
            shape={dotShape}
            isAnimationActive={false}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}, (prev, next) => {
  if (prev.isAuthenticated !== next.isAuthenticated) return false;
  if (prev.xLabel !== next.xLabel || prev.yLabel !== next.yLabel) return false;
  if (prev.teamData !== next.teamData) return false;
  return true;
});

export default TeamScatterPlot;
