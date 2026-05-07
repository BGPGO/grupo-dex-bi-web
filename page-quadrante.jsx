/* PageQuadrante — Matriz Estratégica BCG (Crescimento × Margem)
 *
 * Eixo X = crescimento receita (slope %, clamp -20% a +20%)
 * Eixo Y = margem líquida YTD (clamp -100% a +50%)
 * Bolha  = receita absoluta (sqrt scaling)
 * Cor    = marca
 *
 * Quadrantes: Stars / Cash Cows / Question Marks / Dogs
 */

const PageQuadrante = ({ statusFilter, drilldown, setDrilldown, year, month }) => {
  const REF_YEAR = window.REF_YEAR || new Date().getFullYear();
  const rows = useMemo(() => window.buildLojasRows ? window.buildLojasRows() : [], []);
  const dataPlot = rows.filter(r => r.monthsActive > 0);

  const W = 720, H = 460, ml = 60, mr = 20, mt = 30, mb = 40;
  const cw = W - ml - mr, ch = H - mt - mb;
  const xMin = -20, xMax = 20;
  const yMin = -100, yMax = 50;
  const x = (v) => ml + ((Math.max(xMin, Math.min(xMax, v)) - xMin) / (xMax - xMin)) * cw;
  const y = (v) => mt + ch - ((Math.max(yMin, Math.min(yMax, v)) - yMin) / (yMax - yMin)) * ch;
  const x0 = x(0), y0 = y(0);

  const maxRec = Math.max(...dataPlot.map(d => d.receita), 1);
  const r = (v) => 6 + Math.sqrt(v / maxRec) * 24;

  // Classificação
  const classify = (d) => {
    if (d.slope >= 0 && d.margem >= 0) return "star";
    if (d.slope < 0 && d.margem >= 0) return "cow";
    if (d.slope >= 0 && d.margem < 0) return "question";
    return "dog";
  };
  const groups = { star: [], cow: [], question: [], dog: [] };
  for (const d of dataPlot) groups[classify(d)].push(d);

  const QInfo = {
    star:     { emoji: "⭐", label: "Stars", color: "var(--green)", action: "Investir mais — alocar capex de expansão" },
    cow:      { emoji: "💰", label: "Cash Cows", color: "var(--cyan)",  action: "Ordenhar — distribuir lucro pra holding/dividendos" },
    question: { emoji: "❓", label: "Question Marks", color: "var(--amber)", action: "Turnaround 90 dias — meta de margem positiva" },
    dog:      { emoji: "🐕", label: "Dogs", color: "var(--red)", action: "Candidata a fechamento ou venda" },
  };

  const onClick = (d) => setDrilldown({ type: 'conta', value: d.slug, label: d.label });

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <h1>Matriz Estratégica · {REF_YEAR}</h1>
          <div className="status-line">
            Crescimento receita × margem líquida. Bolha = receita absoluta. Cor = marca. Click numa loja pra filtrar todo o BI.
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ width: "100%", maxWidth: W }}>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ display: "block", width: "100%", height: "auto" }}>
            {/* Quadrantes (fundo) */}
            <rect x={x0} y={mt} width={W-mr-x0} height={y0-mt} fill="var(--green)" opacity={0.04} />
            <rect x={ml} y={mt} width={x0-ml} height={y0-mt} fill="var(--cyan)" opacity={0.04} />
            <rect x={x0} y={y0} width={W-mr-x0} height={mt+ch-y0} fill="var(--amber)" opacity={0.04} />
            <rect x={ml} y={y0} width={x0-ml} height={mt+ch-y0} fill="var(--red)" opacity={0.04} />
            {/* Grid */}
            {[-20, -10, 0, 10, 20].map(v => (
              <g key={"x"+v}>
                <line x1={x(v)} y1={mt} x2={x(v)} y2={mt+ch} stroke="var(--border)" strokeDasharray={v===0?"":"2,3"} strokeWidth={v===0?1.5:0.7} />
                <text x={x(v)} y={H-15} textAnchor="middle" fontSize="10" fill="var(--fg-3)">{v}%</text>
              </g>
            ))}
            {[-100, -50, 0, 25, 50].map(v => (
              <g key={"y"+v}>
                <line x1={ml} y1={y(v)} x2={W-mr} y2={y(v)} stroke="var(--border)" strokeDasharray={v===0?"":"2,3"} strokeWidth={v===0?1.5:0.7} />
                <text x={ml-5} y={y(v)+3} textAnchor="end" fontSize="10" fill="var(--fg-3)">{v}%</text>
              </g>
            ))}
            {/* Labels de quadrante */}
            <text x={x0+8} y={mt+18} fontSize="12" fontWeight="700" fill="var(--green)">⭐ Stars</text>
            <text x={x0-8} y={mt+18} textAnchor="end" fontSize="12" fontWeight="700" fill="var(--cyan)">💰 Cash Cows</text>
            <text x={x0+8} y={mt+ch-6} fontSize="12" fontWeight="700" fill="var(--amber)">❓ Question</text>
            <text x={x0-8} y={mt+ch-6} textAnchor="end" fontSize="12" fontWeight="700" fill="var(--red)">🐕 Dogs</text>
            {/* Eixos */}
            <text x={W/2} y={H-2} textAnchor="middle" fontSize="11" fill="var(--fg-2)" fontWeight="600">Crescimento da receita →</text>
            <text x={12} y={H/2} textAnchor="middle" fontSize="11" fill="var(--fg-2)" fontWeight="600" transform={`rotate(-90 12 ${H/2})`}>Margem líquida %</text>
            {/* Bolhas */}
            {dataPlot.map((d,i) => {
              const cx = x(d.slope), cy = y(d.margem);
              const color = window.colorForMarca ? window.colorForMarca(d.marca) : "#22d3ee";
              return (
                <g key={d.slug} onClick={() => onClick(d)} style={{ cursor: "pointer" }}>
                  <circle cx={cx} cy={cy} r={r(d.receita)} fill={color} opacity={0.55} stroke={color} strokeWidth={1.5} />
                  <title>{`${d.label}\nReceita: ${fmtCompact(d.receita)}\nMargem: ${d.margem.toFixed(1)}%\nCrescimento: ${d.slope.toFixed(1)}%`}</title>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* 4 quadrantes em 2x2 com lojas listadas */}
      <div className="row" style={{ gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {["star","cow","question","dog"].map(k => {
          const info = QInfo[k];
          const list = groups[k].sort((a,b) => b.receita - a.receita);
          return (
            <div key={k} className="card">
              <h2 className="card-title" style={{ color: info.color }}>{info.emoji} {info.label} ({list.length})</h2>
              <div style={{ fontSize: 11, color: "var(--fg-3)", marginBottom: 8 }}>{info.action}</div>
              {list.length === 0 ? (
                <div style={{ color: "var(--fg-3)", fontSize: 12 }}>Nenhuma loja neste quadrante</div>
              ) : (
                <ul className="report-list">
                  {list.slice(0,8).map(d => (
                    <li key={d.slug} onClick={() => setDrilldown({type:'conta', value:d.slug, label:d.label})} style={{ cursor: "pointer" }}>
                      <span><b>{d.label}</b><div style={{ fontSize: 10, color: "var(--fg-3)" }}>{d.marca} · {d.canal}</div></span>
                      <span style={{ fontSize: 11 }}>{d.margem.toFixed(0)}% · {d.slope.toFixed(0)}% gr · {fmtCompact(d.receita)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

Object.assign(window, { PageQuadrante });
