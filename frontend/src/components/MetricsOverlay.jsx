import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// Angles: 0°=right, 90°=up(CSS top), 180°=left, 270°=bottom
// Arcs are defined as angular ranges so any number of metrics can be laid out.
const LEFT_RANGE  = [140, 210];  // top-left → bottom-left
const RIGHT_RANGE = [40, -8];    // top-right → bottom-right (−8 ≡ 352)
const R = 290;
const toRad = deg => (deg * Math.PI) / 180;

// Evenly place `count` angles across [start,end]; a single item sits at the midpoint.
function distribute([start, end], count) {
  if (count <= 0) return [];
  if (count === 1) return [(start + end) / 2];
  return Array.from({ length: count }, (_, i) => start + (end - start) * (i / (count - 1)));
}

// left gets the extra when odd (matches the original 4/3 split at n=7)
const leftCountFor = n => Math.ceil(n / 2);

function computeAngles(n) {
  const leftCount = leftCountFor(n);
  return [
    ...distribute(LEFT_RANGE, leftCount),
    ...distribute(RIGHT_RANGE, n - leftCount),
  ];
}

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
  const displayed = metrics;
  const leftCount = leftCountFor(displayed.length);
  const allAngles = computeAngles(displayed.length);
  const cx = w / 2;
  const cy = h / 2 - 88;

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
              stroke="black"
              strokeWidth="0.8"
              strokeOpacity={visible ? 0.28 : 0}
              filter="url(#lineglow)"
              style={{ transition: 'stroke-opacity 0.15s ease' }}
            />
          );
        })}
      </svg>

      {/* Labels */}
      {displayed.map((metric, i) => {
        const θ = toRad(allAngles[i]);
        const xOff = R * Math.cos(θ);
        const yOff = R * Math.sin(θ);
        const isLeft = i < leftCount;

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
          fontWeight: 500,
          letterSpacing: '0.07em',
          color: hovered ? 'black' : 'black',
          transform: hovered ? 'scale(1.1)' : 'scale(1)',
          transition: 'color 0.15s ease, transform 0.15s ease, filter 0.15s ease',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          userSelect: 'none',
          transformOrigin: isLeft ? 'right center' : 'left center',
        }}
      >
        {metric.name}
      </span>
    </div>
  );
}
