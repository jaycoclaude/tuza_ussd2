const express = require('express');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: 'password',
  database: 'tuzaussd_db'
};

let connection;

async function connectToDatabase() {
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('Connected to the database');
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }
}

connectToDatabase();

async function getCurrentLevel(sessionId) {
  const [rows] = await connection.execute('SELECT level FROM sessions WHERE session_id = ?', [sessionId]);
  return rows.length > 0 ? rows[0].level : 0;
}

async function updateLevel(sessionId, level) {
  await connection.execute(
    'INSERT INTO sessions (session_id, level) VALUES (?, ?) ON DUPLICATE KEY UPDATE level = ?',
    [sessionId, level, level]
  );
}

app.post('/ussd', async (req, res) => {
  const { sessionId, msisdn: phoneNumber, UserInput: userInput } = req.body;
  let response = '';
  let continueSession = 1;

  try {
    let level = await getCurrentLevel(sessionId);

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
          await connection.execute('INSERT INTO users (phone_number, name) VALUES (?, ?)', [phoneNumber, userInput]);
          response = 'Registration successful. Thank you for choosing XYZ Cleaning Company!';
          continueSession = 0;
          break;
        case 3:
          // Book appointment
          const [result] = await connection.execute('INSERT INTO appointments (user_phone, appointment_date) VALUES (?, ?)', [phoneNumber, userInput]);
          response = `Appointment booked successfully. Your appointment ID is: ${result.insertId}`;
          continueSession = 0;
          break;
        case 4:
          // Cancel appointment
          const [deleteResult] = await connection.execute('DELETE FROM appointments WHERE id = ? AND user_phone = ?', [userInput, phoneNumber]);
          if (deleteResult.affectedRows > 0) {
            response = 'Appointment cancelled successfully.';
          } else {
            response = 'Appointment not found or already cancelled.';
          }
          continueSession = 0;
          break;
        case 5:
          // Check appointment status
          const [rows] = await connection.execute('SELECT appointment_date, status FROM appointments WHERE id = ? AND user_phone = ?', [userInput, phoneNumber]);
          if (rows.length > 0) {
            response = `Appointment Date: ${rows[0].appointment_date}\nStatus: ${rows[0].status}`;
          } else {
            response = 'Appointment not found.';
          }
          continueSession = 0;
          break;
      }
    }

    res.json({ sessionId, message: response, ContinueSession: continueSession });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
