/* PageTese v2 — Raio-X Estatístico do GRUPO sobre as Empresas
 *
 * Análise por SETOR (4 grupos de negócio), não por loja individual.
 * Usa ALL_TX completo (todos os meses realizados, não só REF_YEAR).
 * Termina com lista NOMINAL: vender X/Y/Z + investir em A/B/C.
 *
 * 4 setores:
 *   Food Delivery (Domino's + Spoleto + Boali) — 15 lojas
 *   Aeroporto Premium (Bauducco + Bolo de Rolo + Natuzon + Nobel) — 5 lojas
 *   Óptica (Optcália + Oculum) — 5 lojas
 *   Outros (Luigi) — 1 loja
 */

const _stats = {
  mean: (a) => a.length ? a.reduce((s,x) => s+x, 0) / a.length : 0,
  stdev: (a) => {
    if (a.length < 2) return 0;
    const m = _stats.mean(a);
    return Math.sqrt(a.reduce((s,x) => s + (x-m)**2, 0) / (a.length - 1));
  },
  cv: (a) => {
    const m = _stats.mean(a);
    return Math.abs(m) < 1e-9 ? 0 : _stats.stdev(a) / Math.abs(m);
  },
  linreg: (xs, ys) => {
    const n = xs.length;
    if (n < 2) return { slope: 0, intercept: 0, r2: 0, se: 0 };
    const mx = _stats.mean(xs), my = _stats.mean(ys);
    let sxx = 0, sxy = 0, syy = 0;
    for (let i = 0; i < n; i++) {
      sxx += (xs[i] - mx) ** 2;
      sxy += (xs[i] - mx) * (ys[i] - my);
      syy += (ys[i] - my) ** 2;
    }
    const slope = sxx > 0 ? sxy / sxx : 0;
    const intercept = my - slope * mx;
    const r2 = (sxx > 0 && syy > 0) ? (sxy ** 2) / (sxx * syy) : 0;
    let sse = 0;
    for (let i = 0; i < n; i++) sse += (ys[i] - (intercept + slope * xs[i])) ** 2;
    const sigma = n > 2 ? Math.sqrt(sse / (n - 2)) : 0;
    const se = sxx > 0 ? sigma / Math.sqrt(sxx) : 0;
    return { slope, intercept, r2, se, sigma };
  },
  corr: (xs, ys) => {
    const n = Math.min(xs.length, ys.length);
    if (n < 2) return 0;
    const mx = _stats.mean(xs.slice(0,n)), my = _stats.mean(ys.slice(0,n));
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - mx) * (ys[i] - my);
      dx += (xs[i] - mx) ** 2;
      dy += (ys[i] - my) ** 2;
    }
    const d = Math.sqrt(dx * dy);
    return d > 0 ? num / d : 0;
  },
  quantile: (a, q) => {
    if (!a.length) return 0;
    const s = a.slice().sort((x,y) => x-y);
    const idx = q * (s.length - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return lo === hi ? s[lo] : s[lo] * (hi - idx) + s[hi] * (idx - lo);
  },
};

// ===== Spaghetti + fan chart Monte Carlo =====
const SpaghettiFanChart = ({ forecast, color = "var(--cyan)", height = 280, compact = false }) => {
  if (!forecast || !forecast.byMonth || !forecast.byMonth.length) return null;
  const W = 760, ml = compact ? 36 : 56, mr = 12, mt = 12, mb = compact ? 22 : 30;
  const cw = W - ml - mr, ch = height - mt - mb;
  const trajs = forecast.trajs || [];
  const months = forecast.byMonth;
  const allVals = [
    ...trajs.flatMap(t => t),
    ...months.flatMap(m => [m.p05, m.p95]),
  ].filter(v => v != null && Number.isFinite(v));
  const minV = Math.min(0, ...allVals);
  const maxV = Math.max(...allVals);
  const range = (maxV - minV) || 1;
  const x = (i) => ml + ((i+1) / 12) * cw;
  const y = (v) => mt + ch - ((v - minV) / range) * ch;
  // Anchor 0 = ponto atual (lastValue)
  const x0 = ml;
  const y0 = forecast.lastValue != null ? y(forecast.lastValue) : null;

  const fmtTickLocal = (v) => {
    const a = Math.abs(v);
    if (a >= 1e6) return (v/1e6).toFixed(1).replace(".",",")+"M";
    if (a >= 1e3) return (v/1e3).toFixed(0)+"k";
    return Math.round(v).toString();
  };

  // Banda P5-P95 (mais larga)
  const bandPath95 = months.map((m,i) => `${i===0?'M':'L'}${x(i).toFixed(1)},${y(m.p95).toFixed(1)}`).join(' ')
    + ' ' + months.slice().reverse().map((m,i) => `L${x(months.length-1-i).toFixed(1)},${y(m.p05).toFixed(1)}`).join(' ') + ' Z';
  // Banda P25-P75
  const bandPath50 = months.map((m,i) => `${i===0?'M':'L'}${x(i).toFixed(1)},${y(m.p75).toFixed(1)}`).join(' ')
    + ' ' + months.slice().reverse().map((m,i) => `L${x(months.length-1-i).toFixed(1)},${y(m.p25).toFixed(1)}`).join(' ') + ' Z';
  // Mediana
  const medPath = months.map((m,i) => `${i===0?'M':'L'}${x(i).toFixed(1)},${y(m.p50).toFixed(1)}`).join(' ');

  // Anchors no ponto inicial
  const wrapPath = (path) => y0 != null ? `M${x0},${y0} L${x(0)},${y(months[0].p50)}` : "";

  return (
    <div style={{ width: "100%", maxWidth: W, position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${height}`} style={{ display: "block", width: "100%", height: "auto" }}>
        <defs>
          <linearGradient id={`grad-${color.replace(/[^a-z]/gi,'')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        {/* Grid */}
        {[0, 0.25, 0.5, 0.75, 1].map(p => {
          const v = minV + p * range;
          const yy = y(v);
          return (
            <g key={p}>
              <line x1={ml} y1={yy} x2={W-mr} y2={yy} stroke="var(--border)" strokeDasharray="3,3" />
              {!compact && <text x={ml-5} y={yy+3} textAnchor="end" fontSize="10" fill="var(--fg-3)">{fmtTickLocal(v)}</text>}
            </g>
          );
        })}
        {/* Spaghetti — trajetórias finas */}
        {trajs.map((t,i) => {
          const path = (y0 != null ? `M${x0},${y0} ` : `M${x(0)},${y(t[0])} `)
            + t.map((v,j) => `${j===0 && y0 == null ? '' : 'L'}${x(j).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
          return <path key={i} d={path} fill="none" stroke={color} strokeWidth={0.5} opacity={0.08} />;
        })}
        {/* Banda P5-P95 */}
        <path d={bandPath95} fill={color} opacity={0.10} />
        {/* Banda P25-P75 */}
        <path d={bandPath50} fill={color} opacity={0.18} />
        {/* Mediana */}
        <path d={medPath} fill="none" stroke={color} strokeWidth={2.5} />
        {/* Linha de conexão do passado */}
        {y0 != null && (
          <>
            <line x1={x0} y1={y0} x2={x(0)} y2={y(months[0].p50)} stroke={color} strokeWidth={2.5} strokeDasharray="3,3" opacity={0.6} />
            <circle cx={x0} cy={y0} r={4} fill={color} stroke="var(--bg)" strokeWidth={2} />
            {!compact && <text x={x0} y={y0-8} fontSize="10" fill={color} fontWeight="700" textAnchor="start">hoje</text>}
          </>
        )}
        {/* Pontos da mediana */}
        {months.map((m,i) => (
          <circle key={i} cx={x(i)} cy={y(m.p50)} r={2.5} fill={color} />
        ))}
        {/* Eixo x */}
        {!compact && months.map((m,i) => i % 2 === 0 ? (
          <text key={"l"+i} x={x(i)} y={height-8} textAnchor="middle" fontSize="10" fill="var(--fg-3)">+{m.h}m</text>
        ) : null)}
        {/* Marcador final P50 */}
        {(() => {
          const last = months[months.length-1];
          return (
            <g>
              <circle cx={x(months.length-1)} cy={y(last.p50)} r={5} fill={color} stroke="var(--bg)" strokeWidth={2} />
              {!compact && (
                <>
                  <text x={x(months.length-1)-8} y={y(last.p50)-10} fontSize="11" fontWeight="700" textAnchor="end" fill={color}>
                    P50: {fmtTickLocal(last.p50)}
                  </text>
                  <text x={x(months.length-1)-8} y={y(last.p95)+12} fontSize="9" textAnchor="end" fill={color} opacity={0.7}>
                    P95: {fmtTickLocal(last.p95)}
                  </text>
                  <text x={x(months.length-1)-8} y={y(last.p05)-2} fontSize="9" textAnchor="end" fill={color} opacity={0.7}>
                    P5: {fmtTickLocal(last.p05)}
                  </text>
                </>
              )}
            </g>
          );
        })()}
      </svg>
      {!compact && (
        <div style={{ display: "flex", justifyContent: "center", gap: 18, fontSize: 11, color: "var(--fg-2)", marginTop: 4, flexWrap: "wrap" }}>
          <span><span style={{ display: "inline-block", width: 14, height: 0.5, background: color, opacity: 0.3, verticalAlign: "middle", marginRight: 5, borderTop: "1px solid "+color }} />500 trajetórias</span>
          <span><span style={{ display: "inline-block", width: 14, height: 8, background: color, opacity: 0.18, verticalAlign: "middle", marginRight: 5, borderRadius: 2 }} />Banda 50% (P25-P75)</span>
          <span><span style={{ display: "inline-block", width: 14, height: 8, background: color, opacity: 0.10, verticalAlign: "middle", marginRight: 5, borderRadius: 2 }} />Banda 90% (P5-P95)</span>
          <span><span style={{ display: "inline-block", width: 14, height: 2.5, background: color, verticalAlign: "middle", marginRight: 5 }} />Mediana</span>
        </div>
      )}
    </div>
  );
};

// ===== Histograma da distribuição anual =====
const HistogramChart = ({ values, height = 200, color = "var(--cyan)" }) => {
  if (!values || values.length === 0) return null;
  const W = 360, ml = 40, mr = 12, mt = 12, mb = 30;
  const cw = W - ml - mr, ch = height - mt - mb;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const N_BINS = 24;
  const binW = (max - min) / N_BINS || 1;
  const bins = Array(N_BINS).fill(0);
  for (const v of values) {
    const idx = Math.min(N_BINS - 1, Math.floor((v - min) / binW));
    bins[idx]++;
  }
  const maxCount = Math.max(...bins);
  const x = (i) => ml + (i / N_BINS) * cw;
  const y = (c) => mt + ch - (c / Math.max(1, maxCount)) * ch;
  const p50 = _stats.quantile(values, 0.5);
  const p05 = _stats.quantile(values, 0.05);
  const p95 = _stats.quantile(values, 0.95);
  const xVal = (v) => ml + ((v - min) / Math.max(1, max - min)) * cw;
  const fmtTickLocal = (v) => {
    const a = Math.abs(v);
    if (a >= 1e6) return (v/1e6).toFixed(1).replace(".",",")+"M";
    if (a >= 1e3) return (v/1e3).toFixed(0)+"k";
    return Math.round(v).toString();
  };
  return (
    <svg viewBox={`0 0 ${W} ${height}`} style={{ display: "block", width: "100%", height: "auto" }}>
      {/* Bins */}
      {bins.map((c,i) => (
        <rect key={i} x={x(i)+1} y={y(c)} width={cw/N_BINS - 1.5}
          height={Math.max(0, mt+ch - y(c))} fill={color} opacity={0.7} rx={1} />
      ))}
      {/* P5 */}
      <line x1={xVal(p05)} y1={mt} x2={xVal(p05)} y2={mt+ch} stroke="var(--red)" strokeWidth={1} strokeDasharray="3,2" />
      <text x={xVal(p05)} y={mt-2} fontSize="9" fill="var(--red)" textAnchor="middle">P5</text>
      {/* P50 */}
      <line x1={xVal(p50)} y1={mt} x2={xVal(p50)} y2={mt+ch} stroke="var(--cyan)" strokeWidth={2} />
      <text x={xVal(p50)} y={mt-2} fontSize="10" fill="var(--cyan)" textAnchor="middle" fontWeight="700">mediana</text>
      {/* P95 */}
      <line x1={xVal(p95)} y1={mt} x2={xVal(p95)} y2={mt+ch} stroke="var(--green)" strokeWidth={1} strokeDasharray="3,2" />
      <text x={xVal(p95)} y={mt-2} fontSize="9" fill="var(--green)" textAnchor="middle">P95</text>
      {/* Eixo x */}
      <text x={ml} y={height-8} fontSize="10" fill="var(--fg-3)">{fmtTickLocal(min)}</text>
      <text x={W-mr} y={height-8} fontSize="10" fill="var(--fg-3)" textAnchor="end">{fmtTickLocal(max)}</text>
      <text x={W/2} y={height-8} fontSize="10" fill="var(--fg-3)" textAnchor="middle">receita anual projetada</text>
    </svg>
  );
};

// ===== Card de seção com narrativa =====
const TeseSecao = ({ numero, titulo, subtitulo, children, insight, pergunta }) => (
  <div className="card" style={{ marginBottom: 24, padding: 28 }}>
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
      <span style={{ fontSize: 12, color: "var(--cyan)", fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase" }}>§{String(numero).padStart(2, "0")}</span>
      <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>{titulo}</h2>
    </div>
    {subtitulo && <p style={{ color: "var(--fg-2)", fontSize: 13, marginBottom: 18, lineHeight: 1.5 }}>{subtitulo}</p>}
    <div style={{ marginTop: 16 }}>{children}</div>
    {insight && (
      <div style={{ marginTop: 18, padding: "14px 18px", borderLeft: "3px solid var(--cyan)", background: "rgba(34,211,238,0.06)", fontSize: 14, lineHeight: 1.6 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--cyan)", letterSpacing: "0.15em", marginBottom: 4 }}>INSIGHT</div>
        {insight}
      </div>
    )}
    {pergunta && (
      <div style={{ marginTop: 12, padding: "12px 18px", borderLeft: "3px solid var(--amber)", background: "rgba(251,191,36,0.05)", fontSize: 13, lineHeight: 1.5, fontStyle: "italic", color: "var(--fg-2)" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--amber)", letterSpacing: "0.15em", marginBottom: 4, fontStyle: "normal" }}>↓ PRÓXIMA QUESTÃO</div>
        {pergunta}
      </div>
    )}
  </div>
);

const SETORES_ORD = ["Food Delivery", "Aeroporto Premium", "Óptica"];

const PageTese = ({ statusFilter, drilldown, setDrilldown, year, month }) => {
  const REF_YEAR = window.REF_YEAR || new Date().getFullYear();
  const ALL_TX = window.ALL_TX || [];
  const B = window.BIT || {};
  const CONTAS = B.CONTAS || [];
  const DBC = B.DRE_BY_CONTA || {};

  // ===== Macro BCB API =====
  const [macro, setMacro] = useState(null);
  useEffect(() => {
    const series = [
      { id: 433, name: "IPCA" },
      { id: 24364, name: "IBC-Br" },
    ];
    Promise.all(series.map(s =>
      fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${s.id}/dados?formato=json&dataInicial=01/05/2024`)
        .then(r => r.ok ? r.json() : Promise.reject(r.status))
        .then(data => ({ name: s.name, data: (data||[]).map(d => ({ data: d.data, valor: parseFloat(d.valor) })) }))
        .catch(() => ({ name: s.name, data: [] }))
    )).then(results => {
      setMacro(Object.fromEntries(results.map(r => [r.name, r.data])));
    });
  }, []);

  // ===== Mapeamento loja → setor =====
  const lojaSetor = useMemo(() => {
    const m = {};
    for (const c of CONTAS) m[c.slug] = window.inferSetor ? window.inferSetor(c.label) : "Outros";
    return m;
  }, [CONTAS]);

  // ===== ALL_TX agregado por (setor × mês × kind) — usando todos os meses realizados =====
  const setorMes = useMemo(() => {
    const out = {};   // setor → { months: Set, recByMes: Map<mes, val>, despByMes: Map<mes, val> }
    for (const sec of SETORES_ORD) out[sec] = { months: new Set(), recByMes: new Map(), despByMes: new Map() };
    for (const r of ALL_TX) {
      if (r[6] !== 1) continue;        // só realizado
      const mes = r[1];
      if (!mes) continue;
      const slug = r[9];
      const sec = lojaSetor[slug] || "Outros";
      const o = out[sec];
      o.months.add(mes);
      if (r[0] === 'r') o.recByMes.set(mes, (o.recByMes.get(mes)||0) + r[5]);
      else              o.despByMes.set(mes, (o.despByMes.get(mes)||0) + r[5]);
    }
    // Para cada setor, alinha sequência de meses (desde o mais antigo até o mais recente real)
    const result = {};
    for (const sec of SETORES_ORD) {
      const o = out[sec];
      const months = [...o.months].sort();
      const rec = months.map(m => o.recByMes.get(m) || 0);
      const desp = months.map(m => o.despByMes.get(m) || 0);
      const liq = rec.map((v,i) => v - desp[i]);
      result[sec] = { months, rec, desp, liq };
    }
    return result;
  }, [ALL_TX, lojaSetor]);

  // ===== Estatísticas por setor =====
  const setorStats = useMemo(() => {
    const out = {};
    for (const sec of SETORES_ORD) {
      const d = setorMes[sec];
      if (!d || d.months.length < 2) {
        out[sec] = { hasData: false };
        continue;
      }
      const xs = d.rec.map((_,i) => i);
      const reg = _stats.linreg(xs, d.rec);
      const meanR = _stats.mean(d.rec);
      const slopePct = meanR > 0 ? (reg.slope / meanR) * 100 : 0;
      const sePct = meanR > 0 ? (reg.se / meanR) * 100 : 0;
      const ciLo = slopePct - 1.96 * sePct;
      const ciHi = slopePct + 1.96 * sePct;
      const significant = ciLo > 0 || ciHi < 0;
      // Sazonalidade: média do detrended por mês calendário
      const trendVals = d.rec.map((_,i) => reg.intercept + reg.slope * i);
      const detrended = d.rec.map((v,i) => v - trendVals[i]);
      const monthOfYear = d.months.map(m => parseInt(m.slice(5,7), 10) - 1);
      const seasSum = Array(12).fill(0), seasCnt = Array(12).fill(0);
      for (let i = 0; i < d.rec.length; i++) {
        seasSum[monthOfYear[i]] += detrended[i];
        seasCnt[monthOfYear[i]]++;
      }
      const seasonal12 = seasSum.map((s,i) => seasCnt[i] > 0 ? s / seasCnt[i] : 0);
      const noise = d.rec.map((v,i) => v - trendVals[i] - (seasonal12[monthOfYear[i]] || 0));
      // Lojas no setor + receita YTD do setor
      const lojasNoSetor = (CONTAS || []).filter(c => lojaSetor[c.slug] === sec);
      const totalRec = d.rec.reduce((s,v) => s+v, 0);
      const totalLiq = d.liq.reduce((s,v) => s+v, 0);
      const margem = totalRec > 0 ? (totalLiq / totalRec) * 100 : 0;
      // Ramp-up: razão receita do último terço vs primeiro terço
      const n = d.rec.length;
      let ramp = 1;
      if (n >= 6) {
        const tt = Math.floor(n / 3);
        const r1 = _stats.mean(d.rec.slice(0, tt));
        const r3 = _stats.mean(d.rec.slice(-tt));
        ramp = r1 > 0 ? r3 / r1 : 1;
      }
      out[sec] = {
        hasData: true, n, months: d.months, rec: d.rec, desp: d.desp, liq: d.liq,
        meanR, stdR: _stats.stdev(d.rec), cv: _stats.cv(d.rec),
        slopePct, sePct, ciLo, ciHi, significant, r2: reg.r2,
        seasonal12, trendVals, noise,
        lojas: lojasNoSetor, qtdLojas: lojasNoSetor.length,
        totalRec, totalLiq, margem, ramp,
        sharpe: _stats.stdev(d.liq) > 0 ? _stats.mean(d.liq) / _stats.stdev(d.liq) : 0,
      };
    }
    return out;
  }, [setorMes, CONTAS, lojaSetor]);

  // ===== Estatística por loja (pra veredito final) =====
  const lojaStats = useMemo(() => {
    return (CONTAS || []).map(c => {
      const sec = lojaSetor[c.slug];
      // Pega receita mensal da loja a partir de ALL_TX (não só MONTH_DRE 2026)
      const recByMes = new Map(), despByMes = new Map();
      for (const r of ALL_TX) {
        if (r[6] !== 1 || r[9] !== c.slug) continue;
        const m = r[1]; if (!m) continue;
        if (r[0] === 'r') recByMes.set(m, (recByMes.get(m)||0) + r[5]);
        else despByMes.set(m, (despByMes.get(m)||0) + r[5]);
      }
      const months = [...new Set([...recByMes.keys(), ...despByMes.keys()])].sort();
      if (months.length < 2) return null;
      const rec = months.map(m => recByMes.get(m) || 0);
      const desp = months.map(m => despByMes.get(m) || 0);
      const liq = rec.map((v,i) => v - desp[i]);
      const xs = months.map((_,i) => i);
      const reg = _stats.linreg(xs, rec);
      const meanR = _stats.mean(rec);
      const slopePct = meanR > 0 ? (reg.slope / meanR) * 100 : 0;
      const sePct = meanR > 0 ? (reg.se / meanR) * 100 : 0;
      const ciLo = slopePct - 1.96 * sePct;
      const ciHi = slopePct + 1.96 * sePct;
      const significant = ciLo > 0 || ciHi < 0;
      const totalRec = rec.reduce((a,b)=>a+b, 0);
      const totalLiq = liq.reduce((a,b)=>a+b, 0);
      const margem = totalRec > 0 ? (totalLiq / totalRec) * 100 : 0;
      const sharpe = _stats.stdev(liq) > 0 ? _stats.mean(liq) / _stats.stdev(liq) : 0;
      let ramp = 1;
      if (months.length >= 6) {
        const tt = Math.floor(months.length / 3);
        const r1 = _stats.mean(rec.slice(0, tt));
        const r3 = _stats.mean(rec.slice(-tt));
        ramp = r1 > 0 ? r3 / r1 : 1;
      }
      return {
        slug: c.slug, label: c.label, setor: sec,
        n: months.length, meanR, totalRec, totalLiq, margem, slopePct, ciLo, ciHi, significant,
        sharpe, ramp, cv: _stats.cv(rec),
      };
    }).filter(Boolean);
  }, [CONTAS, ALL_TX, lojaSetor]);

  // ===== Vereditos: 3 categorias mutuamente exclusivas =====
  //   VENDER: prejuízo + queda + Sharpe ruim
  //   VACA LEITEIRA: lucrativa + estável (slope baixo) + Sharpe positivo
  //   INVESTIR: lucrativa + crescendo + ramp positivo
  const vereditos = useMemo(() => {
    if (!lojaStats.length) return { vender: [], vacas: [], investir: [] };
    const enriched = lojaStats.map(p => {
      let scV = 0, scI = 0, scK = 0;
      // === VENDER ===
      if (p.significant && p.slopePct < 0) scV += 30;
      if (p.margem < 0) scV += Math.min(30, -p.margem);
      if (p.sharpe < 0) scV += Math.min(20, -p.sharpe * 10);
      if (p.ramp < 0.7) scV += 20;
      if (p.cv > 0.5) scV += 5;

      // === INVESTIR (Estrela: cresce + lucrativa) ===
      if (p.significant && p.slopePct > 5) scI += 30;
      if (p.margem > 5) scI += Math.min(30, p.margem);
      if (p.sharpe > 0.3) scI += Math.min(30, p.sharpe * 10);
      if (p.ramp > 1.3) scI += 20;
      if (p.cv > 0.5) scI -= 5;

      // === VACA LEITEIRA (Cash Cow: lucra mas cresce pouco) ===
      // - margem > 5 (saudável)
      // - sharpe > 0.3 (consistência)
      // - slope baixo absoluto (|slope| < 5%) — não cresce nem cai significativamente
      // - ramp próximo de 1 (estabilidade) — entre 0.85 e 1.15
      if (p.margem > 5) scK += Math.min(30, p.margem);
      if (p.sharpe > 0.3) scK += Math.min(20, p.sharpe * 10);
      if (Math.abs(p.slopePct) < 5) scK += 20;     // estável
      if (p.ramp >= 0.85 && p.ramp <= 1.15) scK += 15;  // não acelera nem cai
      // Bônus se IC do slope contém zero (genuinamente estável)
      if (!p.significant && p.margem > 0) scK += 10;
      // Penalidade se está em queda significativa
      if (p.significant && p.slopePct < 0) scK -= 30;
      if (p.margem < 0) scK -= 50;

      return { ...p, scoreVender: scV, scoreInvestir: scI, scoreVaca: scK };
    });

    // Atribuição mutuamente exclusiva: cada loja entra na categoria de MAIOR score
    // (com mínimos de qualificação)
    const candidates = enriched.map(p => {
      const max = Math.max(p.scoreVender, p.scoreInvestir, p.scoreVaca);
      let cat = null;
      if (p.scoreVender >= 30 && p.scoreVender === max) cat = "vender";
      else if (p.scoreInvestir >= 25 && p.scoreInvestir === max) cat = "investir";
      else if (p.scoreVaca >= 35 && p.scoreVaca === max) cat = "vaca";
      return { ...p, _cat: cat };
    });

    return {
      vender: candidates.filter(p => p._cat === "vender")
        .sort((a,b) => b.scoreVender - a.scoreVender).slice(0, 6),
      vacas: candidates.filter(p => p._cat === "vaca")
        .sort((a,b) => b.scoreVaca - a.scoreVaca).slice(0, 6),
      investir: candidates.filter(p => p._cat === "investir")
        .sort((a,b) => b.scoreInvestir - a.scoreInvestir).slice(0, 6),
    };
  }, [lojaStats]);

  // ===== Forecast Monte Carlo por setor (12 meses) — guarda TRAJETÓRIAS COMPLETAS =====
  const forecastSetor = useMemo(() => {
    const out = {};
    const N_SIMS = 500;
    for (const sec of SETORES_ORD) {
      const s = setorStats[sec];
      if (!s || !s.hasData || s.n < 4) { out[sec] = null; continue; }
      const last = s.n - 1;
      const trendLast = s.trendVals[last];
      const noiseStd = _stats.stdev(s.noise);
      const slopeAbs = s.slopePct/100 * s.meanR;
      const trajs = [];
      const annual = [];
      for (let k = 0; k < N_SIMS; k++) {
        const traj = [];
        let total = 0;
        for (let h = 1; h <= 12; h++) {
          const t = trendLast + slopeAbs * h;
          const lastM = parseInt(s.months[last].slice(5,7), 10);
          const futM = ((lastM - 1 + h) % 12);
          const seas = s.seasonal12[futM] || 0;
          const u1 = Math.random(), u2 = Math.random();
          const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
          const v = Math.max(0, t + seas + z * noiseStd);
          traj.push(v);
          total += v;
        }
        trajs.push(traj);
        annual.push(total);
      }
      // Resumo por mês (P5/P50/P95)
      const byMonth = [];
      for (let h = 0; h < 12; h++) {
        const vals = trajs.map(t => t[h]);
        byMonth.push({
          h: h+1,
          p05: _stats.quantile(vals, 0.05),
          p25: _stats.quantile(vals, 0.25),
          p50: _stats.quantile(vals, 0.50),
          p75: _stats.quantile(vals, 0.75),
          p95: _stats.quantile(vals, 0.95),
        });
      }
      out[sec] = {
        p05: _stats.quantile(annual, 0.05),
        p25: _stats.quantile(annual, 0.25),
        p50: _stats.quantile(annual, 0.50),
        p75: _stats.quantile(annual, 0.75),
        p95: _stats.quantile(annual, 0.95),
        annual, trajs: trajs.slice(0, 80), byMonth,  // só 80 trajs pra render
        lastMonth: s.months[last],
        lastValue: s.rec[last],
      };
    }
    return out;
  }, [setorStats]);

  // Forecast consolidado do grupo (soma das trajetórias dos 3 setores)
  const forecastGrupo = useMemo(() => {
    const setoresOk = SETORES_ORD.filter(s => forecastSetor[s]);
    if (setoresOk.length === 0) return null;
    const N_SIMS = Math.min(...setoresOk.map(s => forecastSetor[s].annual.length));
    const annual = [];
    const trajs = [];
    for (let k = 0; k < N_SIMS; k++) {
      const sumTraj = Array(12).fill(0);
      let sumAnnual = 0;
      for (const sec of setoresOk) {
        const fs = forecastSetor[sec];
        for (let h = 0; h < 12; h++) sumTraj[h] += fs.trajs[k % fs.trajs.length]?.[h] || 0;
        sumAnnual += fs.annual[k];
      }
      trajs.push(sumTraj);
      annual.push(sumAnnual);
    }
    const byMonth = [];
    for (let h = 0; h < 12; h++) {
      const vals = trajs.map(t => t[h]);
      byMonth.push({
        h: h+1,
        p05: _stats.quantile(vals, 0.05),
        p25: _stats.quantile(vals, 0.25),
        p50: _stats.quantile(vals, 0.50),
        p75: _stats.quantile(vals, 0.75),
        p95: _stats.quantile(vals, 0.95),
      });
    }
    return {
      p05: _stats.quantile(annual, 0.05),
      p25: _stats.quantile(annual, 0.25),
      p50: _stats.quantile(annual, 0.50),
      p75: _stats.quantile(annual, 0.75),
      p95: _stats.quantile(annual, 0.95),
      annual, trajs: trajs.slice(0, 80), byMonth,
    };
  }, [forecastSetor]);

  // ===== Correlação entre setores =====
  const corrInter = useMemo(() => {
    const setoresComDado = SETORES_ORD.filter(s => setorStats[s] && setorStats[s].hasData);
    // Encontra interseção de meses
    if (!setoresComDado.length) return null;
    const monthSets = setoresComDado.map(s => new Set(setorStats[s].months));
    const commonMonths = [...monthSets[0]].filter(m => monthSets.every(set => set.has(m))).sort();
    if (commonMonths.length < 3) return null;
    const matrix = [];
    for (let i = 0; i < setoresComDado.length; i++) {
      const row = [];
      for (let j = 0; j < setoresComDado.length; j++) {
        const xs = commonMonths.map(m => setorStats[setoresComDado[i]].rec[setorStats[setoresComDado[i]].months.indexOf(m)]);
        const ys = commonMonths.map(m => setorStats[setoresComDado[j]].rec[setorStats[setoresComDado[j]].months.indexOf(m)]);
        row.push(_stats.corr(xs, ys));
      }
      matrix.push(row);
    }
    return { setores: setoresComDado, matrix, n: commonMonths.length };
  }, [setorStats]);

  // ===== Macro corr (receita de cada setor vs séries macro) =====
  const macroCorr = useMemo(() => {
    if (!macro) return null;
    const out = {};
    for (const sec of SETORES_ORD) {
      const s = setorStats[sec];
      if (!s || !s.hasData) continue;
      out[sec] = {};
      for (const [name, series] of Object.entries(macro)) {
        const seriesByYM = {};
        for (const d of series) {
          const [day, mo, y] = d.data.split("/");
          seriesByYM[`${y}-${mo}`] = d.valor;
        }
        const aligned = s.months.map((m,i) => ({ rec: s.rec[i], macro: seriesByYM[m] })).filter(x => x.macro != null);
        if (aligned.length < 3) continue;
        out[sec][name] = _stats.corr(aligned.map(a => a.rec), aligned.map(a => a.macro));
      }
    }
    return out;
  }, [macro, setorStats]);

  const fmtCompactNum = (n) => window.fmtCompact ? window.fmtCompact(n) : "R$ " + Math.round(n);
  const fmtPctSig = (n, dec=1) => (n>=0?"+":"") + (n||0).toFixed(dec).replace(".",",") + "%";

  // ===== Charts =====
  const TrajetoriaChart = ({ data, height = 240 }) => {
    // data: { setor: { months: [], rec: [] } }
    const setores = SETORES_ORD.filter(s => data[s] && data[s].hasData);
    if (setores.length === 0) return <div style={{color:"var(--fg-3)"}}>Sem dados.</div>;
    // Une todos os meses
    const allMonths = [...new Set(setores.flatMap(s => data[s].months))].sort();
    if (allMonths.length < 2) return null;
    const W = 760, ml = 56, mr = 18, mt = 14, mb = 36;
    const cw = W - ml - mr, ch = height - mt - mb;
    // Normaliza pra índice 100 = primeiro mês de cada setor
    const norm = {};
    for (const s of setores) {
      const series = data[s];
      const base = series.rec[0] || 1;
      norm[s] = allMonths.map(m => {
        const idx = series.months.indexOf(m);
        return idx === -1 ? null : (series.rec[idx] / base) * 100;
      });
    }
    const allVals = setores.flatMap(s => norm[s]).filter(v => v != null);
    const minV = Math.min(...allVals, 80);
    const maxV = Math.max(...allVals, 120);
    const range = maxV - minV || 1;
    const x = (i) => ml + (i / Math.max(1, allMonths.length-1)) * cw;
    const y = (v) => mt + ch - ((v - minV) / range) * ch;
    return (
      <div style={{ width: "100%", maxWidth: W }}>
        <svg viewBox={`0 0 ${W} ${height}`} style={{ display: "block", width: "100%", height: "auto" }}>
          {[minV, 100, maxV].map(v => (
            <g key={v}>
              <line x1={ml} y1={y(v)} x2={W-mr} y2={y(v)} stroke="var(--border)" strokeDasharray={v===100?"4,2":"3,3"} strokeWidth={v===100?1.5:0.7} />
              <text x={ml-5} y={y(v)+3} textAnchor="end" fontSize="10" fill="var(--fg-3)">{v.toFixed(0)}</text>
            </g>
          ))}
          {setores.map(s => {
            const color = window.colorForSetor ? window.colorForSetor(s) : "#22d3ee";
            const pts = norm[s].map((v,i) => v == null ? null : [x(i), y(v)]).filter(Boolean);
            if (pts.length < 2) return null;
            const path = pts.map((p,i) => `${i===0?'M':'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
            return <path key={s} d={path} fill="none" stroke={color} strokeWidth={2.5} />;
          })}
          {allMonths.map((m,i) => i % Math.max(1, Math.floor(allMonths.length/8)) === 0 ? (
            <text key={m} x={x(i)} y={height-8} textAnchor="middle" fontSize="9" fill="var(--fg-3)">{m.slice(2)}</text>
          ) : null)}
        </svg>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 8, justifyContent: "center", fontSize: 12 }}>
          {setores.map(s => (
            <span key={s} style={{ color: "var(--fg-2)" }}>
              <span style={{ display: "inline-block", width: 14, height: 3, background: window.colorForSetor(s), verticalAlign: "middle", marginRight: 5 }} />
              {s}
            </span>
          ))}
        </div>
      </div>
    );
  };

  // Heatmap correlação setores
  const CorrSet = ({ matrix, labels }) => {
    if (!matrix || !matrix.length) return null;
    const M = matrix.length;
    const W = 720, H = 240, padL = 130, padT = 30;
    const cell = Math.min((W - padL - 20) / M, (H - padT - 20) / M);
    const colorFor = (v) => {
      const t = (v + 1) / 2;
      const r = Math.round(239 * (1-t) + 16 * t);
      const g = Math.round(68 * (1-t) + 185 * t);
      const b = Math.round(68 * (1-t) + 129 * t);
      return `rgb(${r},${g},${b})`;
    };
    return (
      <div style={{ width: "100%", maxWidth: W }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ display: "block", width: "100%", height: "auto" }}>
          {matrix.map((row,i) => row.map((v,j) => (
            <g key={`${i}-${j}`}>
              <rect x={padL + j*cell} y={padT + i*cell} width={cell-2} height={cell-2}
                fill={colorFor(v)} opacity={0.9} />
              <text x={padL + j*cell + cell/2} y={padT + i*cell + cell/2 + 4}
                textAnchor="middle" fontSize="13" fontWeight="700" fill="white">{v.toFixed(2)}</text>
            </g>
          )))}
          {labels.map((lb, i) => (
            <text key={"r"+i} x={padL - 8} y={padT + i*cell + cell/2 + 4} textAnchor="end" fontSize="11" fill="var(--fg-2)">{lb}</text>
          ))}
          {labels.map((lb, j) => (
            <text key={"c"+j} x={padL + j*cell + cell/2} y={padT - 8} textAnchor="middle" fontSize="11" fill="var(--fg-2)">{lb.slice(0,8)}</text>
          ))}
        </svg>
      </div>
    );
  };

  // ===== KPIs do grupo (todos meses, todos setores) =====
  const grupoTotal = useMemo(() => {
    let totalRec = 0, totalLiq = 0, nMonths = new Set();
    for (const sec of SETORES_ORD) {
      const s = setorStats[sec];
      if (!s || !s.hasData) continue;
      totalRec += s.totalRec;
      totalLiq += s.totalLiq;
      for (const m of s.months) nMonths.add(m);
    }
    return { totalRec, totalLiq, margem: totalRec > 0 ? (totalLiq/totalRec)*100 : 0, nMonths: nMonths.size };
  }, [setorStats]);

  return (
    <div className="page" style={{ maxWidth: 920, margin: "0 auto", padding: "20px 16px" }}>
      <header style={{ marginBottom: 36, paddingBottom: 24, borderBottom: "2px solid var(--cyan)" }}>
        <div style={{ fontSize: 11, color: "var(--cyan)", letterSpacing: "0.3em", fontWeight: 700, marginBottom: 12 }}>RAIO-X DO GRUPO · {grupoTotal.nMonths} MESES OBSERVADOS</div>
        <h1 style={{ fontSize: 36, fontWeight: 800, margin: 0, lineHeight: 1.1 }}>Você não tem 24 lojas.<br/>Você tem 3 negócios diferentes.</h1>
        <p style={{ color: "var(--fg-2)", fontSize: 16, marginTop: 16, lineHeight: 1.6 }}>
          O Grupo DEX opera em <b>4 setores</b> (Food Delivery, Aeroporto Premium, Óptica e Outros) com perfis estatísticos opostos.
          Receita consolidada de <b>{fmtCompactNum(grupoTotal.totalRec)}</b>, líquido de <b style={{color: grupoTotal.totalLiq >= 0 ? "var(--green)" : "var(--red)"}}>{fmtCompactNum(grupoTotal.totalLiq)}</b>, margem <b>{grupoTotal.margem.toFixed(1).replace(".",",")}%</b>.
          Esta tese decompõe a operação por <b>setor</b>, identifica onde está o valor (e onde está o sangramento), e termina com <b>lista nominal de lojas a vender e a investir</b>.
        </p>
      </header>

      {/* §01 — Anatomia setorial */}
      <TeseSecao numero={1}
        titulo="Anatomia do grupo: 4 negócios, 4 perfis"
        subtitulo="A análise que importa começa pelo setor — não pela loja individual. Aqui a tabela mostra os 4 negócios lado a lado."
        insight={
          <>
            {(() => {
              const ss = SETORES_ORD.map(s => setorStats[s]).filter(s => s && s.hasData);
              if (!ss.length) return "Sem dados suficientes.";
              const margens = ss.map(s => s.margem);
              const setorMaiorMargem = SETORES_ORD.find(s => setorStats[s]?.margem === Math.max(...margens));
              const setorMenorMargem = SETORES_ORD.find(s => setorStats[s]?.margem === Math.min(...margens));
              return <>O setor com <b>maior margem</b> é <b style={{color:window.colorForSetor(setorMaiorMargem)}}>{setorMaiorMargem}</b> ({setorStats[setorMaiorMargem].margem.toFixed(1).replace(".",",")}%). O com <b>maior sangramento</b> é <b style={{color:"var(--red)"}}>{setorMenorMargem}</b> ({setorStats[setorMenorMargem].margem.toFixed(1).replace(".",",")}%). Diferença entre os extremos: <b>{(Math.max(...margens) - Math.min(...margens)).toFixed(1).replace(".",",")}pp</b>. Esse spread é onde mora a oportunidade.</>;
            })()}
          </>
        }
        pergunta="Mas margem média esconde direção. Será que algum setor está acelerando ou desacelerando?"
      >
        <div className="t-scroll" style={{ overflowX: "auto" }}>
          <table className="t" style={{ minWidth: 720 }}>
            <thead><tr>
              <th>Setor</th>
              <th className="num">Lojas</th>
              <th className="num">Receita total</th>
              <th className="num">Líquido total</th>
              <th className="num">Margem</th>
              <th className="num">Crescimento %/mês</th>
              <th className="num">Volatilidade (CV)</th>
              <th className="num">Meses</th>
            </tr></thead>
            <tbody>
              {SETORES_ORD.map(sec => {
                const s = setorStats[sec];
                if (!s || !s.hasData) return (
                  <tr key={sec}><td><b>{sec}</b></td><td colSpan="7" className="num" style={{color:"var(--fg-3)"}}>Sem dados</td></tr>
                );
                const margemColor = s.margem >= 5 ? "var(--green)" : s.margem >= 0 ? "var(--cyan)" : "var(--red)";
                const slopeColor = s.significant ? (s.slopePct >= 0 ? "var(--green)" : "var(--red)") : "var(--fg-3)";
                return (
                  <tr key={sec}>
                    <td><b style={{color:window.colorForSetor(sec)}}>● {sec}</b></td>
                    <td className="num">{s.qtdLojas}</td>
                    <td className="num">{fmtCompactNum(s.totalRec)}</td>
                    <td className="num" style={{color: s.totalLiq >= 0 ? "var(--green)":"var(--red)"}}>{fmtCompactNum(s.totalLiq)}</td>
                    <td className="num" style={{color:margemColor, fontWeight:700}}>{s.margem.toFixed(1).replace(".",",")}%</td>
                    <td className="num" style={{color:slopeColor}}>{fmtPctSig(s.slopePct)} {!s.significant && <span style={{fontSize:10}}>(NS)</span>}</td>
                    <td className="num">{(s.cv*100).toFixed(0)}%</td>
                    <td className="num">{s.n}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 8 }}>NS = não significativo (IC 95% cruza zero — pode ser ruído).</div>
      </TeseSecao>

      {/* §02 — Trajetória 12+ meses (índice 100) */}
      <TeseSecao numero={2}
        titulo="Trajetória: quem subiu, quem desceu desde {primeiro mês observado}"
        subtitulo="Receita normalizada (índice 100 = primeiro mês de cada setor). Mostra quem cresceu, quem caiu, quem ficou estável."
        insight={
          <>
            {(() => {
              const setoresOk = SETORES_ORD.filter(s => setorStats[s] && setorStats[s].hasData);
              const finais = setoresOk.map(s => {
                const ss = setorStats[s];
                return { sec: s, idx: (ss.rec[ss.rec.length-1] / Math.max(1, ss.rec[0])) * 100 };
              }).sort((a,b) => b.idx - a.idx);
              if (!finais.length) return "Sem dados.";
              return <>Trajetórias finais (índice 100 = início): {finais.map(f => `${f.sec}: ${f.idx.toFixed(0)}`).join(" · ")}. {finais[0].idx > 130 ? `${finais[0].sec} cresceu mais de 30%, sinal de capacidade de absorção do mercado.` : ""} {finais[finais.length-1].idx < 70 ? `${finais[finais.length-1].sec} contraiu mais de 30% — situação grave que exige ação imediata.` : ""}</>;
            })()}
          </>
        }
        pergunta="Se um setor tá caindo, é tendência ou ruído? Vamos ver o intervalo de confiança da inclinação."
      >
        <TrajetoriaChart data={setorStats} />
      </TeseSecao>

      {/* §03 — IC do crescimento por setor */}
      <TeseSecao numero={3}
        titulo="Crescimento estatisticamente robusto"
        subtitulo="Slope OLS com IC 95% — só significativo se IC não cruza zero. Verde-claro = robusto positivo. Vermelho = robusto negativo. Cinza = ruído."
        insight={
          <>
            {(() => {
              const sigPos = SETORES_ORD.filter(s => setorStats[s]?.significant && setorStats[s]?.slopePct > 0);
              const sigNeg = SETORES_ORD.filter(s => setorStats[s]?.significant && setorStats[s]?.slopePct < 0);
              const ns = SETORES_ORD.filter(s => setorStats[s]?.hasData && !setorStats[s]?.significant);
              return <>{sigPos.length} setor{sigPos.length === 1 ? "" : "es"} com crescimento robusto: <b style={{color:"var(--green)"}}>{sigPos.join(", ") || "nenhum"}</b>. {sigNeg.length} com queda robusta: <b style={{color:"var(--red)"}}>{sigNeg.join(", ") || "nenhuma"}</b>. {ns.length} indistinguível de ruído. <b>Investimento novo deve priorizar setores com crescimento robusto positivo.</b></>;
            })()}
          </>
        }
        pergunta="OK, sabemos como cada setor caminha sozinho. Mas eles se movem juntos? Diversificação real?"
      >
        <div className="t-scroll" style={{ overflowX: "auto" }}>
          <table className="t" style={{ minWidth: 600 }}>
            <thead><tr>
              <th>Setor</th>
              <th className="num">Slope %/mês</th>
              <th className="num">IC 95%</th>
              <th className="num">R²</th>
              <th>Veredito</th>
            </tr></thead>
            <tbody>
              {SETORES_ORD.filter(s => setorStats[s]?.hasData).map(sec => {
                const s = setorStats[sec];
                const tipo = !s.significant ? { label: "Indistinguível de ruído", color: "var(--fg-3)" }
                  : s.slopePct > 0 ? { label: "Crescimento robusto", color: "var(--green)" }
                  : { label: "Queda robusta", color: "var(--red)" };
                return (
                  <tr key={sec}>
                    <td><b style={{color:window.colorForSetor(sec)}}>● {sec}</b></td>
                    <td className="num" style={{color:tipo.color, fontWeight:700}}>{fmtPctSig(s.slopePct)}</td>
                    <td className="num" style={{fontSize:11, color:"var(--fg-3)"}}>[{fmtPctSig(s.ciLo)} ; {fmtPctSig(s.ciHi)}]</td>
                    <td className="num">{(s.r2*100).toFixed(0)}%</td>
                    <td style={{color:tipo.color, fontWeight:600, fontSize:12}}>{tipo.label}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </TeseSecao>

      {/* §04 — Correlação entre setores */}
      {corrInter && (
        <TeseSecao numero={4}
          titulo="Diversificação real: setores se hedgeam?"
          subtitulo={`Matriz de correlação Pearson das receitas mensais entre setores (n=${corrInter.n} meses comuns). Verde = movem juntos. Vermelho = movem opostos.`}
          insight={
            <>
              {(() => {
                let sumOff = 0, n = 0, max = -2, maxPair = null, min = 2, minPair = null;
                for (let i = 0; i < corrInter.matrix.length; i++) for (let j = i+1; j < corrInter.matrix.length; j++) {
                  const v = corrInter.matrix[i][j];
                  sumOff += v; n++;
                  if (v > max) { max = v; maxPair = [corrInter.setores[i], corrInter.setores[j]]; }
                  if (v < min) { min = v; minPair = [corrInter.setores[i], corrInter.setores[j]]; }
                }
                const avg = n > 0 ? sumOff/n : 0;
                return <>Correlação média entre setores: <b>{avg.toFixed(2)}</b>. {avg < 0.3 ? "Diversificação real boa." : avg < 0.6 ? "Diversificação moderada." : "Setores se movem juntos — pouca diversificação real."} Par mais correlato: <b>{maxPair?.join(" × ")}</b> ({max.toFixed(2)}). Par com maior hedge: <b>{minPair?.join(" × ")}</b> ({min.toFixed(2)}).</>;
              })()}
            </>
          }
          pergunta="E contra o macro? A operação se mexe junto com inflação, juros, atividade econômica?"
        >
          <CorrSet matrix={corrInter.matrix} labels={corrInter.setores} />
        </TeseSecao>
      )}

      {/* §05 — Macro */}
      <TeseSecao numero={5}
        titulo="Sensibilidade macro: como cada setor reage à economia"
        subtitulo="Correlação da receita mensal de cada setor contra séries oficiais BCB: IPCA (inflação), CDI (juros), IBC-Br (atividade econômica)."
        insight={
          !macro ? "Buscando dados do BCB..." :
          macroCorr ? (() => {
            const linhas = [];
            for (const sec of SETORES_ORD) {
              if (!macroCorr[sec]) continue;
              const corrs = Object.entries(macroCorr[sec]).filter(([_,v]) => Math.abs(v) > 0.5);
              if (corrs.length) linhas.push(<div key={sec}><b style={{color:window.colorForSetor(sec)}}>{sec}</b>: {corrs.map(([k,v]) => `${k} ${v >= 0 ? "+" : ""}${v.toFixed(2)}`).join(" · ")}</div>);
            }
            return linhas.length ? <>{linhas}<div style={{marginTop:8, fontSize:13}}>Correlações fortes (|ρ| &gt; 0,5) sinalizam exposição macro. Setor sem correlação forte é "barco a vela próprio" — bom em períodos de macro hostil.</div></> : "Nenhum setor mostra correlação macro forte (|ρ| > 0,5). Operação é relativamente independente do ciclo econômico — bom em períodos de stress.";
          })() : "Sem dados macro disponíveis."
        }
        pergunta="OK, sabemos performance histórica. Mas qual setor ainda absorve capital novo (em ramp-up) vs qual chegou no platô?"
      >
        {macroCorr && (
          <div className="t-scroll" style={{ overflowX: "auto" }}>
            <table className="t">
              <thead><tr><th>Setor</th><th className="num">IPCA</th><th className="num">CDI</th><th className="num">IBC-Br</th></tr></thead>
              <tbody>
                {SETORES_ORD.filter(s => macroCorr[s]).map(sec => (
                  <tr key={sec}>
                    <td><b style={{color:window.colorForSetor(sec)}}>● {sec}</b></td>
                    <td className="num">{macroCorr[sec].IPCA?.toFixed(2) || "—"}</td>
                    <td className="num">{macroCorr[sec].CDI?.toFixed(2) || "—"}</td>
                    <td className="num">{macroCorr[sec]["IBC-Br"]?.toFixed(2) || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TeseSecao>

      {/* §06 — Capacidade de absorção */}
      <TeseSecao numero={6}
        titulo="Capacidade de absorção: quem ainda tem espaço pra crescer"
        subtitulo="Razão entre receita do último terço × primeiro terço dos meses. >1.3 = ainda em ramp · 0.7-1.3 = maduro · <0.7 = decaindo."
        insight={
          <>
            {(() => {
              const setoresAce = SETORES_ORD.filter(s => setorStats[s]?.hasData && setorStats[s]?.ramp > 1.3);
              const setoresDec = SETORES_ORD.filter(s => setorStats[s]?.hasData && setorStats[s]?.ramp < 0.7);
              const setoresMad = SETORES_ORD.filter(s => setorStats[s]?.hasData && setorStats[s]?.ramp >= 0.7 && setorStats[s]?.ramp <= 1.3);
              return <>Setores em ramp-up (capital novo absorve bem): <b style={{color:"var(--green)"}}>{setoresAce.join(", ") || "nenhum"}</b>. Maduros (estáveis, ordenhar): <b style={{color:"var(--cyan)"}}>{setoresMad.join(", ") || "nenhum"}</b>. Decaindo (capital novo provavelmente desperdiçado): <b style={{color:"var(--red)"}}>{setoresDec.join(", ") || "nenhum"}</b>. <b>Capex de expansão deve ir para setores em ramp-up; capex de manutenção pra maduros; capex em setores decaindo só se houver tese clara de turnaround.</b></>;
            })()}
          </>
        }
        pergunta="Beleza, sabemos para onde vai o capital. E quanto vai ser a receita ano que vem?"
      >
        <div className="t-scroll" style={{ overflowX: "auto" }}>
          <table className="t">
            <thead><tr><th>Setor</th><th className="num">Razão t3/t1</th><th className="num">Receita média/mês</th><th className="num">Sharpe</th><th>Status</th></tr></thead>
            <tbody>
              {SETORES_ORD.filter(s => setorStats[s]?.hasData).map(sec => {
                const s = setorStats[sec];
                const status = s.ramp > 1.3 ? { l: "Em ramp-up", c: "var(--green)" }
                  : s.ramp >= 0.7 ? { l: "Maduro", c: "var(--cyan)" }
                  : { l: "Decaindo", c: "var(--red)" };
                return (
                  <tr key={sec}>
                    <td><b style={{color:window.colorForSetor(sec)}}>● {sec}</b></td>
                    <td className="num" style={{color:status.c, fontWeight:700}}>{s.ramp.toFixed(2)}×</td>
                    <td className="num">{fmtCompactNum(s.meanR)}</td>
                    <td className="num">{s.sharpe.toFixed(2)}</td>
                    <td style={{color:status.c, fontWeight:600, fontSize:12}}>{status.l}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </TeseSecao>

      {/* §07 — Forecast Monte Carlo flashy */}
      <TeseSecao numero={7}
        titulo="Monte Carlo: 500 futuros possíveis"
        subtitulo="Cada linha cinza é uma simulação completa do próximo ano (trend + sazonalidade + ruído). Ao centro, a mediana. Banda colorida = P25–P75 (50% mais prováveis). Banda extendida = P5–P95 (90%)."
        insight={
          forecastGrupo ? (
            <>
              Receita do grupo nos próximos 12 meses (mediana): <b>{fmtCompactNum(forecastGrupo.p50)}</b>. Banda 50%: [<b>{fmtCompactNum(forecastGrupo.p25)}</b> ; <b>{fmtCompactNum(forecastGrupo.p75)}</b>]. Banda 90%: [<b>{fmtCompactNum(forecastGrupo.p05)}</b> ; <b>{fmtCompactNum(forecastGrupo.p95)}</b>]. A largura da banda é a sua incerteza honesta — quanto mais larga, menos confiança em qualquer ponto único.
            </>
          ) : "Sem simulação disponível."
        }
        pergunta="Esses 500 futuros se sintetizam em decisões que importam: que lojas fechar, em quais investir. A próxima seção responde nominalmente."
      >
        {forecastGrupo && (
          <>
            <h3 style={{ fontSize: 13, color: "var(--cyan)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 700, marginTop: 4, marginBottom: 8 }}>
              GRUPO consolidado · receita mensal projetada
            </h3>
            <SpaghettiFanChart
              forecast={forecastGrupo}
              color="var(--cyan)"
              height={280}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 24 }}>
              <div>
                <h3 style={{ fontSize: 13, color: "var(--cyan)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 700, marginBottom: 8 }}>
                  Distribuição da receita anual projetada
                </h3>
                <HistogramChart values={forecastGrupo.annual} height={200} />
              </div>
              <div>
                <h3 style={{ fontSize: 13, color: "var(--cyan)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 700, marginBottom: 8 }}>
                  Quantis da receita anual
                </h3>
                <div style={{ background: "var(--bg)", borderRadius: 8, padding: 16, border: "1px solid var(--border)" }}>
                  {[
                    { lbl: "Cenário pessimista (P5)", v: forecastGrupo.p05, c: "var(--red)" },
                    { lbl: "Pessimista moderado (P25)", v: forecastGrupo.p25, c: "var(--amber)" },
                    { lbl: "Mediana (P50)", v: forecastGrupo.p50, c: "var(--cyan)", bold: true },
                    { lbl: "Otimista moderado (P75)", v: forecastGrupo.p75, c: "var(--green)" },
                    { lbl: "Cenário otimista (P95)", v: forecastGrupo.p95, c: "var(--green)" },
                  ].map((r,i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: i < 4 ? "1px solid var(--border)" : "none" }}>
                      <span style={{ color: "var(--fg-2)", fontSize: 13 }}>{r.lbl}</span>
                      <span style={{ color: r.c, fontWeight: r.bold ? 800 : 600, fontSize: r.bold ? 16 : 13 }}>{fmtCompactNum(r.v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <h3 style={{ fontSize: 13, color: "var(--fg-2)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 700, marginTop: 32, marginBottom: 12 }}>
              Por setor — cada um com sua própria assinatura de risco
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
              {SETORES_ORD.filter(s => forecastSetor[s]).map(sec => (
                <div key={sec} style={{ background: "var(--bg)", borderRadius: 8, padding: 12, border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                    <b style={{ color: window.colorForSetor(sec), fontSize: 13 }}>● {sec}</b>
                    <span style={{ fontSize: 11, color: "var(--fg-3)" }}>P50 anual: <b style={{ color: "var(--cyan)" }}>{fmtCompactNum(forecastSetor[sec].p50)}</b></span>
                  </div>
                  <SpaghettiFanChart
                    forecast={forecastSetor[sec]}
                    color={window.colorForSetor(sec)}
                    height={150}
                    compact
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </TeseSecao>

      {/* §08 — VEREDITO NOMINAL */}
      <div className="card" style={{ marginBottom: 24, padding: 32, border: "2px solid var(--cyan)", background: "linear-gradient(135deg, rgba(34,211,238,0.06), transparent)" }}>
        <div style={{ fontSize: 12, color: "var(--cyan)", letterSpacing: "0.3em", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>§08 · DECISÃO</div>
        <h2 style={{ fontSize: 28, fontWeight: 800, margin: "8px 0 8px" }}>Vender, ordenhar ou expandir: 3 destinos</h2>
        <p style={{ color: "var(--fg-2)", fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
          Cada loja entra em UMA categoria (mutuamente exclusivas, decididas pelo maior score). Critérios: margem, Sharpe (líquido/σ), significância do crescimento, ramp t3/t1, estabilidade.
        </p>

        <div className="row" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          {/* VENDER */}
          <div>
            <h3 style={{ color: "var(--red)", marginBottom: 12, fontSize: 15 }}>🔻 VENDER / FECHAR ({vereditos.vender.length})</h3>
            <div style={{ fontSize: 11, color: "var(--fg-3)", marginBottom: 12, lineHeight: 1.5 }}>
              Margem negativa, queda significativa, Sharpe ruim, decaindo. <b>Cada R$ retirado vira R$ disponível.</b>
            </div>
            {vereditos.vender.length === 0 ? (
              <div style={{ color: "var(--fg-3)", fontSize: 13 }}>Nenhuma loja se qualifica.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {vereditos.vender.map((p,i) => {
                  const motivos = [];
                  if (p.significant && p.slopePct < 0) motivos.push(`↓ ${fmtPctSig(p.slopePct)}/mês`);
                  if (p.margem < 0) motivos.push(`margem ${p.margem.toFixed(0).replace(".",",")}%`);
                  if (p.sharpe < 0) motivos.push(`Sharpe ${p.sharpe.toFixed(2)}`);
                  if (p.ramp < 0.7) motivos.push(`decaindo ${p.ramp.toFixed(2)}×`);
                  return (
                    <div key={p.slug} style={{ padding: 10, background: "rgba(239,68,68,0.06)", borderLeft: "3px solid var(--red)", borderRadius: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                        <div><b style={{fontSize:13}}>{i+1}. {p.label}</b><div style={{fontSize:10, color:"var(--fg-3)"}}>{p.setor}</div></div>
                        <div style={{ fontSize: 12, color: "var(--red)", fontWeight: 700 }}>{p.scoreVender.toFixed(0)}</div>
                      </div>
                      <div style={{ marginTop: 4, fontSize: 11, color: "var(--fg-2)" }}>{motivos.join(" · ")}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* VACA LEITEIRA */}
          <div>
            <h3 style={{ color: "var(--cyan)", marginBottom: 12, fontSize: 15 }}>🐄 VACA LEITEIRA ({vereditos.vacas.length})</h3>
            <div style={{ fontSize: 11, color: "var(--fg-3)", marginBottom: 12, lineHeight: 1.5 }}>
              Lucra todo mês, estável, baixo crescimento. <b>Não recebe capex de expansão — distribui caixa pra holding.</b>
            </div>
            {vereditos.vacas.length === 0 ? (
              <div style={{ color: "var(--fg-3)", fontSize: 13 }}>Nenhuma loja se qualifica como cash cow consistente.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {vereditos.vacas.map((p,i) => {
                  const motivos = [];
                  if (p.margem > 5) motivos.push(`margem ${p.margem.toFixed(0)}%`);
                  if (p.sharpe > 0.3) motivos.push(`Sharpe ${p.sharpe.toFixed(2)}`);
                  if (Math.abs(p.slopePct) < 5) motivos.push(`crescimento ~0 (${fmtPctSig(p.slopePct)}/mês)`);
                  if (p.ramp >= 0.85 && p.ramp <= 1.15) motivos.push(`estável ${p.ramp.toFixed(2)}×`);
                  return (
                    <div key={p.slug} style={{ padding: 10, background: "rgba(34,211,238,0.06)", borderLeft: "3px solid var(--cyan)", borderRadius: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                        <div><b style={{fontSize:13}}>{i+1}. {p.label}</b><div style={{fontSize:10, color:"var(--fg-3)"}}>{p.setor}</div></div>
                        <div style={{ fontSize: 12, color: "var(--cyan)", fontWeight: 700 }}>{p.scoreVaca.toFixed(0)}</div>
                      </div>
                      <div style={{ marginTop: 4, fontSize: 11, color: "var(--fg-2)" }}>{motivos.join(" · ")}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* INVESTIR */}
          <div>
            <h3 style={{ color: "var(--green)", marginBottom: 12, fontSize: 15 }}>🚀 INVESTIR / EXPANDIR ({vereditos.investir.length})</h3>
            <div style={{ fontSize: 11, color: "var(--fg-3)", marginBottom: 12, lineHeight: 1.5 }}>
              Lucra E cresce E em ramp-up. <b>Recebe capital novo de expansão — multiplicador.</b>
            </div>
            {vereditos.investir.length === 0 ? (
              <div style={{ color: "var(--fg-3)", fontSize: 13 }}>Nenhuma loja se qualifica como estrela.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {vereditos.investir.map((p,i) => {
                  const motivos = [];
                  if (p.significant && p.slopePct > 5) motivos.push(`↑ ${fmtPctSig(p.slopePct)}/mês`);
                  if (p.margem > 5) motivos.push(`margem ${p.margem.toFixed(0)}%`);
                  if (p.sharpe > 0.3) motivos.push(`Sharpe ${p.sharpe.toFixed(2)}`);
                  if (p.ramp > 1.3) motivos.push(`ramp ${p.ramp.toFixed(2)}×`);
                  return (
                    <div key={p.slug} style={{ padding: 10, background: "rgba(16,185,129,0.06)", borderLeft: "3px solid var(--green)", borderRadius: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                        <div><b style={{fontSize:13}}>{i+1}. {p.label}</b><div style={{fontSize:10, color:"var(--fg-3)"}}>{p.setor}</div></div>
                        <div style={{ fontSize: 12, color: "var(--green)", fontWeight: 700 }}>{p.scoreInvestir.toFixed(0)}</div>
                      </div>
                      <div style={{ marginTop: 4, fontSize: 11, color: "var(--fg-2)" }}>{motivos.join(" · ")}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div style={{ marginTop: 24, padding: 16, background: "rgba(251,191,36,0.06)", borderLeft: "3px solid var(--amber)", borderRadius: 6, fontSize: 13, lineHeight: 1.6 }}>
          <b style={{ color: "var(--amber)" }}>Tese final:</b> 3 destinos para o capital — <b style={{color:"var(--red)"}}>cortar</b> as <b>{vereditos.vender.length}</b> que destroem valor, <b style={{color:"var(--cyan)"}}>preservar</b> as <b>{vereditos.vacas.length}</b> vacas leiteiras (não invadir o caixa delas com expansão), <b style={{color:"var(--green)"}}>concentrar</b> capital novo nas <b>{vereditos.investir.length}</b> estrelas com fundamentos. Cada loja não classificada está em zona de avaliação caso-a-caso.
        </div>
      </div>

      <div style={{ textAlign: "center", color: "var(--fg-3)", fontSize: 11, padding: "20px 0", marginTop: 16 }}>
        Análise baseada em <b>{grupoTotal.nMonths} meses</b> de dados Omie consolidados (mai/2025 → abr/2026), 4 setores agrupando {(CONTAS||[]).length} lojas. Macro via BCB API. Cálculos: regressão OLS, Pearson, Monte Carlo (500 sims/setor).
      </div>
    </div>
  );
};

Object.assign(window, { PageTese });
