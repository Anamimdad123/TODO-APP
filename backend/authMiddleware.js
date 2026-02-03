const { CognitoJwtVerifier } = require("aws-jwt-verify");

// CHANGE: Use "id" token instead of "access" token
const verifier = CognitoJwtVerifier.create({
  userPoolId: "us-east-1_7e06SpUx4",
  tokenUse: "id",  // Changed from "access" to "id"
  clientId: "55kagtn0qce3qhrml4id2l11i2",
});

const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      console.error("❌ No Authorization header provided");
      return res.status(401).json({ error: "Authorization header missing" });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      console.error("❌ Malformed Authorization header");
      return res.status(401).json({ error: "Malformed authorization header" });
    }

    const payload = await verifier.verify(token);
    const groups = payload["cognito:groups"] || [];
    
    let role = "Candidate";
    if (groups.includes("Admin")) {
      role = "Admin";
    } else if (groups.includes("Employee")) {
      role = "Employee";
    }

    req.user = {
      cognito_id: payload.sub,
      email: payload.email || payload.username,
      firstName: payload.given_name || payload["custom:firstName"] || "User",
      groups,
      user_role: role,
    };

    console.log(`✅ Token verified for user: ${req.user.email} (${role})`);
    next();
    
  } catch (err) {
    console.error("❌ Token verification failed:", err.message);
    
    if (err.message.includes("expired")) {
      return res.status(401).json({ error: "Token has expired. Please sign in again." });
    }
    
    if (err.message.includes("invalid")) {
      return res.status(401).json({ error: "Invalid token. Please sign in again." });
    }
    
    return res.status(401).json({ error: "Authentication failed" });
  }
};

const adminOnly = (req, res, next) => {
  if (!req.user) {
    console.error("❌ adminOnly: No user object found");
    return res.status(401).json({ error: "Authentication required" });
  }

  if (!req.user.groups.includes("Admin")) {
    console.error(`❌ adminOnly: User ${req.user.email} is not an Admin`);
    return res.status(403).json({ error: "Admin access required" });
  }

  console.log(`✅ Admin access granted to: ${req.user.email}`);
  next();
};

const employeeOrAdmin = (req, res, next) => {
  if (!req.user) {
    console.error("❌ employeeOrAdmin: No user object found");
    return res.status(401).json({ error: "Authentication required" });
  }

  const hasAccess = req.user.groups.includes("Admin") || req.user.groups.includes("Employee");
  
  if (!hasAccess) {
    console.error(`❌ employeeOrAdmin: User ${req.user.email} lacks required permissions`);
    return res.status(403).json({ error: "Employee or Admin access required" });
  }

  console.log(`✅ Employee/Admin access granted to: ${req.user.email}`);
  next();
};

const candidateOnly = (req, res, next) => {
  if (!req.user) {
    console.error("❌ candidateOnly: No user object found");
    return res.status(401).json({ error: "Authentication required" });
  }

  const isCandidate = !req.user.groups.includes("Admin") && !req.user.groups.includes("Employee");
  
  if (!isCandidate) {
    console.error(`❌ candidateOnly: User ${req.user.email} is not a Candidate`);
    return res.status(403).json({ error: "Candidate access only" });
  }

  console.log(`✅ Candidate access granted to: ${req.user.email}`);
  next();
};

module.exports = {
  verifyToken,
  adminOnly,
  employeeOrAdmin,
  candidateOnly
};