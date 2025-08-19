/* global require, fetch */
(async function () {
  const cfg = await (await fetch('./config.json')).json();

  function tickClock(){ document.getElementById('clock').textContent = new Date().toLocaleTimeString(); }
  setInterval(tickClock,1000); tickClock();

  const buttons = Array.from(document.querySelectorAll('.nav-btn'));
  const panels = { dashboard: document.getElementById('panel-dashboard'), map: document.getElementById('panel-map'), police: document.getElementById('panel-police') };
  buttons.forEach(btn=>btn.addEventListener('click', ()=>{
    buttons.forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    Object.values(panels).forEach(p=>p.classList.add('hidden'));
    panels[btn.dataset.panel].classList.remove('hidden');
  }));

  async function fetchNWS() {
    try {
      const res = await fetch(cfg.feeds.nws_alerts, { headers: { "Accept": "application/geo+json" } });
      const gj = await res.json();
      const alerts = (gj.features||[]).map(f=> ({ id:f.id, event:f.properties.event, headline:f.properties.headline||f.properties.description||"", severity:(f.properties.severity||"").toLowerCase() }));
      const label = document.getElementById('banner-label'); const ticker = document.getElementById('banner-ticker');
      if (!alerts.length){ label.textContent = 'STATUS'; ticker.textContent = 'No active NWS alerts for Texas.'; return; }
      const text = alerts.map(a=>`[${a.event}] ${a.headline.replace(/\s+/g,' ').slice(0,140)}`).join('  •  ');
      ticker.textContent = text + '  •  ' + text;
      const severe = alerts.some(a=>/extreme|severe|warning/i.test(a.severity) || /Warning/i.test(a.event));
      label.style.color = severe ? '#ff4d4f' : '#ffb200';
    } catch(e){ console.warn('NWS fetch failed', e); }
  }
  fetchNWS(); setInterval(fetchNWS, 120000);
  const tickerEl = document.getElementById('banner-ticker');
  tickerEl.addEventListener('mouseenter', ()=>tickerEl.classList.add('paused'));
  tickerEl.addEventListener('mouseleave', ()=>tickerEl.classList.remove('paused'));

  async function countFeatures(url, where='1=1'){
    try{ const q = `${url}/query?where=${encodeURIComponent(where)}&returnCountOnly=true&f=json`; const res = await fetch(q); const j = await res.json(); return j.count ?? 0; }catch(e){ return 0; }
  }
  async function loadMetrics(){
    const [closures, sheltersOpen] = await Promise.all([
      countFeatures(cfg.layers.road_closures, "UPPER(status)='CLOSED'"),
      countFeatures(cfg.layers.shelters, "status='Open' AND cap_avail > 0")
    ]);
    document.getElementById('metric-closures').textContent = closures;
    document.getElementById('metric-shelters').textContent = sheltersOpen;

    try{
      const res = await fetch(cfg.feeds.nws_alerts, { headers: { "Accept": "application/geo+json" } });
      const gj = await res.json();
      const types = {}; (gj.features||[]).forEach(f=>{ const e=f.properties.event||'Alert'; types[e]=(types[e]||0)+1; });
      const total = Object.values(types).reduce((a,b)=>a+b,0);
      document.getElementById('metric-alerts').textContent = total;
      document.getElementById('metric-alerts-breakdown').textContent = Object.entries(types).slice(0,4).map(([k,v])=>`${k}:${v}`).join('  •  ');
      const wl = document.getElementById('weather-list'); wl.innerHTML=''; Object.entries(types).forEach(([k,v])=>{ const li=document.createElement('li'); li.textContent = `${k} — ${v}`; wl.appendChild(li); });
    }catch(e){ /* ignore */ }
  }
  loadMetrics(); setInterval(loadMetrics, 180000);

  const news = [
    { title:"Texas Tribune — statewide emergency updates", url:"https://www.texastribune.org/" },
    { title:"KRIS 6 News — Coastal Bend", url:"https://www.kristv.com/" },
    { title:"Caller-Times — Corpus Christi", url:"https://www.caller.com/" },
    { title:"AP News — U.S. headlines", url:"https://apnews.com/" },
    { title:"NHC — Active Tropical Cyclones", url:"https://www.nhc.noaa.gov/" }
  ];
  const nl = document.getElementById('news-list'); news.forEach(n=>{ const li=document.createElement('li'); const a=document.createElement('a'); a.href=n.url; a.textContent=n.title; a.target="_blank"; li.appendChild(a); nl.appendChild(li); });

  require(["esri/Map","esri/views/MapView","esri/layers/FeatureLayer","esri/layers/GraphicsLayer","esri/Graphic","esri/geometry/geometryEngine","esri/widgets/Search","esri/request"],
    function(Map, MapView, FeatureLayer, GraphicsLayer, Graphic, geometryEngine, Search, esriRequest){

    const map = new Map({ basemap:"dark-gray-vector" });
    const view = new MapView({ container:"map", map, center: cfg.map.center, zoom: cfg.map.zoom });
    const overlay = new GraphicsLayer({ listMode:"hide" }); map.add(overlay);

    function addFL(url, title){ const fl=new FeatureLayer({ url, outFields:["*"], title }); map.add(fl); return fl; }
    const L = {};
    L.shelters = addFL(cfg.layers.shelters,"Shelters");
    L.closures = addFL(cfg.layers.road_closures,"Road Closures");
    L.equipment = addFL(cfg.layers.equipment,"Equipment");
    L.alerts = addFL(cfg.layers.weather_alert_polygons,"Weather Alerts");

    document.querySelectorAll('#map-controls [data-layer]').forEach(cb=>{
      cb.addEventListener('change', ()=>{ const id=cb.getAttribute('data-layer'); L[id].visible = cb.checked; });
    });

    const search = new Search({ view }); view.ui.add(search,"top-right");
    document.getElementById('run-buffer').addEventListener('click', async ()=>{
      overlay.removeAll();
      const miles = parseFloat(document.getElementById('bufferMiles').value||"3");
      const res = await search.search(document.getElementById('addr').value);
      const pt = res && res.numResults>0 ? res.results[0].results[0].feature.geometry : null;
      if(!pt){ alert("No address found."); return; }
      const buffer = geometryEngine.geodesicBuffer(pt, miles, "miles");
      overlay.add(new Graphic({ geometry:buffer, symbol:{ type:"simple-fill", color:[0,212,212,0.1], outline:{ color:[0,212,212,0.9], width:1.5 }}}));
      view.goTo(buffer.extent.expand(1.2));

      try{
        const svc = await esriRequest(cfg.layers.waterlines_base, { query:{f:"json"}, responseType:"json" });
        const poly = (svc.data.layers||[]).find(l=> (l.geometryType||"").includes("esriGeometryPolyline")) || (svc.data.layers||[])[0];
        if(poly){
          const url = cfg.layers.waterlines_base.replace(/\/?$/,'/') + poly.id;
          const wl = new FeatureLayer({ url, outFields:["*"] });
          const q = wl.createQuery(); q.geometry = buffer; q.spatialRelationship="intersects"; q.returnGeometry=false;
          const count = await wl.queryFeatureCount(q);
          document.getElementById('sitrep').textContent = `Waterlines within ${miles}mi of address: ${count}`;
        }
      }catch(e){ /* ignore */ }
    });

    document.getElementById('run-eq').addEventListener('click', async ()=>{
      const cap = parseInt(document.getElementById('th-cap').value||"50",10);
      const fuel = parseInt(document.getElementById('th-fuel').value||"30",10);
      const q = L.equipment.createQuery(); q.where = `(capacity_p < ${cap}) AND (fuel_pct < ${fuel})`; q.returnGeometry=false; q.outFields=["*"];
      const n = await L.equipment.queryFeatureCount(q);
      document.getElementById('sitrep').textContent = `Equipment below thresholds (cap<${cap}%, fuel<${fuel}%): ${n}`;
    });

    document.getElementById('toggle-alerts').addEventListener('click', ()=>{ L.alerts.visible = !L.alerts.visible; });
    document.getElementById('toggle-radar').addEventListener('click', ()=>{ alert("Radar overlay requires a tile service; we can hook an Esri Living Atlas radar layer or NEXRAD tiles later."); });
  });

})();