# Demo Video Script

Target length: 2 to 5 minutes.

## 1. Introduction

This is a full-stack Team Task Manager built with React, Express, PostgreSQL, and JWT authentication. It lets users create projects, manage members, assign tasks, and track progress through dashboard metrics.

## 2. Authentication

Show signup with name, email, and password. Then show login. Mention that passwords are hashed with bcrypt and the backend returns a JWT for authenticated API requests.

## 3. Project and Members

Create a project. Explain that the creator is automatically added as Admin. Add another registered user by email as a Member.

## 4. Tasks

Create tasks with title, description, due date, priority, and assignee. Move one task from To Do to In Progress, and another to Done.

## 5. Role-Based Access

Login as the Member user. Show that members can only view and update tasks assigned to them. Mention that Admin users can manage members and all project tasks.

## 6. Dashboard

Show total tasks, completed tasks, overdue tasks, and task count per user. Explain that these numbers come from backend aggregation queries.

## 7. Deployment

Open the live Railway URL and the GitHub repository. Mention the app uses Railway environment variables for `DATABASE_URL`, `JWT_SECRET`, and `NODE_ENV`.
