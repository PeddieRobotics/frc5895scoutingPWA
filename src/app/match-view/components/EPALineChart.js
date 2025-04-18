"use client";
import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

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
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          border: '1px solid #ccc',
          padding: '10px',
          borderRadius: '5px',
          minWidth: '150px'
        }}>
          <p style={{ margin: '0', fontWeight: 'bold' }}>{label}</p>
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
      <XAxis dataKey="name"/>
      <YAxis/>
      <CartesianGrid stroke="#eee" strokeDasharray="5 5" />
      <Line type="monotone" dataKey="blue" stroke="#99ADEF" />
      <Line type="monotone" dataKey="red" stroke="#EDB3BA" />
      <Tooltip content={<CustomTooltip />} />
    </LineChart>
  );
}
