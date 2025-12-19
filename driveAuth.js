import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import open from 'open';

const TOKEN_PATH = path.join(process.cwd(), 'token.json');

export async function getDriveAuth() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;

  const oAuth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );

  // Eğer token.json varsa, doğrudan onu kullan
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    oAuth2Client.setCredentials(token);
    return oAuth2Client;
  }

  // Yoksa kullanıcıdan izin iste
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive'],
  });

  console.log('\n🔗 Bu linke git ve izin ver:\n', authUrl);
  await open(authUrl);

  const code = await askCode();
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);

  // Token kaydedilsin ki bir daha sormasın
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
  console.log('✅ Token kaydedildi -> token.json');

  return oAuth2Client;
}

function askCode() {
  return new Promise((resolve) => {
    process.stdout.write('\n👉 Google sayfasından aldığın kodu buraya yapıştır: ');
    process.stdin.once('data', (data) => {
      resolve(data.toString().trim());
    });
  });
}
