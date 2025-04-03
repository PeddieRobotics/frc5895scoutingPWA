"use client";
import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

export default function CoralLineChart({ 
  data,
  title = "Coral Placement",
  width = 350, 
  height = 175 
}) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) return null;

  // Get fixed y-axis values
  const getYAxisProps = () => {
    if (!data || data.length === 0) return { domain: [0, 3], ticks: [0, 1, 2, 3] };
    
    const maxValues = data.map(entry => 
      Math.max(
        entry.L1 || 0,
        entry.L2 || 0,
        entry.L3 || 0,
        entry.L4 || 0
      )
    );
    
    const maxY = Math.max(...maxValues);
    
    // Round up max to next integer and add a bit of padding
    const yMax = Math.ceil(maxY + 0.5);
    
    // Create ticks based on yMax
    let ticks;
    if (yMax <= 3) {
      ticks = Array.from({length: yMax + 1}, (_, i) => i); // [0,1,2,3]
    } else if (yMax <= 5) {
      ticks = Array.from({length: yMax + 1}, (_, i) => i); // [0,1,2,3,4,5]
    } else if (yMax <= 10) {
      ticks = Array.from({length: 6}, (_, i) => Math.round(i * yMax / 5)); // [0,2,4,6,8,10]
    } else {
      const step = Math.ceil(yMax / 5);
      ticks = Array.from({length: 6}, (_, i) => i * step); // Evenly spaced 6 ticks
    }
    
    return { domain: [0, yMax], ticks };
  };

  // Format data for categorical x-axis
  const formattedData = data.map(item => ({
    ...item,
    matchLabel: item.match.toString() // Convert match number to string for categorical axis
  }));

  // Custom tooltip styles to make it larger and more visible
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

  // Fixed line configuration with correct colors
  const lineConfigs = [
    { id: "L4", name: "L4", color: "#ff8042", dataKey: "L4" },  // purple
    { id: "L3", name: "L3", color: "#ffc658", dataKey: "L3" },  // yellow
    { id: "L2", name: "L2", color: "#82ca9d", dataKey: "L2" }, // green
    { id: "L1", name: "L1", color: "#8884d8", dataKey: "L1" }   // orange
  ];

  // Get Y-axis props
  const yAxisProps = getYAxisProps();

  return (
    <div>
      <LineChart 
        width={width} 
        height={height - 25} 
        data={formattedData}
        margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
      >
        <XAxis 
          type="category" 
          dataKey="matchLabel"
          label={{ value: 'Match', position: 'insideBottomRight', offset: -5 }}
          allowDecimals={false}
        />
        <YAxis 
          domain={yAxisProps.domain}
          ticks={yAxisProps.ticks} 
          allowDecimals={false}
        />
        <CartesianGrid strokeDasharray="3 3" />
        <Tooltip content={<CustomTooltip />} />
        {lineConfigs.map(config => (
          <Line 
            key={config.id}
            type="linear" 
            dataKey={config.dataKey} 
            name={config.name} 
            stroke={config.color} 
            strokeWidth="2"
          />
        ))}
      </LineChart>
    </div>
  );
} 