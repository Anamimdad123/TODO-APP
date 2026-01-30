import React, { useEffect, useState } from "react";
import axios from "axios";

const API = "http://localhost:5000";

export default function EmployerDashboard() {
  const [candidates, setCandidates] = useState([]);

  useEffect(() => {
    axios.get(`${API}/users`).then(res => {
      setCandidates(res.data.filter(u => u.user_role === "Candidate"));
    });
  }, []);

  return (
    <div className="todo-card">
      <h2>Employer Dashboard</h2>

      <div className="candidate-grid">
        {candidates.map(c => (
          <div key={c.id} className="candidate-box">
            <div className="avatar">{c.email[0].toUpperCase()}</div>
            <p>{c.email}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
