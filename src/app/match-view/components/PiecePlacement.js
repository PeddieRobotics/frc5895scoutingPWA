'use client';
import { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

export default function PiecePlacement({ colors, matchMax, L1, L2, L3, L4, net, processor, HP }) {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  // Transform null values to 0 for chart display
  const displayData = [
    L1 === null ? 0 : L1,
    L2 === null ? 0 : L2,
    L3 === null ? 0 : L3,
    L4 === null ? 0 : L4,
    net === null ? 0 : net,
    processor === null ? 0 : processor,
    HP === null ? 0 : HP
  ];

  // Check if there's any meaningful data (not null and not zero)
  const anyDataPresent = [L1, L2, L3, L4, net, processor, HP].some(value => value !== null && value > 0);

  console.log('Rendering PiecePlacement:', typeof window !== 'undefined' ? 'Client' : 'Server');

  // If no data is present, return a simple text message instead of rendering a chart
  if (!anyDataPresent) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '200px',
        fontSize: '18px',
        color: '#666',
        fontFamily: 'Arial, sans-serif'
      }}>
        No data available
      </div>
    );
  }

  useEffect(() => {
    // Destroy existing chart if it exists
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const ctx = chartRef.current.getContext('2d');
    if (ctx) {
      chartInstance.current = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['L1', 'L2', 'L3', 'L4', 'Net', 'Prcsr', 'HP'],
          datasets: [
            {
              data: displayData,
              backgroundColor: colors[0],
              borderColor: colors[2],
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          scales: {
            y: {
              beginAtZero: true,
              max: matchMax,
            },
          },
          plugins: {
            legend: {
              display: false // Disable the legend entirely
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const index = context.dataIndex;
                  const originalValue = [L1, L2, L3, L4, net, processor, HP][index];
                  return originalValue === null ? 'N/A' : context.formattedValue;
                }
              }
            }
          }
        }
      });
    }

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [L1, L2, L3, L4, net, processor, HP, matchMax, colors]);

  return <canvas ref={chartRef} />;
}
