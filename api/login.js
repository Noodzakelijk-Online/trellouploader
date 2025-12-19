import express from 'express';
import 'dotenv/config';

const app = express();
app.use(express.json());

// 🔐 Basit kimlik kontrolü
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === process.env.APP_PASSWORD) {
    return res.status(200).send('OK');
  } else {
    return res.status(401).send('Unauthorized');
  }
});

// 🔧 Şifre değiştirme (ENV'de kalır)
app.post('/api/change-password', (req, res) => {
  const { oldPass, newPass } = req.body;

  if (oldPass !== process.env.APP_PASSWORD) {
    return res.status(401).send('Incorrect old password');
  }

  // Çalışma anında değiştirilebilir (geçici)
  process.env.APP_PASSWORD = newPass;

  res.send('Password updated (will reset after restart)');
});
