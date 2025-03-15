[11:57 AM, 3/15/2025] lax: /hrm-attendance-system
│── /config
│   ├── db.js               # Database connection
│── /controllers
│   ├── authController.js    # User authentication (Register, Login)
│   ├── attendanceController.js # Attendance tracking
│   ├── leaveController.js   # Leave management
│   ├── walletController.js  # Salary & balance tracking
│── /models
│   ├── userModel.js
│   ├── attendanceModel.js
│   ├── leaveModel.js
│   ├── walletModel.js
│── /routes
│   ├── authRoutes.js
│   ├── attendanceRoutes.js
│   ├── leaveRoutes.js
│   ├── walletRoutes.js
│── /middleware
│   ├── authMiddleware.js    # JWT Authentication Middleware
│── /utils
│   ├── helpers.js
│── server.js
│── package.json
│── .env
[11:57 AM, 3/15/2025] lax:



CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(100) UNIQUE,
    password VARCHAR(255),
    role ENUM('admin', 'manager', 'employee') DEFAULT 'employee',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
[11:58 AM, 3/15/2025] lax: CREATE TABLE attendance (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    check_in DATETIME NOT NULL,
    check_out DATETIME DEFAULT NULL,
    total_work_time TIME DEFAULT '00:00:00',
    overtime TIME DEFAULT '00:00:00',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
[11:58 AM, 3/15/2025] lax: const express = require("express");
const dotenv = require("dotenv");
const authRoutes = require("./routes/authRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");

dotenv.config();
const app = express();
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/attendance", attendanceRoutes);

app.listen(5000, () => console.log("Server running on port 5000"));
[11:59 AM, 3/15/2025] lax: const express = require("express");
const { checkIn, checkOut } = require("../controllers/attendanceController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/check-in", authMiddleware, checkIn);
router.post("/check-out", authMiddleware, checkOut);

module.exports = router;
[11:59 AM, 3/15/2025] lax: const express = require("express");
const { register, login } = require("../controllers/authController");
const router = express.Router();

router.post("/register", register);
router.post("/login", login);

module.exports = router;
[12:00 PM, 3/15/2025] lax: const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../config/db");

// Register User
exports.register = async (req, res) => {
  const { name, email, password, role } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  
  db.query("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)", 
    [name, email, hashedPassword, role || "employee"], 
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ message: "User registered successfully" });
    }
  );
};

// Login User
exports.login = (req, res) => {
  const { email, password } = req.body;

  db.query("SELECT * FROM users WHERE email = ?", [email], async (err, users) => {
    if (err || users.length === 0) return res.status(401).json({ error: "Invalid credentials" });

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "1d" });
    res.json({ token });
  });
};
[12:00 PM, 3/15/2025] lax: const db = require("../config/db");

// Maximum work time before overtime (8 hours 20 minutes)
const MAX_WORK_TIME = 8 * 60 + 20; // Convert to minutes (500 minutes)

// Employee Check-in
exports.checkIn = (req, res) => {
    const user_id = req.user.id;

    db.query(
        "INSERT INTO attendance (user_id, check_in) VALUES (?, NOW())",
        [user_id],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "Check-in recorded successfully" });
        }
    );
};

// Employee Check-out (Calculate Work & Overtime)
exports.checkOut = (req, res) => {
    const user_id = req.user.id;

    // Fetch Last Check-in Time
    db.query(
        "SELECT id, check_in, total_work_time FROM attendance WHERE user_id = ? AND check_out IS NULL ORDER BY id DESC LIMIT 1",
        [user_id],
        (err, results) => {
            if (err) return res.status(500).json({ error: err.message });
            if (results.length === 0) return res.status(400).json({ error: "No active check-in found!" });

            const checkInTime = new Date(results[0].check_in);
            const attendanceId = results[0].id;
            const checkOutTime = new Date();

            // Calculate Worked Time (Check-out - Check-in)
            const workedMilliseconds = checkOutTime - checkInTime;
            const workedMinutes = Math.floor(workedMilliseconds / 60000);
            const workedHours = Math.floor(workedMinutes / 60);
            const workedTime = ${workedHours}:${workedMinutes % 60}:00;

            // Fetch Total Work Time for Today
            db.query(
                "SELECT SEC_TO_TIME(SUM(TIME_TO_SEC(total_work_time))) AS total_work_time FROM attendance WHERE user_id = ? AND DATE(check_in) = CURDATE()",
                [user_id],
                (err, workResults) => {
                    if (err) return res.status(500).json({ error: err.message });

                    let totalMinutesWorked = 0;
                    if (workResults[0].total_work_time) {
                        const [hh, mm, ss] = workResults[0].total_work_time.split(":").map(Number);
                        totalMinutesWorked = hh * 60 + mm;
                    }

                    // Add Current Work Session Time
                    totalMinutesWorked += workedMinutes;

                    // Calculate Overtime
                    let overtimeMinutes = totalMinutesWorked > MAX_WORK_TIME ? totalMinutesWorked - MAX_WORK_TIME : 0;
                    let overtimeHours = Math.floor(overtimeMinutes / 60);
                    let overtimeTime = ${overtimeHours}:${overtimeMinutes % 60}:00;

                    // Update Check-out, Work Time & Overtime
                    db.query(
                        "UPDATE attendance SET check_out = NOW(), total_work_time = SEC_TO_TIME(TIME_TO_SEC(total_work_time) + TIME_TO_SEC(?)), overtime = ? WHERE id = ?",
                        [workedTime, overtimeTime, attendanceId],
                        (err, updateResult) => {
                            if (err) return res.status(500).json({ error: err.message });
                            res.json({ message: "Check-out recorded successfully", total_work_time: workedTime, overtime: overtimeTime });
                        }
                    );
                }
            );
        }
    );
};

// Fetch Total Work & Overtime for a Day
exports.getDailyWorkTime = (req, res) => {
    const user_id = req.user.id;

    db.query(
        "SELECT SEC_TO_TIME(SUM(TIME_TO_SEC(total_work_time))) AS total_work_time, SEC_TO_TIME(SUM(TIME_TO_SEC(overtime))) AS total_overtime FROM attendance WHERE user_id = ? AND DATE(check_in) = CURDATE()",
        [user_id],
        (err, results) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({
                total_work_time: results[0].total_work_time || "00:00:00",
                total_overtime: results[0].total_overtime || "00:00:00"
            });
        }
    );
};