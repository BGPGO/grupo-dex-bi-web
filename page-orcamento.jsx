/* PageOrcamento — Tela de orçamento mensal/anual baseado em:
 *   Receita orçada = MELHOR mês de receita do REF_YEAR
 *   Custo orçado   = MÉDIA dos meses ativos
 *   Despesa orçada = MÉDIA dos meses ativos
 *   Imposto orçado = MÉDIA dos meses ativos
 *
 * Compara Real (mês fechado) vs Orçado (regra acima) e mostra variação R$/%.
 * Total anual = Real YTD + Orçado dos meses restantes (mesma lógica fin40).
 */

const PageOrcamento = ({ statusFilter, drilldown, setDrilldown, year, month }) => {
  const B = window.BIT || {};
  const REF_YEAR = window.REF_YEAR || new Date().getFullYear();
  const MONTHS = B.MONTHS || ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  const MONTHS_FULL = B.MONTHS_FULL || ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];

  // Quando há drilldown de conta ativo, recomputa filtrado por aquela loja
  const isContaFilter = drilldown && drilldown.type === 'conta';

  // DRE mensal e ORCAMENTO vêm do build-data.cjs (window.BIT.MONTH_DRE / .ORCAMENTO)
  // Para conta filtrada, recomputa em runtime via ALL_TX (apenas REALIZADO desta conta)
  const { DRE, ORC } = useMemo(() => {
    if (!isContaFilter) {
      return { DRE: B.MONTH_DRE || [], ORC: B.ORCAMENTO || {} };
    }
    // Recomputa pra conta selecionada
    const slug = drilldown.value;
    const allTx = window.ALL_TX || [];
    const dre = MONTHS_FULL.map(m => ({ m, receita: 0, custo: 0, despesa: 0, imposto: 0, outros: 0, liquido: 0, count: 0 }));
    // ALL_TX tuple: [kind, mes, dia, categoria, cliente, valor, realizado, fornecedor, cc, conta_slug]
    // categoria precisa ser classificada — sem secao no tuple, vamos só usar receita/despesa básico (perde split custo)
    // Fallback: pra filtro por conta, usa receita vs despesa (sem custo/imposto split — limitação atual)
    for (const r of allTx) {
      if (r[9] !== slug) continue;
      if (r[6] !== 1) continue; // só realizado
      if (!r[1] || Number(r[1].slice(0,4)) !== REF_YEAR) continue;
      const mIdx = parseInt(r[1].slice(5,7), 10) - 1;
      if (mIdx < 0 || mIdx > 11) continue;
      if (r[0] === 'r') dre[mIdx].receita += r[5];
      else dre[mIdx].despesa += r[5];
      dre[mIdx].count += 1;
    }
    for (const m of dre) m.liquido = m.receita - m.custo - m.imposto - m.despesa;
    const active = dre.filter(m => m.count > 0);
    const N = Math.max(1, active.length);
    const orc = {
      receita_mes: Math.max(...dre.map(m => m.receita), 0),
      custo_mes:   active.reduce((s,m)=>s+m.custo, 0)/N,
      despesa_mes: active.reduce((s,m)=>s+m.despesa, 0)/N,
      imposto_mes: active.reduce((s,m)=>s+m.imposto, 0)/N,
      meses_ativos: active.length,
      melhor_mes_idx: dre.reduce((bi,m,i,a)=>m.receita>a[bi].receita?i:bi, 0),
    };
    orc.liquido_mes = orc.receita_mes - orc.custo_mes - orc.imposto_mes - orc.despesa_mes;
    orc.receita_ano = orc.receita_mes * 12;
    orc.custo_ano   = orc.custo_mes * 12;
    orc.despesa_ano = orc.despesa_mes * 12;
    orc.imposto_ano = orc.imposto_mes * 12;
    orc.liquido_ano = orc.liquido_mes * 12;
    return { DRE: dre, ORC: orc };
  }, [isContaFilter, drilldown, B.MONTH_DRE, B.ORCAMENTO, REF_YEAR]);

  const monthsRealized = DRE.filter(m => m.count > 0).length;
  const monthsRemaining = Math.max(0, 12 - monthsRealized);
  const totalRec = DRE.reduce((s,m)=>s+m.receita, 0);
  const totalCus = DRE.reduce((s,m)=>s+m.custo, 0);
  const totalDes = DRE.reduce((s,m)=>s+m.despesa, 0);
  const totalImp = DRE.reduce((s,m)=>s+m.imposto, 0);
  const totalLiq = totalRec - totalCus - totalImp - totalDes;

  // Projeção total = realizado YTD + orçado dos meses restantes (alinhado fin40)
  const projRec = totalRec + (ORC.receita_mes||0) * monthsRemaining;
  const projCus = totalCus + (ORC.custo_mes  ||0) * monthsRemaining;
  const projDes = totalDes + (ORC.despesa_mes||0) * monthsRemaining;
  const projImp = totalImp + (ORC.imposto_mes||0) * monthsRemaining;
  const projLiq = projRec - projCus - projImp - projDes;

  const fmtBRL = (n) => "R$ " + formatBR(n||0, 0);
  const fmtPctSafe = (n) => Number.isFinite(n) ? (n>=0?"+":"") + n.toFixed(1).replace(".", ",") + "%" : "—";
  const variacaoPct = (real, orc) => orc === 0 ? null : ((real - orc) / orc) * 100;

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <h1>Orçamento {REF_YEAR}{isContaFilter ? ` · ${drilldown.label}` : " · Consolidado"}</h1>
          <div className="status-line">
            Receita orçada = melhor mês ({MONTHS_FULL[ORC.melhor_mes_idx||0] || "—"}, R$ {formatBR(ORC.receita_mes||0, 0)}). Custo / despesa / imposto = média de {ORC.meses_ativos||0} meses.
            {isContaFilter && monthsRealized === 0 && <span style={{ color: "var(--amber)", marginLeft: 8 }}> · Esta loja não tem caixa realizado em {REF_YEAR}.</span>}
          </div>
        </div>
      </div>

      <DrilldownBadge drilldown={drilldown} onClear={() => setDrilldown(null)} />

      {/* === Cards de orçamento mensal === */}
      <div className="kpi-row">
        <KpiTile tone="green" label="Receita orçada (/mês)" value={fmtBRL(ORC.receita_mes)} hint={`Melhor mês: ${MONTHS_FULL[ORC.melhor_mes_idx||0] || "—"}`} />
        <KpiTile tone="amber" label="Custo médio (/mês)"    value={fmtBRL(ORC.custo_mes)}   hint={`Média de ${ORC.meses_ativos||0} meses ativos`} />
        <KpiTile tone="red"   label="Despesa média (/mês)"  value={fmtBRL(ORC.despesa_mes)} hint={`Média de ${ORC.meses_ativos||0} meses ativos`} />
        <KpiTile tone={(ORC.liquido_mes||0) >= 0 ? "cyan" : "red"} label="Líquido orçado (/mês)" value={fmtBRL(ORC.liquido_mes)} hint={`Anual: R$ ${formatBR(ORC.liquido_ano||0, 0)}`} />
      </div>

      {/* === Tabela Real vs Orçado mensal === */}
      <div className="card">
        <h2 className="card-title">Real vs Orçado · {REF_YEAR}</h2>
        <div className="t-scroll" style={{ overflowX: "auto" }}>
          <table className="t">
            <thead>
              <tr>
                <th>Mês</th>
                <th className="num">Receita Real</th>
                <th className="num">Receita Orç.</th>
                <th className="num">Δ%</th>
                <th className="num">Custo Real</th>
                <th className="num">Custo Orç.</th>
                <th className="num">Despesa Real</th>
                <th className="num">Despesa Orç.</th>
                <th className="num">Líquido Real</th>
                <th className="num">Líquido Orç.</th>
              </tr>
            </thead>
            <tbody>
              {DRE.map((m, i) => {
                const isRealized = m.count > 0;
                const dRecPct = isRealized ? variacaoPct(m.receita, ORC.receita_mes) : null;
                const liqOrc = (ORC.receita_mes||0) - (ORC.custo_mes||0) - (ORC.imposto_mes||0) - (ORC.despesa_mes||0);
                return (
                  <tr key={i} style={isRealized ? {} : { opacity: 0.5 }}>
                    <td><b>{MONTHS_FULL[i]}</b>{!isRealized && <span style={{ color: "var(--fg-3)", marginLeft: 6, fontSize: 11 }}>(sem real)</span>}</td>
                    <td className="num green">{isRealized ? fmtBRL(m.receita) : "—"}</td>
                    <td className="num">{fmtBRL(ORC.receita_mes)}</td>
                    <td className={"num " + (dRecPct == null ? "" : (dRecPct >= 0 ? "green" : "red"))}>{fmtPctSafe(dRecPct)}</td>
                    <td className="num red">{isRealized ? fmtBRL(m.custo) : "—"}</td>
                    <td className="num">{fmtBRL(ORC.custo_mes)}</td>
                    <td className="num red">{isRealized ? fmtBRL(m.despesa) : "—"}</td>
                    <td className="num">{fmtBRL(ORC.despesa_mes)}</td>
                    <td className={"num " + (m.liquido >= 0 ? "green" : "red")}>{isRealized ? fmtBRL(m.liquido) : "—"}</td>
                    <td className={"num " + (liqOrc >= 0 ? "green" : "red")}>{fmtBRL(liqOrc)}</td>
                  </tr>
                );
              })}
              <tr style={{ background: "rgba(34, 211, 238, 0.06)", fontWeight: 700 }}>
                <td>TOTAL ANUAL projetado</td>
                <td className="num green">{fmtBRL(totalRec)}</td>
                <td className="num">{fmtBRL((ORC.receita_ano||0))}</td>
                <td className="num">{fmtPctSafe(variacaoPct(projRec, (ORC.receita_ano||0)))}</td>
                <td className="num red">{fmtBRL(totalCus)}</td>
                <td className="num">{fmtBRL((ORC.custo_ano||0))}</td>
                <td className="num red">{fmtBRL(totalDes)}</td>
                <td className="num">{fmtBRL((ORC.despesa_ano||0))}</td>
                <td className={"num " + (projLiq >= 0 ? "green" : "red")}>{fmtBRL(projLiq)}</td>
                <td className={"num " + ((ORC.liquido_ano||0) >= 0 ? "green" : "red")}>{fmtBRL(ORC.liquido_ano)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="status-line" style={{ marginTop: 8 }}>
          <b>Total projetado</b> = realizado YTD ({monthsRealized} {monthsRealized === 1 ? "mês" : "meses"}) + orçamento dos {monthsRemaining} {monthsRemaining === 1 ? "mês" : "meses"} restantes — mesma lógica do Ano 1 do Valuation (alinhado fin40).
        </div>
      </div>

      {/* === Card resumo do orçamento anual === */}
      <div className="row">
        <div className="card">
          <h2 className="card-title">Resumo do orçamento anual</h2>
          <table className="t">
            <tbody>
              <tr><td>Receita orçada (12 × melhor mês)</td><td className="num green"><b>{fmtBRL(ORC.receita_ano)}</b></td></tr>
              <tr><td>Custo orçado (12 × média)</td><td className="num red">{fmtBRL(ORC.custo_ano)}</td></tr>
              <tr><td>Imposto orçado (12 × média)</td><td className="num red">{fmtBRL(ORC.imposto_ano)}</td></tr>
              <tr><td>Despesa orçada (12 × média)</td><td className="num red">{fmtBRL(ORC.despesa_ano)}</td></tr>
              <tr style={{ borderTop: "1px solid var(--border)", fontWeight: 700 }}>
                <td>Líquido orçado (anual)</td>
                <td className={"num " + ((ORC.liquido_ano||0) >= 0 ? "green" : "red")}><b>{fmtBRL(ORC.liquido_ano)}</b></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2 className="card-title">Realizado YTD vs orçamento</h2>
          <table className="t">
            <tbody>
              <tr><td>Receita realizada YTD</td><td className="num green">{fmtBRL(totalRec)}</td></tr>
              <tr><td>Receita orçada YTD ({monthsRealized}m)</td><td className="num">{fmtBRL((ORC.receita_mes||0) * monthsRealized)}</td></tr>
              <tr><td>Variação Receita YTD</td><td className={"num " + (totalRec >= (ORC.receita_mes||0)*monthsRealized ? "green" : "red")}><b>{fmtPctSafe(variacaoPct(totalRec, (ORC.receita_mes||0)*monthsRealized))}</b></td></tr>
              <tr style={{ borderTop: "1px solid var(--border)" }}><td>Líquido realizado YTD</td><td className={"num " + (totalLiq >= 0 ? "green" : "red")}>{fmtBRL(totalLiq)}</td></tr>
              <tr><td>Líquido orçado YTD</td><td className="num">{fmtBRL(((ORC.liquido_mes||0)) * monthsRealized)}</td></tr>
              <tr style={{ borderTop: "1px solid var(--border)", fontWeight: 700 }}>
                <td>Projeção de fechamento {REF_YEAR}</td>
                <td className={"num " + (projLiq >= 0 ? "green" : "red")}><b>{fmtBRL(projLiq)}</b></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { PageOrcamento });
