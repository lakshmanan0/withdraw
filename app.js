Below is the *full implementation* of the project with all the requested features:
1. *Registration* with name, email, phone_number, country_code, and password.
2. *Login* using email and password, and generate a *JWT token*.
3. *Deposit* and *Withdrawal* functionality with wallet balance updates.
4. *Protected routes* using JWT authentication.
5. *MySQL database* for storing all data.

---

### *Updated Project Structure*

registration-app/
│
├── config/
│   └── db.js          # Database connection
│
├── controllers/
│   ├── userController.js # Handles registration and login
│   └── transactionController.js # Handles deposit and withdrawal
│
├── models/
│   ├── userModel.js   # Interacts with the `register` table
│   ├── walletModel.js # Interacts with the `wallet` table
│   ├── depositModel.js # Interacts with the `deposit` table
│   └── withdrawalModel.js # Interacts with the `withdrawal` table
│
├── middleware/
│   └── authMiddleware.js # JWT authentication middleware
│
├── routes/
│   ├── userRoutes.js  # Defines user-related routes
│   └── transactionRoutes.js # Defines transaction-related routes
│
├── validations/
│   └── userValidation.js # Validation logic
│
├── .env               # Environment variables
│
├── app.js             # Main application file
│
└── package.json       # Node.js dependencies


---

### *Step 1: Update Database Schema*

#### *1. register Table*
sql
CREATE TABLE register (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone_number VARCHAR(10) NOT NULL,
    country_code VARCHAR(5) NOT NULL,
    password VARCHAR(255) NOT NULL
);


#### *2. wallet Table*
sql
CREATE TABLE wallet (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    balance DECIMAL(10, 2) DEFAULT 0.00,
    FOREIGN KEY (user_id) REFERENCES register(id)
);


#### *3. deposit Table*
sql
CREATE TABLE deposit (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    deposit_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES register(id)
);


#### *4. withdrawal Table*
sql
CREATE TABLE withdrawal (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    withdrawal_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES register(id)
);


---

### *Step 2: Install Dependencies*
Run the following command to install required packages:
bash
npm install express mysql2 node-input-validator dotenv jsonwebtoken


---

### *Step 3: Set Up .env File*
Create a .env file in the root directory and add the following:
env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=yourpassword
DB_NAME=registration_db
JWT_SECRET=your_jwt_secret_key


---

### *Step 4: Implement Code*

#### *1. config/db.js*
javascript
const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

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


---

#### *2. models/userModel.js*
javascript
const { getConnection } = require('../config/db');

const createUser = async (name, email, phoneNumber, countryCode, password) => {
    const connection = await getConnection();
    try {
        const [result] = await connection.query(
            'INSERT INTO register (name, email, phone_number, country_code, password) VALUES (?, ?, ?, ?, ?)',
            [name, email, phoneNumber, countryCode, password]
        );
        return result;
    } finally {
        connection.release();
    }
};

const getUserByEmail = async (email) => {
    const connection = await getConnection();
    try {
        const [rows] = await connection.query('SELECT * FROM register WHERE email = ?', [email]);
        return rows[0];
    } finally {
        connection.release();
    }
};

module.exports = { createUser, getUserByEmail };


---

#### *3. models/walletModel.js*
javascript
const { getConnection } = require('../config/db');

const getWalletByUserId = async (userId) => {
    const connection = await getConnection();
    try {
        const [rows] = await connection.query('SELECT * FROM wallet WHERE user_id = ?', [userId]);
        return rows[0];
    } finally {
        connection.release();
    }
};

const updateWalletBalance = async (userId, amount) => {
    const connection = await getConnection();
    try {
        await connection.query('UPDATE wallet SET balance = balance + ? WHERE user_id = ?', [amount, userId]);
    } finally {
        connection.release();
    }
};

const createWallet = async (userId) => {
    const connection = await getConnection();
    try {
        await connection.query('INSERT INTO wallet (user_id, balance) VALUES (?, 0)', [userId]);
    } finally {
        connection.release();
    }
};

module.exports = { getWalletByUserId, updateWalletBalance, createWallet };


---

#### *4. models/depositModel.js*
javascript
const { getConnection } = require('../config/db');

const createDeposit = async (userId, amount) => {
    const connection = await getConnection();
    try {
        await connection.query('INSERT INTO deposit (user_id, amount) VALUES (?, ?)', [userId, amount]);
    } finally {
        connection.release();
    }
};

module.exports = { createDeposit };


---

#### *5. models/withdrawalModel.js*
javascript
const { getConnection } = require('../config/db');

const createWithdrawal = async (userId, amount) => {
    const connection = await getConnection();
    try {
        await connection.query('INSERT INTO withdrawal (user_id, amount) VALUES (?, ?)', [userId, amount]);
    } finally {
        connection.release();
    }
};

module.exports = { createWithdrawal };


---

#### *6. middleware/authMiddleware.js*
javascript
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


---

#### *7. controllers/userController.js*
javascript
const jwt = require('jsonwebtoken');
const { createUser, getUserByEmail } = require('../models/userModel');
const { createWallet } = require('../models/walletModel');
require('dotenv').config();

const registerUser = async (req, res) => {
    const { name, email, phoneNumber, countryCode, password } = req.body;

    try {
        // Check if user already exists
        const existingUser = await getUserByEmail(email);
        if (existingUser) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        // Create user
        const result = await createUser(name, email, phoneNumber, countryCode, password);

        // Create wallet for the user
        await createWallet(result.insertId);

        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const loginUser = async (req, res) => {
    const { email, password } = req.body;

    try {
        // Check if user exists
        const user = await getUserByEmail(email);
        if (!user) {
            return res.status(400).json({ error: 'User not found' });
        }

        // Validate password
        if (user.password !== password) {
            return res.status(400).json({ error: 'Invalid password' });
        }

        // Generate JWT
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.status(200).json({ message: 'Login successful', token });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = { registerUser, loginUser };


---

#### *8. controllers/transactionController.js*
javascript
const { getWalletByUserId, updateWalletBalance } = require('../models/walletModel');
const { createDeposit } = require('../models/depositModel');
const { createWithdrawal } = require('../models/withdrawalModel');

const depositAmount = async (req, res) => {
    const { amount } = req.body;
    const userId = req.user.userId;

    try {
        // Update wallet balance
        await updateWalletBalance(userId, amount);

        // Record deposit
        await createDeposit(userId, amount);

        res.status(200).json({ message: 'Deposit successful' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const withdrawAmount = async (req, res) => {
    const { amount } = req.body;
    const userId = req.user.userId;

    try {
        // Check if sufficient balance is available
        const wallet = await getWalletByUserId(userId);
        if (wallet.balance < amount) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }

        // Update wallet balance
        await updateWalletBalance(userId, -amount);

        // Record withdrawal
        await createWithdrawal(userId, amount);

        res.status(200).json({ message: 'Withdrawal successful' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = { depositAmount, withdrawAmount };


---

#### *9. routes/userRoutes.js*
javascript
const express = require('express');
const { registerUser, loginUser } = require('../controllers/userController');

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);

module.exports = router;


---

#### *10. routes/transactionRoutes.js*
javascript
const express = require('express');
const { depositAmount, withdrawAmount } = require('../controllers/transactionController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/deposit', authMiddleware, depositAmount);
router.post('/withdraw', authMiddleware, withdrawAmount);

module.exports = router;


---

#### *11. app.js*
javascript
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


---

### *Step 5: Test the APIs*

#### *1. Register User*
bash
curl -X POST http://localhost:3000/api/user/register \
-H "Content-Type: application/json" \
-d '{
    "name": "John Doe",
    "email": "john.doe@example.com",
    "phoneNumber": "1234567890",
    "countryCode": "+91",
    "password": "password123"
}'


#### *2. Login User*
bash
curl -X POST http://localhost:3000/api/user/login \
-H "Content-Type: application/json" \
-d '{
    "email": "john.doe@example.com",
    "password": "password123"
}'


#### *3. Deposit Amount*
bash
curl -X POST http://localhost:3000/api/transaction/deposit \
-H "Content-Type: application/json" \
-H "Authorization: Bearer <your_jwt_token>" \
-d '{
    "amount": 100.00
}'


#### *4. Withdraw Amount*
bash
curl -X POST http://localhost:3000/api/transaction/withdraw \
-H "Content-Type: application/json" \
-H "Authorization: Bearer <your_jwt_token>" \
-d '{
    "amount": 50.00
}'


---

This is the *complete implementation* of the project. Let me know if you need further assistance!