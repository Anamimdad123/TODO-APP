require('dotenv').config(); 
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const { verifyToken, adminOnly, employeeOrAdmin } = require("./authMiddleware");

const app = express();

/* ===================== CORS CONFIGURATION ===================== */
app.use(cors({ 
    origin: [
        "http://localhost:5173", 
        "http://localhost:5174",
        "http://localhost:3000",
        "https://main.d18b34rzjw22p4.amplifyapp.com" 
    ], 
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

/* ===================== DATABASE CONNECTION ===================== */
const db = mysql.createPool({
  host: process.env.DB_HOST || "database-1.cvuukc64q17g.us-east-1.rds.amazonaws.com",
  user: process.env.DB_USER || "admin",
  password: process.env.DB_PASSWORD || "Anumimdad12",
  database: process.env.DB_NAME || "my_app_data",
  port: 3306,
  connectionLimit: 10,
  ssl: { rejectUnauthorized: false }
});

// Verify Connection
db.getConnection((err, conn) => {
    if (err) console.error("❌ RDS Connection Error:", err.message);
    else { 
        console.log("✅ Connected to RDS MySQL"); 
        conn.release(); 
    }
});

/* ===================== DB HELPERS ===================== */
const syncUserToDb = (userData) => {
  return new Promise((resolve, reject) => {
    const { cognito_id, email, firstName } = userData;
    const safeName = firstName || "User";
    // Force Admin for your email, others default to Candidate
    const safeRole = (email === "imdadanam4@gmail.com") ? "Admin" : "Candidate";

    const sql = `
      INSERT INTO users (cognito_id, email, firstName, user_role)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE email = VALUES(email), firstName = VALUES(firstName)
    `;

    db.query(sql, [cognito_id, email, safeName, safeRole], (err) => {
      if (err) reject(err);
      else resolve(safeRole);
    });
  });
};

/* ===================== ROUTES ===================== */

app.get("/", (req, res) => res.send("🚀 Taskflow Backend is Live"));

// SYNC USER
app.post("/sync-user", verifyToken, async (req, res) => {
  try {
    const { cognito_id } = req.user;
    db.query("SELECT user_role FROM users WHERE cognito_id = ?", [cognito_id], async (err, rows) => {
      if (err) return res.status(500).json({ error: "DB Fetch error" });
      
      if (rows.length > 0) {
        return res.json({ message: "Synced", role: rows[0].user_role });
      } else {
        const role = await syncUserToDb(req.user);
        return res.json({ message: "Created", role: role });
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Sync failed" });
  }
});

// GET ALL USERS (Admin/Employee Only)
app.get("/users", verifyToken, employeeOrAdmin, (req, res) => {
  const { cognito_id } = req.user;
  db.query("SELECT user_role FROM users WHERE cognito_id = ?", [cognito_id], (err, userRows) => {
    if (err) return res.status(500).json({ error: "Auth check failed" });
    
    const actualRole = userRows[0]?.user_role || "Candidate";
    let sql = "SELECT cognito_id, email, firstName, user_role FROM users ORDER BY firstName";
    let params = [];

    if (actualRole === "Employee") {
      sql = "SELECT cognito_id, email, firstName, user_role FROM users WHERE user_role = 'Candidate' ORDER BY firstName";
    }

    db.query(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });
});

// GET OWN TASKS
app.get("/tasks", verifyToken, (req, res) => {
  db.query("SELECT * FROM tasks WHERE user_id=? ORDER BY created_at DESC", [req.user.cognito_id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// GET SPECIFIC USER TASKS (For Directory "View Tasks")
app.get("/tasks/:id", verifyToken, employeeOrAdmin, (req, res) => {
  db.query("SELECT * FROM tasks WHERE user_id=? ORDER BY created_at DESC", [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ error: "Fetch failed" });
    res.json(rows);
  });
});

// ADD TASK
app.post("/add-task", verifyToken, (req, res) => {
  const { task_text, status } = req.body;
  const uid = req.user.cognito_id;

  if (!task_text) return res.status(400).json({ error: "Text required" });

  // Safety check: ensure user exists before inserting task
  db.query("SELECT cognito_id FROM users WHERE cognito_id = ?", [uid], (err, rows) => {
      if (err || rows.length === 0) return res.status(400).json({ error: "User profile not found. Please refresh." });

      db.query(
        "INSERT INTO tasks (user_id, task_text, status) VALUES (?, ?, ?)",
        [uid, task_text, status || "Personal"],
        (err, result) => {
          if (err) return res.status(500).json({ error: "Insert failed: " + err.message });
          
          res.status(201).json({ 
            task_id: result.insertId, 
            user_id: uid,
            task_text, 
            status: status || "Personal",
            created_at: new Date()
          });
        }
      );
  });
});

// DELETE TASK (Admin Authority included)
app.delete("/delete-task/:id", verifyToken, (req, res) => {
    const uid = req.user.cognito_id;
    db.query("SELECT user_role FROM users WHERE cognito_id = ?", [uid], (err, rows) => {
        if (err) return res.status(500).json({ error: "Auth check failed" });
        
        const isAdmin = rows[0]?.user_role === "Admin";
        const sql = isAdmin ? "DELETE FROM tasks WHERE task_id=?" : "DELETE FROM tasks WHERE task_id=? AND user_id=?";
        const params = isAdmin ? [req.params.id] : [req.params.id, uid];

        db.query(sql, params, (err) => {
            if (err) return res.status(500).json({ error: "Delete failed" });
            res.json({ message: "Deleted" });
        });
    });
});

// UPDATE ROLE (Admin Only)
app.put("/update-role/:id", verifyToken, adminOnly, (req, res) => {
  db.query("UPDATE users SET user_role=? WHERE cognito_id=?", [req.body.role, req.params.id], (err) => {
    if (err) return res.status(500).json({ error: "Update failed" });
    res.json({ message: "Role Updated" });
  });
});

// DELETE USER (Admin Only)
app.delete("/delete-user/:id", verifyToken, adminOnly, (req, res) => {
    if (req.params.id === req.user.cognito_id) return res.status(400).json({ error: "Cannot delete yourself" });
    
    db.query("DELETE FROM users WHERE cognito_id = ?", [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: "User deletion failed" });
        res.json({ message: "User removed" });
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Running on ${PORT}`));