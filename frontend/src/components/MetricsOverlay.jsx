import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// Angles: 0°=right, 90°=up(CSS top), 180°=left, 270°=bottom
// Left side: upper-left → lower-left arc
const LEFT_ANGLES  = [140, 162, 185, 210];
// Right side: upper-right → lower-right arc (symmetric)
const RIGHT_ANGLES = [40, 18, 352];
const R = 290;
const toRad = deg => (deg * Math.PI) / 180;

function useWindowSize() {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const handle = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', handle);
    return () => window.removeEventListener('resize', handle);
  }, []);
  return size;
}

export default function MetricsOverlay({ metrics, visible, onLabelEnter, onLabelLeave }) {
  const navigate = useNavigate();
  const { w, h } = useWindowSize();
  const allAngles = [...LEFT_ANGLES, ...RIGHT_ANGLES];
  const displayed = metrics.slice(0, 7);
  const cx = w / 2;
  const cy = h / 2;

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      {/* SVG connector lines */}
      <svg
        className="absolute inset-0"
        width={w}
        height={h}
        style={{ overflow: 'visible' }}
      >
        <defs>
          <filter id="lineglow">
            <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {displayed.map((metric, i) => {
          const θ = toRad(allAngles[i]);
          const lx = cx + R * Math.cos(θ);
          const ly = cy - R * Math.sin(θ);
          return (
            <line
              key={metric.id}
              x1={cx} y1={cy}
              x2={lx} y2={ly}
              stroke="#2dd4bf"
              strokeWidth="0.8"
              strokeOpacity={visible ? 0.28 : 0}
              filter="url(#lineglow)"
              style={{ transition: 'stroke-opacity 0.45s ease' }}
            />
          );
        })}
      </svg>

      {/* Labels */}
      {displayed.map((metric, i) => {
        const θ = toRad(allAngles[i]);
        const xOff = R * Math.cos(θ);
        const yOff = R * Math.sin(θ);
        const isLeft = i < 4;

        return (
          <MetricLabel
            key={metric.id}
            metric={metric}
            cx={cx}
            cy={cy}
            xOff={xOff}
            yOff={yOff}
            isLeft={isLeft}
            visible={visible}
            onNavigate={() => navigate(`/metric/${metric.id}`)}
            onEnter={onLabelEnter}
            onLeave={onLabelLeave}
          />
        );
      })}
    </div>
  );
}

function MetricLabel({ metric, cx, cy, xOff, yOff, isLeft, visible, onNavigate, onEnter, onLeave }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={`metric-label ${visible ? 'metric-label-visible' : 'metric-label-hidden'}`}
      style={{
        position: 'absolute',
        left: cx + xOff,
        top: cy - yOff,
        transform: `translate(${isLeft ? '-100%' : '0%'}, -50%)`,
        paddingLeft: isLeft ? 0 : '10px',
        paddingRight: isLeft ? '10px' : 0,
      }}
      onMouseEnter={() => { setHovered(true); onEnter?.(); }}
      onMouseLeave={() => { setHovered(false); onLeave?.(); }}
      onClick={onNavigate}
    >
      <span
        style={{
          display: 'inline-block',
          fontSize: '0.83rem',
          fontWeight: 300,
          letterSpacing: '0.07em',
          color: hovered ? '#2dd4bf' : 'rgba(255,255,255,0.78)',
          transform: hovered ? 'scale(1.1)' : 'scale(1)',
          filter: hovered ? 'drop-shadow(0 0 7px rgba(45,212,191,0.7))' : 'none',
          transition: 'color 0.15s ease, transform 0.15s ease, filter 0.15s ease',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          userSelect: 'none',
          transformOrigin: isLeft ? 'right center' : 'left center',
        }}
      >
        {isLeft ? `${metric.name} →` : `← ${metric.name}`}
      </span>
    </div>
  );
}
