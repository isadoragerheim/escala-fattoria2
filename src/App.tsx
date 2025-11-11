import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Trash2, Calendar as Cal, RefreshCw, ClipboardList, Share2, Copy } from "lucide-react";

type Staff = { id: string; name: string };
type Day = { id: string; label: string; required: number; code: string };
type Rule = { id: string; a: string; b: string; kind: "must" | "never" };
type Availability = Record<string, string[]>;
type State = { staff: Staff[]; days: Day[]; rules: Rule[]; availability: Availability; };

interface TabButtonProps { label: string; active: boolean; onClick: () => void; icon: React.ReactNode }
interface CardProps { title: string; icon: React.ReactNode; children: React.ReactNode }
interface ShareExportProps { state: State; weekId: string }
interface SolverUIProps { state: State }
interface AvailabilityFormProps {
  state: State; update: (p: Partial<State>) => void;
  selectedStaffId: string; setSelectedStaffId: (id: string) => void;
  weekId: string; syncEnabled: boolean;
}

const LS_KEY = "escala_fattoria_state_v3";
const SYNC_ENDPOINT = "https://script.google.com/macros/s/AKfycbwQsmqSOmALernF48mfjTR6CGTdf9ycC-6g2AdexUcpA9Px-WxkYcfviUDTzo2WOEbFzw/exec"; // COLE AQUI sua URL /exec do Apps Script

function id() { return Math.random().toString(36).slice(2, 10); }
function byName(state: State, staffId: string) { return state.staff.find(s=>s.id===staffId)?.name || ""; }

function formatDDMMYYYY_slash(dt: Date){ const dd = String(dt.getDate()).padStart(2,'0'); const mm = String(dt.getMonth()+1).padStart(2,'0'); const yyyy = dt.getFullYear(); return `${dd}/${mm}/${yyyy}`; }
function formatDDMMYYYY_dash(dt: Date){ const dd = String(dt.getDate()).padStart(2,'0'); const mm = String(dt.getMonth()+1).padStart(2,'0'); const yyyy = dt.getFullYear(); return `${dd}-${mm}-${yyyy}`; }
function mondayOfWeek(d: Date){ const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const day = dt.getDay(); const diff = (day+6)%7; dt.setDate(dt.getDate()-diff); return dt; }
function weekIdFromDate_slash(d: Date){ return formatDDMMYYYY_slash(mondayOfWeek(d)); }
function weekIdFromDate_dash(d: Date){ return formatDDMMYYYY_dash(mondayOfWeek(d)); }

const defaultState: State = {
  staff: ["Lauren","Marina","Ana","Leo","Nayara","Duda","Dani","Mariana","Gabi"].map(n=>({ id:id(), name:n })),
  days: [
    { id:id(), label:"Quarta",              required:1, code:"qua" },
    { id:id(), label:"Quinta",              required:1, code:"qui" },
    { id:id(), label:"Sexta",               required:4, code:"sex" },
    { id:id(), label:"Sábado",              required:5, code:"sab" },
    { id:id(), label:"Domingo (Almoço)",    required:3, code:"dom_almoco" },
    { id:id(), label:"Domingo (Noite)",     required:2, code:"dom_noite" },
  ],
  rules: [],
  availability: {},
};

function encodeConfig(state: State){ const payload = { staff: state.staff, days: state.days, rules: state.rules }; const json = JSON.stringify(payload); return btoa(unescape(encodeURIComponent(json))); }
function decodeConfig(b64: string){ try{ const json = decodeURIComponent(escape(atob(b64))); const obj = JSON.parse(json); if(obj && Array.isArray(obj.staff) && Array.isArray(obj.days) && Array.isArray(obj.rules)){ return obj as Pick<State, "staff"|"days"|"rules">; } }catch{} return null; }

export default function App(){
  const [state, setState] = useState<State>(()=>{ try{ const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) as State : defaultState; }catch{ return defaultState; } });
  const [activeTab, setActiveTab] = useState<"disponibilidade"|"escalar"|"limpar"|"export">("disponibilidade");
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [weekIdSlash, setWeekIdSlash] = useState<string>("");
  const [weekIdDash, setWeekIdDash] = useState<string>("");
  const syncEnabled = !!SYNC_ENDPOINT;

  useEffect(()=>{
    const url = new URL(window.location.href);
    const s = url.searchParams.get("s"); if(s){ const conf = decodeConfig(s); if(conf){ setState(prev=>({ ...prev, ...conf })); } }
    const wanted = url.searchParams.get("staff");
    const w = url.searchParams.get("w");
    const initialDash = w || weekIdFromDate_dash(new Date());
    setWeekIdDash(initialDash);
    const [d,m,y] = initialDash.split("-").map(Number);
    setWeekIdSlash(`${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${y}`);
    if(wanted){ setTimeout(()=>{ setState(curr=>{ const found = curr.staff.find(p=> p.name.toLowerCase() === wanted.toLowerCase()); if(found) setSelectedStaffId(found.id); return curr; }); }, 0); }
  }, []);

  useEffect(()=>{ try{ localStorage.setItem(LS_KEY, JSON.stringify(state)); }catch{} }, [state]);
  useEffect(()=>{ if(!selectedStaffId && state.staff.length) setSelectedStaffId(state.staff[0].id); },[state.staff, selectedStaffId]);
  const update = (patch: Partial<State>) => setState(s=>({ ...s, ...patch }));

  return (
    <div className="min-h-screen text-gray-900 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto">
        <header className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">Escalação Semanal Fattoria</h1>
            <p className="text-sm text-gray-600">Preencha disponibilidades no celular e gere a escala.</p>
          </div>
          <div className="flex gap-2 overflow-auto">
            <TabButton icon={<ClipboardList className="w-4 h-4"/>} active={activeTab==="disponibilidade"} onClick={()=>setActiveTab("disponibilidade")} label="Disponibilidade"/>
            <TabButton icon={<Cal className="w-4 h-4"/>} active={activeTab==="escalar"} onClick={()=>setActiveTab("escalar")} label="Escalar"/>
            <TabButton icon={<Trash2 className="w-4 h-4"/>} active={activeTab==="limpar"} onClick={()=>setActiveTab("limpar")} label="Limpar"/>
            <TabButton icon={<Share2 className="w-4 h-4"/>} active={activeTab==="export"} onClick={()=>setActiveTab("export")} label="Compartilhar"/>
          </div>
        </header>

        {activeTab==="disponibilidade" && (
          <Card title={`Formulário de Disponibilidade – Semana ${weekIdSlash || '(definir)'}`} icon={<ClipboardList className="w-5 h-5"/>}>
            <AvailabilityForm state={state} update={update} selectedStaffId={selectedStaffId} setSelectedStaffId={setSelectedStaffId} weekId={weekIdDash} syncEnabled={syncEnabled} />
          </Card>
        )}

        {activeTab==="escalar" && (
          <Card title="Escalar" icon={<Cal className="w-5 h-5"/>}>
            <SolverUI state={state} />
          </Card>
        )}

        {activeTab==="limpar" && (
          <Card title="Limpar respostas da semana" icon={<Trash2 className="w-5 h-5"/>}>
            <ClearTab weekId={weekIdDash} onClearLocal={()=> setState(prev=> ({...prev, availability:{}}))} />
          </Card>
        )}

        {activeTab==="export" && (
          <Card title="Links para Compartilhar" icon={<Share2 className="w-5 h-5"/>}>
            <ShareExport state={state} weekId={weekIdDash} />
          </Card>
        )}

        <div className="mt-6 text-xs text-gray-500 flex items-center gap-2">
          <RefreshCw className="w-4 h-4"/> Tudo salvo localmente. Envie o link de compartilhamento para o time preencher.
        </div>
      </div>
    </div>
  );
}

function TabButton({label, active, onClick, icon}: TabButtonProps){
  return (
    <button onClick={onClick} className={`tab ${active? "tab-active":"tab-inactive"}`}>
      {icon}{label}
    </button>
  );
}

function Card({title, icon, children}: CardProps){
  return (
    <motion.div initial={{opacity:0, y:8}} animate={{opacity:1, y:0}} className="card">
      <div className="flex items-center gap-2 mb-4">{icon}<h2 className="font-semibold">{title}</h2></div>
      {children}
    </motion.div>
  );
}

function AvailabilityForm({ state, update, selectedStaffId, setSelectedStaffId, weekId, syncEnabled }: AvailabilityFormProps){
  const selected = state.staff.find(s=> s.id===selectedStaffId);
  const chosen = state.availability[selectedStaffId] || [];

  const toggle = (dayId: string) => {
    const curr = new Set(chosen);
    if(curr.has(dayId)) curr.delete(dayId); else curr.add(dayId);
    update({ availability: { ...state.availability, [selectedStaffId]: Array.from(curr) } });
  };

  const save = async () => {
    if(!selected) { alert("Selecione seu nome."); return; }
    const chosenCodes = (state.availability[selectedStaffId]||[])
      .map(did => state.days.find(d=>d.id===did)?.code)
      .filter(Boolean) as string[];

    if(syncEnabled && weekId){
      try{
        const resp = await fetch(SYNC_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action:'upsert', weekId, staff: selected.name, days: chosenCodes })
        });
        const txt = await resp.text();
        if(!resp.ok){
          alert(`Falha ao salvar (HTTP ${resp.status}). Resposta: ${txt.slice(0,180)}`);
        }else{
          try{
            const data = JSON.parse(txt);
            if(data.ok){ alert('Suas escolhas foram salvas.'); }
            else { alert(`Falha ao salvar no servidor: ${data.error||'erro desconhecido'}`); }
          }catch{
            alert('Salvo (retorno do servidor não era JSON).');
          }
        }
      }catch(err:any){
        alert(`Falha ao salvar no servidor. Verifique o SYNC_ENDPOINT. Erro: ${String(err)}`);
      }
    } else {
      alert('Salvo localmente (modo offline).');
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
        <label className="text-sm text-gray-600">Seu nome</label>
        <select className="input sm:col-span-2" value={selectedStaffId} onChange={e=>setSelectedStaffId(e.target.value)}>
          {state.staff.map(s=> <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <div className="grid sm:grid-cols-2 gap-2">
        {state.days.map(d=>(
          <label key={d.id} className="flex items-center gap-2 border rounded-xl px-3 py-2 bg-white">
            <input type="checkbox" checked={chosen.includes(d.id)} onChange={()=>toggle(d.id)} />
            <span>{d.label}</span>
          </label>
        ))}
      </div>

      <button onClick={save} className={`btn ${syncEnabled? "btn-primary":"btn-ghost"}`}>
        Salvar minhas escolhas
      </button>
      {!syncEnabled && <div className="text-xs text-amber-700">Sem endpoint configurado (modo offline).</div>}
    </div>
  );
}

type SolveResult = { ok:boolean; assignments: Record<string,string[]>; messages:string[] };

function solve(state:State): SolveResult {
  const messages: string[] = [];
  const assignments: Record<string,string[]> = {}; // dayId -> staffIds

  const staffById = Object.fromEntries(state.staff.map(s=>[s.id, s] as const));
  const nameOf = (sid:string)=> staffById[sid]?.name || "";

  // disponibilidade por dia (ids de staff)
  const availPerDay: Record<string, string[]> = Object.fromEntries(
    state.days.map(d=>{
      const avail = state.staff
        .filter(s=> (state.availability[s.id]||[]).includes(d.id))
        .map(s=>s.id);
      return [d.id, avail];
    })
  );

  const mustPairs = state.rules.filter(r=>r.kind==="must").map(r=>[r.a,r.b] as [string,string]);
  const neverPairs = state.rules.filter(r=>r.kind==="never").map(r=>[r.a,r.b] as [string,string]);

  const checkSet = (set:string[])=>{
    for (const [a,b] of neverPairs) { if (set.includes(a) && set.includes(b)) return false; }
    for (const [a,b] of mustPairs)  { const ia=set.includes(a), ib=set.includes(b); if (ia!==ib) return false; }
    return true;
  };

  const PRIORITY_STAR = new Set(["Marina","Lauren"]);
  const AVOID_SINGLE  = new Set(["Leo","Ana","Mariana"]);
  const LOW_LAST      = new Set(["Duda","Dani"]); // últimas prioridades

  for (const day of state.days) {
    const pool = [...(availPerDay[day.id]||[])];

    // scoring
    const score: Record<string, number> = {};
    for (const sid of pool){
      const n = nameOf(sid);
      let sc = 0;
      const mustC = mustPairs.filter(([a,b])=> a===sid || b===sid).length;
      const nevC  = neverPairs.filter(([a,b])=> a===sid || b===sid).length;
      sc += mustC*2 + nevC;
      if (PRIORITY_STAR.has(n)) sc += 5;
      if (day.code==="sab" && n==="Gabi") sc += 6;
      if (day.required===1 && AVOID_SINGLE.has(n)) sc -= 4;
      if (day.required===1 && n==="Ana") sc += 0.5;
      if (LOW_LAST.has(n)) sc -= 1000;
      score[sid] = sc;
    }
    pool.sort((u,v)=> (score[v]??0)-(score[u]??0));

    const target = day.required;
    let found: string[] | null = null;

    // agrupar pares "must"
    const parent:Record<string,string> = {}; for (const s of pool) parent[s]=s;
    const findp = (x:string):string => parent[x]===x ? x : (parent[x]=findp(parent[x]));
    const unite = (x:string,y:string)=>{ x=findp(x); y=findp(y); if (x!==y) parent[y]=x; };
    for (const [a,b] of mustPairs){ if (pool.includes(a) && pool.includes(b)) unite(a,b); }
    const groups:Record<string,string[]> = {}; for (const s of pool){ const p=findp(s); (groups[p]??=[]).push(s); }

    function backtrack(idx:number, chosen:string[]) {
      if (found) return;
      if (chosen.length>target) return;
      if (idx>=pool.length) { if (chosen.length===target && checkSet(chosen)) found=[...chosen]; return; }
      const remaining = target - chosen.length; if (remaining>(pool.length-idx)) return;

      const s = pool[idx];
      const g = groups[findp(s)] || [s];

      const includeSet = Array.from(new Set([...chosen, ...g]));
      if (includeSet.length<=target && checkSet(includeSet)) backtrack(idx+1, includeSet);
      backtrack(idx+1, chosen);
    }
    backtrack(0, []);

    // Regras especiais para dias com 1 pessoa (preferências)
    if (day.required===1) {
      const namesInPool = new Set(pool.map(nameOf));
      const hasStar = namesInPool.has("Marina") || namesInPool.has("Lauren");
      if (!hasStar){
        const idByName = (nm:string)=> pool.find(sid=> nameOf(sid)===nm);
        if (namesInPool.has("Ana") && namesInPool.has("Mariana")) {
          const ana = idByName("Ana"); if (ana) found = [ana];
        } else if (namesInPool.has("Leo") && !found) {
          const leo = idByName("Leo"); if (leo) found = [leo];
        } else if (namesInPool.has("Mariana") && !found) {
          const mar = idByName("Mariana"); if (mar) found = [mar];
        }
      }
    }

    // Tentar substituir Duda/Dani por outra pessoa quando possível
    if (found){
      for (const sid of [...found]){
        const n = nameOf(sid);
        if (!LOW_LAST.has(n)) continue;
        const candidate = pool.find(x=> !LOW_LAST.has(nameOf(x)) && !found!.includes(x));
        if (candidate){
          const trial: string[] = [...found.filter(z=>z!==sid), candidate];
          if (trial.length===target && checkSet(trial)) found = trial;
        }
      }
    }

    assignments[day.id] = found ? found : [];
  }

  // Preferência: evitar mesma pessoa em Domingo Almoço e Noite (exceto Gabi)
  const dayLunch = state.days.find(d=>d.code==="dom_almoco");
  const dayNight = state.days.find(d=>d.code==="dom_noite");
  if (dayLunch && dayNight) {
    const A = new Set(assignments[dayLunch.id]||[]);
    const B = new Set(assignments[dayNight.id]||[]);
    for (const sid of Array.from(A)) {
      const n = nameOf(sid);
      if (n==="Gabi") continue; // exceção
      if (B.has(sid)) {
        const poolNight = (availPerDay[dayNight.id]||[]).filter(x=> !B.has(x));
        const candidate = poolNight.find(x=>{
          const test = Array.from(new Set([ ...assignments[dayNight.id], x ]))
            .filter(z=> z!==sid)
            .slice(0, dayNight.required);
          return test.length===dayNight.required;
        });
        if (candidate) {
          assignments[dayNight.id] = Array.from(new Set([ ...assignments[dayNight.id], candidate ]))
            .filter(z=> z!==sid)
            .slice(0, dayNight.required);
          B.delete(sid);
        }
      }
    }
  }

  const ok = state.days.every(d=> (assignments[d.id]||[]).length===d.required);

  // mensagens finais (usar o MESMO array messages – não redeclarar)
  for (const d of state.days) {
    const avail = (availPerDay[d.id]||[]).length;
    if (avail < d.required) messages.push(`ℹ️ ${d.label}: só ${avail} disponíveis para ${d.required} vagas.`);
    const names = (assignments[d.id]||[])
      .map(sid=> state.staff.find(s=>s.id===sid)?.name || sid)
      .filter(Boolean)
      .join(", ");
    messages.push(names ? `✅ ${d.label}: ${names}` : `❌ ${d.label}: não preenchido`);
  }

  return { ok, assignments, messages };
}


function SolverUI({ state }: SolverUIProps){
  const res = useMemo(()=> solve(state), [state]);
  const { assignments, messages } = res;
  const respondedIds = Object.keys(state.availability||{});
  const respondedSet = new Set(respondedIds);
  const missing = state.staff.filter(s=>!respondedSet.has(s.id)).map(s=>s.name);
  const total = state.staff.length;

  return (
    <div className="space-y-4">
      <div className="text-sm">
        {missing.length===0 ? (
          <div className="rounded-xl border px-3 py-2 bg-green-50 text-green-800">Todas as {total} pessoas já responderam.</div>
        ) : (
          <div className="rounded-xl border px-3 py-2 bg-amber-50 text-amber-800">
            {total - missing.length} de {total} já responderam.
            <span className="block text-xs mt-1">Sem resposta: {missing.join(", ")}</span>
          </div>
        )}
      </div>
      <div className="overflow-auto">
        <table className="min-w-full border text-sm">
          <thead className="bg-gray-100"><tr>
            <th className="border px-3 py-2 text-left">Dia/Turno</th>
            <th className="border px-3 py-2 text-left">Requeridos</th>
            <th className="border px-3 py-2 text-left">Escalados</th>
          </tr></thead>
          <tbody>
            {state.days.map(day=>{
              const names = (assignments[day.id]||[]).map(id=> state.staff.find(s=>s.id===id)?.name || id);
              return (
                <tr key={day.id}>
                  <td className="border px-3 py-2">{day.label}</td>
                  <td className="border px-3 py-2">{day.required}</td>
                  <td className="border px-3 py-2">{names.length? names.join(", ") : <span className="text-red-600">Não preenchido</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="space-y-1">{messages.map((m,i)=>(<div key={i} className="text-sm">{m}</div>))}</div>
    </div>
  );
}

function ShareExport({ state, weekId }: ShareExportProps){
  const [copied, setCopied] = useState(false);
  const base = typeof window!=="undefined" ? window.location.origin + window.location.pathname : "";
  const conf = encodeConfig(state);
  const shareLink = `${base}?s=${encodeURIComponent(conf)}&w=${encodeURIComponent(weekId||"")}`;
  const makeRespondLink = (name:string)=> `${shareLink}&staff=${encodeURIComponent(name)}`;
  const copy = async (txt:string)=>{ try{ await navigator.clipboard.writeText(txt); setCopied(true); setTimeout(()=>setCopied(false), 1200);}catch{} };

  return (
    <div className="space-y-3">
      <div className="text-sm text-gray-700">Envie este link para carregar <b>nomes, dias/turnos e regras</b> (sem disponibilidades):</div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input readOnly value={shareLink} className="input w-full"/>
        <button onClick={()=>copy(shareLink)} className="btn btn-primary"><Copy className="w-4 h-4"/>{copied?"Copiado!":"Copiar"}</button>
      </div>
      <div className="text-sm text-gray-700">Ou envie links diretos para cada pessoa (já abre com o nome selecionado):</div>
      <div className="grid sm:grid-cols-2 gap-2">
        {state.staff.map(s=>{
          const url = makeRespondLink(s.name);
          return (
            <div key={s.id} className="flex gap-2 items-center">
              <span className="text-sm w-28 truncate">{s.name}</span>
              <input readOnly value={url} className="input flex-1"/>
              <button onClick={()=>copy(url)} className="btn btn-ghost text-sm">Copiar</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ClearTab({weekId, onClearLocal}:{weekId:string; onClearLocal:()=>void}){
  const clearAll = async ()=>{
    onClearLocal();
    if(SYNC_ENDPOINT && weekId){
      try{ await fetch(SYNC_ENDPOINT, { method:'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action:'clear', weekId }) }); }catch{}
    }
    alert('Respostas da semana limpas.');
  };
  return (
    <div className="flex items-center justify-between">
      <div className="text-sm text-gray-600">Use este botão no início de cada semana para zerar as respostas. Semana atual: <b>{weekId||'-'}</b></div>
      <button onClick={clearAll} className="btn btn-primary">Limpar</button>
    </div>
  );
}
