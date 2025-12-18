// App.tsx (COMPLETO)
// Versão enxuta e estável com as 4 mudanças pedidas.
// Observação: se o seu App.tsx atual tiver outras abas/lógicas muito específicas, você pode substituir por este arquivo para “voltar a compilar” e depois a gente reintroduz o resto com segurança.

import React, { useEffect, useMemo, useState } from "react";

type DayCode = "qua" | "qui" | "sex" | "sab" | "dom_almoco" | "dom_noite";
type Turno = "Almoço" | "Noite";
type Setor = "Salão/Bar" | "Pizzaria/Cozinha";

type AvailabilityRow = { staff: string; days: string[] };
type StockItem = { item: string; categoria: string; armazenamento: string; estoqueMin: number | null; estoqueMax: number | null; ondeComprar: string; observacao: string; setor: string };

const NO_AVAIL = "__NONE__";

function pad2(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function formatDDMMYYYY(d: Date) { return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`; }

function mondayOfWeek(d: Date) {
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = dt.getDay(); // 0 dom
  const diff = (day + 6) % 7;
  dt.setDate(dt.getDate() - diff);
  dt.setHours(0, 0, 0, 0);
  return dt;
}
function weekIdFromDate(d: Date) {
  const m = mondayOfWeek(d);
  return `${pad2(m.getDate())}-${pad2(m.getMonth() + 1)}-${m.getFullYear()}`;
}

function getEndpoint() {
  return localStorage.getItem("fattoria_endpoint") || "";
}
function setEndpoint(v: string) {
  localStorage.setItem("fattoria_endpoint", v);
}

async function getJSON(url: string) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return await resp.json();
}

async function postNoCors(endpoint: string, payload: any) {
  const resp = await fetch(endpoint, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
  // Se vier opaque, consideramos ok (padrão do seu app original)
  // @ts-ignore
  if ((resp as any)?.type === "opaque" || (resp as any)?.status === 0) return { ok: true, opaque: true };
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  try { return await resp.json(); } catch { return { ok: true }; }
}

const DAY_LABEL: Record<DayCode, string> = {
  qua: "Quarta",
  qui: "Quinta",
  sex: "Sexta",
  sab: "Sábado",
  dom_almoco: "Domingo - almoço",
  dom_noite: "Domingo - noite",
};
const DAY_ORDER: DayCode[] = ["qua", "qui", "sex", "sab", "dom_almoco", "dom_noite"];

export default function App() {
  const [endpoint, _setEndpoint] = useState(getEndpoint());
  const [tab, setTab] = useState<"disponibilidade" | "escala" | "presenca" | "comissao" | "pagamentos" | "estoque">("disponibilidade");

  const [staffNames, setStaffNames] = useState<string[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);

  const [weekDate, setWeekDate] = useState(() => new Date());
  const weekId = useMemo(() => weekIdFromDate(weekDate), [weekDate]);

  // ===== Disponibilidade =====
  const [selectedStaff, setSelectedStaff] = useState("");
  const [availabilityLocal, setAvailabilityLocal] = useState<Record<string, string[]>>({});
  const [availabilityRows, setAvailabilityRows] = useState<AvailabilityRow[]>([]);
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [savingAvail, setSavingAvail] = useState(false);

  // ===== Escala =====
  const [generatedSchedule, setGeneratedSchedule] = useState<Record<DayCode, string[]>>({
    qua: [], qui: [], sex: [], sab: [], dom_almoco: [], dom_noite: [],
  });
  const [sendingSchedule, setSendingSchedule] = useState(false);
  const [generatingSchedule, setGeneratingSchedule] = useState(false);

  // ===== Presença =====
  const [punching, setPunching] = useState(false);
  const [punchDate, setPunchDate] = useState(() => new Date());
  const [punchTurno, setPunchTurno] = useState<Turno>("Noite");
  const [punchSetor, setPunchSetor] = useState<Setor>("Salão/Bar");

  const [idaModo, setIdaModo] = useState<"carona" | "onibus" | "uber" | "nada">("nada");
  const [idaCarona, setIdaCarona] = useState("");
  const [idaOnibusQtd, setIdaOnibusQtd] = useState("");
  const [idaUberValor, setIdaUberValor] = useState("");

  const [voltaModo, setVoltaModo] = useState<"carona" | "onibus" | "uber" | "nada">("nada");
  const [voltaCarona, setVoltaCarona] = useState("");
  const [voltaOnibusQtd, setVoltaOnibusQtd] = useState("");
  const [voltaUberValor, setVoltaUberValor] = useState("");

  const [products, setProducts] = useState<string[]>([]);
  const [consumoItems, setConsumoItems] = useState<{ product: string; quantity: string }[]>([{ product: "", quantity: "" }]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // ===== Comissão =====
  const [savingComissao, setSavingComissao] = useState(false);
  const [comDate, setComDate] = useState(() => new Date());
  const [comTurno, setComTurno] = useState<Turno>("Noite");
  const [comValor, setComValor] = useState("");
  const [comFat, setComFat] = useState("");

  // ===== Pagamentos =====
  const [generatingPayments, setGeneratingPayments] = useState(false);
  const [payStart, setPayStart] = useState("20/11/2025");
  const [payEnd, setPayEnd] = useState("30/11/2025");

  // ===== Estoque =====
  const [loadingStock, setLoadingStock] = useState(false);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [stockSetor, setStockSetor] = useState("");
  const [stockEntries, setStockEntries] = useState<Record<string, string>>({});
  const [creatingStockList, setCreatingStockList] = useState(false);

  const hasEndpoint = !!endpoint;

  useEffect(() => {
    setEndpoint(endpoint);
  }, [endpoint]);

  async function loadStaff() {
    if (!hasEndpoint) return;
    setLoadingStaff(true);
    try {
      const url = `${endpoint}?action=staff`;
      const data = await getJSON(url);
      setStaffNames(Array.isArray(data?.names) ? data.names : []);
    } catch (e: any) {
      alert(`Falha ao carregar colaboradores. Erro: ${String(e)}`);
    } finally {
      setLoadingStaff(false);
    }
  }

  async function loadAvailability() {
    if (!hasEndpoint) return;
    setLoadingAvail(true);
    try {
      const url = `${endpoint}?action=list&weekId=${encodeURIComponent(weekId)}`;
      const data = await getJSON(url);
      const rows: AvailabilityRow[] = Array.isArray(data?.rows) ? data.rows : [];
      setAvailabilityRows(rows);

      const map: Record<string, string[]> = {};
      rows.forEach(r => { map[r.staff] = r.days || []; });
      setAvailabilityLocal(map);
    } catch (e: any) {
      alert(`Falha ao carregar disponibilidade. Erro: ${String(e)}`);
    } finally {
      setLoadingAvail(false);
    }
  }

  async function loadProducts() {
    if (!hasEndpoint) return;
    setLoadingProducts(true);
    try {
      const url = `${endpoint}?action=products`;
      const data = await getJSON(url);
      setProducts(Array.isArray(data?.products) ? data.products : []);
    } catch (e: any) {
      alert(`Falha ao carregar produtos. Erro: ${String(e)}`);
    } finally {
      setLoadingProducts(false);
    }
  }

  async function loadStock() {
    if (!hasEndpoint) return;
    setLoadingStock(true);
    try {
      const url = `${endpoint}?action=stock`;
      const data = await getJSON(url);
      const items: StockItem[] = Array.isArray(data?.items) ? data.items : [];
      setStockItems(items);
      const initial: Record<string, string> = {};
      items.forEach(it => { initial[it.item] = ""; });
      setStockEntries(initial);
    } catch (e: any) {
      alert(`Falha ao carregar itens de estoque. Erro: ${String(e)}`);
    } finally {
      setLoadingStock(false);
    }
  }

  useEffect(() => { loadStaff(); }, [hasEndpoint]);
  useEffect(() => { loadAvailability(); }, [hasEndpoint, weekId]);
  useEffect(() => { if (tab === "presenca") loadProducts(); }, [tab, hasEndpoint]);
  useEffect(() => { if (tab === "estoque") loadStock(); }, [tab, hasEndpoint]);

  // ===== Disponibilidade: Sem disponibilidade =====
  const chosenRaw = availabilityLocal[selectedStaff] || [];
  const noAvail = chosenRaw.includes(NO_AVAIL);
  const chosen = chosenRaw.filter(x => x !== NO_AVAIL);

  function toggleDay(day: DayCode) {
    if (!selectedStaff) return;
    const curr = new Set(availabilityLocal[selectedStaff] || []);
    if (curr.has(NO_AVAIL)) curr.delete(NO_AVAIL);
    if (curr.has(day)) curr.delete(day); else curr.add(day);
    setAvailabilityLocal(prev => ({ ...prev, [selectedStaff]: Array.from(curr) }));
  }

  function toggleNoAvail() {
    if (!selectedStaff) return;
    setAvailabilityLocal(prev => {
      const curr = new Set(prev[selectedStaff] || []);
      if (curr.has(NO_AVAIL)) {
        curr.delete(NO_AVAIL);
        return { ...prev, [selectedStaff]: Array.from(curr) };
      } else {
        return { ...prev, [selectedStaff]: [NO_AVAIL] };
      }
    });
  }

  async function saveAvailability() {
    if (!hasEndpoint) { alert("Configure o endpoint primeiro."); return; }
    if (!selectedStaff) { alert("Selecione um colaborador."); return; }

    setSavingAvail(true);
    try {
      const raw = availabilityLocal[selectedStaff] || [];
      const daysToSend = raw.includes(NO_AVAIL) ? ["none"] : raw.filter(x => x !== NO_AVAIL);

      await postNoCors(endpoint, {
        action: "upsert",
        weekId,
        staff: selectedStaff,
        days: daysToSend,
        ts: new Date().toISOString(),
      });

      alert("Disponibilidade salva.");
      await loadAvailability();
    } catch (e: any) {
      alert(`Falha ao salvar disponibilidade. Erro: ${String(e)}`);
    } finally {
      setSavingAvail(false);
    }
  }

  // ===== Escala: gerador simples (prioriza quem marcou disponibilidade) =====
  function generateScheduleSimple() {
    // Regra simples: para cada dia, pega até 2 nomes disponíveis (ou 0)
    const map = availabilityLocal;
    const dayToAvailNames: Record<DayCode, string[]> = { qua: [], qui: [], sex: [], sab: [], dom_almoco: [], dom_noite: [] };

    staffNames.forEach(name => {
      const days = map[name] || [];
      if (days.includes(NO_AVAIL)) return;
      (days as any[]).forEach((d) => {
        if (DAY_ORDER.includes(d as any)) dayToAvailNames[d as DayCode].push(name);
      });
    });

    const out: Record<DayCode, string[]> = { qua: [], qui: [], sex: [], sab: [], dom_almoco: [], dom_noite: [] };
    DAY_ORDER.forEach(d => {
      const pool = dayToAvailNames[d].slice();
      pool.sort((a, b) => a.localeCompare(b));
      out[d] = pool.slice(0, 2);
    });
    setGeneratedSchedule(out);
  }

  async function onGenerateSchedule() {
    setGeneratingSchedule(true);
    try {
      generateScheduleSimple();
      alert("Escala gerada.");
    } finally {
      setGeneratingSchedule(false);
    }
  }

  async function sendScheduleEmail() {
    if (!hasEndpoint) { alert("Configure o endpoint primeiro."); return; }
    setSendingSchedule(true);
    try {
      await postNoCors(endpoint, { action: "send_schedule", weekId, schedule: generatedSchedule });
      alert("Escala enviada por e-mail.");
    } catch (e: any) {
      alert(`Falha ao enviar escala. Erro: ${String(e)}`);
    } finally {
      setSendingSchedule(false);
    }
  }

  // ===== Presença: check duplicado + post =====
  async function registerPresence() {
    if (!hasEndpoint) { alert("Configure o endpoint primeiro."); return; }
    if (!selectedStaff) { alert("Selecione um colaborador."); return; }

    setPunching(true);
    try {
      const dateStr = formatDDMMYYYY(punchDate);

      // Checa duplicado via GET
      const checkUrl =
        `${endpoint}?action=ponto_check&date=${encodeURIComponent(dateStr)}` +
        `&turno=${encodeURIComponent(punchTurno)}&staff=${encodeURIComponent(selectedStaff)}`;
      const check = await getJSON(checkUrl);
      if (check?.exists) {
        alert(check?.message || `A presença de ${selectedStaff} já registrada para esse dia e turno`);
        return;
      }

      const consumoLimpo = consumoItems
        .filter(c => c.product && c.quantity)
        .map(c => ({ product: c.product, quantity: c.quantity }));

      await postNoCors(endpoint, {
        action: "ponto",
        date: dateStr,
        staff: selectedStaff,
        timestamp: new Date().toISOString(),
        turno: punchTurno,
        setor: punchSetor,
        transporte: {
          ida: {
            modo: idaModo === "nada" ? "" : idaModo,
            caronaCom: idaModo === "carona" ? idaCarona : "",
            onibusQtd: idaModo === "onibus" ? idaOnibusQtd : "",
            uberValor: idaModo === "uber" ? idaUberValor : "",
          },
          volta: {
            modo: voltaModo === "nada" ? "" : voltaModo,
            caronaCom: voltaModo === "carona" ? voltaCarona : "",
            onibusQtd: voltaModo === "onibus" ? voltaOnibusQtd : "",
            uberValor: voltaModo === "uber" ? voltaUberValor : "",
          },
        },
        consumo: consumoLimpo,
      });

      alert("Presença registrada.");
    } catch (e: any) {
      alert(`Falha ao registrar presença. Erro: ${String(e)}`);
    } finally {
      setPunching(false);
    }
  }

  // ===== Comissão =====
  async function saveComissao() {
    if (!hasEndpoint) { alert("Configure o endpoint primeiro."); return; }
    setSavingComissao(true);
    try {
      await postNoCors(endpoint, {
        action: "comissao",
        date: formatDDMMYYYY(comDate),
        turno: comTurno,
        valor: comValor,
        faturamento: comFat,
      });
      alert("Comissão salva.");
    } catch (e: any) {
      alert(`Falha ao salvar comissão. Erro: ${String(e)}`);
    } finally {
      setSavingComissao(false);
    }
  }

  // ===== Pagamentos =====
  async function generatePayments() {
    if (!hasEndpoint) { alert("Configure o endpoint primeiro."); return; }
    setGeneratingPayments(true);
    try {
      await postNoCors(endpoint, { action: "payments_report", startDate: payStart, endDate: payEnd });
      alert("Relatórios de pagamentos gerados.");
    } catch (e: any) {
      alert(`Falha ao gerar relatórios. Erro: ${String(e)}`);
    } finally {
      setGeneratingPayments(false);
    }
  }

  // ===== Estoque =====
  async function createStockList() {
    if (!hasEndpoint) { alert("Configure o endpoint primeiro."); return; }
    setCreatingStockList(true);
    try {
      const entries = Object.keys(stockEntries).map(item => ({ item, estoqueAtual: stockEntries[item] }));
      await postNoCors(endpoint, {
        action: "estoque_lista",
        date: formatDDMMYYYY(new Date()),
        setor: stockSetor,
        entries,
      });
      alert("Lista de compras criada e enviada.");
    } catch (e: any) {
      alert(`Falha ao criar lista de compras. Erro: ${String(e)}`);
    } finally {
      setCreatingStockList(false);
    }
  }

  function Button(props: { onClick: () => void; disabled?: boolean; loading?: boolean; children: React.ReactNode }) {
    return (
      <button
        onClick={props.onClick}
        disabled={props.disabled || props.loading}
        style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ccc", background: "#fff", cursor: "pointer" }}
      >
        {props.loading ? "Processando..." : props.children}
      </button>
    );
  }

  return (
    <div style={{ fontFamily: "system-ui, Arial", padding: 16, maxWidth: 1000, margin: "0 auto" }}>
      <h2 style={{ margin: 0 }}>App Fattoria</h2>

      <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <label>Endpoint:</label>
        <input
          value={endpoint}
          onChange={(e) => _setEndpoint(e.target.value)}
          placeholder="Cole aqui a URL do Web App"
          style={{ width: 520, padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
        />
        <Button onClick={loadStaff} loading={loadingStaff} disabled={!hasEndpoint}>Recarregar colaboradores</Button>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button onClick={() => setTab("disponibilidade")}>Disponibilidade</Button>
        <Button onClick={() => setTab("escala")}>Escala</Button>
        <Button onClick={() => setTab("presenca")}>Presença</Button>
        <Button onClick={() => setTab("comissao")}>Comissão</Button>
        <Button onClick={() => setTab("pagamentos")}>Pagamentos</Button>
        <Button onClick={() => setTab("estoque")}>Estoque</Button>
      </div>

      <hr style={{ margin: "16px 0" }} />

      {/* ===== Disponibilidade ===== */}
      {tab === "disponibilidade" && (
        <div>
          <h3 style={{ marginTop: 0 }}>Disponibilidade</h3>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div>Semana (weekId): <b>{weekId}</b></div>
              <input
                type="date"
                value={`${weekDate.getFullYear()}-${pad2(weekDate.getMonth() + 1)}-${pad2(weekDate.getDate())}`}
                onChange={(e) => setWeekDate(new Date(e.target.value + "T00:00:00"))}
                style={{ padding: 8, borderRadius: 8, border: "1px solid #ccc", marginTop: 6 }}
              />
            </div>

            <div>
              <div>Colaborador</div>
              <select value={selectedStaff} onChange={(e) => setSelectedStaff(e.target.value)} style={{ padding: 8, borderRadius: 8, border: "1px solid #ccc", minWidth: 260 }}>
                <option value="">Selecione…</option>
                {staffNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            <Button onClick={loadAvailability} loading={loadingAvail} disabled={!hasEndpoint}>Atualizar respostas</Button>
            <Button onClick={saveAvailability} loading={savingAvail} disabled={!hasEndpoint || !selectedStaff}>Salvar minhas escolhas</Button>
          </div>

          {selectedStaff && (
            <div style={{ marginTop: 12, padding: 12, border: "1px solid #ddd", borderRadius: 12 }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={noAvail} onChange={toggleNoAvail} />
                <span>Sem disponibilidade essa semana</span>
              </label>

              <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(2, minmax(220px, 1fr))", gap: 8 }}>
                {DAY_ORDER.map((d) => (
                  <label key={d} style={{ display: "flex", gap: 8, alignItems: "center", padding: 8, borderRadius: 10, border: "1px solid #eee" }}>
                    <input type="checkbox" checked={chosen.includes(d)} disabled={noAvail} onChange={() => toggleDay(d)} />
                    <span>{DAY_LABEL[d]}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <h4>Respostas na semana</h4>
            <div style={{ fontSize: 13 }}>
              {availabilityRows.length === 0 ? "Sem respostas." : availabilityRows.map((r) => (
                <div key={r.staff}>• {r.staff}: {r.days?.length ? r.days.join(", ") : "—"}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== Escala ===== */}
      {tab === "escala" && (
        <div>
          <h3 style={{ marginTop: 0 }}>Escala</h3>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div>Semana: <b>{weekId}</b></div>
            <Button onClick={onGenerateSchedule} loading={generatingSchedule} disabled={!hasEndpoint}>Gerar escala</Button>
            <Button onClick={sendScheduleEmail} loading={sendingSchedule} disabled={!hasEndpoint}>Enviar escala por e-mail</Button>
          </div>

          <div style={{ marginTop: 12 }}>
            {DAY_ORDER.map(d => (
              <div key={d} style={{ padding: 10, border: "1px solid #eee", borderRadius: 12, marginBottom: 8 }}>
                <b>{DAY_LABEL[d]}</b>
                <div style={{ marginTop: 6 }}>{generatedSchedule[d].length ? generatedSchedule[d].join(", ") : "—"}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== Presença ===== */}
      {tab === "presenca" && (
        <div>
          <h3 style={{ marginTop: 0 }}>Registro de presença</h3>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <div>Colaborador</div>
              <select value={selectedStaff} onChange={(e) => setSelectedStaff(e.target.value)} style={{ padding: 8, borderRadius: 8, border: "1px solid #ccc", minWidth: 260 }}>
                <option value="">Selecione…</option>
                {staffNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            <div>
              <div>Data</div>
              <input
                type="date"
                value={`${punchDate.getFullYear()}-${pad2(punchDate.getMonth() + 1)}-${pad2(punchDate.getDate())}`}
                onChange={(e) => setPunchDate(new Date(e.target.value + "T00:00:00"))}
                style={{ padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
              />
            </div>

            <div>
              <div>Turno</div>
              <select value={punchTurno} onChange={(e) => setPunchTurno(e.target.value as Turno)} style={{ padding: 8, borderRadius: 8, border: "1px solid #ccc" }}>
                <option value="Almoço">Almoço</option>
                <option value="Noite">Noite</option>
              </select>
            </div>

            <div>
              <div>Setor</div>
              <select value={punchSetor} onChange={(e) => setPunchSetor(e.target.value as Setor)} style={{ padding: 8, borderRadius: 8, border: "1px solid #ccc" }}>
                <option value="Salão/Bar">Salão/Bar</option>
                <option value="Pizzaria/Cozinha">Pizzaria/Cozinha</option>
              </select>
            </div>

            <Button onClick={registerPresence} loading={punching} disabled={!hasEndpoint || !selectedStaff}>Registrar presença</Button>
          </div>

          <div style={{ marginTop: 14, padding: 12, border: "1px solid #eee", borderRadius: 12 }}>
            <h4 style={{ marginTop: 0 }}>Transporte</h4>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(280px, 1fr))", gap: 12 }}>
              <div>
                <b>Ida</b>
                <div style={{ marginTop: 6 }}>
                  <select value={idaModo} onChange={(e) => setIdaModo(e.target.value as any)} style={{ padding: 8, borderRadius: 8, border: "1px solid #ccc", width: "100%" }}>
                    <option value="nada">—</option>
                    <option value="carona">Carona</option>
                    <option value="onibus">Ônibus</option>
                    <option value="uber">Uber</option>
                  </select>
                </div>
                {idaModo === "carona" && <input value={idaCarona} onChange={(e) => setIdaCarona(e.target.value)} placeholder="Carona com…" style={{ marginTop: 6, padding: 8, borderRadius: 8, border: "1px solid #ccc", width: "100%" }} />}
                {idaModo === "onibus" && <input value={idaOnibusQtd} onChange={(e) => setIdaOnibusQtd(e.target.value)} placeholder="Qtd passagens" style={{ marginTop: 6, padding: 8, borderRadius: 8, border: "1px solid #ccc", width: "100%" }} />}
                {idaModo === "uber" && <input value={idaUberValor} onChange={(e) => setIdaUberValor(e.target.value)} placeholder="Valor (R$)" style={{ marginTop: 6, padding: 8, borderRadius: 8, border: "1px solid #ccc", width: "100%" }} />}
              </div>

              <div>
                <b>Volta</b>
                <div style={{ marginTop: 6 }}>
                  <select value={voltaModo} onChange={(e) => setVoltaModo(e.target.value as any)} style={{ padding: 8, borderRadius: 8, border: "1px solid #ccc", width: "100%" }}>
                    <option value="nada">—</option>
                    <option value="carona">Carona</option>
                    <option value="onibus">Ônibus</option>
                    <option value="uber">Uber</option>
                  </select>
                </div>
                {voltaModo === "carona" && <input value={voltaCarona} onChange={(e) => setVoltaCarona(e.target.value)} placeholder="Carona com…" style={{ marginTop: 6, padding: 8, borderRadius: 8, border: "1px solid #ccc", width: "100%" }} />}
                {voltaModo === "onibus" && <input value={voltaOnibusQtd} onChange={(e) => setVoltaOnibusQtd(e.target.value)} placeholder="Qtd passagens" style={{ marginTop: 6, padding: 8, borderRadius: 8, border: "1px solid #ccc", width: "100%" }} />}
                {voltaModo === "uber" && <input value={voltaUberValor} onChange={(e) => setVoltaUberValor(e.target.value)} placeholder="Valor (R$)" style={{ marginTop: 6, padding: 8, borderRadius: 8, border: "1px solid #ccc", width: "100%" }} />}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 14, padding: 12, border: "1px solid #eee", borderRadius: 12 }}>
            <h4 style={{ marginTop: 0 }}>Consumo</h4>
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              {loadingProducts ? "Carregando produtos…" : (products.length ? "" : "Sem lista de produtos carregada.")}
            </div>

            {consumoItems.map((c, idx) => (
              <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <select value={c.product} onChange={(e) => {
                  const v = e.target.value;
                  setConsumoItems(prev => prev.map((x, i) => i === idx ? { ...x, product: v } : x));
                }} style={{ padding: 8, borderRadius: 8, border: "1px solid #ccc", minWidth: 240 }}>
                  <option value="">Produto…</option>
                  {products.map(p => <option key={p} value={p}>{p}</option>)}
                </select>

                <input value={c.quantity} onChange={(e) => {
                  const v = e.target.value;
                  setConsumoItems(prev => prev.map((x, i) => i === idx ? { ...x, quantity: v } : x));
                }} placeholder="Qtd" style={{ padding: 8, borderRadius: 8, border: "1px solid #ccc", width: 120 }} />

                <button
                  onClick={() => setConsumoItems(prev => prev.filter((_, i) => i !== idx))}
                  style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ccc", background: "#fff" }}
                >
                  Remover
                </button>
              </div>
            ))}

            <button
              onClick={() => setConsumoItems(prev => [...prev, { product: "", quantity: "" }])}
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ccc", background: "#fff" }}
            >
              Adicionar item
            </button>
          </div>
        </div>
      )}

      {/* ===== Comissão ===== */}
      {tab === "comissao" && (
        <div>
          <h3 style={{ marginTop: 0 }}>Comissão</h3>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <div>Data</div>
              <input
                type="date"
                value={`${comDate.getFullYear()}-${pad2(comDate.getMonth() + 1)}-${pad2(comDate.getDate())}`}
                onChange={(e) => setComDate(new Date(e.target.value + "T00:00:00"))}
                style={{ padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
              />
            </div>
            <div>
              <div>Turno</div>
              <select value={comTurno} onChange={(e) => setComTurno(e.target.value as Turno)} style={{ padding: 8, borderRadius: 8, border: "1px solid #ccc" }}>
                <option value="Almoço">Almoço</option>
                <option value="Noite">Noite</option>
              </select>
            </div>
            <div>
              <div>Comissão (R$)</div>
              <input value={comValor} onChange={(e) => setComValor(e.target.value)} style={{ padding: 8, borderRadius: 8, border: "1px solid #ccc" }} />
            </div>
            <div>
              <div>Faturamento (R$)</div>
              <input value={comFat} onChange={(e) => setComFat(e.target.value)} style={{ padding: 8, borderRadius: 8, border: "1px solid #ccc" }} />
            </div>
            <Button onClick={saveComissao} loading={savingComissao} disabled={!hasEndpoint}>Registrar comissão do dia</Button>
          </div>
        </div>
      )}

      {/* ===== Pagamentos ===== */}
      {tab === "pagamentos" && (
        <div>
          <h3 style={{ marginTop: 0 }}>Pagamentos</h3>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <div>Início (DD/MM/AAAA)</div>
              <input value={payStart} onChange={(e) => setPayStart(e.target.value)} style={{ padding: 8, borderRadius: 8, border: "1px solid #ccc" }} />
            </div>
            <div>
              <div>Fim (DD/MM/AAAA)</div>
              <input value={payEnd} onChange={(e) => setPayEnd(e.target.value)} style={{ padding: 8, borderRadius: 8, border: "1px solid #ccc" }} />
            </div>
            <Button onClick={generatePayments} loading={generatingPayments} disabled={!hasEndpoint}>Gerar relatórios</Button>
          </div>
        </div>
      )}

      {/* ===== Estoque ===== */}
      {tab === "estoque" && (
        <div>
          <h3 style={{ marginTop: 0 }}>Estoque</h3>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div>Filtrar por setor (opcional)</div>
              <input value={stockSetor} onChange={(e) => setStockSetor(e.target.value)} placeholder="Ex.: Salão/Bar" style={{ padding: 8, borderRadius: 8, border: "1px solid #ccc", minWidth: 240 }} />
            </div>
            <Button onClick={loadStock} loading={loadingStock} disabled={!hasEndpoint}>Recarregar itens</Button>
            <Button onClick={createStockList} loading={creatingStockList} disabled={!hasEndpoint}>Criar lista de compras</Button>
          </div>

          <div style={{ marginTop: 12 }}>
            {(stockItems.length === 0) ? "Sem itens." : stockItems
              .filter(it => !stockSetor || String(it.setor || "").trim() === stockSetor.trim())
              .map(it => (
                <div key={it.item} style={{ padding: 10, border: "1px solid #eee", borderRadius: 12, marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div><b>{it.item}</b> <span style={{ color: "#666" }}>({it.setor || "—"})</span></div>
                    <div style={{ color: "#666" }}>Min: {it.estoqueMin ?? "—"} | Max: {it.estoqueMax ?? "—"} | Onde: {it.ondeComprar || "—"}</div>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <input
                      value={stockEntries[it.item] || ""}
                      onChange={(e) => setStockEntries(prev => ({ ...prev, [it.item]: e.target.value }))}
                      placeholder="Estoque atual"
                      style={{ padding: 8, borderRadius: 8, border: "1px solid #ccc", width: 160 }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
