import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Trash2,
  Calendar as Cal,
  RefreshCw,
  ClipboardList,
  Share2,
  Copy,
} from "lucide-react";

type Staff = { id: string; name: string };
type Day = { id: string; label: string; code: string };
type Rule = { id: string; a: string; b: string; kind: "must" | "never" };
type Availability = Record<string, string[]>;
type State = { staff: Staff[]; days: Day[]; rules: Rule[]; availability: Availability };

interface TabButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}
interface CardProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}
interface ShareExportProps {
  state: State;
  weekId: string;
}
interface SolverUIProps {
  state: State;
  availability: Availability;
  onRefresh: () => void;
  weekId: string;
}
interface AvailabilityFormProps {
  state: State;
  update: (p: Partial<State>) => void;
  selectedStaffId: string;
  setSelectedStaffId: (id: string) => void;
  weekId: string;
  syncEnabled: boolean;
  onSaved?: () => void;
}
interface PunchTabProps {
  staff: Staff[];
}

const LS_KEY = "escala_fattoria_state_v4";
const SYNC_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbwQsmqSOmALernF48mfjTR6CGTdf9ycC-6g2AdexUcpA9Px-WxkYcfviUDTzo2WOEbFzw/exec";

function id() {
  return Math.random().toString(36).slice(2, 10);
}

function formatDDMMYYYY_slash(dt: Date) {
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
function formatDDMMYYYY_dash(dt: Date) {
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}
function mondayOfWeek(d: Date) {
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = dt.getDay();
  const diff = (day + 6) % 7;
  dt.setDate(dt.getDate() - diff);
  return dt;
}
function weekIdFromDate_slash(d: Date) {
  return formatDDMMYYYY_slash(mondayOfWeek(d));
}
function weekIdFromDate_dash(d: Date) {
  return formatDDMMYYYY_dash(mondayOfWeek(d));
}

const defaultState: State = {
  staff: [],
  days: [
    { id: id(), label: "Quarta", code: "qua" },
    { id: id(), label: "Quinta", code: "qui" },
    { id: id(), label: "Sexta", code: "sex" },
    { id: id(), label: "Sábado", code: "sab" },
    { id: id(), label: "Domingo (Almoço)", code: "dom_almoco" },
    { id: id(), label: "Domingo (Noite)", code: "dom_noite" },
  ],
  rules: [],
  availability: {},
};

function encodeConfig(state: State) {
  const payload = { staff: state.staff, days: state.days, rules: state.rules };
  const json = JSON.stringify(payload);
  return btoa(unescape(encodeURIComponent(json)));
}
function decodeConfig(b64: string) {
  try {
    const json = decodeURIComponent(escape(atob(b64)));
    const obj = JSON.parse(json);
    if (obj && Array.isArray(obj.staff) && Array.isArray(obj.days) && Array.isArray(obj.rules)) {
      return obj as Pick<State, "staff" | "days" | "rules">;
    }
  } catch {}
  return null;
}

export default function App() {
  const [state, setState] = useState<State>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? (JSON.parse(raw) as State) : defaultState;
    } catch {
      return defaultState;
    }
  });
  const [activeTab, setActiveTab] = useState<
    "disponibilidade" | "baterponto" | "escalar" | "limpar" | "export"
  >("disponibilidade");
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [weekIdSlash, setWeekIdSlash] = useState<string>("");
  const [weekIdDash, setWeekIdDash] = useState<string>("");

  const [serverAvail, setServerAvail] = useState<Availability>({});

  const syncEnabled = !!SYNC_ENDPOINT;

  useEffect(() => {
    const url = new URL(window.location.href);
    const s = url.searchParams.get("s");
    if (s) {
      const conf = decodeConfig(s);
      if (conf) {
        setState((prev) => ({ ...prev, ...conf }));
      }
    }
    const wanted = url.searchParams.get("staff");
    const w = url.searchParams.get("w");
    const initialDash = w || weekIdFromDate_dash(new Date());
    setWeekIdDash(initialDash);
    const [d, m, y] = initialDash.split("-").map(Number);
    setWeekIdSlash(`${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`);
    if (wanted) {
      setTimeout(() => {
        setState((curr) => {
          const found = curr.staff.find(
            (p) => p.name.toLowerCase() === wanted.toLowerCase()
          );
          if (found) setSelectedStaffId(found.id);
          return curr;
        });
      }, 0);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  useEffect(() => {
    if (!selectedStaffId && state.staff.length) setSelectedStaffId(state.staff[0].id);
  }, [state.staff, selectedStaffId]);

  // carrega colaboradores da planilha "Cadastro_colaboradores"
  useEffect(() => {
    async function loadStaff() {
      try {
        const url = `${SYNC_ENDPOINT}?action=staff`;
        const resp = await fetch(url);
        const data = await resp.json();
        if (!data?.ok || !Array.isArray(data.names)) {
          console.error("Resposta inválida em /staff", data);
          return;
        }
        setState((prev) => {
          const oldByName = new Map(prev.staff.map((s) => [s.name, s.id]));
          const newStaff: Staff[] = data.names.map((name: string) => ({
            id: oldByName.get(name) || id(),
            name,
          }));
          return { ...prev, staff: newStaff };
        });
      } catch (err) {
        console.error("Falha ao carregar colaboradores:", err);
      }
    }
    loadStaff();
  }, []);

  const update = (patch: Partial<State>) => setState((s) => ({ ...s, ...patch }));

  function rowsToAvailability(rows: Array<{ staff: string; days: string[] }>): Availability {
    const nameToId = Object.fromEntries(state.staff.map((s) => [s.name, s.id] as const));
    const codeToId = Object.fromEntries(state.days.map((d) => [d.code, d.id] as const));
    const out: Availability = {};
    for (const r of rows) {
      const sid = nameToId[r.staff];
      if (!sid) continue;
      const ids = (r.days || [])
        .map((c) => codeToId[c])
        .filter(Boolean) as string[];
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

  useEffect(() => {
    refreshServer();
  }, [weekIdDash, state.staff, state.days]);

  const availabilityForSolver: Availability =
    Object.keys(serverAvail).length ? serverAvail : state.availability;

  return (
    <div className="min-h-screen text-gray-900 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto">
        <header className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">Escalação Semanal Fattoria</h1>
            <p className="text-sm text-gray-600">
              Preencha disponibilidades no celular, bata ponto e gere a escala.
            </p>
          </div>
          <div className="flex gap-2 overflow-auto">
            <TabButton
              icon={<ClipboardList className="w-4 h-4" />}
              active={activeTab === "disponibilidade"}
              onClick={() => setActiveTab("disponibilidade")}
              label="Disponibilidade"
            />
            <TabButton
              icon={<Cal className="w-4 h-4" />}
              active={activeTab === "baterponto"}
              onClick={() => setActiveTab("baterponto")}
              label="Bater ponto"
            />
            <TabButton
              icon={<Cal className="w-4 h-4" />}
              active={activeTab === "escalar"}
              onClick={() => setActiveTab("escalar")}
              label="Escalar"
            />
            <TabButton
              icon={<Trash2 className="w-4 h-4" />}
              active={activeTab === "limpar"}
              onClick={() => setActiveTab("limpar")}
              label="Limpar"
            />
            <TabButton
              icon={<Share2 className="w-4 h-4" />}
              active={activeTab === "export"}
              onClick={() => setActiveTab("export")}
              label="Compartilhar"
            />
          </div>
        </header>

        {activeTab === "disponibilidade" && (
          <Card
            title={`Formulário de Disponibilidade – Semana ${weekIdSlash || "(definir)"}`}
            icon={<ClipboardList className="w-5 h-5" />}
          >
            <AvailabilityForm
              state={state}
              update={update}
              selectedStaffId={selectedStaffId}
              setSelectedStaffId={setSelectedStaffId}
              weekId={weekIdDash}
              syncEnabled={syncEnabled}
              onSaved={refreshServer}
            />
          </Card>
        )}

        {activeTab === "baterponto" && (
          <Card title="Bater ponto" icon={<Cal className="w-5 h-5" />}>
            <PunchTab staff={state.staff} />
          </Card>
        )}

        {activeTab === "escalar" && (
          <Card title="Escalar" icon={<Cal className="w-5 h-5" />}>
            <SolverUI
              state={state}
              availability={availabilityForSolver}
              onRefresh={refreshServer}
              weekId={weekIdDash}
            />
          </Card>
        )}

        {activeTab === "limpar" && (
          <Card title="Limpar respostas da semana" icon={<Trash2 className="w-5 h-5" />}>
            <ClearTab
              weekId={weekIdDash}
              onClearLocal={() =>
                setState((prev) => ({
                  ...prev,
                  availability: {},
                }))
              }
            />
          </Card>
        )}

        {activeTab === "export" && (
          <Card title="Link para Compartilhar" icon={<Share2 className="w-5 h-5" />}>
            <ShareExport state={state} weekId={weekIdDash} />
          </Card>
        )}

        <div className="mt-6 text-xs text-gray-500 flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> Dados locais + servidor. Use “Escalar” → “Atualizar
          respostas”.
        </div>
      </div>
    </div>
  );
}

function TabButton({ label, active, onClick, icon }: TabButtonProps) {
  return (
    <button onClick={onClick} className={`tab ${active ? "tab-active" : "tab-inactive"}`}>
      {icon}
      {label}
    </button>
  );
}

function Card({ title, icon, children }: CardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="card"
    >
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h2 className="font-semibold">{title}</h2>
      </div>
      {children}
    </motion.div>
  );
}

function AvailabilityForm({
  state,
  update,
  selectedStaffId,
  setSelectedStaffId,
  weekId,
  syncEnabled,
  onSaved,
}: AvailabilityFormProps) {
  const selected = state.staff.find((s) => s.id === selectedStaffId);
  const chosen = state.availability[selectedStaffId] || [];

  const toggle = (dayId: string) => {
    const curr = new Set(chosen);
    if (curr.has(dayId)) curr.delete(dayId);
    else curr.add(dayId);
    update({
      availability: { ...state.availability, [selectedStaffId]: Array.from(curr) },
    });
  };

  const save = async () => {
    if (!selected) {
      alert("Selecione seu nome.");
      return;
    }
    const chosenCodes = (state.availability[selectedStaffId] || [])
      .map((did) => state.days.find((d) => d.id === did)?.code)
      .filter(Boolean) as string[];

    if (syncEnabled && weekId) {
      try {
        const resp = await fetch(SYNC_ENDPOINT, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            action: "upsert",
            weekId,
            staff: selected.name,
            days: chosenCodes,
          }),
        });
        // no-cors -> resposta 'opaque'
        // @ts-ignore
        if ((resp as any)?.type === "opaque" || (resp as any)?.status === 0) {
          alert("Suas escolhas foram salvas.");
          onSaved?.();
          return;
        }
        if (!resp.ok) {
          const txt = await resp.text().catch(() => "");
          alert(`Falha ao salvar (HTTP ${resp.status}). Resposta: ${txt.slice(0, 180)}`);
          return;
        }
        const txt = await resp.text();
        try {
          const data = JSON.parse(txt);
          if (data.ok) {
            alert("Suas escolhas foram salvas.");
            onSaved?.();
          } else alert(`Falha ao salvar no servidor: ${data.error || "erro desconhecido"}`);
        } catch {
          alert("Suas escolhas foram salvas.");
          onSaved?.();
        }
      } catch (err: any) {
        alert(`Não foi possível enviar. Verifique sua conexão. Erro: ${String(err)}`);
      }
    } else {
      alert("Salvo localmente (modo offline).");
      onSaved?.();
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
        <label className="text-sm text-gray-600">Seu nome</label>
        <select
          className="input sm:col-span-2"
          value={selectedStaffId}
          onChange={(e) => setSelectedStaffId(e.target.value)}
        >
          {state.staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid sm:grid-cols-2 gap-2">
        {state.days.map((d) => (
          <label
            key={d.id}
            className="flex items-center gap-2 border rounded-xl px-3 py-2 bg-white"
          >
            <input
              type="checkbox"
              checked={chosen.includes(d.id)}
              onChange={() => toggle(d.id)}
            />
            <span>{d.label}</span>
          </label>
        ))}
      </div>

      <button onClick={save} className={`btn ${syncEnabled ? "btn-primary" : "btn-ghost"}`}>
        Salvar minhas escolhas
      </button>
      {!syncEnabled && (
        <div className="text-xs text-amber-700">Sem endpoint configurado (modo offline).</div>
      )}
    </div>
  );
}

// ======== ABA BATER PONTO ========
function PunchTab({ staff }: PunchTabProps) {
  const [selectedId, setSelectedId] = useState<string>("");

  const allPeople = useMemo(() => {
    const baseNames = staff.map((s) => s.name);
    const extras = ["Eduardo", "Aryelton", "Wellington"];
    const names = [...baseNames, ...extras];
    const seen = new Set<string>();
    const out: { id: string; label: string }[] = [];
    for (const name of names) {
      if (seen.has(name)) continue;
      seen.add(name);
      const st = staff.find((s) => s.name === name);
      const id = st ? st.id : `extra-${name}`;
      out.push({ id, label: name });
    }
    return out;
  }, [staff]);



  useEffect(() => {
    if (!selectedId && allPeople.length) {
      setSelectedId(allPeople[0].id);
    }
  }, [allPeople, selectedId]);

  const today = new Date();
  const dateStr = formatDDMMYYYY_slash(today);

  const handlePunch = async () => {
    if (!selectedId) {
      alert("Selecione uma pessoa.");
      return;
    }
    const entry = allPeople.find((p) => p.id === selectedId);
    const name = entry?.label || "";
    if (!name) {
      alert("Seleção inválida.");
      return;
    }

    if (!SYNC_ENDPOINT) {
      alert(
        `Ponto registrado localmente para ${name} em ${dateStr}, mas nenhum endpoint está configurado.`
      );
      return;
    }

    try {
      const payload = {
        action: "ponto",
        date: dateStr,
        staff: name,
        timestamp: new Date().toISOString(),
      };
      const resp = await fetch(SYNC_ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      });
      // @ts-ignore
      if ((resp as any)?.type === "opaque" || (resp as any)?.status === 0) {
        alert(`Ponto registrado para ${name} em ${dateStr}.`);
        return;
      }
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        alert(`Falha ao registrar ponto (HTTP ${resp.status}). ${txt.slice(0, 180)}`);
        return;
      }
      alert(`Ponto registrado para ${name} em ${dateStr}.`);
    } catch (err: any) {
      alert(`Não foi possível enviar o ponto. Erro: ${String(err)}`);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
        <label className="text-sm text-gray-600">Pessoa</label>
        <select
          className="input sm:col-span-2"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          {allPeople.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <button onClick={handlePunch} className="btn btn-primary">
        {`Bater ponto para dia ${dateStr}`}
      </button>

      <div className="text-xs text-gray-500">
        Cada clique registra uma linha em uma planilha no Google Drive chamada{" "}
        <b>Pontos batidos dia {dateStr}</b>.
      </div>
    </div>
  );
}

// ======== SOLVER NOVO (15 boxes, sem prioridade) ========
const SLOTS_PER_DAY = 15;

function SolverUI({ state, availability, onRefresh, weekId }: SolverUIProps) {
  const respondedIds = Object.keys(availability || {});
  const respondedSet = new Set(respondedIds);
  const missing = state.staff.filter((s) => !respondedSet.has(s.id)).map((s) => s.name);
  const total = state.staff.length;

  const labelOf = (sid: string) => state.staff.find((s) => s.id === sid)?.name || "";

  const availNamesByDay: Record<string, string[]> = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const day of state.days) {
      const names: string[] = [];
      for (const s of state.staff) {
        const daysOfS = availability[s.id] || [];
        if (daysOfS.includes(day.id)) {
          names.push(s.name);
        }
      }
      names.sort((a, b) => a.localeCompare(b, "pt-BR"));
      out[day.id] = names;
    }
    return out;
  }, [state.days, state.staff, availability]);

  const selectOptionsByDay: Record<string, string[]> = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const day of state.days) {
      const ids: string[] = [];
      for (const s of state.staff) {
        const daysOfS = availability[s.id] || [];
        if (daysOfS.includes(day.id)) {
          ids.push(s.id);
        }
      }
      out[day.id] = ids;
    }
    return out;
  }, [state.days, state.staff, availability]);

  const [selects, setSelects] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {};
    for (const d of state.days) {
      init[d.id] = Array(SLOTS_PER_DAY).fill("");
    }
    return init;
  });

  useEffect(() => {
    setSelects((prev) => {
      const next: Record<string, string[]> = {};
      for (const d of state.days) {
        const old = prev[d.id] || [];
        const arr = Array.from({ length: SLOTS_PER_DAY }, (_, i) => old[i] || "");
        next[d.id] = arr;
      }
      return next;
    });
  }, [state.days]);

  const setSelectCell = (dayId: string, idx: number, val: string) => {
    setSelects((prev) => {
      const arr = [...(prev[dayId] || [])];
      arr[idx] = val;
      return { ...prev, [dayId]: arr };
    });
  };

  const [showFinal, setShowFinal] = useState(false);
  const weekLabel = useMemo(
    () => (weekId ? weekId.split("-").join("/") : "-"),
    [weekId]
  );

  const finalRows = useMemo(() => {
    if (!showFinal) return [];
    return state.days.map((day) => {
      const arr = selects[day.id] || [];
      const names = arr
        .filter(Boolean)
        .map((sid) => labelOf(sid))
        .filter((nm, idx, all) => nm && all.indexOf(nm) === idx);
      return {
        dayLabel: day.label,
        names,
      };
    });
  }, [showFinal, selects, state.days]);

  return (
    <div className="space-y-6">
      <div className="text-sm">
        {missing.length === 0 ? (
          <div className="rounded-xl border px-3 py-2 bg-green-50 text-green-800">
            Todas as {total} pessoas já responderam.
          </div>
        ) : (
          <div className="rounded-xl border px-3 py-2 bg-amber-50 text-amber-800">
            {total - missing.length} de {total} já responderam.
            <span className="block text-xs mt-1">Sem resposta: {missing.join(", ")}</span>
            <div className="mt-2">
              <button onClick={onRefresh} className="btn btn-ghost text-sm">
                Atualizar respostas
              </button>
            </div>
          </div>
        )}
        {missing.length === 0 && (
          <div className="mt-2">
            <button onClick={onRefresh} className="btn btn-ghost text-sm">
              Atualizar respostas
            </button>
          </div>
        )}
      </div>

      {/* TABELA DE DISPONIBILIDADE */}
      <div>
        <h3 className="font-semibold text-base mb-2">Tabela de Disponibilidade</h3>
        <div className="overflow-auto">
          <table className="min-w-full border text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-3 py-2 text-left">Dia/Turno</th>
                <th className="border px-3 py-2 text-left">
                  Disponíveis (ordem alfabética)
                </th>
              </tr>
            </thead>
            <tbody>
              {state.days.map((day) => {
                const names = availNamesByDay[day.id] || [];
                return (
                  <tr key={day.id}>
                    <td className="border px-3 py-2">{day.label}</td>
                    <td className="border px-3 py-2">
                      {names.length ? (
                        names.join(", ")
                      ) : (
                        <span className="text-red-600">— ninguém disponível</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* TABELA DE SELEÇÃO */}
      <div>
        <h3 className="font-semibold text-base mb-2">Tabela de Seleção</h3>
        <div className="overflow-auto">
          <table className="min-w-full border text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-3 py-2 text-left">Dia/Turno</th>
                <th className="border px-3 py-2 text-left">Escalação (até 15 nomes)</th>
              </tr>
            </thead>
            <tbody>
              {state.days.map((day) => {
                const slotValues = selects[day.id] || Array(SLOTS_PER_DAY).fill("");
                const optionIds = selectOptionsByDay[day.id] || [];
                return (
                  <tr key={day.id}>
                    <td className="border px-3 py-2 align-top">{day.label}</td>
                    <td className="border px-3 py-2">
                      <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                        {slotValues.map((val, idx) => (
                          <select
                            key={idx}
                            className="input text-xs py-1 px-2"
                            value={val}
                            onChange={(e) =>
                              setSelectCell(day.id, idx, e.target.value)
                            }
                          >
                            <option value="">- Selecionar -</option>
                            {optionIds.map((sid) => (
                              <option key={sid} value={sid}>
                                {labelOf(sid)}
                              </option>
                            ))}
                          </select>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* BOTÃO + ESCALAÇÃO FINAL */}
      <div className="space-y-3">
        <button
          onClick={() => setShowFinal(true)}
          className="btn btn-primary text-sm"
        >
          Gerar Escalação Final
        </button>

        {showFinal && (
          <div>
            <h3 className="font-semibold text-base mb-2">
              Escalação Final da Semana {weekLabel}
            </h3>
            <div className="overflow-auto">
              <table className="min-w-full border text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="border px-3 py-2 text-left">Dia/Turno</th>
                    <th className="border px-3 py-2 text-left">Escalação Final</th>
                  </tr>
                </thead>
                <tbody>
                  {finalRows.map((row, idx) => (
                    <tr key={idx}>
                      <td className="border px-3 py-2">{row.dayLabel}</td>
                      <td className="border px-3 py-2">
                        {row.names.length ? row.names.join(", ") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ShareExport({ state, weekId }: ShareExportProps) {
  const [copied, setCopied] = useState(false);
  const base =
    typeof window !== "undefined" ? window.location.origin + window.location.pathname : "";
  const conf = encodeConfig(state);
  const shareLink = `${base}?s=${encodeURIComponent(conf)}&w=${encodeURIComponent(
    weekId || ""
  )}`;
  const copy = async (txt: string) => {
    try {
      await navigator.clipboard.writeText(txt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };

  return (
    <div className="space-y-3">
      <div className="text-sm text-gray-700">
        Envie este link para carregar <b>nomes, dias/turnos e regras</b> (sem disponibilidades):
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input readOnly value={shareLink} className="input w-full" />
        <button onClick={() => copy(shareLink)} className="btn btn-primary">
          <Copy className="w-4 h-4" />
          {copied ? "Copiado!" : "Copiar"}
        </button>
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
        Use este botão no início de cada semana para zerar as respostas. Semana atual:{" "}
        <b>{weekId || "-"}</b>
      </div>
      <button onClick={clearAll} className="btn btn-primary">
        Limpar
      </button>
    </div>
  );
}


