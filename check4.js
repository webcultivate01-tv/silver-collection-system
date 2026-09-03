const { Client } = require('ssh2');
const conn = new Client();
const cmd = `
echo "=== pm2 startup systemd unit ===" && systemctl list-units --all | grep -i pm2
echo "=== pm2 list via full path ===" && (export PATH=$PATH:/root/.nvm/versions/node/*/bin 2>/dev/null; /root/.pm2/../.nvm/versions/node/*/bin/pm2 list 2>&1 || find / -maxdepth 4 -iname "pm2" -type f 2>/dev/null)
echo "=== pm2 dump / saved process list ===" && cat /root/.pm2/dump.pm2 2>&1 | head -5
echo "=== DONE4 ==="
`;
conn.on('ready', () => {
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    let out = '';
    stream.on('close', () => { console.log(out); conn.end(); })
      .on('data', d => out += d.toString())
      .stderr.on('data', d => out += '[STDERR] ' + d.toString());
  });
}).on('error', e => console.error('SSH ERROR:', e.message))
  .connect({ host: '194.238.23.4', port: 22, username: 'root', password: process.env.VPS_PASSWORD, readyTimeout: 20000 });
