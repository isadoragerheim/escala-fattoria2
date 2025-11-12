import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Trash2, Calendar as Cal, RefreshCw, ClipboardList, Share2, Copy } from "lucide-react";
import { toJpeg } from "html-to-image";

type Staff = { id: string; name: string };
type Day = { id: string; label: string; required: number; code: string };
type Rule = { id: string; a: string; b: string; kind: "must" | "never" };
type Availability = Record<string, string[]>;
type State = { staff: Staff[]; days: Day[]; rules: Rule[]; availability: Availability };

interface TabButtonProps { label: string; active: boolean; onClick: () => void; icon: React.ReactNode }
interface CardProps { title: string; icon: React.ReactNode; children: React.ReactNode }
interface ShareExportProps { state: State; weekId: string }
interface SolverUIProps {
  state: State;
  availability: Availability;          // disponibilidade vinda do servidor (ou local se vazio)
  onRefresh: () => void;               // recarregar respostas do servidor
  weekId: string;                      // para título/exportação
}
interface AvailabilityFormProps {
  state: State; update: (p: Partial<State>) => void;
  selectedStaffId: string; setSelectedStaffId: (id: string) => void;
  weekId: string; syncEnabled: boolean; onSaved?: () => void;
}

const LS_KEY = "escala_fattoria_state_v4";
const SYNC_ENDPOINT = "https://script.google.com/macros/s/AKfycbwQsmqSOmALernF48mfjTR6CGTdf9ycC-6g2AdexUcpA9Px-WxkYcfviUDTzo2WOEbFzw/exec";

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

// ---------- PRIORIDADES ----------
const LOW_LAST = new Set(["Duda","Dani"]); // últimas prioridades em qualquer dia
const sundayOrder = ["Lauren","Marina","Leo","Nayara"]; // ordem domingo
const weekdayOrder = ["Lauren","Marina","Leo","Ana","Mariana"]; // outros dias (Ana e Mariana iguais)

// ordena nomes por prioridade do dia (mantém todos os disponíveis)
function sortByPriorityForDay(names: string[], dayCode: string): string[] {
  const base = (dayCode==="dom_almoco" || dayCode==="dom_noite") ? sundayOrder : weekdayOrder;
  const rank = (nm: string) => {
    if (LOW_LAST.has(nm)) return 10_000; // sempre por último
    const i = base.indexOf(nm);
    return i >= 0 ? i : 999; // quem não está explicitamente na lista vem depois
  };
  return [...names].sort((a,b)=>{
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b, 'pt-BR');
  });
}

export default function App(){
  const [state, setState] = useState<State>(()=>{ try{ const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) as State : defaultState; }catch{ return defaultState; } });
  const [activeTab, setActiveTab] = useState<"disponibilidade"|"escalar"|"limpar"|"export">("disponibilidade");
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [weekIdSlash, setWeekIdSlash] = useState<string>("");
  const [weekIdDash, setWeekIdDash] = useState<string>("");

  // respostas vindas do servidor
  const [serverAvail, setServerAvail] = useState<Availability>({});

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

  // ---- Helpers p/ servidor ----
  function rowsToAvailability(rows: Array<{staff:string; days:string[]}>): Availability {
    const nameToId = Object.fromEntries(state.staff.map(s => [s.name, s.id] as const));
    const codeToId = Object.fromEntries(state.days.map(d => [d.code, d.id] as const));
    const out: Availability = {};
    for (const r of rows) {
      const sid = nameToId[r.staff];
      if (!sid) continue;
      const ids = (r.days || []).map(c => codeToId[c]).filter(Boolean) as string[];
      out[sid] = ids;
    }
    return out;
  }

  async function refreshServer() {
    if (!SYNC_ENDPOINT || !weekIdDash) return;
    try {
      const url = `${SYNC_ENDPOINT}?action=list&weekId=${encodeURIComponent(weekIdDash)}`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (data?.ok && Array.isArray(data.rows)) {
        setServerAvail(rowsToAvailability(data.rows));
      }
    } catch {
      // silencioso
    }
  }

  useEffect(()=>{ refreshServer(); }, [weekIdDash, state.staff, state.days]);

  const availabilityForSolver: Availability =
    Object.keys(serverAvail).length ? serverAvail : state.availability;

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
            <AvailabilityForm
              state={state} update={update}
              selectedStaffId={selectedStaffId} setSelectedStaffId={setSelectedStaffId}
              weekId={weekIdDash} syncEnabled={syncEnabled}
              onSaved={refreshServer}
            />
          </Card>
        )}

        {activeTab==="escalar" && (
          <Card title="Escalar" icon={<Cal className="w-5 h-5"/>}>
            <SolverUI state={state} availability={availabilityForSolver} onRefresh={refreshServer} weekId={weekIdDash}/>
          </Card>
        )}

        {activeTab==="limpar" && (
          <Card title="Limpar respostas da semana" icon={<Trash2 className="w-5 h-5"/>}>
            <ClearTab weekId={weekIdDash} onClearLocal={()=> setState(prev=> ({...prev, availability:{}}))} />
          </Card>
        )}

        {activeTab==="export" && (
          <Card title="Link para Compartilhar" icon={<Share2 className="w-5 h-5"/>}>
            <ShareExport state={state} weekId={weekIdDash} />
          </Card>
        )}

        <div className="mt-6 text-xs text-gray-500 flex items-center gap-2">
          <RefreshCw className="w-4 h-4"/> Dados locais + servidor. Use “Escalar” → “Atualizar respostas”.
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

function AvailabilityForm({ state, update, selectedStaffId, setSelectedStaffId, weekId, syncEnabled, onSaved }: AvailabilityFormProps){
  const selected = state.staff.find(s=> s.id===selectedStaffId);
  const chosen = state.availability[selectedStaffId] || [];

  const toggle = (dayId: string) => {
    const curr = new Set(chosen);
    if(curr.has(dayId)) curr.delete(dayId); else curr.add(dayId);
    update({ availability: { ...state.availability, [selectedStaffId]: Array.from(curr) } });
  };

  const save = async () => {
    if (!selected) { alert("Selecione seu nome."); return; }
    const chosenCodes = (state.availability[selectedStaffId]||[])
      .map(did => state.days.find(d=>d.id===did)?.code)
      .filter(Boolean) as string[];

    if (syncEnabled && weekId) {
      try {
        const resp = await fetch(SYNC_ENDPOINT, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'upsert', weekId, staff: selected.name, days: chosenCodes })
        });
        // Em no-cors a resposta é 'opaque' e não pode ser lida; trate como sucesso
        // @ts-ignore
        if ((resp as any)?.type === 'opaque' || (resp as any)?.status === 0) {
          alert('Suas escolhas foram salvas.');
          onSaved?.();
          return;
        }
        if (!resp.ok) {
          const txt = await resp.text().catch(()=> "");
          alert(`Falha ao salvar (HTTP ${resp.status}). Resposta: ${txt.slice(0,180)}`);
          return;
        }
        const txt = await resp.text();
        try {
          const data = JSON.parse(txt);
          if (data.ok) { alert('Suas escolhas foram salvas.'); onSaved?.(); }
          else alert(`Falha ao salvar no servidor: ${data.error || 'erro desconhecido'}`);
        } catch {
          alert('Suas escolhas foram salvas.'); onSaved?.();
        }
      } catch (err:any) {
        alert(`Não foi possível enviar. Verifique sua conexão. Erro: ${String(err)}`);
      }
    } else {
      alert('Salvo localmente (modo offline).');
      onSaved?.();
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

// ======== SOLVER ========
type SolveResult = {
  ok:boolean;
  assignments: Record<string,string[]>;
  messages:string[];
  availSorted: Record<string,string[]>; // disponíveis (ordenados) por diaId (ids)
};

function solve(state:State, availability: Availability): SolveResult {
  const messages: string[] = [];
  const assignments: Record<string,string[]> = {};
  const availSorted: Record<string,string[]> = {};

  const staffById = Object.fromEntries(state.staff.map(s=>[s.id, s] as const));
  const nameOf = (sid:string)=> staffById[sid]?.name || "";

  // disponibilidade por dia (ids de staff)
  const availPerDayIds: Record<string, string[]> = Object.fromEntries(
    state.days.map(d=>{
      const avail = state.staff
        .filter(s=> (availability[s.id]||[]).includes(d.id))
        .map(s=>s.id);
      return [d.id, avail];
    })
  );

  // montar lista de disponíveis ordenados por prioridade
  for (const day of state.days) {
    const names = (availPerDayIds[day.id] || []).map(nameOf);
    const ordered = sortByPriorityForDay(names, day.code);
    // voltar de nome -> id
    const idsOrdered = ordered.map(nm => state.staff.find(s=>s.name===nm)?.id || "").filter(Boolean);
    availSorted[day.id] = idsOrdered;
  }

  // sugestão automática
  for (const day of state.days) {
    const poolIds = availSorted[day.id] || [];
    const poolNames = poolIds.map(nameOf);
    const target = day.required;

    let chosen: string[] = [];

    // DOMINGOS: incluir Gabi SEM CONTAR no requerido
    if ((day.code==="dom_almoco" || day.code==="dom_noite") && poolNames.includes("Gabi")) {
      const gid = state.staff.find(s=>s.name==="Gabi")!.id;
      chosen.push(gid);
    }

    for (const sid of poolIds) {
      const nm = nameOf(sid);
      if (nm==="Gabi" && (day.code==="dom_almoco" || day.code==="dom_noite")) continue; // Gabi já extra
      if (chosen.includes(sid)) continue;
      if (chosen.filter(x=> nameOf(x)!=="Gabi").length < target) {
        chosen.push(sid);
      }
    }

    const nonGabi = chosen.filter(x=> nameOf(x)!=="Gabi").slice(0, target);
    const final = (chosen.find(x=> nameOf(x)==="Gabi"))
      ? Array.from(new Set([state.staff.find(s=>s.name==="Gabi")!.id, ...nonGabi]))
      : nonGabi;

    assignments[day.id] = final;
  }

  const ok = state.days.every(d=> (assignments[d.id]||[]).filter(x=> state.staff.find(s=>s.id===x)?.name!=="Gabi").length===d.required);

  for (const d of state.days) {
    const avail = (availSorted[d.id]||[]).length;
    const namesAvail = (availSorted[d.id]||[]).map(id=> state.staff.find(s=>s.id===id)?.name || id).join(", ");
    messages.push(`Disponíveis ${d.label}: ${namesAvail || "—"}`);
    if (avail < d.required) messages.push(`ℹ️ ${d.label}: só ${avail} disponíveis para ${d.required} vagas.`);
  }

  return { ok, assignments, messages, availSorted };
}

function SolverUI({ state, availability, onRefresh, weekId }: SolverUIProps){
  const res = useMemo(()=> solve(state, availability), [state, availability]);
  const { assignments, availSorted } = res;

  // Quem respondeu
  const respondedIds = Object.keys(availability||{});
  const respondedSet = new Set(respondedIds);
  const missing = state.staff.filter(s=>!respondedSet.has(s.id)).map(s=>s.name);
  const total = state.staff.length;

  // estado local para confirmação final (comboboxes)
  const [confirm, setConfirm] = useState<Record<string, string[]>>(()=> {
    const init: Record<string,string[]> = {};
    for (const d of state.days) {
      const sugg = (assignments[d.id]||[]).filter(x=> state.staff.find(s=>s.id===x)?.name!=="Gabi");
      const target = d.required;
      const arr = Array.from({length: target}, (_,i)=> sugg[i] || "");
      init[d.id] = arr;
    }
    return init;
  });

  useEffect(()=> {
    const init: Record<string,string[]> = {};
    for (const d of state.days) {
      const sugg = (assignments[d.id]||[]).filter(x=> state.staff.find(s=>s.id===x)?.name!=="Gabi");
      const target = d.required;
      const arr = Array.from({length: target}, (_,i)=> sugg[i] || "");
      init[d.id] = arr;
    }
    setConfirm(init);
  }, [availability, state.days, assignments]);

  const setConfirmCell = (dayId:string, idx:number, val:string) => {
    setConfirm(prev => {
      const arr = [...(prev[dayId]||[])];
      arr[idx] = val;
      return { ...prev, [dayId]: arr };
    });
  };

  const labelOf = (sid:string) => state.staff.find(s=>s.id===sid)?.name || "";

  // lista de disponíveis (ordenados) por nome (para exibir)
  const availNamesByDay: Record<string,string[]> = Object.fromEntries(
    state.days.map(d=>{
      const arr = (availSorted[d.id]||[]).map(labelOf);
      return [d.id, arr];
    })
  );

  // opções para os selects finais (somente disponíveis; em domingos, excluir Gabi dos slots)
  const selectOptionsByDay: Record<string, {id:string, name:string}[]> = Object.fromEntries(
    state.days.map(d=>{
      const ids = (availSorted[d.id]||[]).filter(sid=>{
        const nm = labelOf(sid);
        if ((d.code==="dom_almoco" || d.code==="dom_noite") && nm==="Gabi") return false;
        return true;
      });
      return [d.id, ids.map(sid=> ({ id:sid, name: labelOf(sid) }))];
    })
  );

  const hasGabi = (dayId:string) => {
    const nm = (assignments[dayId]||[]).map(labelOf);
    return nm.includes("Gabi");
  };

  // ===== Exportação bonita (cartaz) =====
  const exportRef = useRef<HTMLDivElement>(null);
  const exportRows = state.days.map(d => {
    const selected = (confirm[d.id] || []).filter(Boolean);
    const selectedNames = selected.map(labelOf);
    const isDom = d.code==="dom_almoco" || d.code==="dom_noite";
    const availIds = (availSorted[d.id] || []);
    const hasGabiAvail = isDom && availIds.some(id => labelOf(id) === "Gabi");
    const extras = hasGabiAvail ? ["Gabi"] : [];
    return { label: d.label, required: d.required, escalados: selectedNames, extras };
  });

  const downloadJpg = async () => {
    const node = exportRef.current;
    if (!node) return;
    try {
      const dataUrl = await toJpeg(node, {
        quality: 0.95,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      });
      const a = document.createElement("a");
      const ddmmyyyy = (weekId || "").split("-").join("/");
      a.href = dataUrl;
      a.download = `Escalacao-Fattoria-${ddmmyyyy || "semana"}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      if (isIOS) window.open(dataUrl, "_blank");
    } catch (e) {
      alert("Não foi possível gerar o JPG. Tente novamente.");
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-sm">
        {missing.length===0 ? (
          <div className="rounded-xl border px-3 py-2 bg-green-50 text-green-800">
            Todas as {total} pessoas já responderam.
          </div>
        ) : (
          <div className="rounded-xl border px-3 py-2 bg-amber-50 text-amber-800">
            {total - missing.length} de {total} já responderam.
            <span className="block text-xs mt-1">Sem resposta: {missing.join(", ")}</span>
            <div className="mt-2">
              <button onClick={onRefresh} className="btn btn-ghost text-sm">Atualizar respostas</button>
            </div>
          </div>
        )}
        {missing.length===0 && (
          <div className="mt-2">
            <button onClick={onRefresh} className="btn btn-ghost text-sm">Atualizar respostas</button>
          </div>
        )}
      </div>

      {/* Tabela de DISPONÍVEIS */}
      <div className="overflow-auto">
        <table className="min-w-full border text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="border px-3 py-2 text-left">Dia/Turno</th>
              <th className="border px-3 py-2 text-left">Requeridos</th>
              <th className="border px-3 py-2 text-left">Disponíveis (na ordem de prioridade)</th>
            </tr>
          </thead>
          <tbody>
            {state.days.map(day=>{
              const names = availNamesByDay[day.id] || [];
              return (
                <tr key={day.id}>
                  <td className="border px-3 py-2">{day.label}</td>
                  <td className="border px-3 py-2">{day.required}</td>
                  <td className="border px-3 py-2">
                    {names.length ? names.join(", ") : <span className="text-red-600">— ninguém disponível</span>}
                    {(day.code==="dom_almoco" || day.code==="dom_noite") && hasGabi(day.id) && (
                      <span className="ml-2 text-xs text-gray-600">(Gabi será adicionada automaticamente como extra)</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Cabeçalho + botão do JPG */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-base">Escalação (confirme abaixo)</h3>
        <button onClick={downloadJpg} className="btn btn-primary text-sm">Baixar JPG (bonito)</button>
      </div>

      {/* Tabela de CONFIRMAÇÃO */}
      <div className="overflow-auto">
        <table className="min-w-full border text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="border px-3 py-2 text-left">Dia/Turno</th>
              <th className="border px-3 py-2 text-left">Escalação</th>
            </tr>
          </thead>
          <tbody>
            {state.days.map(day=>{
              const options = selectOptionsByDay[day.id] || [];
              const slots = confirm[day.id] || Array.from({length: day.required}, ()=>"");
              return (
                <tr key={day.id}>
                  <td className="border px-3 py-2 align-top">{day.label}</td>
                  <td className="border px-3 py-2">
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {slots.map((val,idx)=>(
                        <select
                          key={idx}
                          className="input"
                          value={val}
                          onChange={(e)=> setConfirmCell(day.id, idx, e.target.value)}
                        >
                          <option value="">— Selecionar —</option>
                          {options.map(opt=>(
                            <option key={opt.id} value={opt.id}>{opt.name}</option>
                          ))}
                        </select>
                      ))}
                    </div>
                    {(day.code==="dom_almoco" || day.code==="dom_noite") && hasGabi(day.id) && (
                      <div className="text-xs text-gray-600 mt-1">Obs.: Gabi será adicionada como extra (não ocupa vaga).</div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* CARTAZ INVISÍVEL PARA EXPORTAR COMO JPG */}
      <div ref={exportRef} style={{ position: "fixed", left: -99999, top: -99999, width: 1000 }}>
        <ExportPoster weekId={weekId} rows={state.days.map(d=>{
          const selected = (confirm[d.id] || []).filter(Boolean).map(id=> state.staff.find(s=>s.id===id)?.name || id);
          const isDom = d.code==="dom_almoco" || d.code==="dom_noite";
          const hasGabiAvail = isDom && (availSorted[d.id]||[]).some(id=> (state.staff.find(s=>s.id===id)?.name)==="Gabi");
          const extras = hasGabiAvail ? ["Gabi"] : [];
          return { label: d.label, required: d.required, escalados: selected, extras };
        })}/>
      </div>
    </div>
  );
}

function ShareExport({ state, weekId }: ShareExportProps){
  const [copied, setCopied] = useState(false);
  const base = typeof window!=="undefined" ? window.location.origin + window.location.pathname : "";
  const conf = encodeConfig(state);
  const shareLink = `${base}?s=${encodeURIComponent(conf)}&w=${encodeURIComponent(weekId||"")}`;
  const copy = async (txt:string)=>{ try{ await navigator.clipboard.writeText(txt); setCopied(true); setTimeout(()=>setCopied(false), 1200);}catch{} };

  return (
    <div className="space-y-3">
      <div className="text-sm text-gray-700">Envie este link para carregar <b>nomes, dias/turnos e regras</b> (sem disponibilidades):</div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input readOnly value={shareLink} className="input w-full"/>
        <button onClick={()=>copy(shareLink)} className="btn btn-primary"><Copy className="w-4 h-4"/>{copied?"Copiado!":"Copiar"}</button>
      </div>
    </div>
  );
}

function ClearTab({
  weekId,
  onClearLocal,
}: {
  weekId: string;
  onClearLocal: () => void;
}) {
  const clearAll = async () => {
    onClearLocal();
    if (SYNC_ENDPOINT && weekId) {
      try {
        const resp = await fetch(SYNC_ENDPOINT, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ action: "clear", weekId }),
        });
        // @ts-ignore
        if ((resp as any)?.type === "opaque" || (resp as any)?.status === 0) {
          alert("Respostas da semana limpas.");
          return;
        }
        if (!resp.ok) {
          const txt = await resp.text().catch(() => "");
          alert(`Falha ao limpar (HTTP ${resp.status}). ${txt.slice(0, 180)}`);
          return;
        }
      } catch {}
    }
    alert("Respostas da semana limpas.");
  };

  return (
    <div className="flex items-center justify-between">
      <div className="text-sm text-gray-600">
        Use este botão no início de cada semana para zerar as respostas.
        Semana atual: <b>{weekId || "-"}</b>
      </div>
      <button onClick={clearAll} className="btn btn-primary">
        Limpar
      </button>
    </div>
  );
}

/** ---------- Poster bonito para exportação ---------- */
function ExportPoster({
  weekId,
  rows,
}: {
  weekId: string;
  rows: { label: string; required: number; escalados: string[]; extras: string[] }[];
}) {
  const titleDate = (weekId || "").split("-").join("/"); // DD-MM-YYYY -> DD/MM/YYYY

  return (
    <div className="bg-white text-gray-900 p-8" style={{ fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto" }}>
      {/* Cabeçalho */}
      <div className="text-center mb-6">
        <div className="text-2xl font-bold">Escalação Fattoria</div>
        <div className="text-sm text-gray-600">Semana {titleDate || "-"}</div>
      </div>

      {/* Tabela bonita */}
      <table className="w-full text-sm border border-gray-300 rounded-xl overflow-hidden" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
        <thead className="bg-gray-100">
          <tr>
            <th className="text-left px-4 py-3 border-b border-gray-300">Dia/Turno</th>
            <th className="text-left px-4 py-3 border-b border-gray-300">Escalação</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const zebra = i % 2 === 1 ? "bg-gray-50" : "bg-white";
            const escala = r.escalados.length ? r.escalados.join(", ") : "—";
            const extras = r.extras.length ? `  • Extras: ${r.extras.join(", ")}` : "";
            return (
              <tr key={i} className={zebra}>
                <td className="px-4 py-3 align-top border-t border-gray-200">{r.label}</td>
                <td className="px-4 py-3 align-top border-t border-gray-200">
                  {escala}
                  {extras && <span className="text-gray-600">{extras}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="text-[11px] text-gray-500 mt-4">
        Geração automática • Preferências e prioridades aplicadas • Gabi extra aos domingos quando disponível
      </div>
    </div>
  );
}
