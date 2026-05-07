/* PageTese — Ensaio Estatístico Vertical (Buffett + Jobs + Simons)
 *
 * Storytelling progressivo: 10 seções respondendo perguntas em cadeia.
 * Cada seção tem: métrica/viz + insight em destaque + pergunta que levanta a próxima.
 * Filtro de empresa altera toda a história.
 *
 * Dados internos: DRE_BY_CONTA, MONTH_DRE, ALL_TX.
 * Dados externos: BCB API (IPCA 433, CDI 12, IBC-Br 24364) — fetch async.
 */

// ===== Helpers estatísticos =====
const _stats = {
  mean: (a) => a.length ? a.reduce((s,x) => s+x, 0) / a.length : 0,
  stdev: (a) => {
    if (a.length < 2) return 0;
    const m = _stats.mean(a);
    return Math.sqrt(a.reduce((s,x) => s + (x-m)**2, 0) / (a.length - 1));
  },
  cv: (a) => {
    const m = _stats.mean(a);
    if (Math.abs(m) < 1e-9) return 0;
    return _stats.stdev(a) / Math.abs(m);
  },
  // Regressão linear simples — retorna slope, intercept, R², SE_slope
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
    // Erro padrão do slope
    let sse = 0;
    for (let i = 0; i < n; i++) sse += (ys[i] - (intercept + slope * xs[i])) ** 2;
    const sigma = n > 2 ? Math.sqrt(sse / (n - 2)) : 0;
    const se = sxx > 0 ? sigma / Math.sqrt(sxx) : 0;
    return { slope, intercept, r2, se };
  },
  // Pearson
  corr: (xs, ys) => {
    const n = Math.min(xs.length, ys.length);
    if (n < 2) return 0;
    const mx = _stats.mean(xs), my = _stats.mean(ys);
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - mx) * (ys[i] - my);
      dx += (xs[i] - mx) ** 2;
      dy += (ys[i] - my) ** 2;
    }
    const denom = Math.sqrt(dx * dy);
    return denom > 0 ? num / denom : 0;
  },
  // Decomposição simples: trend (regressão linear) + sazonalidade (média do resíduo por mês do ano)
  decompose: (months, values) => {
    const n = values.length;
    const xs = values.map((_,i) => i);
    const { slope, intercept } = _stats.linreg(xs, values);
    const trend = xs.map(x => intercept + slope * x);
    const detrended = values.map((v,i) => v - trend[i]);
    // Sazonalidade: média do detrended agrupado pelo mês calendário
    const monthOfYear = months.map(m => parseInt(m.slice(5,7), 10) - 1);
    const seasonalSum = Array(12).fill(0);
    const seasonalCnt = Array(12).fill(0);
    for (let i = 0; i < n; i++) {
      seasonalSum[monthOfYear[i]] += detrended[i];
      seasonalCnt[monthOfYear[i]]++;
    }
    const seasonal12 = seasonalSum.map((s, i) => seasonalCnt[i] > 0 ? s / seasonalCnt[i] : 0);
    const seasonal = monthOfYear.map(m => seasonal12[m]);
    const noise = values.map((v,i) => v - trend[i] - seasonal[i]);
    return { trend, seasonal, noise, seasonal12, slope, intercept };
  },
  // Quantil
  quantile: (a, q) => {
    if (a.length === 0) return 0;
    const sorted = a.slice().sort((x,y) => x-y);
    const idx = q * (sorted.length - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] * (hi - idx) + sorted[hi] * (idx - lo);
  },
};

// ===== Seção: card com narrativa =====
const Secao = ({ numero, titulo, subtitulo, children, insight, pergunta }) => (
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

const PageTese = ({ statusFilter, drilldown, setDrilldown, year, month }) => {
  const REF_YEAR = window.REF_YEAR || new Date().getFullYear();
  const isContaFilter = drilldown && drilldown.type === 'conta';
  const contaSlug = isContaFilter ? drilldown.value : null;
  const contaLabel = contaSlug ? drilldown.label : "Grupo DEX (consolidado)";

  const B = window.BIT || {};
  const DBC = B.DRE_BY_CONTA || {};
  const CONTAS = B.CONTAS || [];

  // Macro (BCB API) — fetch async
  const [macro, setMacro] = useState(null);
  const [macroLoading, setMacroLoading] = useState(true);
  useEffect(() => {
    setMacroLoading(true);
    // 433 = IPCA mensal % · 12 = CDI mensal % · 24364 = IBC-Br mensal índice (proxy PIB)
    const series = [
      { id: 433, name: "IPCA" },
      { id: 12, name: "CDI" },
      { id: 24364, name: "IBC-Br" },
    ];
    Promise.all(series.map(s =>
      fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${s.id}/dados?formato=json&dataInicial=01/01/2024`)
        .then(r => r.ok ? r.json() : Promise.reject(r.status))
        .then(data => ({ name: s.name, data: (data||[]).map(d => ({ data: d.data, valor: parseFloat(d.valor) })) }))
        .catch(() => ({ name: s.name, data: [] }))
    )).then(results => {
      const byName = Object.fromEntries(results.map(r => [r.name, r.data]));
      setMacro(byName);
      setMacroLoading(false);
    }).catch(() => setMacroLoading(false));
  }, []);

  // ===== Dados base da empresa selecionada (ou consolidado) =====
  const base = useMemo(() => {
    let dre, label;
    if (isContaFilter && DBC[contaSlug]) {
      dre = DBC[contaSlug].MONTH_DRE || [];
      label = DBC[contaSlug].label || contaLabel;
    } else {
      dre = B.MONTH_DRE || [];
      label = "Grupo DEX (consolidado)";
    }
    // Apenas meses ativos
    const active = dre.filter(m => m.count > 0);
    const months = active.map((m,i) => `${REF_YEAR}-${String(dre.indexOf(m)+1).padStart(2,'0')}`);
    const receitas = active.map(m => m.receita);
    const liquidos = active.map(m => m.liquido);
    const despesas = active.map(m => m.custo + m.despesa + m.imposto);
    return { dre, active, months, receitas, liquidos, despesas, label };
  }, [isContaFilter, contaSlug, DBC, B.MONTH_DRE, REF_YEAR]);

  // ===== Estatística por loja (todas as 24, pra correlações/Markowitz) =====
  const perLoja = useMemo(() => {
    return CONTAS.map(c => {
      const d = DBC[c.slug];
      if (!d) return null;
      const dre = d.MONTH_DRE || [];
      const active = dre.filter(m => m.count > 0);
      if (active.length < 2) return null;
      const receitas = active.map(m => m.receita);
      const liquidos = active.map(m => m.liquido);
      const xs = active.map((_,i) => i);
      const reg = _stats.linreg(xs, receitas);
      const meanRec = _stats.mean(receitas);
      const slopePct = meanRec > 0 ? (reg.slope / meanRec) * 100 : 0;
      const sePct = meanRec > 0 ? (reg.se / meanRec) * 100 : 0;
      // IC 95%: slope ± 1.96 × SE
      const ciLo = slopePct - 1.96 * sePct;
      const ciHi = slopePct + 1.96 * sePct;
      const significant = ciLo > 0 || ciHi < 0;
      return {
        slug: c.slug, label: c.label,
        marca: window.inferMarca ? window.inferMarca(c.label) : "—",
        canal: window.inferCanal ? window.inferCanal(c.label) : "—",
        receitas, liquidos,
        meanRec, stdRec: _stats.stdev(receitas), cv: _stats.cv(receitas),
        slopePct, sePct, ciLo, ciHi, significant, r2: reg.r2,
        sharpe: _stats.stdev(liquidos) > 0 ? _stats.mean(liquidos) / _stats.stdev(liquidos) : 0,
        n: active.length,
      };
    }).filter(Boolean).sort((a,b) => b.meanRec - a.meanRec);
  }, [CONTAS, DBC]);

  // ===== Decomposição da empresa selecionada =====
  const decomp = useMemo(() => {
    if (base.receitas.length < 4) return null;
    return _stats.decompose(base.months, base.receitas);
  }, [base]);

  // ===== Forecast Monte Carlo (12 meses futuros) =====
  const forecast = useMemo(() => {
    if (!decomp || base.receitas.length < 4) return null;
    const N_SIMS = 1000;
    const last = base.receitas.length - 1;
    const trendLast = decomp.intercept + decomp.slope * last;
    const noiseStd = _stats.stdev(decomp.noise);
    const sims = [];
    for (let s = 0; s < N_SIMS; s++) {
      const traj = [];
      for (let h = 1; h <= 12; h++) {
        const t = trendLast + decomp.slope * h;
        // próximo mês calendário
        const lastMonth = parseInt(base.months[last].slice(5,7), 10);
        const futMonth = ((lastMonth - 1 + h) % 12);
        const seas = decomp.seasonal12[futMonth] || 0;
        // ruído aleatório N(0, noiseStd)
        const u1 = Math.random(), u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        const noise = z * noiseStd;
        traj.push(Math.max(0, t + seas + noise));
      }
      sims.push(traj);
    }
    // Para cada mês futuro, calcula quantis
    const summary = [];
    for (let h = 0; h < 12; h++) {
      const vals = sims.map(s => s[h]);
      summary.push({
        h: h+1,
        p05: _stats.quantile(vals, 0.05),
        p50: _stats.quantile(vals, 0.50),
        p95: _stats.quantile(vals, 0.95),
        mean: _stats.mean(vals),
      });
    }
    // Total ano projetado
    const annualSums = sims.map(s => s.reduce((a,b) => a+b, 0));
    return {
      summary,
      annualP05: _stats.quantile(annualSums, 0.05),
      annualP50: _stats.quantile(annualSums, 0.50),
      annualP95: _stats.quantile(annualSums, 0.95),
      probPositivo: annualSums.filter(s => s > 0).length / N_SIMS * 100,
    };
  }, [decomp, base]);

  // ===== Correlação inter-empresas =====
  const corrMatrix = useMemo(() => {
    if (perLoja.length < 2) return null;
    // Alinha por número de meses (usa só lojas com mesma quantidade)
    const minN = Math.min(...perLoja.map(p => p.receitas.length));
    if (minN < 3) return null;
    const subset = perLoja.filter(p => p.receitas.length >= minN).slice(0, 24);
    const M = subset.length;
    const matrix = Array(M).fill().map(() => Array(M).fill(0));
    for (let i = 0; i < M; i++) {
      for (let j = 0; j < M; j++) {
        const xs = subset[i].receitas.slice(-minN);
        const ys = subset[j].receitas.slice(-minN);
        matrix[i][j] = _stats.corr(xs, ys);
      }
    }
    return { labels: subset.map(s => s.label), matrix, n: minN };
  }, [perLoja]);

  // ===== Beta vs portfólio =====
  const betas = useMemo(() => {
    if (perLoja.length < 2) return null;
    const minN = Math.min(...perLoja.map(p => p.receitas.length));
    if (minN < 3) return null;
    // Receita do grupo = soma das lojas com pelo menos minN meses
    const subset = perLoja.filter(p => p.receitas.length >= minN);
    const groupRec = Array(minN).fill(0);
    for (const p of subset) {
      const rec = p.receitas.slice(-minN);
      for (let i = 0; i < minN; i++) groupRec[i] += rec[i];
    }
    return subset.map(p => {
      const rec = p.receitas.slice(-minN);
      // Beta = cov(loja, grupo) / var(grupo)
      const reg = _stats.linreg(groupRec, rec);
      return { ...p, beta: reg.slope * (_stats.mean(groupRec) / Math.max(1, p.meanRec)), betaR2: reg.r2 };
    });
  }, [perLoja]);

  // ===== Capacidade de absorção / saturação =====
  const saturacao = useMemo(() => {
    if (!perLoja.length) return null;
    // Curva: receita média mensal vs nº de meses ativos (proxy de "idade")
    // Lojas maduras = alta receita + baixa variação. Lojas em ramp = receita crescente.
    return perLoja.map(p => {
      // Ratio receita_ultimo_terco / receita_primeiro_terco — se >> 1, está acelerando
      const n = p.receitas.length;
      if (n < 3) return { ...p, ramp: 1, status: "imaturo" };
      const t1 = _stats.mean(p.receitas.slice(0, Math.ceil(n/3)));
      const t3 = _stats.mean(p.receitas.slice(-Math.ceil(n/3)));
      const ramp = t1 > 0 ? t3 / t1 : 1;
      let status;
      if (ramp > 1.3) status = "acelerando";
      else if (ramp < 0.7) status = "decaindo";
      else status = "maduro";
      return { ...p, ramp, status };
    });
  }, [perLoja]);

  // ===== Realocação ótima (ranking Sharpe) =====
  const realocacao = useMemo(() => {
    if (!perLoja.length) return null;
    const sorted = perLoja.slice().filter(p => Number.isFinite(p.sharpe)).sort((a,b) => b.sharpe - a.sharpe);
    const totalRec = sorted.reduce((s,p) => s + p.meanRec, 0);
    // Peso atual = receita média / total
    // Peso ótimo proporcional a Sharpe positivo (truncado em 0)
    const sumSharpe = sorted.reduce((s,p) => s + Math.max(0, p.sharpe), 0) || 1;
    return sorted.map(p => ({
      ...p,
      pesoAtual: totalRec > 0 ? (p.meanRec / totalRec) * 100 : 0,
      pesoOtimo: (Math.max(0, p.sharpe) / sumSharpe) * 100,
    })).map(p => ({ ...p, delta: p.pesoOtimo - p.pesoAtual }));
  }, [perLoja]);

  // ===== Macro: correlação com receita do grupo =====
  const macroCorr = useMemo(() => {
    if (!macro || !base.receitas || base.receitas.length < 3) return null;
    const out = {};
    for (const [name, series] of Object.entries(macro)) {
      if (!series.length) continue;
      // Alinha pelas datas de base.months (YYYY-MM)
      const seriesByYM = {};
      for (const d of series) {
        const [day, mo, y] = d.data.split("/");
        seriesByYM[`${y}-${mo}`] = d.valor;
      }
      const aligned = base.months.map(m => seriesByYM[m]).filter(v => v != null);
      const recAligned = base.months.map((m,i) => seriesByYM[m] != null ? base.receitas[i] : null).filter(v => v != null);
      if (aligned.length < 3) continue;
      out[name] = _stats.corr(aligned, recAligned);
    }
    return out;
  }, [macro, base]);

  // ===== Renderização das visualizações =====
  const fmtCompactNum = (n) => window.fmtCompact ? window.fmtCompact(n) : "R$ " + Math.round(n);
  const fmtPctSig = (n, dec=1) => (n>=0?"+":"") + (n||0).toFixed(dec).replace(".",",") + "%";

  // === Viz: linha simples com banda IC ===
  const LineWithBand = ({ data, height = 200, label = "" }) => {
    if (!data || data.length === 0) return null;
    const W = 720, ml = 60, mr = 14, mt = 14, mb = 30;
    const cw = W - ml - mr, ch = height - mt - mb;
    const allVals = data.flatMap(d => [d.lo, d.hi, d.mid]).filter(v => v != null);
    const minV = Math.min(...allVals);
    const maxV = Math.max(...allVals);
    const range = (maxV - minV) || 1;
    const x = (i) => ml + (i / Math.max(1, data.length-1)) * cw;
    const y = (v) => mt + ch - ((v - minV) / range) * ch;
    const midPath = data.map((d,i) => `${i===0?'M':'L'}${x(i).toFixed(1)},${y(d.mid).toFixed(1)}`).join(' ');
    const bandPath = data.map((d,i) => `${i===0?'M':'L'}${x(i).toFixed(1)},${y(d.hi).toFixed(1)}`).join(' ')
      + ' ' + data.slice().reverse().map((d,i) => `L${x(data.length-1-i).toFixed(1)},${y(d.lo).toFixed(1)}`).join(' ') + ' Z';
    return (
      <div style={{ width: "100%", maxWidth: W }}>
        <svg viewBox={`0 0 ${W} ${height}`} style={{ display: "block", width: "100%", height: "auto" }}>
          {[0, 0.25, 0.5, 0.75, 1].map(p => {
            const v = minV + p * range;
            return (<g key={p}>
              <line x1={ml} y1={y(v)} x2={W-mr} y2={y(v)} stroke="var(--border)" strokeDasharray="3,3" />
              <text x={ml-5} y={y(v)+3} textAnchor="end" fontSize="10" fill="var(--fg-3)">{fmtCompactNum(v)}</text>
            </g>);
          })}
          <path d={bandPath} fill="var(--cyan)" opacity={0.15} />
          <path d={midPath} fill="none" stroke="var(--cyan)" strokeWidth={2} />
          {data.map((d,i) => i % 2 === 0 ? (
            <text key={i} x={x(i)} y={height-8} textAnchor="middle" fontSize="9" fill="var(--fg-3)">{(d.label||"").slice(0,7)}</text>
          ) : null)}
        </svg>
      </div>
    );
  };

  // === Heatmap correlação simplificado ===
  const HeatmapCorr = ({ matrix, labels, height = 460 }) => {
    if (!matrix) return <div style={{ color: "var(--fg-3)", fontSize: 12 }}>Dados insuficientes</div>;
    const M = matrix.length;
    const W = 720;
    const cell = Math.min((W - 100) / M, (height - 80) / M);
    const tot = cell * M;
    const colorFor = (v) => {
      const t = (v + 1) / 2; // -1..1 → 0..1
      const r = Math.round(239 * (1-t) + 16 * t);
      const g = Math.round(68 * (1-t) + 185 * t);
      const b = Math.round(68 * (1-t) + 129 * t);
      return `rgb(${r},${g},${b})`;
    };
    return (
      <div style={{ width: "100%", maxWidth: W }}>
        <svg viewBox={`0 0 ${W} ${height}`} style={{ display: "block", width: "100%", height: "auto" }}>
          {matrix.map((row, i) => row.map((v, j) => (
            <rect key={`${i}-${j}`} x={100 + j*cell} y={20 + i*cell} width={cell-1} height={cell-1}
              fill={colorFor(v)} opacity={0.85}>
              <title>{`${labels[i]} × ${labels[j]}: ${v.toFixed(2)}`}</title>
            </rect>
          )))}
          {labels.map((lb, i) => (
            <text key={i} x={95} y={20 + i*cell + cell/2 + 3} textAnchor="end" fontSize="9" fill="var(--fg-2)">
              {lb.length > 16 ? lb.slice(0,14)+"…" : lb}
            </text>
          ))}
          {/* Legenda */}
          <text x={W-100} y={height-30} fontSize="10" fill="var(--fg-3)">−1 (oposta)</text>
          <text x={W-100} y={height-15} fontSize="10" fill="var(--fg-3)">+1 (idêntica)</text>
        </svg>
      </div>
    );
  };

  // ===== Métricas pra capa =====
  const meanRec = _stats.mean(base.receitas);
  const stdRec = _stats.stdev(base.receitas);
  const cvRec = _stats.cv(base.receitas);
  const cvPct = (cvRec * 100).toFixed(0);
  const previsibilidade = cvRec < 0.2 ? "previsível" : cvRec < 0.5 ? "moderada" : "volátil";
  const slopePct = base.receitas.length >= 2
    ? (_stats.linreg(base.receitas.map((_,i)=>i), base.receitas).slope / Math.max(1, meanRec) * 100)
    : 0;

  return (
    <div className="page" style={{ maxWidth: 920, margin: "0 auto", padding: "20px 16px" }}>
      <header style={{ marginBottom: 36, paddingBottom: 24, borderBottom: "2px solid var(--cyan)" }}>
        <div style={{ fontSize: 11, color: "var(--cyan)", letterSpacing: "0.3em", fontWeight: 700, marginBottom: 12 }}>TESE ESTATÍSTICA · {REF_YEAR}</div>
        <h1 style={{ fontSize: 36, fontWeight: 800, margin: 0, lineHeight: 1.1 }}>{base.label}</h1>
        <p style={{ color: "var(--fg-2)", fontSize: 16, marginTop: 16, lineHeight: 1.6 }}>
          Operação <b style={{ color: cvRec < 0.2 ? "var(--green)" : cvRec < 0.5 ? "var(--cyan)" : "var(--red)" }}>{previsibilidade}</b> com receita média mensal de <b>{fmtCompactNum(meanRec)}</b>, desvio padrão de <b>{fmtCompactNum(stdRec)}</b> ({cvPct}% do nível típico) e tendência de <b style={{ color: slopePct >= 0 ? "var(--green)" : "var(--red)" }}>{fmtPctSig(slopePct)}/mês</b>.
        </p>
        <p style={{ color: "var(--fg-3)", fontSize: 13, marginTop: 8, fontStyle: "italic" }}>
          "Não é o que você sabe que te mete em encrenca. É o que você acha que sabe e não é assim." — Mark Twain. As próximas 10 seções decompõem o que você acha que sabe sobre essa operação.
        </p>
        {!isContaFilter && CONTAS.length > 0 && (
          <div style={{ marginTop: 16, padding: "10px 14px", background: "rgba(34,211,238,0.06)", borderRadius: 6, fontSize: 12, color: "var(--fg-2)" }}>
            💡 Filtre uma empresa no header pra ver a tese aplicada a uma loja específica.
          </div>
        )}
      </header>

      {/* §01 — Capa de previsibilidade */}
      <Secao numero={1}
        titulo="Quanto você pode confiar nessa receita?"
        subtitulo="Toda análise começa pelo coeficiente de variação. Receita previsível vale múltiplo. Receita volátil tem desconto."
        insight={
          <>
            CV = {cvPct}%. Em varejo maduro, CV abaixo de 20% é raro e merece prêmio. Acima de 50% sinaliza dependência de eventos pontuais (festas, picos, marketing). Esta operação é <b>{previsibilidade}</b>.
          </>
        }
        pergunta="OK, mas a receita varia por causa de tendência (boa ou ruim) ou só ruído? Vamos decompor."
      >
        <div className="kpi-row" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <KpiTile tone="cyan" label="Receita média / mês" value={fmtCompactNum(meanRec)} hint={`${base.active.length} meses observados`} />
          <KpiTile tone="amber" label="Desvio padrão" value={fmtCompactNum(stdRec)} hint={`σ — flutuação típica em torno da média`} />
          <KpiTile tone={cvRec < 0.2 ? "green" : cvRec < 0.5 ? "cyan" : "red"} label="CV (σ / média)" value={cvPct + "%"} nonMonetary hint={previsibilidade} />
        </div>
      </Secao>

      {/* §02 — Decomposição */}
      {decomp && (
        <Secao numero={2}
          titulo="Tendência, sazonalidade e ruído"
          subtitulo="Toda série temporal se decompõe em três pedaços. Saber qual domina muda a estratégia."
          insight={
            <>
              {(() => {
                const trendVar = _stats.stdev(decomp.trend);
                const seasVar = _stats.stdev(decomp.seasonal);
                const noiseVar = _stats.stdev(decomp.noise);
                const tot = trendVar + seasVar + noiseVar || 1;
                const dom = trendVar > seasVar && trendVar > noiseVar ? "tendência"
                  : seasVar > noiseVar ? "sazonalidade" : "ruído";
                return <>O componente dominante aqui é <b>{dom}</b>. Tendência = <b>{((trendVar/tot)*100).toFixed(0)}%</b> · sazonalidade = <b>{((seasVar/tot)*100).toFixed(0)}%</b> · ruído = <b>{((noiseVar/tot)*100).toFixed(0)}%</b>. Quanto mais ruído, menor a confiança em qualquer projeção pontual.</>;
              })()}
            </>
          }
          pergunta="Se há sazonalidade, qual é o calendário ideal? Quando esperar pico, quando vale, e isso é estável?"
        >
          <div style={{ background: "var(--bg)", padding: 12, borderRadius: 8 }}>
            {(() => {
              const W = 720, h = 200, ml = 60, mr = 14, mt = 14, mb = 30;
              const cw = W - ml - mr, ch = h - mt - mb;
              const all = [...base.receitas, ...decomp.trend, ...decomp.seasonal.map((s,i) => s + decomp.trend[i])];
              const minV = Math.min(...all);
              const maxV = Math.max(...all);
              const range = (maxV - minV) || 1;
              const x = (i) => ml + (i / Math.max(1, base.receitas.length-1)) * cw;
              const y = (v) => mt + ch - ((v - minV) / range) * ch;
              const realPath = base.receitas.map((v,i) => `${i===0?'M':'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
              const trendPath = decomp.trend.map((v,i) => `${i===0?'M':'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
              const trendSeasPath = decomp.trend.map((t,i) => `${i===0?'M':'L'}${x(i).toFixed(1)},${y(t + decomp.seasonal[i]).toFixed(1)}`).join(' ');
              return (
                <svg viewBox={`0 0 ${W} ${h}`} style={{ display: "block", width: "100%", height: "auto" }}>
                  <path d={realPath} fill="none" stroke="var(--cyan)" strokeWidth={2.5} />
                  <path d={trendPath} fill="none" stroke="var(--amber)" strokeWidth={1.5} strokeDasharray="6,3" />
                  <path d={trendSeasPath} fill="none" stroke="var(--green)" strokeWidth={1.2} strokeDasharray="2,3" />
                </svg>
              );
            })()}
            <div style={{ display: "flex", gap: 16, fontSize: 11, color: "var(--fg-2)", marginTop: 8, justifyContent: "center", flexWrap: "wrap" }}>
              <span><span style={{ display: "inline-block", width: 14, height: 2, background: "var(--cyan)", verticalAlign: "middle", marginRight: 5 }} />Receita real</span>
              <span><span style={{ display: "inline-block", width: 14, height: 0, borderTop: "1.5px dashed var(--amber)", verticalAlign: "middle", marginRight: 5 }} />Tendência (regressão)</span>
              <span><span style={{ display: "inline-block", width: 14, height: 0, borderTop: "1.2px dashed var(--green)", verticalAlign: "middle", marginRight: 5 }} />Tendência + sazonalidade</span>
            </div>
          </div>
        </Secao>
      )}

      {/* §03 — Sazonalidade calendário */}
      {decomp && (
        <Secao numero={3}
          titulo="O calendário oculto"
          subtitulo="Padrão sazonal médio (resíduo após retirar tendência), agrupado por mês do ano."
          insight={
            <>
              {(() => {
                const max = Math.max(...decomp.seasonal12);
                const min = Math.min(...decomp.seasonal12);
                const peakIdx = decomp.seasonal12.indexOf(max);
                const valeIdx = decomp.seasonal12.indexOf(min);
                const months_pt = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
                return <>Pico sazonal em <b>{months_pt[peakIdx]}</b> ({fmtCompactNum(max)} acima da tendência). Vale em <b>{months_pt[valeIdx]}</b> ({fmtCompactNum(min)}). Diferença pico-vale: <b>{fmtCompactNum(max-min)}</b> — esse é o "tax" que o calendário cobra da sua operação.</>;
              })()}
            </>
          }
          pergunta="Mas com poucos meses de histórico, esse padrão é real ou é coincidência? Precisa de teste estatístico."
        >
          <div style={{ background: "var(--bg)", padding: 12, borderRadius: 8 }}>
            {(() => {
              const W = 720, h = 160, ml = 60, mr = 14, mt = 14, mb = 30;
              const cw = W - ml - mr, ch = h - mt - mb;
              const max = Math.max(...decomp.seasonal12.map(Math.abs));
              const slot = cw / 12;
              const months_pt = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
              return (
                <svg viewBox={`0 0 ${W} ${h}`} style={{ display: "block", width: "100%", height: "auto" }}>
                  <line x1={ml} y1={mt+ch/2} x2={W-mr} y2={mt+ch/2} stroke="var(--fg-3)" />
                  {decomp.seasonal12.map((v,i) => {
                    const xPos = ml + i*slot + slot*0.15;
                    const barW = slot * 0.7;
                    const hBar = Math.abs(v) / Math.max(1, max) * (ch/2 - 6);
                    const yTop = v >= 0 ? mt+ch/2 - hBar : mt+ch/2;
                    return (
                      <g key={i}>
                        <rect x={xPos} y={yTop} width={barW} height={hBar} fill={v >= 0 ? "var(--green)" : "var(--red)"} opacity={0.75} rx={2} />
                        <text x={xPos + barW/2} y={h-8} textAnchor="middle" fontSize="10" fill="var(--fg-3)">{months_pt[i]}</text>
                      </g>
                    );
                  })}
                </svg>
              );
            })()}
          </div>
        </Secao>
      )}

      {/* §04 — Significância do crescimento */}
      <Secao numero={4}
        titulo="O crescimento é real ou é vento?"
        subtitulo="IC 95% sobre a inclinação da regressão. Se o intervalo cruza zero, não dá pra afirmar tendência."
        insight={
          <>
            {(() => {
              if (perLoja.length === 0) return "Sem dados por loja.";
              const sig = perLoja.filter(p => p.significant);
              const cresc = sig.filter(p => p.slopePct > 0);
              const decai = sig.filter(p => p.slopePct < 0);
              const ind = perLoja.length - sig.length;
              return <>Das {perLoja.length} lojas, <b>{cresc.length}</b> mostram <b style={{color:"var(--green)"}}>crescimento estatisticamente significativo</b>, <b>{decai.length}</b> mostram <b style={{color:"var(--red)"}}>queda significativa</b>, e <b>{ind}</b> são <b>indistinguíveis de ruído</b>. Esse último grupo é onde gestão julga sem dado pra apoiar.</>;
            })()}
          </>
        }
        pergunta="OK, sabemos quem cresce e quem cai. Mas elas se movem juntas? Há alguma loja antifrágil?"
      >
        <div className="t-scroll" style={{ overflowX: "auto", maxHeight: 380 }}>
          <table className="t" style={{ minWidth: 700 }}>
            <thead><tr>
              <th>Empresa</th>
              <th className="num">Slope %/mês</th>
              <th className="num">IC 95%</th>
              <th className="num">R²</th>
              <th>Veredito</th>
            </tr></thead>
            <tbody>
              {perLoja.slice(0, 24).map(p => {
                const veredito = p.significant ? (p.slopePct > 0 ? "Cresce" : "Cai") : "Indistinguível de ruído";
                const color = p.significant ? (p.slopePct > 0 ? "var(--green)" : "var(--red)") : "var(--fg-3)";
                return (
                  <tr key={p.slug}>
                    <td><b>{p.label}</b></td>
                    <td className="num" style={{ color }}>{fmtPctSig(p.slopePct)}</td>
                    <td className="num" style={{ fontSize: 11, color: "var(--fg-3)" }}>[{fmtPctSig(p.ciLo)} ; {fmtPctSig(p.ciHi)}]</td>
                    <td className="num">{(p.r2*100).toFixed(0)}%</td>
                    <td style={{ color, fontWeight: 600, fontSize: 12 }}>{veredito}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Secao>

      {/* §05 — Correlação inter-empresas */}
      {corrMatrix && (
        <Secao numero={5}
          titulo="O portfólio é mesmo diversificado?"
          subtitulo="Matriz de correlação Pearson das receitas mensais. Verde = movem juntas. Vermelho = movem oposto. Diversificação real exige correlações baixas/negativas."
          insight={
            <>
              {(() => {
                const M = corrMatrix.matrix.length;
                let sumOff = 0, n = 0, max = -1, maxPair = null;
                for (let i = 0; i < M; i++) for (let j = i+1; j < M; j++) {
                  sumOff += corrMatrix.matrix[i][j];
                  n++;
                  if (corrMatrix.matrix[i][j] > max) { max = corrMatrix.matrix[i][j]; maxPair = [corrMatrix.labels[i], corrMatrix.labels[j]]; }
                }
                const avgCorr = n > 0 ? sumOff / n : 0;
                return <>Correlação média do portfólio: <b>{avgCorr.toFixed(2)}</b>. {avgCorr > 0.5 ? "Alta — quando uma cai, várias caem juntas. Diversificação aparente." : avgCorr > 0.2 ? "Moderada — algum hedge entre lojas." : "Baixa — boa diversificação real."} Par mais correlato: <b>{maxPair?.[0]}</b> × <b>{maxPair?.[1]}</b> (<b>{max.toFixed(2)}</b>) — provavelmente respondem ao mesmo driver.</>;
              })()}
            </>
          }
          pergunta="E se eu tirar uma loja específica? Ela é amplificadora do grupo (β>1) ou é defensiva (β<1)?"
        >
          <HeatmapCorr matrix={corrMatrix.matrix} labels={corrMatrix.labels} />
        </Secao>
      )}

      {/* §06 — Beta */}
      {betas && betas.length > 0 && (
        <Secao numero={6}
          titulo="Quem amplifica, quem amortece"
          subtitulo="Beta = sensibilidade da receita da loja vs receita total do grupo (CAPM interno). β>1 amplifica · β<1 defende · β<0 hedge real."
          insight={
            <>
              {(() => {
                const amp = betas.filter(b => b.beta > 1.2).length;
                const def = betas.filter(b => b.beta < 0.8 && b.beta > 0).length;
                const hedge = betas.filter(b => b.beta < 0).length;
                return <>{amp} lojas <b style={{color:"var(--amber)"}}>amplificam</b> (movimento do grupo × β); {def} lojas são <b style={{color:"var(--cyan)"}}>defensivas</b>; {hedge} lojas <b style={{color:"var(--green)"}}>hedge real</b> (movem opostas ao grupo). Defensivas e hedges valem prêmio em portfólio — diluem o risco sistemático.</>;
              })()}
            </>
          }
          pergunta="OK, internamente as lojas se hedgeam. Mas e contra a economia? Quanto a receita do grupo se mexe junto com IPCA, CDI, atividade econômica?"
        >
          <div className="t-scroll" style={{ overflowX: "auto", maxHeight: 320 }}>
            <table className="t" style={{ minWidth: 580 }}>
              <thead><tr>
                <th>Empresa</th><th className="num">Beta</th><th className="num">R² do beta</th><th>Tipo</th>
              </tr></thead>
              <tbody>
                {betas.slice().sort((a,b) => b.beta - a.beta).map(p => {
                  const tipo = p.beta > 1.2 ? { label: "Amplificadora", color: "var(--amber)" }
                    : p.beta > 0.8 ? { label: "Neutra", color: "var(--cyan)" }
                    : p.beta > 0 ? { label: "Defensiva", color: "var(--green)" }
                    : { label: "Hedge real", color: "var(--green)" };
                  return (
                    <tr key={p.slug}>
                      <td><b>{p.label}</b></td>
                      <td className="num" style={{ color: tipo.color, fontWeight: 600 }}>{p.beta.toFixed(2)}</td>
                      <td className="num">{(p.betaR2*100).toFixed(0)}%</td>
                      <td style={{ color: tipo.color, fontWeight: 600, fontSize: 12 }}>{tipo.label}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Secao>
      )}

      {/* §07 — Macro */}
      <Secao numero={7}
        titulo="Você é um navio ou um barco?"
        subtitulo="Correlação da receita do grupo com séries macroeconômicas oficiais (BCB) — IPCA, CDI, atividade econômica (IBC-Br)."
        insight={
          macroLoading ? "Buscando séries macro do BCB..." :
          macro && macroCorr ? (() => {
            const ipcaC = macroCorr["IPCA"], cdiC = macroCorr["CDI"], ibcC = macroCorr["IBC-Br"];
            const correlatos = Object.entries(macroCorr).filter(([_,v]) => Math.abs(v) > 0.5);
            return <>
              {correlatos.length === 0
                ? "Receita do grupo é praticamente independente das séries macro testadas. Você é um barco a vela próprio — bom em períodos de turbulência macro, ruim em períodos de vento favorável que não te leva junto."
                : `Receita correlaciona com: ${correlatos.map(([k,v]) => `${k} (${v >= 0 ? "+" : ""}${v.toFixed(2)})`).join(", ")}. Em períodos de stress macro, espere efeito proporcional.`}
              {ipcaC != null && <><br/>IPCA: {ipcaC.toFixed(2)}, CDI: {cdiC?.toFixed(2)}, IBC-Br (atividade): {ibcC?.toFixed(2)}.</>}
            </>;
          })() : "Sem acesso à API BCB no momento (offline ou bloqueio CORS). Tente recarregar."
        }
        pergunta="Beleza, sabemos correlação interna e externa. Mas onde investir o próximo R$? Nas que estão saturadas ou nas que estão acelerando?"
      >
        {macro && Object.keys(macro).length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 8 }}>
            {Object.entries(macro).map(([name, series]) => (
              <div key={name} className="card" style={{ padding: 12 }}>
                <div style={{ fontSize: 11, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600 }}>{name}</div>
                <div style={{ fontSize: 11, marginTop: 4, color: "var(--fg-2)" }}>
                  {series.length} pontos · último: {series[series.length-1]?.data}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--cyan)", marginTop: 6 }}>
                  {series[series.length-1]?.valor.toFixed(2)}
                </div>
                {macroCorr && macroCorr[name] != null && (
                  <div style={{ fontSize: 11, marginTop: 6, color: Math.abs(macroCorr[name]) > 0.5 ? "var(--amber)" : "var(--fg-3)" }}>
                    Corr c/ receita: <b>{macroCorr[name].toFixed(2)}</b>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Secao>

      {/* §08 — Saturação */}
      {saturacao && (
        <Secao numero={8}
          titulo="Quem está acelerando, quem está maduro, quem está decaindo"
          subtitulo="Razão entre receita do último terço × primeiro terço dos meses ativos. >1.3 acelerando · 0.7-1.3 maduro · <0.7 decaindo."
          insight={
            <>
              {(() => {
                const ace = saturacao.filter(s => s.status === "acelerando");
                const mad = saturacao.filter(s => s.status === "maduro");
                const dec = saturacao.filter(s => s.status === "decaindo");
                return <><b style={{color:"var(--green)"}}>{ace.length} acelerando</b> (capacidade de absorver mais capital antes do platô) · <b style={{color:"var(--cyan)"}}>{mad.length} maduras</b> (geram caixa estável, distribuir lucro) · <b style={{color:"var(--red)"}}>{dec.length} decaindo</b> (capital novo provavelmente desperdiçado, considerar fechamento).</>;
              })()}
            </>
          }
          pergunta="Sabendo quem absorve capital e quem não absorve, qual o portfólio ótimo?"
        >
          <div className="t-scroll" style={{ overflowX: "auto", maxHeight: 320 }}>
            <table className="t" style={{ minWidth: 660 }}>
              <thead><tr><th>Empresa</th><th className="num">Receita média</th><th className="num">Razão t3/t1</th><th>Status</th></tr></thead>
              <tbody>
                {saturacao.slice().sort((a,b) => b.ramp - a.ramp).map(s => {
                  const colors = { acelerando: "var(--green)", maduro: "var(--cyan)", decaindo: "var(--red)", imaturo: "var(--fg-3)" };
                  return (
                    <tr key={s.slug}>
                      <td><b>{s.label}</b></td>
                      <td className="num">{fmtCompactNum(s.meanRec)}</td>
                      <td className="num" style={{ color: colors[s.status] }}>{s.ramp.toFixed(2)}×</td>
                      <td style={{ color: colors[s.status], fontWeight: 600, textTransform: "capitalize", fontSize: 12 }}>{s.status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Secao>
      )}

      {/* §09 — Realocação */}
      {realocacao && (
        <Secao numero={9}
          titulo="Realocação ótima por Sharpe"
          subtitulo="Sharpe = retorno médio mensal / σ. Pesos ótimos proporcionais ao Sharpe (positivos). Compara com peso atual (% da receita)."
          insight={
            <>
              {(() => {
                const moveIn = realocacao.filter(r => r.delta > 5).slice(0, 3);
                const moveOut = realocacao.filter(r => r.delta < -5).slice(-3).reverse();
                if (moveIn.length === 0 && moveOut.length === 0) return "Carteira está perto da fronteira eficiente. Ajustes finos de < 5pp por loja.";
                return <>
                  Aumentar exposição em: <b>{moveIn.map(r => r.label).join(", ") || "—"}</b>.<br/>
                  Reduzir exposição em: <b>{moveOut.map(r => r.label).join(", ") || "—"}</b>.<br/>
                  Esses ajustes movem o portfólio em direção à fronteira eficiente sem mudar o tamanho total.
                </>;
              })()}
            </>
          }
          pergunta="Tudo isso é olhar pro passado. E o futuro? Qual a probabilidade de fechar 2026 no positivo?"
        >
          <div className="t-scroll" style={{ overflowX: "auto", maxHeight: 360 }}>
            <table className="t" style={{ minWidth: 660 }}>
              <thead><tr>
                <th>Empresa</th><th className="num">Sharpe</th><th className="num">Peso atual</th><th className="num">Peso ótimo</th><th className="num">Δ</th>
              </tr></thead>
              <tbody>
                {realocacao.map(r => {
                  const dColor = r.delta > 5 ? "var(--green)" : r.delta < -5 ? "var(--red)" : "var(--fg-3)";
                  return (
                    <tr key={r.slug}>
                      <td><b>{r.label}</b></td>
                      <td className="num">{r.sharpe.toFixed(2)}</td>
                      <td className="num">{r.pesoAtual.toFixed(1)}%</td>
                      <td className="num cyan">{r.pesoOtimo.toFixed(1)}%</td>
                      <td className="num" style={{ color: dColor, fontWeight: 700 }}>{r.delta >= 0 ? "+" : ""}{r.delta.toFixed(1)}pp</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Secao>
      )}

      {/* §10 — Forecast Monte Carlo */}
      {forecast && (
        <Secao numero={10}
          titulo="O futuro tem forma de distribuição"
          subtitulo="Monte Carlo (1000 simulações) usando trend + sazonalidade + N(0,σ_ruído). Banda P5–P95."
          insight={
            <>
              Receita anual projetada: <b>{fmtCompactNum(forecast.annualP50)}</b> (mediana). Intervalo de confiança 90%: [<b>{fmtCompactNum(forecast.annualP05)}</b> ; <b>{fmtCompactNum(forecast.annualP95)}</b>]. <br/>
              Probabilidade de a receita anual ser positiva: <b style={{color: forecast.probPositivo > 80 ? "var(--green)" : "var(--amber)"}}>{forecast.probPositivo.toFixed(1)}%</b>. Quanto mais larga a banda, mais incerto — investidor sério desconta a incerteza.
            </>
          }
          pergunta="E a conclusão executiva — em uma página, qual a tese?"
        >
          <LineWithBand
            data={forecast.summary.map((s,i) => ({
              label: `+${s.h}m`,
              lo: s.p05, mid: s.p50, hi: s.p95,
            }))}
            height={220}
            label="Receita mensal projetada · banda P5-P95"
          />
          <div className="kpi-row" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginTop: 16 }}>
            <KpiTile tone="cyan"  label="P50 anual (mediana)" value={fmtCompactNum(forecast.annualP50)} hint="50% das simulações abaixo" />
            <KpiTile tone="green" label="P95 anual (cenário bom)" value={fmtCompactNum(forecast.annualP95)} hint="só 5% acima" />
            <KpiTile tone="red"   label="P05 anual (cenário ruim)" value={fmtCompactNum(forecast.annualP05)} hint="5% abaixo" />
          </div>
        </Secao>
      )}

      {/* §11 — Conclusão */}
      <Secao numero={11}
        titulo="Síntese do investidor"
        subtitulo="Tese em uma página — o que faz dessa operação um bom (ou mau) negócio."
      >
        <div style={{ background: "linear-gradient(135deg, rgba(34,211,238,0.10), rgba(34,211,238,0.02))", padding: 24, borderRadius: 12, border: "1px solid rgba(34,211,238,0.30)", lineHeight: 1.7, fontSize: 14 }}>
          <p>
            <b>{base.label}</b> é uma operação <b>{previsibilidade}</b> com receita média mensal de <b>{fmtCompactNum(meanRec)}</b> e tendência de <b>{fmtPctSig(slopePct)}/mês</b>.
            {forecast && <> A projeção mediana fecha {REF_YEAR} com receita anual de <b>{fmtCompactNum(forecast.annualP50)}</b>, intervalo 90% de confiança entre <b>{fmtCompactNum(forecast.annualP05)}</b> e <b>{fmtCompactNum(forecast.annualP95)}</b>.</>}
          </p>
          <p>
            <b>3 ações que destravam valor:</b>
          </p>
          <ol style={{ paddingLeft: 24, marginTop: 8 }}>
            <li><b>Realocação dentro da carteira</b>: priorize as lojas com maior Sharpe e em ramp-up acelerado. Esse ajuste isolado normalmente vale 1-3 pontos percentuais de margem agregada.</li>
            <li><b>Corte de cauda</b>: lojas com slope negativo significativo + Sharpe negativo são candidatas a fechamento ou venda. Cada R$ retirado delas é R$ liberado para criadoras.</li>
            <li><b>Hedge externo</b>: com a correlação macro identificada, dimensione reserva de caixa proporcional à magnitude da exposição. Operação correlacionada com IBC-Br precisa de mais reserva em períodos de aperto monetário.</li>
          </ol>
          <p style={{ fontStyle: "italic", color: "var(--fg-2)", marginTop: 16, fontSize: 13 }}>
            "Risco vem de não saber o que está fazendo. A análise estatística não elimina risco — torna-o mensurável e precificável." — adaptado de Buffett.
          </p>
        </div>
      </Secao>

      <div style={{ textAlign: "center", color: "var(--fg-3)", fontSize: 11, padding: "20px 0", marginTop: 16 }}>
        Fontes: dados internos {REF_YEAR} (Omie API consolidada) · BCB API (séries 433 IPCA · 12 CDI · 24364 IBC-Br) · cálculos client-side (regressão OLS, Pearson, Monte Carlo bootstrap).
      </div>
    </div>
  );
};

Object.assign(window, { PageTese });
