'use client';
import { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

/**
 * Generic piece placement chart for match-view.
 * @param {{
 *  colors: string[],
 *  matchMax: number,
 *  bars: Array<{ label: string, value: number | null }>
 * }} props
 */
export default function PiecePlacement({ colors, matchMax, bars = [] }) {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  const labels = bars.map((bar) => bar.label);
  const values = bars.map((bar) => (bar.value == null ? 0 : bar.value));
  const anyDataPresent = bars.some((bar) => bar.value != null && bar.value > 0);

  if (!bars.length || !anyDataPresent) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '200px',
          fontSize: '18px',
          color: '#666',
          fontFamily: 'Arial, sans-serif'
        }}
      >
        No data available
      </div>
    );
  }

  useEffect(() => {
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const ctx = chartRef.current?.getContext('2d');
    if (!ctx) return;

    chartInstance.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            data: values,
            backgroundColor: colors?.[0] || '#B7D1F7',
            borderColor: colors?.[2] || '#5E6CB5',
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
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (context) {
                const originalValue = bars[context.dataIndex]?.value;
                return originalValue == null ? 'N/A' : context.formattedValue;
              },
            },
          },
        },
      },
    });

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [bars, labels, values, matchMax, colors]);

  return <canvas ref={chartRef} style={{ touchAction: 'pan-y' }} />;
}

