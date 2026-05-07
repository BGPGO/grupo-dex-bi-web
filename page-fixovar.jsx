/* PageFixoVar — Análise Custo Fixo × Variável + Break-even
 *
 * Decompõe despesa em:
 *   VARIÁVEL: escala com receita (CMV, royalties, taxa de cartão, frete sobre venda)
 *   FIXO: independe do volume (aluguel, salários, energia, etc)
 *   IMPOSTO: tributos federais/estaduais sobre vendas
 *
 * Calcula:
 *   Margem de Contribuição = 1 - (variável + imposto) / receita
 *   Break-even Revenue    = custo_fixo / margem_contribuição
 *   Diagnóstico de maturidade: quanto a loja precisa crescer para ser sustentável
 *
 * Exclui mês corrente (em curso) pra não enviesar.
 */

const _classFixoVar = (catName) => {
  const u = (catName || "").toUpperCase();
  // === Variável (escala com vendas) ===
  if (/^COMPRAS|MERCADORIA|CMV|MAT[ÉE]RIA.PRIMA|INSUMO|FOOD.COST/.test(u)) return "variavel";
  if (/ROYALT/.test(u)) return "variavel";
  if (/REPASS/.test(u)) return "variavel";
  if (/^FRETE\b|SERVI[ÇC]OS DE ENTREGA|DELIVERY/.test(u)) return "variavel";
  if (/^COMISS/.test(u)) return "variavel";
  if (/DEVOLU/.test(u)) return "variavel";
  if (/ALUGUEL.*VARI/.test(u)) return "variavel";
  if (/FUNDO.DE.PROMO/.test(u)) return "variavel";
  if (/TAXAS? DE CART|MARKETPLACE|IFOOD/.test(u)) return "variavel";
  // === Imposto sobre vendas ===
  if (/\b(ICMS|ISS|COFINS|PIS|TRIBUT|IOF|IRPJ|CSLL)\b/.test(u)) return "imposto";
  if (/SIMPLES NACIONAL|\bDAS\b/.test(u)) return "imposto";
  // === Outros — fora da operação ===
  if (/^<.*>|DISPON[ÍI]VEL/.test(u)) return "outros";
  if (/TRANSFER[ÊE]NCIA/.test(u)) return "outros";
  if (/EMPR[ÉE]STIM|APLICA[ÇC][ÃA]O FINANC|DISTRIBUI[ÇC][ÃA]O|APORTE|INTEGRALIZA|NOVAS OPERA/.test(u)) return "outros";
  if (/^JUROS\b|ENCARGOS FINAN/.test(u)) return "outros";
  // === Default: fixo (operacional) ===
  return "fixo";
};

const PageFixoVar = ({ statusFilter, drilldown, setDrilldown, year, month }) => {
  const REF_YEAR = window.REF_YEAR || new Date().getFullYear();
  const ALL_TX = window.ALL_TX || [];
  const B = window.BIT || {};
  const CONTAS = B.CONTAS || [];

  const _hoje = new Date();
  const _mesCorrente = `${_hoje.getFullYear()}-${String(_hoje.getMonth()+1).padStart(2,"0")}`;

  // ===== Decompõe por loja =====
  const lojas = useMemo(() => {
    return CONTAS.map(c => {
      let receita = 0, variavel = 0, fixo = 0, imposto = 0, outros = 0;
      const meses = new Set();
      // Decomposição mensal pra calcular σ do fixo
      const fixByMes = new Map();
      const recByMes = new Map();
      const varByMes = new Map();
      const impByMes = new Map();
      for (const r of ALL_TX) {
        if (r[6] !== 1 || r[9] !== c.slug) continue;
        const m = r[1];
        if (!m || m >= _mesCorrente) continue;  // exclui mês corrente
        meses.add(m);
        if (r[0] === "r") {
          receita += r[5];
          recByMes.set(m, (recByMes.get(m)||0) + r[5]);
        } else {
          const cl = _classFixoVar(r[3]);
          if (cl === "variavel") { variavel += r[5]; varByMes.set(m, (varByMes.get(m)||0) + r[5]); }
          else if (cl === "imposto") { imposto += r[5]; impByMes.set(m, (impByMes.get(m)||0) + r[5]); }
          else if (cl === "outros") { outros += r[5]; }
          else { fixo += r[5]; fixByMes.set(m, (fixByMes.get(m)||0) + r[5]); }
        }
      }
      const nMeses = meses.size || 1;
      const recMean = receita / nMeses;
      const varMean = variavel / nMeses;
      const fixMean = fixo / nMeses;
      const impMean = imposto / nMeses;
      const liqMean = recMean - varMean - fixMean - impMean;
      // Pcts de receita
      const pVar = receita > 0 ? (variavel / receita) * 100 : 0;
      const pImp = receita > 0 ? (imposto / receita) * 100 : 0;
      const pFix = receita > 0 ? (fixo / receita) * 100 : 0;
      // Margem de contribuição: receita - var - imposto = sobra que cobre fixo
      const mcPct = 100 - pVar - pImp;  // % da receita
      const mcVal = recMean * (mcPct / 100);
      // Break-even: receita necessária pra mc cobrir fixo
      const breakEven = mcPct > 0 ? fixMean / (mcPct/100) : Infinity;
      const gapBE = breakEven - recMean; // quanto falta crescer
      const gapBEPct = recMean > 0 ? (breakEven / recMean - 1) * 100 : Infinity;
      // Diagnóstico
      let diagnostic = "OK";
      let diagColor = "var(--green)";
      if (mcPct <= 0) {
        diagnostic = "Inviável — margem de contribuição negativa (cada R$ vendido aumenta o prejuízo)";
        diagColor = "var(--red)";
      }
      else if (gapBE <= 0) { diagnostic = `Acima do break-even (${(-gapBEPct).toFixed(0)}% folga)`; diagColor = "var(--green)"; }
      else if (gapBEPct < 30) { diagnostic = `Precisa crescer ${gapBEPct.toFixed(0)}% pra fechar conta`; diagColor = "var(--amber)"; }
      else if (gapBEPct < 100) { diagnostic = `Falta ${gapBEPct.toFixed(0)}% — turnaround viável`; diagColor = "var(--amber)"; }
      else { diagnostic = `Falta ${gapBEPct.toFixed(0)}% — gap muito grande pra crescimento orgânico`; diagColor = "var(--red)"; }
      return {
        slug: c.slug, label: c.label,
        setor: window.inferSetor ? window.inferSetor(c.label) : "—",
        nMeses, receita, variavel, fixo, imposto, outros,
        recMean, varMean, fixMean, impMean, liqMean,
        pVar, pImp, pFix, mcPct, mcVal,
        breakEven, gapBE, gapBEPct, diagnostic, diagColor,
      };
    }).filter(l => l.receita > 0 || l.fixo > 0);
  }, [CONTAS, ALL_TX]);

  // ===== Agregado por setor + grupo =====
  const setorAgg = useMemo(() => {
    const setores = ["Food Delivery", "Aeroporto Premium", "Óptica"];
    const out = {};
    for (const sec of setores) {
      const ls = lojas.filter(l => l.setor === sec);
      if (!ls.length) continue;
      const receita = ls.reduce((s,l) => s + l.receita, 0);
      const variavel = ls.reduce((s,l) => s + l.variavel, 0);
      const fixo = ls.reduce((s,l) => s + l.fixo, 0);
      const imposto = ls.reduce((s,l) => s + l.imposto, 0);
      const liq = receita - variavel - fixo - imposto;
      const nMeses = Math.max(...ls.map(l => l.nMeses));
      const recMean = receita / nMeses;
      const fixMean = fixo / nMeses;
      const pVar = receita > 0 ? (variavel/receita)*100 : 0;
      const pImp = receita > 0 ? (imposto/receita)*100 : 0;
      const mcPct = 100 - pVar - pImp;
      const breakEven = mcPct > 0 ? fixMean / (mcPct/100) : Infinity;
      out[sec] = {
        sec, lojas: ls.length, receita, variavel, fixo, imposto, liq,
        recMean, fixMean, pVar, pImp, mcPct, breakEven,
        gapBEPct: recMean > 0 ? (breakEven/recMean - 1) * 100 : Infinity,
      };
    }
    // Grupo total
    const gReceita = lojas.reduce((s,l) => s + l.receita, 0);
    const gVar = lojas.reduce((s,l) => s + l.variavel, 0);
    const gFix = lojas.reduce((s,l) => s + l.fixo, 0);
    const gImp = lojas.reduce((s,l) => s + l.imposto, 0);
    const gLiq = gReceita - gVar - gFix - gImp;
    const gNMeses = Math.max(1, ...lojas.map(l => l.nMeses));
    const gRecMean = gReceita / gNMeses;
    const gFixMean = gFix / gNMeses;
    const gpVar = gReceita > 0 ? (gVar/gReceita)*100 : 0;
    const gpImp = gReceita > 0 ? (gImp/gReceita)*100 : 0;
    const gMc = 100 - gpVar - gpImp;
    return {
      bySetor: out,
      grupo: {
        receita: gReceita, variavel: gVar, fixo: gFix, imposto: gImp, liq: gLiq,
        recMean: gRecMean, fixMean: gFixMean, pVar: gpVar, pImp: gpImp, mcPct: gMc,
        breakEven: gMc > 0 ? gFixMean / (gMc/100) : Infinity,
        gapBEPct: gRecMean > 0 ? (gMc > 0 ? gFixMean/(gMc/100)/gRecMean - 1 : Infinity) * 100 : Infinity,
      },
    };
  }, [lojas]);

  const fmtCompactN = (n) => window.fmtCompact ? window.fmtCompact(n) : "R$ " + Math.round(n);
  const fmtPctNum = (n) => Number.isFinite(n) ? n.toFixed(1).replace(".",",") + "%" : "∞";

  // === Estado: taxa de crescimento mensal ajustável ===
  const [growthPct, setGrowthPct] = useState(5);

  // Tempo até atingir BE: log(BE/atual) / log(1+g)
  const tempoBE = (l, gPct) => {
    if (!Number.isFinite(l.breakEven)) return { meses: null, status: "inviavel" };
    if (l.recMean <= 0) return { meses: null, status: "sem-receita" };
    if (l.recMean >= l.breakEven) return { meses: 0, status: "ja-cobre" };
    if (gPct <= 0) return { meses: null, status: "sem-crescimento" };
    const m = Math.log(l.breakEven / l.recMean) / Math.log(1 + gPct/100);
    return { meses: m, status: m < 12 ? "rapido" : m < 36 ? "viavel" : "longo" };
  };

  const STATUS_INFO = {
    inviavel:        { lbl: "Inviável c/ estrutura atual",  c: "var(--red)" },
    "sem-receita":   { lbl: "Sem receita",                  c: "var(--fg-3)" },
    "ja-cobre":      { lbl: "Já cobre custo fixo",          c: "var(--green)" },
    "sem-crescimento": { lbl: "Sem crescimento → não chega", c: "var(--red)" },
    rapido:          { lbl: "Atinge em < 12 meses",         c: "var(--green)" },
    viavel:          { lbl: "Atinge em 12-36 meses",        c: "var(--amber)" },
    longo:           { lbl: "Mais de 3 anos (improvável)",  c: "var(--red)" },
  };

  // === Linha do tempo de break-even (gráfico de barras horizontais) ===
  const Timeline = ({ data, gPct, height = 600 }) => {
    if (!data || !data.length) return null;
    const W = 880;
    const rowH = 24;
    const ml = 220, mr = 60, mt = 30;
    const enriched = data.map(l => ({ ...l, ...tempoBE(l, gPct) }));
    enriched.sort((a,b) => {
      if (a.meses === 0 && b.meses !== 0) return -1;
      if (b.meses === 0 && a.meses !== 0) return 1;
      if (a.meses == null && b.meses == null) return 0;
      if (a.meses == null) return 1;
      if (b.meses == null) return -1;
      return a.meses - b.meses;
    });
    const maxMeses = 36;
    const cw = W - ml - mr;
    const x = (m) => ml + Math.min(maxMeses, Math.max(0, m)) / maxMeses * cw;
    const totalH = mt + enriched.length * rowH + 30;
    return (
      <svg viewBox={`0 0 ${W} ${totalH}`} style={{ display: "block", width: "100%", height: "auto", maxWidth: W }}>
        {/* Eixo X: meses */}
        {[0, 6, 12, 18, 24, 30, 36].map(m => (
          <g key={m}>
            <line x1={x(m)} y1={mt-8} x2={x(m)} y2={totalH-20} stroke="var(--border)" strokeDasharray="3,3" />
            <text x={x(m)} y={mt-12} textAnchor="middle" fontSize="10" fill="var(--fg-3)">{m}m</text>
          </g>
        ))}
        {/* Linhas verdes referência: 12 e 36 meses */}
        <line x1={x(12)} y1={mt-8} x2={x(12)} y2={totalH-20} stroke="var(--green)" strokeWidth={1.5} strokeDasharray="4,3" />
        <text x={x(12)} y={totalH-6} textAnchor="middle" fontSize="9" fill="var(--green)">1 ano</text>
        <line x1={x(36)} y1={mt-8} x2={x(36)} y2={totalH-20} stroke="var(--amber)" strokeWidth={1.5} strokeDasharray="4,3" />
        <text x={x(36)} y={totalH-6} textAnchor="middle" fontSize="9" fill="var(--amber)">3 anos</text>
        {/* Barras */}
        {enriched.map((l,i) => {
          const yRow = mt + i * rowH;
          const info = STATUS_INFO[l.status];
          let barEnd = ml;
          if (l.meses === 0) barEnd = ml + 6;
          else if (l.meses != null) barEnd = x(l.meses);
          else barEnd = x(maxMeses); // inviável → barra vermelha cobre tudo
          const barColor = info.c;
          return (
            <g key={l.slug} onClick={() => setDrilldown && setDrilldown({type:'conta',value:l.slug,label:l.label})} style={{cursor: setDrilldown?"pointer":"default"}}>
              <text x={ml-8} y={yRow + rowH/2 + 4} textAnchor="end" fontSize="11" fill="var(--fg-2)">{l.label.length > 32 ? l.label.slice(0,30)+"…" : l.label}</text>
              <rect x={ml} y={yRow+5} width={barEnd - ml} height={rowH-10}
                fill={barColor} opacity={l.meses != null ? 0.75 : 0.25}
                stroke={barColor} strokeWidth={1}
                strokeDasharray={l.meses == null ? "4,3" : ""} rx={3} />
              {l.meses != null && (
                <text x={barEnd + 6} y={yRow + rowH/2 + 4} fontSize="11" fill={barColor} fontWeight="600">
                  {l.meses === 0 ? "✓ já cobre" : `${l.meses.toFixed(1)} meses`}
                </text>
              )}
              {l.meses == null && (
                <text x={ml + 8} y={yRow + rowH/2 + 4} fontSize="11" fill="var(--bg)" fontWeight="700">
                  {info.lbl}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    );
  };

  return (
    <div className="page" style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px" }}>
      <header style={{ marginBottom: 24, paddingBottom: 16, borderBottom: "2px solid var(--cyan)" }}>
        <div style={{ fontSize: 11, color: "var(--cyan)", letterSpacing: "0.3em", fontWeight: 700, marginBottom: 8 }}>FIXO × VARIÁVEL · BREAK-EVEN</div>
        <h1 style={{ fontSize: 30, fontWeight: 800, margin: 0, lineHeight: 1.2 }}>Quanto custa só por estar aberto?</h1>
        <p style={{ color: "var(--fg-2)", fontSize: 14, marginTop: 12, lineHeight: 1.6 }}>
          Decomposição da despesa em <b>variável</b> (escala com vendas: CMV, royalties, frete, comissões, marketplace), <b>fixo</b> (independe do volume: aluguel, folha, energia, software) e <b>imposto</b> (sobre vendas: ICMS/DAS). A margem de contribuição (1 − var − imp) revela quanto cada R$ de receita sobra pra cobrir o fixo. <i>Mês corrente excluído.</i>
        </p>
      </header>

      <div className="kpi-row">
        <KpiTile tone="amber" label="Custo VARIÁVEL/mês"    value={fmtCompactN(setorAgg.grupo.variavel / Math.max(1, lojas[0]?.nMeses||1))} hint={`${fmtPctNum(setorAgg.grupo.pVar)} da receita`} />
        <KpiTile tone="red"   label="Custo FIXO/mês"        value={fmtCompactN(setorAgg.grupo.fixMean)} hint="Independe do volume" />
        <KpiTile tone="amber" label="Imposto/mês"           value={fmtCompactN(setorAgg.grupo.imposto / Math.max(1, lojas[0]?.nMeses||1))} hint={`${fmtPctNum(setorAgg.grupo.pImp)} da receita`} />
        <KpiTile tone={setorAgg.grupo.mcPct > 30 ? "green" : setorAgg.grupo.mcPct > 0 ? "cyan" : "red"} label="Margem de contribuição" value={fmtPctNum(setorAgg.grupo.mcPct)} nonMonetary hint={setorAgg.grupo.mcPct > 0 ? `Cada R$ 100 de receita gera R$ ${(setorAgg.grupo.mcPct).toFixed(0)} pra cobrir fixo` : "Não cobre nem variável"} />
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="card-title">Break-even consolidado</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginTop: 12 }}>
          <div style={{ padding: 14, borderRadius: 8, background: "var(--bg)" }}>
            <div style={{ fontSize: 11, color: "var(--fg-3)", textTransform: "uppercase" }}>Receita atual /mês</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--cyan)", marginTop: 4 }}>{fmtCompactN(setorAgg.grupo.recMean)}</div>
          </div>
          <div style={{ padding: 14, borderRadius: 8, background: "var(--bg)" }}>
            <div style={{ fontSize: 11, color: "var(--fg-3)", textTransform: "uppercase" }}>Break-even mensal</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: Number.isFinite(setorAgg.grupo.breakEven) ? "var(--amber)" : "var(--red)", marginTop: 4 }}>{Number.isFinite(setorAgg.grupo.breakEven) ? fmtCompactN(setorAgg.grupo.breakEven) : "inviável"}</div>
          </div>
          <div style={{ padding: 14, borderRadius: 8, background: "var(--bg)" }}>
            <div style={{ fontSize: 11, color: "var(--fg-3)", textTransform: "uppercase" }}>Gap até fechar conta</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: setorAgg.grupo.gapBEPct > 0 ? "var(--red)" : "var(--green)", marginTop: 4 }}>
              {!Number.isFinite(setorAgg.grupo.gapBEPct) ? "estrutura inviável"
                : setorAgg.grupo.gapBEPct > 0 ? `+${fmtPctNum(setorAgg.grupo.gapBEPct)} (crescer)`
                : `${fmtPctNum(setorAgg.grupo.gapBEPct)} (folga)`}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 14, padding: 14, borderLeft: "3px solid var(--cyan)", background: "rgba(34,211,238,0.06)", fontSize: 13, lineHeight: 1.6 }}>
          <b>Leitura na maturidade:</b> mesmo se a receita estabilizar no patamar atual, com a estrutura de custos vigente o líquido tende a <b style={{color: setorAgg.grupo.gapBEPct > 0 ? "var(--red)" : "var(--green)"}}>{setorAgg.grupo.gapBEPct > 0 ? "ficar negativo" : "ficar positivo"}</b>. Pra mudar isso, é preciso atacar (1) o custo fixo (corte direto) ou (2) a margem de contribuição (negociar variável e/ou aumentar mix de produtos com mais margem).
        </div>
      </div>

      {/* === Por setor === */}
      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="card-title">Por setor</h2>
        <table className="t" style={{ marginTop: 8 }}>
          <thead><tr>
            <th>Setor</th>
            <th className="num">Lojas</th>
            <th className="num">Receita/mês</th>
            <th className="num">Custo fixo/mês</th>
            <th className="num">% Variável</th>
            <th className="num">% Imposto</th>
            <th className="num">Margem contrib.</th>
            <th className="num">Break-even</th>
            <th>Status maturidade</th>
          </tr></thead>
          <tbody>
            {Object.values(setorAgg.bySetor).map(s => {
              const ok = s.gapBEPct <= 0;
              const dColor = ok ? "var(--green)" : (s.gapBEPct < 30 ? "var(--amber)" : "var(--red)");
              return (
                <tr key={s.sec}>
                  <td><b style={{color:window.colorForSetor(s.sec)}}>● {s.sec}</b></td>
                  <td className="num">{s.lojas}</td>
                  <td className="num">{fmtCompactN(s.recMean)}</td>
                  <td className="num red">{fmtCompactN(s.fixMean)}</td>
                  <td className="num">{fmtPctNum(s.pVar)}</td>
                  <td className="num">{fmtPctNum(s.pImp)}</td>
                  <td className="num" style={{ fontWeight: 700, color: s.mcPct > 30 ? "var(--green)" : s.mcPct > 0 ? "var(--cyan)" : "var(--red)" }}>{fmtPctNum(s.mcPct)}</td>
                  <td className="num" style={{color: Number.isFinite(s.breakEven) ? "var(--amber)" : "var(--red)", fontStyle: Number.isFinite(s.breakEven) ? "normal" : "italic"}}>{Number.isFinite(s.breakEven) ? fmtCompactN(s.breakEven) : "inviável"}</td>
                  <td style={{ color: dColor, fontWeight: 600, fontSize: 12 }}>
                    {!Number.isFinite(s.breakEven) ? "Margem op ≤ 0 — corte custo fixo/var ou feche"
                      : ok ? `+${(-s.gapBEPct).toFixed(0)}% folga`
                      : `precisa +${s.gapBEPct.toFixed(0)}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* === Timeline: tempo até break-even === */}
      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="card-title">Tempo até break-even (assumindo crescimento mensal)</h2>
        <p style={{ fontSize: 13, color: "var(--fg-2)", marginBottom: 12, lineHeight: 1.5 }}>
          Quanto cada loja levaria pra atingir o break-even <b>se mantiver um crescimento mensal de receita</b>. Estrutura de custos (fixo + variável + imposto) <b>congelada</b>. Fórmula: meses = log(BE/atual) ÷ log(1 + g).
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, color: "var(--fg-2)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>Crescimento mensal:</label>
          <input type="range" min={0} max={20} step={0.5} value={growthPct}
            onChange={e => setGrowthPct(Number(e.target.value))}
            style={{ width: 280, accentColor: "var(--cyan)" }} />
          <span style={{ fontSize: 18, color: "var(--cyan)", fontWeight: 700, minWidth: 60 }}>{growthPct.toFixed(1)}%</span>
          <span style={{ fontSize: 11, color: "var(--fg-3)" }}>
            {growthPct === 0 ? "(sem crescimento — só quem já cobre)" :
             growthPct < 3 ? "(conservador)" :
             growthPct < 8 ? "(moderado, ritmo histórico de varejo)" :
             growthPct < 15 ? "(agressivo, ramp-up)" : "(extremo, raro de sustentar)"}
          </span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            {[3, 5, 10, 15].map(p => (
              <button key={p} className="btn-ghost" onClick={() => setGrowthPct(p)}
                style={{ fontSize: 11, padding: "4px 10px", fontWeight: growthPct === p ? 700 : 400 }}>
                {p}%
              </button>
            ))}
          </div>
        </div>
        <Timeline data={lojas} gPct={growthPct} />
        <div style={{ marginTop: 14, padding: 12, background: "rgba(34,211,238,0.04)", borderRadius: 6, fontSize: 12, lineHeight: 1.6 }}>
          {(() => {
            const enr = lojas.map(l => ({ ...l, ...tempoBE(l, growthPct) }));
            const jaCobre = enr.filter(e => e.meses === 0).length;
            const rapido = enr.filter(e => e.status === "rapido").length;
            const viavel = enr.filter(e => e.status === "viavel").length;
            const longo = enr.filter(e => e.status === "longo").length;
            const inviavel = enr.filter(e => e.status === "inviavel" || e.status === "sem-crescimento").length;
            return <>
              <b>No cenário {growthPct.toFixed(1)}%/mês:</b>{" "}
              <b style={{color:"var(--green)"}}>{jaCobre + rapido}</b> lojas atingem break-even em até 12 meses;{" "}
              <b style={{color:"var(--amber)"}}>{viavel}</b> precisam de 1-3 anos;{" "}
              <b style={{color:"var(--red)"}}>{longo + inviavel}</b> não conseguem sair do prejuízo organicamente — exigem corte de custo fixo ou margem.
            </>;
          })()}
        </div>
      </div>

      {/* === Tabela detalhada === */}
      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="card-title">Detalhamento por loja · {lojas.length} empresas</h2>
        <div className="t-scroll" style={{ overflowX: "auto", maxHeight: 600 }}>
          <table className="t" style={{ minWidth: 1100 }}>
            <thead><tr>
              <th>Empresa</th>
              <th>Setor</th>
              <th className="num">Receita/mês</th>
              <th className="num">Variável %</th>
              <th className="num">Imposto %</th>
              <th className="num">Mc %</th>
              <th className="num">Fixo/mês</th>
              <th className="num">Break-even</th>
              <th className="num">Líquido/mês</th>
              <th>Status maturidade</th>
            </tr></thead>
            <tbody>
              {lojas.slice().sort((a,b) => a.gapBEPct - b.gapBEPct).map(l => (
                <tr key={l.slug} onClick={() => setDrilldown && setDrilldown({type:'conta',value:l.slug,label:l.label})} style={{cursor:setDrilldown?"pointer":"default"}}>
                  <td><b>{l.label}</b></td>
                  <td><span style={{color:window.colorForSetor(l.setor),fontSize:11}}>● {l.setor}</span></td>
                  <td className="num">{fmtCompactN(l.recMean)}</td>
                  <td className="num">{fmtPctNum(l.pVar)}</td>
                  <td className="num">{fmtPctNum(l.pImp)}</td>
                  <td className="num" style={{ color: l.mcPct > 30 ? "var(--green)" : l.mcPct > 0 ? "var(--cyan)" : "var(--red)", fontWeight: 600 }}>{fmtPctNum(l.mcPct)}</td>
                  <td className="num">{fmtCompactN(l.fixMean)}</td>
                  <td className="num amber" style={{fontStyle: !Number.isFinite(l.breakEven) ? "italic" : "normal", color: !Number.isFinite(l.breakEven) ? "var(--red)" : "var(--amber)"}}>{Number.isFinite(l.breakEven) ? fmtCompactN(l.breakEven) : "inviável"}</td>
                  <td className="num" style={{ color: l.liqMean >= 0 ? "var(--green)" : "var(--red)", fontWeight: 600 }}>{fmtCompactN(l.liqMean)}</td>
                  <td style={{ color: l.diagColor, fontSize: 11 }}>{l.diagnostic}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { PageFixoVar });
