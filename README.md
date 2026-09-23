# COcolabs

> **Real-Time Collaborative Code Editor & Technical Interview Platform**

COcolabs is a modern, high-performance pair-programming and technical interviewing platform where multiple developers can write, review, and execute code simultaneously in real time. It features a Monaco-based IDE, sandboxed multi-language execution (C++, Java, Python 3), custom test input (stdin) console, persistent projects with PostgreSQL, and point-in-time version history.

---
<img width="1367" height="916" alt="image" src="https://github.com/user-attachments/assets/95461431-b223-4ea0-8409-2c4747ebc9ad" />
<img width="1828" height="842" alt="image" src="https://github.com/user-attachments/assets/d85532ee-b09f-409c-a841-f60b15822494" />
<img width="1387" height="617" alt="image" src="https://github.com/user-attachments/assets/d00787bd-fa81-49c5-9c5a-93bf31204a38" />
<img width="1336" height="611" alt="image" src="https://github.com/user-attachments/assets/69aa00ee-27c2-4181-8e89-3a029d98ba1c" />
<img width="1357" height="636" alt="image" src="https://github.com/user-attachments/assets/4ef04a3c-9334-4295-a6a6-0eb57d2549e2" />

## ⚡ Features

- **Real-Time Collaborative Editing**:
  - Powered by ShareDB and WebSockets for sub-millisecond, conflict-free multi-user typing.
  - Live cursor selection and presence tracking for active participants.

- **Multi-Language Support**:
  - First-class support for **C++**, **Java**, and **Python 3**.
  - starter boilerplates that update dynamically when switching languages.

- **Sandboxed Code Execution**:
  - Safe code running with hard resource constraints: 5000ms timeout, memory limit cap, CPU constraints, and isolated environment.
  - Ephemeral container runner with automatic fallback to isolated process sandboxing.
  - Guaranteed post-execution cleanup of all temporary source files and binaries.

- ** Test Console (stdin / stdout)**:
  - Dedicated custom input box that allows to run code against edge cases, custom arrays, and data structures.
  - Execution telemetry displaying duration in milliseconds (`⏱ ms`), status indicators, stdout output, and highlighted stderr diagnostics.

- **Version History Management**:
  - Immutable point-in-time code snapshots (`v1`, `v2`, `v3...`).
  - Ability to save, inline-rename, delete, and one-click restore code across active collaborators.

- **Authentication & Role-Based Access Control (RBAC)**:
  - Secure signup and login with salted `bcrypt` password hashing and stateless JWT tokens.
  - Granular permissions:
    - **Owner**: Full workspace management, member role assignments, and project settings.
    - **Editor**: Active editing, code execution, test data input, and version snapshotting.
    - **Viewer**: Read-only observation mode tailored for interview observers.

- **Modern IDE Interface & Dark/Light Themes**:
  - Monaco editor with syntax highlighting, line numbers, indent guides, and smooth caret animation.
  - Active file tabs (`main.cpp`, `Main.java`, `main.py`) with language indicator dots.
  - Cohesive workspace-wide **Light** and **Dark** mode toggle.
  - Clean 8-character room codes for rapid sharing.

---

## 🏗 Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React, Monaco Editor, ReconnectingWebSocket, CSS Modules |
| **Backend** | Node.js, Express, ShareDB, WebSockets (`ws`) |
| **Database** | PostgreSQL (`pg` pool) with automated schema migrations & local dev fallback |
| **Security** | JSON Web Tokens (JWT), bcryptjs, CORS |
| **Execution** | Ephemeral Docker containers / Isolated Process Sandbox |

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- Node.js (v16+)
- npm or yarn

### 1. Clone the Repository
```bash
git clone https://github.com/NANDINIyerramilli/CO.colabs.git
cd CO.colabs
```

### 2. Backend Setup
```bash
cd editor-backend

# Install dependencies
npm install

# (Optional) Set up environment variables
cp .env.example .env

# Start backend server (runs on http://localhost:5000)
npm start
```
*Note: If `DATABASE_URL` is not provided, the backend automatically runs with an embedded zero-setup dev database storage.*

### 3. Frontend Setup
In a new terminal window:
```bash
cd editor

# Install dependencies
npm install

# (Optional) Set up environment variables
cp .env.example .env

# Start React development client (runs on http://localhost:3000)
npm start
```

---

## 🧪 Running Tests

Run the automated backend test suite:
```bash
cd editor-backend
npm test
```

---

## 📂 Project Structure

```
CO.colabs/
├── editor/                     # React Frontend Application
│   ├── public/                 # Static assets & HTML template
│   ├── src/
│   │   ├── Components/
│   │   │   ├── Auth/           # Login & Signup views
│   │   │   ├── Dashboard/      # Workspaces list & room creation
│   │   │   ├── Editor/         # Monaco editor & Test Console UI
│   │   │   ├── Home/           # Landing page
│   │   │   └── Loader/         # Loading spinner
│   │   ├── Containers/         # Container state handlers
│   │   ├── Context/            # Global AuthContext & JWT persistence
│   │   └── EditorBinding/      # ShareDB string and diff bindings
│   ├── package.json
│   └── vercel.json             # Vercel deployment configuration
│
├── editor-backend/             # Express & ShareDB Backend
│   ├── Middleware/             # JWT auth middleware
│   ├── Routes/                 # Auth, projects, and codeRun API routes
│   ├── Services/               # Sandboxed execution runner
│   ├── tests/                  # Automated verification test suite
│   ├── db.js                   # PostgreSQL & storage layer
│   ├── index.js                # Server entry point & WebSockets
│   └── package.json
│
├── Dockerfile                  # Sandbox container definition
├── render.yaml                 # Render cloud deployment blueprint
└── README.md
```

---

