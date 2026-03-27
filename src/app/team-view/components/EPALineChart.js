"use client";
import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function EPALineChart({
  label,
  displayLabel,
  data,
  color = "#a07c30",
  width = 350,
  height = 175,
  responsive = false,
}) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) return null;

  // Custom tooltip component to prevent text overflow
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const matchNumber = payload[0]?.payload?.match || label;
      return (
        <div style={{
          background: '#0d1f35',
          border: '1px solid rgba(189,151,72,0.6)',
          padding: '10px',
          borderRadius: '8px',
          minWidth: '120px',
          fontFamily: 'Montserrat',
          fontSize: '13px',
          color: '#e8d5a3',
        }}>
          <p style={{ margin: '0', fontWeight: '700' }}>{`Match: ${matchNumber}`}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ margin: '0', color: '#e8d5a3' }}>
              {`${entry.name}: ${Math.round(entry.value * 10) / 10}`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const chart = (
    <LineChart width={responsive ? undefined : width} height={height} data={data}>
      <XAxis type="number" dataKey="match" tick={{ fill: 'rgba(13,31,53,0.55)', fontFamily: 'Montserrat', fontSize: 11 }} />
      <YAxis dataKey={label} tick={{ fill: 'rgba(13,31,53,0.55)', fontFamily: 'Montserrat', fontSize: 11 }} />
      <CartesianGrid strokeDasharray="3 3" stroke="rgba(160,124,48,0.15)" />
      <Tooltip content={<CustomTooltip />} />
      <Line type="monotone" dataKey={label} name={displayLabel || label} stroke={color} strokeWidth="3"/>
    </LineChart>
  );

  if (responsive) {
    return (
      <div style={{ touchAction: 'pan-y', width: '100%' }}>
        <ResponsiveContainer width="100%" height={height}>{chart}</ResponsiveContainer>
      </div>
    );
  }

  return <div style={{ touchAction: 'pan-y' }}>{chart}</div>;
}