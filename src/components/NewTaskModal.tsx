import { useState, type FormEvent } from "react";
import { TASK_COLUMNS, type Priority, type TaskStatus } from "../data/mock";
import type { ActionResult } from "../lib/store";
import { dateAt } from "../lib/utils";
import { AlertTriangle } from "lucide-react";
import { Button, Field, inputClass, Modal } from "./ui";

export function NewTaskModal({
  status = "backlog",
  onClose,
  onSubmit,
}: {
  status?: TaskStatus;
  onClose: () => void;
  onSubmit: (values: {
    title: string;
    project: string;
    priority: Priority;
    status: TaskStatus;
    due: string;
  }) => Promise<ActionResult>;
}) {
  const [title, setTitle] = useState("");
  const [project, setProject] = useState("Marketing");
  const [priority, setPriority] = useState<Priority>("medium");
  const [taskStatus, setTaskStatus] = useState<TaskStatus>(status);
  const [due, setDue] = useState(dateAt(3));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    setError(null);
    const result = await onSubmit({
      title: title.trim(),
      project: project.trim() || "General",
      priority,
      status: taskStatus,
      due,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not create this task.");
      return;
    }
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="New task"
      description="Capture work and give it a clear owner."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="task-form" disabled={busy}>
            {busy ? "Creating…" : "Create task"}
          </Button>
        </>
      }
    >
      <form id="task-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        {error && (
          <div className="flex items-start gap-1.5 rounded-lg bg-accent-soft px-2.5 py-2 text-[10.5px] text-accent-text sm:col-span-2">
            <AlertTriangle size={11} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}
        <Field label="Task" className="sm:col-span-2">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className={inputClass}
            placeholder="What needs to happen?"
            required
            autoFocus
          />
        </Field>
        <Field label="Project">
          <input
            value={project}
            onChange={(event) => setProject(event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Due date">
          <input type="date" value={due} onChange={(event) => setDue(event.target.value)} className={inputClass} />
        </Field>
        <Field label="Priority">
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value as Priority)}
            className={inputClass}
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </Field>
        <Field label="Column">
          <select
            value={taskStatus}
            onChange={(event) => setTaskStatus(event.target.value as TaskStatus)}
            className={inputClass}
          >
            {TASK_COLUMNS.map((column) => (
              <option key={column.id} value={column.id}>
                {column.label}
              </option>
            ))}
          </select>
        </Field>
      </form>
    </Modal>
  );
}
