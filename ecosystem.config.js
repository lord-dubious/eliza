module.exports = {
  apps: [{
    name: 'eliza-agent',
    script: 'pnpm',
    args: 'start --character /root/workspace/eliza/characters/holly.json',
    cwd: '/root/workspace/eliza',
    watch: false,
    env: {
      NODE_ENV: 'production',
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    autorestart: true,
    max_restarts: 10,
    restart_delay: 5000
  }]
};
