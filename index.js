import 'dotenv/config';
import express from 'express';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import Bottleneck from 'bottleneck';
import { google } from 'googleapis';
import { Parser } from 'json2csv';
import cookieParser from 'cookie-parser';

const app = express();

// Middleware’ler
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

/* ============================================================
 *  🔹 1. GOOGLE DRIVE AUTH (ENV TOKEN)
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
    GOOGLE_REDIRECT_URI
  );

  const token = JSON.parse(GOOGLE_TOKEN_JSON);
  oAuth2Client.setCredentials(token);

  return oAuth2Client;
}

/* ============================================================
 *  🔹 2. TRELLO VERİLERİNİ ÇEK (ARŞİV + CUSTOM FIELDS + ACTIONS)
 * ============================================================ */
function getCardCreationDate(cardId) {
  const timestamp = parseInt(cardId.substring(0, 8), 16);
  return new Date(timestamp * 1000).toISOString();
}

function formatCustomFieldValue(item, boardCustomFieldsById) {
  const def = boardCustomFieldsById[item.idCustomField];
  if (!def) return null;

  const name = def.name || def.id;

  if (item.value?.text != null) return `${name}=${item.value.text}`;
  if (item.value?.number != null) return `${name}=${item.value.number}`;
  if (item.value?.date != null) return `${name}=${item.value.date}`;
  if (typeof item.value?.checked !== 'undefined') {
    return `${name}=${item.value.checked ? 'true' : 'false'}`;
  }
  if (item.idValue) {
    const opt = (def.options || []).find(o => o.id === item.idValue);
    const optText = opt?.value?.text || opt?.value?.label || opt?.id || 'option';
    return `${name}=${optText}`;
  }
  return `${name}=[unknown]`;
}

function extractArchiveTimestamps(actions) {
  let archivedAt = '';
  let unarchivedAt = '';

  for (const a of actions) {
    if (a.type === 'updateCard' && a.data?.old && a.data?.card) {
      const oldClosed = a.data.old.closed;
      const newClosed = a.data.card.closed;

      if (oldClosed === false && newClosed === true && !archivedAt) {
        archivedAt = a.date;
      }
      if (oldClosed === true && newClosed === false && !unarchivedAt) {
        unarchivedAt = a.date;
      }
    }
  }
  return { archivedAt, unarchivedAt };
}

async function fetchTrelloData() {
  const { TRELLO_KEY, TRELLO_TOKEN } = process.env;
  const base = `https://api.trello.com/1`;
  const params = `key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;

  console.log('🔄 Trello verileri çekiliyor...');
  const limiter = new Bottleneck({ minTime: 200 });

  const boardsRes = await limiter.schedule(() =>
    axios.get(`${base}/members/me/boards?filter=all&${params}`)
  );
  const boards = boardsRes.data;
  const allData = [];

  for (const board of boards) {
    const listsRes = await limiter.schedule(() =>
      axios.get(`${base}/boards/${board.id}/lists?filter=all&${params}`)
    );
    const lists = listsRes.data;
    const listsById = new Map(lists.map(l => [l.id, l]));

    let boardCustomFields = [];
    try {
      const cfRes = await limiter.schedule(() =>
        axios.get(`${base}/boards/${board.id}/customFields?${params}`)
      );
      boardCustomFields = cfRes.data || [];
    } catch {}

    const boardCustomFieldsById = {};
    for (const def of boardCustomFields) {
      boardCustomFieldsById[def.id] = def;
    }

    const cardsRes = await limiter.schedule(() =>
      axios.get(`${base}/boards/${board.id}/cards?filter=all&${params}`)
    );
    const cards = cardsRes.data;

    for (const card of cards) {
      try {
        const [
          labelsRes,
          membersRes,
          checklistsRes,
          attachmentsRes,
          commentsRes,
          actionsRes,
          customFieldItemsRes
        ] = await Promise.all([
          limiter.schedule(() => axios.get(`${base}/cards/${card.id}/labels?${params}`)),
          limiter.schedule(() => axios.get(`${base}/cards/${card.id}/members?${params}`)),
          limiter.schedule(() => axios.get(`${base}/cards/${card.id}/checklists?${params}`)),
          limiter.schedule(() => axios.get(`${base}/cards/${card.id}/attachments?${params}`)),
          limiter.schedule(() =>
            axios.get(`${base}/cards/${card.id}/actions?filter=commentCard&limit=1000&${params}`)
          ),
          limiter.schedule(() =>
            axios.get(`${base}/cards/${card.id}/actions?filter=updateCard,createCard,copyCard,moveCardFromBoard,moveCardToBoard&limit=1000&${params}`)
          ),
          limiter.schedule(() =>
            axios.get(`${base}/cards/${card.id}/customFieldItems?${params}`)
          )
        ]);

        const list = listsById.get(card.idList);
        const { archivedAt, unarchivedAt } = extractArchiveTimestamps(actionsRes.data || []);

        const comments = (commentsRes.data || [])
          .map(c => `${c.memberCreator?.fullName || 'Unknown'}: ${c.data?.text || ''}`)
          .join(' | ');

        const checklists = (checklistsRes.data || [])
          .map(chk =>
            `${chk.name}: ${chk.checkItems?.map(i => `${i.name} (${i.state})`).join('; ')}`
          )
          .join(' | ');

        const attachments = (attachmentsRes.data || []).map(a => a.url).join(', ');
        const labels = (labelsRes.data || []).map(l => l.name).join(', ');
        const members = (membersRes.data || []).map(m => m.fullName).join(', ');

        const custom_fields = (customFieldItemsRes.data || [])
          .map(item => formatCustomFieldValue(item, boardCustomFieldsById))
          .filter(Boolean)
          .join(' | ');

        allData.push({
          board_name: board.name,
          board_url: board.url,
          board_closed: board.closed ? 'true' : 'false',
          list_name: list?.name || '',
          list_url: `https://trello.com/b/${board.shortLink}`,
          list_closed: list?.closed ? 'true' : 'false',
          card_name: card.name,
          card_url: card.shortUrl,
          card_pos: card.pos,
          desc: card.desc,
          created_at: getCardCreationDate(card.id),
          last_activity: card.dateLastActivity || '',
          archived_at: archivedAt,
          unarchived_at: unarchivedAt,
          due: card.due || '',
          due_complete: card.dueComplete ? 'true' : 'false',
          closed: card.closed ? 'true' : 'false',
          members,
          labels,
          comments,
          checklists,
          attachments,
          custom_fields
        });
      } catch (err) {
        console.warn(`⚠️ Kart atlandı: ${card.name}`, err.message);
      }
    }
  }

  console.log(`✅ ${allData.length} kart çekildi`);
  return allData;
}

/* ============================================================
 *  🔹 3. CSV OLUŞTUR + DRIVE YÜKLE
 * ============================================================ */
async function saveToCSVAndUpload(trelloData) {
  const date = new Date().toISOString().split('T')[0];
  const filePath = path.join(process.cwd(), `trello_export_${date}.csv`);

  const fields = [
    'board_name','board_url','board_closed',
    'list_name','list_url','list_closed',
    'card_name','card_url','card_pos','desc',
    'created_at','last_activity','archived_at','unarchived_at',
    'due','due_complete','closed',
    'members','labels','comments','checklists','attachments',
    'custom_fields'
  ];

  const parser = new Parser({ fields });
  fs.writeFileSync(filePath, parser.parse(trelloData));

  const auth = await getDriveAuth();
  const drive = google.drive({ version: 'v3', auth });

  const res = await drive.files.create({
    requestBody: {
      name: path.basename(filePath),
      mimeType: 'text/csv',
      parents: [process.env.GOOGLE_FOLDER_ID]
    },
    media: {
      mimeType: 'text/csv',
      body: fs.createReadStream(filePath)
    }
  });

  fs.unlinkSync(filePath);
  return `https://drive.google.com/file/d/${res.data.id}`;
}

/* ============================================================
 *  🔹 4. AUTH + ENDPOINTS
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

app.get('/api/backup', requireAuth, async (req, res) => {
  try {
    const data = await fetchTrelloData();
    const driveUrl = await saveToCSVAndUpload(data);
    res.json({ success: true, driveUrl });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ============================================================
 *  🔹 5. SERVER
 * ============================================================ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
