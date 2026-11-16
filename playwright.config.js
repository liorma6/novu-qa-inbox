import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser',fullyParallel:false,workers:1,retries:0,
  reporter:[['list'],['html',{open:'never'}]],
  use:{baseURL:'http://127.0.0.1:8788',trace:'retain-on-failure'},
  projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'mobile',use:{...devices['Pixel 7']}}],
  webServer:{command:'node src/server.js',url:'http://127.0.0.1:8788/api/health',reuseExistingServer:false,env:{PORT:'8788',QA_DEV_SECRET:'browser-development-test-key',QA_STAGE_SECRET:'browser-staging-test-key'}},
});
