import { useState, useEffect, useRef, useCallback } from 'react';
import HumanFigure from '../components/HumanFigure';
import MetricsOverlay from '../components/MetricsOverlay';
import ManageMetrics from '../components/ManageMetrics';
import { getMetrics } from '../api';

export default function Home() {
  const [metrics, setMetrics]       = useState([]);
  const [hovered, setHovered]       = useState(false);
  const [showManage, setShowManage] = useState(false);
  const hideTimer = useRef(null);

  useEffect(() => {
    getMetrics().then(setMetrics).catch(console.error);
  }, []);

  const reload = () => getMetrics().then(setMetrics).catch(console.error);

  const cancelHide = useCallback(() => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
  }, []);

  const scheduleHide = useCallback(() => {
    cancelHide();
    hideTimer.current = setTimeout(() => setHovered(false), 350);
  }, [cancelHide]);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#0a0f1e', overflow: 'hidden' }}>
      {/* 3D canvas */}
      <HumanFigure
        rotate={false}
        onHover={() => { cancelHide(); setHovered(true); }}
        onUnhover={scheduleHide}
      />

      {/* Metrics arc */}
      <MetricsOverlay
        metrics={metrics}
        visible={hovered}
        onLabelEnter={cancelHide}
        onLabelLeave={scheduleHide}
      />

      {/* App title */}
      <div style={{
        position: 'absolute',
        top: '32px',
        left: '50%',
        transform: 'translateX(-50%)',
        textAlign: 'center',
        pointerEvents: 'none',
        zIndex: 20,
      }}>
        <p style={{
          fontSize: '0.65rem',
          letterSpacing: '0.3em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.2)',
          margin: 0,
          fontWeight: 300,
        }}>Morning Start</p>
      </div>

      {/* Manage metrics button */}
      <button
        onClick={() => setShowManage(true)}
        style={{
          position: 'absolute',
          bottom: '28px',
          right: '28px',
          background: 'none',
          border: '1px solid #134e4a',
          color: '#134e4a',
          borderRadius: '8px',
          padding: '7px 16px',
          fontSize: '0.65rem',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontWeight: 400,
          zIndex: 20,
          transition: 'color 0.2s, border-color 0.2s',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#2dd4bf'; e.currentTarget.style.borderColor = '#2dd4bf'; }}
        onMouseLeave={e => { e.currentTarget.style.color = '#134e4a'; e.currentTarget.style.borderColor = '#134e4a'; }}
      >
        Metrics
      </button>

      {/* Hint text */}
      {!hovered && (
        <p style={{
          position: 'absolute',
          bottom: '28px',
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: '0.65rem',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.12)',
          margin: 0,
          pointerEvents: 'none',
          zIndex: 20,
          transition: 'opacity 0.3s',
        }}>
          Hover to reveal
        </p>
      )}

      {/* Manage modal */}
      {showManage && (
        <ManageMetrics
          metrics={metrics}
          onClose={() => setShowManage(false)}
          onReload={reload}
        />
      )}
    </div>
  );
}
