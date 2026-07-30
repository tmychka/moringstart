import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { getMetrics, createMetric, updateMetric, deleteMetric } from "../api";
import type { Metric } from "../types";

interface ManageMetricsProps {
  onClose: () => void;
}

export default function ManageMetrics({ onClose }: ManageMetricsProps) {
  const queryClient = useQueryClient();
  const { data: metrics = [] } = useQuery({
    queryKey: ["metrics"],
    queryFn: getMetrics,
  });
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["metrics"] });

  const createMut = useMutation({
    mutationFn: (name: string) => createMetric(name),
    onSuccess: () => {
      invalidate();
      toast.success("Metric added");
    },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      updateMetric(id, name),
    onSuccess: () => {
      invalidate();
      toast.success("Metric updated");
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteMetric(id),
    onSuccess: () => {
      invalidate();
      toast.success("Metric deleted");
    },
  });

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    createMut.mutate(name, { onSuccess: () => setNewName("") });
  };

  const handleSaveEdit = (id: number) => {
    const name = editName.trim();
    if (!name) return;
    updateMut.mutate({ id, name }, { onSuccess: () => setEditId(null) });
  };

  const handleDelete = (id: number) => deleteMut.mutate(id);

  const startEdit = (metric: Metric) => {
    setEditId(metric.id);
    setEditName(metric.name);
  };

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/65 [backdrop-filter:blur(6px)]"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[70vh] w-80 flex-col gap-5 rounded-2xl border border-accent-dim bg-[#0d1526] p-7 shadow-[0_0_40px_rgba(129,140,248,0.08)]">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.15em] text-accent">
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
            <li className="py-3 text-center text-[0.8rem] text-white/30">
              No metrics yet
            </li>
          )}
        </ul>

        {/* Add new */}
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="New metric…"
            className="flex-1 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-[7px] text-[0.85rem] text-white outline-none"
          />
          <button
            onClick={handleAdd}
            className="cursor-pointer rounded-lg border-none bg-accent-dim px-3.5 py-[7px] text-[0.8rem] tracking-[0.04em] text-white transition-colors hover:bg-accent"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

interface MetricRowProps {
  metric: Metric;
  isEditing: boolean;
  editName: string;
  onEditNameChange: (name: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
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
}: MetricRowProps) {
  return (
    <li className="group flex items-center gap-2 py-1">
      {isEditing ? (
        <>
          <input
            value={editName}
            onChange={(e) => onEditNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSaveEdit();
              if (e.key === "Escape") onCancelEdit();
            }}
            autoFocus
            className="flex-1 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-[7px] text-[0.82rem] text-white outline-none"
          />
          <button
            onClick={onSaveEdit}
            className="cursor-pointer border-none bg-transparent px-1 py-0.5 text-[0.72rem] tracking-[0.04em] text-accent"
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
          <span className="flex-1 text-[0.85rem] font-light text-white/80">
            {metric.name}
          </span>
          <button
            onClick={onStartEdit}
            className="cursor-pointer border-none bg-transparent px-1 py-0.5 text-[0.72rem] tracking-[0.04em] text-accent opacity-0 transition-opacity group-hover:opacity-100"
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
