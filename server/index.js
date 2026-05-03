const path = require("path");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { initDb, query } = require("./db");
const { requireAuth, requireProjectMember, requireAdmin, getMembership } = require("./middleware");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;
let dbReady = false;
let dbStartupError = null;

app.use(cors());
app.use(express.json());

function signToken(user) {
  return jwt.sign({ id: user.id, name: user.name, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: "7d"
  });
}

function cleanUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    dbReady,
    dbError: dbStartupError ? dbStartupError.message : null
  });
});

app.post("/api/auth/signup", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 6) {
    return res.status(400).json({ message: "Name, valid email, and 6+ character password are required." });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await query(
      "INSERT INTO users (name, email, password_hash) VALUES ($1, LOWER($2), $3) RETURNING id, name, email",
      [name.trim(), email.trim(), passwordHash]
    );
    const user = result.rows[0];
    res.status(201).json({ user: cleanUser(user), token: signToken(user) });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "Email already exists." });
    }
    res.status(500).json({ message: "Could not create account." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  const result = await query("SELECT * FROM users WHERE email = LOWER($1)", [email.trim()]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ message: "Invalid login credentials." });
  }

  res.json({ user: cleanUser(user), token: signToken(user) });
});

app.get("/api/users/search", requireAuth, async (req, res) => {
  const search = `%${(req.query.q || "").trim().toLowerCase()}%`;
  const result = await query(
    "SELECT id, name, email FROM users WHERE LOWER(name) LIKE $1 OR LOWER(email) LIKE $1 ORDER BY name LIMIT 10",
    [search]
  );
  res.json(result.rows);
});

app.get("/api/projects", requireAuth, async (req, res) => {
  const result = await query(
    `SELECT p.id, p.name, p.description, p.created_at, pm.role,
      COUNT(t.id)::INT AS task_count
     FROM projects p
     JOIN project_members pm ON pm.project_id = p.id
     LEFT JOIN tasks t ON t.project_id = p.id
     WHERE pm.user_id = $1
     GROUP BY p.id, pm.role
     ORDER BY p.created_at DESC`,
    [req.user.id]
  );
  res.json(result.rows);
});

app.post("/api/projects", requireAuth, async (req, res) => {
  const { name, description = "" } = req.body;
  if (!name || name.trim().length < 2) {
    return res.status(400).json({ message: "Project name is required." });
  }

  const project = await query(
    "INSERT INTO projects (name, description, created_by) VALUES ($1, $2, $3) RETURNING *",
    [name.trim(), description.trim(), req.user.id]
  );
  await query("INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'Admin')", [
    project.rows[0].id,
    req.user.id
  ]);
  res.status(201).json({ ...project.rows[0], role: "Admin", task_count: 0 });
});

app.get("/api/projects/:projectId", requireAuth, requireProjectMember, async (req, res) => {
  const project = await query(
    `SELECT p.*, pm.role FROM projects p
     JOIN project_members pm ON pm.project_id = p.id
     WHERE p.id = $1 AND pm.user_id = $2`,
    [req.projectId, req.user.id]
  );
  res.json(project.rows[0]);
});

app.get("/api/projects/:projectId/members", requireAuth, requireProjectMember, async (req, res) => {
  const result = await query(
    `SELECT u.id, u.name, u.email, pm.role, pm.joined_at
     FROM project_members pm
     JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = $1
     ORDER BY pm.role, u.name`,
    [req.projectId]
  );
  res.json(result.rows);
});

app.post("/api/projects/:projectId/members", requireAuth, requireProjectMember, requireAdmin, async (req, res) => {
  const { email, role = "Member" } = req.body;
  if (!email || !["Admin", "Member"].includes(role)) {
    return res.status(400).json({ message: "Valid member email and role are required." });
  }

  const userResult = await query("SELECT id FROM users WHERE email = LOWER($1)", [email.trim()]);
  const user = userResult.rows[0];
  if (!user) {
    return res.status(404).json({ message: "No user found with that email." });
  }

  await query(
    `INSERT INTO project_members (project_id, user_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [req.projectId, user.id, role]
  );
  res.status(201).json({ message: "Member saved." });
});

app.delete("/api/projects/:projectId/members/:userId", requireAuth, requireProjectMember, requireAdmin, async (req, res) => {
  const targetUserId = Number(req.params.userId);
  if (targetUserId === req.user.id) {
    return res.status(400).json({ message: "Admins cannot remove themselves." });
  }

  await query("DELETE FROM project_members WHERE project_id = $1 AND user_id = $2", [req.projectId, targetUserId]);
  await query("UPDATE tasks SET assigned_to = NULL WHERE project_id = $1 AND assigned_to = $2", [
    req.projectId,
    targetUserId
  ]);
  res.json({ message: "Member removed." });
});

app.get("/api/projects/:projectId/tasks", requireAuth, requireProjectMember, async (req, res) => {
  const params = [req.projectId];
  let accessSql = "";
  if (req.membership.role !== "Admin") {
    params.push(req.user.id);
    accessSql = "AND t.assigned_to = $2";
  }

  const result = await query(
    `SELECT t.*, u.name AS assignee_name, u.email AS assignee_email
     FROM tasks t
     LEFT JOIN users u ON u.id = t.assigned_to
     WHERE t.project_id = $1 ${accessSql}
     ORDER BY t.due_date ASC, t.created_at DESC`,
    params
  );
  res.json(result.rows);
});

app.post("/api/projects/:projectId/tasks", requireAuth, requireProjectMember, requireAdmin, async (req, res) => {
  const { title, description = "", dueDate, priority = "Medium", assignedTo } = req.body;
  if (!title || !dueDate || !["Low", "Medium", "High"].includes(priority)) {
    return res.status(400).json({ message: "Title, due date, and valid priority are required." });
  }
  if (assignedTo && !(await getMembership(req.projectId, Number(assignedTo)))) {
    return res.status(400).json({ message: "Assignee must be a project member." });
  }

  const result = await query(
    `INSERT INTO tasks (project_id, title, description, due_date, priority, assigned_to, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [req.projectId, title.trim(), description.trim(), dueDate, priority, assignedTo || null, req.user.id]
  );
  res.status(201).json(result.rows[0]);
});

app.patch("/api/projects/:projectId/tasks/:taskId", requireAuth, requireProjectMember, async (req, res) => {
  const taskId = Number(req.params.taskId);
  const existing = await query("SELECT * FROM tasks WHERE id = $1 AND project_id = $2", [taskId, req.projectId]);
  const task = existing.rows[0];
  if (!task) {
    return res.status(404).json({ message: "Task not found." });
  }

  const isAdmin = req.membership.role === "Admin";
  if (!isAdmin && task.assigned_to !== req.user.id) {
    return res.status(403).json({ message: "Members can update assigned tasks only." });
  }

  const next = {
    title: isAdmin && req.body.title ? req.body.title.trim() : task.title,
    description: isAdmin && req.body.description !== undefined ? req.body.description.trim() : task.description,
    dueDate: isAdmin && req.body.dueDate ? req.body.dueDate : task.due_date,
    priority: isAdmin && req.body.priority ? req.body.priority : task.priority,
    assignedTo: isAdmin && req.body.assignedTo !== undefined ? req.body.assignedTo || null : task.assigned_to,
    status: req.body.status || task.status
  };

  if (!["Low", "Medium", "High"].includes(next.priority) || !["To Do", "In Progress", "Done"].includes(next.status)) {
    return res.status(400).json({ message: "Invalid priority or status." });
  }
  if (next.assignedTo && !(await getMembership(req.projectId, Number(next.assignedTo)))) {
    return res.status(400).json({ message: "Assignee must be a project member." });
  }

  const result = await query(
    `UPDATE tasks
     SET title = $1, description = $2, due_date = $3, priority = $4, assigned_to = $5, status = $6, updated_at = NOW()
     WHERE id = $7 AND project_id = $8
     RETURNING *`,
    [next.title, next.description, next.dueDate, next.priority, next.assignedTo, next.status, taskId, req.projectId]
  );
  res.json(result.rows[0]);
});

app.delete("/api/projects/:projectId/tasks/:taskId", requireAuth, requireProjectMember, requireAdmin, async (req, res) => {
  await query("DELETE FROM tasks WHERE id = $1 AND project_id = $2", [Number(req.params.taskId), req.projectId]);
  res.json({ message: "Task deleted." });
});

app.get("/api/projects/:projectId/dashboard", requireAuth, requireProjectMember, async (req, res) => {
  const accessParams = [req.projectId];
  let accessSql = "";
  if (req.membership.role !== "Admin") {
    accessParams.push(req.user.id);
    accessSql = "AND t.assigned_to = $2";
  }

  const total = await query(`SELECT COUNT(*)::INT AS total FROM tasks t WHERE t.project_id = $1 ${accessSql}`, accessParams);
  const byStatus = await query(
    `SELECT status, COUNT(*)::INT AS count FROM tasks t WHERE t.project_id = $1 ${accessSql} GROUP BY status`,
    accessParams
  );
  const perUser = await query(
    `SELECT COALESCE(u.name, 'Unassigned') AS name, COUNT(t.id)::INT AS count
     FROM tasks t
     LEFT JOIN users u ON u.id = t.assigned_to
     WHERE t.project_id = $1 ${accessSql}
     GROUP BY u.name
     ORDER BY count DESC`,
    accessParams
  );
  const overdue = await query(
    `SELECT COUNT(*)::INT AS count FROM tasks t
     WHERE t.project_id = $1 ${accessSql} AND t.status <> 'Done' AND t.due_date < CURRENT_DATE`,
    accessParams
  );

  res.json({
    totalTasks: total.rows[0].total,
    tasksByStatus: byStatus.rows,
    tasksPerUser: perUser.rows,
    overdueTasks: overdue.rows[0].count
  });
});

const distPath = path.join(__dirname, "..", "dist");
app.use(express.static(distPath));
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(500).json({ message: "Unexpected server error." });
});

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is required.");
}

app.listen(port, "0.0.0.0", () => {
  console.log(`Team Task Manager running on 0.0.0.0:${port}`);
  initDb()
    .then(() => {
      dbReady = true;
      dbStartupError = null;
      console.log("Database initialized.");
    })
    .catch((error) => {
      dbReady = false;
      dbStartupError = error;
      console.error("Database initialization failed:", error.message);
      console.error(error);
    });
});
