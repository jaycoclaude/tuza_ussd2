const express = require('express');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));

// Database connection
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: 'password',
  database: 'tuzaussd_db'
};

// Function to get database connection
async function getConnection() {
  return await mysql.createConnection(dbConfig);
}

// Function to get the current menu level
async function getCurrentLevel(sessionId) {
  const conn = await getConnection();
  try {
    await conn.query(`CREATE TABLE IF NOT EXISTS sessions (
      session_id VARCHAR(255) PRIMARY KEY,
      level INT NOT NULL
    )`);

    const [rows] = await conn.query('SELECT level FROM sessions WHERE session_id = ?', [sessionId]);
    return rows.length > 0 ? rows[0].level : 0;
  } catch (error) {
    throw error;
  } finally {
    await conn.end();
  }
}

// Function to update the menu level
async function updateLevel(sessionId, level) {
  const conn = await getConnection();
  try {
    await conn.query('INSERT INTO sessions (session_id, level) VALUES (?, ?) ON DUPLICATE KEY UPDATE level = ?', [sessionId, level, level]);
  } catch (error) {
    throw error;
  } finally {
    await conn.end();
  }
}

// Ensure tables exist
async function ensureTables() {
  const conn = await getConnection();
  try {
    await conn.query(`CREATE TABLE IF NOT EXISTS users (
      phone_number VARCHAR(20) PRIMARY KEY,
      name VARCHAR(255) NOT NULL
    )`);

    await conn.query(`CREATE TABLE IF NOT EXISTS appointments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_phone VARCHAR(20),
      appointment_date DATE,
      status VARCHAR(20) DEFAULT 'Scheduled',
      FOREIGN KEY (user_phone) REFERENCES users(phone_number)
    )`);
  } catch (error) {
    throw error;
  } finally {
    await conn.end();
  }
}

ensureTables();

app.post('/', async (req, res) => {
  const sessionId = req.body.sessionId || '';
  const phoneNumber = req.body.msisdn || '';
  const userInput = decodeURIComponent(req.body.UserInput || '');
  const serviceCode = req.body.serviceCode || '';
  const networkCode = req.body.networkCode || '';

  let level = await getCurrentLevel(sessionId);
  let response = '';
  let continueSession = 1;

  try {
    if (userInput === '*662*800*100#' || level === 0) {
      response = 'Welcome to XYZ Cleaning Company\n' +
                 '1. Register\n' +
                 '2. Book Appointment\n' +
                 '3. Cancel Appointment\n' +
                 '4. Check Appointment Status\n' +
                 '5. Exit\n';
      await updateLevel(sessionId, 1);
    } else {
      switch (level) {
        case 1:
          switch (userInput) {
            case '1':
              response = 'Enter your name:';
              await updateLevel(sessionId, 2);
              break;
            case '2':
              response = 'Enter preferred date (YYYY-MM-DD):';
              await updateLevel(sessionId, 3);
              break;
            case '3':
              response = 'Enter appointment ID to cancel:';
              await updateLevel(sessionId, 4);
              break;
            case '4':
              response = 'Enter appointment ID to check status:';
              await updateLevel(sessionId, 5);
              break;
            case '5':
              response = 'Thank you for using our service. Goodbye!';
              continueSession = 0;
              break;
            default:
              response = 'Invalid input. Please try again.';
              break;
          }
          break;
        case 2:
          // Register user
          const conn = await getConnection();
          try {
            await conn.query('INSERT INTO users (phone_number, name) VALUES (?, ?)', [phoneNumber, userInput]);
            response = 'Registration successful. Thank you for choosing XYZ Cleaning Company!';
            continueSession = 0;
          } finally {
            await conn.end();
          }
          break;
        case 3:
          // Book appointment
          if (/^\d{4}-\d{2}-\d{2}$/.test(userInput)) {
            const conn = await getConnection();
            try {
              const [result] = await conn.query('INSERT INTO appointments (user_phone, appointment_date) VALUES (?, ?)', [phoneNumber, userInput]);
              response = `Appointment booked successfully. Your appointment ID is: ${result.insertId}`;
            } finally {
              await conn.end();
            }
          } else {
            response = 'Invalid date format. Please use YYYY-MM-DD.';
          }
          continueSession = 0;
          break;
        case 4:
          // Cancel appointment
          if (!isNaN(userInput)) {
            const conn = await getConnection();
            try {
              const [result] = await conn.query('DELETE FROM appointments WHERE id = ? AND user_phone = ?', [userInput, phoneNumber]);
              response = result.affectedRows > 0 ? 'Appointment cancelled successfully.' : 'Appointment not found or already cancelled.';
            } finally {
              await conn.end();
            }
          } else {
            response = 'Invalid appointment ID. Please enter a number.';
          }
          continueSession = 0;
          break;
        case 5:
          // Check appointment status
          if (!isNaN(userInput)) {
            const conn = await getConnection();
            try {
              const [rows] = await conn.query('SELECT appointment_date, status FROM appointments WHERE id = ? AND user_phone = ?', [userInput, phoneNumber]);
              if (rows.length > 0) {
                response = `Appointment Date: ${rows[0].appointment_date}\nStatus: ${rows[0].status}`;
              } else {
                response = 'Appointment not found.';
              }
            } finally {
              await conn.end();
            }
          } else {
            response = 'Invalid appointment ID. Please enter a number.';
          }
          continueSession = 0;
          break;
      }
    }
  } catch (error) {
    response = `Error processing request: ${error.message}`;
    continueSession = 0;
  }

  res.json({
    sessionId: sessionId,
    message: response,
    ContinueSession: continueSession
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
