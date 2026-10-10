import sys, re
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')

content = Path('../swing-bos-core/docs/SMC_JOURNAL.md').read_text(encoding='utf-8')
trades = re.split(r'(?m)^### (\d+)\. ', content)

begonya_trades = []

for i in range(1, len(trades), 2):
    num = int(trades[i])
    if num >= 63:
        text = trades[i+1].strip()
        lines = [l.strip() for l in text.split('\n') if l.strip()]
        header = lines[0]
        
        m = re.search(r'\[(.*?)\]\s*[—–-]\s*([A-Z0-9]+)\s*\((.*?)\)', header)
        date_str = m.group(1) if m else 'N/A'
        symbol = m.group(2) if m else 'N/A'
        action_type = m.group(3) if m else 'N/A'
        
        durum_line = ''
        user_line = ''
        score_line = ''
        
        for l in lines:
            if l.startswith('- **Durum:**'):
                durum_line = l
            elif l.startswith('- **Kullanıcı Sonucu:**'):
                user_line = l
            elif 'Begonya Skoru:' in l or 'Bot Puanı:' in l:
                score_line = l
                
        begonya_trades.append({
            'num': num,
            'header': header,
            'date': date_str,
            'symbol': symbol,
            'type': action_type,
            'durum': durum_line,
            'user': user_line,
            'score': score_line,
            'full_text': text
        })

print(f"Total Begonya Trades (#63 - #89): {len(begonya_trades)}")
for t in begonya_trades:
    status_summary = t['user'] if t['user'] else t['durum']
    print(f"#{t['num']} | {t['symbol']} | {t['type']} | {t['date']}")
    print(f"   STATUS: {status_summary}")
    print()
