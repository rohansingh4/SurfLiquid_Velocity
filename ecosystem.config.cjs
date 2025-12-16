module.exports = {
  apps: [
    {
      name: 'shadow-dex',
      script: 'sonic-execution-onchain.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/shadow-dex-error.log',
      out_file: './logs/shadow-dex-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    },
    {
      name: 'base-pool',
      script: 'base-execution.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/base-pool-error.log',
      out_file: './logs/base-pool-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    }
    // SwapX is commented out to save RPC usage
    // Uncomment below if you want to enable SwapX
    /*
    {
      name: 'swapx-pool',
      script: 'swapx-execution-onchain.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/swapx-pool-error.log',
      out_file: './logs/swapx-pool-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    }
    */
  ]
};
