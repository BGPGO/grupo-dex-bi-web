/* PageCapital — Capital Allocation & ROIC operacional
 *
 * ROIC proxy = liquido_anualizado / (custo+despesa+imposto anualizado)
 * (sem dado de imobilizado, despesa fixa anual é o melhor proxy de capital empregado)
 *
 * Compara contra WACC (premissa do Valuation) e identifica destruidores vs criadores.
 * Inclui curva escada: líquido cumulativo do grupo se cortar 1, 2, 3, ... piores.
 */

const PageCapital = ({ statusFilter, drilldown, setDrilldown, year, month }) => {
  const REF_YEAR = window.REF_YEAR || new Date().getFullYear();
  const rows = useMemo(() => window.buildLojasRows ? window.buildLojasRows() : [], []);

  // WACC do bi.config — não carrega aqui, usa default 25% (mesmo do Valuation)
  let waccPct = 25;
  try {
    const stored = JSON.parse(localStorage.getItem("bi.valuation") || "null");
    if (stored && Number.isFinite(stored.wacc)) waccPct = stored.wacc;
  } catch (e) {}

  const enriched = useMemo(() => {
    return rows.map(r => {
      const monthsActive = Math.max(1, r.monthsActive);
      const liqAnual = r.liquido / monthsActive * 12;
      const capitalAnual = (r.custo + r.despesa + r.imposto) / monthsActive * 12;
      const roic = capitalAnual > 0 ? (liqAnual / capitalAnual) * 100 : 0;
      let veredito = "neutro";
      if (roic > waccPct) veredito = "criador";
      else if (roic >= 0) veredito = "abaixo";
      else veredito = "destruidor";
      return { ...r, liqAnual, capitalAnual, roic, veredito };
    }).sort((a,b) => b.roic - a.roic);
  }, [rows, waccPct]);

  const criadores = enriched.filter(r => r.veredito === "criador").slice(0, 3);
  const destruidores = enriched.filter(r => r.veredito === "destruidor").slice().sort((a,b) => a.liqAnual - b.liqAnual).slice(0, 3);

  // Curva escada: ordena lojas por roic asc (pior primeiro), e mostra líquido cumulativo do grupo
  // ao cortar 0, 1, 2, ... piores
  const escada = useMemo(() => {
    const sortedAsc = enriched.slice().sort((a,b) => a.liqAnual - b.liqAnual);
    const totalLiq = sortedAsc.reduce((s,r) => s + r.liqAnual, 0);
    const out = [{ corte: 0, liquido: totalLiq, ultima: "(carteira atual)" }];
    let acc = totalLiq;
    for (let i = 0; i < sortedAsc.length; i++) {
      acc -= sortedAsc[i].liqAnual;
      out.push({ corte: i+1, liquido: acc, ultima: sortedAsc[i].label });
    }
    return out;
  }, [enriched]);
  const escadaMaxIdx = escada.reduce((mi, e, i, arr) => e.liquido > arr[mi].liquido ? i : mi, 0);

  // Realocação sugerida: top par destruidor → criador
  const reallocation = useMemo(() => {
    if (destruidores.length === 0 || criadores.length === 0) return null;
    const d = destruidores[0]; // pior destruidor
    const c = criadores[0];    // melhor criador
    // Capital "liberado" se fechasse d = capitalAnual de d
    const capitalLiberado = d.capitalAnual;
    // Se aplicado em c, ROIC marginal = c.roic
    const ganhoMarginal = capitalLiberado * (c.roic - d.roic) / 100;
    // Efeito anualizado: somar líquido perdido (positivo, pois d destrói) + ganho marginal
    return {
      destruidor: d, criador: c,
      capitalLiberado,
      efeitoAnual: -d.liqAnual + ganhoMarginal,
    };
  }, [destruidores, criadores]);

  const fmtPct = (n) => (n||0).toFixed(1).replace(".",",")+"%";

  // Mini chart escada
  const Escada = ({ data }) => {
    const W = 720, H = 180, ml = 60, mr = 20, mt = 14, mb = 28;
    const cw = W - ml - mr, ch = H - mt - mb;
    const max = Math.max(...data.map(d => d.liquido));
    const min = Math.min(0, ...data.map(d => d.liquido));
    const range = (max - min) || 1;
    const x = (i) => ml + (i / Math.max(1, data.length - 1)) * cw;
    const y = (v) => mt + ch - ((v - min) / range) * ch;
    const path = data.map((d,i) => `${i===0?'M':'L'}${x(i).toFixed(1)},${y(d.liquido).toFixed(1)}`).join(' ');
    return (
      <div style={{ width: "100%", maxWidth: W }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ display: "block", width: "100%", height: "auto" }}>
          {[0, max, min].map((v,i) => (
            <g key={i}>
              <line x1={ml} y1={y(v)} x2={W-mr} y2={y(v)} stroke="var(--border)" strokeDasharray="3,3" />
              <text x={ml-5} y={y(v)+3} textAnchor="end" fontSize="10" fill="var(--fg-3)">{fmtCompact(v)}</text>
            </g>
          ))}
          <path d={path} fill="none" stroke="var(--cyan)" strokeWidth={2} />
          {data.map((d,i) => (
            <circle key={i} cx={x(i)} cy={y(d.liquido)} r={i === escadaMaxIdx ? 5 : 3}
              fill={i === escadaMaxIdx ? "var(--green)" : "var(--cyan)"} />
          ))}
          <line x1={x(escadaMaxIdx)} y1={mt} x2={x(escadaMaxIdx)} y2={mt+ch} stroke="var(--green)" strokeDasharray="3,3" opacity={0.6} />
          <text x={x(escadaMaxIdx)} y={mt+12} textAnchor="middle" fontSize="11" fill="var(--green)" fontWeight="700">
            ótimo: cortar {escadaMaxIdx} loja{escadaMaxIdx === 1 ? "" : "s"} → {fmtCompact(data[escadaMaxIdx].liquido)}/ano
          </text>
          {data.map((_,i) => i % 4 === 0 ? (
            <text key={"l"+i} x={x(i)} y={H-8} textAnchor="middle" fontSize="9" fill="var(--fg-3)">{i}</text>
          ) : null)}
          <text x={W/2} y={H-1} textAnchor="middle" fontSize="10" fill="var(--fg-3)">N° de lojas cortadas (piores primeiro) →</text>
        </svg>
      </div>
    );
  };

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <h1>Capital Allocation · {REF_YEAR}</h1>
          <div className="status-line">
            ROIC operacional aproximado = líquido anualizado / (custo+despesa+imposto) anualizado. WACC referência: <b>{waccPct}%</b>.
          </div>
        </div>
      </div>

      <div className="kpi-row">
        <KpiTile tone="green" label="Criadores de valor (ROIC > WACC)" value={String(enriched.filter(r=>r.veredito==="criador").length)} hint="Receber capex de expansão" nonMonetary />
        <KpiTile tone="amber" label="Abaixo do custo de capital"        value={String(enriched.filter(r=>r.veredito==="abaixo").length)} hint="Operam mas não pagam o custo" nonMonetary />
        <KpiTile tone="red"   label="Destruidores de capital"           value={String(enriched.filter(r=>r.veredito==="destruidor").length)} hint="Líquido anual negativo" nonMonetary />
        <KpiTile tone="cyan"  label="ROIC mediano da carteira"          value={enriched.length ? enriched[Math.floor(enriched.length/2)].roic.toFixed(1).replace(".",",")+"%" : "—"} nonMonetary hint="Centro do portfólio" />
      </div>

      <div className="card">
        <h2 className="card-title">Curva escada — quantas lojas piores cortar maximiza o líquido?</h2>
        <Escada data={escada} />
        <div className="status-line" style={{ marginTop: 6, fontSize: 11 }}>
          Buffett: <i>"às vezes a melhor decisão é fazer menos."</i> O ponto de máximo na curva indica quantas lojas (piores em líquido anual) bastaria fechar pra maximizar o líquido consolidado — assumindo zero custo de saída e nenhum efeito sobre as outras.
        </div>
      </div>

      {reallocation && (
        <div className="card" style={{ background: "linear-gradient(135deg, rgba(34,211,238,0.08), rgba(34,211,238,0.02))", borderColor: "rgba(34,211,238,0.30)" }}>
          <h2 className="card-title">Realocação sugerida</h2>
          <p style={{ lineHeight: 1.6, fontSize: 14 }}>
            Se você fechasse <b style={{ color: "var(--red)" }}>{reallocation.destruidor.label}</b> (ROIC <b>{fmtPct(reallocation.destruidor.roic)}</b>, líquido anualizado <b>{fmtCompact(reallocation.destruidor.liqAnual)}</b>) e movesse o capital empregado de <b>{fmtCompact(reallocation.capitalLiberado)}</b> pra <b style={{ color: "var(--green)" }}>{reallocation.criador.label}</b> (ROIC <b>{fmtPct(reallocation.criador.roic)}</b>):
          </p>
          <div style={{ fontSize: 28, fontWeight: 800, color: reallocation.efeitoAnual >= 0 ? "var(--green)" : "var(--red)", marginTop: 8 }}>
            Efeito anualizado: {reallocation.efeitoAnual >= 0 ? "+" : ""}{fmtCompact(reallocation.efeitoAnual)}
          </div>
          <div style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 6 }}>
            Aproximação linear; ignora custos de saída (rescisões, multas de contrato), tempo de ramp-up, e capacidade da loja receptora.
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="card-title">Ranking ROIC — clique pra filtrar BI</h2>
        <div className="t-scroll" style={{ overflowX: "auto" }}>
          <table className="t" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th>Empresa</th>
                <th className="num">Líquido anualizado</th>
                <th className="num">Capital empregado/ano</th>
                <th className="num">ROIC</th>
                <th className="num">vs WACC ({waccPct}%)</th>
                <th>Veredito</th>
              </tr>
            </thead>
            <tbody>
              {enriched.map(r => {
                const colors = { criador: "var(--green)", abaixo: "var(--amber)", destruidor: "var(--red)", neutro: "var(--fg-3)" };
                const labels = { criador: "Criador", abaixo: "Abaixo do WACC", destruidor: "Destruidor", neutro: "—" };
                return (
                  <tr key={r.slug} onClick={() => setDrilldown({type:'conta', value:r.slug, label:r.label})} style={{ cursor: "pointer" }}>
                    <td><b>{r.label}</b><div style={{ fontSize: 10, color: "var(--fg-3)" }}>{r.marca} · {r.canal}</div></td>
                    <td className="num" style={{ color: r.liqAnual >= 0 ? "var(--green)" : "var(--red)" }}>{fmtCompact(r.liqAnual)}</td>
                    <td className="num">{fmtCompact(r.capitalAnual)}</td>
                    <td className="num" style={{ color: colors[r.veredito], fontWeight: 700 }}>{fmtPct(r.roic)}</td>
                    <td className="num" style={{ color: colors[r.veredito] }}>{fmtPct(r.roic - waccPct)}</td>
                    <td><span style={{ color: colors[r.veredito], fontWeight: 600, fontSize: 12 }}>{labels[r.veredito]}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { PageCapital });
