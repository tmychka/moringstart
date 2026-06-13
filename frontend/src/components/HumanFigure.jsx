import figureImg from '../assets/human-figure.png';

// Static figure image. Sized to match the footprint of the old 3D model:
// ~80vh tall, horizontally centered, feet ~4.5vh above the viewport bottom.
export default function HumanFigure({ rotate = false, onHover, onUnhover }) {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <img
        src={figureImg}
        alt=""
        draggable={false}
        onMouseEnter={onHover}
        onMouseLeave={onUnhover}
        style={{
          position: 'absolute',
          bottom: '4.5vh',
          left: '50%',
          transform: 'translateX(-50%)',
          height: '80vh',
          width: 'auto',
          pointerEvents: onHover ? 'auto' : 'none',
          userSelect: 'none',
        }}
      />
    </div>
  );
}
