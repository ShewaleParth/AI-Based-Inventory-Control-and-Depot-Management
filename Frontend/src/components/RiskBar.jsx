import { useState, useEffect } from 'react';

const THRESHOLDS = [
    { min: 70, color: '#EF4444' },   // Critical — red
    { min: 45, color: '#F59E0B' },   // High — amber
    { min: 25, color: '#EAB308' },   // Medium — yellow
    { min: 0, color: '#22C55E' },   // Low — green
];

export default function RiskBar({ value, label, showValue = true }) {
    const [width, setWidth] = useState(0);

    // Animate bar on mount or value change
    useEffect(() => {
        const t = setTimeout(() => setWidth(value), 80);
        return () => clearTimeout(t);
    }, [value]);

    const barColor = THRESHOLDS.find(t => value >= t.min)?.color ?? '#22C55E';

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
                role='progressbar'
                aria-valuenow={value}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={label}
                style={{ flex: 1, height: 8, background: '#E5E7EB', borderRadius: 4, overflow: 'hidden' }}
            >
                <div style={{
                    width: `${width}%`,
                    height: '100%',
                    borderRadius: 4,
                    background: barColor,
                    transition: 'width 0.75s cubic-bezier(0.4, 0, 0.2, 1)',
                }} />
            </div>
            {showValue && (
                <span style={{ fontSize: 11, fontWeight: 700, color: barColor, minWidth: 26 }}>
                    {value}
                </span>
            )}
        </div>
    );
}
