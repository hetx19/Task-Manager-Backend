const jwt = require("jsonwebtoken");

const protect = async (req, res, next) => {
  try {
    let token = req.headers.authorization;

    if (!token || !token.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ message: "Not authorized, token missing or token is invalid" });
    }

    token = token.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = { _id: decoded._id, role: decoded.role };
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res
        .status(401)
        .json({ message: "Token expired. Please log in again." });
    } else if (error.name === "JsonWebTokenError") {
      return res
        .status(403)
        .json({ message: "Invalid token. Please log in again." });
    } else {
      return res.status(401).json({ message: "Not authorized" });
    }
  }
};

const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    return res.status(403).json({ message: "Access denied, Only for admin" });
  }
};

module.exports = { protect, adminOnly };
