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
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/65 [backdrop-filter:blur(6px)]"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[70vh] w-80 flex-col gap-5 rounded-2xl border border-teal-dim bg-[#0d1526] p-7 shadow-[0_0_40px_rgba(45,212,191,0.08)]">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.15em] text-teal">
            Metrics
          </span>
          <button
            onClick={onClose}
            className="cursor-pointer border-none bg-transparent p-0 text-[1.1rem] leading-none text-white/35 transition-colors hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* List */}
        <ul className="m-0 flex flex-1 list-none flex-col gap-2 overflow-y-auto p-0">
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
            <li className="py-3 text-center text-[0.8rem] text-white/30">No metrics yet</li>
          )}
        </ul>

        {/* Add new */}
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="New metric…"
            className="flex-1 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-[7px] text-[0.85rem] text-white outline-none"
          />
          <button
            onClick={handleAdd}
            className="cursor-pointer rounded-lg border-none bg-teal-dim px-3.5 py-[7px] text-[0.8rem] tracking-[0.04em] text-white transition-colors hover:bg-teal"
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
  return (
    <li className="group flex items-center gap-2 py-1">
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
            className="flex-1 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-[7px] text-[0.82rem] text-white outline-none"
          />
          <button
            onClick={onSaveEdit}
            className="cursor-pointer border-none bg-transparent px-1 py-0.5 text-[0.72rem] tracking-[0.04em] text-teal"
          >
            Save
          </button>
          <button
            onClick={onCancelEdit}
            className="cursor-pointer border-none bg-transparent px-1 py-0.5 text-[0.72rem] tracking-[0.04em] text-white/30"
          >
            ✕
          </button>
        </>
      ) : (
        <>
          <span className="flex-1 text-[0.85rem] font-light text-white/80">{metric.name}</span>
          <button
            onClick={onStartEdit}
            className="cursor-pointer border-none bg-transparent px-1 py-0.5 text-[0.72rem] tracking-[0.04em] text-teal opacity-0 transition-opacity group-hover:opacity-100"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            className="cursor-pointer border-none bg-transparent px-1 py-0.5 text-[0.72rem] tracking-[0.04em] text-red-400 opacity-0 transition-opacity group-hover:opacity-100"
          >
            Del
          </button>
        </>
      )}
    </li>
  );
}
