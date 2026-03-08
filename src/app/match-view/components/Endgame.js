'use client';
import { useState, useEffect } from 'react';
import { VictoryPie, VictoryContainer } from "victory";

export default function Endgame({ colors, endgameData }) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return null;
  }

  return (
    <div style={{ touchAction: 'pan-y', width: '100%', height: '100%', overflow: 'hidden' }}>
      <VictoryPie
        padding={60}
        containerComponent={<VictoryContainer responsive={true} style={{ height: '100%' }} />}
        data={endgameData}
        colorScale={colors}
        labels={({ datum }) => datum.y > 0 ? `${datum.x}: ${Math.round(datum.y)}%` : null}
        style={{
          data: {
            stroke: '#000',
            strokeWidth: 1.5,
          },
          labels: {
            fontFamily: "'Montserrat', sans-serif",
            fill: "black"
          }
        }}
      />
    </div>
  );
}