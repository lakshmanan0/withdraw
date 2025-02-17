Below is the **updated code** using the **`mysql` npm package** instead of `mysql2`. The code has been modified to work with the `mysql` package while maintaining all the functionality (registration, login, JWT authentication, password hashing, email encryption, and phone number validation).

---

### **Updated Project Structure**
```
registration-app/
│
├── config/
│   └── db.js          # Database connection
│
├── controllers/
│   ├── userController.js # Handles registration and login
│   └── transactionController.js # Handles deposit and withdrawal
│
├── middleware/
│   └── authMiddleware.js # JWT authentication middleware
│
├── routes/
│   ├── userRoutes.js  # Defines user-related routes
│   └── transactionRoutes.js # Defines transaction-related routes
│
├── .env               # Environment variables
│
├── app.js             # Main application file
│
└── package.json       # Node.js dependencies
```

---

### **1. Install Dependencies**
Install the required packages:
```bash
npm install express mysql bcrypt crypto jsonwebtoken node-input-validator dotenv
```

---

### **2. `config/db.js`**
This file handles the MySQL database connection using the `mysql` package.

```javascript
const mysql = require('mysql');
require('dotenv').config();

// Create a connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 10, // Maximum number of connections in the pool
});

// Function to get a connection from the pool
const getConnection = () => {
    return new Promise((resolve, reject) => {
        pool.getConnection((err, connection) => {
            if (err) {
                reject(err);
            } else {
                resolve(connection);
            }
        });
    });
};

module.exports = { getConnection };
```

---

### **3. `controllers/userController.js`**
This file handles user registration and login.

```javascript
const jwt = require('jsonwebtoken');
const Validator = require('node-input-validator');
const { getConnection } = require('../config/db');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
require('dotenv').config();

// Function to encrypt email using AES-256-CBC
const encryptEmail = (email) => {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(process.env.CRYPTO_SECRET, 'salt', 32);
    const iv = Buffer.alloc(16, 0); // Initialization vector

    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(email, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
};

// Register a new user
const registerUser = async (req, res) => {
    const { name, email, phoneNumber, countryCode, password } = req.body;

    // Validate input
    const v = new Validator(req.body, {
        name: 'required',
        email: 'required|email',
        phoneNumber: 'required',
        countryCode: 'required',
        password: 'required|minLength:6'
    });

    const matched = await v.check();
    if (!matched) {
        return res.status(400).json({ error: v.errors });
    }

    try {
        const connection = await getConnection();

        // Check if user already exists
        const [existingUser] = await new Promise((resolve, reject) => {
            connection.query(
                'SELECT * FROM register WHERE email = ?',
                [encryptEmail(email)],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });
        if (existingUser.length > 0) {
            connection.release();
            return res.status(400).json({ error: 'Email already registered' });
        }

        // Check if country code exists in the country table
        const [country] = await new Promise((resolve, reject) => {
            connection.query(
                'SELECT * FROM country WHERE country_code = ?',
                [countryCode],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });
        if (country.length === 0) {
            connection.release();
            return res.status(400).json({ error: 'Invalid country code' });
        }

        // Validate phone number length based on country code
        const phoneLengthRules = {
            '+1': 10,  // US
            '+91': 10, // India
            '+44': 10, // UK
            '+61': 9,  // Australia
            '+49': 10, // Germany
            '+33': 9,  // France
            '+81': 10, // Japan
            '+86': 11, // China
            '+55': 11  // Brazil
        };

        const expectedLength = phoneLengthRules[countryCode];
        if (!expectedLength || phoneNumber.length !== expectedLength) {
            connection.release();
            return res.status(400).json({ error: `Phone number must be ${expectedLength} digits for country code ${countryCode}` });
        }

        // Hash password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Encrypt email
        const encryptedEmail = encryptEmail(email);

        // Insert new user
        const [result] = await new Promise((resolve, reject) => {
            connection.query(
                'INSERT INTO register (name, email, phone_number, country_code, password) VALUES (?, ?, ?, ?, ?)',
                [name, encryptedEmail, phoneNumber, countryCode, hashedPassword],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });

        // Create wallet for the user
        await new Promise((resolve, reject) => {
            connection.query(
                'INSERT INTO wallet (user_id, balance) VALUES (?, 0)',
                [result.insertId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        connection.release();
        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Login user and generate JWT
const loginUser = async (req, res) => {
    const { email, password } = req.body;

    // Validate input
    const v = new Validator(req.body, {
        email: 'required|email',
        password: 'required'
    });

    const matched = await v.check();
    if (!matched) {
        return res.status(400).json({ error: v.errors });
    }

    try {
        const connection = await getConnection();

        // Encrypt email for comparison
        const encryptedEmail = encryptEmail(email);

        // Check if user exists
        const [user] = await new Promise((resolve, reject) => {
            connection.query(
                'SELECT * FROM register WHERE email = ?',
                [encryptedEmail],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });
        if (user.length === 0) {
            connection.release();
            return res.status(400).json({ error: 'User not found' });
        }

        // Validate password
        const isPasswordValid = await bcrypt.compare(password, user[0].password);
        if (!isPasswordValid) {
            connection.release();
            return res.status(400).json({ error: 'Invalid password' });
        }

        // Generate JWT
        const token = jwt.sign(
            { userId: user[0].id, email: user[0].email },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        connection.release();
        res.status(200).json({ message: 'Login successful', token });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = { registerUser, loginUser };
```

---

### **4. `controllers/transactionController.js`**
This file handles deposit and withdrawal transactions.

```javascript
const { getConnection } = require('../config/db');

// Deposit amount
const depositAmount = async (req, res) => {
    const { amount } = req.body;
    const userId = req.user.userId;

    try {
        const connection = await getConnection();

        // Update wallet balance
        await new Promise((resolve, reject) => {
            connection.query(
                'UPDATE wallet SET balance = balance + ? WHERE user_id = ?',
                [amount, userId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Record deposit
        await new Promise((resolve, reject) => {
            connection.query(
                'INSERT INTO deposit (user_id, amount) VALUES (?, ?)',
                [userId, amount],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        connection.release();
        res.status(200).json({ message: 'Deposit successful' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Withdraw amount
const withdrawAmount = async (req, res) => {
    const { amount } = req.body;
    const userId = req.user.userId;

    try {
        const connection = await getConnection();

        // Check if sufficient balance is available
        const [wallet] = await new Promise((resolve, reject) => {
            connection.query(
                'SELECT * FROM wallet WHERE user_id = ?',
                [userId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });
        if (wallet[0].balance < amount) {
            connection.release();
            return res.status(400).json({ error: 'Insufficient balance' });
        }

        // Update wallet balance
        await new Promise((resolve, reject) => {
            connection.query(
                'UPDATE wallet SET balance = balance - ? WHERE user_id = ?',
                [amount, userId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Record withdrawal
        await new Promise((resolve, reject) => {
            connection.query(
                'INSERT INTO withdrawal (user_id, amount) VALUES (?, ?)',
                [userId, amount],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        connection.release();
        res.status(200).json({ message: 'Withdrawal successful' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = { depositAmount, withdrawAmount };
```

---

### **5. `middleware/authMiddleware.js`**
This file handles JWT authentication.

```javascript
const jwt = require('jsonwebtoken');
require('dotenv').config();

const authMiddleware = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(400).json({ error: 'Invalid token' });
    }
};

module.exports = authMiddleware;
```

---

### **6. `routes/userRoutes.js`**
This file defines user-related routes.

```javascript
const express = require('express');
const { registerUser, loginUser } = require('../controllers/userController');

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);

module.exports = router;
```

---

### **7. `routes/transactionRoutes.js`**
This file defines transaction-related routes.

```javascript
const express = require('express');
const { depositAmount, withdrawAmount } = require('../controllers/transactionController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/deposit', authMiddleware, depositAmount);
router.post('/withdraw', authMiddleware, withdrawAmount);

module.exports = router;
```

---

### **8. `app.js`**
This is the main application file.

```javascript
const express = require('express');
const userRoutes = require('./routes/userRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());

// Routes
app.use('/api/user', userRoutes);
app.use('/api/transaction', transactionRoutes);

// Start server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
```

---

### **9. `.env`**
This file stores environment variables.

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=yourpassword
DB_NAME=registration_db
JWT_SECRET=your_jwt_secret_key
CRYPTO_SECRET=your_crypto_secret_key
```

---

### **10. `package.json`**
This file lists the project dependencies.

```json
{
  "name": "registration-app",
  "version": "1.0.0",
  "main": "app.js",
  "scripts": {
    "start": "node app.js"
  },
  "dependencies": {
    "bcrypt": "^5.1.1",
    "crypto": "^1.0.1",
    "dotenv": "^16.3.1",
    "express": "^4.18.2",
    "jsonwebtoken": "^9.0.2",
    "mysql": "^2.18.1",
    "node-input-validator": "^4.10.0"
  }
}
```

---

### **11. Database Schema**

#### **1. `register` Table**
```sql
CREATE TABLE register (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone_number VARCHAR(10) NOT NULL,
    country_code VARCHAR(5) NOT NULL,
    password VARCHAR(255) NOT NULL
);
```

#### **2. `wallet` Table**
```sql
CREATE TABLE wallet (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    balance DECIMAL(10, 2) DEFAULT 0.00,
    FOREIGN KEY (user_id) REFERENCES register(id)
);
```

#### **3. `deposit` Table**
```sql
CREATE TABLE deposit (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    deposit_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES register(id)
);
```

#### **4. `withdrawal` Table**
```sql
CREATE TABLE withdrawal (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    withdrawal_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES register(id)
);
```

#### **5. `country` Table**
```sql
CREATE TABLE country (
    id INT AUTO_INCREMENT PRIMARY KEY,
    country_name VARCHAR(255) NOT NULL,
    country_code VARCHAR(5) NOT NULL
);

-- Insert sample data
INSERT INTO country (country_name, country_code) VALUES
('United States', '+1'),
('India', '+91'),
('United Kingdom', '+44'),
('Canada', '+1'),
('Australia', '+61'),
('Germany', '+49'),
('France', '+33'),
('Japan', '+81'),
('China', '+86'),
('Brazil', '+55');
```

---

### **12. Install Dependencies**
Run the following command to install the required packages:
```bash
npm install
```

---

### **13. Start the Server**
Run the following command to start the server:
```bash
npm start
```

---

This is the **full code** using the `mysql` npm package. Let me know if you need further assistance!
