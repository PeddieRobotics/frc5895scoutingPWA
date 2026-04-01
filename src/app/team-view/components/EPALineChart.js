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
  overlayData = null,   // [{match, value}] or [{match, [overlayField]}]
  overlayField = null,  // key to read from overlayData points ("value", "auto", "tele", "end")
  overlayLabel = "",
  overlayColor = "#1a7f3c",
}) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) return null;

  if (!data || data.length === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'rgba(13,31,53,0.4)', fontFamily: 'Montserrat', fontSize: '13px', margin: 0 }}>
          No data available for this selection.
        </p>
      </div>
    );
  }

  const hasOverlay = overlayData && overlayData.length > 0 && overlayField;

  // Merge overlay data into main data by match number
  const mergedData = hasOverlay ? (() => {
    const overlayMap = {};
    overlayData.forEach(p => { overlayMap[p.match] = p[overlayField] ?? null; });
    return data.map(point => ({
      ...point,
      _overlay: overlayMap[point.match] ?? null,
    }));
  })() : data;

  const CustomTooltip = ({ active, payload, label: matchLabel }) => {
    if (active && payload && payload.length) {
      const matchNumber = payload[0]?.payload?.match || matchLabel;
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
            entry.value != null && (
              <p key={index} style={{ margin: '0' }}>
                {`${entry.name}: ${Math.round(entry.value * 10) / 10}`}
              </p>
            )
          ))}
          {payload[0]?.payload?.scout && (
            <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'rgba(232,213,163,0.6)' }}>
              {payload[0].payload.scout}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  const chart = (
    <LineChart width={responsive ? undefined : width} height={height} data={mergedData}>
      <XAxis type="number" dataKey="match" tick={{ fill: 'rgba(13,31,53,0.55)', fontFamily: 'Montserrat', fontSize: 11 }} />
      <YAxis yAxisId="left" dataKey={label} tick={{ fill: 'rgba(13,31,53,0.55)', fontFamily: 'Montserrat', fontSize: 11 }} />
      {hasOverlay && (
        <YAxis yAxisId="right" orientation="right" tick={{ fill: 'rgba(13,31,53,0.55)', fontFamily: 'Montserrat', fontSize: 11 }} />
      )}
      <CartesianGrid strokeDasharray="3 3" stroke="rgba(160,124,48,0.15)" />
      <Tooltip content={<CustomTooltip />} />
      <Line yAxisId="left" type="monotone" dataKey={label} name={displayLabel || label} stroke={color} strokeWidth="3" />
      {hasOverlay && (
        <Line yAxisId="right" type="monotone" dataKey="_overlay" name={overlayLabel} stroke={overlayColor} strokeWidth={2} strokeDasharray="5 5" dot={{ r: 2, fill: overlayColor }} connectNulls />
      )}
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
