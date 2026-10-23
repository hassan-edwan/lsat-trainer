# Your saved progress

While `npm run dev` (or `npm run preview`) is running, the app saves everything here: your answers and
sessions, mistake journal, settings and any tests you imported. It saves a moment after each change.

- `sessions.json`, `attempts.json`, `journal.json`, `settings.json` and `tests.json` are your data.
- `backups/<date>/` is a snapshot taken the first time the app saves each day. The last 30 days are kept.

When the app starts, it merges these files with whatever is in the browser, keeping the newest version of each
record. So you can switch browsers or ports, or clear browser data, and your progress comes back from here.
Updating the app (`git pull`) never touches this folder, and it's excluded from git, so your data is never
committed.

To restore from a snapshot, stop the dev server and copy the files from `backups/<date>/` back into this
folder. Then start the server and open the app in a browser with no saved data, for example a private window.
