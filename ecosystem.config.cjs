module.exports = {
  apps: [
    {
      name: 'book-reader',
      script: 'server.py',
      interpreter: 'python3',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        BOOK_DATA_DIR: '/var/lib/book'
      },
      watch: false,
      autorestart: true,
      max_memory_restart: '512M',
      time: true
    }
  ]
};
