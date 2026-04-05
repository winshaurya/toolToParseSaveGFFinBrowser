function log(msg){
  const t = document.getElementById('terminal');
  const el = document.createElement('div');
  el.className = 'log-line';
  el.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  t.appendChild(el);
  t.scrollTop = t.scrollHeight;
}

document.getElementById('run').addEventListener('click', ()=>{
  const url = document.getElementById('url').value || 'http://localhost:8000/db.sqlite';
  const q = document.getElementById('query').value || 'example_gene';
  const t = document.getElementById('terminal');
  t.innerHTML = '';
  log(`User query: ${q}`);
  setTimeout(()=> log(`SQL: SELECT * FROM features WHERE attributes LIKE '%${q}%' LIMIT 100;`), 400);
  setTimeout(()=> log(`HTTP Range request: GET ${url} Range: bytes=8192-16383`), 900);
  setTimeout(()=> log(`WASM VFS: Fetching pages and executing SQLite.`), 1500);
  setTimeout(()=> log(`WASM: Returned 3 rows.`), 2200);
  setTimeout(()=> log(`Dispatching features to JBrowse (simulated).`), 3000);
});

// In-memory feature store for prototype
window.featuresList = [];

document.getElementById('parse').addEventListener('click', async ()=>{
  const gffUrl = document.getElementById('url').value || 'http://localhost:8000/sample.gff';
  const t = document.getElementById('terminal');
  const countEl = document.getElementById('count');
  const featuresEl = document.getElementById('features_list');
  const worker = document.getElementById('worker');
  t.innerHTML = '';
  featuresEl.innerHTML = '';
  window.featuresList = [];
  countEl.textContent = '0';
  log(`Starting parse: ${gffUrl}`);

  try{
    const res = await fetch('http://localhost:8000/parse_gff', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({gff_url: gffUrl})
    });
    if(!res.ok){
      log(`Server error ${res.status}`);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let { value, done } = await reader.read();
    let buf = '';
    while(!done){
      buf += decoder.decode(value, {stream:true});
      const lines = buf.split('\n');
      buf = lines.pop();
      for(const line of lines){
        if(!line.trim()) continue;
        try{
          const feat = JSON.parse(line);
          window.featuresList.push(feat);
          // update UI
          countEl.textContent = String(window.featuresList.length);
          if(window.featuresList.length <= 12){
            const el = document.createElement('div');
            el.textContent = `${feat.seqid}:${feat.start}-${feat.end} ${feat.type}`;
            el.style.fontSize = '12px'; el.style.padding='2px 0';
            featuresEl.appendChild(el);
          }
          // animate figurine position (logarithmic easing)
          const p = Math.min(1, Math.log(window.featuresList.length + 1) / Math.log(1000));
          worker.setAttribute('transform', `translate(${Math.round(p * 200)},0)`);
        }catch(e){
          // non-json or meta lines
        }
      }
      ({ value, done } = await reader.read());
    }
    // final buffer
    if(buf && buf.trim()){
      try{
        const feat = JSON.parse(buf);
        window.featuresList.push(feat);
        countEl.textContent = String(window.featuresList.length);
      }catch(e){}
    }

    log(`Parsing complete — ${window.featuresList.length} features parsed (in-memory).`);
  }catch(err){
    log(`Error: ${err.message}`);
  }
});
