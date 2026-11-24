# Static, pre-baked race data

RaceView must run on GitHub Pages with no backend, so every race is exported ahead of time into `public/data/*.json` and committed. The browser fetches the selected race file and never calls a timing API at runtime. The trade-off is that adding or refreshing a race is a deliberate Python plus commit step, handled by the manual **Refresh race data** workflow; deploys stay fast and credential-free.
