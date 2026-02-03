import React, { useState, useEffect, useCallback } from "react";
import "./App.css";
import axios from "axios";

/* ================= AWS V6 CONFIGURATION ================= */
import { Amplify } from "aws-amplify";
import { getCurrentUser, fetchAuthSession } from "aws-amplify/auth";
import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import awsExports from "./aws-exports";

Amplify.configure(awsExports);

/* ================= API CONFIGURATION ================= */
const API_BASE_URL = import.meta.env.VITE_API_URL || "https://taskflow-backend-5.onrender.com";
// Make sure there's NO trailing slash ↑

console.log("API Base URL:", API_BASE_URL);

/* ================= MAIN DASHBOARD ================= */
function Dashboard({ signOut }) {
  const [profile, setProfile] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);

  // Form States
  const [newTask, setNewTask] = useState("");
  const [category, setCategory] = useState("Personal");

  // UI State
  const [activeScreen, setActiveScreen] = useState("dashboard");
  const [viewingUser, setViewingUser] = useState(null);
  const [viewingTasks, setViewingTasks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  /* ================= UTILITIES ================= */
  const getTimeOfDay = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  };

  const formattedDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const getRequestConfig = async () => {
    try {
      const { tokens } = await fetchAuthSession();
      const token = tokens?.idToken?.toString();
      
      if (!token) {
        throw new Error("No access token available");
      }
      
      return {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
      };
    } catch (err) {
      console.error("Auth session retrieval failed", err);
      throw err;
    }
  };

  /* ================= DATA MANAGEMENT ================= */
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // 1. Get Cognito Auth Data
      const { userId } = await getCurrentUser();
      const { tokens } = await fetchAuthSession();
      const config = await getRequestConfig();

      // 2. Sync with Backend to get Role
      const payload = tokens?.idToken?.payload;
      const syncResponse = await axios.post(`${API_BASE_URL}/sync-user`, {
        cognito_id: userId,
        email: payload?.email,
        firstName: payload?.given_name
      }, config);

      const databaseRole = syncResponse.data.role;

      setProfile({
        id: userId,
        name: payload?.given_name || "Guest",
        email: payload?.email,
        phone: payload?.phone_number || "Not listed",
        role: databaseRole,
      });

      // 3. Load User's Tasks
      const taskResponse = await axios.get(`${API_BASE_URL}/tasks`, config);
      setTasks(taskResponse.data);

      // 4. Load Administrative Data
      if (databaseRole === "Admin" || databaseRole === "Employee") {
        const usersResponse = await axios.get(`${API_BASE_URL}/users`, config);
        setUsers(usersResponse.data);
      }
    } catch (error) {
      console.error("Critical Load Error:", error);
      setError(error.response?.data?.error || error.message || "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ================= ACTIONS ================= */
  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!newTask.trim()) return;

    try {
      const config = await getRequestConfig();
      const response = await axios.post(`${API_BASE_URL}/add-task`, {
        task_text: newTask,
        status: category
      }, config);

      setTasks(prev => [response.data, ...prev]);
      setNewTask("");
    } catch (error) {
      console.error("Task creation failed:", error);
      alert(error.response?.data?.error || "Failed to create task");
    }
  };

  const handleDeleteTask = async (taskId, isExternalView = false) => {
    if (!window.confirm("Delete this record permanently?")) return;
    
    try {
      const config = await getRequestConfig();
      await axios.delete(`${API_BASE_URL}/delete-task/${taskId}`, config);

      if (isExternalView) {
        setViewingTasks(prev => prev.filter(t => t.task_id !== taskId));
      } else {
        setTasks(prev => prev.filter(t => t.task_id !== taskId));
      }
    } catch (error) {
      console.error("Delete failed:", error);
      alert(error.response?.data?.error || "Permission denied or server error.");
    }
  };

  const handleViewUser = async (target) => {
    try {
      const config = await getRequestConfig();
      // FIXED: Use cognito_id (which matches user_id in database)
      const response = await axios.get(`${API_BASE_URL}/tasks/${target.cognito_id}`, config);
      setViewingUser(target);
      setViewingTasks(response.data);
      setActiveScreen("user-profile");
    } catch (err) {
      console.error("Could not fetch user tasks", err);
      alert("Failed to load user tasks. " + (err.response?.data?.error || err.message));
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      const config = await getRequestConfig();
      await axios.put(`${API_BASE_URL}/update-role/${userId}`, { role: newRole }, config);
      setUsers(prev => prev.map(u => u.cognito_id === userId ? { ...u, user_role: newRole } : u));
    } catch (error) {
      console.error("Role update failed:", error);
      alert(error.response?.data?.error || "Role update failed.");
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm("Delete this user permanently? This will also delete all their tasks and cannot be undone.")) return;
    
    try {
      const config = await getRequestConfig();
      await axios.delete(`${API_BASE_URL}/delete-user/${userId}`, config);
      setUsers(prev => prev.filter(u => u.cognito_id !== userId));
      alert("User deleted successfully");
    } catch (error) {
      console.error("User deletion failed:", error);
      alert(error.response?.data?.error || "Failed to delete user.");
    }
  };

  if (isLoading) {
    return (
      <div className="app-loader">
        <div className="spinner"></div>
        <p>Initializing Workspace...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-loader">
        <div className="error-message">
          <h3>Connection Error</h3>
          <p>{error}</p>
          <button onClick={fetchData} className="primary-btn">Retry</button>
          <button onClick={signOut} className="secondary-btn">Sign Out</button>
        </div>
      </div>
    );
  }

  /* ================= UI RENDER ================= */
  return (
    <div className="app-layout">
      <nav className="app-sidebar">
        <div className="brand-area">
          <span className="brand-text">Taskflow</span>
        </div>
        
        <div className="nav-group">
          <button 
            className={activeScreen === "dashboard" ? "nav-btn active" : "nav-btn"} 
            onClick={() => { setViewingUser(null); setActiveScreen("dashboard"); }}
          >
            Dashboard
          </button>
          
          <button 
            className={activeScreen === "my-tasks" ? "nav-btn active" : "nav-btn"} 
            onClick={() => { setViewingUser(null); setActiveScreen("my-tasks"); }}
          >
            My Assignments
          </button>

          {profile?.role && profile.role !== "Candidate" && (
            <button 
              className={activeScreen === "directory" ? "nav-btn active" : "nav-btn"} 
              onClick={() => { setViewingUser(null); setActiveScreen("directory"); }}
            >
              {profile.role === "Admin" ? "User Management" : "Candidate List"}
            </button>
          )}
        </div>

        <div className="sidebar-footer">
          <div className="user-mini-profile">
            <p className="user-name">{profile?.name}</p>
            <p className="user-role-label">{profile?.role}</p>
          </div>
          <button className="sign-out-link" onClick={signOut}>Sign Out</button>
        </div>
      </nav>

      <main className="app-main">
        {activeScreen === "dashboard" && !viewingUser && (
          <section className="fade-in">
            <header className="content-header">
              <h1>{getTimeOfDay()}, {profile?.name}</h1>
              <p className="subtitle">{formattedDate}</p>
            </header>

            <div className="dashboard-grid">
              <div className="overview-card info">
                <h3>Account Details</h3>
                <p><strong>Email:</strong> {profile?.email}</p>
                <p><strong>Contact:</strong> {profile?.phone}</p>
                <span className="status-pill">{profile?.role}</span>
              </div>

              <div className="overview-card action" onClick={() => setActiveScreen("my-tasks")}>
                <h3>Current Tasks</h3>
                <div className="big-number">{tasks.length}</div>
                <p>Manage your personal board</p>
              </div>
            </div>
          </section>
        )}

        {activeScreen === "my-tasks" && !viewingUser && (
          <section className="fade-in">
            <div className="section-title">
              <h2>My Assignments</h2>
            </div>

            <form className="task-creator" onSubmit={handleAddTask}>
              <input 
                type="text"
                value={newTask} 
                onChange={(e) => setNewTask(e.target.value)} 
                placeholder="Enter task description..."
              />
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="Personal">Personal</option>
                <option value="Professional">Professional</option>
                <option value="Urgent">Urgent</option>
              </select>
              <button type="submit" className="primary-btn">Create</button>
            </form>

            <div className="grid-layout">
              {tasks.length > 0 ? (
                tasks.map((t) => (
                  <div key={t.task_id} className="assignment-card">
                    <div className="assignment-header">
                      <span className={`tag ${t.status?.toLowerCase() || 'personal'}`}>{t.status}</span>
                      <button className="remove-btn" onClick={() => handleDeleteTask(t.task_id)}>Remove</button>
                    </div>
                    <p className="assignment-text">{t.task_text}</p>
                  </div>
                ))
              ) : (
                <div className="empty-state">No tasks created yet.</div>
              )}
            </div>
          </section>
        )}

        {activeScreen === "directory" && !viewingUser && (
          <section className="fade-in">
            <div className="section-title">
              <h2>Organizational Directory</h2>
            </div>
            <div className="table-container">
              <table className="record-table">
                <thead>
                  <tr>
                    <th>Full Name</th>
                    <th>Email Address</th>
                    <th>Security Level</th>
                    <th>Operations</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.cognito_id}>
                      <td className="font-medium">{u.firstName}</td>
                      <td>{u.email}</td>
                      <td>
                        {profile?.role === "Admin" ? (
                          <select 
                            value={u.user_role} 
                            onChange={(e) => handleRoleChange(u.cognito_id, e.target.value)}
                            className="inline-select"
                          >
                            <option value="Admin">Admin</option>
                            <option value="Employee">Employee</option>
                            <option value="Candidate">Candidate</option>
                          </select>
                        ) : (
                          <span className="static-role">{u.user_role}</span>
                        )}
                      </td>
                      <td>
                        <button className="text-btn" onClick={() => handleViewUser(u)}>
                          View Records
                        </button>
                        {profile?.role === "Admin" && (
                          <button 
                            className="remove-btn" 
                            style={{marginLeft: '8px'}}
                            onClick={() => handleDeleteUser(u.cognito_id)}
                          >
                            Delete User
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeScreen === "user-profile" && viewingUser && (
          <section className="fade-in">
            <button 
              className="text-btn" 
              style={{marginBottom: '1rem'}} 
              onClick={() => {
                setViewingUser(null);
                setActiveScreen("directory");
              }}
            >
              ← Return to Directory
            </button>
            <div className="view-header">
              <h2>Records for {viewingUser.firstName}</h2>
              <p className="text-muted">{viewingUser.email}</p>
            </div>
            <div className="grid-layout" style={{marginTop: '2rem'}}>
              {viewingTasks.length > 0 ? (
                viewingTasks.map((t) => (
                  <div key={t.task_id} className="assignment-card">
                    <div className="assignment-header">
                      <span className={`tag ${t.status?.toLowerCase() || 'personal'}`}>{t.status}</span>
                      {profile?.role === "Admin" && (
                        <button className="remove-btn" onClick={() => handleDeleteTask(t.task_id, true)}>Remove</button>
                      )}
                    </div>
                    <p className="assignment-text">{t.task_text}</p>
                  </div>
                ))
              ) : (
                <div className="empty-state">No assignment history found.</div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

/* ================= AUTHENTICATION WRAPPER ================= */
export default function App() {
  const customFormFields = {
    signUp: {
      given_name: { 
        order: 1, 
        label: 'First Name', 
        placeholder: 'Enter first name', 
        required: true 
      },
      email: { order: 2, required: true },
      phone_number: { 
        order: 3, 
        label: 'Contact Number', 
        placeholder: '+1...', 
        required: true 
      },
      password: { order: 4 },
      confirm_password: { order: 5 },
    },
  };

  return (
    <Authenticator 
      formFields={customFormFields} 
      loginMechanisms={["email"]}
    >
      {({ signOut }) => <Dashboard signOut={signOut} />}
    </Authenticator>
  );
}