import React, { useEffect, useState } from "react";
import axios from "axios";
import "./Dashboard.css";

const API = "http://localhost:5000";

export default function Dashboard({ profile }) {
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [text, setText] = useState("");
  const [editId, setEditId] = useState(null);

  /* ================= FETCH DATA ================= */

  useEffect(() => {
    if (profile?.user_role === "Candidate") fetchTasks();
    if (profile?.user_role !== "Candidate") fetchUsers();
  }, [profile]);

  const fetchTasks = async () => {
    const res = await axios.get(`${API}/tasks/${profile.cognito_id}`);
    setTasks(res.data);
  };

  const fetchUsers = async () => {
    const res = await axios.get(`${API}/users`);
    setUsers(res.data);
  };

  /* ================= TASKS ================= */

  const saveTask = async () => {
    if (!text.trim()) return;

    if (editId) {
      await axios.put(`${API}/update-task/${editId}`, { task_text: text });
      setEditId(null);
    } else {
      await axios.post(`${API}/add-task`, {
        cognito_id: profile.cognito_id,
        email: profile.email,
        task_text: text,
        user_role: profile.user_role,
      });
    }

    setText("");
    fetchTasks();
  };

  const deleteTask = async (id) => {
    await axios.delete(`${API}/delete-task/${id}`);
    fetchTasks();
  };

  /* ================= USERS ================= */

  const updateRole = async (id, role) => {
    await axios.put(`${API}/assign-role/${id}`, { role });
    fetchUsers();
  };

  const deleteUser = async (id) => {
    await axios.delete(`${API}/delete-user/${id}`);
    fetchUsers();
  };

  /* ================= UI ================= */

  return (
    <div className="layout">
      <aside className="sidebar">
        <h2>MyApp</h2>
        <p className="role">{profile.user_role}</p>
      </aside>

      <main className="content">
        {/* ================= ADMIN ================= */}
        {profile.user_role === "Admin" && (
          <>
            <h2>Admin Dashboard</h2>
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td>
                      <select
                        value={u.user_role}
                        onChange={e => updateRole(u.id, e.target.value)}
                      >
                        <option>Admin</option>
                        <option>Employer</option>
                        <option>Candidate</option>
                      </select>
                    </td>
                    <td>
                      <button className="danger" onClick={() => deleteUser(u.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* ================= EMPLOYER ================= */}
        {profile.user_role === "Employer" && (
          <>
            <h2>Employer Dashboard</h2>
            <div className="cards">
              {users
                .filter(u => u.user_role === "Candidate")
                .map(c => (
                  <div key={c.id} className="card">
                    <div className="avatar">{c.email[0]}</div>
                    <p>{c.email}</p>
                  </div>
                ))}
            </div>
          </>
        )}

        {/* ================= CANDIDATE ================= */}
        {profile.user_role === "Candidate" && (
          <>
            <h2>My Tasks</h2>

            <div className="task-input">
              <input
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Add task..."
              />
              <button onClick={saveTask}>
                {editId ? "Update" : "Add"}
              </button>
            </div>

            <ul className="task-list">
              {tasks.map(t => (
                <li key={t.task_id}>
                  {t.task_text}
                  <div>
                    <button onClick={() => {
                      setEditId(t.task_id);
                      setText(t.task_text);
                    }}>
                      Edit
                    </button>
                    <button className="danger" onClick={() => deleteTask(t.task_id)}>
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}
