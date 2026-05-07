/* PageScorecard — Scorecard de Qualidade (Buffett-style)
 *
 * Score 0-100 por loja composto de 5 pilares (cada um 0-20, percentilizado contra a carteira):
 *   Margem        — margem líquida YTD
 *   Crescimento   — slope da regressão linear sobre receita mensal
 *   Estabilidade  — 1 - CV mensal de receita
 *   Eficiência    — líquido / (custo+despesa+imposto) (R$ líquido por R$ de saída)
 *   Cobertura     — líquido real médio / líquido orçado mensal
 *
 * Resposta: "qual loja eu compraria se pudesse comprar uma só?"
 */

const PageScorecard = ({ statusFilter, drilldown, setDrilldown, year, month }) => {
  const REF_YEAR = window.REF_YEAR || new Date().getFullYear();
  const rows = useMemo(() => window.buildLojasRows ? window.buildLojasRows() : [], []);

  // Computa pilares brutos
  const withPillars = useMemo(() => {
    return rows.map(r => {
      const efficiency = (r.custo + r.despesa + r.imposto) > 0
        ? r.liquido / (r.custo + r.despesa + r.imposto)
        : 0;
      const stability = Math.max(0, 1 - Math.min(1, r.cv));
      const margem = r.margem; // %
      const slope = r.slope;   // %
      const cobertura = Math.max(-2, Math.min(3, r.cobertura)); // clamp -2 a 3
      return { ...r, p_margem: margem, p_slope: slope, p_stab: stability, p_eff: efficiency, p_cob: cobertura };
    });
  }, [rows]);

  // Percentilizar cada pilar (0-20)
  const scored = useMemo(() => {
    const norm = (vals, val) => {
      const xs = vals.slice().sort((a,b) => a-b);
      if (xs.length === 0) return 10;
      const idx = xs.findIndex(x => x >= val);
      const rank = idx === -1 ? xs.length : idx;
      return (rank / Math.max(1, xs.length - 1)) * 20;
    };
    const margens = withPillars.map(r => r.p_margem);
    const slopes = withPillars.map(r => r.p_slope);
    const stabs = withPillars.map(r => r.p_stab);
    const effs = withPillars.map(r => r.p_eff);
    const cobs = withPillars.map(r => r.p_cob);
    return withPillars.map(r => {
      const s_margem = norm(margens, r.p_margem);
      const s_slope = norm(slopes, r.p_slope);
      const s_stab = norm(stabs, r.p_stab);
      const s_eff = norm(effs, r.p_eff);
      const s_cob = norm(cobs, r.p_cob);
      const total = s_margem + s_slope + s_stab + s_eff + s_cob;
      return { ...r, s_margem, s_slope, s_stab, s_eff, s_cob, total };
    }).sort((a,b) => b.total - a.total);
  }, [withPillars]);

  const top1 = scored[0], bottom1 = scored[scored.length-1];
  const median = scored.length > 0 ? scored[Math.floor(scored.length/2)].total : 0;
  const avg = scored.length > 0 ? scored.reduce((s,r)=>s+r.total, 0) / scored.length : 0;

  // Radar SVG inline (5 vértices em pentágono regular, 60×60)
  const Radar = ({ pillars, size = 60 }) => {
    const cx = size/2, cy = size/2, r = size/2 - 4;
    const angles = [0, 72, 144, 216, 288].map(a => (a - 90) * Math.PI / 180);
    const max = 20;
    const points = pillars.map((p, i) => {
      const v = Math.max(0, p) / max;
      return [cx + Math.cos(angles[i]) * r * v, cy + Math.sin(angles[i]) * r * v];
    });
    const path = points.map((p,i) => `${i===0?'M':'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') + ' Z';
    const grid = points.map((_, i) => {
      const x = cx + Math.cos(angles[i]) * r;
      const y = cy + Math.sin(angles[i]) * r;
      return [x, y];
    });
    const gridPath = grid.map((p,i) => `${i===0?'M':'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') + ' Z';
    return (
      <svg width={size} height={size} style={{ display: "block" }}>
        <path d={gridPath} fill="none" stroke="var(--border)" strokeWidth={0.7} />
        <path d={path} fill="var(--cyan)" opacity={0.3} stroke="var(--cyan)" strokeWidth={1} />
      </svg>
    );
  };

  const onRowClick = (slug, label) => setDrilldown({ type: 'conta', value: slug, label });
  const medal = (i) => i === 0 ? "🥇" : (i === 1 ? "🥈" : (i === 2 ? "🥉" : ""));

  const fmtPct = (n) => (n||0).toFixed(1).replace(".",",")+"%";

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <h1>Scorecard de Qualidade · {REF_YEAR}</h1>
          <div className="status-line">
            5 pilares percentilizados (margem · crescimento · estabilidade · eficiência · cobertura) — score 0–100. Lojas com fundamentos consistentes valem múltiplo.
          </div>
        </div>
      </div>

      <div className="kpi-row">
        <KpiTile tone="cyan"  label="Score médio do grupo" value={avg.toFixed(0)} hint={`Mediana: ${median.toFixed(0)}`} nonMonetary />
        <KpiTile tone="green" label="Melhor loja"          value={top1 ? top1.total.toFixed(0) : "—"} hint={top1?.label || ""} nonMonetary />
        <KpiTile tone="red"   label="Pior loja"            value={bottom1 ? bottom1.total.toFixed(0) : "—"} hint={bottom1?.label || ""} nonMonetary />
        <KpiTile tone="amber" label="Pilar mais frágil"    value={(() => {
          if (!scored.length) return "—";
          const sums = { margem: 0, slope: 0, stab: 0, eff: 0, cob: 0 };
          for (const r of scored) { sums.margem += r.s_margem; sums.slope += r.s_slope; sums.stab += r.s_stab; sums.eff += r.s_eff; sums.cob += r.s_cob; }
          const labels = { margem: "Margem", slope: "Crescimento", stab: "Estabilidade", eff: "Eficiência", cob: "Cobertura" };
          const min = Object.entries(sums).sort((a,b)=>a[1]-b[1])[0];
          return labels[min[0]];
        })()} nonMonetary hint="Onde a carteira tem mais fragilidade média" />
      </div>

      <div className="card">
        <h2 className="card-title">Ranking — melhores fundamentos primeiro</h2>
        <div className="t-scroll" style={{ overflowX: "auto" }}>
          <table className="t" style={{ minWidth: 980 }}>
            <thead>
              <tr>
                <th>#</th><th>Empresa</th>
                <th className="num" title="Margem líquida % (0-20)">Marg</th>
                <th className="num" title="Slope receita mensal (0-20)">Cresc</th>
                <th className="num" title="1 - CV mensal de receita (0-20)">Estab</th>
                <th className="num" title="Líquido / saídas (0-20)">Efic</th>
                <th className="num" title="Líquido real / orçado (0-20)">Cobert</th>
                <th className="num">Score</th>
                <th>Perfil</th>
              </tr>
            </thead>
            <tbody>
              {scored.map((r, i) => {
                const tone = r.total >= 70 ? "var(--green)" : r.total >= 40 ? "var(--cyan)" : r.total >= 20 ? "var(--amber)" : "var(--red)";
                return (
                  <tr key={r.slug} onClick={() => onRowClick(r.slug, r.label)} style={{ cursor: "pointer" }}>
                    <td><b>{i+1}</b> <span style={{ fontSize: 14 }}>{medal(i)}</span></td>
                    <td><b>{r.label}</b><div style={{ fontSize: 10, color: "var(--fg-3)" }}>{r.marca} · {r.canal}</div></td>
                    <td className="num">{r.s_margem.toFixed(1)}</td>
                    <td className="num">{r.s_slope.toFixed(1)}</td>
                    <td className="num">{r.s_stab.toFixed(1)}</td>
                    <td className="num">{r.s_eff.toFixed(1)}</td>
                    <td className="num">{r.s_cob.toFixed(1)}</td>
                    <td className="num" style={{ color: tone, fontWeight: 700, fontSize: 16 }}>{r.total.toFixed(0)}</td>
                    <td><Radar pillars={[r.s_margem, r.s_slope, r.s_stab, r.s_eff, r.s_cob]} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="row" style={{ gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card">
          <h2 className="card-title" style={{ color: "var(--green)" }}>Top 5 — Buffett compraria</h2>
          <ul className="report-list">
            {scored.slice(0,5).map((r,i) => (
              <li key={r.slug} onClick={() => onRowClick(r.slug, r.label)} style={{ cursor: "pointer" }}>
                <span>{medal(i)} <b>{r.label}</b><div style={{ fontSize: 10, color: "var(--fg-3)" }}>margem {fmtPct(r.margem)} · crescimento {fmtPct(r.slope)}</div></span>
                <b style={{ color: "var(--green)" }}>{r.total.toFixed(0)}</b>
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h2 className="card-title" style={{ color: "var(--red)" }}>Bottom 5 — candidatas a turnaround / fechamento</h2>
          <ul className="report-list">
            {scored.slice(-5).reverse().map(r => (
              <li key={r.slug} onClick={() => onRowClick(r.slug, r.label)} style={{ cursor: "pointer" }}>
                <span><b>{r.label}</b><div style={{ fontSize: 10, color: "var(--fg-3)" }}>margem {fmtPct(r.margem)} · líquido {fmtCompact(r.liquido)}</div></span>
                <b style={{ color: "var(--red)" }}>{r.total.toFixed(0)}</b>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { PageScorecard });
