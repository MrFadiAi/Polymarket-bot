import { useEffect, useRef, useState } from 'react';

interface AnimatedCounterProps {
    value: number;
    prefix?: string;
    suffix?: string;
    decimals?: number;
    duration?: number;
    className?: string;
    colorize?: boolean; // true = green for positive, red for negative
}

export function AnimatedCounter({
    value,
    prefix = '',
    suffix = '',
    decimals = 2,
    duration = 500,
    className = '',
    colorize = false,
}: AnimatedCounterProps) {
    const [displayValue, setDisplayValue] = useState(value);
    const previousValue = useRef(value);
    const animationRef = useRef<number>();

    useEffect(() => {
        const startValue = previousValue.current;
        const endValue = value;
        const startTime = performance.now();

        const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Ease out cubic for smooth deceleration
            const easeOut = 1 - Math.pow(1 - progress, 3);
            const current = startValue + (endValue - startValue) * easeOut;

            setDisplayValue(current);

            if (progress < 1) {
                animationRef.current = requestAnimationFrame(animate);
            } else {
                previousValue.current = endValue;
            }
        };

        animationRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [value, duration]);

    const formattedValue = Math.abs(displayValue).toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });

    const sign = displayValue >= 0 ? '+' : '-';
    const displayPrefix = colorize ? sign : prefix;

    const colorClass = colorize
        ? displayValue >= 0
            ? 'text-green-400'
            : 'text-red-400'
        : '';

    return (
        <span className={`font-mono tabular-nums transition-colors ${colorClass} ${className}`}>
            {displayPrefix}
            {colorize ? '' : prefix}
            {formattedValue}
            {suffix}
        </span>
    );
}
