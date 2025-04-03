"use client";
import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

export default function EPALineChart({ 
  label,
  data, 
  color = "#116677", 
  width = 350, 
  height = 175 
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
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          border: '1px solid #ccc',
          padding: '10px',
          borderRadius: '5px',
          minWidth: '150px'
        }}>
          <p style={{ margin: '0', fontWeight: 'bold' }}>{`Match: ${matchNumber}`}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ margin: '0', color: entry.color }}>
              {`${entry.name}: ${Math.round(entry.value * 10) / 10}`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <LineChart width={width} height={height} data={data}>
      <XAxis type="number" dataKey="match"/>
      <YAxis dataKey={label}/>
      <CartesianGrid strokeDasharray="3 3" />
      <Tooltip content={<CustomTooltip />} />
      <Line type="monotone" dataKey={label} stroke={color} strokeWidth="3"/>
    </LineChart>
  );
}