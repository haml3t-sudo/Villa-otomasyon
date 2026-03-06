import { format } from "date-fns";
import { tr } from "date-fns/locale";

export default function DayTaskModal({
  date,
  tasks,
  onClose,
  onToggleDone,
  onAddTask,
}) {
  const headerText = format(date, "dd MMMM yyyy", { locale: tr });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">{headerText}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
          {tasks.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
              <p>Bu gün için görev yok</p>
              <button
                type="button"
                onClick={onAddTask}
                className="mt-2 rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
              >
                Görev Ekle
              </button>
            </div>
          ) : (
            tasks.map((task) => (
              <div
                key={task.id}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={task.statusNormalized === "done"}
                    onChange={(e) => onToggleDone(task, e.target.checked)}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-medium ${
                        task.statusNormalized === "done"
                          ? "text-slate-400 line-through"
                          : "text-slate-800"
                      }`}
                    >
                      {task.title}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          task.assignedName
                            ? "bg-blue-100 text-blue-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {task.assignedName || "Atanmamış"}
                      </span>
                      {task.priority ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                          {task.priority}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={onAddTask}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            ➕ Bu Güne Görev Ekle
          </button>
        </div>
      </div>
    </div>
  );
}
