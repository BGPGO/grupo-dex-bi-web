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
      if (mcPct <= 0) { diagnostic = "Margem contribuição NEGATIVA — não cobre nem var/imp"; diagColor = "var(--red)"; }
      else if (gapBE <= 0) { diagnostic = `Acima do break-even (${(-gapBEPct).toFixed(0)}% folga)`; diagColor = "var(--green)"; }
      else if (gapBEPct < 30) { diagnostic = `Precisa crescer ${gapBEPct.toFixed(0)}% pra fechar conta`; diagColor = "var(--amber)"; }
      else if (gapBEPct < 100) { diagnostic = `Falta ${gapBEPct.toFixed(0)}% — turnaround viável`; diagColor = "var(--amber)"; }
      else { diagnostic = `Falta ${gapBEPct.toFixed(0)}% — provavelmente inviável`; diagColor = "var(--red)"; }
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

  // === Scatter break-even × atual ===
  const Scatter = ({ data, height = 400 }) => {
    if (!data || !data.length) return null;
    const W = 760, ml = 60, mr = 14, mt = 20, mb = 50;
    const cw = W - ml - mr, ch = height - mt - mb;
    const points = data.filter(d => Number.isFinite(d.breakEven) && d.recMean > 0);
    if (!points.length) return null;
    const maxX = Math.max(...points.map(d => d.recMean), 1);
    const maxY = Math.max(...points.map(d => Math.min(d.breakEven, maxX*5)), 1);
    const max = Math.max(maxX, maxY);
    const x = (v) => ml + (v / max) * cw;
    const y = (v) => mt + ch - (Math.min(v, max) / max) * ch;
    return (
      <svg viewBox={`0 0 ${W} ${height}`} style={{ display: "block", width: "100%", height: "auto", maxWidth: W }}>
        {/* Linha y=x (break-even) */}
        <line x1={x(0)} y1={y(0)} x2={x(max)} y2={y(max)} stroke="var(--amber)" strokeWidth={1.5} strokeDasharray="6,4" />
        <text x={x(max)-6} y={y(max)+14} textAnchor="end" fontSize="10" fill="var(--amber)">y = x · break-even</text>
        {/* Grid */}
        {[0, 0.25, 0.5, 0.75, 1].map(p => (
          <g key={p}>
            <line x1={ml} y1={y(max*p)} x2={W-mr} y2={y(max*p)} stroke="var(--border)" strokeDasharray="3,3" />
            <text x={ml-5} y={y(max*p)+3} textAnchor="end" fontSize="9" fill="var(--fg-3)">{fmtCompactN(max*p)}</text>
            <line x1={x(max*p)} y1={mt} x2={x(max*p)} y2={mt+ch} stroke="var(--border)" strokeDasharray="3,3" />
            <text x={x(max*p)} y={height-30} textAnchor="middle" fontSize="9" fill="var(--fg-3)">{fmtCompactN(max*p)}</text>
          </g>
        ))}
        {/* Pontos */}
        {points.map((d,i) => {
          const above = d.recMean >= d.breakEven;
          const c = above ? "var(--green)" : (d.gapBEPct < 30 ? "var(--amber)" : "var(--red)");
          const r = Math.max(4, Math.min(14, Math.sqrt(d.receita / 1e5)));
          return (
            <g key={d.slug} onClick={() => setDrilldown && setDrilldown({ type: 'conta', value: d.slug, label: d.label })} style={{ cursor: setDrilldown ? "pointer" : "default" }}>
              <circle cx={x(d.recMean)} cy={y(Math.min(d.breakEven, max))} r={r} fill={c} opacity={0.55} stroke={c} strokeWidth={1.5} />
              <title>{`${d.label}\nReceita média: ${fmtCompactN(d.recMean)}\nBreak-even: ${fmtCompactN(d.breakEven)}\nGap: ${fmtPctNum(d.gapBEPct)}\n${d.diagnostic}`}</title>
            </g>
          );
        })}
        <text x={W/2} y={height-6} textAnchor="middle" fontSize="11" fill="var(--fg-2)" fontWeight="600">Receita média mensal atual →</text>
        <text x={14} y={height/2} textAnchor="middle" fontSize="11" fill="var(--fg-2)" fontWeight="600" transform={`rotate(-90 14 ${height/2})`}>Break-even revenue (R$ que precisa pra fechar conta) →</text>
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
            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--amber)", marginTop: 4 }}>{fmtCompactN(setorAgg.grupo.breakEven)}</div>
          </div>
          <div style={{ padding: 14, borderRadius: 8, background: "var(--bg)" }}>
            <div style={{ fontSize: 11, color: "var(--fg-3)", textTransform: "uppercase" }}>Gap até fechar conta</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: setorAgg.grupo.gapBEPct > 0 ? "var(--red)" : "var(--green)", marginTop: 4 }}>
              {setorAgg.grupo.gapBEPct > 0 ? "+" : ""}{fmtPctNum(setorAgg.grupo.gapBEPct)} {setorAgg.grupo.gapBEPct > 0 ? "(crescer)" : "(folga)"}
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
                  <td className="num amber">{fmtCompactN(s.breakEven)}</td>
                  <td style={{ color: dColor, fontWeight: 600, fontSize: 12 }}>
                    {ok ? `+${(-s.gapBEPct).toFixed(0)}% folga` : `precisa +${s.gapBEPct.toFixed(0)}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* === Scatter === */}
      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="card-title">Mapa: receita atual × break-even (cada bolha = uma loja)</h2>
        <p style={{ fontSize: 12, color: "var(--fg-2)", marginBottom: 8 }}>
          Linha amarela = break-even (y=x). Lojas <b style={{color:"var(--green)"}}>abaixo da linha</b> já fecham conta. Lojas <b style={{color:"var(--red)"}}>acima</b> precisam crescer pra cobrir o fixo. Click filtra todo o BI.
        </p>
        <Scatter data={lojas} />
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
                  <td className="num amber">{Number.isFinite(l.breakEven) ? fmtCompactN(l.breakEven) : "∞"}</td>
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
