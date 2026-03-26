import { useState, useEffect } from 'react';
import { listTasks, createTask, updateTask } from '../api.js';

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const STATUS_LABELS = { PENDING: 'Pendiente', IN_PROGRESS: 'En curso', DONE: 'Hecho' };

export default function TasksPanel({ leadId }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', due_date: '', assigned_to: '', status: 'PENDING' });

  function load() {
    if (!leadId) return;
    setLoading(true);
    listTasks(leadId)
      .then(setTasks)
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [leadId]);

  async function handleCreate(e) {
    e.preventDefault();
    const body = {
      title: form.title,
      status: form.status,
      assigned_to: form.assigned_to || null,
      due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
    };
    try {
      await createTask(leadId, body);
      setForm({ title: '', due_date: '', assigned_to: '', status: 'PENDING' });
      setShowForm(false);
      load();
    } catch (e) {
      console.error(e);
    }
  }

  async function toggleDone(task) {
    const newStatus = task.status === 'DONE' ? 'PENDING' : 'DONE';
    try {
      await updateTask(leadId, task.id, { status: newStatus });
      setTasks(ts => ts.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    } catch (e) {
      console.error(e);
    }
  }

  if (loading) return <p className="loading-msg">Cargando tareas...</p>;

  return (
    <div className="tasks-panel">
      <div className="tasks-header">
        <button className="btn btn-secondary btn-sm" onClick={() => setShowForm(s => !s)}>
          {showForm ? 'Cancelar' : '+ Tarea'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="task-form">
          <div className="form-group">
            <label>Título</label>
            <input
              required
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="ej. Enviar cotización..."
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Fecha límite</label>
              <input
                type="date"
                value={form.due_date}
                onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label>Asignado a</label>
              <input
                value={form.assigned_to}
                onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}
                placeholder="nacho, agus..."
              />
            </div>
          </div>
          <button type="submit" className="btn btn-primary btn-sm">Guardar tarea</button>
        </form>
      )}

      {tasks.length === 0 && !showForm && (
        <p className="empty-msg">Sin tareas asignadas.</p>
      )}

      <ul className="tasks-list">
        {tasks.map(task => (
          <li key={task.id} className={`task-item ${task.status === 'DONE' ? 'task-done' : ''}`}>
            <input
              type="checkbox"
              checked={task.status === 'DONE'}
              onChange={() => toggleDone(task)}
              className="task-checkbox"
            />
            <div className="task-body">
              <div className="task-title">{task.title}</div>
              <div className="task-meta">
                {task.assigned_to && <span>{task.assigned_to}</span>}
                {task.due_date && <span>Vence: {fmtDate(task.due_date)}</span>}
                <span className="task-status">{STATUS_LABELS[task.status] || task.status}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
