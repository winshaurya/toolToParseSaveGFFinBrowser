VS Code SQLite Extension (alexcvzz) - Feature Summary

Source: Visual Studio Marketplace listing for "SQLite" (alexcvzz)

Key features and UI/UX:

- Sidebar explorer
  - Lists opened databases, tables, views, columns
  - Per-database actions: Open, Close, Refresh
  - Per-table quick actions: preview rows, copy SELECT, show schema

- Querying and editing
  - Create new SQLite query documents
  - Run query from editor or run a quick query without creating a document
  - Bind an editor to a database for autocompletion (tables, columns)
  - Support for dot-commands like `.tables` and `.schema`

- Results and exports
  - Show query results in a table view with pagination
  - Export results to CSV/JSON/HTML
  - Show a limited number of records per page (configurable via `sqlite.recordsPerPage`)

- Autocomplete & language features
  - Autocompletion for SQL keywords, table and view names, column names when an editor is bound to a DB
  - Language grammar for `sqlite` documents

- Settings and commands
  - Commands: New Query, Run Query, Quick Query, Use Database, Open Database, Close Database, Refresh Databases, Show output, Change Workspace Trust
  - Settings: path to sqlite3 CLI, log level, records per page, custom setup SQL for specific DBs

- Implementation notes
  - The extension may use the sqlite3 CLI or bundled precompiled binaries for query execution.
  - For large databases the extension uses pagination and may rely on native sqlite tooling when available.

Repository and source:
- Marketplace: https://marketplace.visualstudio.com/items?itemName=alexcvzz.vscode-sqlite
- Likely repository: https://github.com/AlexCovizzi/vscode-sqlite (marketplace references this path)

Use in our project:
- Implement a Sidebar-like Database Browser (we added a DB Browser above the SQL box).
- Add features: table search/filter, column list, inline preview (show small sample), copy SELECT and export CSV for preview, pagination or limit controls, and an option to bind editor to a database for autocompletion (future work).

Notes:
- For exact source code, the GitHub repo is referenced above; if you want I can fetch specific files from the repo (LICENSE, README, examples, or extension code) and add them into `docs/` for reference.
