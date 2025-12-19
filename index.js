import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';

const app = express();

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
 *  DRIVE TEST JOB
 * ============================================================ */
async function runDriveTest() {
  const now = new Date().toISOString();
  const fileName = `drive_test_${Date.now()}.csv`;
  const filePath = path.join(process.cwd(), fileName);

  const csvContent = `status,time
test,${now}
`;

  try {
    fs.writeFileSync(filePath, csvContent);

    const auth = await getDriveAuth();
    const drive = google.drive({ version: 'v3', auth });

    const res = await drive.files.create({
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

    console.log('✅ DRIVE TEST OK');
    console.log(`☁️ ${new Date().toLocaleTimeString()} → https://drive.google.com/file/d/${res.data.id}`);

  } catch (err) {
    console.error('❌ DRIVE TEST FAILED:', err.message);
  }
}

/* ============================================================
 *  INTERVAL (HER 10 SANİYE)
 * ============================================================ */
setInterval(() => {
  console.log('🟡 Running Drive test...');
  runDriveTest();
}, 10000);

/* ============================================================
 *  SERVER (SADECE RENDER MUTLU OLSUN DİYE)
 * ============================================================ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log('⏱ Drive test will run every 10 seconds');
});
