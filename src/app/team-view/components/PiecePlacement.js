'use client';
import { useEffect, useRef, useState } from 'react';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

/**
 * Generic bar chart component.
 * @param {{ bars: Array<{ label: string, value: number }> }} props
 */
export default function PiecePlacement({ bars = [] }) {
  const [isClient, setIsClient] = useState(false);
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  useEffect(() => {
    setIsClient(true);
  }, []);
  useEffect(() => {
    if (isClient && chartRef.current) {
      // Destroy existing chart if it exists
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
      const ctx = chartRef.current.getContext('2d');

      if (ctx) {
        chartInstance.current = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: bars.map(b => b.label),
            datasets: [{
              label: 'Piece Placement',
              data: bars.map(b => b.value),
              backgroundColor: "#76E3D3",
              borderColor: "#18a9a2",
              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            scales: {
              y: {
                beginAtZero: true,
              }
            },
            plugins: {
              legend: {
                display: false
              }
            }
          }
        });
      }
    }
    // Cleanup on unmount
    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [isClient, bars]);
  if (!isClient) {
    return null;
  }
  return <canvas ref={chartRef} />;
}