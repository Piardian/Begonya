import { FileMacroOutcomeStore } from '../server/macroOutcomeEvidence';
import { formatMacroOutcomeReport, generateMacroOutcomeAnalytics } from '../server/macroOutcomeAnalytics';

async function main(): Promise<void> {
  const store = new FileMacroOutcomeStore();
  const records = await store.readAllRecords();

  const isJson = process.argv.includes('--json');

  if (records.length === 0) {
    if (isJson) {
      console.log(JSON.stringify({ status: 'EMPTY', totalTrades: 0, message: 'Henüz sonuçlanmış bir paper işlemi bulunmuyor.' }, null, 2));
    } else {
      console.log('═══════════════════════════════════════════════════════════════════════════════════');
      console.log('               🌺 BEGONYA MAKRO-SMC GERÇEK SONUÇ & KANIT RAPORU');
      console.log('═══════════════════════════════════════════════════════════════════════════════════');
      console.log('');
      console.log('ℹ️  Henüz sonuçlanmış (TP / SL / BE / EXPIRED) bir paper işlemi kaydı bulunmuyor.');
      console.log('    Bot canlıda çalışırken veya retest gerçekleştiğinde tüm işlemler anlık');
      console.log('    Makro Ekonomik Fotoğrafı (VIX, Rejim, Spreadler, Rotasyon Skoru) ile');
      console.log('    otomatik olarak evidence/outcomes/macro-outcome-evidence.jsonl kütüğüne yazılacaktır.');
      console.log('');
      console.log('═══════════════════════════════════════════════════════════════════════════════════');
    }
    return;
  }

  const summary = generateMacroOutcomeAnalytics(records);

  if (isJson) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(formatMacroOutcomeReport(summary));
  }
}

main().catch(err => {
  console.error('Makro Sonuç Raporu oluşturulamadı:', err);
  process.exit(1);
});
