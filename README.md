# Team Task Manager

A full-stack team task management web app with authentication, projects, role-based access, assignable tasks, and dashboard analytics.

## Features

- Signup and secure login with JWT
- Project creation where the creator becomes Admin
- Admin member management by user email
- Task creation with title, description, due date, priority, assignee, and status
- Member-only task view for assigned tasks
- Dashboard metrics for total tasks, tasks by status, tasks per user, and overdue tasks
- RESTful Express API with PostgreSQL relationships and validation

## Tech Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Database: PostgreSQL
- Auth: JWT + bcrypt password hashing
- Deployment: Railway

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example` and update `DATABASE_URL` and `JWT_SECRET`.

3. Start PostgreSQL locally and create the database:

```sql
CREATE DATABASE team_task_manager;
```

4. Run the app:

```bash
npm run dev
```

Frontend: `http://localhost:5173`  
Backend: `http://localhost:5000`

## Railway Deployment

1. Push this project to GitHub.
2. Create a new Railway project from the GitHub repository.
3. Add a Railway PostgreSQL database from the project canvas.
4. Add these environment variables to the web service:

```text
DATABASE_URL=<Railway Postgres connection string>
JWT_SECRET=<long random secret>
NODE_ENV=production
```

5. Set the Railway build command:

```bash
npm install && npm run build
```

6. Set the Railway start command:

```bash
npm start
```

The server automatically creates the required tables on startup.

`railway.toml` is included so Railway can use the same build, start, and healthcheck settings automatically.

## API Summary

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:projectId/members`
- `POST /api/projects/:projectId/members`
- `DELETE /api/projects/:projectId/members/:userId`
- `GET /api/projects/:projectId/tasks`
- `POST /api/projects/:projectId/tasks`
- `PATCH /api/projects/:projectId/tasks/:taskId`
- `DELETE /api/projects/:projectId/tasks/:taskId`
- `GET /api/projects/:projectId/dashboard`

## Demo Flow

1. Create two users.
2. Login as the first user and create a project.
3. Add the second user as a member by email.
4. Create and assign tasks with different priorities and due dates.
5. Login as the member and update an assigned task status.
6. Return as admin and show dashboard metrics.
