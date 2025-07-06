'use client';
import { useState, useEffect } from 'react';
import { VictoryPie } from "victory";

export default function Endgame({ colors, endgameData }) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return null;
  }

  return (
    <VictoryPie
      padding={100}
      data={endgameData}
      colorScale={colors}
      labels={({ datum }) => datum.y > 0 ? `${datum.x}: ${Math.round(datum.y)}%` : null}
      style={{
        data: {
          stroke: '#000', // Black border
          strokeWidth: 1.5, // Border width
        },
        labels: {
          fontFamily: "'Montserrat', sans-serif",
          fill: "black"
        }
      }}
    />
  );
}