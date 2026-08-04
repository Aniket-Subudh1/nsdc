module.exports = {
  apps: [
    {
      name: "nsdc-sidh-worker",
      script: "tsx",
      args: "scripts/worker.ts",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "750M",
      kill_timeout: 60_000,
      listen_timeout: 10_000,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
