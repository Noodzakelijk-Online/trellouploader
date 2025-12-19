import fs from 'fs';
import path from 'path';

export default function folderHandler(req, res) {
  try {
    // Express'te req.body doğrudan JSON objesidir
    const { folder } = req.body;

    if (!folder) {
      return res.status(400).send('Klasör ID eksik');
    }

    const configPath = path.join(process.cwd(), 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ folder }, null, 2));

    console.log(`✅ Klasör ID güncellendi: ${folder}`);
    res.status(200).send('Folder updated');
  } catch (err) {
    console.error('❌ Folder kaydetme hatası:', err);
    res.status(500).send('Server error');
  }
}
