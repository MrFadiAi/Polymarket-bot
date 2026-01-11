interface SparklineProps {
    data: number[];
    width?: number;
    height?: number;
    color?: 'green' | 'red' | 'blue' | 'purple' | 'auto';
    showDots?: boolean;
    filled?: boolean;
}

export function Sparkline({
    data,
    width = 100,
    height = 32,
    color = 'auto',
    showDots = false,
    filled = true,
}: SparklineProps) {
    if (data.length < 2) {
        return (
            <div
                className="flex items-center justify-center text-gray-600 text-xs"
                style={{ width, height }}
            >
                No data
            </div>
        );
    }

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    // Determine color based on trend
    const trend = data[data.length - 1] - data[0];
    const resolvedColor = color === 'auto'
        ? (trend >= 0 ? 'green' : 'red')
        : color;

    const colorMap = {
        green: { stroke: '#10b981', fill: 'rgba(16, 185, 129, 0.2)' },
        red: { stroke: '#ef4444', fill: 'rgba(239, 68, 68, 0.2)' },
        blue: { stroke: '#3b82f6', fill: 'rgba(59, 130, 246, 0.2)' },
        purple: { stroke: '#8b5cf6', fill: 'rgba(139, 92, 246, 0.2)' },
    };

    const colors = colorMap[resolvedColor];
    const padding = 2;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    // Generate path
    const points = data.map((value, index) => {
        const x = padding + (index / (data.length - 1)) * chartWidth;
        const y = padding + chartHeight - ((value - min) / range) * chartHeight;
        return { x, y };
    });

    const linePath = points
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
        .join(' ');

    const areaPath = filled
        ? `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${height - padding} L ${padding} ${height - padding} Z`
        : '';

    return (
        <svg width={width} height={height} className="overflow-visible">
            {/* Gradient definition */}
            <defs>
                <linearGradient id={`sparkline-gradient-${resolvedColor}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colors.stroke} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={colors.stroke} stopOpacity="0" />
                </linearGradient>
            </defs>

            {/* Filled area */}
            {filled && (
                <path
                    d={areaPath}
                    fill={`url(#sparkline-gradient-${resolvedColor})`}
                />
            )}

            {/* Line */}
            <path
                d={linePath}
                fill="none"
                stroke={colors.stroke}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />

            {/* Dots */}
            {showDots && points.map((p, i) => (
                <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={i === points.length - 1 ? 3 : 2}
                    fill={i === points.length - 1 ? colors.stroke : 'transparent'}
                    stroke={colors.stroke}
                    strokeWidth="1"
                />
            ))}

            {/* End dot (always show) */}
            <circle
                cx={points[points.length - 1].x}
                cy={points[points.length - 1].y}
                r="2.5"
                fill={colors.stroke}
                className="animate-pulse"
            />
        </svg>
    );
}
