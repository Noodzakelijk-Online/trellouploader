import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';

const app = express();

/* ============================================================
 *  GOOGLE DRIVE AUTH (DETAYLI DEBUG)
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

  let token;
  try {
    token = JSON.parse(GOOGLE_TOKEN_JSON);
  } catch (e) {
    throw new Error('GOOGLE_TOKEN_JSON is not valid JSON');
  }

  console.log('🔎 Token keys:', Object.keys(token));
  console.log('🔎 Has refresh_token:', Boolean(token.refresh_token));

  const oAuth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI || 'http://localhost'
  );

  oAuth2Client.setCredentials(token);
  return oAuth2Client;
}

/* ============================================================
 *  DRIVE TEST JOB (DETAYLI HATA LOG)
 * ============================================================ */
async function runDriveTest() {
  const now = new Date().toISOString();
  const fileName = `drive_test_${Date.now()}.csv`;
  const filePath = path.join(process.cwd(), fileName);

  const csvContent = `status,time
test,${now}
`;

  try {
    console.log('🟡 DRIVE TEST STARTED');

    fs.writeFileSync(filePath, csvContent);
    console.log('📄 CSV created:', fileName);

    const auth = await getDriveAuth();
    const drive = google.drive({ version: 'v3', auth });

    console.log('☁️ Uploading to Google Drive...');

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

    console.log('✅ DRIVE TEST SUCCESS');
    console.log('🔗 File URL:', `https://drive.google.com/file/d/${res.data.id}`);

  } catch (err) {
    console.error('❌ DRIVE TEST FAILED');

    console.error('message:', err?.message);
    console.error('status:', err?.response?.status);
    console.error('statusText:', err?.response?.statusText);

    console.error(
      'response.data:',
      JSON.stringify(err?.response?.data, null, 2)
    );

    console.error('request.url:', err?.config?.url);
    console.error('request.method:', err?.config?.method);

    if (err?.response?.headers) {
      console.error(
        'response.headers:',
        JSON.stringify(err.response.headers, null, 2)
      );
    }

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

/* ============================================================
 *  INTERVAL – HER 10 SANİYEDE BİR TEST
 * ============================================================ */
setInterval(() => {
  console.log('⏱ Interval tick – running Drive test');
  runDriveTest();
}, 10000);

/* ============================================================
 *  SERVER (SADECE RENDER İÇİN)
 * ============================================================ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log('🧪 Google Drive test runs every 10 seconds');
});
