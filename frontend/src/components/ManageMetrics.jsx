import { useState } from 'react';
import { createMetric, updateMetric, deleteMetric } from '../api';

export default function ManageMetrics({ metrics, onClose, onReload }) {
  const [newName, setNewName] = useState('');
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState('');

  const handleAdd = async () => {
    if (!newName.trim()) return;
    await createMetric(newName.trim());
    setNewName('');
    onReload();
  };

  const handleSaveEdit = async (id) => {
    if (!editName.trim()) return;
    await updateMetric(id, editName.trim());
    setEditId(null);
    onReload();
  };

  const handleDelete = async (id) => {
    await deleteMetric(id);
    onReload();
  };

  const startEdit = (metric) => {
    setEditId(metric.id);
    setEditName(metric.name);
  };

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: '#0d1526',
          border: '1px solid #134e4a',
          borderRadius: '16px',
          padding: '28px',
          width: '320px',
          maxHeight: '70vh',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          boxShadow: '0 0 40px rgba(45,212,191,0.08)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span
            style={{
              color: '#2dd4bf',
              fontSize: '0.7rem',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            Metrics
          </span>
          <button
            onClick={onClose}
            style={{
              color: 'rgba(255,255,255,0.35)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.1rem',
              lineHeight: 1,
              padding: 0,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'white')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}
          >
            ✕
          </button>
        </div>

        {/* List */}
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            flex: 1,
          }}
        >
          {metrics.map((m) => (
            <MetricRow
              key={m.id}
              metric={m}
              isEditing={editId === m.id}
              editName={editName}
              onEditNameChange={setEditName}
              onStartEdit={() => startEdit(m)}
              onSaveEdit={() => handleSaveEdit(m.id)}
              onCancelEdit={() => setEditId(null)}
              onDelete={() => handleDelete(m.id)}
            />
          ))}
          {metrics.length === 0 && (
            <li
              style={{
                color: 'rgba(255,255,255,0.3)',
                fontSize: '0.8rem',
                textAlign: 'center',
                padding: '12px 0',
              }}
            >
              No metrics yet
            </li>
          )}
        </ul>

        {/* Add new */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="New metric…"
            style={inputStyle}
          />
          <button
            onClick={handleAdd}
            style={addBtnStyle}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#2dd4bf')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#134e4a')}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

function MetricRow({
  metric,
  isEditing,
  editName,
  onEditNameChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
}) {
  const [hover, setHover] = useState(false);

  return (
    <li
      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {isEditing ? (
        <>
          <input
            value={editName}
            onChange={(e) => onEditNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveEdit();
              if (e.key === 'Escape') onCancelEdit();
            }}
            autoFocus
            style={{ ...inputStyle, flex: 1, fontSize: '0.82rem' }}
          />
          <button onClick={onSaveEdit} style={actionBtnStyle('#2dd4bf')}>
            Save
          </button>
          <button onClick={onCancelEdit} style={actionBtnStyle('rgba(255,255,255,0.3)')}>
            ✕
          </button>
        </>
      ) : (
        <>
          <span
            style={{
              flex: 1,
              fontSize: '0.85rem',
              color: 'rgba(255,255,255,0.8)',
              fontWeight: 300,
            }}
          >
            {metric.name}
          </span>
          <button
            onClick={onStartEdit}
            style={{
              ...actionBtnStyle('#2dd4bf'),
              opacity: hover ? 1 : 0,
              transition: 'opacity 0.15s',
            }}
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            style={{
              ...actionBtnStyle('#f87171'),
              opacity: hover ? 1 : 0,
              transition: 'opacity 0.15s',
            }}
          >
            Del
          </button>
        </>
      )}
    </li>
  );
}

const inputStyle = {
  flex: 1,
  background: 'rgba(255,255,255,0.06)',
  color: 'white',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '8px',
  padding: '7px 10px',
  fontSize: '0.85rem',
  outline: 'none',
  fontFamily: 'inherit',
};

const addBtnStyle = {
  background: '#134e4a',
  color: 'white',
  border: 'none',
  borderRadius: '8px',
  padding: '7px 14px',
  fontSize: '0.8rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'background 0.15s',
  letterSpacing: '0.04em',
};

const actionBtnStyle = (color) => ({
  background: 'none',
  border: 'none',
  color,
  fontSize: '0.72rem',
  cursor: 'pointer',
  padding: '2px 4px',
  fontFamily: 'inherit',
  letterSpacing: '0.04em',
});
