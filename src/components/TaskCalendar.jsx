import { useEffect, useMemo, useState } from "react";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { tr } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";

import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import AddTaskModal from "./AddTaskModal";
import DayTaskModal from "./DayTaskModal";

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales: { tr },
});

const messages = {
  today: "Bugün",
  previous: "‹",
  next: "›",
  month: "Ay",
  week: "Hafta",
  day: "Gün",
  agenda: "Ajanda",
  date: "Tarih",
  time: "Saat",
  event: "Görev",
  noEventsInRange: "Bu aralıkta görev yok.",
  showMore: (total) => `+${total} daha`,
};

function toIsoDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return format(d, "yyyy-MM-dd");
}

function normalizeStatus(status) {
  const s = String(status || "").toLowerCase();
  if (s === "done" || s === "tamamlandı") return "done";
  if (s === "in_progress" || s === "yapılıyor") return "in_progress";
  return "pending";
}

function toDbStatus(normalized) {
  if (normalized === "done") return "Tamamlandı";
  if (normalized === "in_progress") return "Yapılıyor";
  return "Yapılacak";
}

function toKanbanLabel(normalized) {
  if (normalized === "done") return "Tamamlandı";
  if (normalized === "in_progress") return "Yapılıyor";
  return "Yapılacak";
}

function mapRowToTask(row) {
  const dueDate = row.due_date || row.dueDate || null;
  const statusNormalized = normalizeStatus(row.status);
  return {
    ...row,
    id: row.id,
    title: row.title,
    text: row.text || "",
    dueDate,
    assignedToId: row.assigned_to || row.assignedToId || null,
    assignedName:
      row?.profiles?.full_name ||
      row.assignedToName ||
      null,
    statusRaw: row.status,
    statusNormalized,
    priority: row.priority || null,
  };
}

export default function TaskCalendar({ tasks = [], onAddTask, onMoveTask }) {
  const { user } = useAuth();
  const [taskRows, setTaskRows] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState("month");
  const [selectedDate, setSelectedDate] = useState(null);
  const [showDayModal, setShowDayModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [toast, setToast] = useState(null);

  async function fetchTasks() {
    setLoading(true);
    try {
      if (supabase) {
        const { data, error } = await supabase
          .from("tasks")
          .select("*, profiles!assigned_to(full_name)")
          .order("created_at", { ascending: false });
        if (error) throw error;
        setTaskRows((data || []).map(mapRowToTask));

        const { data: profileRows } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .order("full_name", { ascending: true });
        setProfiles(profileRows || []);
      } else {
        setTaskRows((tasks || []).map(mapRowToTask));
        const uniq = new Map();
        (tasks || []).forEach((t) => {
          if (t.assignedToId && !uniq.has(t.assignedToId)) {
            uniq.set(t.assignedToId, {
              id: t.assignedToId,
              full_name: t.assignedToName || t.assignedToId,
            });
          }
        });
        setProfiles(Array.from(uniq.values()));
      }
    } catch (err) {
      setToast(err?.message || "Görevler yüklenemedi.");
      setTaskRows((tasks || []).map(mapRowToTask));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const events = useMemo(() => {
    return taskRows
      .filter((task) => task.dueDate)
      .map((task) => ({
        id: task.id,
        title: task.title,
        start: new Date(`${task.dueDate}T12:00:00`),
        end: new Date(`${task.dueDate}T12:00:00`),
        allDay: true,
        resource: task,
      }));
  }, [taskRows]);

  const dayTasks = useMemo(() => {
    if (!selectedDate) return [];
    const key = toIsoDate(selectedDate);
    return taskRows.filter((task) => task.dueDate === key);
  }, [selectedDate, taskRows]);

  async function handleToggleDone(task, checked) {
    const nextNormalized = checked ? "done" : "pending";
    setTaskRows((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? {
              ...t,
              statusNormalized: nextNormalized,
              statusRaw: toDbStatus(nextNormalized),
            }
          : t,
      ),
    );

    try {
      if (supabase) {
        const { error } = await supabase
          .from("tasks")
          .update({ status: toDbStatus(nextNormalized) })
          .eq("id", task.id);
        if (error) throw error;
        if (onMoveTask) {
          const targetIndex = nextNormalized === "done" ? 2 : 0;
          onMoveTask(task.id, targetIndex);
        }
      } else if (onMoveTask) {
        const targetIndex = nextNormalized === "done" ? 2 : 0;
        onMoveTask(task.id, targetIndex);
      }
    } catch (err) {
      setToast(err?.message || "Görev durumu güncellenemedi.");
      fetchTasks();
    }
  }

  async function handleCreateTask(payload) {
    try {
      if (supabase) {
        const dbStatus = toDbStatus(payload.status);
        const insertPayload = {
          title: payload.title,
          text: payload.text || null,
          assigned_to: payload.assigned_to || null,
          due_date: payload.due_date,
          status: dbStatus,
          user_id: user?.id || null,
          created_at: new Date().toISOString(),
        };
        let { data: inserted, error } = await supabase
          .from("tasks")
          .insert(insertPayload)
          .select("id")
          .single();
        if (error) {
          const msg = String(error.message || "").toLowerCase();
          // Backward compatibility: some schemas don't have `text` column yet.
          if (msg.includes("could not find") && msg.includes("'text'")) {
            const fallbackPayload = { ...insertPayload };
            delete fallbackPayload.text;
            const retry = await supabase
              .from("tasks")
              .insert(fallbackPayload)
              .select("id")
              .single();
            inserted = retry.data;
            error = retry.error;
          }
        }
        if (error) throw error;
        if (onAddTask) {
          const assigned = profiles.find((p) => p.id === payload.assigned_to);
          onAddTask({
            id: inserted?.id || Date.now(),
            title: payload.title,
            status: dbStatus,
            assignedToId: payload.assigned_to || null,
            assignedToName: assigned?.full_name || assigned?.email || null,
            dueDate: payload.due_date || null,
          });
        }
      } else if (onAddTask) {
        onAddTask({
          id: Date.now(),
          title: payload.title,
          status: toKanbanLabel(payload.status),
          assignedToId: payload.assigned_to || null,
          assignedToName:
            profiles.find((p) => p.id === payload.assigned_to)?.full_name || null,
          dueDate: payload.due_date || null,
        });
      }
      setToast("Görev eklendi.");
      await fetchTasks();
    } catch (err) {
      setToast(err?.message || "Görev eklenemedi.");
      throw err;
    }
  }

  const eventPropGetter = (event) => {
    const status = event?.resource?.statusNormalized;
    const style = {
      border: "none",
      borderRadius: "8px",
      color: "#fff",
      padding: "1px 6px",
    };
    if (status === "done") {
      style.backgroundColor = "#10B981";
      style.textDecoration = "line-through";
    } else if (status === "in_progress") {
      style.backgroundColor = "#3B82F6";
    } else {
      style.backgroundColor = "#F59E0B";
    }
    return { style };
  };

  const components = {
    event: ({ event }) => {
      const done = event.resource?.statusNormalized === "done";
      return (
        <span className={done ? "line-through" : ""}>{event.title}</span>
      );
    },
    dateCellWrapper: ({ value, children }) => {
      const day = toIsoDate(value);
      return (
        <div className="group relative h-full">
          {children}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedDate(new Date(`${day}T00:00:00`));
              setShowAddModal(true);
            }}
            className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs text-white shadow-sm group-hover:flex"
            title="Bu güne görev ekle"
          >
            +
          </button>
        </div>
      );
    },
  };

  return (
    <section className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      {toast && (
        <div className="mb-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">
          {toast}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-slate-500">Takvim yükleniyor...</div>
      ) : (
        <div style={{ height: 680 }}>
          <Calendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            allDayAccessor="allDay"
            selectable
            popup
            views={["month", "week", "day"]}
            view={activeView}
            onView={setActiveView}
            defaultView="month"
            messages={messages}
            culture="tr"
            eventPropGetter={eventPropGetter}
            components={components}
            onSelectSlot={(slot) => {
              setSelectedDate(slot.start);
              setShowDayModal(true);
            }}
            onSelectEvent={(event) => {
              setSelectedDate(event.start);
              setShowDayModal(true);
            }}
          />
        </div>
      )}

      {showDayModal && selectedDate && (
        <DayTaskModal
          date={selectedDate}
          tasks={dayTasks}
          onClose={() => setShowDayModal(false)}
          onToggleDone={handleToggleDone}
          onAddTask={() => {
            setShowDayModal(false);
            setShowAddModal(true);
          }}
        />
      )}

      {showAddModal && selectedDate && (
        <AddTaskModal
          initialDate={selectedDate}
          profiles={profiles}
          onClose={() => setShowAddModal(false)}
          onSave={handleCreateTask}
        />
      )}
    </section>
  );
}
