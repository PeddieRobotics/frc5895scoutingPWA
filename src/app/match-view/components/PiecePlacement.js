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

  const anyDataPresent = displayData.some(value => value > 0);

  console.log('Rendering PiecePlacement:', typeof window !== 'undefined' ? 'Client' : 'Server');

  useEffect(() => {
    // Destroy existing chart if it exists
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const ctx = chartRef.current.getContext('2d');
    if (ctx) {
      if (!anyDataPresent) {
        // Draw "N/A" text when no data is present
        ctx.clearRect(0, 0, chartRef.current.width, chartRef.current.height);
        ctx.font = '20px Arial';
        ctx.fillStyle = 'gray';
        ctx.textAlign = 'center';
        ctx.fillText('N/A - No Data Available', chartRef.current.width / 2, chartRef.current.height / 2);
      } else {
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
    }

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [L1, L2, L3, L4, net, processor, HP, matchMax, colors, anyDataPresent]);

  return <canvas ref={chartRef} />;
}
