

📋 The Master Copilot Prompt
Copy everything below the line and paste it into your AI assistant.

Role: You are a Senior Bioinformatics Software Engineer and Expert React/WebAssembly Developer. We are building a Chrome Extension MVP for a project titled "A genomic feature database in the browser".

Core Architecture Objective:
We need to query massive genomic annotation files (GFF3) entirely in the browser using sqlite3 WASM without downloading the whole file. We will achieve this by pre-converting the GFF to a SQLite DB, hosting it, and using HTTP Range requests via WASM’s Virtual File System (VFS) to only fetch the bytes needed for a SQL query.

Visual/UI Requirement (CRITICAL):
The extension UI must be a "Storytelling Dashboard". It cannot just show a search bar and results. It must visually expose the internal engine. I want a live terminal or animated flow diagram in the UI that shows:

The user's query.

The exact SQL query generated.

The HTTP Range request firing (e.g., GET /db.sqlite Range: bytes=2048-4096).

The WASM engine executing and returning the rows.

The final data ready to be passed to JBrowse.

Project Roadmap & Context Links:
Please acknowledge this roadmap. I will ask you to execute these steps one by one. Read the provided links for context before writing the code for each step.

Phase 1: The Python Preprocessor (Data Pipeline)
Goal: Write a Python script (with pytest unit tests) that takes a remote or local .gff file, uses gffutils to parse it, and outputs a highly indexed .sqlite database optimized for read-heavy WASM querying.

Dynamic Feature: Create a lightweight FastAPI endpoint where the user can submit a GFF URL (e.g., https://ftp.ebi.ac.uk/pub/databases/mett/annotations/v1_2024-04-15/BU_ATCC8492/functional_annotation/merged_gff/BU_ATCC8492_annotations.gff). The API should download it, run the gffutils conversion, and host the resulting .sqlite file statically with Accept-Ranges: bytes headers enabled.

Context Links for AI:

gffutils docs: https://pythonhosted.org/gffutils/

FastAPI static files (for range requests): https://fastapi.tiangolo.com/tutorial/static-files/

Phase 2: Extension Scaffold & UI Storytelling Component
Goal: Setup a Manifest V3 Chrome Extension with a React side-panel.

UI Design: Build the "Visual Log" component. It should have a two-column layout:

Left: Control panel (Input URL, Search Features by function category).

Right: The "Engine View" (a sleek, dark-mode terminal UI that animates the steps: Connecting to VFS... -> Fetching Bytes... -> Parsing SQLite...). Use standard React state to manage these log messages.

Context Links for AI:

Chrome Extension React Boilerplate concepts: https://developer.chrome.com/docs/extensions/mv3/getstarted/

Phase 3: The SQLite WASM & HTTP Range Request Core
Goal: Integrate the official @sqlite.org/sqlite-wasm package into the React extension.

Implementation: Configure the SQLite WASM worker to use the HTTP VFS (Virtual File System). This allows SQLite to execute a SELECT statement on a remote URL, automatically translating the database page reads into HTTP Range headers.

Wiring: Connect this engine to our UI. When the user searches for a gene, fire the WASM query, capture the HTTP range data (or simulate logging it), and display the results in the "Engine View".

Context Links for AI:

SQLite WASM HTTP VFS documentation: https://sqlite.org/wasm/doc/trunk/api-vfs.md#vfs-http

SQLite WASM React integration: https://sqlite.org/wasm/doc/trunk/cookbook.html

Phase 4: JBrowse 2 Data Handoff (The Mock Plugin)
Goal: Demonstrate integration with JBrowse.

Implementation: Build a simple React component that simulates a JBrowse linear view, OR write the skeleton of a real JBrowse 2 plugin. The extension should take the feature coordinates (Chromosome, Start, End) fetched from WASM and dispatch a postMessage or state update to center the simulated "Browser" on that exact genomic location.

Context Links for AI:

JBrowse 2 Plugin Architecture: https://jbrowse.org/jb2/docs/developer_guide/

Action: If you understand these requirements, the architecture, and the heavy focus on UI storytelling, reply with "Architecture acknowledged. Ready to begin Phase 1: Python Preprocessor. Please provide the command to start."

💡 How to use this workflow effectively:
Start with the Backend (Phase 1): The browser extension needs a server that supports HTTP Range requests. By having your AI build a quick FastAPI Python script first, you solve the problem of converting that raw EBI FTP link into a queryable database.

Feed the Links: AI models with small context windows hallucinate APIs. By explicitly giving the links (especially the sqlite.org/wasm/doc/trunk/api-vfs.md#vfs-http link), the AI will look up the exact syntax for setting up the HTTP Virtual File System, which is the hardest technical part of this GSoC project.

The "Visual Storytelling": The prompt specifically instructs the AI to build a "dark-mode terminal UI". This is crucial for an MVP. When you present this to your mentor (Vikas Gupta), showing that the data is being fetched in chunks via WASM is much more impressive than just showing the final search result. It proves you understand the underlying HTTP mechanics.


so i want the extention to work inthe side panel of the browswer , 

i also want a space where i can put link of any .gff link and the extention download processes and get ready to run query on that gff , also show viaually that how it has stored what steps it found , a real loading bar , etc etc, add more features by yourself 