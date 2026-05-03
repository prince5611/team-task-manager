const jwt = require("jsonwebtoken");
const { query } = require("./db");

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token." });
  }
}

async function getMembership(projectId, userId) {
  const result = await query(
    "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2",
    [projectId, userId]
  );
  return result.rows[0] || null;
}

async function requireProjectMember(req, res, next) {
  const projectId = Number(req.params.projectId || req.body.projectId);
  if (!projectId) {
    return res.status(400).json({ message: "Project id is required." });
  }

  const membership = await getMembership(projectId, req.user.id);
  if (!membership) {
    return res.status(403).json({ message: "You are not a member of this project." });
  }

  req.projectId = projectId;
  req.membership = membership;
  next();
}

function requireAdmin(req, res, next) {
  if (req.membership?.role !== "Admin") {
    return res.status(403).json({ message: "Admin access required." });
  }
  next();
}

module.exports = { requireAuth, requireProjectMember, requireAdmin, getMembership };
