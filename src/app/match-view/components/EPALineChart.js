"use client";
import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function EPALineChart({ 
  data, 
  color = "#116677", 
  width = 380, 
  height = 275 
}) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) return null;

  // Custom tooltip component to prevent text overflow
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{
          background: '#0d1f35',
          border: '1px solid rgba(189,151,72,0.6)',
          padding: '10px',
          borderRadius: '8px',
          minWidth: '150px',
          fontFamily: 'Montserrat',
          fontSize: '13px',
          color: '#e8d5a3',
        }}>
          <p style={{ margin: '0', fontWeight: '700' }}>{label}</p>
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

  return (
    <div style={{ touchAction: 'pan-y', width: '100%' }}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data}>
          <XAxis dataKey="name" tick={{ fill: 'rgba(13,31,53,0.55)', fontFamily: 'Montserrat', fontSize: 11 }} />
          <YAxis tick={{ fill: 'rgba(13,31,53,0.55)', fontFamily: 'Montserrat', fontSize: 11 }} />
          <CartesianGrid stroke="rgba(160,124,48,0.15)" strokeDasharray="5 5" />
          <Line type="monotone" dataKey="blue" stroke="#2563eb" strokeWidth="2" />
          <Line type="monotone" dataKey="red" stroke="#c0392b" strokeWidth="2" />
          <Tooltip content={<CustomTooltip />} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
