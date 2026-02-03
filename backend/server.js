require('dotenv').config(); 
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const { verifyToken, adminOnly, employeeOrAdmin } = require("./authMiddleware");

const app = express();

/* ===================== CORS CONFIGURATION ===================== */
app.use(cors({ 
    origin: function(origin, callback) {
        if (!origin) return callback(null, true);
        
        const allowedOrigins = [
            "http://localhost:5173", 
            "http://localhost:5174",
            "http://localhost:3000",
            "https://main.d18b34rzjw22p4.amplifyapp.com"
        ];
        
        if (origin.includes('.amplifyapp.com') || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        
        callback(new Error('Not allowed by CORS'));
    },
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
  waitForConnections: true,
  queueLimit: 0,
  ssl: { rejectUnauthorized: false }
});

db.getConnection((err, conn) => {
    if (err) {
        console.error("❌ RDS Connection Error:", err.message);
    } else { 
        console.log("✅ Connected to RDS MySQL"); 
        conn.release(); 
    }
});

/* ===================== DB HELPERS ===================== */
const syncUserToDb = (userData) => {
  return new Promise((resolve, reject) => {
    const { cognito_id, email, firstName } = userData;
    const safeName = firstName || "User";
    const safeRole = (email === "imdadanam4@gmail.com") ? "Admin" : "Candidate";

    const sql = `
      INSERT INTO users (cognito_id, email, firstName, user_role)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE email = VALUES(email), firstName = VALUES(firstName)
    `;

    db.query(sql, [cognito_id, email, safeName, safeRole], (err) => {
      if (err) {
        console.error("DB Sync Error:", err);
        reject(err);
      } else {
        console.log(`✅ User synced: ${email} as ${safeRole}`);
        resolve(safeRole);
      }
    });
  });
};

/* ===================== ROUTES ===================== */

app.get("/", (req, res) => {
    res.json({ 
        status: "online", 
        message: "🚀 Taskflow Backend is Live",
        timestamp: new Date().toISOString()
    });
});

app.get("/health", (req, res) => {
    db.getConnection((err, conn) => {
        if (err) {
            return res.status(500).json({ status: "unhealthy", database: "disconnected" });
        }
        conn.release();
        res.json({ status: "healthy", database: "connected" });
    });
});

app.post("/sync-user", verifyToken, async (req, res) => {
  try {
    const { cognito_id, email, firstName } = req.user;
    
    db.query("SELECT user_role FROM users WHERE cognito_id = ?", [cognito_id], async (err, rows) => {
      if (err) {
        console.error("DB Fetch error:", err);
        return res.status(500).json({ error: "Database query failed" });
      }
      
      if (rows.length > 0) {
        console.log(`User ${email} already exists with role: ${rows[0].user_role}`);
        return res.json({ message: "Synced", role: rows[0].user_role });
      } else {
        try {
          const role = await syncUserToDb({ cognito_id, email, firstName });
          return res.json({ message: "Created", role: role });
        } catch (syncErr) {
          console.error("Sync error:", syncErr);
          return res.status(500).json({ error: "Failed to create user" });
        }
      }
    });
  } catch (err) {
    console.error("Sync failed:", err);
    res.status(500).json({ error: "Sync operation failed" });
  }
});

app.get("/users", verifyToken, employeeOrAdmin, (req, res) => {
  const { cognito_id } = req.user;
  
  db.query("SELECT user_role FROM users WHERE cognito_id = ?", [cognito_id], (err, userRows) => {
    if (err) {
      console.error("Auth check failed:", err);
      return res.status(500).json({ error: "Authorization check failed" });
    }
    
    const actualRole = userRows[0]?.user_role || "Candidate";
    let sql = "SELECT cognito_id, email, firstName, user_role FROM users ORDER BY firstName";
    let params = [];

    if (actualRole === "Employee") {
      sql = "SELECT cognito_id, email, firstName, user_role FROM users WHERE user_role = 'Candidate' ORDER BY firstName";
    }

    db.query(sql, params, (err, rows) => {
      if (err) {
        console.error("Users query failed:", err);
        return res.status(500).json({ error: "Failed to fetch users" });
      }
      res.json(rows);
    });
  });
});

app.get("/tasks", verifyToken, (req, res) => {
  const { cognito_id } = req.user;
  
  db.query("SELECT * FROM tasks WHERE user_id=? ORDER BY created_at DESC", [cognito_id], (err, rows) => {
    if (err) {
      console.error("Tasks query failed:", err);
      return res.status(500).json({ error: "Failed to fetch tasks" });
    }
    res.json(rows);
  });
});

app.get("/tasks/:id", verifyToken, employeeOrAdmin, (req, res) => {
  const targetUserId = req.params.id;
  
  db.query("SELECT * FROM tasks WHERE user_id=? ORDER BY created_at DESC", [targetUserId], (err, rows) => {
    if (err) {
      console.error("User tasks query failed:", err);
      return res.status(500).json({ error: "Failed to fetch user tasks" });
    }
    res.json(rows);
  });
});

app.post("/add-task", verifyToken, (req, res) => {
  const { task_text, status } = req.body;
  const uid = req.user.cognito_id;

  if (!task_text || !task_text.trim()) {
    return res.status(400).json({ error: "Task text is required" });
  }

  db.query("SELECT cognito_id FROM users WHERE cognito_id = ?", [uid], (err, rows) => {
      if (err) {
          console.error("User lookup failed:", err);
          return res.status(500).json({ error: "Database error" });
      }
      
      if (rows.length === 0) {
          return res.status(400).json({ error: "User profile not found. Please refresh." });
      }

      db.query(
        "INSERT INTO tasks (user_id, task_text, status) VALUES (?, ?, ?)",
        [uid, task_text.trim(), status || "Personal"],
        (err, result) => {
          if (err) {
            console.error("Task insert failed:", err);
            return res.status(500).json({ error: "Failed to create task" });
          }
          
          console.log(`✅ Task created: ID ${result.insertId} for user ${uid}`);
          
          res.status(201).json({ 
            task_id: result.insertId, 
            user_id: uid,
            task_text: task_text.trim(), 
            status: status || "Personal",
            created_at: new Date()
          });
        }
      );
  });
});

app.delete("/delete-task/:id", verifyToken, (req, res) => {
    const taskId = req.params.id;
    const uid = req.user.cognito_id;
    
    db.query("SELECT user_role FROM users WHERE cognito_id = ?", [uid], (err, rows) => {
        if (err) {
            console.error("Auth check failed:", err);
            return res.status(500).json({ error: "Authorization check failed" });
        }
        
        const isAdmin = rows[0]?.user_role === "Admin";
        const sql = isAdmin 
            ? "DELETE FROM tasks WHERE task_id=?" 
            : "DELETE FROM tasks WHERE task_id=? AND user_id=?";
        const params = isAdmin ? [taskId] : [taskId, uid];

        db.query(sql, params, (err, result) => {
            if (err) {
                console.error("Task delete failed:", err);
                return res.status(500).json({ error: "Failed to delete task" });
            }
            
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: "Task not found or unauthorized" });
            }
            
            console.log(`✅ Task deleted: ID ${taskId}`);
            res.json({ message: "Task deleted successfully" });
        });
    });
});

app.put("/update-role/:id", verifyToken, adminOnly, (req, res) => {
  const targetUserId = req.params.id;
  const { role } = req.body;
  
  if (!["Admin", "Employee", "Candidate"].includes(role)) {
    return res.status(400).json({ error: "Invalid role" });
  }
  
  db.query("UPDATE users SET user_role=? WHERE cognito_id=?", [role, targetUserId], (err, result) => {
    if (err) {
      console.error("Role update failed:", err);
      return res.status(500).json({ error: "Failed to update role" });
    }
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    
    console.log(`✅ Role updated: User ${targetUserId} -> ${role}`);
    res.json({ message: "Role updated successfully" });
  });
});

app.delete("/delete-user/:id", verifyToken, adminOnly, (req, res) => {
    const targetUserId = req.params.id;
    
    if (targetUserId === req.user.cognito_id) {
        return res.status(400).json({ error: "Cannot delete yourself" });
    }
    
    db.query("DELETE FROM tasks WHERE user_id = ?", [targetUserId], (err) => {
        if (err) {
            console.error("Task cleanup failed:", err);
            return res.status(500).json({ error: "Failed to clean up user tasks" });
        }
        
        db.query("DELETE FROM users WHERE cognito_id = ?", [targetUserId], (err, result) => {
            if (err) {
                console.error("User deletion failed:", err);
                return res.status(500).json({ error: "Failed to delete user" });
            }
            
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: "User not found" });
            }
            
            console.log(`✅ User deleted: ${targetUserId}`);
            res.json({ message: "User deleted successfully" });
        });
    });
});

app.use((err, req, res, next) => {
    console.error("Unhandled Error:", err);
    res.status(500).json({ error: "Internal server error" });
});

app.use((req, res) => {
    res.status(404).json({ error: "Route not found" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Taskflow Backend running on port ${PORT}`);
    console.log(`📅 Started at: ${new Date().toISOString()}`);
});