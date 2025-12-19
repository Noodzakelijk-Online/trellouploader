import main from '../main.js';

// Express endpoint fonksiyonu
export default async function backupHandler(req, res) {
  try {
    await main(); // Yedekleme fonksiyonunu çağır
    res.status(200).send('✅ Yedekleme tamamlandı');
  } catch (err) {
    console.error('Yedekleme hatası:', err);
    res.status(500).send('❌ Hata: ' + err.message);
  }
}
