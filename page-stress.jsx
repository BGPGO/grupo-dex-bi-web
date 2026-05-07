/* PageStress — Stress Test & Margem de Segurança
 *
 * Sliders sobre 5 alavancas. Recalcula em tempo real:
 *   - Líquido projetado anual
 *   - Lojas positivas/negativas
 *   - Break-even: queda % de receita que zera o líquido
 *   - Margem de segurança = (receita_atual - receita_breakeven) / receita_atual
 */

const PageStress = ({ statusFilter, drilldown, setDrilldown, year, month }) => {
  const REF_YEAR = window.REF_YEAR || new Date().getFullYear();
  const rows = useMemo(() => window.buildLojasRows ? window.buildLojasRows() : [], []);

  // Estado dos sliders (variação % sobre o baseline projetado anual)
  const [scn, setScn] = useState({ rec: 0, cmv: 0, opex: 0, imp: 0, aluguel: 0 });

  const presets = {
    base:         { rec: 0,   cmv: 0,  opex: 0,  imp: 0, aluguel: 0 },
    conservador:  { rec: -10, cmv: 5,  opex: 5,  imp: 0, aluguel: 0 },
    stress:       { rec: -20, cmv: 10, opex: 10, imp: 0, aluguel: 0 },
    otimista:     { rec: 10,  cmv: -3, opex: -2, imp: 0, aluguel: 0 },
  };

  // Baseline anualizado por loja (12× mensal médio realizado)
  const baseline = useMemo(() => {
    return rows.map(r => {
      const m = Math.max(1, r.monthsActive);
      return {
        slug: r.slug, label: r.label, marca: r.marca, canal: r.canal,
        receita: r.receita / m * 12,
        custo: r.custo / m * 12,
        despesa: r.despesa / m * 12,
        imposto: r.imposto / m * 12,
        // aluguel estimado: 30% da despesa (proxy padrão do varejo). User pode refinar.
        aluguel_est: r.despesa / m * 12 * 0.30,
      };
    });
  }, [rows]);

  // Aplica cenário em cada loja
  const apply = (b, s) => {
    const newRec = b.receita * (1 + s.rec/100);
    const newCmv = b.custo * (1 + s.cmv/100);
    const newImp = b.imposto * (1 + s.imp/100);
    // OPEX: despesa × (1 + s.opex/100), MAS o aluguel_est é deslocado por sua própria %
    const newAluguel = b.aluguel_est * (1 + s.aluguel/100);
    const restoOpex = (b.despesa - b.aluguel_est) * (1 + s.opex/100);
    const newDespesa = newAluguel + restoOpex;
    const liquido = newRec - newCmv - newDespesa - newImp;
    return { ...b, newRec, newCmv, newDespesa, newImp, liquido };
  };

  const projected = useMemo(() => baseline.map(b => apply(b, scn)), [baseline, scn]);
  const sumLiquido = projected.reduce((s, p) => s + p.liquido, 0);
  const sumReceita = projected.reduce((s, p) => s + p.newRec, 0);
  const sumCustos  = projected.reduce((s, p) => s + p.newCmv + p.newDespesa + p.newImp, 0);
  const positivas = projected.filter(p => p.liquido > 0).length;
  const negativas = projected.filter(p => p.liquido < 0).length;

  // Break-even: linear approx — qual rec_delta% zera o líquido com cmv/opex/imp/aluguel atuais?
  // soma( newRec ) = soma( newCmv + newDespesa + newImp )
  // sumReceita * (1+x) = sumCustos (com cmv/opex/imp/aluguel já aplicados ao baseline NÃO ajustado por rec)
  // Mas custos não dependem de receita aqui; então:
  // breakEvenRecMult = sumCustos / sumReceitaBase (com rec slider zerado)
  const breakEven = useMemo(() => {
    const baseFlat = baseline.map(b => apply(b, { ...scn, rec: 0 }));
    const recBase = baseFlat.reduce((s, p) => s + p.newRec, 0);
    const custBase = baseFlat.reduce((s, p) => s + p.newCmv + p.newDespesa + p.newImp, 0);
    if (recBase <= 0) return null;
    const breakEvenMult = custBase / recBase;
    // delta % de receita (vs baseline) que zera líquido
    const breakEvenPct = (breakEvenMult - 1) * 100;
    // margem de segurança: distância da receita atual até o ponto de quebra
    const recAtual = sumReceita;
    const recBreak = custBase; // receita necessária pra zerar líquido
    const margemSeg = recAtual > 0 ? ((recAtual - recBreak) / recAtual) * 100 : 0;
    return { breakEvenPct, margemSeg, recBreak };
  }, [baseline, scn, sumReceita]);

  const margemSeg = breakEven ? breakEven.margemSeg : 0;
  const margemTone = margemSeg > 30 ? "var(--green)" : margemSeg > 10 ? "var(--amber)" : "var(--red)";

  // Heatmap 2D: receita Δ% (linhas) × (cmv+opex) Δ% (colunas) → líquido total
  const heatmap = useMemo(() => {
    const recSteps = [-30, -20, -10, 0, 10];
    const costSteps = [-10, 0, 10, 20, 30];
    const grid = [];
    for (const rd of recSteps) {
      const row = [];
      for (const cd of costSteps) {
        const liq = baseline.reduce((s, b) => s + apply(b, { rec: rd, cmv: cd, opex: cd, imp: 0, aluguel: 0 }).liquido, 0);
        row.push({ rd, cd, liq });
      }
      grid.push(row);
    }
    return { recSteps, costSteps, grid };
  }, [baseline]);

  const heatmapMax = Math.max(...heatmap.grid.flat().map(c => Math.abs(c.liq)));

  const Slider = ({ label, val, onChange, min, max, step = 1, suffix = "%" }) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--fg-2)", marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ color: val !== 0 ? "var(--cyan)" : "var(--fg-3)", fontWeight: 600 }}>{(val>=0?"+":"")+val+suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={val}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: "var(--cyan)" }} />
    </div>
  );

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <h1>Stress Test · {REF_YEAR}</h1>
          <div className="status-line">
            Variações % sobre o baseline anualizado da carteira. Mostra impacto agregado e qual queda % de receita zera o líquido (margem de segurança).
          </div>
        </div>
      </div>

      <div className="kpi-row">
        <KpiTile tone={sumLiquido >= 0 ? "green" : "red"} label="Líquido projetado anual" value={fmtCompact(sumLiquido)} hint={`Cenário aplicado nos ${rows.length} lojas`} />
        <KpiTile tone={margemTone === "var(--green)" ? "green" : margemTone === "var(--amber)" ? "amber" : "red"} label="Margem de segurança" value={margemSeg.toFixed(1).replace(".",",")+"%"} nonMonetary hint={breakEven ? `Break-even: receita ${(breakEven.breakEvenPct).toFixed(1).replace(".",",")}%` : "—"} />
        <KpiTile tone="green" label="Lojas positivas" value={String(positivas)} hint={`${negativas} negativas`} nonMonetary />
        <KpiTile tone="cyan"  label="Receita projetada" value={fmtCompact(sumReceita)} hint={`Custos totais: ${fmtCompact(sumCustos)}`} />
      </div>

      <div className="row" style={{ gridTemplateColumns: "1fr 2fr", gap: 16 }}>
        <div className="card">
          <h2 className="card-title">Cenários pré-prontos</h2>
          <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
            {Object.entries(presets).map(([k,p]) => (
              <button key={k} className="btn-ghost" onClick={() => setScn(p)}
                style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, textTransform: "capitalize" }}>
                {k} <span style={{ fontSize: 10, color: "var(--fg-3)", fontWeight: 400 }}>· rec {p.rec >= 0 ? "+" : ""}{p.rec}% · custos {p.cmv >= 0 ? "+" : ""}{p.cmv}%</span>
              </button>
            ))}
          </div>

          <h3 style={{ fontSize: 12, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>Alavancas</h3>
          <Slider label="Receita Δ%" val={scn.rec} onChange={v => setScn(s => ({...s, rec: v}))} min={-50} max={30} />
          <Slider label="CMV Δ%" val={scn.cmv} onChange={v => setScn(s => ({...s, cmv: v}))} min={-20} max={30} />
          <Slider label="OPEX (despesa não-aluguel) Δ%" val={scn.opex} onChange={v => setScn(s => ({...s, opex: v}))} min={-20} max={30} />
          <Slider label="Aluguel Δ%" val={scn.aluguel} onChange={v => setScn(s => ({...s, aluguel: v}))} min={-20} max={30} />
          <Slider label="Imposto Δ%" val={scn.imp} onChange={v => setScn(s => ({...s, imp: v}))} min={-10} max={20} />
        </div>

        <div className="card">
          <h2 className="card-title">Heatmap — Receita Δ × CMV+OPEX Δ → Líquido anual</h2>
          <div style={{ overflowX: "auto" }}>
            <table className="t" style={{ borderCollapse: "collapse", margin: "8px 0" }}>
              <thead>
                <tr>
                  <th style={{ background: "transparent" }}></th>
                  {heatmap.costSteps.map(cd => (
                    <th key={cd} className="num" style={{ background: "transparent", fontSize: 11, padding: "4px 8px" }}>
                      Custos {cd >= 0 ? "+" : ""}{cd}%
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmap.grid.map((row, i) => (
                  <tr key={i}>
                    <th style={{ textAlign: "right", fontWeight: 600, fontSize: 11, padding: "4px 8px", background: "transparent" }}>
                      Rec {heatmap.recSteps[i] >= 0 ? "+" : ""}{heatmap.recSteps[i]}%
                    </th>
                    {row.map((cell, j) => {
                      const intensity = Math.abs(cell.liq) / Math.max(1, heatmapMax);
                      const bg = cell.liq >= 0
                        ? `rgba(16, 185, 129, ${0.15 + intensity * 0.55})`
                        : `rgba(239, 68, 68, ${0.15 + intensity * 0.55})`;
                      return (
                        <td key={j} className="num" style={{ background: bg, fontSize: 11, padding: "8px", textAlign: "center", fontWeight: 600, color: "white" }}>
                          {fmtCompact(cell.liq)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="status-line" style={{ marginTop: 6, fontSize: 11 }}>
            Cada célula = líquido anual da carteira aplicando aquela combinação. Verde = positivo · vermelho = prejuízo · intensidade = magnitude.
          </div>
        </div>
      </div>

      <div className="card" style={{ background: "linear-gradient(135deg, rgba(34,211,238,0.06), transparent)" }}>
        <h2 className="card-title">Resumo do cenário</h2>
        <p style={{ lineHeight: 1.7, fontSize: 14 }}>
          No cenário aplicado, a operação fecha {REF_YEAR} com líquido anual de
          <b style={{ color: sumLiquido >= 0 ? "var(--green)" : "var(--red)", margin: "0 6px" }}>{fmtCompact(sumLiquido)}</b>.
          {breakEven && breakEven.recBreak > 0 && (
            <>
              {" "}A receita necessária pra zerar prejuízo seria <b>{fmtCompact(breakEven.recBreak)}</b> — {margemSeg >= 0 ? "uma margem de segurança de" : "um déficit de"}{" "}
              <b style={{ color: margemTone }}>{Math.abs(margemSeg).toFixed(1).replace(".",",")}%</b>.
            </>
          )}
          {" "}{positivas} das {rows.length} lojas operam no positivo neste cenário.
        </p>
      </div>
    </div>
  );
};

Object.assign(window, { PageStress });
