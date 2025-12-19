import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import cookieParser from 'cookie-parser';

const app = express();

// Middleware
app.use(express.json());
app.use(cookieParser());

/* ============================================================
 *  GOOGLE DRIVE AUTH
 * ============================================================ */
async function getDriveAuth() {
  const {
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI,
    GOOGLE_TOKEN_JSON
  } = process.env;

  if (!GOOGLE_TOKEN_JSON) {
    throw new Error('GOOGLE_TOKEN_JSON missing');
  }

  const oAuth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI || 'http://localhost'
  );

  const token = JSON.parse(GOOGLE_TOKEN_JSON);
  oAuth2Client.setCredentials(token);

  return oAuth2Client;
}

/* ============================================================
 *  AUTH (BASİT)
 * ============================================================ */
const APP_PASSWORD = process.env.APP_PASSWORD || '1234';

app.post('/api/login', (req, res) => {
  if (req.body.password === APP_PASSWORD) {
    res.cookie('auth', 'ok', { httpOnly: true, sameSite: 'lax', secure: true });
    return res.send('OK');
  }
  res.status(401).send('Unauthorized');
});

function requireAuth(req, res, next) {
  if (req.cookies?.auth === 'ok') return next();
  res.status(401).send('Unauthorized');
}

/* ============================================================
 *  DRIVE TEST ENDPOINT (BUTON TIKLAYINCA)
 * ============================================================ */
app.get('/api/backup-test', requireAuth, async (req, res) => {
  try {
    console.log('🟡 DRIVE TEST STARTED (manual click)');

    const now = new Date().toISOString();
    const fileName = `drive_test_${Date.now()}.csv`;
    const filePath = path.join(process.cwd(), fileName);

    // Basit CSV
    const csvContent = `status,time
test,${now}
`;

    fs.writeFileSync(filePath, csvContent);

    const auth = await getDriveAuth();
    const drive = google.drive({ version: 'v3', auth });

    const upload = await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType: 'text/csv',
        parents: [process.env.GOOGLE_FOLDER_ID]
      },
      media: {
        mimeType: 'text/csv',
        body: fs.createReadStream(filePath)
      }
    });

    fs.unlinkSync(filePath);

    const url = `https://drive.google.com/file/d/${upload.data.id}`;

    console.log('✅ DRIVE TEST SUCCESS:', url);

    res.json({
      success: true,
      message: 'Drive test upload successful',
      driveUrl: url
    });

  } catch (err) {
    console.error('❌ DRIVE TEST FAILED:', err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/* ============================================================
 *  SERVER
 * ============================================================ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
