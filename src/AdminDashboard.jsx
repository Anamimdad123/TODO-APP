import React, { useEffect, useState } from "react";
import axios from "axios";

const API = "http://localhost:5000";

export default function AdminDashboard({ profile }) {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    axios.get(`${API}/users`).then(res => setUsers(res.data));
  }, []);

  const changeRole = async (id, role) => {
    await axios.put(`${API}/assign-role/${id}`, { role });
    setUsers(prev =>
      prev.map(u => (u.id === id ? { ...u, user_role: role } : u))
    );
  };

  return (
    <div className="todo-card">
      <h2>Admin Dashboard</h2>

      <table className="admin-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Role</th>
            <th>Assign</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id}>
              <td>{u.email}</td>
              <td>{u.user_role}</td>
              <td>
                <select
                  value={u.user_role}
                  onChange={e => changeRole(u.id, e.target.value)}
                >
                  <option>Admin</option>
                  <option>Employer</option>
                  <option>Candidate</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
