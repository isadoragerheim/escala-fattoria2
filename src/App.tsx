import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Trash2,
  Calendar as Cal,
  RefreshCw,
  ClipboardList,
  ShoppingCart,
} from "lucide-react";

type Staff = { id: string; name: string };
type Day = { id: string; label: string; code: string };
type Rule = { id: string; a: string; b: string; kind: "must" | "never" };
type Availability = Record<string, string[]>;
type State = { staff: Staff[]; days: Day[]; rules: Rule[]; availability: Availability };

interface StockItem {
  item: string;
  categoria: string;
  armazenamento: string;
  estoqueMin: number | null;
  estoqueMax: number | null;
  ondeComprar: string;
  observacao: string;
  setor: string; // novo campo vindo da coluna "Setor"
}

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
  "https://script.google.com/macros/s/AKfycbw-3cr4jczGrGURqtB0daTVHjpLK4eWRqcY0edX47SrEPC6I99_0iyuVjn_Tu_0ptBv8Q/exec";

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
  type Mode = "admin" | "colab";

  const [state, setState] = useState<State>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? (JSON.parse(raw) as State) : defaultState;
    } catch {
      return defaultState;
    }
  });

  const [mode, setMode] = useState<Mode>("admin");

  const [activeTab, setActiveTab] = useState<
    "disponibilidade" | "escalar" | "presenca" | "estoque" | "comissao" | "limpar"
  >("disponibilidade");

  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [weekIdSlash, setWeekIdSlash] = useState<string>("");
  const [weekIdDash, setWeekIdDash] = useState<string>("");

  const [serverAvail, setServerAvail] = useState<Availability>({});

  const syncEnabled = !!SYNC_ENDPOINT;

  // lê parâmetros da URL (config, staff, semana, modo)
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
    const m = url.searchParams.get("mode"); // "colab" ou "admin"

    if (m === "colab") {
      setMode("colab");
      setActiveTab("disponibilidade");
    } else if (m === "admin") {
      setMode("admin");
    }

    const initialDash = w || weekIdFromDate_dash(new Date());
    setWeekIdDash(initialDash);
    const [d, mNum, y] = initialDash.split("-").map(Number);
    setWeekIdSlash(`${String(d).padStart(2, "0")}/${String(mNum).padStart(2, "0")}/${y}`);

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

  // persiste estado local
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

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

  const isColab = mode === "colab";

  return (
    <div className="min-h-screen text-gray-900 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto">
        <header className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">Escalação Semanal Fattoria</h1>
          </div>
          <div className="flex gap-2 overflow-auto">
            {/* 1) Sempre visível: Disponibilidade */}
            <TabButton
              icon={<ClipboardList className="w-4 h-4" />}
              active={activeTab === "disponibilidade"}
              onClick={() => setActiveTab("disponibilidade")}
              label="Disponibilidade"
            />
            {/* 2) Escalar – só admin */}
            {!isColab && (
              <TabButton
                icon={<Cal className="w-4 h-4" />}
                active={activeTab === "escalar"}
                onClick={() => setActiveTab("escalar")}
                label="Escalar"
              />
            )}
            {/* 3) Registrar presença – visível para todos */}
            <TabButton
              icon={<Cal className="w-4 h-4" />}
              active={activeTab === "presenca"}
              onClick={() => setActiveTab("presenca")}
              label="Registrar presença"
            />
            {/* 4) Compras de Estoque – agora visível para todos */}
            <TabButton
              icon={<ShoppingCart className="w-4 h-4" />}
              active={activeTab === "estoque"}
              onClick={() => setActiveTab("estoque")}
              label="Compras de Estoque"
            />
            {/* 5) Comissão e Pagamento – só admin */}
            {!isColab && (
              <TabButton
                icon={<Cal className="w-4 h-4" />}
                active={activeTab === "comissao"}
                onClick={() => setActiveTab("comissao")}
                label="Comissão e Pagamento"
              />
            )}
            {/* 6) Limpar – só admin */}
            {!isColab && (
              <TabButton
                icon={<Trash2 className="w-4 h-4" />}
                active={activeTab === "limpar"}
                onClick={() => setActiveTab("limpar")}
                label="Limpar"
              />
            )}
          </div>
        </header>

        {/* Disponibilidade – sempre acessível */}
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

        {/* Escalar – apenas admin */}
        {!isColab && activeTab === "escalar" && (
          <Card title="Escalar" icon={<Cal className="w-5 h-5" />}>
            <SolverUI
              state={state}
              availability={availabilityForSolver}
              onRefresh={refreshServer}
              weekId={weekIdDash}
            />
          </Card>
        )}

        {/* Registrar presença – sempre acessível */}
        {activeTab === "presenca" && (
          <Card title="Registrar presença" icon={<Cal className="w-5 h-5" />}>
            <PunchTab staff={state.staff} />
          </Card>
        )}

        {/* Compras de Estoque – disponível para admin e colab */}
        {activeTab === "estoque" && (
          <Card title="Compras de Estoque" icon={<ShoppingCart className="w-5 h-5" />}>
            <StockTab />
          </Card>
        )}

        {/* Comissão e Pagamento – apenas admin */}
        {!isColab && activeTab === "comissao" && (
          <Card title="Comissão e Pagamento" icon={<Cal className="w-5 h-5" />}>
            <CommissionTab />
          </Card>
        )}

        {/* Limpar – apenas admin */}
        {!isColab && activeTab === "limpar" && (
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

        <div className="mt-6 text-xs text-gray-500 flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> Dados locais + servidor. Use “Escalar” →
          “Atualizar respostas” (apenas no painel da gerência).
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
      alert("Nenhum nome foi selecionado");
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
          <option value="">Selecionar seu nome</option>
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

// ======== ABA REGISTRAR PRESENÇA ========
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

  // Data, turno, setor
  const [dateRaw, setDateRaw] = useState<string>("");
  const [turno, setTurno] = useState<string>("Noite");
  const [setor, setSetor] = useState<string>("Salão/Bar");

  // Transporte ida
  const [idaModo, setIdaModo] = useState<string>("");
  const [idaCarona, setIdaCarona] = useState<string>("");
  const [idaOnibusQtd, setIdaOnibusQtd] = useState<string>("1");
  const [idaUberValor, setIdaUberValor] = useState<string>("");

  // Transporte volta
  const [voltaModo, setVoltaModo] = useState<string>("");
  const [voltaCarona, setVoltaCarona] = useState<string>("");
  const [voltaOnibusQtd, setVoltaOnibusQtd] = useState<string>("1");
  const [voltaUberValor, setVoltaUberValor] = useState<string>("");

  // Consumo
  type ConsumoItem = { product: string; quantity: string };
  const [consumoItems, setConsumoItems] = useState<ConsumoItem[]>([
    { product: "", quantity: "1" },
  ]);
  const [produtos, setProdutos] = useState<string[]>([]);

  // Carrega lista de produtos da planilha "Cadastro_produtos"
  useEffect(() => {
    async function loadProducts() {
      if (!SYNC_ENDPOINT) return;
      try {
        const url = `${SYNC_ENDPOINT}?action=products`;
        const resp = await fetch(url);
        const data = await resp.json();
        if (data?.ok && Array.isArray(data.products)) {
          setProdutos(data.products as string[]);
        }
      } catch (err) {
        console.error("Falha ao carregar produtos:", err);
      }
    }
    loadProducts();
  }, []);

  const formatDateForPayload = (raw: string) => {
    if (!raw) return "";
    const [y, m, d] = raw.split("-");
    if (!y || !m || !d) return "";
    return `${d}/${m}/${y}`;
  };

  const handleAddConsumoRow = () => {
    setConsumoItems((prev) => [...prev, { product: "", quantity: "1" }]);
  };

  const handleConsumoChange = (idx: number, field: "product" | "quantity", value: string) => {
    setConsumoItems((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: value };
      return copy;
    });
  };

  const handlePunch = async () => {
    if (!selectedId) {
      alert("Nenhum nome foi selecionado");
      return;
    }
    if (!dateRaw) {
      alert("Selecione a data.");
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
        `Presença registrada localmente para ${name}, mas nenhum endpoint está configurado.`
      );
      return;
    }

    const dateStr = formatDateForPayload(dateRaw);
    if (!dateStr) {
      alert("Data inválida.");
      return;
    }

    const consumoLimpo = consumoItems
      .filter((c) => c.product && c.quantity)
      .map((c) => ({
        product: c.product,
        quantity: c.quantity,
      }));

    const payload = {
      action: "ponto",
      date: dateStr,
      staff: name,
      timestamp: new Date().toISOString(),
      turno,
      setor,
      transporte: {
        ida: {
          modo: idaModo,
          caronaCom: idaModo === "carona" ? idaCarona : "",
          onibusQtd: idaModo === "onibus" ? idaOnibusQtd : "",
          uberValor: idaModo === "uber" ? idaUberValor : "",
        },
        volta: {
          modo: voltaModo,
          caronaCom: voltaModo === "carona" ? voltaCarona : "",
          onibusQtd: voltaModo === "onibus" ? voltaOnibusQtd : "",
          uberValor: voltaModo === "uber" ? voltaUberValor : "",
        },
      },
      consumo: consumoLimpo,
    };

    try {
      const resp = await fetch(SYNC_ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      });
      // @ts-ignore
      if ((resp as any)?.type === "opaque" || (resp as any)?.status === 0) {
        alert(`Presença registrada para ${name} em ${dateStr}.`);
        return;
      }
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        alert(`Falha ao registrar presença (HTTP ${resp.status}). ${txt.slice(0, 180)}`);
        return;
      }
      alert(`Presença registrada para ${name} em ${dateStr}.`);
    } catch (err: any) {
      alert(`Não foi possível enviar o registro de presença. Erro: ${String(err)}`);
    }
  };

  const colaboradoresParaCarona = allPeople.filter((p) => p.id !== selectedId);

  return (
    <div className="space-y-4">
      {/* Nome + Data + Turno + Setor */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-sm text-gray-600">Nome</label>
          <select
            className="input w-full"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            <option value="">Selecionar seu nome</option>
            {allPeople.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm text-gray-600">Data</label>
          <input
            type="date"
            className="input w-full"
            value={dateRaw}
            onChange={(e) => setDateRaw(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-gray-600">Turno</label>
          <select
            className="input w-full"
            value={turno}
            onChange={(e) => setTurno(e.target.value)}
          >
            <option value="Almoço">Almoço</option>
            <option value="Noite">Noite</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm text-gray-600">Setor</label>
          <select
            className="input w-full"
            value={setor}
            onChange={(e) => setSetor(e.target.value)}
          >
            <option value="Salão/Bar">Salão/Bar</option>
            <option value="Pizzaria/Cozinha">Pizzaria/Cozinha</option>
          </select>
        </div>
      </div>

      {/* Transporte ida/volta */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Ida */}
        <div className="border rounded-xl p-3 bg-white space-y-2">
          <div className="font-semibold text-sm">Transporte – Ida</div>
          <div className="space-y-1">
            <label className="text-xs text-gray-600">Tipo</label>
            <select
              className="input w-full"
              value={idaModo}
              onChange={(e) => setIdaModo(e.target.value)}
            >
              <option value="">Nenhum</option>
              <option value="carona">Carona</option>
              <option value="onibus">Ônibus</option>
              <option value="uber">Uber</option>
            </select>
          </div>

          {idaModo === "carona" && (
            <div className="space-y-1">
              <label className="text-xs text-gray-600">Carona com</label>
              <select
                className="input w-full"
                value={idaCarona}
                onChange={(e) => setIdaCarona(e.target.value)}
              >
                <option value="">Selecione</option>
                {colaboradoresParaCarona.map((p) => (
                  <option key={p.id} value={p.label}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {idaModo === "onibus" && (
            <div className="space-y-1">
              <label className="text-xs text-gray-600">Nº de passagens (1–3)</label>
              <select
                className="input w-full"
                value={idaOnibusQtd}
                onChange={(e) => setIdaOnibusQtd(e.target.value)}
              >
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </select>
            </div>
          )}

          {idaModo === "uber" && (
            <div className="space-y-1">
              <label className="text-xs text-gray-600">Valor (R$)</label>
              <input
                type="number"
                step="0.01"
                className="input w-full"
                value={idaUberValor}
                onChange={(e) => setIdaUberValor(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Volta */}
        <div className="border rounded-xl p-3 bg-white space-y-2">
          <div className="font-semibold text-sm">Transporte – Volta</div>
          <div className="space-y-1">
            <label className="text-xs text-gray-600">Tipo</label>
            <select
              className="input w-full"
              value={voltaModo}
              onChange={(e) => setVoltaModo(e.target.value)}
            >
              <option value="">Nenhum</option>
              <option value="carona">Carona</option>
              <option value="onibus">Ônibus</option>
              <option value="uber">Uber</option>
            </select>
          </div>

          {voltaModo === "carona" && (
            <div className="space-y-1">
              <label className="text-xs text-gray-600">Carona com</label>
              <select
                className="input w-full"
                value={voltaCarona}
                onChange={(e) => setVoltaCarona(e.target.value)}
              >
                <option value="">Selecione</option>
                {colaboradoresParaCarona.map((p) => (
                  <option key={p.id} value={p.label}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {voltaModo === "onibus" && (
            <div className="space-y-1">
              <label className="text-xs text-gray-600">Nº de passagens (1–3)</label>
              <select
                className="input w-full"
                value={voltaOnibusQtd}
                onChange={(e) => setVoltaOnibusQtd(e.target.value)}
              >
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </select>
            </div>
          )}

          {voltaModo === "uber" && (
            <div className="space-y-1">
              <label className="text-xs text-gray-600">Valor (R$)</label>
              <input
                type="number"
                step="0.01"
                className="input w-full"
                value={voltaUberValor}
                onChange={(e) => setVoltaUberValor(e.target.value)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Consumo */}
      <div className="border rounded-xl p-3 bg-white space-y-2">
        <div className="flex items-center justify-between">
          <div className="font-semibold text-sm">Consumo</div>
          <button
            type="button"
            className="btn btn-ghost text-xs"
            onClick={handleAddConsumoRow}
          >
            + Adicionar item
          </button>
        </div>
        <div className="space-y-2">
          {consumoItems.map((item, idx) => (
            <div
              key={idx}
              className="grid grid-cols-3 sm:grid-cols-4 gap-2 items-center"
            >
              <div className="col-span-2 sm:col-span-3">
                <label className="text-xs text-gray-600 block mb-1">Produto</label>
                <select
                  className="input w-full"
                  value={item.product}
                  onChange={(e) =>
                    handleConsumoChange(idx, "product", e.target.value)
                  }
                >
                  <option value="">Selecione</option>
                  {produtos.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600 block mb-1">Qtd.</label>
                <input
                  type="number"
                  min={1}
                  className="input w-full"
                  value={item.quantity}
                  onChange={(e) =>
                    handleConsumoChange(idx, "quantity", e.target.value)
                  }
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Botão registrar */}
      <div className="pt-2">
        <button onClick={handlePunch} className="btn btn-primary">
          Registrar presença
        </button>
      </div>
    </div>
  );
}

// ======== SOLVER (15 boxes, sem prioridade) + envio por e-mail ========
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

  // Enviar escala por e-mail (para cada colaborador + resumo geral para isagvm@gmail.com)
  const handleSendEmails = async () => {
    if (!SYNC_ENDPOINT) {
      alert("Nenhum endpoint de sincronização configurado.");
      return;
    }

    // monta objeto { [dayCode]: [nomesÚnicos] }
    const schedule: Record<string, string[]> = {};
    for (const day of state.days) {
      const arr = selects[day.id] || {};
      const values = Array.isArray(arr) ? arr : [];
      const names = values
        .filter(Boolean)
        .map((sid: string) => labelOf(sid))
        .filter(Boolean);
      const uniqueNames = Array.from(new Set(names));
      schedule[day.code] = uniqueNames;
    }

    try {
      const payload = {
        action: "send_schedule",
        weekId,
        schedule,
      };
      const resp = await fetch(SYNC_ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      });
      // Em no-cors a resposta é 'opaque'; tratamos como sucesso
      // @ts-ignore
      if ((resp as any)?.type === "opaque" || (resp as any)?.status === 0) {
        alert("Escalas enviadas por e-mail (solicitação enviada ao servidor).");
        return;
      }
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        alert(`Falha ao enviar escalas por e-mail (HTTP ${resp.status}). ${txt.slice(0, 180)}`);
        return;
      }
      alert("Escalas enviadas por e-mail.");
    } catch (err: any) {
      alert(`Não foi possível enviar as escalas por e-mail. Erro: ${String(err)}`);
    }
  };

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

      {/* BOTÃO ENVIAR ESCALA POR E-MAIL */}
      <div className="space-y-2">
        <button
          onClick={handleSendEmails}
          className="btn btn-primary text-sm"
        >
          Enviar escala por e-mail
        </button>
        <div className="text-xs text-gray-500">
          Os e-mails serão enviados para os endereços cadastrados na planilha{" "}
          <span className="font-semibold">"Cadastro_colaboradores"</span>, e o resumo
          completo da semana será enviado para <b>isagvm@gmail.com</b>.
        </div>
      </div>
    </div>
  );
}

// ======== COMISSÃO E PAGAMENTO ========
function CommissionTab() {
  const [dateRaw, setDateRaw] = useState<string>("");
  const [turno, setTurno] = useState<string>("Almoço");
  const [valor, setValor] = useState<string>("");
  const [faturamento, setFaturamento] = useState<string>("");

  const [startRaw, setStartRaw] = useState<string>("");
  const [endRaw, setEndRaw] = useState<string>("");

  const formatDateForPayload = (raw: string) => {
    if (!raw) return "";
    const [y, m, d] = raw.split("-");
    if (!y || !m || !d) return "";
    return `${d}/${m}/${y}`;
  };

  const handleSaveCommission = async () => {
    if (!dateRaw) {
      alert("Selecione a data.");
      return;
    }
    if (!valor) {
      alert("Informe o valor da comissão.");
      return;
    }
    if (!faturamento) {
      alert("Informe o faturamento.");
      return;
    }

    const dateStr = formatDateForPayload(dateRaw);
    if (!dateStr) {
      alert("Data inválida.");
      return;
    }

    if (!SYNC_ENDPOINT) {
      alert("Nenhum endpoint de sincronização configurado.");
      return;
    }

    const payload = {
      action: "comissao",
      date: dateStr,
      turno,
      valor,
      faturamento,
    };

    try {
      const resp = await fetch(SYNC_ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      });
      // @ts-ignore
      if ((resp as any)?.type === "opaque" || (resp as any)?.status === 0) {
        alert("Comissão registrada.");
        return;
      }
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        alert(`Falha ao registrar comissão (HTTP ${resp.status}). ${txt.slice(0, 180)}`);
        return;
      }
      alert("Comissão registrado.");
    } catch (err: any) {
      alert(`Não foi possível registrar a comissão. Erro: ${String(err)}`);
    }
  };

  const handlePaymentsReport = async () => {
    if (!startRaw || !endRaw) {
      alert("Selecione data inicial e final.");
      return;
    }
    const startStr = formatDateForPayload(startRaw);
    const endStr = formatDateForPayload(endRaw);
    if (!startStr || !endStr) {
      alert("Datas inválidas.");
      return;
    }

    if (!SYNC_ENDPOINT) {
      alert("Nenhum endpoint de sincronização configurado.");
      return;
    }

    const payload = {
      action: "payments_report",
      startDate: startStr,
      endDate: endStr,
    };

    try {
      const resp = await fetch(SYNC_ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      });
      // @ts-ignore
      if ((resp as any)?.type === "opaque" || (resp as any)?.status === 0) {
        alert("Relatórios de pagamentos gerados.");
        return;
      }
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        alert(
          `Falha ao gerar relatórios de pagamentos (HTTP ${resp.status}). ${txt.slice(
            0,
            180
          )}`
        );
        return;
      }
      alert("Relatórios de pagamentos gerados.");
    } catch (err: any) {
      alert(`Não foi possível gerar os relatórios. Erro: ${String(err)}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Seção Comissão do dia */}
      <div className="border rounded-xl p-4 bg-white space-y-4">
        <h3 className="font-semibold text-base">Comissão do dia</h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label className="text-sm text-gray-600">Data</label>
            <input
              type="date"
              className="input w-full"
              value={dateRaw}
              onChange={(e) => setDateRaw(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-600">Turno</label>
            <select
              className="input w-full"
              value={turno}
              onChange={(e) => setTurno(e.target.value)}
            >
              <option value="Almoço">Almoço</option>
              <option value="Noite">Noite</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-600">Valor da comissão (R$)</label>
            <input
              type="number"
              step="0.01"
              className="input w-full"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-600">Faturamento (R$)</label>
            <input
              type="number"
              step="0.01"
              className="input w-full"
              value={faturamento}
              onChange={(e) => setFaturamento(e.target.value)}
            />
          </div>
        </div>

        <button onClick={handleSaveCommission} className="btn btn-primary">
          Registrar comissão do dia
        </button>
      </div>

      {/* Seção Pagamentos */}
      <div className="border rounded-xl p-4 bg-white space-y-4">
        <h3 className="font-semibold text-base">Pagamentos</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-sm text-gray-600">Data inicial</label>
            <input
              type="date"
              className="input w-full"
              value={startRaw}
              onChange={(e) => setStartRaw(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-600">Data final</label>
            <input
              type="date"
              className="input w-full"
              value={endRaw}
              onChange={(e) => setEndRaw(e.target.value)}
            />
          </div>
        </div>

        <button onClick={handlePaymentsReport} className="btn btn-primary">
          Gerar relatórios de Pagamentos
        </button>
      </div>
    </div>
  );
}

// ======== ABA COMPRAS DE ESTOQUE ========
function StockTab() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [dateRaw, setDateRaw] = useState<string>("");
  const [selectedSector, setSelectedSector] = useState<string>("");

  useEffect(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    setDateRaw(todayIso);
    loadStock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadStock() {
    if (!SYNC_ENDPOINT) return;
    setLoading(true);
    try {
      const url = `${SYNC_ENDPOINT}?action=stock`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (data?.ok && Array.isArray(data.items)) {
        // Faz um mapeamento defensivo para aceitar "setor" ou "Setor" (e outros)
        const mapped: StockItem[] = (data.items as any[]).map((raw) => {
          const setorRaw =
            raw.setor ??
            raw.Setor ??
            raw.setor_nome ??
            raw["Setor "] ??
            "";

          return {
            item: raw.item ?? raw.Item ?? "",
            categoria: raw.categoria ?? raw.Categoria ?? "",
            armazenamento: raw.armazenamento ?? raw.Armazenamento ?? "",
            estoqueMin:
              raw.estoqueMin ??
              raw.estoque_min ??
              raw.EstoqueMin ??
              null,
            estoqueMax:
              raw.estoqueMax ??
              raw.estoque_max ??
              raw.EstoqueMax ??
              null,
            ondeComprar: raw.ondeComprar ?? raw.OndeComprar ?? "",
            observacao: raw.observacao ?? raw.Observacao ?? "",
            setor: setorRaw ? String(setorRaw).trim() : undefined,
          };
        });
        setItems(mapped);
      } else {
        console.error("Resposta inválida em /stock", data);
      }
    } catch (err) {
      console.error("Falha ao carregar estoque:", err);
    } finally {
      setLoading(false);
    }
  }

  const sectors = useMemo(() => {
    const s = new Set<string>();
    items.forEach((it) => {
      if (it.setor && String(it.setor).trim() !== "") {
        s.add(String(it.setor).trim());
      }
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [items]);

  const filteredItems = useMemo(() => {
    if (!selectedSector) return [];
    return items.filter(
      (it) => String(it.setor || "").trim() === selectedSector
    );
  }, [items, selectedSector]);

  const handleQtyChange = (itemName: string, value: string) => {
    setQuantities((prev) => ({ ...prev, [itemName]: value }));
  };

  const formatDateForPayload = (raw: string | Date) => {
    if (raw instanceof Date) {
      const y = raw.getFullYear();
      const m = String(raw.getMonth() + 1).padStart(2, "0");
      const d = String(raw.getDate()).padStart(2, "0");
      return `${d}/${m}/${y}`;
    }
    if (!raw) return "";
    const [y, m, d] = raw.split("-");
    if (!y || !m || !d) return "";
    return `${d}/${m}/${y}`;
  };

  const handleCreateList = async () => {
    if (!SYNC_ENDPOINT) {
      alert("Nenhum endpoint de sincronização configurado.");
      return;
    }

    if (!selectedSector) {
      alert("Selecione o setor antes de criar a lista de compras.");
      return;
    }

    if (!filteredItems.length) {
      alert("Não há itens de estoque para o setor selecionado.");
      return;
    }

    const dateStr = formatDateForPayload(dateRaw) || formatDateForPayload(new Date());

    const entries = filteredItems.map((it) => ({
      item: it.item,
      estoqueAtual: quantities[it.item] ?? "",
    }));

    const payload = {
      action: "estoque_lista",
      date: dateStr,
      setor: selectedSector,
      entries,
    };

    try {
      const resp = await fetch(SYNC_ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      });
      // @ts-ignore
      if ((resp as any)?.type === "opaque" || (resp as any)?.status === 0) {
        alert("Lista de compras gerada e enviada por e-mail.");
        return;
      }
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        alert(
          `Falha ao gerar lista de compras (HTTP ${resp.status}). ${txt.slice(0, 180)}`
        );
        return;
      }
      alert("Lista de compras gerada e enviada por e-mail.");
    } catch (err: any) {
      alert(`Não foi possível gerar a lista de compras. Erro: ${String(err)}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Data do registro + explicação */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <div className="sm:col-span-2 text-sm text-gray-600">
          Preencha o estoque atual dos itens do setor selecionado. Ao clicar em{" "}
          <b>"Criar lista de compras"</b>, o sistema irá calcular quanto comprar para
          atingir os estoques mínimo e máximo, salvar uma planilha em{" "}
          <b>"Registros de Estoque"</b> e enviar um PDF por e-mail apenas com os itens
          abaixo do mínimo.
        </div>
        <div className="space-y-1">
          <label className="text-sm text-gray-600">Data do registro</label>
          <input
            type="date"
            className="input w-full"
            value={dateRaw}
            onChange={(e) => setDateRaw(e.target.value)}
          />
        </div>
      </div>

      {/* Seleção de setor */}
      <div className="space-y-1">
        <label className="text-sm text-gray-600">Setor do inventário</label>
        <select
          className="input w-full sm:w-80"
          value={selectedSector}
          onChange={(e) => setSelectedSector(e.target.value)}
        >
          <option value="">
            {sectors.length ? "Selecione um setor" : "Nenhum setor encontrado na planilha"}
          </option>
          {sectors.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {selectedSector && (
          <div className="text-xs text-gray-500">
            Itens exibidos abaixo: setor <b>{selectedSector}</b>.
          </div>
        )}
      </div>

      {/* Tabela de itens */}
      <div className="border rounded-xl p-3 bg-white space-y-2">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm">Itens de estoque</h3>
          <button
            type="button"
            className="btn btn-ghost text-xs"
            onClick={loadStock}
          >
            Recarregar itens
          </button>
        </div>
        {loading && (
          <div className="text-xs text-gray-500">Carregando itens de estoque…</div>
        )}
        {!loading && !items.length && (
          <div className="text-xs text-red-600">
            Nenhum item encontrado em &quot;Cadastro_Estoque&quot;.
          </div>
        )}
        {!loading && items.length > 0 && !selectedSector && (
          <div className="text-xs text-amber-700">
            Selecione um setor para visualizar os itens do inventário.
          </div>
        )}
        {!loading && selectedSector && filteredItems.length === 0 && (
          <div className="text-xs text-red-600">
            Não há itens cadastrados para o setor <b>{selectedSector}</b>.
          </div>
        )}
        {!loading && selectedSector && filteredItems.length > 0 && (
          <div className="overflow-auto">
            <table className="min-w-full border text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border px-3 py-2 text-left">Item</th>
                  <th className="border px-3 py-2 text-left">Armazenamento</th>
                  <th className="border px-3 py-2 text-left">Estoque atual</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((it) => (
                  <tr key={it.item}>
                    <td className="border px-3 py-2">
                      <div className="font-medium">{it.item}</div>
                      {it.categoria && (
                        <div className="text-xs text-gray-500">
                          Categoria: {it.categoria}
                        </div>
                      )}
                    </td>
                    <td className="border px-3 py-2">
                      {it.armazenamento || (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="border px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        className="input w-24"
                        value={quantities[it.item] ?? ""}
                        onChange={(e) =>
                          handleQtyChange(it.item, e.target.value)
                        }
                        placeholder="0"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Botão principal */}
      <div className="pt-2">
        <button onClick={handleCreateList} className="btn btn-primary">
          Criar lista de compras
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
