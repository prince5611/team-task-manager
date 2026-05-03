import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  LogOut,
  Plus,
  Trash2,
  UserPlus,
  Users
} from "lucide-react";
import "./styles.css";

const API_BASE = import.meta.env.VITE_API_URL || "";
const statuses = ["To Do", "In Progress", "Done"];
const priorities = ["Low", "Medium", "High"];

function apiClient(token) {
  return async function api(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || "Something went wrong.");
    }
    return data;
  };
}

function useLocalAuth() {
  const [session, setSession] = useState(() => {
    const raw = localStorage.getItem("ttm_session");
    return raw ? JSON.parse(raw) : null;
  });

  function save(next) {
    setSession(next);
    if (next) localStorage.setItem("ttm_session", JSON.stringify(next));
    else localStorage.removeItem("ttm_session");
  }

  return [session, save];
}

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const api = apiClient();

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      const payload = mode === "signup" ? form : { email: form.email, password: form.password };
      const data = await api(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      onAuth(data);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand-lockup">
          <ClipboardList size={34} />
          <div>
            <h1>Team Task Manager</h1>
            <p>Projects, assignments, and progress in one working board.</p>
          </div>
        </div>
        <div className="mode-toggle">
          <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
            Login
          </button>
          <button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>
            Signup
          </button>
        </div>
        <form onSubmit={submit} className="stack">
          {mode === "signup" && (
            <label>
              Name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              minLength={6}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="primary" type="submit">
            {mode === "login" ? "Login" : "Create account"}
          </button>
        </form>
      </section>
    </main>
  );
}

function App() {
  const [session, setSession] = useLocalAuth();
  const api = useMemo(() => apiClient(session?.token), [session]);

  if (!session) return <AuthScreen onAuth={setSession} />;
  return <Workspace api={api} session={session} onLogout={() => setSession(null)} />;
}

function Workspace({ api, session, onLogout }) {
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [projectForm, setProjectForm] = useState({ name: "", description: "" });
  const [error, setError] = useState("");

  async function loadProjects() {
    const data = await api("/api/projects");
    setProjects(data);
    if (!selectedProjectId && data[0]) setSelectedProjectId(data[0].id);
  }

  useEffect(() => {
    loadProjects().catch((err) => setError(err.message));
  }, []);

  async function createProject(event) {
    event.preventDefault();
    setError("");
    try {
      const project = await api("/api/projects", {
        method: "POST",
        body: JSON.stringify(projectForm)
      });
      setProjectForm({ name: "", description: "" });
      setProjects([project, ...projects]);
      setSelectedProjectId(project.id);
    } catch (err) {
      setError(err.message);
    }
  }

  const selectedProject = projects.find((project) => project.id === selectedProjectId);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-head">
          <ClipboardList />
          <div>
            <strong>Task Manager</strong>
            <span>{session.user.name}</span>
          </div>
        </div>
        <form onSubmit={createProject} className="project-create">
          <input
            placeholder="Project name"
            value={projectForm.name}
            onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
            required
          />
          <textarea
            placeholder="Short description"
            value={projectForm.description}
            onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
          />
          <button className="primary" type="submit">
            <Plus size={16} /> Create
          </button>
        </form>
        {error && <p className="error">{error}</p>}
        <nav className="project-list">
          {projects.map((project) => (
            <button
              key={project.id}
              className={project.id === selectedProjectId ? "selected" : ""}
              onClick={() => setSelectedProjectId(project.id)}
            >
              <span>{project.name}</span>
              <small>
                {project.role} · {project.task_count} tasks
              </small>
            </button>
          ))}
        </nav>
        <button className="ghost logout" onClick={onLogout}>
          <LogOut size={16} /> Logout
        </button>
      </aside>
      <main className="workspace">
        {selectedProject ? (
          <ProjectView api={api} project={selectedProject} refreshProjects={loadProjects} />
        ) : (
          <section className="empty-state">
            <h2>Create your first project</h2>
            <p>Add a project to start inviting members and assigning tasks.</p>
          </section>
        )}
      </main>
    </div>
  );
}

function ProjectView({ api, project, refreshProjects }) {
  const [members, setMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [memberForm, setMemberForm] = useState({ email: "", role: "Member" });
  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    dueDate: new Date().toISOString().slice(0, 10),
    priority: "Medium",
    assignedTo: ""
  });
  const [error, setError] = useState("");
  const isAdmin = project.role === "Admin";

  async function loadProjectData() {
    const [memberData, taskData, dashboardData] = await Promise.all([
      api(`/api/projects/${project.id}/members`),
      api(`/api/projects/${project.id}/tasks`),
      api(`/api/projects/${project.id}/dashboard`)
    ]);
    setMembers(memberData);
    setTasks(taskData);
    setDashboard(dashboardData);
  }

  useEffect(() => {
    setError("");
    loadProjectData().catch((err) => setError(err.message));
  }, [project.id]);

  async function addMember(event) {
    event.preventDefault();
    setError("");
    try {
      await api(`/api/projects/${project.id}/members`, {
        method: "POST",
        body: JSON.stringify(memberForm)
      });
      setMemberForm({ email: "", role: "Member" });
      await loadProjectData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeMember(userId) {
    setError("");
    try {
      await api(`/api/projects/${project.id}/members/${userId}`, { method: "DELETE" });
      await loadProjectData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function createTask(event) {
    event.preventDefault();
    setError("");
    try {
      await api(`/api/projects/${project.id}/tasks`, {
        method: "POST",
        body: JSON.stringify(taskForm)
      });
      setTaskForm({
        title: "",
        description: "",
        dueDate: new Date().toISOString().slice(0, 10),
        priority: "Medium",
        assignedTo: ""
      });
      await loadProjectData();
      await refreshProjects();
    } catch (err) {
      setError(err.message);
    }
  }

  async function updateTask(taskId, patch) {
    setError("");
    try {
      await api(`/api/projects/${project.id}/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify(patch)
      });
      await loadProjectData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteTask(taskId) {
    setError("");
    try {
      await api(`/api/projects/${project.id}/tasks/${taskId}`, { method: "DELETE" });
      await loadProjectData();
      await refreshProjects();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="project-view">
      <header className="topbar">
        <div>
          <span className="eyebrow">{project.role}</span>
          <h1>{project.name}</h1>
          <p>{project.description || "No project description yet."}</p>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      <Dashboard dashboard={dashboard} />

      <section className="content-grid">
        <div className="panel">
          <div className="panel-title">
            <Users size={18} />
            <h2>Members</h2>
          </div>
          {isAdmin && (
            <form className="inline-form" onSubmit={addMember}>
              <input
                type="email"
                placeholder="Member email"
                value={memberForm.email}
                onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })}
                required
              />
              <select value={memberForm.role} onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value })}>
                <option>Member</option>
                <option>Admin</option>
              </select>
              <button className="icon-button" title="Add member" type="submit">
                <UserPlus size={18} />
              </button>
            </form>
          )}
          <div className="member-list">
            {members.map((member) => (
              <div className="member-row" key={member.id}>
                <div>
                  <strong>{member.name}</strong>
                  <span>{member.email}</span>
                </div>
                <span className="pill">{member.role}</span>
                {isAdmin && member.role !== "Admin" && (
                  <button className="icon-button danger" title="Remove member" onClick={() => removeMember(member.id)}>
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-title">
            <Plus size={18} />
            <h2>New Task</h2>
          </div>
          {isAdmin ? (
            <form className="task-form" onSubmit={createTask}>
              <input
                placeholder="Task title"
                value={taskForm.title}
                onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                required
              />
              <textarea
                placeholder="Description"
                value={taskForm.description}
                onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
              />
              <div className="form-row">
                <input
                  type="date"
                  value={taskForm.dueDate}
                  onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
                  required
                />
                <select
                  value={taskForm.priority}
                  onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
                >
                  {priorities.map((priority) => (
                    <option key={priority}>{priority}</option>
                  ))}
                </select>
              </div>
              <select
                value={taskForm.assignedTo}
                onChange={(e) => setTaskForm({ ...taskForm, assignedTo: e.target.value })}
              >
                <option value="">Unassigned</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
              <button className="primary" type="submit">
                <Plus size={16} /> Add task
              </button>
            </form>
          ) : (
            <p className="muted">Members can view and update only their assigned tasks.</p>
          )}
        </div>
      </section>

      <TaskBoard tasks={tasks} isAdmin={isAdmin} members={members} updateTask={updateTask} deleteTask={deleteTask} />
    </div>
  );
}

function Dashboard({ dashboard }) {
  const statusMap = Object.fromEntries((dashboard?.tasksByStatus || []).map((item) => [item.status, item.count]));
  return (
    <section className="metric-grid">
      <Metric icon={<ClipboardList />} label="Total tasks" value={dashboard?.totalTasks ?? 0} />
      <Metric icon={<CheckCircle2 />} label="Done" value={statusMap.Done || 0} />
      <Metric icon={<CalendarClock />} label="Overdue" value={dashboard?.overdueTasks ?? 0} />
      <div className="metric wide">
        <BarChart3 />
        <div>
          <span>Tasks per user</span>
          <div className="mini-bars">
            {(dashboard?.tasksPerUser || []).map((item) => (
              <div key={item.name}>
                <small>{item.name}</small>
                <strong>{item.count}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric({ icon, label, value }) {
  return (
    <div className="metric">
      {icon}
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function TaskBoard({ tasks, isAdmin, members, updateTask, deleteTask }) {
  return (
    <section className="task-board">
      {statuses.map((status) => (
        <div className="task-column" key={status}>
          <h2>{status}</h2>
          <div className="task-stack">
            {tasks
              .filter((task) => task.status === status)
              .map((task) => (
                <article className={`task-card priority-${task.priority.toLowerCase()}`} key={task.id}>
                  <div className="task-card-head">
                    <h3>{task.title}</h3>
                    {isAdmin && (
                      <button className="icon-button danger" title="Delete task" onClick={() => deleteTask(task.id)}>
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                  <p>{task.description || "No description added."}</p>
                  <div className="task-meta">
                    <span>{task.priority}</span>
                    <span>{new Date(task.due_date).toLocaleDateString()}</span>
                  </div>
                  <label>
                    Status
                    <select value={task.status} onChange={(e) => updateTask(task.id, { status: e.target.value })}>
                      {statuses.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                  {isAdmin && (
                    <label>
                      Assignee
                      <select
                        value={task.assigned_to || ""}
                        onChange={(e) => updateTask(task.id, { assignedTo: e.target.value })}
                      >
                        <option value="">Unassigned</option>
                        {members.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {!isAdmin && <small>Assigned to {task.assignee_name || "you"}</small>}
                </article>
              ))}
          </div>
        </div>
      ))}
    </section>
  );
}

createRoot(document.getElementById("root")).render(<App />);
